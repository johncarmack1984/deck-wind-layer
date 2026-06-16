#version 300 es
#define SHADER_NAME wind-update-vertex
in vec2 a_quad;
out vec2 v_tex_pos;
void main() {
  v_tex_pos = a_quad;
  gl_Position = vec4(a_quad * 2.0 - 1.0, 0.0, 1.0);
}
