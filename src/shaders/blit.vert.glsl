#version 300 es
#define SHADER_NAME wind-blit-vertex
in vec2 a_quad;
out vec2 v_uv;
void main() {
  v_uv = a_quad;
  gl_Position = vec4(a_quad * 2.0 - 1.0, 0.0, 1.0);
}
