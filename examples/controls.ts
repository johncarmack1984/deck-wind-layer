// A tiny dependency-free control panel for tuning the WindLayer live. Vanilla
// DOM (the demo has no UI framework). Presets give one-click coherent looks;
// the sliders fine-tune from there. Persists to localStorage.

export type WindConfig = {
  speedFactor: number;
  fadeOpacity: number;
  particleAlpha: number;
  maxSpeed: number;
  pointSize: number;
  dropRate: number;
  maxAge: number;
  numParticles: number;
};

// Hand-tuned combinations — each balances the interacting knobs (brightness ×
// trail to avoid whiteout, maxSpeed to pick which winds glow, lifetime vs trail
// for streak length, particles for density).
export const PRESETS: { name: string; config: WindConfig }[] = [
  {
    name: 'Streaks',
    config: {
      speedFactor: 0.15,
      fadeOpacity: 0.95,
      particleAlpha: 1.5,
      maxSpeed: 4,
      pointSize: 0.5,
      dropRate: 0.002,
      maxAge: 180,
      numParticles: 65536,
    },
  },
  {
    name: 'Mist',
    config: {
      speedFactor: 0.1,
      fadeOpacity: 0.85,
      particleAlpha: 0.8,
      maxSpeed: 12,
      pointSize: 0.5,
      dropRate: 0.004,
      maxAge: 140,
      numParticles: 131072,
    },
  },
  {
    name: 'Jets',
    config: {
      speedFactor: 0.18,
      fadeOpacity: 0.9,
      particleAlpha: 1.5,
      maxSpeed: 25,
      pointSize: 0.6,
      dropRate: 0.002,
      maxAge: 220,
      numParticles: 65536,
    },
  },
  {
    name: 'Dense',
    config: {
      speedFactor: 0.12,
      fadeOpacity: 0.8,
      particleAlpha: 0.5,
      maxSpeed: 8,
      pointSize: 0.5,
      dropRate: 0.006,
      maxAge: 110,
      numParticles: 262144,
    },
  },
];

export const DEFAULT_CONFIG: WindConfig = PRESETS[0].config;

const STORAGE_KEY = 'deck-wind-layer:config';

type SliderSpec = {
  key: keyof Omit<WindConfig, 'numParticles'>;
  label: string;
  min: number;
  max: number;
  step: number;
  digits: number;
};

const SLIDERS: SliderSpec[] = [
  {
    key: 'speedFactor',
    label: 'speed',
    min: 0.01,
    max: 0.3,
    step: 0.01,
    digits: 2,
  },
  {
    key: 'fadeOpacity',
    label: 'trail',
    min: 0.1,
    max: 0.95,
    step: 0.05,
    digits: 2,
  },
  {
    key: 'particleAlpha',
    label: 'brightness',
    min: 0.05,
    max: 1.5,
    step: 0.05,
    digits: 2,
  },
  { key: 'maxSpeed', label: 'max m/s', min: 4, max: 40, step: 1, digits: 0 },
  {
    key: 'pointSize',
    label: 'size px',
    min: 0.5,
    max: 1.5,
    step: 0.1,
    digits: 1,
  },
  {
    key: 'dropRate',
    label: 'respawn',
    min: 0,
    max: 0.02,
    step: 0.001,
    digits: 3,
  },
  { key: 'maxAge', label: 'lifetime', min: 30, max: 600, step: 10, digits: 0 },
];

const PARTICLE_OPTIONS = [16384, 32768, 65536, 131072, 262144];

function loadConfig(): WindConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    // ignore malformed storage
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg: WindConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore (private mode etc.)
  }
}

const BTN_STYLE =
  'background:#262b35;color:#cdd3dc;border:1px solid rgba(255,255,255,0.15);border-radius:4px;font:inherit;padding:3px 6px;cursor:pointer';

/** Mount the panel and return the initial config. `onChange` fires on every
 * preset/slider/select edit with a fresh copy. */
export function createControls(
  onChange: (cfg: WindConfig) => void,
): WindConfig {
  const cfg = loadConfig();

  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed',
    'top:12px',
    'right:12px',
    'z-index:10',
    'background:rgba(15,17,21,0.82)',
    'backdrop-filter:blur(6px)',
    'border:1px solid rgba(255,255,255,0.12)',
    'border-radius:8px',
    'padding:10px 12px',
    'font:11px ui-monospace,SFMono-Regular,Menlo,monospace',
    'color:#cdd3dc',
    'width:212px',
    'user-select:none',
  ].join(';');
  // Don't let drags on the panel reach deck's map controller.
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());

  const emit = () => {
    saveConfig(cfg);
    onChange({ ...cfg });
  };

  // Keep references so presets/reset can push values back into the inputs.
  const sliderRefs: Partial<
    Record<SliderSpec['key'], { input: HTMLInputElement; val: HTMLSpanElement }>
  > = {};
  let particleSelect: HTMLSelectElement;

  const applyConfig = (next: WindConfig) => {
    Object.assign(cfg, next);
    for (const s of SLIDERS) {
      const ref = sliderRefs[s.key];
      if (!ref) continue;
      ref.input.value = String(cfg[s.key]);
      ref.val.textContent = cfg[s.key].toFixed(s.digits);
    }
    particleSelect.value = String(cfg.numParticles);
    emit();
  };

  // Presets row.
  const presetRow = document.createElement('div');
  presetRow.style.cssText =
    'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px';
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.textContent = p.name;
    b.style.cssText = `flex:1 1 auto;${BTN_STYLE}`;
    b.addEventListener('click', () => applyConfig(p.config));
    presetRow.appendChild(b);
  }
  panel.appendChild(presetRow);

  const rowStyle =
    'display:flex;align-items:center;gap:8px;margin:6px 0;white-space:nowrap';
  const labelStyle = 'flex:0 0 64px;color:#8b93a1';
  const valStyle =
    'flex:0 0 42px;text-align:right;font-variant-numeric:tabular-nums;color:#e8edf4';

  for (const s of SLIDERS) {
    const row = document.createElement('div');
    row.style.cssText = rowStyle;

    const label = document.createElement('span');
    label.textContent = s.label;
    label.style.cssText = labelStyle;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(s.min);
    input.max = String(s.max);
    input.step = String(s.step);
    input.value = String(cfg[s.key]);
    input.style.cssText = 'flex:1 1 auto;min-width:0;accent-color:#6ea8fe';

    const val = document.createElement('span');
    val.textContent = cfg[s.key].toFixed(s.digits);
    val.style.cssText = valStyle;

    input.addEventListener('input', () => {
      const v = Number.parseFloat(input.value);
      cfg[s.key] = v;
      val.textContent = v.toFixed(s.digits);
      emit();
    });

    sliderRefs[s.key] = { input, val };
    row.append(label, input, val);
    panel.appendChild(row);
  }

  // numParticles — discrete select (changing it re-inits the sim).
  {
    const row = document.createElement('div');
    row.style.cssText = rowStyle;
    const label = document.createElement('span');
    label.textContent = 'particles';
    label.style.cssText = labelStyle;
    const select = document.createElement('select');
    select.style.cssText =
      'flex:1 1 auto;min-width:0;background:#1b1f27;color:#e8edf4;border:1px solid rgba(255,255,255,0.15);border-radius:4px;font:inherit;padding:2px 4px';
    for (const n of PARTICLE_OPTIONS) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = n >= 1024 ? `${Math.round(n / 1024)}k` : String(n);
      if (n === cfg.numParticles) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      cfg.numParticles = Number.parseInt(select.value, 10);
      emit();
    });
    particleSelect = select;
    row.append(label, select);
    panel.appendChild(row);
  }

  // Reset to the default preset.
  const reset = document.createElement('button');
  reset.textContent = 'reset';
  reset.style.cssText = `margin-top:8px;width:100%;${BTN_STYLE}`;
  reset.addEventListener('click', () => applyConfig(DEFAULT_CONFIG));
  panel.appendChild(reset);

  document.body.appendChild(panel);
  return { ...cfg };
}
