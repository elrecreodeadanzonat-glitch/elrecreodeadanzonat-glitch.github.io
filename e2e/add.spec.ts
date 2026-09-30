import { expect, test, type Page } from '@playwright/test';
import { SHOTS, currentPhoto, openBook } from './helpers';

const TOKEN = 'github_pat_TEST_ONLY_do_not_store';

/** Fake GitHub + a fake «live» site that already serves what was just published. */
async function mockPublishing(page: Page) {
  const state = { galleryText: '', revision: '' };
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const json = (j: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
    if (req.headers()['authorization'] !== `Bearer ${TOKEN}`) return route.fulfill({ status: 401, body: '' });
    if (url.endsWith('.github.io') && req.method() === 'GET') return json({ permissions: { push: true } });
    if (url.endsWith('/git/ref/heads/main')) return json({ object: { sha: 'base' } });
    if (url.includes('/contents/public/gallery.json')) {
      const live = await (await page.request.get('/gallery.json')).text();
      return json({ content: Buffer.from(live).toString('base64') });
    }
    if (url.endsWith('/git/commits/base')) return json({ tree: { sha: 'tree0' } });
    if (url.endsWith('/git/blobs')) {
      const text = Buffer.from(req.postDataJSON().content, 'base64').toString('utf8');
      if (text.startsWith('{') && text.includes('"revision"')) {
        state.galleryText = text;
        state.revision = JSON.parse(text).revision;
      }
      return json({ sha: 'b' + Math.random().toString(36).slice(2) });
    }
    if (url.endsWith('/git/trees')) return json({ sha: 'tree1' });
    if (url.endsWith('/git/commits')) return json({ sha: 'c1' });
    if (url.endsWith('/git/refs/heads/main')) return json({});
    return route.fulfill({ status: 404, body: '' });
  });
  const isSiteGallery = (u: URL) => u.hostname !== 'api.github.com' && u.pathname.endsWith('/gallery.json');
  await page.route(isSiteGallery, async (route) => {
    if (!state.galleryText) return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: state.galleryText });
  });
  const sample = await (await page.request.get('/photos/md/p010.webp')).body();
  await page.route(/\/photos\/(full|md|thumb)\/n[a-z0-9]+\.(webp|jpg)$/, (route) => route.fulfill({ status: 200, contentType: 'image/webp', body: sample }));
  return { sample };
}

test('«+» al final del carrusel: agregar una foto y publicarla', async ({ page }, info) => {
  const { sample } = await mockPublishing(page);
  await openBook(page);
  await currentPhoto(page);
  await page.getByTestId('thumbs-toggle').click();
  const tile = page.getByTestId('add-photo-tile');
  await expect(tile).toBeVisible();
  // it is the last item of the carousel, right after photo 34
  const lastTwo = await page.locator('.tray-list > button').evaluateAll((els) => els.slice(-2).map((e) => e.getAttribute('aria-label')));
  expect(lastTwo).toEqual(['Ir a la foto 34', 'Agregar fotos al libro']);
  await tile.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/carrusel-mas-${info.project.name}.png` });

  await page.getByTestId('add-input').setInputFiles({ name: 'foto-nueva.webp', mimeType: 'image/webp', buffer: sample });
  const sheet = page.getByTestId('add-photos');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.add-grid img')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByTestId('add-publish')).toHaveText(/Publicar 1 foto/);
  // autoplay is stopped while the sheet is open
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/agregar-fotos-${info.project.name}.png` });

  await page.getByTestId('add-publish').click();
  await page.getByTestId('token-input').fill(TOKEN);
  await page.getByTestId('publish-now').click();
  await expect(page.getByTestId('publish-done')).toContainText('Libro actualizado', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByTestId('counter')).toHaveText('Foto 35 de 35');
  expect(await currentPhoto(page)).toMatch(/^n/);

  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
  expect(stored).not.toContain(TOKEN);
});

test('«+» → guardar y seguir en el editor', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'basta en un tamaño');
  const sample = await (await page.request.get('/photos/md/p010.webp')).body();
  await openBook(page);
  await currentPhoto(page);
  await page.getByTestId('thumbs-toggle').click();
  await page.getByTestId('add-input').setInputFiles([
    { name: 'a.webp', mimeType: 'image/webp', buffer: sample },
    { name: 'b.webp', mimeType: 'image/webp', buffer: sample },
  ]);
  await expect(page.getByTestId('add-photos').locator('.add-grid img')).toHaveCount(2, { timeout: 20_000 });
  // remove one before saving
  await page.getByRole('button', { name: 'Quitar b.webp' }).click();
  await expect(page.getByTestId('add-photos').locator('.add-grid img')).toHaveCount(1);
  await page.getByTestId('add-to-editor').click();
  await page.waitForURL('**/admin/');
  await expect(page.getByText('Tienes un borrador sin publicar')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar borrador' }).click();
  await expect(page.getByTestId('admin-card')).toHaveCount(35);
  await expect(page.getByTestId('admin-card').last().getByText('Nueva')).toBeVisible();
});
