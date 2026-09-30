import { describe, expect, it, vi } from 'vitest';
import type { Gallery, Photo } from '../lib/types';
import { publishGallery, PublishError } from './github';

const TOKEN = 'github_pat_TEST_ONLY_123';
const photo = (id: string, order: number): Photo => ({
  id, order, src: `photos/full/${id}.webp`, srcMd: `photos/md/${id}.webp`, thumb: `photos/thumb/${id}.webp`, width: 10, height: 10,
  originalFilename: `${id}.png`, caption: '', alt: '', fitMode: 'contain', rotation: 0, focalPoint: { x: 0.5, y: 0.5 }, hidden: false, createdAt: '',
});

function mockGitHub(remoteRevision: string) {
  const calls: { method: string; url: string; body?: unknown; auth?: string }[] = [];
  const remote: Gallery = { version: 1, revision: remoteRevision, updatedAt: '', photos: [photo('p001', 1)] };
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body, auth: (init?.headers as Record<string, string>)?.Authorization });
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    if (url.endsWith('/git/ref/heads/main')) return ok({ object: { sha: 'base-sha' } });
    if (url.includes('/contents/public/gallery.json')) return ok({ content: btoa(unescape(encodeURIComponent(JSON.stringify(remote)))) });
    if (url.endsWith('/git/commits/base-sha')) return ok({ tree: { sha: 'base-tree' } });
    if (url.endsWith('/git/blobs')) return ok({ sha: `blob-${calls.length}` });
    if (url.endsWith('/git/trees')) return ok({ sha: 'new-tree' });
    if (url.endsWith('/git/commits')) return ok({ sha: 'new-commit' });
    if (url.endsWith('/git/refs/heads/main')) return ok({});
    return new Response('not found', { status: 404 });
  });
  return { f: f as unknown as typeof fetch, calls };
}

describe('publishGallery', () => {
  it('uploads new files + gallery.json in one commit on top of main', async () => {
    const { f, calls } = mockGitHub('rev-1');
    const photos = [photo('p001', 1), { ...photo('n1', 2) }];
    const newFiles = ['full', 'md', 'thumb'].map((k) => ({ path: `public/photos/${k}/n1.webp`, blob: new Blob(['x']) }));
    const res = await publishGallery({ token: TOKEN, photos, newFiles, baseRevision: 'rev-1' }, f);

    expect(res.commitSha).toBe('new-commit');
    const tree = calls.find((c) => c.url.endsWith('/git/trees'))!.body as { base_tree: string; tree: { path: string }[] };
    expect(tree.base_tree).toBe('base-tree');
    expect(tree.tree.map((t) => t.path)).toEqual([
      'public/photos/full/n1.webp', 'public/photos/md/n1.webp', 'public/photos/thumb/n1.webp', 'public/gallery.json',
    ]);
    const commit = calls.find((c) => c.url.endsWith('/git/commits') && c.method === 'POST')!.body as { parents: string[] };
    expect(commit.parents).toEqual(['base-sha']);
    const ref = calls.find((c) => c.method === 'PATCH')!.body as { sha: string; force: boolean };
    expect(ref).toEqual({ sha: 'new-commit', force: false });
    // the token only travels in the Authorization header, never in a body
    for (const c of calls) {
      expect(c.auth).toBe(`Bearer ${TOKEN}`);
      expect(JSON.stringify(c.body ?? '')).not.toContain(TOKEN);
      expect(c.url.startsWith('https://api.github.com/repos/elrecreodeadanzonat-glitch/elrecreodeadanzonat-glitch.github.io')).toBe(true);
    }
  });

  it('refuses to overwrite a newer publication (conflict)', async () => {
    const { f } = mockGitHub('someone-else');
    await expect(publishGallery({ token: TOKEN, photos: [photo('p001', 1)], newFiles: [], baseRevision: 'rev-1' }, f)).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('rejects an invalid gallery before calling GitHub', async () => {
    const { f, calls } = mockGitHub('rev-1');
    await expect(publishGallery({ token: TOKEN, photos: [photo('a', 1), photo('a', 2)], newFiles: [], baseRevision: 'rev-1' }, f)).rejects.toBeInstanceOf(PublishError);
    expect(calls).toHaveLength(0);
  });

  it('maps 401 to a friendly auth error', async () => {
    const f = (async () => new Response('', { status: 401 })) as unknown as typeof fetch;
    await expect(publishGallery({ token: TOKEN, photos: [photo('p001', 1)], newFiles: [], baseRevision: 'r' }, f)).rejects.toMatchObject({ kind: 'auth' });
  });
});
