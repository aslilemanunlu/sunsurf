/**
 * Shrinking a photographed document before it is stored.
 *
 * The form gets photographed at the desk on a phone, which produces four or
 * five megabytes of camera JPEG for a page of A4 that is legible at a fraction
 * of that. The image goes into a Postgres text column, so the size matters —
 * this is the difference between a workable table and a bad idea.
 *
 * 1600px on the long edge keeps handwriting readable; 0.75 JPEG is where the
 * artefacts stop mattering for a scanned form.
 */
const MAX_EDGE = 1600;
const QUALITY = 0.75;

/** Roughly the CHECK in db/016, left a little under it. */
export const MAX_DATA_URL = 3_200_000;

export async function shrinkToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = QUALITY;
  let url = canvas.toDataURL('image/jpeg', quality);

  // A dense photograph can still come out over the limit; step down rather than
  // fail at the database, which would be the first the user hears of it.
  while (url.length > MAX_DATA_URL && quality > 0.3) {
    quality -= 0.15;
    url = canvas.toDataURL('image/jpeg', quality);
  }
  return url;
}
