import { expect, test } from '@playwright/test';
import { INTRO, OUTRO, SHOTS, currentIndex, currentPhoto, jumpTo, openBook, viewer } from './helpers';

test('portada: libro, texto exacto y botón; al abrir empieza la música', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByTestId('cover')).toBeVisible();
  await expect(page.locator('.cover-title')).toHaveText('Libro de mamá');
  await expect(page.locator('.cover-text')).toHaveText(INTRO);
  await expect(page.getByTestId('open-book')).toHaveText(/Abrir el libro/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/portada-${info.project.name}.png` });

  await page.getByTestId('open-book').click();
  await expect(viewer(page)).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('counter')).toHaveText('Foto 1 de 34');
  await expect(viewer(page)).toHaveAttribute('data-music', 'playing', { timeout: 10_000 });
  expect(await currentPhoto(page)).toBe('p001');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/visor-${info.project.name}.png` });
});

test('las 34 fotos aparecen en el orden canónico, sin errores 404, y al final se cierra el libro', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'recorrido completo una vez');
  const bad: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  await openBook(page);
  for (let i = 1; i <= 34; i++) {
    const id = `p${String(i).padStart(3, '0')}`;
    await expect(page.getByTestId('counter')).toHaveText(`Foto ${i} de 34`);
    expect(await currentPhoto(page)).toBe(id);
    await page.keyboard.press('ArrowRight');
  }
  await expect(page.getByTestId('outro')).toBeVisible();
  await expect(page.getByTestId('outro-text')).toHaveText(OUTRO);
  expect(bad).toEqual([]);
});

test('avanza solo a los 15 segundos y la pausa lo detiene', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'basta en un tamaño');
  await openBook(page);
  await currentPhoto(page);
  const t0 = Date.now();
  await page.waitForTimeout(12_500);
  expect(await currentIndex(page)).toBe(0);
  await expect.poll(() => currentIndex(page), { timeout: 6000, intervals: [250] }).toBe(1);
  const elapsed = (Date.now() - t0) / 1000;
  expect(elapsed).toBeGreaterThan(13.5);
  expect(elapsed).toBeLessThan(18.5);

  await page.getByTestId('play').click();
  await expect(viewer(page)).toHaveAttribute('data-playing', 'no');
  await page.waitForTimeout(16_500);
  expect(await currentIndex(page)).toBe(1);
  await page.keyboard.press('Space');
  await expect(viewer(page)).toHaveAttribute('data-playing', 'yes');
});

test('celular: deslizar, tocar los lados y zoom', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'gestos táctiles');
  await openBook(page);
  await currentPhoto(page);
  const box = (await page.getByTestId('stage').boundingBox())!;
  const y = box.y + box.height / 2;
  // swipe left -> next
  await page.mouse.move(box.x + box.width * 0.8, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 6 });
  await page.mouse.move(box.x + box.width * 0.2, y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('counter')).toHaveText('Foto 2 de 34');
  // swipe right -> previous
  await page.mouse.move(box.x + box.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, y, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('counter')).toHaveText('Foto 1 de 34');
  // tap right edge -> next, tap left edge -> previous
  await page.touchscreen.tap(box.x + box.width * 0.92, y);
  await expect(page.getByTestId('counter')).toHaveText('Foto 2 de 34');
  await page.waitForTimeout(800);
  await page.touchscreen.tap(box.x + box.width * 0.08, y);
  await expect(page.getByTestId('counter')).toHaveText('Foto 1 de 34');

  // zoom in / normal
  await page.getByTestId('zoom-in').click();
  await expect(page.locator('.layer.is-current .page')).toHaveAttribute('style', /scale\(1\.5\)/);
  await page.getByTestId('zoom-reset').click();
  await expect(page.locator('.layer.is-current .page')).toHaveAttribute('style', /scale\(1\)/);
});

test('miniaturas, encajar/llenar, pantalla completa, música y teclado', async ({ page }, info) => {
  await openBook(page);
  await currentPhoto(page);
  // thumbnails tray
  await page.getByTestId('thumbs-toggle').click();
  await expect(page.getByTestId('tray')).toHaveClass(/open/);
  await expect(page.locator('.thumb:not(.add)')).toHaveCount(34);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/miniaturas-${info.project.name}.png` });
  await page.getByRole('button', { name: 'Ir a la foto 10', exact: true }).click();
  await expect(page.getByTestId('counter')).toHaveText('Foto 10 de 34');
  expect(await currentPhoto(page)).toBe('p010');

  // fit / fill
  await page.getByTestId('fit').click();
  await expect(page.locator('.layer.is-current figure')).toHaveClass(/fit-cover/);
  await page.getByTestId('fit').click();
  await expect(page.locator('.layer.is-current figure')).toHaveClass(/fit-contain/);

  // music
  await expect(viewer(page)).toHaveAttribute('data-music', 'playing', { timeout: 10_000 });
  await page.getByTestId('mute').click();
  await expect(viewer(page)).toHaveAttribute('data-music', 'muted');
  await page.getByTestId('mute').click();
  await expect(viewer(page)).toHaveAttribute('data-music', 'playing');

  // keyboard (desktop)
  if (info.project.name === 'desktop') {
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('counter')).toHaveText('Foto 11 de 34');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('counter')).toHaveText('Foto 10 de 34');
    await page.keyboard.press('+');
    await expect(page.locator('.layer.is-current .page')).toHaveAttribute('style', /scale\(1\.5\)/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.layer.is-current .page')).toHaveAttribute('style', /scale\(1\)/);
  }

  // fullscreen
  await page.getByTestId('fullscreen').click();
  await expect(viewer(page)).toHaveClass(/is-fullscreen/);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/pantalla-completa-${info.project.name}.png` });
  await page.getByTestId('fullscreen').click({ force: true });
  await expect(viewer(page)).not.toHaveClass(/is-fullscreen/);
});

test('cierre del libro: texto exacto, ver de nuevo y volver al comienzo', async ({ page }, info) => {
  await openBook(page);
  await currentPhoto(page);
  await jumpTo(page, 34);
  expect(await currentPhoto(page)).toBe('p034');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByTestId('outro')).toBeVisible();
  await expect(page.getByTestId('outro-text')).toHaveText(OUTRO);
  await expect(page.locator('.outro-screen.stage-done')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/cierre-${info.project.name}.png` });
  await page.getByTestId('replay').click();
  await expect(page.getByTestId('counter')).toHaveText('Foto 1 de 34');
  await jumpTo(page, 34);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByTestId('restart').click();
  await expect(page.getByTestId('cover')).toBeVisible();
});

test('todas las imágenes y la música responden 200', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'una vez basta');
  const g = await (await request.get('/gallery.json')).json();
  const urls: string[] = [];
  for (const p of g.photos) urls.push(p.src, p.srcMd, p.thumb);
  urls.push('audio/01-uplifting-piano-pop-flow.mp3', 'audio/02-neon-piano-lane.mp3', 'audio/03-upbeat-happy-indie-pop.mp3', 'audio/04-my-happy-dance.mp3', 'admin/', 'favicon.svg');
  for (const u of urls) {
    const r = await request.get('/' + u);
    expect(r.status(), u).toBe(200);
  }
  expect(urls.length).toBe(34 * 3 + 6);
});
