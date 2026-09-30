import type { Photo } from '../lib/types';

export const SIZES = { full: 2200, md: 1280, thumb: 360 } as const;
export type SizeKind = keyof typeof SIZES;

export interface ProcessedImage {
  photo: Photo;
  blobs: Record<SizeKind, Blob>;
  ext: 'webp' | 'jpg';
}

/** Decode honouring EXIF orientation (createImageBitmap 'from-image', falling back to an <img>, which also applies it). */
async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function dims(src: ImageBitmap | HTMLImageElement) {
  return 'naturalWidth' in src ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height };
}

/** high-quality downscale: halve repeatedly, then one final smooth step */
function resize(src: CanvasImageSource, w: number, h: number, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  let cur: CanvasImageSource = src;
  let cw = w;
  let ch = h;
  while (cw / 2 > tw && ch / 2 > th) {
    const c = document.createElement('canvas');
    c.width = Math.round(cw / 2);
    c.height = Math.round(ch / 2);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, c.width, c.height);
    cur = c;
    cw = c.width;
    ch = c.height;
  }
  const out = document.createElement('canvas');
  out.width = tw;
  out.height = th;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, tw, th);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, tw, th);
  return out;
}

function toBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob(resolve, type, q));
}

async function encode(c: HTMLCanvasElement, q: number): Promise<{ blob: Blob; ext: 'webp' | 'jpg' }> {
  const webp = await toBlob(c, 'image/webp', q);
  if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp' };
  const jpg = await toBlob(c, 'image/jpeg', Math.min(0.9, q + 0.04));
  if (!jpg) throw new Error('No se pudo comprimir la imagen');
  return { blob: jpg, ext: 'jpg' };
}

function averageColor(c: HTMLCanvasElement): string {
  const s = document.createElement('canvas');
  s.width = s.height = 16;
  const ctx = s.getContext('2d')!;
  ctx.drawImage(c, 0, 0, 16, 16);
  const d = ctx.getImageData(0, 0, 16, 16).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function newPhotoId(): string {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Turn a picked file into web versions (<= 2200 / 1280 / 360 px). Pixels are only resized and compressed. */
export async function processImage(file: File, order: number): Promise<ProcessedImage> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)) {
    throw new Error(`«${file.name}» no es una imagen`);
  }
  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await decode(file);
  } catch {
    throw new Error(`No se pudo abrir «${file.name}». Si es HEIC, conviértela a JPG primero.`);
  }
  const { w, h } = dims(bmp);
  const id = newPhotoId();
  const full = resize(bmp, w, h, SIZES.full);
  const md = resize(full, full.width, full.height, SIZES.md);
  const thumb = resize(md, md.width, md.height, SIZES.thumb);
  if ('close' in bmp) bmp.close();
  const [ef, em, et] = await Promise.all([encode(full, 0.84), encode(md, 0.8), encode(thumb, 0.72)]);
  const ext = ef.ext;
  const photo: Photo = {
    id,
    order,
    src: `photos/full/${id}.${ext}`,
    srcMd: `photos/md/${id}.${em.ext}`,
    thumb: `photos/thumb/${id}.${et.ext}`,
    width: full.width,
    height: full.height,
    color: averageColor(md),
    originalFilename: file.name,
    caption: '',
    alt: 'Fotografía del Libro de mamá',
    fitMode: 'contain',
    rotation: 0,
    focalPoint: { x: 0.5, y: 0.5 },
    hidden: false,
    createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
  return { photo, blobs: { full: ef.blob, md: em.blob, thumb: et.blob }, ext };
}
