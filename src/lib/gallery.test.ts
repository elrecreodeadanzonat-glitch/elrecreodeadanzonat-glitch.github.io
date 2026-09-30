import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Gallery, Photo } from './types';
import { displayAspect, moveItem, renumber, rotateBy90, validateGallery, visiblePhotos } from './gallery';

const gallery = JSON.parse(readFileSync(resolve(__dirname, '../../public/gallery.json'), 'utf8')) as Gallery;
// The exact 001..034 checks describe the original book; after the family publishes edits from /admin/ the order may change.
const original = gallery.revision.startsWith('initial-');

describe('published gallery.json', () => {
  it('is valid', () => {
    expect(validateGallery(gallery)).toEqual([]);
  });

  it.runIf(original)('has exactly the 34 photos in the canonical 001..034 order', () => {
    const v = visiblePhotos(gallery);
    expect(v).toHaveLength(34);
    v.forEach((p, i) => {
      const n = String(i + 1).padStart(3, '0');
      expect(p.order).toBe(i + 1);
      expect(p.id).toBe(`p${n}`);
      expect(p.originalFilename.startsWith(`${n}__`)).toBe(true);
    });
  });

  it.runIf(original)('keeps the intentional duplicate of original 25 at positions 20 and 22 and excludes original 02', () => {
    const v = visiblePhotos(gallery);
    expect(v[19].originalFilename).toContain('orig-25');
    expect(v[21].originalFilename).toContain('orig-25');
    expect(v.some((p) => /orig-02__/.test(p.originalFilename))).toBe(false);
  });

  it('points only to files that exist', () => {
    for (const p of gallery.photos) {
      for (const f of [p.src, p.srcMd, p.thumb].filter(Boolean) as string[]) expect(existsSync(resolve(__dirname, '../../public', f)), f).toBe(true);
    }
  });

  it.runIf(original)('starts with fit=contain, no rotation and nothing hidden', () => {
    for (const p of gallery.photos) {
      expect(p.fitMode).toBe('contain');
      expect(p.rotation).toBe(0);
      expect(p.hidden).toBe(false);
    }
  });
});

describe('helpers', () => {
  const mk = (id: string, order: number, hidden = false) => ({ id, order, hidden }) as Photo;

  it('moveItem moves and ignores out-of-range moves', () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveItem([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
  });

  it('renumber keeps visible first then hidden, orders 1..n', () => {
    const r = renumber([mk('a', 9), mk('b', 3, true), mk('c', 1)]);
    expect(r.map((p) => [p.id, p.order])).toEqual([['a', 1], ['c', 2], ['b', 3]]);
  });

  it('visiblePhotos sorts by order and drops hidden', () => {
    expect(visiblePhotos({ photos: [mk('x', 2), mk('y', 1), mk('z', 3, true)] }).map((p) => p.id)).toEqual(['y', 'x']);
  });

  it('rotateBy90 cycles', () => {
    expect([0, 90, 180, 270].map((r) => rotateBy90(r as 0))).toEqual([90, 180, 270, 0]);
  });

  it('displayAspect swaps for sideways rotations', () => {
    expect(displayAspect({ width: 400, height: 200, rotation: 0 })).toBe(2);
    expect(displayAspect({ width: 400, height: 200, rotation: 90 })).toBe(0.5);
  });

  it('validateGallery reports duplicates', () => {
    const bad = { version: 1, revision: 'x', updatedAt: '', photos: [
      { ...gallery.photos[0] }, { ...gallery.photos[0] },
    ] } as Gallery;
    expect(validateGallery(bad).join(' ')).toMatch(/repetido/);
  });
});
