// Vite imports .glsl files as raw strings via the `?raw` suffix.
declare module '*.glsl?raw' {
  const src: string;
  export default src;
}
