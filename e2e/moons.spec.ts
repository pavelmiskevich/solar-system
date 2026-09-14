import { expect, test } from '@playwright/test';

import { frameLight, openScene, pauseAt, waitForFrames, waitForStableExposure } from './helpers';

/**
 * Крупные спутники Марса, Сатурна, Урана, Нептуна и Плутона.
 *
 * Юнит-тесты проверяют числа: третий закон Кеплера, наклонения, синхронное
 * вращение. Здесь проверяется то, что из чисел не следует - попали ли тела в
 * сцену, встали ли в список, рисуются ли вблизи и в ту ли сторону идёт Тритон
 * после всех поворотов из плоскости Лапласа в мировые координаты. Ошибка в
 * этом переходе не трогает ни одного юнит-теста.
 */

const ADDED: { id: string; name: string; kind: string; host: string }[] = [
  { id: 'phobos', name: 'Фобос', kind: 'спутник Марса', host: 'mars' },
  { id: 'deimos', name: 'Деймос', kind: 'спутник Марса', host: 'mars' },
  { id: 'mimas', name: 'Мимас', kind: 'спутник Сатурна', host: 'saturn' },
  { id: 'enceladus', name: 'Энцелад', kind: 'спутник Сатурна', host: 'saturn' },
  { id: 'titania', name: 'Титания', kind: 'спутник Урана', host: 'uranus' },
  { id: 'oberon', name: 'Оберон', kind: 'спутник Урана', host: 'uranus' },
  { id: 'triton', name: 'Тритон', kind: 'спутник Нептуна', host: 'neptune' },
  { id: 'charon', name: 'Харон', kind: 'спутник Плутона', host: 'pluto' },
];

test.describe('крупные спутники', () => {
  test('стоят в списке тел за своей планетой и названы спутниками', async ({ page }) => {
    const errors = await openScene(page);

    await page.keyboard.press('KeyB');
    const rows = page.locator('#bodies .bodies-row');
    await expect(rows.first()).toBeVisible();

    const listed = await rows.evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.querySelector('.name')?.textContent ?? '',
        kind: element.querySelector('.kind')?.textContent ?? '',
      })),
    );
    const names = listed.map((row) => row.name);

    for (const moon of ADDED) {
      const at = names.indexOf(moon.name);
      expect(at, `${moon.name} не попал в список`).toBeGreaterThanOrEqual(0);
      // Род по умолчанию - «планета», и забытая строка выглядит правдоподобно:
      // в колонке просто одной планетой больше.
      expect(listed[at]!.kind, moon.name).toBe(moon.kind);
    }

    // Порядок: спутник стоит ниже своей планеты, планеты идут от Солнца.
    expect(names.indexOf('Фобос')).toBeGreaterThan(names.indexOf('Марс'));
    expect(names.indexOf('Тритон')).toBeGreaterThan(names.indexOf('Нептун'));
    expect(names.indexOf('Харон')).toBeGreaterThan(names.indexOf('Плутон'));
    expect(names.indexOf('Тритон')).toBeLessThan(names.indexOf('Плутон'));

    expect(errors).toEqual([]);
  });

  test('держатся возле своей планеты, а не улетают в пустоту', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    const measured = await page.evaluate((moons) => {
      const sim = window.sim;

      return moons.map(({ id, host }) => {
        const moon = sim.system.find(id);
        const planet = sim.system.find(host);
        if (!moon || !planet) return { id, radii: Number.NaN };

        // Расстояние в радиусах планеты: числа разного порядка сравнивать
        // иначе нельзя, у Фобоса это девять тысяч километров, у Оберона
        // почти шестьсот тысяч.
        return {
          id,
          radii: moon.worldPosition.distanceTo(planet.worldPosition) / planet.visualRadius,
        };
      });
    }, ADDED);

    for (const { id, radii } of measured) {
      expect(radii, `${id}: не нашёлся в сцене`).not.toBeNaN();
      // Ближе всех Фобос - 2.8 радиуса Марса, дальше всех Оберон - 23 радиуса
      // Урана. Всё, что вылезает за эти рамки, означает потерянный поворот
      // или перепутанные единицы.
      expect(radii, id).toBeGreaterThan(2);
      expect(radii, id).toBeLessThan(40);
    }
  });

  test('Тритон обходит Нептун в обратную сторону', async ({ page }) => {
    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    // Проверка идёт по мировым координатам сцены, а не по элементам орбиты:
    // между ними лежит поворот в плоскость экватора планеты, и ошибка в нём
    // юнит-тестами не ловится вовсе.
    const direction = await page.evaluate(async () => {
      const sim = window.sim;

      const offsetFrom = (hostId: string, moonId: string) => {
        const host = sim.system.find(hostId);
        const moon = sim.system.find(moonId);
        return moon.worldPosition.clone().sub(host.worldPosition);
      };
      const poleOf = (hostId: string) => {
        const host = sim.system.find(hostId);
        return new (host.worldPosition.constructor)(0, 1, 0).applyQuaternion(host.group.quaternion);
      };

      const sample = async (hostId: string, moonId: string, days: number) => {
        const start = sim.clock.jd;
        const first = offsetFrom(hostId, moonId);

        sim.clock.jd = start + days;
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        const second = offsetFrom(hostId, moonId);

        sim.clock.jd = start;
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

        // Момент импульса: знак его проекции на полюс планеты и есть ответ.
        return first.cross(second).dot(poleOf(hostId));
      };

      return {
        triton: await sample('neptune', 'triton', 0.4),
        titan: await sample('saturn', 'titan', 1),
        charon: await sample('pluto', 'charon', 0.4),
      };
    });

    // Единственный крупный спутник системы на обратной орбите: он не вырос
    // возле Нептуна, а был пойман из пояса Койпера.
    expect(direction.triton).toBeLessThan(0);
    // Соседи для сравнения: у них движение прямое, и знак противоположный.
    expect(direction.titan).toBeGreaterThan(0);
    expect(direction.charon).toBeGreaterThan(0);
  });

  test('Тритон вблизи рисуется освещённым диском', async ({ page }) => {
    test.setTimeout(120_000);

    await openScene(page);
    await pauseAt(page, '2026-08-14T12:00:00Z');

    // Встать в трёх радиусах так, чтобы Тритон был освещён: диск занимает
    // середину кадра, а по краям остаётся пустое небо.
    await page.evaluate(() => window.sim.goTo('triton', 3, 40));
    await waitForStableExposure(page);
    await waitForFrames(page, 3);

    const middle = await frameLight(page, 0.05);
    const whole = await frameLight(page, 0.45);

    // Диск светится: чёрная середина означала бы, что шейдер не собрался или
    // тело не встало туда, куда смотрит камера.
    expect(middle.median).toBeGreaterThan(8);
    // И это именно диск, а не равномерно засвеченный кадр: по краям темнее.
    // Без этой половины проверка проходила бы и на белом прямоугольнике.
    expect(middle.median).toBeGreaterThan(whole.median * 1.5);

    const shot = await page.locator('#viewport canvas').screenshot();
    await test.info().attach('тритон.png', { body: shot, contentType: 'image/png' });
  });
});
