import { expect, test } from '@playwright/test';
import { openScene, pauseAt, waitForFrames } from './helpers';

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
});
