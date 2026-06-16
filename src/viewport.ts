// Pure viewport math, kept out of the layer's draw loop.
//
// Two jobs:
//  - viewBounds: the visible region in pos-space ([0,1], x cyclic, y = north→
//    south), margin-expanded, so particles can seed within the current view.
//  - reprojectUV: the sample transform that re-aligns the previous frame's
//    screen-space trail buffer to the current camera, so zoom/pan keeps the
//    accumulated trails instead of clearing them.

export type ViewBounds = { x0: number; w: number; y0: number; y1: number };

const MARGIN = 0.08; // soft edge so particles enter/leave the view smoothly

/** The current viewport in pos-space, margin-expanded. Whole world if the
 * viewport can't report bounds. */
export function viewBounds(viewport: unknown): ViewBounds {
  // biome-ignore lint/suspicious/noExplicitAny: viewport bounds typing varies.
  const b = (viewport as any)?.getBounds?.();
  if (!(b && Number.isFinite(b[0]) && Number.isFinite(b[2]))) {
    return { x0: 0, w: 1, y0: 0, y1: 1 };
  }
  const [west, south, east, north] = b;
  const span = Math.min(Math.max((east - west) / 360, 0), 1);
  const mx = span * MARGIN;
  const yTop = Math.min(Math.max((90 - north) / 180, 0), 1);
  const yBot = Math.min(Math.max((90 - south) / 180, 0), 1);
  const my = (yBot - yTop) * MARGIN;
  return {
    x0: (((west / 360 - mx) % 1) + 1) % 1,
    w: Math.min(span + 2 * mx, 1),
    y0: Math.max(0, yTop - my),
    y1: Math.min(1, yBot + my),
  };
}

/** True if the bounds moved enough to matter (i.e. the camera changed). */
export function boundsChanged(
  prev: ViewBounds | undefined,
  next: ViewBounds,
): boolean {
  return (
    !prev ||
    Math.abs(prev.x0 - next.x0) > 1e-5 ||
    Math.abs(prev.w - next.w) > 1e-5 ||
    Math.abs(prev.y0 - next.y0) > 1e-5 ||
    Math.abs(prev.y1 - next.y1) > 1e-5
  );
}

export type ReprojectUV = {
  offX: number;
  offY: number;
  scaleX: number;
  scaleY: number;
};

/** Sample offset/scale to map the current frame's UVs back onto the previous
 * frame's trail buffer. For a north-up mercator map the frame-to-frame remap is
 * an exact axis-aligned scale+offset. Returns null when it can't be done
 * cleanly (no previous frame, or a tilted/rotated view) — the caller should
 * clear the buffer instead of smearing it. */
export function reprojectUV(prev: unknown, curr: unknown): ReprojectUV | null {
  // biome-ignore lint/suspicious/noExplicitAny: viewport project/unproject typing.
  const vpP = prev as any;
  // biome-ignore lint/suspicious/noExplicitAny: viewport project/unproject typing.
  const vpC = curr as any;
  if (!vpP) return null;
  if (Math.abs(vpC?.bearing ?? 0) > 1e-3 || Math.abs(vpC?.pitch ?? 0) > 1e-3) {
    return null;
  }
  try {
    const Wp = vpP.width;
    const Hp = vpP.height;
    // Current bottom-left (uv 0,0) and top-right (uv 1,1) -> previous pixels.
    const bl = vpP.project(vpC.unproject([0, vpC.height]));
    const tr = vpP.project(vpC.unproject([vpC.width, 0]));
    const offX = bl[0] / Wp;
    const offY = 1 - bl[1] / Hp;
    return {
      offX,
      offY,
      scaleX: tr[0] / Wp - offX,
      scaleY: 1 - tr[1] / Hp - offY,
    };
  } catch {
    return null;
  }
}
