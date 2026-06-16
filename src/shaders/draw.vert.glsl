#version 300 es
#define SHADER_NAME wind-draw-vertex
in vec3 a_data;              // x = particle index, yz = quad corner in [0,1]
uniform sampler2D u_particles;
uniform sampler2D u_wind;
out float v_speed_t;
out vec2 v_local;

vec2 windAt(sampler2D windTex, vec2 pos) {
  vec2 n = texture(windTex, pos).rg;
  return vec2(mix(wind.uMin, wind.uMax, n.x), mix(wind.vMin, wind.vMax, n.y));
}

void main() {
  ivec2 dims = textureSize(u_particles, 0);
  int idx = int(a_data.x);
  vec2 pos = texelFetch(u_particles, ivec2(idx % dims.x, idx / dims.x), 0).rg;

  v_speed_t = clamp(length(windAt(u_wind, pos)) / max(1.0, wind.maxSpeed), 0.0, 1.0);

  float lng = pos.x * 360.0;
  if (lng > 180.0) lng -= 360.0;
  float lat = 90.0 - pos.y * 180.0;
  vec4 center = project_position_to_clipspace(vec3(lng, lat, 0.0), vec3(0.0), vec3(0.0));
  v_local = a_data.yz - 0.5;
  // Fixed clip-space corner offset (project_pixel_size_to_clipspace collapsed
  // the quads to zero size here); ~pointSize px at a ~500px-tall viewport.
  center.xy += v_local * wind.pointSize * 0.004 * center.w;
  gl_Position = center;
}
