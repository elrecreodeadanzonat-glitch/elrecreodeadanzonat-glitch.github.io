import { expect, test } from './fixtures';
import { SHOTS, currentPhoto, openBook } from './helpers';

test('«+» → elegir una foto → «Agregar» → ¡Listo! → el libro la muestra (sin llaves)', async ({ page, cloud }, info) => {
  const sample = await (await page.request.get('/photos/md/p010.webp')).body();
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

  await page.getByTestId('add-input').setInputFiles({ name: 'cumple.webp', mimeType: 'image/webp', buffer: sample });
  const sheet = page.getByTestId('add-photos');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.add-grid img')).toHaveCount(1, { timeout: 20_000 });
  const add = page.getByTestId('add-publish');
  await expect(add).toHaveText('Agregar 1 foto al libro');
  await expect(add).toBeEnabled();
  // nothing to copy, no keys, no accounts
  await expect(page.locator('input[type=password], [data-testid=token-input]')).toHaveCount(0);
  await page.getByTestId('add-name').fill('Tía Rosa');
  await page.screenshot({ path: `${SHOTS}/agregar-fotos-${info.project.name}.png` });

  await add.click();
  await expect(page.getByTestId('add-done')).toContainText('Tu foto ya está en el libro', { timeout: 20_000 });
  await page.screenshot({ path: `${SHOTS}/agregar-listo-${info.project.name}.png` });
  const [saved] = cloud.list('photos');
  expect(saved).toMatchObject({ author: 'Tía Rosa', hidden: false, rotation: 0 });
  expect(String(saved.thumb)).toMatch(/^data:image\/(webp|jpeg);base64,/);
  const [img] = cloud.list('photoImages');
  expect(img.id).toBe(saved.id);
  expect(String(img.data).length).toBeLessThan(1_000_000);

  await page.getByTestId('add-see').click();
  await expect(page.getByTestId('add-photos')).toHaveCount(0);
  await expect(page.getByTestId('counter')).toHaveText('Foto 35 de 35');
  expect(await currentPhoto(page)).toBe(saved.id);
  await expect(page.locator('.layer.is-current img')).toHaveAttribute('src', /^data:image\/(webp|jpeg);base64,/);
  await expect(page.locator('.layer.is-current img')).not.toHaveClass(/is-pending/);
  await expect(page.locator('.shared-by')).toHaveText('Compartida por Tía Rosa');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/foto-nueva-${info.project.name}.png` });

  // a new visitor sees it too (from the database, not from this tab's memory)
  await openBook(page);
  await page.getByTestId('thumbs-toggle').click();
  await expect(page.locator('.tray-list .thumb:not(.add)')).toHaveCount(35);
  await page.getByRole('button', { name: 'Ir a la foto 35', exact: true }).click();
  expect(await currentPhoto(page)).toBe(saved.id);
  await expect(page.locator('.layer.is-current img')).toHaveAttribute('src', /^data:image\//);
});

test('varias fotos: quitar una, se cae internet, «Intentar otra vez»', async ({ page, cloud }, info) => {
  test.skip(info.project.name !== 'desktop', 'basta en un tamaño');
  const sample = await (await page.request.get('/photos/md/p010.webp')).body();
  await openBook(page);
  await currentPhoto(page);
  await page.getByTestId('thumbs-toggle').click();
  await page.getByTestId('add-input').setInputFiles([
    { name: 'a.webp', mimeType: 'image/webp', buffer: sample },
    { name: 'b.webp', mimeType: 'image/webp', buffer: sample },
    { name: 'c.webp', mimeType: 'image/webp', buffer: sample },
  ]);
  const sheet = page.getByTestId('add-photos');
  await expect(sheet.locator('.add-grid img')).toHaveCount(3, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Quitar b.webp' }).click();
  await expect(page.getByTestId('add-publish')).toHaveText('Agregar 2 fotos al libro');

  cloud.failNext = 1;
  await page.getByTestId('add-publish').click();
  await expect(page.getByTestId('add-failed')).toContainText('Se subió 1 foto, pero 1 foto no', { timeout: 20_000 });
  expect(cloud.list('photos')).toHaveLength(1);
  await page.getByTestId('add-retry').click();
  await expect(page.getByTestId('add-done')).toContainText('Tus 2 fotos ya están en el libro', { timeout: 20_000 });
  expect(cloud.list('photos')).toHaveLength(2);
  await page.getByTestId('add-see').click();
  await expect(page.getByTestId('counter')).toHaveText('Foto 35 de 36');
});

test('cancelar no sube nada', async ({ page, cloud }, info) => {
  test.skip(info.project.name !== 'mobile', 'basta en un tamaño');
  const sample = await (await page.request.get('/photos/thumb/p003.webp')).body();
  await openBook(page);
  await currentPhoto(page);
  await page.getByTestId('thumbs-toggle').click();
  await page.getByTestId('add-input').setInputFiles({ name: 'x.webp', mimeType: 'image/webp', buffer: sample });
  await expect(page.getByTestId('add-photos').locator('.add-grid img')).toHaveCount(1, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByTestId('add-photos')).toHaveCount(0);
  expect(cloud.commits).toBe(0);
  await expect(page.getByTestId('counter')).toHaveText(/de 34$/);
});
