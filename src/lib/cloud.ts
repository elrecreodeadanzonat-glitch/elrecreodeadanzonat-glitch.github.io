import { FIREBASE } from '../config';
import type { Rotation } from './types';

/**
 * Tiny Firestore REST client for what the family adds from the book: photos and comments.
 * Unauthenticated (API key only); firestore.rules decides what is allowed.
 */

export interface CloudPhoto {
  id: string;
  createdAt: string;
  author: string;
  caption: string;
  width: number;
  height: number;
  color: string;
  /** small data: URL (≈ 320 px) */
  thumb: string;
  rotation: Rotation;
  hidden: boolean;
}

export interface CloudComment {
  id: string;
  photoId: string;
  text: string;
  author: string;
  createdAt: string;
  hidden: boolean;
}

export type ModTarget = { kind: 'comments' | 'photos'; id: string };

export class CloudError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'CloudError';
    this.status = status;
  }
}

export const LIMITS = { comment: 1000, author: 60, caption: 300, image: 1_000_000, thumb: 60_000 } as const;

const ROOT = `projects/${FIREBASE.projectId}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${ROOT}`;

type Value =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { nullValue: null };
type Fields = Record<string, Value>;
interface Doc { name: string; fields?: Fields }
interface Write {
  update: Doc;
  currentDocument?: { exists: boolean };
  updateMask?: { fieldPaths: string[] };
  updateTransforms?: { fieldPath: string; setToServerValue: 'REQUEST_TIME' }[];
}
type Plain = string | number | boolean | null;

export function encodeFields(obj: Record<string, string | number | boolean>): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[k] = { stringValue: v };
    else if (typeof v === 'boolean') out[k] = { booleanValue: v };
    else if (Number.isInteger(v)) out[k] = { integerValue: String(v) };
    else out[k] = { doubleValue: v };
  }
  return out;
}

export function decodeFields(fields: Fields = {}): Record<string, Plain> {
  const out: Record<string, Plain> = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue' in v) out[k] = v.doubleValue;
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('timestampValue' in v) out[k] = v.timestampValue;
    else out[k] = null;
  }
  return out;
}

const str = (v: Plain | undefined, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: Plain | undefined, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const idOf = (name: string) => name.slice(name.lastIndexOf('/') + 1);

/** only raster images we produced ourselves are ever put into an <img> */
export const isImageDataUrl = (s: string) => /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s);

export function toCloudPhoto(doc: Doc): CloudPhoto | null {
  const d = decodeFields(doc.fields);
  const thumb = str(d.thumb);
  if (!isImageDataUrl(thumb)) return null;
  const rot = num(d.rotation);
  const color = str(d.color);
  return {
    id: idOf(doc.name),
    createdAt: str(d.createdAt),
    author: str(d.author).slice(0, LIMITS.author),
    caption: str(d.caption).slice(0, LIMITS.caption),
    width: Math.max(1, num(d.width, 1)),
    height: Math.max(1, num(d.height, 1)),
    color: /^#[0-9a-f]{6}$/.test(color) ? color : '#8a6f5c',
    thumb,
    rotation: ([0, 90, 180, 270].includes(rot) ? rot : 0) as Rotation,
    hidden: d.hidden === true,
  };
}

export function toCloudComment(doc: Doc): CloudComment | null {
  const d = decodeFields(doc.fields);
  const text = str(d.text);
  if (!text) return null;
  return {
    id: idOf(doc.name),
    photoId: str(d.photoId),
    text: text.slice(0, LIMITS.comment),
    author: str(d.author).slice(0, LIMITS.author),
    createdAt: str(d.createdAt),
    hidden: d.hidden === true,
  };
}

export function newId(prefix: 'c' | 'k' | 'm'): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, (x) => '0123456789abcdefghijklmnopqrstuvwxyz'[x % 36]).join('');
}

/** the family code, as typed: spaces, dashes and case do not matter */
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

async function request<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(
      `${API}${path}?key=${FIREBASE.apiKey}`,
      body === undefined
        ? { cache: 'no-store' }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
  } catch {
    throw new CloudError('Sin conexión a internet', 0);
  }
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      message = ((await res.json()) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      /* not JSON */
    }
    throw new CloudError(message, res.status);
  }
  return (await res.json()) as T;
}

const created = (path: string, fields: Record<string, string | number | boolean>): Write => ({
  update: { name: `${ROOT}/${path}`, fields: encodeFields(fields) },
  currentDocument: { exists: false },
  updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
});

interface CommitResult { commitTime: string; writeResults?: { transformResults?: Value[] }[] }

async function commit(writes: Write[]): Promise<CommitResult> {
  return request<CommitResult>(':commit', { writes });
}

const createdAtOf = (r: CommitResult, i = 0) => {
  const v = r.writeResults?.[i]?.transformResults?.[0];
  return v && 'timestampValue' in v ? v.timestampValue : r.commitTime;
};

/** every document of a collection created after `after` (oldest first), page by page */
async function queryAfter(collectionId: string, after: string | undefined, pageSize: number): Promise<Doc[]> {
  const out: Doc[] = [];
  let cursor = after;
  for (let page = 0; page < 50; page++) {
    const rows = await request<{ document?: Doc }[]>(':runQuery', {
      structuredQuery: {
        from: [{ collectionId }],
        ...(cursor
          ? { where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN', value: { timestampValue: cursor } } } }
          : {}),
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }],
        limit: pageSize,
      },
    });
    const docs = rows.flatMap((r) => (r.document ? [r.document] : []));
    out.push(...docs);
    if (docs.length < pageSize) break;
    cursor = str(decodeFields(docs[docs.length - 1].fields).createdAt);
  }
  return out;
}

export async function fetchPhotos(after?: string): Promise<CloudPhoto[]> {
  return (await queryAfter('photos', after, 60)).flatMap((d) => toCloudPhoto(d) ?? []);
}

export async function fetchComments(after?: string): Promise<CloudComment[]> {
  return (await queryAfter('comments', after, 300)).flatMap((d) => toCloudComment(d) ?? []);
}

export async function fetchPhotoImage(id: string): Promise<string> {
  const doc = await request<Doc>(`/photoImages/${encodeURIComponent(id)}`);
  const data = str(decodeFields(doc.fields).data);
  if (!isImageDataUrl(data)) throw new CloudError('Imagen no válida', 422);
  return data;
}

export async function addComment(input: { photoId: string; text: string; author: string }): Promise<CloudComment> {
  const id = newId('k');
  const fields = {
    photoId: input.photoId,
    text: input.text.trim().slice(0, LIMITS.comment),
    author: input.author.trim().slice(0, LIMITS.author),
    hidden: false,
  };
  const res = await commit([created(`comments/${id}`, fields)]);
  return { id, ...fields, createdAt: createdAtOf(res) };
}

export interface NewCloudPhoto {
  image: string;
  thumb: string;
  width: number;
  height: number;
  color: string;
  author: string;
}

/** photo + its image in one commit (the rules require both together) */
export async function addPhoto(p: NewCloudPhoto): Promise<CloudPhoto> {
  const id = newId('c');
  const fields = {
    width: Math.round(p.width),
    height: Math.round(p.height),
    color: p.color,
    thumb: p.thumb,
    author: p.author.trim().slice(0, LIMITS.author),
    caption: '',
    rotation: 0,
    hidden: false,
  };
  const res = await commit([created(`photos/${id}`, fields), created(`photoImages/${id}`, { data: p.image })]);
  return { id, ...fields, rotation: 0, createdAt: createdAtOf(res) };
}

export type ModChange = { hidden: boolean } | { rotation: Rotation };

/** hide / show / rotate — needs the family code (checked by the rules through a fresh modlog entry) */
export async function moderate(target: ModTarget, change: ModChange, code: string): Promise<void> {
  const modId = newId('m');
  const path = `${target.kind}/${target.id}`;
  const action = 'hidden' in change ? (change.hidden ? 'hide' : 'show') : 'rotate';
  await commit([
    created(`modlog/${modId}`, { key: normalizeCode(code), target: path, action }),
    {
      update: { name: `${ROOT}/${path}`, fields: encodeFields({ ...change, modId }) },
      updateMask: { fieldPaths: [...Object.keys(change), 'modId'] },
      currentDocument: { exists: true },
    },
  ]);
}

/** true when the code is right (a harmless «check» entry is written), false when the rules refuse it */
export async function checkCode(code: string): Promise<boolean> {
  try {
    await commit([created(`modlog/${newId('m')}`, { key: normalizeCode(code), target: 'check', action: 'check' })]);
    return true;
  } catch (e) {
    if (e instanceof CloudError && e.status === 403) return false;
    throw e;
  }
}
