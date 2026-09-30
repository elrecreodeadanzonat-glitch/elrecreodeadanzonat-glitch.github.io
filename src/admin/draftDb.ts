import type { Photo } from '../lib/types';

/**
 * Local draft (this device only) kept in IndexedDB: the edited photo list plus the image blobs of photos
 * added but not yet published. This is NOT publishing — other people only see changes after "Publicar cambios".
 */
export interface Draft {
  baseRevision: string;
  photos: Photo[];
  savedAt: string;
}

const DB = 'libro-de-mama-admin';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('draft')) db.createObjectStore('draft');
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    let result: T | undefined;
    if (req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => { db.close(); resolve(result); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  });
}

export const loadDraft = () => tx<Draft>('draft', 'readonly', (s) => s.get('current') as IDBRequest<Draft>);
export const saveDraft = (d: Draft) => tx('draft', 'readwrite', (s) => { s.put(d, 'current'); });
export const clearDraft = async () => {
  await tx('draft', 'readwrite', (s) => { s.clear(); });
  await tx('blobs', 'readwrite', (s) => { s.clear(); });
};
export const putBlob = (key: string, b: Blob) => tx('blobs', 'readwrite', (s) => { s.put(b, key); });
export const getBlob = (key: string) => tx<Blob>('blobs', 'readonly', (s) => s.get(key) as IDBRequest<Blob>);
