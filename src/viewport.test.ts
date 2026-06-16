import { describe, expect, it } from 'vitest';
import { boundsChanged, reprojectUV, viewBounds } from './viewport';

const vp = (bounds: number[]) => ({ getBounds: () => bounds });

describe('viewBounds', () => {
  it('falls back to the whole world when bounds are unavailable', () => {
    expect(viewBounds(undefined)).toEqual({ x0: 0, w: 1, y0: 0, y1: 1 });
    expect(viewBounds({})).toEqual({ x0: 0, w: 1, y0: 0, y1: 1 });
  });

  it('clamps a full-world view to w=1 and the lat band to [0,1]', () => {
    const b = viewBounds(vp([-180, -85, 180, 85]));
    expect(b.w).toBe(1);
    expect(b.y0).toBe(0);
    expect(b.y1).toBe(1);
  });

  it('maps a regional view into pos-space with a margin', () => {
    const b = viewBounds(vp([-130, 30, -110, 45]));
    // span = 20/360 = 0.0556, +8% margin each side -> w ~ 0.0644
    expect(b.w).toBeCloseTo(0.0644, 3);
    expect(b.x0).toBeCloseTo(0.6344, 3);
    // lat 45..30 -> pos.y 0.25..0.333, expanded 8%
    expect(b.y0).toBeCloseTo(0.2433, 3);
    expect(b.y1).toBeCloseTo(0.34, 3);
  });

  it('wraps x across the prime meridian (x0 near 1, small width)', () => {
    const b = viewBounds(vp([-10, 30, 10, 45]));
    expect(b.x0).toBeCloseTo(0.9678, 3);
    expect(b.w).toBeCloseTo(0.0644, 3);
  });
});

describe('boundsChanged', () => {
  const a = { x0: 0.5, w: 0.2, y0: 0.3, y1: 0.6 };

  it('is true when there is no previous bounds', () => {
    expect(boundsChanged(undefined, a)).toBe(true);
  });

  it('is false for identical bounds', () => {
    expect(boundsChanged(a, { ...a })).toBe(false);
  });

  it('ignores sub-epsilon jitter but catches real moves', () => {
    expect(boundsChanged(a, { ...a, x0: a.x0 + 1e-7 })).toBe(false);
    expect(boundsChanged(a, { ...a, x0: a.x0 + 1e-3 })).toBe(true);
  });
});

describe('reprojectUV', () => {
  // project/unproject as the identity, so known transforms can be composed.
  const id = {
    width: 1000,
    height: 800,
    bearing: 0,
    pitch: 0,
    project: (p: number[]) => p,
    unproject: (p: number[]) => p,
  };

  it('returns null without a previous viewport', () => {
    expect(reprojectUV(null, id)).toBeNull();
  });

  it('returns null for a tilted or rotated view', () => {
    expect(reprojectUV(id, { ...id, bearing: 30 })).toBeNull();
    expect(reprojectUV(id, { ...id, pitch: 20 })).toBeNull();
  });

  it('is the identity transform when the camera has not moved', () => {
    expect(reprojectUV(id, id)).toEqual({
      offX: 0,
      offY: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it('recovers a centered 2x zoom-in as a half-size offset sub-rect', () => {
    // curr maps its pixels into a 0.5x sub-region of prev's space, centered.
    const curr = {
      width: 1000,
      height: 800,
      bearing: 0,
      pitch: 0,
      project: (p: number[]) => p,
      unproject: ([x, y]: number[]) => [x / 2 + 250, y / 2 + 200],
    };
    const r = reprojectUV(id, curr);
    expect(r).not.toBeNull();
    expect(r?.offX).toBeCloseTo(0.25, 6);
    expect(r?.offY).toBeCloseTo(0.25, 6);
    expect(r?.scaleX).toBeCloseTo(0.5, 6);
    expect(r?.scaleY).toBeCloseTo(0.5, 6);
  });
});
