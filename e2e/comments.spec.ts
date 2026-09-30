import { expect, test } from './fixtures';
import { SHOTS, currentIndex, currentPhoto, openBook } from './helpers';

test('comentar una foto desde el visor, como en redes sociales', async ({ page, cloud }, info) => {
  cloud.seedComment('p002', '¡Qué recuerdo tan lindo!', 'Carlos');
  await openBook(page);
  expect(await currentPhoto(page)).toBe('p001');

  const pill = page.getByTestId('comments-open');
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText('Comentar');
  await pill.click();
  const sheet = page.getByTestId('comments');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Todavía no hay comentarios');
  await expect(sheet).toContainText('Foto 1');

  // first time: we ask the name once, then remember it on this device
  await page.getByTestId('comment-name').fill('Tía Rosa');
  await page.getByTestId('comment-input').fill('¡Feliz cumpleaños, mamá! Esta foto me encanta.');
  await page.screenshot({ path: `${SHOTS}/comentar-${info.project.name}.png` });
  await page.getByTestId('comment-send').click();

  const item = sheet.getByTestId('comment');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Tía Rosa');
  await expect(item).toContainText('¡Feliz cumpleaños, mamá! Esta foto me encanta.');
  await expect(item).toContainText('ahora');
  await expect(page.getByTestId('comment-input')).toHaveValue('');
  await expect(sheet).toContainText('Comentas como Tía Rosa');
  const [saved] = cloud.list('comments').filter((c) => c.photoId === 'p001');
  expect(saved).toMatchObject({ photoId: 'p001', author: 'Tía Rosa', text: '¡Feliz cumpleaños, mamá! Esta foto me encanta.', hidden: false });
  await page.screenshot({ path: `${SHOTS}/comentarios-${info.project.name}.png` });

  await page.getByTestId('comments-close').click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('comments-count')).toHaveText('1');
  await expect(pill).toContainText('Tía Rosa: ¡Feliz cumpleaños');
  await page.screenshot({ path: `${SHOTS}/burbuja-comentarios-${info.project.name}.png` });

  // the thumbnails show which photos have comments
  await page.getByTestId('thumbs-toggle').click();
  await expect(page.getByRole('button', { name: 'Ir a la foto 2', exact: true }).locator('.thumb-comments')).toHaveText('1');
  await page.getByRole('button', { name: 'Ir a la foto 2', exact: true }).click();
  await expect(page.getByTestId('counter')).toHaveText('Foto 2 de 34');
  await expect(pill).toContainText('Carlos: ¡Qué recuerdo tan lindo!');

  // another visit on the same device: comments are there and the name is remembered
  await openBook(page);
  await expect(page.getByTestId('comments-count')).toHaveText('1');
  await page.getByTestId('comments-open').click();
  await expect(page.getByTestId('comment')).toHaveCount(1);
  await expect(page.getByTestId('comments')).toContainText('Comentas como Tía Rosa');
  await expect(page.getByTestId('comment-name')).toHaveCount(0);
});

test('mientras se escribe, el libro no avanza; Escape cierra', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'espera de 15 s, una vez');
  await openBook(page);
  await currentPhoto(page);
  await page.getByTestId('comments-open').click();
  await page.getByTestId('comment-name').fill('Ana');
  await page.getByTestId('comment-input').fill('Escribiendo sin prisa…');
  await page.keyboard.press('ArrowRight'); // typing, not turning pages
  await page.waitForTimeout(16_500);
  expect(await currentIndex(page)).toBe(0);
  await expect(page.getByTestId('comment-input')).toHaveValue('Escribiendo sin prisa…');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('comments')).toHaveCount(0);
  expect(await currentIndex(page)).toBe(0);
});

test('sin internet: el comentario queda marcado y se puede reintentar', async ({ page, cloud }, info) => {
  test.skip(info.project.name !== 'mobile', 'basta en un tamaño');
  await openBook(page);
  await currentPhoto(page);
  await page.getByTestId('comments-open').click();
  await page.getByTestId('comment-name').fill('Luis');
  cloud.failNext = 1;
  await page.getByTestId('comment-input').fill('Hola desde el campo');
  await page.getByTestId('comment-send').click();
  await expect(page.getByTestId('comment')).toContainText('No se envió');
  await expect(page.getByRole('alert')).toContainText('No se pudo publicar');
  expect(cloud.list('comments')).toHaveLength(0);
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByTestId('comment')).not.toContainText('No se envió');
  expect(cloud.list('comments')).toMatchObject([{ text: 'Hola desde el campo', author: 'Luis' }]);
});

test('los comentarios ocultos por la familia no se ven', async ({ page, cloud }) => {
  cloud.seedComment('p001', 'visible', 'Ana');
  cloud.seedComment('p001', 'spam oculto', 'Bot', true);
  await openBook(page);
  await currentPhoto(page);
  await expect(page.getByTestId('comments-count')).toHaveText('1');
  await page.getByTestId('comments-open').click();
  await expect(page.getByTestId('comment')).toHaveCount(1);
  await expect(page.getByTestId('comments')).not.toContainText('spam oculto');
});
