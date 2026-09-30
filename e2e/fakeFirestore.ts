import type { Page, Route } from '@playwright/test';

/** the family code accepted by this fake (the real one is only in the family's private file) */
export const TEST_CODE = 'TSTC-0DE2-3456';
const CODE = TEST_CODE.replace(/-/g, '');

type Value = { stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean; timestampValue?: string };
type Fields = Record<string, Value>;
interface Write {
  update: { name: string; fields: Fields };
  currentDocument?: { exists: boolean };
  updateMask?: { fieldPaths: string[] };
  updateTransforms?: { fieldPath: string }[];
}

const ROOT = 'projects/libro-de-mama/databases/(default)/documents';
const CORS = { 'Access-Control-Allow-Origin': '*' };

/**
 * In-memory stand-in for the Firestore REST API used by the book (commit, runQuery, get),
 * so the browser tests never touch the family's real database. It mimics the parts of the
 * security rules the UI depends on: server timestamps, create-only, and the moderation code.
 */
export class FakeFirestore {
  readonly docs = new Map<string, Fields>();
  private clock = 0;
  /** make the next N commits fail as if the network were down */
  failNext = 0;
  commits = 0;

  async install(page: Page) {
    await page.route('https://firestore.googleapis.com/**', (route) => this.handle(route));
  }

  private tick() {
    // real time, strictly increasing
    this.clock = Math.max(this.clock + 1000, Date.now());
    return new Date(this.clock).toISOString().replace('.000Z', '.123456Z');
  }

  private async handle(route: Route) {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
    const url = new URL(req.url());
    const path = decodeURIComponent(url.pathname).split('/documents').slice(1).join('/documents');
    const json = (status: number, body: unknown) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === ':commit') {
      if (this.failNext > 0) {
        this.failNext--;
        return route.abort('internetdisconnected');
      }
      const r = this.commit(req.postDataJSON().writes as Write[]);
      return json(r.status, r.body);
    }
    if (path === ':runQuery') return json(200, this.runQuery(req.postDataJSON().structuredQuery));
    const key = path.replace(/^\//, '');
    const fields = this.docs.get(key);
    return fields ? json(200, { name: `${ROOT}/${key}`, fields }) : json(404, { error: { message: 'not found' } });
  }

  private commit(writes: Write[]) {
    const t = this.tick();
    const keyOf = (w: Write) => w.update.name.slice(ROOT.length + 1);
    for (const w of writes) {
      const key = keyOf(w);
      if (key.startsWith('admin/')) return { status: 403, body: { error: { message: 'denied' } } };
      if (key.startsWith('modlog/') && w.update.fields.key?.stringValue !== CODE) return { status: 403, body: { error: { message: 'denied' } } };
      if (w.currentDocument?.exists === false && this.docs.has(key)) return { status: 409, body: { error: { message: 'exists' } } };
      if (w.currentDocument?.exists === true && !this.docs.has(key)) return { status: 404, body: { error: { message: 'missing' } } };
    }
    this.commits++;
    for (const w of writes) {
      const key = keyOf(w);
      const next: Fields = w.updateMask ? { ...this.docs.get(key) } : {};
      for (const [k, v] of Object.entries(w.update.fields)) if (!w.updateMask || w.updateMask.fieldPaths.includes(k)) next[k] = v;
      for (const tr of w.updateTransforms ?? []) next[tr.fieldPath] = { timestampValue: t };
      this.docs.set(key, next);
    }
    return { status: 200, body: { commitTime: t, writeResults: writes.map((w) => ({ updateTime: t, transformResults: w.updateTransforms ? [{ timestampValue: t }] : undefined })) } };
  }

  private runQuery(q: { from: { collectionId: string }[]; where?: { fieldFilter: { value: { timestampValue: string } } }; limit?: number }) {
    const col = q.from[0].collectionId;
    const after = q.where?.fieldFilter.value.timestampValue;
    const rows = [...this.docs.entries()]
      .filter(([k]) => k.startsWith(`${col}/`) && k.split('/').length === 2)
      .filter(([, f]) => !after || Date.parse(f.createdAt?.timestampValue ?? '') > Date.parse(after))
      .sort(([, a], [, b]) => Date.parse(a.createdAt?.timestampValue ?? '') - Date.parse(b.createdAt?.timestampValue ?? ''))
      .slice(0, q.limit ?? 1000)
      .map(([k, fields]) => ({ document: { name: `${ROOT}/${k}`, fields }, readTime: 'now' }));
    return rows.length ? rows : [{ readTime: 'now' }];
  }

  // ---- helpers for the tests ----
  list(col: 'comments' | 'photos' | 'photoImages' | 'modlog') {
    return [...this.docs.entries()]
      .filter(([k]) => k.startsWith(`${col}/`))
      .map(([k, f]) => ({ id: k.split('/')[1], ...Object.fromEntries(Object.entries(f).map(([n, v]) => [n, v.stringValue ?? v.booleanValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : v.timestampValue)])) }));
  }

  seedComment(photoId: string, text: string, author: string, hidden = false) {
    const id = `kseed${this.docs.size}${Math.random().toString(36).slice(2, 10)}`;
    this.docs.set(`comments/${id}`, {
      photoId: { stringValue: photoId }, text: { stringValue: text }, author: { stringValue: author },
      hidden: { booleanValue: hidden }, createdAt: { timestampValue: this.tick() },
    });
    return id;
  }

  seedPhoto(opts: { thumb: string; image: string; author: string; width?: number; height?: number }) {
    const id = `cseed${this.docs.size}${Math.random().toString(36).slice(2, 10)}`;
    const t = this.tick();
    this.docs.set(`photos/${id}`, {
      width: { integerValue: String(opts.width ?? 1280) }, height: { integerValue: String(opts.height ?? 853) },
      color: { stringValue: '#9a7a5c' }, thumb: { stringValue: opts.thumb }, author: { stringValue: opts.author },
      caption: { stringValue: '' }, rotation: { integerValue: '0' }, hidden: { booleanValue: false }, createdAt: { timestampValue: t },
    });
    this.docs.set(`photoImages/${id}`, { data: { stringValue: opts.image }, createdAt: { timestampValue: t } });
    return id;
  }
}
