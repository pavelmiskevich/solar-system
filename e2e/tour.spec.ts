import { expect, test, type Page } from '@playwright/test';
import {
  expectNoErrors,
  openScene,
  pauseAt,
  recordCaptions,
  waitForArrival,
  waitForFrames,
} from './helpers';

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
    await expect(caption(page)).toContainText('Солнце', { timeout: 60_000 });

    // Запоминаем все подписи, какие успеют показаться. По ним и видно, что
    // остановки пропущены: у брошенной остановки подписи не бывает вовсе -
    // она появляется только по прибытии.
    const captionsSeen = await recordCaptions(page);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    await expect(caption(page)).toContainText('Земля', { timeout: 60_000 });
    expect(await page.evaluate(() => window.sim.tour.isActive)).toBe(true);

    const shown = (await captionsSeen()).join(' | ');
    // Сначала - что список вообще собрался: пустой прошёл бы любые проверки
    // на отсутствие, ничего не проверив.
    expect(shown).toContain('Солнце');
    expect(shown).toContain('Земля');
    // И главное: через Меркурий и Венеру экскурсия прошла, ни на одной не
    // задержавшись, - будь иначе, их подписи оказались бы здесь же.
    expect(shown).not.toContain('Меркурий');
    expect(shown).not.toContain('Венера');

    // Шаг назад возвращает на предыдущую остановку.
    await page.keyboard.press('ArrowLeft');
    await expect(caption(page)).toContainText('Венера', { timeout: 60_000 });

    expectNoErrors(errors);
  });
});

/**
 * Выбор зрителя кончает экскурсию.
 *
 * Всё начинается с первой остановки: там экскурсия уже рассказывает и
 * поворачивает тело сама, и именно оттуда она потом уводит камеру к
 * следующей, если её не остановить.
 */
test.describe('экскурсия уступает зрителю', () => {
  async function startAtSun(page: Page): Promise<void> {
    await page.keyboard.press('KeyT');
    await expect(caption(page)).toContainText('Солнце', { timeout: 60_000 });
  }

  /** Экскурсия кончилась вся: и в сцене, и на экране. */
  async function expectTourOver(page: Page): Promise<void> {
    await expect
      .poll(() => page.evaluate(() => window.sim.tour.isActive))
      .toBe(false);
    await expect(page.locator('#hint')).toHaveClass(/hidden/);
    await expect(page.getByRole('button', { name: 'Экскурсия ▶' })).toBeVisible();
  }

  /**
   * Камера стоит у выбранного тела и никуда не собирается.
   *
   * Одного прибытия мало: экскурсия, оставшись жить, дала бы долететь и
   * увела бы камеру позже, досмотрев свою остановку. Поэтому после прибытия
   * ещё три десятка кадров, и за них никто не должен начать новый перелёт.
   */
  async function expectStaysAt(page: Page, id: string): Promise<void> {
    await waitForArrival(page, id);
    await waitForFrames(page, 30);
    expect(
      await page.evaluate(() => ({
        travel: window.sim.travel.isActive,
        frame: window.sim.frame.targetId,
      })),
    ).toEqual({ travel: false, frame: id });
  }

  test('выбор тела в списке', async ({ page }) => {
    const errors = await openScene(page);
    await startAtSun(page);

    await page.getByRole('button', { name: 'Тела ☰' }).click();
    await page
      .locator('.bodies-row')
      .filter({ has: page.locator('.name', { hasText: /^Нептун$/ }) })
      .click();

    await expectTourOver(page);
    await expectStaysAt(page, 'neptune');
    expectNoErrors(errors);
  });

  test('выбор тела на перелёте к остановке', async ({ page }) => {
    const errors = await openScene(page);

    // Список открыт заранее: перелёт к Солнцу длится секунды, и тратить их
    // на кнопку незачем.
    await page.getByRole('button', { name: 'Тела ☰' }).click();

    // Сразу после запуска экскурсия летит к Солнцу. Её отмена обрывает
    // перелёт - и не должна оборвать тот, что заказал зритель.
    await page.keyboard.press('KeyT');
    await page.waitForFunction(() => window.sim.travel.targetId === 'sun');

    await page
      .locator('.bodies-row')
      .filter({ has: page.locator('.name', { hasText: /^Марс$/ }) })
      .click();

    await expectTourOver(page);
    await expectStaysAt(page, 'mars');
    expectNoErrors(errors);
  });

  test('выбор готового вида', async ({ page }) => {
    const errors = await openScene(page);
    await startAtSun(page);

    await page.getByRole('button', { name: /Виды/ }).click();
    await page.locator('[data-scenario="uranus-tilt"]').click();

    await expectTourOver(page);
    await expectStaysAt(page, 'uranus');
    expectNoErrors(errors);
  });

  test('выбор события', async ({ page }) => {
    const errors = await openScene(page);
    await startAtSun(page);

    await page.keyboard.press('KeyE');
    const eclipse = page.locator('[data-event^="solar-eclipse"]').first();
    await expect(eclipse).toBeVisible({ timeout: 20_000 });
    await eclipse.click();

    await expectTourOver(page);
    await expectStaysAt(page, 'earth');
    expectNoErrors(errors);
  });

  test('протаскивание мышью поворачивает тело, а не переводит остановку', async ({ page }) => {
    const errors = await openScene(page);
    await startAtSun(page);

    // Движение горизонтальное и далеко за порогом свайпа: пальцем такое
    // перевело бы экскурсию к Меркурию. Мышью это осмотр.
    await page.mouse.move(450, 300);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1) await page.mouse.move(450 - i * 25, 302);
    await page.mouse.up();

    await expectTourOver(page);
    await expectStaysAt(page, 'sun');
    expectNoErrors(errors);
  });
});

/**
 * Свайп по остановкам.
 *
 * Жест подаётся настоящими касаниями через CDP: Playwright умеет только
 * одиночное касание, а здесь важно именно движение пальца - по нему код и
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

  test('горизонтальные свайпы переводят по остановкам, не досматривая их', async ({ page }) => {
    const errors = await openScene(page);

    await page.keyboard.press('KeyT');
    await expect(caption(page)).toContainText('Солнце', { timeout: 60_000 });

    const captionsSeen = await recordCaptions(page);

    // Одного свайпа для проверки мало: к Меркурию экскурсия придёт и сама,
    // досмотрев Солнце, и по подписям эти два случая не различить. Три свайпа
    // подряд различаются: своим чередом за это время не пройти и одной
    // остановки.
    //
    // Свайп срабатывает на первом же сдвиге сверх порога и на этом тратится,
    // так что каждый перевод - отдельное касание, отдельный вызов drag.
    for (let i = 0; i < 3; i += 1) {
      await drag(page, { x: 320, y: 380 }, { x: 80, y: 386 });
    }

    await expect(caption(page)).toContainText('Земля', { timeout: 60_000 });
    expect(await page.evaluate(() => window.sim.tour.isActive)).toBe(true);

    const shown = (await captionsSeen()).join(' | ');
    // Сначала - что список вообще собрался: пустой прошёл бы любые проверки
    // на отсутствие, ничего не проверив.
    expect(shown).toContain('Солнце');
    expect(shown).toContain('Земля');
    // И главное: Меркурий и Венера перемотаны, а не досмотрены.
    expect(shown).not.toContain('Меркурий');
    expect(shown).not.toContain('Венера');

    expectNoErrors(errors);
  });

  test('вертикальное протаскивание по-прежнему обрывает её', async ({ page }) => {
    const errors = await openScene(page);

    await page.keyboard.press('KeyT');
    await expect(caption(page)).toContainText('Солнце', { timeout: 60_000 });

    await drag(page, { x: 210, y: 250 }, { x: 216, y: 560 });

    await expect
      .poll(() => page.evaluate(() => window.sim.tour.isActive), { timeout: 30_000 })
      .toBe(false);

    expectNoErrors(errors);
  });
});
