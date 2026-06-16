#version 300 es
#define SHADER_NAME wind-update-fragment
precision highp float;
uniform sampler2D u_particles;
uniform sampler2D u_wind;
in vec2 v_tex_pos;
out vec4 fragColor;

vec2 windAt(sampler2D windTex, vec2 pos) {
  vec2 n = texture(windTex, pos).rg;
  return vec2(mix(wind.uMin, wind.uMax, n.x), mix(wind.vMin, wind.vMax, n.y));
}

// Integer hash (PCG-style bit mixing). A fract()-of-product float hash develops
// low-frequency spatial structure on small/correlated inputs, which shows up as
// drifting bands in the field; hashing the integer particle id with a per-frame
// seed has no such structure, so respawns scatter uniformly at every config.
uint hashU(uint x) {
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}
float u01(uint x) { return float(x) * (1.0 / 4294967296.0); }

void main() {
  // R/G = position, B = normalized age in [0,1] (no bit-packing).
  vec4 state = texture(u_particles, v_tex_pos);
  vec2 pos = state.rg;
  float age = state.b;
  vec2 velocity = windAt(u_wind, pos);
  float speed_t = length(velocity) / max(1e-3, max(abs(wind.uMax), abs(wind.vMax)));

  // Mercator distortion: pos.y = 0 is 90N, so lat = 90 - pos.y*180.
  float lat = 90.0 - pos.y * 180.0;
  float distortion = cos(radians(lat));
  // Advance at a fixed (heavily exaggerated) geographic rate, so the flow reads
  // slow at world scale and faster zoomed in — the way real wind looks at
  // different scales — rather than a view-relative rate that drifts the whole
  // globe cartoonishly fast at low zoom. The constant is the time-lapse factor;
  // speedFactor scales it.
  vec2 offset = vec2(velocity.x / max(0.05, distortion), -velocity.y)
                * 4.0e-5 * wind.speedFactor;
  pos = fract(1.0 + pos + offset);
  age += 1.0 / max(1.0, wind.maxAge);

  // Per-particle, per-frame randoms from the integer hash: the texel id mixed
  // with a per-frame seed, then chained for three independent values. Uniform
  // and structure-free regardless of config.
  ivec2 dims = textureSize(u_particles, 0);
  uint pid = uint(gl_FragCoord.y) * uint(dims.x) + uint(gl_FragCoord.x);
  uint h = hashU(pid * 2654435761u + uint(wind.randSeed * 16777216.0));
  float rDrop = u01(h);
  h = hashU(h);
  float rX = u01(h);
  h = hashU(h);
  float rY = u01(h);

  // Respawn triggers: age-out (bounds drift so convergence can't pool particles
  // — staggered ages spread these across frames), the random drop roll (extra
  // scatter), or drifting outside the current view. View-relative: new particles
  // spawn uniformly inside the current viewport (x cyclic), and any that leave
  // the margin-expanded view are recycled in — so N is a zoom-independent
  // screen density and the field stays smooth at every config.
  float drop_rate = wind.dropRate + speed_t * wind.dropRateBump;
  vec2 random_pos = vec2(
    fract(wind.viewX0 + rX * wind.viewW),
    mix(wind.viewY0, wind.viewY1, rY)
  );
  float inView =
    step(fract(pos.x - wind.viewX0), wind.viewW) *
    step(wind.viewY0, pos.y) * step(pos.y, wind.viewY1);

  float respawn = max(
    max(step(1.0, age), step(1.0 - drop_rate, rDrop)),
    1.0 - inView
  );
  pos = mix(pos, random_pos, respawn);
  age = mix(age, 0.0, respawn);

  fragColor = vec4(pos, age, 1.0);
}
