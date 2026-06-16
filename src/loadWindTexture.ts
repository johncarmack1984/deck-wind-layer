import type { Device, Texture } from '@luma.gl/core';

/** Load an equirectangular u/v PNG into a luma texture: linear, longitude-
 * wrapping, row 0 = 90N (drawn unflipped). Resolves null on fetch/decode
 * failure. */
export async function loadWindTexture(
  device: Device,
  url: string,
): Promise<Texture | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const bitmap = await createImageBitmap(await res.blob(), {
    imageOrientation: 'none',
  });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return device.createTexture({
    width: img.width,
    height: img.height,
    format: 'rgba8unorm',
    data: new Uint8Array(img.data.buffer),
    sampler: {
      minFilter: 'linear',
      magFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'clamp-to-edge',
    },
  });
}
