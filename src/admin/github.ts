import type { Gallery, Photo } from '../lib/types';
import { validateGallery } from '../lib/gallery';
import { REPO } from '../config';

/**
 * Publishes the edited gallery to the GitHub repository in ONE commit (Git Data API):
 * new image files + public/gallery.json. The push triggers the Pages workflow, which redeploys the site.
 * The token is only held in memory by the caller and sent only to api.github.com.
 */
const API = 'https://api.github.com';

export interface NewFile {
  /** repo path, e.g. public/photos/full/n123.webp */
  path: string;
  blob: Blob;
}

export type Step = 'validate' | 'upload' | 'commit' | 'deploy' | 'done';

export class PublishError extends Error {
  constructor(message: string, public readonly kind: 'auth' | 'conflict' | 'network' | 'invalid' | 'other' = 'other') {
    super(message);
  }
}

type Fetch = typeof fetch;

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function gh<T>(f: Fetch, token: string, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await f(`${API}/repos/${REPO.owner}/${REPO.name}${path}`, { method, headers: headers(token), body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new PublishError('No hay conexión con GitHub. Revisa internet e inténtalo de nuevo.', 'network');
  }
  if (res.status === 401) throw new PublishError('La llave de GitHub no es válida o ya venció.', 'auth');
  if (res.status === 403 || res.status === 404) {
    throw new PublishError('La llave no tiene permiso para escribir en este repositorio (necesita «Contents: Read and write» sobre este repositorio).', 'auth');
  }
  if (res.status === 409 || res.status === 422) {
    const t = await res.text().catch(() => '');
    throw new PublishError(`GitHub rechazó el cambio (${res.status}). ${t.slice(0, 160)}`, res.status === 422 && /fast forward/i.test(t) ? 'conflict' : 'other');
  }
  if (!res.ok) throw new PublishError(`Error de GitHub (${res.status}).`, 'other');
  return (await res.json()) as T;
}

export async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < buf.length; i += CH) s += String.fromCharCode(...buf.subarray(i, i + CH));
  return btoa(s);
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function base64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function newRevision(): string {
  return `${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Check the token can read the repo (and fail early with a friendly message). */
export async function checkToken(token: string, f: Fetch = fetch): Promise<void> {
  const repo = await gh<{ permissions?: { push?: boolean } }>(f, token, 'GET', '');
  if (repo.permissions && repo.permissions.push === false) {
    throw new PublishError('Esta cuenta no puede publicar en el repositorio.', 'auth');
  }
}

export interface PublishResult {
  commitSha: string;
  revision: string;
}

export async function publishGallery(
  opts: { token: string; photos: Photo[]; newFiles: NewFile[]; baseRevision: string; onStep?: (s: Step, detail?: string) => void },
  f: Fetch = fetch,
): Promise<PublishResult> {
  const { token, photos, newFiles, baseRevision, onStep } = opts;
  onStep?.('validate');
  const revision = newRevision();
  const gallery: Gallery = { version: 1, revision, updatedAt: revision.slice(0, 20), photos };
  const problems = validateGallery(gallery);
  if (problems.length) throw new PublishError('Hay un problema con las fotos: ' + problems.join('; '), 'invalid');

  const ref = await gh<{ object: { sha: string } }>(f, token, 'GET', '/git/ref/heads/main');
  const baseSha = ref.object.sha;
  // refuse to overwrite a newer publication made from another device
  const remote = await gh<{ content: string }>(f, token, 'GET', `/contents/public/gallery.json?ref=${baseSha}`);
  const remoteGallery = JSON.parse(base64ToUtf8(remote.content)) as Gallery;
  if (remoteGallery.revision !== baseRevision) {
    throw new PublishError('Alguien publicó cambios desde otro dispositivo. Recarga el editor para partir de la versión más reciente.', 'conflict');
  }
  const baseCommit = await gh<{ tree: { sha: string } }>(f, token, 'GET', `/git/commits/${baseSha}`);

  const tree: { path: string; mode: '100644'; type: 'blob'; sha?: string; content?: string }[] = [];
  let i = 0;
  for (const nf of newFiles) {
    i += 1;
    onStep?.('upload', `${i} de ${newFiles.length}`);
    const blob = await gh<{ sha: string }>(f, token, 'POST', '/git/blobs', { content: await blobToBase64(nf.blob), encoding: 'base64' });
    tree.push({ path: nf.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const json = JSON.stringify(gallery, null, 2) + '\n';
  const galleryBlob = await gh<{ sha: string }>(f, token, 'POST', '/git/blobs', { content: utf8ToBase64(json), encoding: 'base64' });
  tree.push({ path: 'public/gallery.json', mode: '100644', type: 'blob', sha: galleryBlob.sha });

  onStep?.('commit');
  const newTree = await gh<{ sha: string }>(f, token, 'POST', '/git/trees', { base_tree: baseCommit.tree.sha, tree });
  const visible = photos.filter((p) => !p.hidden).length;
  const commit = await gh<{ sha: string }>(f, token, 'POST', '/git/commits', {
    message: `content: update Libro de mamá (${visible} fotos visibles${newFiles.length ? `, ${newFiles.length / 3} nuevas` : ''})`,
    tree: newTree.sha,
    parents: [baseSha],
  });
  await gh(f, token, 'PATCH', '/git/refs/heads/main', { sha: commit.sha, force: false });
  return { commitSha: commit.sha, revision };
}

/** Poll the public site until the new gallery.json is live (GitHub Pages usually takes 1–3 minutes). */
export async function waitForLive(revision: string, opts: { timeoutMs?: number; intervalMs?: number; onTick?: (seconds: number) => void } = {}, f: Fetch = fetch): Promise<boolean> {
  const { timeoutMs = 8 * 60_000, intervalMs = 6000, onTick } = opts;
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await f(`${import.meta.env.BASE_URL}gallery.json?live=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const g = (await res.json()) as Gallery;
        if (g.revision === revision) return true;
      }
    } catch {
      /* keep polling */
    }
    onTick?.(Math.round((Date.now() - t0) / 1000));
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
