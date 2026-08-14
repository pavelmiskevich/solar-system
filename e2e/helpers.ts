import { expect, type Page } from '@playwright/test';

/**
 * Общая часть сквозных тестов.
 *
 * Сцена живёт в requestAnimationFrame, и почти всё в ней — процесс, а не
 * состояние: перелёт длится секунды, экспозиция подтягивается полторы секунды,
 * подписи проявляются. Поэтому тесты почти нигде не проверяют мгновенный
 * снимок, а ждут выполнения условия — как ждал бы человек, глядя на экран.
 */

/**
 * Отладочный доступ к сцене — он есть только в режиме разработки.
 *
 * Тип нарочно нестрогий: описывать здесь половину модулей проекта значило бы
 * держать вторую копию их интерфейсов и править её при каждом изменении.
 */
declare global {
  interface Window {
    sim: Record<string, any>;
  }
}

export interface OpenOptions {
  /**
   * Оставить справку открытой. Она показывается при загрузке и накрывает
   * экран, поэтому всем тестам, кроме проверки самой справки, она мешает.
   */
  keepHelp?: boolean;
}

/** Открыть сцену и дождаться первого кадра. */
export async function openScene(page: Page, options: OpenOptions = {}): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/');

  // Отладочный доступ появляется последним в main.ts — значит, модуль
  // выполнился целиком и первый кадр отрисован.
  await page.waitForFunction(() => typeof window.sim === 'object' && window.sim !== null, null, {
    timeout: 60_000,
  });
  await waitForFrames(page, 3);

  if (!options.keepHelp) {
    await page.keyboard.press('Escape');
    await page.locator('#help.closed').waitFor();
  }

  return errors;
}

/** Дождаться, пока сцена отрисует несколько кадров подряд. */
export async function waitForFrames(page: Page, count = 2): Promise<void> {
  await page.evaluate(async (frames) => {
    for (let i = 0; i < frames; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }
  }, count);
}

/** Остановить время: без паузы тела уезжают между проверками. */
export async function pauseAt(page: Page, iso: string): Promise<void> {
  await page.evaluate((date) => {
    window.sim.clock.paused = true;
    window.sim.setDate(date);
  }, iso);
  await waitForFrames(page, 2);
}

/** Расстояние от камеры до центра тела в его видимых радиусах. */
export async function distanceInRadii(page: Page, id: string): Promise<number> {
  return page.evaluate((bodyId) => {
    const sim = window.sim;
    const body =
      bodyId === 'sun'
        ? { worldPosition: sim.sun.worldPosition, visualRadius: sim.sun.visualRadius }
        : sim.system.find(bodyId);
    if (!body) return Number.NaN;
    return sim.flight.worldPosition.distanceTo(body.worldPosition) / body.visualRadius;
  }, id);
}

/** Дождаться конца перелёта. */
export async function waitForArrival(page: Page, id: string): Promise<void> {
  await page.waitForFunction(
    (bodyId) => window.sim.travel.isActive === false && window.sim.frame.targetId === bodyId,
    id,
    { timeout: 60_000 },
  );
}

/** Экранные координаты центра тела — по той же проекции, что и подписи. */
export async function screenPositionOf(
  page: Page,
  id: string,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate((bodyId) => {
    const sim = window.sim;
    const body = sim.system.find(bodyId);
    if (!body) return null;

    const element = sim.viewport.renderer.domElement;
    const projected = body.group.position.clone().project(sim.viewport.camera);
    if (projected.z > 1) return null;

    return {
      x: (projected.x * 0.5 + 0.5) * element.clientWidth,
      y: (0.5 - projected.y * 0.5) * element.clientHeight,
    };
  }, id);
}

/** Проверка, что консоль чистая: в сцене ошибка шейдера равносильна пустому кадру. */
export function expectNoErrors(errors: string[]): void {
  expect(errors, `в консоли ошибки:\n${errors.join('\n')}`).toEqual([]);
}
