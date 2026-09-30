import type { FitMode, FocalPoint, Photo } from '../lib/types';
import { moveItem, renumber, rotateBy90, sortByOrder } from '../lib/gallery';

/** Editor state with undo/redo. `photos` is always kept renumbered (visible first, hidden after). */
export interface History {
  past: Photo[][];
  present: Photo[];
  future: Photo[][];
}

export type Op =
  | { type: 'reorder'; activeId: string; overId: string }
  | { type: 'move'; id: string; to: 'left' | 'right' | 'start' | 'end' }
  | { type: 'hide'; ids: string[] }
  | { type: 'restore'; id: string }
  | { type: 'rotate'; id: string }
  | { type: 'fit'; id: string; fitMode: FitMode }
  | { type: 'focal'; id: string; focalPoint: FocalPoint }
  | { type: 'caption'; id: string; caption: string }
  | { type: 'add'; photos: Photo[] };

export type Action = Op | { type: 'undo' } | { type: 'redo' } | { type: 'load'; photos: Photo[] };

const LIMIT = 80;

export function initHistory(photos: Photo[]): History {
  return { past: [], present: renumber(sortByOrder(photos)), future: [] };
}

const visible = (ps: Photo[]) => ps.filter((p) => !p.hidden);
const hidden = (ps: Photo[]) => ps.filter((p) => p.hidden);
const patch = (ps: Photo[], id: string, f: (p: Photo) => Photo) => ps.map((p) => (p.id === id ? f(p) : p));

/** Apply a single editing operation (pure). Returns the same array if nothing changed. */
export function applyOp(ps: Photo[], op: Op): Photo[] {
  switch (op.type) {
    case 'reorder': {
      const v = visible(ps);
      const from = v.findIndex((p) => p.id === op.activeId);
      const to = v.findIndex((p) => p.id === op.overId);
      if (from < 0 || to < 0 || from === to) return ps;
      return renumber([...moveItem(v, from, to), ...hidden(ps)]);
    }
    case 'move': {
      const v = visible(ps);
      const from = v.findIndex((p) => p.id === op.id);
      if (from < 0) return ps;
      const to = op.to === 'left' ? from - 1 : op.to === 'right' ? from + 1 : op.to === 'start' ? 0 : v.length - 1;
      if (to < 0 || to >= v.length || to === from) return ps;
      return renumber([...moveItem(v, from, to), ...hidden(ps)]);
    }
    case 'hide': {
      if (!op.ids.length) return ps;
      const set = new Set(op.ids);
      const v = visible(ps).filter((p) => !set.has(p.id));
      const newlyHidden = visible(ps).filter((p) => set.has(p.id)).map((p) => ({ ...p, hidden: true }));
      if (!newlyHidden.length) return ps;
      return renumber([...v, ...newlyHidden, ...hidden(ps)]);
    }
    case 'restore': {
      const p = ps.find((x) => x.id === op.id);
      if (!p || !p.hidden) return ps;
      return renumber([...visible(ps), { ...p, hidden: false }, ...hidden(ps).filter((x) => x.id !== op.id)]);
    }
    case 'rotate':
      return patch(ps, op.id, (p) => ({ ...p, rotation: rotateBy90(p.rotation) }));
    case 'fit':
      return patch(ps, op.id, (p) => (p.fitMode === op.fitMode ? p : { ...p, fitMode: op.fitMode }));
    case 'focal':
      return patch(ps, op.id, (p) => ({ ...p, focalPoint: { x: clamp01(op.focalPoint.x), y: clamp01(op.focalPoint.y) } }));
    case 'caption': {
      const cur = ps.find((p) => p.id === op.id);
      if (!cur || cur.caption === op.caption) return ps;
      return patch(ps, op.id, (p) => ({ ...p, caption: op.caption }));
    }
    case 'add':
      if (!op.photos.length) return ps;
      return renumber([...visible(ps), ...op.photos.map((p) => ({ ...p, hidden: false })), ...hidden(ps)]);
  }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function historyReducer(h: History, a: Action): History {
  switch (a.type) {
    case 'undo':
      if (!h.past.length) return h;
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
    case 'redo':
      if (!h.future.length) return h;
      return { past: [...h.past, h.present].slice(-LIMIT), present: h.future[0], future: h.future.slice(1) };
    case 'load':
      return initHistory(a.photos);
    default: {
      const next = applyOp(h.present, a);
      if (next === h.present) return h;
      return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
    }
  }
}

/** true when the edited photos differ from the published ones */
export function isDirty(published: Photo[], current: Photo[]): boolean {
  return JSON.stringify(renumber(sortByOrder(published))) !== JSON.stringify(current);
}
