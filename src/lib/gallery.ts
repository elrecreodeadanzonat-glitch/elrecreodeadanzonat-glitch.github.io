import type { Gallery, Photo, Rotation } from './types';

export const GALLERY_URL = 'gallery.json';

/** Resolve a path from gallery.json (relative to the site root) against the page base. */
export function assetUrl(path: string): string {
  if (/^(blob:|data:|https?:)/.test(path)) return path;
  return import.meta.env.BASE_URL + path.replace(/^\//, '');
}

export async function loadGallery(signal?: AbortSignal): Promise<Gallery> {
  const res = await fetch(assetUrl(GALLERY_URL) + `?t=${Date.now()}`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`No se pudo cargar gallery.json (${res.status})`);
  const data = (await res.json()) as Gallery;
  const problems = validateGallery(data);
  if (problems.length) throw new Error('gallery.json inválido: ' + problems.join('; '));
  return data;
}

/** Photos in their canonical order (the `order` field), hidden ones removed. */
export function visiblePhotos(g: Pick<Gallery, 'photos'>): Photo[] {
  return sortByOrder(g.photos).filter((p) => !p.hidden);
}

export function sortByOrder(photos: Photo[]): Photo[] {
  return [...photos].sort((a, b) => a.order - b.order);
}

/** Re-number `order` 1..n following the given array order (visible first, then hidden, preserving each group's order). */
export function renumber(photos: Photo[]): Photo[] {
  const visible = photos.filter((p) => !p.hidden);
  const hidden = photos.filter((p) => p.hidden);
  return [...visible, ...hidden].map((p, i) => (p.order === i + 1 ? p : { ...p, order: i + 1 }));
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function rotateBy90(r: Rotation): Rotation {
  return (((r + 90) % 360) as Rotation);
}

export function validateGallery(g: Gallery): string[] {
  const problems: string[] = [];
  if (!g || !Array.isArray(g.photos)) return ['falta la lista de fotos'];
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const p of g.photos) {
    if (!p.id) problems.push('foto sin id');
    else if (ids.has(p.id)) problems.push(`id repetido ${p.id}`);
    ids.add(p.id);
    if (!Number.isInteger(p.order) || p.order < 1) problems.push(`orden inválido en ${p.id}`);
    else if (orders.has(p.order)) problems.push(`orden repetido ${p.order}`);
    orders.add(p.order);
    if (!p.src || !p.thumb) problems.push(`faltan archivos en ${p.id}`);
    if (![0, 90, 180, 270].includes(p.rotation)) problems.push(`rotación inválida en ${p.id}`);
    if (p.fitMode !== 'contain' && p.fitMode !== 'cover') problems.push(`modo inválido en ${p.id}`);
  }
  return problems;
}

/** width/height as displayed, taking rotation into account */
export function displayAspect(p: Pick<Photo, 'width' | 'height' | 'rotation'>): number {
  const sideways = p.rotation === 90 || p.rotation === 270;
  return sideways ? p.height / p.width : p.width / p.height;
}
