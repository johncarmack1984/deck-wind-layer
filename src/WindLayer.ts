// WindLayer — a deck.gl v9 wind particle layer.
//
// GPU advection through a u/v wind texture (ping-pong state textures), drawn as
// projected quads that track the web-mercator camera via deck's `project32`.
// Clean-room port of the technique in mapbox/webgl-wind (ISC).
//
// Design note: webgl-wind packs each particle's [0,1] position into RGBA8 (two
// bytes per axis) because it targeted WebGL1, where float render targets were
// unreliable. deck.gl v9 requires WebGL2, where rgba32float render targets are
// standard — so this layer stores position directly in the R/G channels of a
// float texture and skips the bit-packing entirely. One less fragile layer.
//
// HOW TRAILS WORK: a canvas-sized screen FBO is ping-ponged. Each frame lays
// down the previous screen dimmed by fadeOpacity (fadeModel, blend off), draws
// the freshly-advected projected particles on top, then composites the result
// over the basemap (blitModel, blend on). The particle model stays in
// getModels() so deck sets its project32 UBO each frame — and that UBO carries
// into our custom render pass, so the projected particles render straight into
// the trail FBO. (This looked blocked for a while; the real cause was the
// createFramebuffer width/height gotcha below — a degenerate render-pass
// viewport made every draw into an FBO render nothing, which read as "the
// projected model won't render off-screen.")
//
// luma-v9 gotchas already worked around:
//   - createFramebuffer needs explicit width/height (else the render-pass
//     viewport is degenerate and draws into the fbo render nothing).
//   - GL_POINTS don't render into an FBO on macOS/ANGLE -> expanded quads.
//   - instanced draws with no per-instance attribute emit nothing -> a single
//     packed vec3 attribute on a plain triangle list.

import {
  Layer,
  type LayerContext,
  type LayerProps,
  project32,
  type UpdateParameters,
} from '@deck.gl/core';
import { Geometry, Model } from '@luma.gl/engine';
import { loadWindTexture } from './loadWindTexture';
import { blitUniforms, windUniforms } from './modules';
import BLIT_FS from './shaders/blit.frag.glsl?raw';
import BLIT_VS from './shaders/blit.vert.glsl?raw';
import DRAW_FS from './shaders/draw.frag.glsl?raw';
import DRAW_VS from './shaders/draw.vert.glsl?raw';
import UPDATE_FS from './shaders/update.frag.glsl?raw';
import UPDATE_VS from './shaders/update.vert.glsl?raw';
import { boundsChanged, reprojectUV, viewBounds } from './viewport';

export type WindLayerProps = LayerProps & {
  /** URL of the equirectangular u/v PNG (R = u, G = v). */
  image: string;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  /** Particle count, rounded up to a square. Particles seed within the current
   * viewport, so this acts as an on-screen *density* that stays constant as you
   * zoom (not a global count). */
  numParticles?: number;
  /** Advection speed multiplier. */
  speedFactor?: number;
  /** Per-frame random respawn probability (a little extra scatter). */
  dropRate?: number;
  /** Particle lifetime in frames: every particle resets to a fresh uniform
   * position at least this often, so flow convergence can't pool particles
   * indefinitely. Lower = less pooling but shorter streaks. */
  maxAge?: number;
  /** Trail persistence: how much of the previous frame survives each step
   * (0 = no trails, ~0.95 = long comet tails). */
  fadeOpacity?: number;
  /** Particle size in pixels. */
  pointSize?: number;
  /** Brightness each particle deposits at full speed (the trail buffer
   * equilibrium is roughly this / (1 - fadeOpacity), so keep it modest). */
  particleAlpha?: number;
  /** Wind speed (m/s) that maps to full brightness; lower = more of the field
   * lights up, higher = only the jets. */
  maxSpeed?: number;
  /** Particle color, 0..255 RGB. */
  color?: [number, number, number];
};

const defaultProps = {
  image: '',
  uMin: -40,
  uMax: 40,
  vMin: -40,
  vMax: 40,
  numParticles: 65536,
  speedFactor: 0.15,
  dropRate: 0.002,
  maxAge: 180,
  fadeOpacity: 0.95,
  pointSize: 0.5,
  particleAlpha: 1.5,
  maxSpeed: 4,
  color: [255, 255, 255],
};

export class WindLayer extends Layer<WindLayerProps> {
  static layerName = 'WindLayer';
  static defaultProps = defaultProps as never;

  // biome-ignore lint/suspicious/noExplicitAny: deck layer state is loosely typed.
  declare state: any;

  initializeState(): void {
    const { device } = this.context;
    const { textures, fbos, model } = this._buildParticles(
      this.props.numParticles ?? 65536,
    );

    const quad = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    const updateModel = new Model(device, {
      id: 'wind-update',
      vs: UPDATE_VS,
      fs: UPDATE_FS,
      modules: [windUniforms],
      geometry: new Geometry({
        topology: 'triangle-strip',
        vertexCount: 4,
        attributes: { a_quad: { size: 2, value: quad } },
      }),
      parameters: { depthWriteEnabled: false, depthCompare: 'always' },
      disableWarnings: true,
    });

    // Fullscreen-quad model that copies a screen-sized texture to whatever
    // target is bound, scaled by `blit.opacity` (1.0 to composite, <1 to fade).
    const mkBlit = (id: string, blend: boolean) =>
      new Model(device, {
        id,
        vs: BLIT_VS,
        fs: BLIT_FS,
        modules: [blitUniforms],
        geometry: new Geometry({
          topology: 'triangle-strip',
          vertexCount: 4,
          attributes: { a_quad: { size: 2, value: quad } },
        }),
        parameters: blend
          ? {
              blend: true,
              blendColorSrcFactor: 'src-alpha',
              blendColorDstFactor: 'one-minus-src-alpha',
              depthWriteEnabled: false,
              depthCompare: 'always',
            }
          : { blend: false, depthWriteEnabled: false, depthCompare: 'always' },
        disableWarnings: true,
      });
    // fadeModel overwrites (blend off) to lay down the dimmed previous frame;
    // blitModel composites (blend on) the result over the basemap.
    const fadeModel = mkBlit('wind-fade', false);
    const blitModel = mkBlit('wind-blit', true);

    this.setState({
      textures,
      fbos,
      updateModel,
      model,
      fadeModel,
      blitModel,
      step: 0,
      randSeed: 0.5,
    });
    void this._loadWind(this.props.image);
  }

  /** Build the rgba32float ping-pong state textures + the draw model for a
   * given particle count (rounded up to a square). Pure: returns the new
   * resources; the caller stores them and destroys any previous set. */
  // biome-ignore lint/suspicious/noExplicitAny: luma Texture/Framebuffer/Model.
  _buildParticles(n: number): { textures: any[]; fbos: any[]; model: any } {
    const { device } = this.context;
    const side = Math.ceil(Math.sqrt(Math.max(1, n)));
    const count = side * side;

    // Seed position in R/G and a staggered normalized age in B (so age-out
    // respawns are spread across frames, not synchronized); A unused.
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seed[i * 4] = Math.random();
      seed[i * 4 + 1] = Math.random();
      seed[i * 4 + 2] = Math.random();
      seed[i * 4 + 3] = 1;
    }
    const mkState = (data: Float32Array) =>
      device.createTexture({
        width: side,
        height: side,
        format: 'rgba32float',
        data,
        sampler: {
          minFilter: 'nearest',
          magFilter: 'nearest',
          addressModeU: 'clamp-to-edge',
          addressModeV: 'clamp-to-edge',
        },
      });
    const textures = [mkState(seed), mkState(new Float32Array(count * 4))];
    // width/height REQUIRED: luma derives the render-pass viewport from them.
    const fbos = textures.map((t) =>
      device.createFramebuffer({
        width: side,
        height: side,
        colorAttachments: [t],
      }),
    );

    // One quad per particle expanded to a non-instanced triangle list (6 verts),
    // packed into a single vec3 attribute (x = index, yz = corner).
    const corners = [0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1];
    const aData = new Float32Array(count * 6 * 3);
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < 6; k++) {
        const o = (i * 6 + k) * 3;
        aData[o] = i;
        aData[o + 1] = corners[k * 2];
        aData[o + 2] = corners[k * 2 + 1];
      }
    }
    // Stored as state.model so deck's default getModels() picks it up and sets
    // its project32 uniforms each frame.
    const model = new Model(device, {
      id: 'wind-draw',
      vs: DRAW_VS,
      fs: DRAW_FS,
      modules: [project32, windUniforms],
      geometry: new Geometry({
        topology: 'triangle-list',
        vertexCount: count * 6,
        attributes: { a_data: { size: 3, value: aData } },
      }),
      parameters: {
        blend: true,
        blendColorSrcFactor: 'src-alpha',
        blendColorDstFactor: 'one-minus-src-alpha',
        depthWriteEnabled: false,
        depthCompare: 'always',
      },
      disableWarnings: true,
    });
    return { textures, fbos, model };
  }

  updateState(params: UpdateParameters<this>): void {
    const { props, oldProps } = params;
    if (props.image && props.image !== oldProps.image) {
      void this._loadWind(props.image);
    }
    // Particle count changed (e.g. a config slider) — rebuild the state
    // textures + draw model, then release the old set.
    if (props.numParticles !== oldProps.numParticles) {
      const old = {
        model: this.state.model,
        textures: this.state.textures,
        fbos: this.state.fbos,
      };
      const next = this._buildParticles(props.numParticles ?? 65536);
      this.setState({ ...next, step: 0 });
      old.model?.destroy();
      for (const t of old.textures ?? []) t.destroy();
      for (const f of old.fbos ?? []) f.destroy();
    }
  }

  async _loadWind(url: string): Promise<void> {
    if (!url) return;
    const tex = await loadWindTexture(this.context.device, url).catch(
      () => null,
    );
    if (!tex || this.props.image !== url) {
      tex?.destroy();
      return;
    }
    this.state.windTexture?.destroy();
    this.setState({ windTexture: tex });
    this.setNeedsRedraw();
  }

  /** Lazily (re)create the canvas-sized ping-pong screen textures + FBOs the
   * trail accumulation renders into; recreated when the canvas resizes. */
  _ensureScreen(w: number, h: number): void {
    if (
      this.state.screenW === w &&
      this.state.screenH === h &&
      this.state.screenFbos
    ) {
      return;
    }
    const { device } = this.context;
    for (const t of this.state.screenTextures ?? []) t.destroy();
    for (const f of this.state.screenFbos ?? []) f.destroy();
    const mk = () =>
      device.createTexture({
        width: w,
        height: h,
        format: 'rgba8unorm',
        sampler: {
          minFilter: 'nearest',
          magFilter: 'nearest',
          addressModeU: 'clamp-to-edge',
          addressModeV: 'clamp-to-edge',
        },
      });
    const screenTextures = [mk(), mk()];
    // width/height REQUIRED (same luma gotcha as the state FBOs).
    const screenFbos = screenTextures.map((t) =>
      device.createFramebuffer({ width: w, height: h, colorAttachments: [t] }),
    );
    this.state.screenTextures = screenTextures;
    this.state.screenFbos = screenFbos;
    this.state.screenW = w;
    this.state.screenH = h;
  }

  draw(): void {
    const {
      windTexture,
      textures,
      updateModel,
      model,
      fadeModel,
      blitModel,
      step,
    } = this.state;
    if (!windTexture) return;
    const { device } = this.context;
    const color = this.props.color ?? [255, 255, 255];

    // View-relative seeding bounds + per-frame trail reprojection (./viewport).
    const view = viewBounds(this.context.viewport);
    const viewChanged = boundsChanged(this.state.lastView, view);
    this.state.lastView = view;

    let trailFade = this.props.fadeOpacity ?? 0.95;
    let uvOffX = 0;
    let uvOffY = 0;
    let uvScaleX = 1;
    let uvScaleY = 1;
    if (viewChanged) {
      // Re-align the screen-space trail buffer to the new camera so zoom/pan
      // keeps the accumulated trails instead of flickering. null (a tilted view
      // or the first frame) means clear the buffer rather than smear it.
      const r = reprojectUV(this.state.lastViewport, this.context.viewport);
      if (r) {
        uvOffX = r.offX;
        uvOffY = r.offY;
        uvScaleX = r.scaleX;
        uvScaleY = r.scaleY;
      } else {
        trailFade = 0;
      }
    }
    this.state.lastViewport = this.context.viewport;

    const wp = {
      uMin: this.props.uMin,
      uMax: this.props.uMax,
      vMin: this.props.vMin,
      vMax: this.props.vMax,
      speedFactor: this.props.speedFactor ?? 0.3,
      dropRate: this.props.dropRate ?? 0.003,
      maxAge: this.props.maxAge ?? 180,
      dropRateBump: 0.01,
      randSeed: this.state.randSeed,
      pointSize: this.props.pointSize ?? 2.5,
      colorR: color[0] / 255,
      colorG: color[1] / 255,
      colorB: color[2] / 255,
      alphaScale: this.props.particleAlpha ?? 0.6,
      maxSpeed: this.props.maxSpeed ?? 18,
      viewX0: view.x0,
      viewW: view.w,
      viewY0: view.y0,
      viewY1: view.y1,
    };

    const src = textures[step % 2];
    const dstTex = textures[(step + 1) % 2];
    const dstFbo = this.state.fbos[(step + 1) % 2];

    // 1. Update pass: advect into the off-screen dst (no camera). Set the
    // viewport explicitly to the state-texture size — otherwise it inherits
    // deck's canvas viewport and the sim only writes part of the texture
    // (the rest of the particles stay at the origin).
    const side = textures[0].width;
    updateModel.setBindings({ u_particles: src, u_wind: windTexture });
    updateModel.shaderInputs.setProps({ wind: wp });
    const pass = device.beginRenderPass({
      framebuffer: dstFbo,
      clearColor: false,
      parameters: { viewport: [0, 0, side, side] },
    });
    updateModel.draw(pass);
    pass.end();

    // 2. Trail accumulation into a canvas-sized screen FBO (ping-ponged):
    //    a. lay down the PREVIOUS screen dimmed by fadeOpacity (overwrite),
    //    b. draw the freshly-advected, projected particles on top.
    // Then composite the result over deck's target (the basemap). The particle
    // model carries deck's project32 UBO (it's in getModels()) and renders into
    // our custom pass fine now that createFramebuffer gets explicit width/height.
    // biome-ignore lint/suspicious/noExplicitAny: device.gl is the WebGL2 context.
    const gl = (device as any).gl;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    this._ensureScreen(w, h);
    const screenSrc = this.state.screenTextures[step % 2];
    const screenDst = this.state.screenTextures[(step + 1) % 2];
    const screenDstFbo = this.state.screenFbos[(step + 1) % 2];
    const trailPass = device.beginRenderPass({
      framebuffer: screenDstFbo,
      clearColor: false, // the fade copy overwrites every pixel
      parameters: { viewport: [0, 0, w, h] },
    });
    fadeModel.setBindings({ u_screen: screenSrc });
    fadeModel.shaderInputs.setProps({
      blit: { opacity: trailFade, uvOffX, uvOffY, uvScaleX, uvScaleY },
    });
    fadeModel.draw(trailPass);
    model.setBindings({ u_particles: dstTex, u_wind: windTexture });
    model.shaderInputs.setProps({ wind: wp });
    model.draw(trailPass);
    trailPass.end();

    // Composite the trail buffer over deck's target. Restore the full-canvas
    // viewport first: the custom passes above left it at their own sizes, and
    // deck set its viewport outside luma's state tracker so popState didn't.
    gl.viewport(0, 0, w, h);
    blitModel.setBindings({ u_screen: screenDst });
    blitModel.shaderInputs.setProps({
      blit: { opacity: 1.0, uvOffX: 0, uvOffY: 0, uvScaleX: 1, uvScaleY: 1 },
    });
    blitModel.draw(this.context.renderPass);

    this.state.step = step + 1;
    this.state.randSeed = Math.random();
    this.setNeedsRedraw(); // self-sustaining animation
  }

  finalizeState(context: LayerContext): void {
    super.finalizeState(context);
    this.state.updateModel?.destroy();
    this.state.model?.destroy();
    this.state.fadeModel?.destroy();
    this.state.blitModel?.destroy();
    this.state.windTexture?.destroy();
    for (const t of this.state.textures ?? []) t.destroy();
    for (const f of this.state.fbos ?? []) f.destroy();
    for (const t of this.state.screenTextures ?? []) t.destroy();
    for (const f of this.state.screenFbos ?? []) f.destroy();
  }
}
