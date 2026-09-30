import { expect, type Page } from '@playwright/test';

export const INTRO = 'Algunos buenos recuerdos de nuestro libro de la vida…';
export const OUTRO = 'Hemos vivido momentos increíbles… y vamos por muchos más!';
export const SHOTS = 'tests/screenshots';

export async function openBook(page: Page) {
  await page.goto('/');
  const btn = page.getByTestId('open-book');
  await expect(btn).toHaveText(/Abrir el libro/);
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(page.getByTestId('viewer')).toBeVisible({ timeout: 8000 });
}

export const viewer = (page: Page) => page.getByTestId('viewer');

export async function currentIndex(page: Page): Promise<number> {
  return Number(await viewer(page).getAttribute('data-index'));
}

/** id of the photo in the current (non-leaving) layer, once its image has decoded */
export async function currentPhoto(page: Page): Promise<string> {
  const img = page.locator('.layer.is-current img');
  await expect(img).toHaveCount(1);
  await expect.poll(async () => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 15_000 }).toBe(true);
  return (await img.getAttribute('data-photo-id'))!;
}

export async function jumpTo(page: Page, n: number) {
  await page.getByTestId('thumbs-toggle').click();
  await page.getByRole('button', { name: `Ir a la foto ${n}`, exact: true }).click();
  await expect(page.getByTestId('counter')).toHaveText(`Foto ${n} de 34`);
}
