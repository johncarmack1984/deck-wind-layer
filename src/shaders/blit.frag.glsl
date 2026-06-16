#version 300 es
#define SHADER_NAME wind-blit-fragment
precision highp float;
uniform sampler2D u_screen;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  // Sample through an affine offset/scale so the previous trail buffer can be
  // re-aligned to the current camera (identity for the straight composite).
  // Out-of-bounds samples contribute nothing, so area the camera newly reveals
  // starts empty and fills back in from fresh particles.
  vec2 uv = vec2(blit.uvOffX, blit.uvOffY) + v_uv * vec2(blit.uvScaleX, blit.uvScaleY);
  float inb = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  fragColor = texture(u_screen, uv) * (blit.opacity * inb);
}
