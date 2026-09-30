import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { SHOTS } from './helpers';
import { TEST_CODE } from './fakeFirestore';

const cards = (page: Page) => page.getByTestId('admin-card');
const ids = async (page: Page) => cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-photo-id')));

test.beforeEach(async ({ browserName }, info) => {
  void browserName;
  test.skip(info.project.name !== 'desktop', 'el editor se prueba en escritorio');
});

test('editor: 34 tarjetas en orden, mover, deshacer/rehacer, quitar y restaurar', async ({ page }) => {
  await page.goto('/admin/');
  await expect(cards(page)).toHaveCount(34);
  expect((await ids(page)).slice(0, 3)).toEqual(['p001', 'p002', 'p003']);
  await expect(page.getByTestId('admin-status')).toHaveText('Todo publicado');
  await page.screenshot({ path: `${SHOTS}/admin-desktop.png` });

  // move the first photo one place to the right
  await cards(page).first().getByRole('button', { name: 'Mover a la derecha' }).click();
  expect((await ids(page)).slice(0, 2)).toEqual(['p002', 'p001']);
  await expect(page.getByTestId('admin-status')).toContainText('Cambios sin publicar');
  await page.getByTestId('undo').click();
  expect((await ids(page)).slice(0, 2)).toEqual(['p001', 'p002']);
  await page.getByTestId('redo').click();
  expect((await ids(page)).slice(0, 2)).toEqual(['p002', 'p001']);
  await page.getByTestId('undo').click();

  // move to end / start
  await cards(page).nth(2).getByRole('button', { name: 'Mover al final' }).click();
  expect((await ids(page)).at(-1)).toBe('p003');
  await cards(page).last().getByRole('button', { name: 'Mover al inicio' }).click();
  expect((await ids(page))[0]).toBe('p003');
  await page.getByTestId('undo').click();
  await page.getByTestId('undo').click();
  expect((await ids(page)).slice(0, 3)).toEqual(['p001', 'p002', 'p003']);

  // hide (with confirmation) -> trash -> restore
  await cards(page).nth(4).getByRole('button', { name: 'Quitar (va a la papelera)' }).click();
  await page.getByTestId('confirm-yes').click();
  await expect(cards(page)).toHaveCount(33);
  await page.getByTestId('trash-tab').click();
  await expect(cards(page)).toHaveCount(1);
  await page.getByTestId('restore').click();
  await page.getByRole('tab', { name: /Fotos/ }).click();
  await expect(cards(page)).toHaveCount(34);
  expect((await ids(page)).at(-1)).toBe('p005');

  // rotate + fit + caption
  await cards(page).first().getByRole('button', { name: 'Rotar 90 grados' }).click();
  await expect(cards(page).first().locator('img')).toHaveAttribute('style', /rotate\(90deg\)/);
  await cards(page).first().getByRole('button', { name: 'Cambiar a Llenar' }).click();
  await cards(page).first().getByLabel('Pie de foto 1').fill('Mamá con todos');
  await cards(page).first().getByLabel('Pie de foto 1').press('Enter');
  await expect(cards(page).first().getByLabel('Pie de foto 1')).toHaveValue('Mamá con todos');

  // preview uses the same viewer
  await page.getByTestId('preview').click();
  await expect(page.locator('.preview-overlay [data-testid=viewer]')).toBeVisible();
  await expect(page.locator('.preview-overlay .caption')).toHaveText('Mamá con todos');
  await page.getByRole('button', { name: 'Cerrar vista previa' }).click();

  // draft survives a reload (IndexedDB) and is offered back
  await page.getByTestId('save-draft').click();
  await expect(page.getByTestId('admin-status')).toContainText('borrador guardado');
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByText('Tienes un borrador sin publicar')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar borrador' }).click();
  await expect(cards(page).first().getByLabel('Pie de foto 1')).toHaveValue('Mamá con todos');
});

test('editor: agregar una foto y publicar (API de GitHub simulada), sin guardar la llave', async ({ page }) => {
  const TOKEN = 'github_pat_TEST_ONLY_do_not_store';
  let newRevision = '';
  const treePaths: string[] = [];
  let authOk = true;
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.headers()['authorization'] !== `Bearer ${TOKEN}`) authOk = false;
    const json = (j: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
    if (url.endsWith('.github.io') && req.method() === 'GET') return json({ permissions: { push: true } });
    if (url.endsWith('/git/ref/heads/main')) return json({ object: { sha: 'base' } });
    if (url.includes('/contents/public/gallery.json')) {
      const live = await (await page.request.get('/gallery.json')).text();
      return json({ content: Buffer.from(live).toString('base64') });
    }
    if (url.endsWith('/git/commits/base')) return json({ tree: { sha: 'tree0' } });
    if (url.endsWith('/git/blobs')) {
      const body = req.postDataJSON();
      const text = Buffer.from(body.content, 'base64').toString('utf8');
      if (text.startsWith('{') && text.includes('"revision"')) newRevision = JSON.parse(text).revision;
      return json({ sha: 'b' + Math.random().toString(36).slice(2) });
    }
    if (url.endsWith('/git/trees')) { for (const t of req.postDataJSON().tree) treePaths.push(t.path); return json({ sha: 'tree1' }); }
    if (url.endsWith('/git/commits')) return json({ sha: 'c1' });
    if (url.endsWith('/git/refs/heads/main')) return json({});
    return route.fulfill({ status: 404, body: '' });
  });
  await page.route('**/gallery.json?live=*', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: newRevision, photos: [] }) }));

  await page.goto('/admin/');
  await expect(page.getByTestId('admin-card')).toHaveCount(34);
  const img = await (await page.request.get('/photos/md/p010.webp')).body();
  await page.getByTestId('file-input').setInputFiles({ name: 'nueva-foto.webp', mimeType: 'image/webp', buffer: img });
  await expect(page.getByTestId('admin-card')).toHaveCount(35, { timeout: 20_000 });
  await expect(page.getByTestId('admin-card').last().getByText('Nueva')).toBeVisible();

  await page.getByTestId('publish').click();
  await page.getByTestId('token-input').fill(TOKEN);
  await page.getByTestId('publish-now').click();
  await expect(page.getByTestId('publish-done')).toContainText('Libro actualizado', { timeout: 30_000 });
  expect(authOk).toBe(true);
  expect(treePaths.filter((p) => p.startsWith('public/photos/'))).toHaveLength(3);
  expect(treePaths).toContain('public/gallery.json');

  // the token must not be persisted anywhere on the device
  const stored = await page.evaluate(async () => {
    const dump = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    const idb = await new Promise<string>((resolve) => {
      const r = indexedDB.open('libro-de-mama-admin');
      r.onsuccess = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('draft')) return resolve('');
        const g = db.transaction('draft').objectStore('draft').getAll();
        g.onsuccess = () => resolve(JSON.stringify(g.result));
      };
      r.onerror = () => resolve('');
    });
    return dump + idb + document.cookie;
  });
  expect(stored).not.toContain(TOKEN);
});

test('editor: comentarios y fotos de la familia; ocultar con el código', async ({ page, cloud }) => {
  const thumb = 'data:image/webp;base64,' + (await (await page.request.get('/photos/thumb/p012.webp')).body()).toString('base64');
  const image = 'data:image/webp;base64,' + (await (await page.request.get('/photos/md/p012.webp')).body()).toString('base64');
  const famId = cloud.seedPhoto({ thumb, image, author: 'Primo Juan' });
  cloud.seedComment('p001', 'Qué bonita', 'Ana');
  const spamId = cloud.seedComment('p001', 'compra aquí', 'Spam');
  cloud.seedComment(famId, '¡Esta la tomé yo!', 'Primo Juan');

  await page.goto('/admin/');
  await expect(cards(page)).toHaveCount(34);
  const first = cards(page).first();
  await expect(first.getByTestId('card-comments')).toHaveText('2');
  await first.getByTestId('card-comments').click();
  const sheet = page.getByTestId('comments');
  await expect(sheet.getByTestId('comment')).toHaveCount(2);

  // hide the spam: asks for the family code (a wrong one is refused)
  await sheet.getByTestId('comment').filter({ hasText: 'compra aquí' }).getByTestId('comment-moderate').click();
  await expect(page.getByTestId('modcode')).toBeVisible();
  await page.getByTestId('modcode-input').fill('AAAA-BBBB-CCCC');
  await page.getByTestId('modcode-ok').click();
  await expect(page.getByTestId('modcode')).toContainText('no es correcto');
  await page.getByTestId('modcode-input').fill(TEST_CODE.toLowerCase());
  await page.getByTestId('modcode-ok').click();
  await expect(page.getByTestId('modcode')).toHaveCount(0);
  await expect(sheet.getByTestId('comment').filter({ hasText: 'compra aquí' })).toContainText('Oculto');
  expect(cloud.list('comments').find((c) => c.id === spamId)).toMatchObject({ hidden: true });
  await page.screenshot({ path: `${SHOTS}/admin-comentarios-desktop.png` });
  await page.getByTestId('comments-close').click();
  await expect(first.getByTestId('card-comments')).toHaveText('1');

  // family tab: the photo added from the book, its comment, hide (code already known this tab) and show again
  await page.getByTestId('family-tab').click();
  const fam = page.getByTestId('family-card');
  await expect(fam).toHaveCount(1);
  await expect(fam).toContainText('Primo Juan');
  await expect(fam.locator('.num')).toHaveText('35');
  await page.screenshot({ path: `${SHOTS}/admin-familia-desktop.png` });
  await fam.getByTestId('family-hide').click();
  await page.getByTestId('confirm-yes').click();
  await expect(fam.locator('.num')).toHaveText('Oculta');
  expect(cloud.list('photos')[0]).toMatchObject({ hidden: true });
  await expect(page.getByTestId('modcode')).toHaveCount(0);
  await fam.getByTestId('family-show').click();
  await expect(fam.locator('.num')).toHaveText('35');
  await fam.getByRole('button', { name: 'Rotar 90 grados' }).click();
  await expect(fam.locator('img')).toHaveAttribute('style', /rotate\(90deg\)/);
  expect(cloud.list('photos')[0]).toMatchObject({ hidden: false, rotation: 90 });

  // the code is never stored on the device
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
  expect(stored).not.toContain(TEST_CODE.replace(/-/g, ''));

  // the book: spam gone, family photo at the end
  await page.goto('/');
  await page.getByTestId('open-book').click();
  await expect(page.getByTestId('comments-count')).toHaveText('1');
  await page.getByTestId('thumbs-toggle').click();
  await page.getByRole('button', { name: 'Ir a la foto 35', exact: true }).click();
  await expect(page.getByTestId('counter')).toHaveText('Foto 35 de 35');
  await expect(page.locator('.shared-by')).toHaveText('Compartida por Primo Juan');
  await expect(page.getByTestId('comments-open')).toContainText('Primo Juan: ¡Esta la tomé yo!');
});
