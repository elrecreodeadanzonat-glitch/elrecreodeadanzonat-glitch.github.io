import { describe, expect, it } from 'vitest';
import type { Photo } from '../lib/types';
import { applyOp, historyReducer, initHistory, isDirty } from './store';

const base = (id: string, order: number): Photo => ({
  id, order, src: `photos/full/${id}.webp`, srcMd: `photos/md/${id}.webp`, thumb: `photos/thumb/${id}.webp`, width: 100, height: 80,
  originalFilename: `${id}.png`, caption: '', alt: '', fitMode: 'contain', rotation: 0, focalPoint: { x: 0.5, y: 0.5 }, hidden: false, createdAt: '',
});
const photos = ['a', 'b', 'c', 'd'].map((id, i) => base(id, i + 1));
const ids = (ps: Photo[]) => ps.filter((p) => !p.hidden).map((p) => p.id).join('');

describe('editor operations', () => {
  it('reorders by drag (active onto over)', () => {
    expect(ids(applyOp(photos, { type: 'reorder', activeId: 'a', overId: 'c' }))).toBe('bcad');
  });

  it('moves left / right / start / end and renumbers', () => {
    expect(ids(applyOp(photos, { type: 'move', id: 'c', to: 'left' }))).toBe('acbd');
    expect(ids(applyOp(photos, { type: 'move', id: 'b', to: 'right' }))).toBe('acbd');
    expect(ids(applyOp(photos, { type: 'move', id: 'd', to: 'start' }))).toBe('dabc');
    const end = applyOp(photos, { type: 'move', id: 'a', to: 'end' });
    expect(ids(end)).toBe('bcda');
    expect(end.map((p) => p.order)).toEqual([1, 2, 3, 4]);
  });

  it('ignores impossible moves (no history entry)', () => {
    expect(applyOp(photos, { type: 'move', id: 'a', to: 'left' })).toBe(photos);
  });

  it('hides (soft delete) and restores at the end', () => {
    const hid = applyOp(photos, { type: 'hide', ids: ['b'] });
    expect(ids(hid)).toBe('acd');
    expect(hid.find((p) => p.id === 'b')!.hidden).toBe(true);
    expect(hid).toHaveLength(4); // nothing is deleted
    const back = applyOp(hid, { type: 'restore', id: 'b' });
    expect(ids(back)).toBe('acdb');
  });

  it('rotates, sets fit mode, focal point (clamped) and caption', () => {
    let ps = applyOp(photos, { type: 'rotate', id: 'a' });
    expect(ps[0].rotation).toBe(90);
    ps = applyOp(ps, { type: 'fit', id: 'a', fitMode: 'cover' });
    expect(ps[0].fitMode).toBe('cover');
    ps = applyOp(ps, { type: 'focal', id: 'a', focalPoint: { x: 1.4, y: -1 } });
    expect(ps[0].focalPoint).toEqual({ x: 1, y: 0 });
    ps = applyOp(ps, { type: 'caption', id: 'a', caption: 'Cumpleaños' });
    expect(ps[0].caption).toBe('Cumpleaños');
  });

  it('adds new photos after the visible ones', () => {
    const hid = applyOp(photos, { type: 'hide', ids: ['d'] });
    const added = applyOp(hid, { type: 'add', photos: [base('n', 99)] });
    expect(ids(added)).toBe('abcn');
    expect(added.map((p) => [p.id, p.order])).toEqual([['a', 1], ['b', 2], ['c', 3], ['n', 4], ['d', 5]]);
  });
});

describe('undo / redo', () => {
  it('walks back and forth through changes', () => {
    let h = initHistory(photos);
    h = historyReducer(h, { type: 'move', id: 'a', to: 'end' });
    h = historyReducer(h, { type: 'rotate', id: 'b' });
    expect(ids(h.present)).toBe('bcda');
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.find((p) => p.id === 'b')!.rotation).toBe(0);
    h = historyReducer(h, { type: 'undo' });
    expect(ids(h.present)).toBe('abcd');
    h = historyReducer(h, { type: 'redo' });
    expect(ids(h.present)).toBe('bcda');
    h = historyReducer(h, { type: 'caption', id: 'c', caption: 'x' });
    expect(h.future).toHaveLength(0);
  });

  it('isDirty compares with the published list', () => {
    const h = historyReducer(initHistory(photos), { type: 'rotate', id: 'a' });
    expect(isDirty(photos, initHistory(photos).present)).toBe(false);
    expect(isDirty(photos, h.present)).toBe(true);
  });
});
