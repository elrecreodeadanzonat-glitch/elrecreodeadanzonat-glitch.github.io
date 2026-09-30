import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeFields, encodeFields, isImageDataUrl, normalizeCode, toCloudComment, toCloudPhoto, addComment, moderate, checkCode } from './cloud';
import { CloudStore, cloudPhotoAsPage, commentsByPhoto } from './cloudStore';
import { timeAgo } from './timeAgo';

const IMG = 'data:image/webp;base64,UklGRiQAAABXRUJQ';
const doc = (name: string, fields: Record<string, unknown>) => ({ name: `projects/p/databases/(default)/documents/${name}`, fields: encodeFields(fields as Record<string, string | number | boolean>) });

afterEach(() => vi.unstubAllGlobals());

describe('Firestore values', () => {
  it('round-trips strings, integers, doubles and booleans', () => {
    const f = encodeFields({ a: 'x', b: 3, c: 1.5, d: true });
    expect(f).toEqual({ a: { stringValue: 'x' }, b: { integerValue: '3' }, c: { doubleValue: 1.5 }, d: { booleanValue: true } });
    expect(decodeFields(f)).toEqual({ a: 'x', b: 3, c: 1.5, d: true });
    expect(decodeFields({ t: { timestampValue: '2026-09-30T10:00:00.123456Z' } })).toEqual({ t: '2026-09-30T10:00:00.123456Z' });
  });

  it('only accepts raster data: URLs for images', () => {
    expect(isImageDataUrl(IMG)).toBe(true);
    expect(isImageDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(isImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isImageDataUrl('javascript:alert(1)')).toBe(false);
    expect(isImageDataUrl('https://example.com/a.webp')).toBe(false);
  });

  it('turns documents into photos and comments, dropping bad ones', () => {
    const p = toCloudPhoto(doc('photos/cabc', { thumb: IMG, width: 1600, height: 1200, color: '#aabbcc', author: 'Rosa', caption: '', rotation: 90, hidden: false, createdAt: '2026-09-30T10:00:00Z' }));
    expect(p).toMatchObject({ id: 'cabc', author: 'Rosa', rotation: 90, width: 1600, hidden: false });
    expect(toCloudPhoto(doc('photos/x', { thumb: 'data:image/svg+xml;base64,AAAA' }))).toBeNull();
    const weird = toCloudPhoto(doc('photos/y', { thumb: IMG, rotation: 45, color: 'red' }))!;
    expect(weird.rotation).toBe(0);
    expect(weird.color).toBe('#8a6f5c');
    expect(toCloudComment(doc('comments/k1', { photoId: 'p001', text: 'Hola', author: 'Tío', hidden: false }))).toMatchObject({ id: 'k1', photoId: 'p001', text: 'Hola' });
    expect(toCloudComment(doc('comments/k2', { photoId: 'p001', text: '' }))).toBeNull();
  });

  it('normalises the family code however it is typed', () => {
    expect(normalizeCode(' abcd-efgh jk23 ')).toBe('ABCDEFGHJK23');
  });
});

function mockFetch(handler: (url: string, body: unknown) => { status?: number; json: unknown }) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const r = handler(url, body);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  }));
  return calls;
}

describe('writes', () => {
  it('adds a comment with a server timestamp and returns it', async () => {
    const calls = mockFetch(() => ({ json: { commitTime: 'T', writeResults: [{ transformResults: [{ timestampValue: '2026-09-30T10:00:00.5Z' }] }] } }));
    const c = await addComment({ photoId: 'p007', text: '  ¡Qué linda!  ', author: ' Rosa ' });
    expect(c).toMatchObject({ photoId: 'p007', text: '¡Qué linda!', author: 'Rosa', createdAt: '2026-09-30T10:00:00.5Z', hidden: false });
    expect(c.id).toMatch(/^k[a-z0-9]{20}$/);
    const w = (calls[0].body as { writes: { update: { name: string }; updateTransforms: unknown; currentDocument: unknown }[] }).writes[0];
    expect(calls[0].url).toContain(':commit?key=');
    expect(w.update.name).toMatch(/\/documents\/comments\/k[a-z0-9]{20}$/);
    expect(w.currentDocument).toEqual({ exists: false });
    expect(w.updateTransforms).toEqual([{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }]);
  });

  it('moderation sends a fresh modlog entry together with the change', async () => {
    const calls = mockFetch(() => ({ json: { commitTime: 'T' } }));
    await moderate({ kind: 'comments', id: 'kabc' }, { hidden: true }, 'abcd-efgh-jk23');
    const writes = (calls[0].body as { writes: { update: { name: string; fields: Record<string, unknown> }; updateMask?: { fieldPaths: string[] } }[] }).writes;
    expect(writes).toHaveLength(2);
    expect(writes[0].update.name).toMatch(/\/modlog\/m[a-z0-9]{20}$/);
    expect(writes[0].update.fields.key).toEqual({ stringValue: 'ABCDEFGHJK23' });
    expect(writes[0].update.fields.target).toEqual({ stringValue: 'comments/kabc' });
    const modId = writes[0].update.name.split('/').pop();
    expect(writes[1].update.fields).toEqual({ hidden: { booleanValue: true }, modId: { stringValue: modId } });
    expect(writes[1].updateMask).toEqual({ fieldPaths: ['hidden', 'modId'] });
  });

  it('a wrong code is a «no», not an error', async () => {
    mockFetch(() => ({ status: 403, json: { error: { message: 'Missing or insufficient permissions.' } } }));
    expect(await checkCode('XXXX-XXXX-XXXX')).toBe(false);
  });
});

describe('CloudStore', () => {
  it('shows a comment at once and marks it failed (retryable) when offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    const s = new CloudStore();
    const p = s.addComment('p001', 'Hola', 'Ana');
    expect(s.getState().comments).toMatchObject([{ text: 'Hola', status: 'sending' }]);
    await expect(p).rejects.toBeTruthy();
    const [c] = s.getState().comments;
    expect(c.status).toBe('failed');

    mockFetch(() => ({ json: { commitTime: '2026-09-30T10:00:00Z' } }));
    await s.addComment(c.photoId, c.text, c.author, c.id);
    expect(s.getState().comments).toHaveLength(1);
    expect(s.getState().comments[0].status).toBeUndefined();
    expect(s.getState().comments[0].id).toMatch(/^k/);
  });

  it('asks only for what is new, using the server listing as the cursor', async () => {
    let page = 0;
    const calls = mockFetch((url, body) => {
      if (!url.includes(':runQuery')) return { json: {} };
      const col = (body as { structuredQuery: { from: { collectionId: string }[] } }).structuredQuery.from[0].collectionId;
      if (col === 'comments' && page++ === 0) {
        return { json: [{ document: doc('comments/k1', { photoId: 'p001', text: 'uno', author: '', hidden: false, createdAt: '2026-09-30T10:00:00Z' }) }] };
      }
      return { json: [{ readTime: 'x' }] };
    });
    const s = new CloudStore();
    await s.refresh();
    expect(s.getState().comments.map((c) => c.id)).toEqual(['k1']);
    await s.refresh();
    const second = calls.filter((c) => c.url.includes(':runQuery')).slice(2);
    const where = second.map((c) => (c.body as { structuredQuery: { where?: { fieldFilter: { value: { timestampValue: string } } } } }).structuredQuery.where);
    expect(where[1]?.fieldFilter.value.timestampValue).toBe('2026-09-30T10:00:00Z');
    expect(where[0]).toBeUndefined(); // still no photos: ask for all of them
  });

  it('a family photo is a page with its thumbnail until the full image arrives', () => {
    const c = toCloudPhoto(doc('photos/cz', { thumb: IMG, width: 10, height: 20, color: '#000000', author: '', caption: '', rotation: 0, hidden: false, createdAt: 'T' }))!;
    const before = cloudPhotoAsPage(c, { images: {}, imageErrors: {} }, 35);
    expect(before).toMatchObject({ src: IMG, pending: true, order: 35, addedBy: 'la familia' });
    const after = cloudPhotoAsPage(c, { images: { cz: 'data:image/webp;base64,BIG' }, imageErrors: {} }, 35);
    expect(after).toMatchObject({ src: 'data:image/webp;base64,BIG', pending: false });
    expect(cloudPhotoAsPage(c, { images: {}, imageErrors: { cz: true } }, 35).pending).toBe(false);
  });

  it('groups visible comments by photo', () => {
    const m = commentsByPhoto([
      { id: 'a', photoId: 'p1', text: 'x', author: '', createdAt: '1', hidden: false },
      { id: 'b', photoId: 'p1', text: 'y', author: '', createdAt: '2', hidden: true },
      { id: 'c', photoId: 'p2', text: 'z', author: '', createdAt: '3', hidden: false },
    ]);
    expect(m.get('p1')?.map((c) => c.id)).toEqual(['a']);
    expect(m.get('p2')?.length).toBe(1);
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  it('speaks Spanish', () => {
    expect(timeAgo('2026-09-30T11:59:40Z', now)).toBe('ahora');
    expect(timeAgo('2026-09-30T11:55:00Z', now)).toBe('hace 5 minutos');
    expect(timeAgo('2026-09-30T09:00:00Z', now)).toBe('hace 3 horas');
    expect(timeAgo('2026-09-29T11:00:00Z', now)).toBe('ayer');
  });
});
