import { expect, test, type Page } from '@playwright/test';

import { expectNoErrors, frameLight, openScene, waitForFrames } from './helpers';

/**
 * Атмосфера Земли.
 *
 * Слой рассеяния виден только с орбиты: с трёх радиусов сотня километров
 * воздуха занимает три пикселя. Поэтому камера здесь ставится туда, откуда
 * атмосферу и снимают, — на четыреста километров над поверхностью, взглядом
 * вдоль горизонта.
 *
 * Проверяется цвет, а не яркость. Голубое небо и красный закат — это одно и
 * то же рассеяние, разница только в длине пути сквозь воздух, и если в
 * коэффициентах перепутать каналы, кадр останется таким же светлым, но небо
 * станет жёлтым.
 */

/**
 * Встать на низкую орбиту и посмотреть вдоль горизонта.
 *
 * @param along угол от подсолнечной точки вдоль поверхности: 55° — день,
 *        100° — уже ночная сторона, откуда виден терминатор
 * @param ahead куда смотреть: на точку поверхности, отстоящую на столько же
 *        градусов вперёд (или назад, если отрицательно)
 */
async function lookAlongHorizon(page: Page, along: number, ahead: number): Promise<void> {
  await page.evaluate(
    ({ along, ahead }) => {
      const sim = window.sim;
      sim.setDate('2026-08-14T12:00:00Z');
      sim.clock.paused = true;

      const earth = sim.system.find('earth');
      const e = earth.worldPosition;
      const s = sim.sun.worldPosition;

      // Орт на Солнце и орт поперёк него: ими и отмеряется угол вдоль
      // поверхности от подсолнечной точки.
      let sx = s.x - e.x;
      let sy = s.y - e.y;
      let sz = s.z - e.z;
      const sl = Math.hypot(sx, sy, sz);
      sx /= sl;
      sy /= sl;
      sz /= sl;

      let ux = 0;
      let uy = 1;
      let uz = 0;
      const dot = sx * ux + sy * uy + sz * uz;
      ux -= sx * dot;
      uy -= sy * dot;
      uz -= sz * dot;
      const ul = Math.hypot(ux, uy, uz);
      ux /= ul;
      uy /= ul;
      uz /= ul;

      const point = (degrees: number, radius: number): [number, number, number] => {
        const a = (degrees * Math.PI) / 180;
        return [
          e.x + (sx * Math.cos(a) + ux * Math.sin(a)) * radius,
          e.y + (sy * Math.cos(a) + uy * Math.sin(a)) * radius,
          e.z + (sz * Math.cos(a) + uz * Math.sin(a)) * radius,
        ];
      };

      sim.lookAt(point(along, earth.visualRadius + 400), point(along + ahead, earth.visualRadius));
    },
    { along, ahead },
  );

  // Экспозиция подтягивается полторы секунды, и меряем мы именно её результат.
  await page.waitForTimeout(2500);
  await waitForFrames(page, 3);
}

test.describe('атмосфера', () => {
  test('над дневной стороной кайма голубая, у терминатора — красно-оранжевая', async ({
    page,
  }) => {
    const errors = await openScene(page);

    // Полоска поперёк горизонта: она приходится на середину кадра.
    const BAND = 0.06;

    await lookAlongHorizon(page, 55, 25);
    const day = await frameLight(page, BAND);

    // С ночной стороны, взглядом назад на терминатор: свет доходит сюда
    // сквозь всю толщу воздуха по касательной, синего в нём не остаётся.
    await lookAlongHorizon(page, 100, -28);
    const twilight = await frameLight(page, BAND);

    expect(day.median, 'дневная кайма должна светиться').toBeGreaterThan(20);
    expect(twilight.median, 'сумеречная кайма должна светиться').toBeGreaterThan(10);

    // Пороги невелики нарочно: в полоску попадает не одна кайма, но и
    // поверхность под ней, и засветка от Солнца у самого горизонта. Обе
    // подмешивают свой цвет и разницу разбавляют — а важна здесь не её
    // величина, а знак.
    const dayWarmth = day.red / day.blue;
    const twilightWarmth = twilight.red / twilight.blue;

    // Днём синего заметно больше красного.
    expect(dayWarmth).toBeLessThan(0.85);
    // У терминатора наоборот: красного больше синего. Перепутанные местами
    // каналы дали бы ровно обратную картину — жёлтое небо и синий закат, — и
    // яркость кадра при этом не изменилась бы вовсе.
    expect(twilightWarmth).toBeGreaterThan(1.0);
    expect(twilightWarmth / dayWarmth).toBeGreaterThan(1.25);

    expectNoErrors(errors);
  });

  test('слой кончается там, где кончается воздух, а не размазан по небу', async ({ page }) => {
    const errors = await openScene(page);

    await lookAlongHorizon(page, 55, 25);

    // Толщина слоя — сотня километров на радиусе в шесть с половиной тысяч,
    // и на кадре с орбиты это узкая кайма у горизонта, а не половина неба.
    // Проверяется по верхней части кадра: там, выше каймы, должно быть
    // космически черно.
    const sky = await page.evaluate(() => {
      const element = window.sim.viewport.renderer.domElement;
      return { width: element.clientWidth, height: element.clientHeight };
    });
    expect(sky.height).toBeGreaterThan(0);

    const shot = (await page.screenshot()).toString('base64');
    const rows = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);

      const column = Math.floor(image.width * 0.5);
      const brightness = (y: number) => {
        const i = (y * image.width + column) * 4;
        return (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      };

      // Верхняя четверть кадра — заведомо небо; полоса у середины — кайма.
      let sky = 0;
      for (let y = 0; y < image.height * 0.25; y += 4) sky = Math.max(sky, brightness(y));

      let limb = 0;
      for (let y = image.height * 0.45; y < image.height * 0.55; y += 2) {
        limb = Math.max(limb, brightness(y));
      }

      return { sky, limb };
    }, shot);

    expect(rows.limb, 'кайма у горизонта светится').toBeGreaterThan(30);
    // Выше слоя воздуха нет: там только звёзды, и они в этот столбец не
    // попадают. Свечение, размазанное по всему небу, здесь бы и вылезло.
    expect(rows.sky).toBeLessThan(rows.limb * 0.15);

    expectNoErrors(errors);
  });
});
