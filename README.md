# deck-wind-layer

A [deck.gl](https://deck.gl) **v9** layer that renders a Windy-style animated
wind field: particles advected on the GPU through a u/v wind texture, drawn as
fading comet trails, and **projected through deck's `project32` so they track
the web-mercator camera** at any zoom/pan. Clean-room port of the technique in
[`mapbox/webgl-wind`](https://github.com/mapbox/webgl-wind) (ISC).

The camera-synced part is the bit that's missing from the public domain: there
are WebGL demos of the particle effect, but no small, MIT, deck-v9-native layer
that just drops onto a map.

## Install

```bash
npm i deck-wind-layer
```

deck.gl and luma.gl are **peer dependencies** (v9.3+) — bring your own:

```bash
npm i @deck.gl/core @luma.gl/core @luma.gl/engine
```

## Usage

```ts
import { Deck } from '@deck.gl/core';
import { WindLayer } from 'deck-wind-layer';

new Deck({
  initialViewState: { longitude: 0, latitude: 25, zoom: 1.3 },
  controller: true,
  layers: [
    new WindLayer({
      id: 'wind',
      image: '/wind.png', // equirectangular u/v PNG — see "Wind texture format"
      uMin: -40, uMax: 40, vMin: -40, vMax: 40,
    }),
  ],
});
```

Drop it over any basemap (a deck.gl `TileLayer`, MapLibre/Mapbox via
`react-map-gl`, …). The layer self-animates — no per-frame `setProps` needed.

## Props

In addition to the standard deck.gl `LayerProps` (`id`, `visible`, `opacity`, …):

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `image` | `string` | — | **Required.** URL of the equirectangular u/v PNG (R = u, G = v). |
| `uMin`, `uMax` | `number` | −40, 40 | m/s range the **R** channel maps to. |
| `vMin`, `vMax` | `number` | −40, 40 | m/s range the **G** channel maps to. |
| `numParticles` | `number` | `65536` | On-screen particle **density** (rounded up to a square), constant across zoom. |
| `speedFactor` | `number` | `0.15` | Animation rate — a zoom-independent time-lapse factor, not literal m/s. |
| `fadeOpacity` | `number` | `0.95` | Trail persistence per frame (higher = longer trails; `< 1`). |
| `maxAge` | `number` | `180` | Particle lifetime in frames before it resets to a fresh spot. Keep ≥ the fade window. |
| `dropRate` | `number` | `0.002` | Extra per-frame random respawn probability. |
| `pointSize` | `number` | `0.5` | Particle size in px. |
| `particleAlpha` | `number` | `1.5` | Brightness a particle deposits at full speed. |
| `maxSpeed` | `number` | `4` | Wind speed (m/s) mapped to full brightness; raise it so only stronger winds glow. |
| `color` | `[number, number, number]` | `[255, 255, 255]` | Particle RGB, 0–255. |

> Requires a **WebGL2** context (deck.gl v9). The trail reprojection assumes a
> north-up `MapView`; bearing/pitch fall back to clearing trails during camera
> moves.

## Run the demo

```bash
pnpm install
pnpm dev
```

Drag/scroll the map — the particles should stay glued to the geography. The
panel in the top-right tunes the layer live (speed, trail length, brightness,
particle size/count, respawn); settings persist in `localStorage`.

## Wind texture format

An equirectangular RGB PNG: **R = u**, **G = v**, each normalized linearly over
`[uMin, uMax]` / `[vMin, vMax]` m/s. Row 0 = 90°N, column 0 = 0°E (so it spans
lon 0→360 left→right, lat 90→−90 top→bottom). `examples/public/wind.png` is a
sample GFS 10 m frame; `examples/public/wind.json` carries the dimensions and
bounds.

## luma.gl v9 / deck.gl v9 gotchas (learned the hard way)

This layer does multi-pass offscreen rendering inside a deck layer's `draw()`,
which trips over a few things worth writing down:

1. **`device.createFramebuffer({colorAttachments})` needs explicit `width`/
   `height`.** luma reads the render-pass viewport from `framebuffer.width/
   height`, which come from the *props*, not the attachment — omit them and the
   viewport is `[0,0,undefined,undefined]`, so every *draw* into the fbo renders
   nothing while `gl.clear()` (which ignores the viewport) still works. This one
   masqueraded as "deck-projected models won't render off-screen" and stalled
   the trails for a while — it was just the degenerate viewport.
2. **A `project32` model keeps its projection in a custom render pass.** Leave
   the particle model in `getModels()` so deck sets its `project32` UBO each
   frame; that UBO is still bound when you draw the model into *your own*
   framebuffer later in `draw()`. So projected particles render straight into
   the offscreen trail buffer — no need to re-derive the projection by hand.
3. **`GL_POINTS` don't render into an FBO on macOS/ANGLE** (they're fine to the
   default framebuffer). Each particle is an expanded quad instead.
4. **Instanced draws with no per-instance attribute emit nothing** on this
   luma build — the quads are a plain non-instanced triangle list.
5. **Store positions in a float texture, not RGBA8 bit-packing.** webgl-wind
   packs each `[0,1]` coordinate into two bytes because WebGL1 lacked reliable
   float render targets; deck v9 is WebGL2-only, where `rgba32float` targets are
   standard. Direct float storage removed a whole class of decode bug.

## Zoom-stable density (view-relative seeding)

A wind field seeded uniformly across the whole globe looks wrong at most zooms:
the number of particles actually on screen is `N × (fraction of the world in
view)`, so it's a crowded mess zoomed out and sparse zoomed in. Per-zoom presets
don't rescue this — keeping a zoomed-in view dense with global seeding would need
`N` to grow like `4^zoom`.

Instead, particles **seed and respawn inside the current viewport** (advection
and the wind lookup still happen in global equirectangular space, so it stays
physically correct — only the spawn bounds are view-relative), and any particle
that drifts out of the margin-expanded view is recycled back in. So every
particle is always on screen and `numParticles` becomes a **screen density that
holds constant at any zoom**. The layer reads the viewport each frame; pan/zoom
hard and the field refills the newly revealed area within a second or so.

## Pooling (and the `maxAge` fix)

Low respawn gives long, clean streaks — but with particles long-lived, flow
convergence sweeps them into dense clumps with empty voids between (pooling).
You can't just raise the random respawn rate without chopping the streaks short.
The fix is a per-particle **lifetime** (`maxAge`, frames): every particle resets
to a fresh uniform position at least that often, with ages seeded staggered so
resets spread smoothly across frames instead of pulsing. That bounds how far any
particle can drift before re-uniformizing, so convergence can't accumulate
indefinitely. Set `maxAge` at or above the trail's fade window (`fadeOpacity`)
and the streaks stay full-length while the field stays even.

## Acknowledgments

Technique from Vladimir Agafonkin's `mapbox/webgl-wind` (ISC). This is an
independent implementation for deck.gl v9 / luma.gl v9.
