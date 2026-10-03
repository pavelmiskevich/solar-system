import { expect, test } from '@playwright/test';
import { openScene, screenPositionOf, waitForArrival, waitForFrames } from './helpers';

/**
 * Наведение при захваченной мыши.
 *
 * Эта проверка вынесена из hover.spec.ts в свой файл ради одной строки ниже:
 * она идёт в полном Chromium, а не в облегчённом headless-shell, на котором
 * Playwright гоняет остальные. Браузер выбирается на весь файл - внутри группы
 * проверок Playwright его сменить не даёт.
 *
 * Захват мыши в headless-shell под Linux сломан: после `requestPointerLock`
 * браузер сам, без единого движения со стороны теста, шлёт странице поток
 * синтетических `mousemove` (смещение 0, координаты прежние) и
 * `pointerrawupdate` - десятки в секунду, и поток не кончается, пока захват не
 * снят. Страница захлёбывается этим вводом: кадры редеют, `page.mouse.move`
 * ждёт подтверждения по десять-двадцать секунд, и на CI ожидание кадров
 * вставало совсем (задача #100). Сцена тут ни при чём: в полном Chromium под
 * тем же Linux, как и в headless-shell под Windows, после захвата событий мыши
 * нет, пока их не пошлёт сам тест.
 *
 * Подменять захват заглушкой не стали: проверка о том, как сцена ведёт себя
 * при настоящем захвате, и ценна именно настоящим.
 */
test.use({ channel: 'chromium' });

test.describe('наведение', () => {
  test('подсветка снимается, когда мышь захвачена свободным полётом', async ({ page }) => {
    await openScene(page);
    // Прилетаем к телу, а не полагаемся на то, где оно окажется при запуске:
    // сцена стартует с текущей даты, и в другой день Юпитер стоит в другом
    // месте кадра - а то и за Солнцем.
    await page.evaluate(() => window.sim.travelTo('jupiter'));
    await waitForArrival(page, 'jupiter');
    await waitForFrames(page, 3);

    const centre = await screenPositionOf(page, 'jupiter');
    expect(centre, 'Юпитер должен быть в кадре').not.toBeNull();
    const onDisc = { x: centre!.x - 60, y: centre!.y + 60 };

    await page.mouse.move(onDisc.x, onDisc.y);
    await waitForFrames(page, 2);
    expect(await page.locator('.label.highlight').count()).toBe(1);

    // В свободном полёте курсора нет: целятся прицелом в центре кадра, и
    // подсвечивать под несуществующим курсором нечего.
    await page.evaluate(() => window.sim.flight.requestLook());
    await waitForFrames(page, 3);
    await page.mouse.move(onDisc.x + 3, onDisc.y + 3);
    await waitForFrames(page, 2);

    expect(await page.locator('.label.highlight').count()).toBe(0);
  });
});
