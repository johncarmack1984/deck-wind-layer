// Demo: an OSM basemap + the WindLayer, in a vanilla deck.gl MapView so the
// dev loop is fast and the camera-sync is testable by dragging/scrolling. A
// small control panel (controls.ts) tunes the layer live.

import { Deck } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
// Import by package name, exactly as a consumer would — the Vite alias and the
// tsconfig path point it at ../src in this repo (see vite.config.ts).
import { WindLayer } from 'deck-wind-layer';
import { createControls, type WindConfig } from './controls';

const basemap = new TileLayer({
  id: 'basemap',
  // Dark basemap so the white particle streaks read (Windy-style).
  data: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  minZoom: 0,
  maxZoom: 19,
  tileSize: 256,
  // biome-ignore lint/suspicious/noExplicitAny: deck sublayer props are loosely typed.
  renderSubLayers: (props: any) => {
    const [[west, south], [east, north]] = props.tile.boundingBox;
    return new BitmapLayer(props, {
      data: undefined,
      image: props.data,
      bounds: [west, south, east, north],
    });
  },
});

const windLayer = (cfg: WindConfig) =>
  new WindLayer({
    id: 'wind',
    // BASE_URL is '/' in dev and '/deck-wind-layer/' on GitHub Pages, so this
    // runtime asset path resolves correctly under the project subpath.
    image: `${import.meta.env.BASE_URL}wind.png`,
    uMin: -40,
    uMax: 40,
    vMin: -40,
    vMax: 40,
    ...cfg,
  });

// Surface any runtime error to the HUD (headless screenshots can't see console).
const hud = document.getElementById('hud');
const show = (msg: string) => {
  if (hud) hud.textContent = msg;
};
window.addEventListener('error', (e) => show(`ERROR: ${e.message}`));
window.addEventListener('unhandledrejection', (e) =>
  show(`REJECT: ${(e.reason as Error)?.message ?? e.reason}`),
);

const app = document.getElementById('app');
if (!app) throw new Error('#app not found');

const deck = new Deck({
  parent: app as HTMLDivElement,
  initialViewState: { longitude: 0, latitude: 25, zoom: 1.3 },
  controller: true,
});

// Mount the tuning panel; every edit rebuilds the wind layer (deck diffs props,
// so uniform-only changes are cheap; numParticles re-inits the sim).
const config = createControls((cfg) => {
  deck.setProps({ layers: [basemap, windLayer(cfg)] });
});
deck.setProps({ layers: [basemap, windLayer(config)] });
