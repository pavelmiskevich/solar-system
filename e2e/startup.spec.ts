import { expect, test, type Page } from '@playwright/test';

import {
  expectNoErrors,
  frameLight,
  openScene,
  pauseAt,
  waitForFrames,
  waitForStableExposure,
} from './helpers';

/** Браузер без WebGL: ни один холст не даёт контекст для трёхмерной графики. */
async function withoutWebgl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type.startsWith('webgl') || type === 'experimental-webgl') return null;
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
}

test.describe('запуск', () => {
  test('без WebGL вместо вечной заставки - объяснение', async ({ page }) => {
    await withoutWebgl(page);
    await page.goto('/');

    await expect(page.locator('#loader .failure')).toContainText('WebGL 2', { timeout: 30_000 });
    await expect(page.locator('#loader .failure')).toContainText('аппаратное ускорение');
    await expect(page.locator('#loader .bar')).toHaveCount(0);
    // Заставка с причиной не прячется: прятать её значит оставить чёрный экран.
    await page.waitForTimeout(2_000);
    await expect(page.locator('#loader')).toBeVisible();
    await expect(page.locator('#loader')).not.toHaveClass(/done/);
  });

  test('объяснение - на языке посетителя', async ({ page }) => {
    await withoutWebgl(page);
    await page.goto('/?lang=en');

    await expect(page.locator('#loader .failure')).toContainText('needs WebGL 2', {
      timeout: 30_000,
    });
  });

  test('любая другая ошибка запуска тоже не оставляет вечную заставку', async ({ page }) => {
    // Исключение посреди запуска, не связанное с WebGL: main.ts читает языки
    // браузера, и чтение бросает.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'languages', {
        get() {
          throw new Error('проверка: языки браузера недоступны');
        },
      });
    });
    await page.goto('/');

    await expect(page.locator('#loader .failure')).toContainText('Сцена не запустилась', {
      timeout: 30_000,
    });
    await expect(page.locator('#loader .bar')).toHaveCount(0);
  });

  test('ошибка на первом кадре оставляет заставку с причиной, а не чёрный экран', async ({
    page,
  }) => {
    // Запуск прошёл, но рисовать нельзя: первый же вызов отрисовки бросает.
    // Заставка прячется через два кадра после запуска, и без сторожа она
    // ушла бы, открыв чёрный холст.
    await page.addInitScript(() => {
      for (const name of ['drawArrays', 'drawElements'] as const) {
        WebGL2RenderingContext.prototype[name] = () => {
          throw new Error('проверка: отрисовка недоступна');
        };
      }
    });
    await page.goto('/');

    await expect(page.locator('#loader .failure')).toContainText('Сцена не запустилась', {
      timeout: 30_000,
    });
    await page.waitForTimeout(2_000);
    await expect(page.locator('#loader')).toBeVisible();
    await expect(page.locator('#loader')).not.toHaveClass(/done/);
  });

  test('потеря видеокарты показывает плашку, а после возврата сцена снова рисуется', async ({
    page,
  }) => {
    const errors = await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');
    await page.evaluate(() => {
      window.sim.labels.setEnabled(false);
      window.sim.goTo('moon', 6, 0);
    });
    await waitForStableExposure(page);
    const before = await frameLight(page);
    // Луна в полной фазе на весь центр кадра: есть что терять.
    expect(before.median).toBeGreaterThan(40);

    const notice = page.locator('.context-lost');
    await expect(notice).toBeHidden();

    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#viewport canvas')!;
      const lose = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
      (window as unknown as { loseContext: WEBGL_lose_context }).loseContext = lose;
      lose.loseContext();
    });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('видеокарту');
    await expect(notice.locator('button')).toHaveText('Перезагрузить');

    await page.evaluate(() => {
      (window as unknown as { loseContext: WEBGL_lose_context }).loseContext.restoreContext();
    });
    await expect(notice).toBeHidden();
    await waitForFrames(page, 10);

    const after = await frameLight(page);
    expect(after.median, `до потери ${before.median}, после возврата ${after.median}`).toBeGreaterThan(
      before.median * 0.5,
    );
    expectNoErrors(errors);
  });

  test('без JavaScript заставка говорит, что он нужен, и не обещает загрузку', async ({ page }) => {
    // Выключить скрипты по-настоящему Playwright не умеет: и javaScriptEnabled,
    // и флаг запуска браузера только запрещают их выполнять, а страница
    // разбирается как при включённых, и <noscript> остаётся пустым местом.
    // DOMParser разбирает страницу так, как браузер без скриптов, - по нему и
    // смотрим.
    await page.goto('/');
    const fallback = await page.evaluate(async () => {
      const html = await (await fetch('/')).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return {
        text: doc.querySelector('#loader noscript .failure')?.textContent ?? '',
        hidesBar: Array.from(doc.querySelectorAll('head noscript style')).some((style) =>
          /#loader\s+\.bar\s*\{\s*display:\s*none/.test(style.textContent ?? ''),
        ),
      };
    });

    expect(fallback.text).toContain('нужен JavaScript');
    expect(fallback.text).toContain('needs JavaScript');
    expect(fallback.hidesBar).toBe(true);
  });
});
