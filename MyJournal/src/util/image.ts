/* Client-side image compression (from v1 utils.js, now returning a Blob + size). */

export interface Compressed {
  blob: Blob;
  w: number;
  h: number;
}

export async function compressImage(file: Blob, maxDim = 1600, quality = 0.82, preserveTransparency = false): Promise<Compressed> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  // keep transparency for PNGs (stickers later); photos become JPEG
  const type = preserveTransparency || file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
  if (!blob) throw new Error('Could not compress image');
  return { blob, w, h };
}
