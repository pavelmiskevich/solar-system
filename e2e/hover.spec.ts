import { expect, test, type Page } from '@playwright/test';
import {
  emptyScreenPoint,
  openScene,
  screenPositionOf,
  waitForArrival,
  waitForFrames,
} from './helpers';

/** Курсор того, что лежит под точкой: над телом это холст, над подписью — она. */
async function cursorAt(page: Page, point: { x: number; y: number }): Promise<string> {
  return page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return element ? getComputedStyle(element).cursor : 'нет элемента';
  }, point);
}

/**
 * Подсветка тела под курсором.
 *
 * Тело в этой сцене занимает доли пикселя, и то, что по нему можно щёлкнуть,
 * из картинки никак не следовало: об этом можно было узнать только из справки.
 * Подсветка отвечает на это раньше щелчка — курсор ещё только подошёл, а
 * подпись уже говорит, во что попадёт.
 */
test.describe('наведение', () => {
  test('наведение на подпись подсвечивает её, увод — снимает', async ({ page }) => {
    await openScene(page);

    const label = page.locator('.label', { hasText: 'Юпитер' }).first();
    await label.waitFor({ state: 'attached' });
    await expect(label).not.toHaveClass(/highlight/);

    await label.hover();
    await expect(label).toHaveClass(/highlight/);

    // Увели курсор туда, где тел заведомо нет.
    const empty = await emptyScreenPoint(page);
    await page.mouse.move(empty.x, empty.y);
    await waitForFrames(page, 2);
    await expect(label).not.toHaveClass(/highlight/);
  });

  test('наведение на само тело подсвечивает его подпись и меняет курсор', async ({ page }) => {
    await openScene(page);
    await page.evaluate(() => window.sim.travelTo('jupiter'));
    await waitForArrival(page, 'jupiter');
    await waitForFrames(page, 3);

    const label = page.locator('.label', { hasText: 'Юпитер' }).first();

    // Пустое место: подсветки нет, и указателя тоже — нажимать там не на что.
    const empty = await emptyScreenPoint(page);
    await page.mouse.move(empty.x, empty.y);
    await waitForFrames(page, 2);
    await expect(label).not.toHaveClass(/highlight/);
    expect(await cursorAt(page, empty)).not.toBe('pointer');

    // Диск Юпитера: после прилёта он занимает середину кадра. Берём точку на
    // диске в стороне от подписи — иначе проверялась бы подпись, а не тело.
    const centre = await screenPositionOf(page, 'jupiter');
    expect(centre, 'Юпитер должен быть в кадре').not.toBeNull();
    const onDisc = { x: centre!.x - 60, y: centre!.y + 60 };

    await page.mouse.move(onDisc.x, onDisc.y);
    await waitForFrames(page, 2);

    await expect(label).toHaveClass(/highlight/);
    // Указатель — обещание, что здесь есть куда нажать.
    expect(await cursorAt(page, onDisc)).toBe('pointer');

    // Подсвечено всегда не больше одного тела: иначе непонятно, куда полетим.
    expect(await page.locator('.label.highlight').count()).toBe(1);
  });

  test('подсветка снимается, когда мышь захвачена свободным полётом', async ({ page }) => {
    await openScene(page);
    await waitForFrames(page, 3);

    const jupiter = await screenPositionOf(page, 'jupiter');
    expect(jupiter).not.toBeNull();
    await page.mouse.move(jupiter!.x, jupiter!.y);
    await waitForFrames(page, 2);
    expect(await page.locator('.label.highlight').count()).toBe(1);

    // В свободном полёте курсора нет: целятся прицелом в центре кадра, и
    // подсвечивать под несуществующим курсором нечего.
    await page.evaluate(() => window.sim.flight.requestLook());
    await waitForFrames(page, 3);
    await page.mouse.move(jupiter!.x + 3, jupiter!.y + 3);
    await waitForFrames(page, 2);

    expect(await page.locator('.label.highlight').count()).toBe(0);
  });
});
