import { useSyncExternalStore } from 'react';
import {
  addComment, addPhoto, fetchComments, fetchPhotoImage, fetchPhotos, moderate,
  type CloudComment, type CloudPhoto, type ModChange, type ModTarget, type NewCloudPhoto,
} from './cloud';
import type { Photo } from './types';

export interface LocalComment extends CloudComment {
  /** sent from this device, waiting for the server */
  status?: 'sending' | 'failed';
}

export interface CloudState {
  /** the first load finished (well or not) */
  ready: boolean;
  /** the last request reached the server */
  online: boolean;
  /** everything, hidden ones included, oldest first */
  photos: CloudPhoto[];
  comments: LocalComment[];
  /** full-size data: URLs loaded so far */
  images: Record<string, string>;
  /** images that could not be loaded (the thumbnail is shown instead) */
  imageErrors: Record<string, true>;
}

const POLL_MS = 20_000;

function mergeById<T extends { id: string; createdAt: string }>(cur: T[], incoming: T[]): T[] {
  if (!incoming.length) return cur;
  const map = new Map(cur.map((x) => [x.id, x]));
  for (const x of incoming) map.set(x.id, x);
  return [...map.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/**
 * Photos and comments added by the family (Firestore). One instance per page:
 * loads everything once, then asks every 20 s (while the page is visible) only for what is new.
 */
export class CloudStore {
  private state: CloudState = { ready: false, online: true, photos: [], comments: [], images: {}, imageErrors: {} };
  private subs = new Set<() => void>();
  private timer: number | undefined;
  private started = false;
  private inflight: Promise<void> | null = null;
  private imageLoads = new Map<string, Promise<string>>();
  /** cursors come only from server listings, so a comment written here never hides one written elsewhere just before */
  private cursor: { photos?: string; comments?: string } = {};

  getState = (): CloudState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  };

  private set(patch: Partial<CloudState>) {
    this.state = { ...this.state, ...patch };
    this.subs.forEach((fn) => fn());
  }

  start(): void {
    if (this.started || typeof document === 'undefined') return;
    this.started = true;
    void this.refresh();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.schedule();
  }

  stop(): void {
    this.started = false;
    window.clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = () => {
    if (document.visibilityState === 'visible') {
      void this.refresh();
      this.schedule();
    }
  };

  private schedule() {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (!this.started) return;
      if (document.visibilityState === 'visible') void this.refresh();
      this.schedule();
    }, POLL_MS);
  }

  /** load what is new since the last listing (everything the first time) */
  refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const [photos, comments] = await Promise.all([fetchPhotos(this.cursor.photos), fetchComments(this.cursor.comments)]);
        if (photos.length) this.cursor.photos = photos[photos.length - 1].createdAt;
        if (comments.length) this.cursor.comments = comments[comments.length - 1].createdAt;
        this.set({
          ready: true,
          online: true,
          photos: mergeById(this.state.photos, photos),
          comments: mergeById(this.state.comments, comments),
        });
      } catch {
        this.set({ ready: true, online: false });
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  loadImage(id: string): Promise<string> {
    const have = this.state.images[id];
    if (have) return Promise.resolve(have);
    let p = this.imageLoads.get(id);
    if (!p) {
      p = fetchPhotoImage(id)
        .then((data) => {
          this.set({ images: { ...this.state.images, [id]: data } });
          return data;
        })
        .catch((e: unknown) => {
          this.set({ imageErrors: { ...this.state.imageErrors, [id]: true } });
          throw e;
        })
        .finally(() => this.imageLoads.delete(id));
      this.imageLoads.set(id, p);
    }
    return p;
  }

  /** shows the comment right away; marks it «failed» (retryable) if the server does not take it */
  async addComment(photoId: string, text: string, author: string, retryId?: string): Promise<void> {
    const tempId = retryId ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const temp: LocalComment = { id: tempId, photoId, text: text.trim(), author: author.trim(), createdAt: new Date().toISOString(), hidden: false, status: 'sending' };
    this.set({ comments: [...this.state.comments.filter((c) => c.id !== tempId), temp] });
    try {
      const saved = await addComment({ photoId, text, author });
      this.set({ online: true, comments: mergeById(this.state.comments.filter((c) => c.id !== tempId), [saved]) });
    } catch (e) {
      this.set({ comments: this.state.comments.map((c) => (c.id === tempId ? { ...c, status: 'failed' } : c)) });
      throw e;
    }
  }

  async addPhoto(p: NewCloudPhoto): Promise<CloudPhoto> {
    const saved = await addPhoto(p);
    this.set({
      online: true,
      photos: mergeById(this.state.photos, [saved]),
      images: { ...this.state.images, [saved.id]: p.image },
    });
    return saved;
  }

  async moderate(target: ModTarget, change: ModChange, code: string): Promise<void> {
    await moderate(target, change, code);
    if (target.kind === 'comments') {
      this.set({ comments: this.state.comments.map((c) => (c.id === target.id ? { ...c, ...change } : c)) });
    } else {
      this.set({ photos: this.state.photos.map((p) => (p.id === target.id ? { ...p, ...change } : p)) });
    }
  }
}

const NO_SUBSCRIBE = () => () => undefined;
const NO_STATE = () => null;

export function useCloudState(store: CloudStore | undefined): CloudState | null {
  return useSyncExternalStore(store?.subscribe ?? NO_SUBSCRIBE, store?.getState ?? NO_STATE);
}

/** a family photo as a page of the book (after the photos from gallery.json) */
export function cloudPhotoAsPage(c: CloudPhoto, s: Pick<CloudState, 'images' | 'imageErrors'>, order: number): Photo {
  const image = s.images[c.id];
  return {
    id: c.id,
    order,
    src: image ?? c.thumb,
    thumb: c.thumb,
    width: c.width,
    height: c.height,
    color: c.color,
    originalFilename: '',
    caption: c.caption,
    alt: c.author ? `Foto compartida por ${c.author}` : 'Foto compartida por la familia',
    fitMode: 'contain',
    rotation: c.rotation,
    focalPoint: { x: 0.5, y: 0.5 },
    hidden: c.hidden,
    createdAt: c.createdAt,
    addedBy: c.author || 'la familia',
    pending: !image && !s.imageErrors[c.id],
  };
}

/** visible comments grouped by photo, oldest first */
export function commentsByPhoto(comments: LocalComment[], includeHidden = false): Map<string, LocalComment[]> {
  const m = new Map<string, LocalComment[]>();
  for (const c of comments) {
    if (c.hidden && !includeHidden) continue;
    const list = m.get(c.photoId);
    if (list) list.push(c);
    else m.set(c.photoId, [c]);
  }
  return m;
}
