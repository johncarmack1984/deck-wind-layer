#version 300 es
#define SHADER_NAME wind-draw-fragment
precision highp float;
in float v_speed_t;
in vec2 v_local;
out vec4 fragColor;
void main() {
  if (dot(v_local, v_local) > 0.25) discard; // round the quad into a disc
  // Speed-gated: calm air deposits ~nothing (so it decays to dark and doesn't
  // saturate the trail buffer), jets deposit brightly. Equilibrium per pixel is
  // deposit/(1-fadeOpacity), so keep the deposit low.
  float alpha = wind.alphaScale * v_speed_t;
  fragColor = vec4(wind.colorR, wind.colorG, wind.colorB, alpha);
}
