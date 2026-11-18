import { expect, test, type Page } from '@playwright/test';

import {
  openScene,
  pauseAt,
  waitForArrival,
  waitForFrames,
  waitForStableExposure,
} from './helpers';

/**
 * Рендеринг: экспозиция, кольца, поверхности.
 *
 * Всё, что живёт в шейдерах, юнит-тестами недостижимо. Здесь проверяется не
 * «красиво ли», а то, что поддаётся измерению: адаптируется ли экспозиция,
 * попала ли в кадр ночная сторона, есть ли у планеты кольца, не выродилась ли
 * картинка в чёрный прямоугольник.
 */

/**
 * Держать качество на верхней ступени.
 *
 * Программный растеризатор CI медленный, и адаптивное качество снимает
 * сглаживание первым, за несколько секунд. Проверке сглаживания нужно именно
 * оно, поэтому адаптация замораживается, а верхняя ступень ставится явно.
 */
async function holdFullQuality(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sim = window.sim;
    sim.quality.update = () => false;
    sim.viewport.setMsaaEnabled(true);
    sim.viewport.setBloomEnabled(true);
    sim.viewport.setResolutionScale(1);
  });
}

test.describe('рендеринг', () => {
  test('экспозиция раскрывается на ночной стороне и возвращается на дневной', async ({ page }) => {
    /*
     * Втрое больше общего лимита, и это не запас на всякий случай.
     *
     * Тест ждёт три полных цикла адаптации, а она идёт по `dt` кадрового
     * цикла, ограниченному сверху величиной 1/15 секунды. Пока кадры идут
     * часто, ограничение не срабатывает и адаптация течёт вровень с настенным
     * временем. На runner без видеокарты сцена выдаёт около четырёх кадров в
     * секунду - ограничение срабатывает на каждом, и адаптация замедляется
     * примерно вчетверо. Три цикла, укладывающиеся в полминуты на живой
     * машине, там занимают под две минуты.
     */
    test.setTimeout(300_000);

    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    // Дневная сторона Луны: экспозиция около единицы, как и положено в одной
    // астрономической единице от Солнца.
    await page.evaluate(() => window.sim.goTo('moon', 3.2, 50));
    const day = await waitForStableExposure(page);

    expect(day).toBeGreaterThan(0.5);
    expect(day).toBeLessThan(3);

    // Ночная сторона: света в десять тысяч раз меньше, и «зрачок» раскрывается.
    await page.evaluate(() => window.sim.goTo('moon', 3.2, 170));
    const night = await waitForStableExposure(page);

    expect(night).toBeGreaterThan(day * 50);

    // И возвращается обратно, когда снова смотрим на освещённое.
    await page.evaluate(() => window.sim.goTo('moon', 3.2, 50));
    const back = await waitForStableExposure(page);

    expect(back).toBeLessThan(night / 10);
  });

  test('у Сатурна и Урана есть кольца, у Земли нет', async ({ page }) => {
    await openScene(page);

    const rings = await page.evaluate(() => ({
      saturn: !!window.sim.system.find('saturn').rings,
      uranus: !!window.sim.system.find('uranus').rings,
      earth: !!window.sim.system.find('earth').rings,
      saturnBands: window.sim.system.find('saturn').appearance.rings.bands.length,
      uranusBands: window.sim.system.find('uranus').appearance.rings.bands.length,
    }));

    expect(rings.saturn).toBe(true);
    expect(rings.uranus).toBe(true);
    expect(rings.earth).toBe(false);
    expect(rings.saturnBands).toBeGreaterThanOrEqual(4);
    expect(rings.uranusBands).toBe(10);
  });

  test('с неосвещённой стороны кольца выворачиваются негативом', async ({ page }) => {
    /*
     * Кольцо - не поверхность, а слой обломков, и с теневой стороны оно не
     * отражает, а просвечивает. Значит, плотная полоса, самая яркая на свету,
     * с изнанки самая тёмная: сквозь неё почти ничего не проходит. Это видно
     * на снимках «Кассини» и это единственная проверка на то, что кольца не
     * гасятся с изнанки одним множителем - при нём порядок полос сохранялся бы.
     */
    await openScene(page);

    // Начало 2032 года: кольца раскрыты к Солнцу почти на максимум, и разница
    // между полосами видна. У равноденствия мерить было бы нечего.
    const radii = { C: 83_000, B: 104_000, cassini: 119_800, A: 129_000 };

    await page.evaluate(() => {
      const sim = window.sim;
      sim.setDate('2032-01-01T00:00:00Z');
      sim.clock.paused = true;

      const saturn = sim.system.find('saturn');
      const p = saturn.worldPosition;
      const V = p.constructor;

      // Камера встаёт зеркально Солнцу относительно плоскости колец: планета
      // при этом освещена, а кольца видны на просвет под тем же углом.
      const pole = new V(0, 1, 0).applyQuaternion(saturn.group.quaternion).normalize();
      const toSun = new V(-p.x, -p.y, -p.z).normalize();
      const mirrored = toSun.clone().addScaledVector(pole, -2 * toSun.dot(pole));
      const d = saturn.visualRadius * 4.2;

      sim.lookAt(
        [p.x + mirrored.x * d, p.y + mirrored.y * d, p.z + mirrored.z * d],
        [p.x, p.y, p.z],
      );
    });

    await page.waitForTimeout(3000);
    await waitForFrames(page, 3);

    const shot = (await page.screenshot()).toString('base64');
    const light = await page.evaluate(
      async ([base64, radii]) => {
        const sim = window.sim;
        const saturn = sim.system.find('saturn');
        const centre = saturn.group.position;
        const V = centre.constructor;

        // Анса - та сторона колец, что уходит от планеты поперёк луча зрения:
        // там кольцо видно само по себе, а не на фоне диска.
        const pole = new V(0, 1, 0).applyQuaternion(saturn.group.quaternion).normalize();
        const view = new V(centre.x, centre.y, centre.z).normalize();
        const ansa = new V().crossVectors(pole, view).normalize();

        const image = new Image();
        image.src = `data:image/png;base64,${base64 as string}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, image.width, image.height);

        const at = (radius: number): number => {
          const point = new V(
            centre.x + ansa.x * radius,
            centre.y + ansa.y * radius,
            centre.z + ansa.z * radius,
          ).project(sim.viewport.camera);

          const px = Math.round(((point.x + 1) / 2) * image.width);
          const py = Math.round(((1 - point.y) / 2) * image.height);

          // Пятно, а не пиксель: колечки дают разброс на соседних пикселях.
          let sum = 0;
          let count = 0;
          for (let y = py - 2; y <= py + 2; y++) {
            for (let x = px - 2; x <= px + 2; x++) {
              const i = (y * image.width + x) * 4;
              sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
              count++;
            }
          }
          return sum / count;
        };

        const r = radii as Record<string, number>;
        return { C: at(r.C!), B: at(r.B!), cassini: at(r.cassini!), A: at(r.A!) };
      },
      [shot, radii] as const,
    );

    // Кольцо B плотнее всех - с изнанки оно и темнее всех. Единый множитель
    // оставил бы его самым ярким, каким оно выглядит с освещённой стороны.
    expect(light.B).toBeLessThan(light.C * 0.5);
    expect(light.B).toBeLessThan(light.cassini * 0.5);
    expect(light.B).toBeLessThan(light.A);
    // Но не в ноль: кольца обязаны остаться видимыми, иначе это тот же дефект
    // с другой стороны.
    expect(light.C).toBeGreaterThan(3);
    expect(light.cassini).toBeGreaterThan(3);
    expect(light.A).toBeGreaterThan(1);
  });

  test('спутники держатся в плоскости экватора своей планеты', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    const tilt = await page.evaluate(() => {
      const sim = window.sim;
      const jupiter = sim.system.find('jupiter');
      const pole = new (jupiter.worldPosition.constructor)(0, 1, 0).applyQuaternion(
        jupiter.group.quaternion,
      );

      return ['io', 'europa', 'ganymede', 'callisto'].map((id) => {
        const moon = sim.system.find(id);
        const offset = moon.worldPosition.clone().sub(jupiter.worldPosition);
        return Math.abs(offset.dot(pole) / offset.length());
      });
    });

    // Наклонение орбит к экватору Юпитера - меньше половины градуса.
    for (const value of tilt) expect(value).toBeLessThan(0.02);
  });

  test('у Юпитера четыре линии орбит, и каждая проходит через свой спутник', async ({
    page,
  }) => {
    await openScene(page);
    await page.evaluate(() => window.sim.travelTo('jupiter'));
    await waitForArrival(page, 'jupiter');
    await waitForFrames(page, 3);

    const measured = await page.evaluate(() => {
      const sim = window.sim;
      const jupiter = sim.system.find('jupiter');

      // Группа Юпитера узнаётся по самому вектору его положения: плавающее
      // начало координат ведёт группу именно по нему.
      const entry = sim.satelliteOrbits.groups.find(
        (candidate: { worldPosition: unknown }) => candidate.worldPosition === jupiter.worldPosition,
      );
      if (!entry) return null;

      const lines = entry.group.children;

      /** Расстояние от точки до ломаной линии, а не до ближайшего её узла. */
      const distanceToLine = (line: any, target: { x: number; y: number; z: number }) => {
        const array = line.geometry.getAttribute('position').array as Float32Array;
        let best = Infinity;

        for (let i = 0; i + 1 < array.length / 3; i += 1) {
          const ax = array[i * 3]!;
          const ay = array[i * 3 + 1]!;
          const az = array[i * 3 + 2]!;
          const bx = array[i * 3 + 3]!;
          const by = array[i * 3 + 4]!;
          const bz = array[i * 3 + 5]!;

          const sx = bx - ax;
          const sy = by - ay;
          const sz = bz - az;
          const lengthSquared = sx * sx + sy * sy + sz * sz;
          const dot = (target.x - ax) * sx + (target.y - ay) * sy + (target.z - az) * sz;
          const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, dot / lengthSquared));

          const dx = target.x - (ax + sx * t);
          const dy = target.y - (ay + sy * t);
          const dz = target.z - (az + sz * t);
          best = Math.min(best, Math.sqrt(dx * dx + dy * dy + dz * dz));
        }

        return best;
      };

      /** Замкнута ли линия: последняя точка совпадает с первой. */
      const gap = (line: any) => {
        const array = line.geometry.getAttribute('position').array as Float32Array;
        const last = array.length - 3;
        return Math.hypot(array[0]! - array[last]!, array[1]! - array[last + 1]!, array[2]! - array[last + 2]!);
      };

      // Геометрия линий задана относительно планеты, поэтому и спутник берётся
      // смещением от неё, а не мировыми координатами.
      const moons = ['io', 'europa', 'ganymede', 'callisto'].map((id) => {
        const moon = sim.system.find(id);
        const offset = {
          x: moon.worldPosition.x - jupiter.worldPosition.x,
          y: moon.worldPosition.y - jupiter.worldPosition.y,
          z: moon.worldPosition.z - jupiter.worldPosition.z,
        };
        const distances = lines.map((line: unknown) => distanceToLine(line, offset));
        const nearest = distances.indexOf(Math.min(...distances));

        return {
          id,
          nearest,
          distance: distances[nearest],
          radius: Math.hypot(offset.x, offset.y, offset.z),
          visible: (lines[nearest] as { visible: boolean }).visible,
        };
      });

      return { count: lines.length, gaps: lines.map(gap), moons };
    });

    expect(measured, 'линии орбит спутников не найдены в сцене').not.toBeNull();
    expect(measured!.count).toBe(4);

    // Замкнутость: эллипс спутника неподвижен в системе планеты, поэтому
    // концы линии обязаны сойтись точно, а не примерно.
    for (const gap of measured!.gaps) expect(gap).toBeLessThan(1);

    // Каждая линия своя: четыре спутника не могут делить одну.
    expect(new Set(measured!.moons.map((moon) => moon.nearest)).size).toBe(4);

    for (const moon of measured!.moons) {
      expect(moon.visible, `линия ${moon.id} погашена у самой планеты`).toBe(true);
      // Тысячная доля радиуса орбиты: линия проходит через тело, а не рядом.
      expect(moon.distance, `линия ${moon.id} не проходит через спутник`).toBeLessThan(
        moon.radius * 1e-3,
      );
    }
  });
  test('кадр не чёрный: сцена действительно рисуется', async ({ page }) => {
    await openScene(page);
    await page.evaluate(() => window.sim.travelTo('jupiter'));
    await waitForArrival(page, 'jupiter');
    await waitForFrames(page, 3);

    // Замер яркости кадра делает сама сцена - тем же буфером, которым живёт
    // экспозиция. Ноль означал бы, что в кадре пусто.
    const luminance = await page.evaluate(() => {
      const sim = window.sim;
      return sim.exposure.value;
    });
    expect(luminance).toBeGreaterThan(0);

    const shot = await page.locator('#viewport canvas').screenshot();
    expect(shot.byteLength).toBeGreaterThan(5000);

    await test.info().attach('юпитер.png', { body: shot, contentType: 'image/png' });
  });

  test('сглаживание взято в буфере композитора, а не на канвасе', async ({ page }) => {
    await openScene(page);
    await holdFullQuality(page);

    // Сцена рисуется в буфер композитора, до канваса доходит только последний
    // полноэкранный квадрат. Сглаживание канваса этому квадрату ничего не даёт,
    // поэтому сэмплы нужны буферам, а канвасу - нет.
    const setup = await page.evaluate(() => {
      const viewport = window.sim.viewport;
      return {
        rt1: viewport.composer.renderTarget1.samples as number,
        rt2: viewport.composer.renderTarget2.samples as number,
        canvas: viewport.renderer.getContext().getContextAttributes().antialias as boolean,
      };
    });

    expect(setup.rt1).toBeGreaterThan(0);
    expect(setup.rt2).toBeGreaterThan(0);
    expect(setup.canvas).toBe(false);
  });

  test('на программном рендерере сцена начинает без сглаживания', async ({ page }) => {
    // CI рисует через SwiftShader - тот же путь, что у посетителя без
    // видеокарты. Сглаживание там роняет кадр до единиц в секунду, и сцена
    // обязана узнать это сама, а не ждать, пока заметит адаптивное качество.
    await openScene(page);

    const start = await page.evaluate(() => ({
      software: window.sim.viewport.softwareRendered as boolean,
      level: window.sim.quality.levelIndex as number,
      samples: window.sim.viewport.composer.renderTarget1.samples as number,
    }));

    expect(start.software).toBe(true);
    expect(start.level).toBeGreaterThanOrEqual(1);
    expect(start.samples).toBe(0);
  });

  test('край диска сглажен: за ним есть полупокрытые пиксели', async ({ page }) => {
    /*
     * Луна в полной фазе на чёрном небе: диск освещён почти ровно, и край
     * зависит только от того, как растеризован силуэт.
     *
     * Без сглаживания пиксель сразу за краем либо внутри, либо снаружи: на
     * снимке он ровно чёрный в каждой строке. Со сглаживанием край пересекает
     * часть пикселя, и тот получает долю яркости диска. Мерится именно этот
     * пиксель, а не перепад внутри диска: перепад дают и моря, и освещение,
     * а частичную яркость за краем - только покрытие.
     */
    await openScene(page);
    await holdFullQuality(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');
    await page.evaluate(() => {
      window.sim.labels.setEnabled(false);
      window.sim.goTo('moon', 6, 0);
    });
    await waitForStableExposure(page);

    const shot = (await page.locator('#viewport canvas').screenshot()).toString('base64');
    const edge = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
      const lum = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        return (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      };

      // Край в строке - первый тёмный пиксель, если идти от центра влево.
      // Порог тёмного - пятая часть яркости диска: полупокрытые пиксели
      // темнее её не всегда, но последний из них - всегда.
      const cx = width >> 1;
      const cy = height >> 1;
      const dark = lum(cx, cy) / 5;
      let radius = 0;
      while (cx - radius > 0 && lum(cx - radius, cy) > dark) radius += 1;

      let rows = 0;
      let partial = 0;
      const span = Math.floor(radius * 0.8);
      for (let y = cy - span; y <= cy + span; y += 3) {
        let x = cx;
        while (x > 0 && lum(x, y) > dark) x -= 1;
        rows += 1;
        // Небо рядом с Луной чёрное до нуля: всё, что ярче нескольких единиц,
        // - доля диска в этом пикселе.
        if (lum(x, y) > 4) partial += 1;
      }
      return { radius, rows, partial };
    }, shot);

    // Диск должен быть в кадре и крупным - иначе мерить нечего.
    expect(edge.radius).toBeGreaterThan(40);
    // Со сглаживанием полупокрыто около сорока процентов строк, без него - ни
    // одной.
    // Порог вчетверо ниже первого и с запасом выше второго.
    expect(edge.partial / edge.rows).toBeGreaterThan(0.1);
  });

  test('адаптивное качество не срабатывает на ровном кадре', async ({ page }) => {
    await openScene(page);

    // Программный растеризатор медленный, и качество может понизиться - это
    // штатное поведение, причём на несколько ступеней подряд. Проверяем, что
    // механизм не переключается туда-сюда: за пять секунд уровень только
    // опускается или стоит, но не возвращается вверх.
    const levels = await page.evaluate(async () => {
      const sim = window.sim;
      const seen: number[] = [sim.quality.levelIndex as number];
      for (let i = 0; i < 25; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        seen.push(sim.quality.levelIndex as number);
      }
      return seen;
    });

    for (let i = 1; i < levels.length; i++) {
      expect(levels[i], `уровни по замерам: ${levels.join(' ')}`).toBeGreaterThanOrEqual(
        levels[i - 1]!,
      );
    }
  });
});
