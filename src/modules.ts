// luma.gl shader modules: the std140 uniform blocks injected into the passes.
// The GLSL block declarations live alongside the shaders; the uniformTypes here
// mirror them so luma can pack the UBOs.

import BLIT_UBO from './shaders/blitUniforms.glsl?raw';
import WIND_UNIFORMS from './shaders/windUniforms.glsl?raw';

// biome-ignore lint/suspicious/noExplicitAny: luma's ShaderModule generic isn't worth threading.
export const windUniforms: any = {
  name: 'wind',
  vs: WIND_UNIFORMS,
  fs: WIND_UNIFORMS,
  uniformTypes: {
    uMin: 'f32',
    uMax: 'f32',
    vMin: 'f32',
    vMax: 'f32',
    speedFactor: 'f32',
    dropRate: 'f32',
    dropRateBump: 'f32',
    randSeed: 'f32',
    pointSize: 'f32',
    colorR: 'f32',
    colorG: 'f32',
    colorB: 'f32',
    alphaScale: 'f32',
    maxSpeed: 'f32',
    maxAge: 'f32',
    viewX0: 'f32',
    viewW: 'f32',
    viewY0: 'f32',
    viewY1: 'f32',
  },
};

// biome-ignore lint/suspicious/noExplicitAny: luma's ShaderModule generic isn't worth threading.
export const blitUniforms: any = {
  name: 'blit',
  vs: BLIT_UBO,
  fs: BLIT_UBO,
  uniformTypes: {
    opacity: 'f32',
    uvOffX: 'f32',
    uvOffY: 'f32',
    uvScaleX: 'f32',
    uvScaleY: 'f32',
  },
};
