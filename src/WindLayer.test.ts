import { describe, expect, it } from 'vitest';
import { WindLayer } from './index';

describe('WindLayer', () => {
  it('exports the layer with its static identity', () => {
    expect(WindLayer.layerName).toBe('WindLayer');
  });

  it('ships the tuned defaults', () => {
    const d = WindLayer.defaultProps as unknown as Record<string, number>;
    expect(d.numParticles).toBe(65536);
    expect(d.speedFactor).toBe(0.15);
    expect(d.fadeOpacity).toBe(0.95);
    expect(d.maxSpeed).toBe(4);
    expect(d.pointSize).toBe(0.5);
    expect(d.particleAlpha).toBe(1.5);
    expect(d.maxAge).toBe(180);
  });

  it('constructs without a GPU context', () => {
    expect(
      () =>
        new WindLayer({ image: '', uMin: -40, uMax: 40, vMin: -40, vMax: 40 }),
    ).not.toThrow();
  });
});
