import { expect, test } from '@playwright/test';

import { expectNoErrors, openScene, pauseAt, waitForFrames } from './helpers';

/**
 * Сцена запускается и рисует.
 *
 * Проверяется то, что нельзя проверить юнит-тестом: страница действительно
 * получила WebGL2, шейдеры скомпилировались, каталог разобрался, цикл кадров
 * идёт. Ошибка компиляции шейдера не роняет модуль - она просто оставляет
 * чёрный экран, поэтому чистая консоль здесь такая же часть проверки, как и
 * содержимое сцены.
 */
test.describe('запуск сцены', () => {
  test('страница поднимается без ошибок и рисует кадры', async ({ page }) => {
    const errors = await openScene(page);

    // Кадры действительно идут: ждём десяток подряд. Если сцена встала,
    // ожидание не завершится и тест упадёт по таймауту - это и есть проверка.
    //
    // Считать кадры за фиксированную секунду нельзя, и это выяснилось на
    // первом же прогоне в CI: на runner без видеокарты за секунду набирается
    // ровно столько кадров, сколько успевает программный растеризатор, и порог
    // начинает проверять быстродействие машины, а не работоспособность сцены.
    await waitForFrames(page, 10);

    await expect(page.locator('#viewport canvas')).toBeVisible();
    // Счётчик кадров в HUD не должен стоять на нуле.
    await expect(page.locator('#hud')).toContainText(/[1-9]\d* fps/);

    expectNoErrors(errors);
  });

  test('время идёт и останавливается по паузе', async ({ page }) => {
    await openScene(page);

    const advanced = await page.evaluate(async () => {
      const before = window.sim.clock.jd;
      await new Promise((resolve) => setTimeout(resolve, 700));
      return window.sim.clock.jd - before;
    });
    // Стартовый масштаб - сутки в секунду, значит за 0.7 с проходит больше
    // половины модельных суток. Ноль означал бы, что цикл встал.
    expect(advanced).toBeGreaterThan(0);

    const frozen = await page.evaluate(async () => {
      window.sim.clock.paused = true;
      const before = window.sim.clock.jd;
      await new Promise((resolve) => setTimeout(resolve, 500));
      return window.sim.clock.jd - before;
    });
    expect(frozen).toBe(0);
  });

  test('в сцене все тела: планеты, Луна и спутники гигантов', async ({ page }) => {
    await openScene(page);

    const ids = await page.evaluate(() =>
      window.sim.system.bodies.map((b: any) => b.definition.id),
    );

    expect(ids).toEqual(
      expect.arrayContaining([
        'mercury',
        'venus',
        'earth',
        'moon',
        'mars',
        'jupiter',
        'io',
        'europa',
        'ganymede',
        'callisto',
        'saturn',
        'titan',
        'uranus',
        'neptune',
        'pluto',
      ]),
    );
  });

  test('каталог звёзд разобран и лежит на небесной сфере', async ({ page }) => {
    await openScene(page);

    const sky = await page.evaluate(() => {
      const points = window.sim.viewport.scene.children.find((c: any) => c.type === 'Points');
      const position = points.geometry.getAttribute('position');
      const radii: number[] = [];
      for (let i = 0; i < position.count; i += 500) {
        radii.push(
          Math.hypot(position.getX(i), position.getY(i), position.getZ(i)),
        );
      }
      return { count: position.count, radii };
    });

    expect(sky.count).toBe(8920);
    // Все звёзды на одной сфере: параллакса при перелётах быть не должно.
    const first = sky.radii[0]!;
    for (const radius of sky.radii) expect(radius / first).toBeCloseTo(1, 5);
  });

  test('положения планет держатся эфемерид JPL', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');
    await waitForFrames(page, 2);

    const au = await page.evaluate(() => {
      const AU = 149597870.7;
      const of = (id: string) => window.sim.system.find(id).worldPosition.length() / AU;
      return {
        mercury: of('mercury'),
        earth: of('earth'),
        jupiter: of('jupiter'),
        neptune: of('neptune'),
      };
    });

    // Расстояния от Солнца на эту дату - в пределах эксцентриситета орбит.
    expect(au.mercury).toBeGreaterThan(0.3);
    expect(au.mercury).toBeLessThan(0.47);
    expect(au.earth).toBeGreaterThan(0.98);
    expect(au.earth).toBeLessThan(1.02);
    expect(au.jupiter).toBeGreaterThan(4.95);
    expect(au.jupiter).toBeLessThan(5.46);
    expect(au.neptune).toBeGreaterThan(29.8);
    expect(au.neptune).toBeLessThan(30.4);
  });
});

/**
 * Пояс астероидов.
 *
 * Юнит-тесты стерегут каталог: люки Кирквуда, облака троянцев, совпадение
 * быстрой схемы положений с общей. Здесь проверяется другое - что рой
 * действительно доехал до сцены и встал там, где ему положено. Разобранный
 * каталог, из которого ничего не нарисовано, юнит-тесты прошёл бы весь.
 */
test.describe('малые тела', () => {
  test('рой лежит кольцом между Марсом и Юпитером и жмётся к эклиптике', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    const swarm = await page.evaluate(() => {
      const AU = 149597870.7;
      const position = window.sim.asteroids.points.geometry.getAttribute('position');

      const radii: number[] = [];
      const flatness: number[] = [];
      for (let i = 0; i < position.count; i += 3) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const r = Math.hypot(x, y, z);
        radii.push(r / AU);
        // Ось Y сцены - это z эклиптики, то есть высота над её плоскостью.
        flatness.push(Math.abs(y) / r);
      }

      radii.sort((a, b) => a - b);
      flatness.sort((a, b) => a - b);

      return {
        count: position.count,
        median: radii[radii.length >> 1]!,
        ninetieth: radii[Math.floor(radii.length * 0.9)]!,
        inner: radii.filter((r) => r < 1.7).length,
        medianFlatness: flatness[flatness.length >> 1]!,
      };
    });

    expect(swarm.count).toBe(4952);

    // Середина роя - главный пояс: их три с половиной тысячи из пяти.
    expect(swarm.median).toBeGreaterThan(2.2);
    expect(swarm.median).toBeLessThan(3.2);
    // Девяносто процентов внутри орбиты Юпитера: дальше только троянцы, и те
    // стоят на ней самой.
    expect(swarm.ninetieth).toBeLessThan(5.5);
    // Околоземные заходят внутрь марсианской орбиты - без них рой был бы
    // одним кольцом.
    expect(swarm.inner).toBeGreaterThan(20);
    // Пояс - диск, а не шар: половина тел не поднимается над эклиптикой выше
    // чем на девятую долю расстояния до Солнца, это около шести градусов.
    expect(swarm.medianFlatness).toBeLessThan(0.15);
  });

  test('рой идёт по орбитам вместе со временем сцены', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    const sample = () =>
      page.evaluate(() => {
        const position = window.sim.asteroids.points.geometry.getAttribute('position');
        const taken: number[] = [];
        for (let i = 0; i < 600; i += 60) {
          taken.push(position.getX(i), position.getY(i), position.getZ(i));
        }
        return taken;
      });

    const before = await sample();
    await pauseAt(page, '2027-08-14T12:00:00Z');
    const after = await sample();

    const AU = 149_597_870.7;
    let moved = 0;
    for (let i = 0; i < before.length; i += 3) {
      const shift = Math.hypot(
        after[i]! - before[i]!,
        after[i + 1]! - before[i + 1]!,
        after[i + 2]! - before[i + 2]!,
      );
      // За год тело главного пояса проходит около трети оборота: сдвиг
      // измеряется астрономическими единицами, а не километрами.
      if (shift > 0.5 * AU) moved += 1;
    }

    expect(moved).toBe(before.length / 3);
  });
});

/**
 * Сторож кадрового ожидания.
 *
 * Проверка про сами проверки, и она здесь не для полноты. Когда `waitForFrames`
 * ждал кадры без срока, вставшая сцена выедала весь предел теста, а падение
 * показывалось на случайной строке - причина пряталась ровно тогда, когда была
 * нужнее всего. Эта проверка стережёт, чтобы срок не потерялся снова.
 */
test.describe('ожидание кадров', () => {
  test('падает само и называет причину, когда кадры встали', async ({ page }) => {
    await openScene(page);

    // Останавливаем кадры начисто: дальше requestAnimationFrame никого не
    // вызывает, и сцена замирает - ровно то, что случается на CI само.
    await page.evaluate(() => {
      window.requestAnimationFrame = () => 0;
    });

    let error: Error | null = null;
    try {
      // Срок задан в самом вызове: без сторожа ожидание висело бы до общего
      // предела теста и упало бы в другом месте и с другими словами.
      await waitForFrames(page, 3, 2_000);
    } catch (caught) {
      error = caught as Error;
    }

    expect(error, 'ожидание обязано было упасть само').not.toBeNull();
    expect(error!.message).toContain('кадры не идут');
    expect(error!.message).toContain('получено 0 из 3');
  });
});

/**
 * Комета Галлея.
 *
 * Юнит-тесты стерегут механику: период, перигелий, направление хвостов.
 * Здесь проверяется, что всё это доехало до сцены и что хвост виден там, где
 * ему положено, - и пропадает там, где его быть не должно.
 */
test.describe('комета', () => {
  test('в перигелии у неё есть хвост, направленный от Солнца', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '1986-02-08T00:00:00Z');

    const tails = await page.evaluate(() => {
      const sim = window.sim;
      const comet = sim.system.find('halley');
      const groups = sim.cometTails.group.children;

      const nucleus = comet.worldPosition;
      const sunward = {
        x: -nucleus.x,
        y: -nucleus.y,
        z: -nucleus.z,
      };
      const sunLength = Math.hypot(sunward.x, sunward.y, sunward.z);

      return groups.map((mesh: any) => {
        const position = mesh.geometry.getAttribute('position');
        const last = position.count - 2;
        // Вершины ленты заданы относительно ядра: конец хвоста - это и есть
        // вектор от ядра наружу.
        const tip = { x: position.getX(last), y: position.getY(last), z: position.getZ(last) };
        const tipLength = Math.hypot(tip.x, tip.y, tip.z);
        const cos =
          (tip.x * sunward.x + tip.y * sunward.y + tip.z * sunward.z) / (tipLength * sunLength);

        return { visible: mesh.visible, lengthKm: tipLength, towardsSun: cos };
      });
    });

    expect(tails).toHaveLength(2);

    for (const tail of tails) {
      expect(tail.visible).toBe(true);
      // Десятки миллионов километров: хвост длиннее, чем расстояние от Солнца
      // до Меркурия.
      expect(tail.lengthKm).toBeGreaterThan(1e7);
      // Косинус с направлением на Солнце отрицателен - значит хвост смотрит
      // прочь от него. У пылевого он не строго минус единица: тот изогнут.
      expect(tail.towardsSun).toBeLessThan(-0.5);
    }
  });

  test('у афелия хвоста нет вовсе', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2026-09-19T00:00:00Z');

    const state = await page.evaluate(() => {
      const sim = window.sim;
      const comet = sim.system.find('halley');
      return {
        sunAu: comet.worldPosition.length() / 149_597_870.7,
        visible: sim.cometTails.group.children.map((mesh: any) => mesh.visible),
      };
    });

    // Сейчас комета за орбитой Нептуна: тепла на испарение не хватает, и
    // светиться нечему.
    expect(state.sunAu).toBeGreaterThan(30);
    expect(state.visible).toEqual([false, false]);
  });
});
