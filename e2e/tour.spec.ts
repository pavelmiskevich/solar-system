import { expect, test, type Page } from '@playwright/test';
import { expectNoErrors, openScene, pauseAt, waitForFrames } from './helpers';

interface Point {
  x: number;
  y: number;
}

/** Подпись остановки: она же подсказка внизу экрана. */
const caption = (page: Page) => page.locator('#hint:not(.hidden)');

test.describe('экскурсия', () => {
  test('проходит все точки маршрута и завершается', async ({ page }) => {
    // Ускорим время ожидания в TourController для теста
    // TourController использует WAIT_TIME = 8.
    // Это ~90 секунд ожидания (11 остановок).
    test.setTimeout(300_000);

    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    // Мокаем окно ожидания, чтобы тест прошел быстрее
    await page.evaluate(() => {
      // Подменяем метод update, чтобы ускорить таймер
      const tour = (window as any).sim.tour;
      const originalUpdate = tour.update.bind(tour);
      tour.update = (dt: number) => {
        // Ускоряем таймер в 10 раз, чтобы не ждать 8 секунд на каждую точку
        originalUpdate(dt * 10);
      };
    });

    // Нажимаем T для запуска экскурсии
    await page.keyboard.press('KeyT');
    
    // Проверяем, что тур активировался
    expect(await page.evaluate(() => (window as any).sim.tour.isActive)).toBe(true);

    // Дожидаемся завершения экскурсии (все остановки пройдены)
    await expect(async () => {
      const active = await page.evaluate(() => (window as any).sim.tour.isActive);
      expect(active).toBe(false);
    }).toPass({ timeout: 250_000 });
  });

  test('нажатие клавиши прерывает её немедленно', async ({ page }) => {
    await openScene(page);

    await page.keyboard.press('KeyT');
    expect(await page.evaluate(() => (window as any).sim.tour.isActive)).toBe(true);

    await page.keyboard.press('KeyW');
    await waitForFrames(page, 2);

    expect(await page.evaluate(() => (window as any).sim.tour.isActive)).toBe(false);
  });

  test('стрелки переводят по остановкам, не досматривая текущую', async ({ page }) => {
    const errors = await openScene(page);

    await page.keyboard.press('KeyT');
    await expect(caption(page)).toContainText('Солнце', { timeout: 30_000 });

    // Три шага вперёд подряд: сами по себе Меркурий и Венера заняли бы больше
    // тридцати секунд, поэтому уложиться в двадцать можно только стрелками.
    const started = Date.now();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    await expect(caption(page)).toContainText('Земля', { timeout: 30_000 });
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(await page.evaluate(() => window.sim.tour.isActive)).toBe(true);

    // Шаг назад возвращает на предыдущую остановку.
    await page.keyboard.press('ArrowLeft');
    await expect(caption(page)).toContainText('Венера', { timeout: 30_000 });

    expectNoErrors(errors);
  });
});

/**
 * Свайп по остановкам.
 *
 * Жест подаётся настоящими касаниями через CDP: Playwright умеет только
 * одиночное касание, а здесь важно именно движение пальца — по нему код и
 * отличает перемотку от осмотра.
 */
test.describe('экскурсия на сенсорном экране', () => {
  test.use({ hasTouch: true, viewport: { width: 420, height: 760 } });

  async function drag(page: Page, from: Point, to: Point): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    const send = (type: string, x?: number, y?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: x === undefined ? [] : [{ x, y: y as number }],
      });

    await send('touchStart', from.x, from.y);
    const STEPS = 8;
    for (let i = 1; i <= STEPS; i += 1) {
      await send(
        'touchMove',
        from.x + ((to.x - from.x) * i) / STEPS,
        from.y + ((to.y - from.y) * i) / STEPS,
      );
    }
    await send('touchEnd');
    await cdp.detach();
  }

  test('горизонтальный свайп переводит на следующую остановку', async ({ page }) => {
    const errors = await openScene(page);

    await page.keyboard.press('KeyT');
    await expect(caption(page)).toContainText('Солнце', { timeout: 30_000 });

    const started = Date.now();
    await drag(page, { x: 320, y: 380 }, { x: 80, y: 386 });

    await expect(caption(page)).toContainText('Меркурий', { timeout: 30_000 });
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(await page.evaluate(() => window.sim.tour.isActive)).toBe(true);

    expectNoErrors(errors);
  });

  test('вертикальное протаскивание по-прежнему обрывает её', async ({ page }) => {
    const errors = await openScene(page);

    await page.keyboard.press('KeyT');
    await expect(caption(page)).toContainText('Солнце', { timeout: 30_000 });

    await drag(page, { x: 210, y: 250 }, { x: 216, y: 560 });

    await expect
      .poll(() => page.evaluate(() => window.sim.tour.isActive), { timeout: 10_000 })
      .toBe(false);

    expectNoErrors(errors);
  });
});
