# deck-wind-layer example

A complete, runnable demo: an OSM dark basemap with `WindLayer` painted over it
in a vanilla deck.gl `Deck`, plus a small live-tuning panel. Drag and scroll to
watch the particle field stay camera-synced and hold constant on-screen density
at any zoom.

## Run it

From the repo root:

```bash
pnpm install
pnpm dev            # http://localhost:7373
```

`pnpm dev` runs Vite with `root: examples/`, so this directory _is_ the dev app.

## What's here

| File          | Role                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| `main.ts`     | Builds the `Deck`, the basemap `TileLayer`, and the `WindLayer`.           |
| `controls.ts` | Dependency-free DOM panel — presets + sliders, persisted to localStorage.  |
| `index.html`  | Mounts `#app` and a small HUD; loads `main.ts`.                            |
| `public/`     | The sample wind field (`wind.png` + `wind.json`).                          |

## Importing by name

`main.ts` imports the package the way a consumer would, not by relative path:

```ts
import { WindLayer } from 'deck-wind-layer';
```

In this repo that name is aliased to `../src` — by Vite (`vite.config.ts`
`resolve.alias`) for the runtime and by tsconfig `paths` for the typecheck — so
the dev loop has no build step. Published, the same import resolves to the
package's `dist`. Copy `main.ts` into your own app and it works unchanged.

## The wind data

`WindLayer` reads a single equirectangular image whose **R** and **G** channels
encode the eastward (`u`) and northward (`v`) wind components, each linearly
normalized into `[0, 255]` over a fixed range. The four range bounds are passed
as props so the shader can decode back to m/s:

```ts
new WindLayer({
  image: '/wind.png',
  uMin: -40, uMax: 40,   // R: 0 -> -40 m/s, 255 -> +40 m/s
  vMin: -40, vMax: 40,   // G channel, same mapping
});
```

`public/wind.json` records the dimensions and bounds of the bundled sample — a
GFS 10 m UGRD/VGRD frame (NOAA, public domain). Row 0 is 90°N, column 0 is 0°E.
To show your own data, drop in any image in this layout and pass its bounds.

See the [root README](../README.md) for the full prop reference.
