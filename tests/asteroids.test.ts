import { describe, expect, it } from 'vitest';

import { asteroidCatalog, positionOf } from '../src/data/asteroids';
import { ASTEROID_COUNT, ASTEROID_GROUPS } from '../src/data/asteroids.generated';
import { PLANETS } from '../src/data/bodies';
import { DEG, RAD } from '../src/core/units';
import { normalizeRadians, positionAt } from '../src/physics/kepler';

describe('каталог малых тел', () => {
  it('разбирается целиком и совпадает по числу записей', () => {
    const catalog = asteroidCatalog();

    expect(catalog.count).toBe(ASTEROID_COUNT);
    expect(catalog.semiMajorAxis).toHaveLength(ASTEROID_COUNT);
    expect(catalog.meanMotion).toHaveLength(ASTEROID_COUNT);

    const groups = Object.values(ASTEROID_GROUPS);
    const total = groups.reduce((sum, group) => sum + group.count, 0);
    expect(total).toBe(ASTEROID_COUNT);
  });

  it('держит элементы в физических пределах', () => {
    const catalog = asteroidCatalog();

    for (let i = 0; i < catalog.count; i += 1) {
      expect(catalog.semiMajorAxis[i]!).toBeGreaterThan(0.3);
      expect(catalog.semiMajorAxis[i]!).toBeLessThan(6);
      expect(catalog.eccentricity[i]!).toBeGreaterThanOrEqual(0);
      // Эллипс, а не парабола: разомкнутых орбит в выборке быть не должно.
      expect(catalog.eccentricity[i]!).toBeLessThan(1);
      expect(catalog.inclination[i]!).toBeGreaterThanOrEqual(0);
      expect(catalog.inclination[i]!).toBeLessThanOrEqual(Math.PI);
    }
  });
});

describe('люки Кирквуда', () => {
  /**
   * Гистограмма больших полуосей главного пояса.
   *
   * Корзина в сотую астрономической единицы - мельче люка и крупнее шага
   * упаковки, так что провал не размазывается и не тонет в шуме.
   */
  function beltHistogram(binAu = 0.01) {
    const catalog = asteroidCatalog();
    const { start, count } = ASTEROID_GROUPS.belt;
    const bins = new Map<number, number>();

    for (let i = start; i < start + count; i += 1) {
      const bin = Math.floor(catalog.semiMajorAxis[i]! / binAu);
      bins.set(bin, (bins.get(bin) ?? 0) + 1);
    }

    return {
      /** Сколько тел в корзине, куда попадает данная полуось. */
      at: (au: number) => bins.get(Math.floor(au / binAu)) ?? 0,
      /** Средняя населённость корзин в промежутке, мимо самого люка. */
      around: (au: number, halfWidthAu: number, skipAu: number) => {
        let sum = 0;
        let taken = 0;
        for (let x = au - halfWidthAu; x <= au + halfWidthAu; x += binAu) {
          if (Math.abs(x - au) < skipAu) continue;
          sum += bins.get(Math.floor(x / binAu)) ?? 0;
          taken += 1;
        }
        return sum / taken;
      },
    };
  }

  /**
   * Люк глубже вдвое против окрестности - граница нарочно осторожная.
   *
   * В сегодняшнем каталоге на 3:1 и 2:1 не стоит ни одного тела при трёх
   * десятках в соседних корзинах, но резать проверку впритык к этим числам
   * значит ловить ей обновление каталога, а не физику.
   *
   * Сравнение с окрестностью идёт вместе с проверкой самой окрестности:
   * пустая гистограмма прошла бы условие «в люке меньше» не глядя.
   */
  function expectGap(au: number) {
    const histogram = beltHistogram();
    const inside = histogram.at(au);
    const around = histogram.around(au, 0.2, 0.05);

    expect(around).toBeGreaterThan(10);
    expect(inside).toBeLessThan(around / 2);
  }

  it('провал на резонансе 3:1 с Юпитером, 2.50 а.е.', () => {
    expectGap(2.502);
  });

  it('провал на резонансе 2:1 с Юпитером, 3.28 а.е.', () => {
    expectGap(3.279);
  });

  it('провалы послабее: 5:2 и 7:3', () => {
    expectGap(2.825);
    expectGap(2.958);
  });

  it('между люками пояс населён', () => {
    const histogram = beltHistogram();

    // Сердцевина пояса: около сотни тел в одной сотой а.е. Проверка ловит
    // выборку, случайно урезанную до горстки записей.
    expect(histogram.at(3.0)).toBeGreaterThan(50);
  });
});

describe('быстрая схема положений', () => {
  /**
   * Та же орбита в записи планетной таблицы Стэндиша.
   *
   * Каталог малых тел даёт средний аномалий на эпоху, а `positionAt` ждёт
   * среднюю долготу и долготу перигелия - отсюда перевод.
   */
  function asStandishElements(index: number, jd: number) {
    const catalog = asteroidCatalog();
    const node = catalog.node[index]! * RAD;
    const argPeriapsis = catalog.argPeriapsis[index]! * RAD;
    const meanAnomaly =
      (catalog.meanAnomaly[index]! + catalog.meanMotion[index]! * (jd - catalog.epoch)) * RAD;

    return {
      a: catalog.semiMajorAxis[index]!,
      e: catalog.eccentricity[index]!,
      i: catalog.inclination[index]! * RAD,
      L: meanAnomaly + argPeriapsis + node,
      lp: argPeriapsis + node,
      node,
      aDot: 0,
      eDot: 0,
      iDot: 0,
      LDot: 0,
      lpDot: 0,
      nodeDot: 0,
    };
  }

  it('совпадает с positionAt на крупнейших телах пояса', () => {
    const catalog = asteroidCatalog();

    for (const jd of [catalog.epoch, catalog.epoch + 500, catalog.epoch - 3000]) {
      for (let index = 0; index < 12; index += 1) {
        const fast = positionOf(catalog, index, jd);
        const reference = positionAt(asStandishElements(index, jd), jd);

        const error = Math.hypot(
          fast.x - reference.x,
          fast.y - reference.y,
          fast.z - reference.z,
        );
        // Десять тысяч километров при радиусе орбиты в сотни миллионов: это
        // шаг упаковки элементов, а не расхождение схем.
        expect(error).toBeLessThan(1e-4);
      }
    }
  });

  it('расстояние до Солнца держится между перигелием и афелием', () => {
    const catalog = asteroidCatalog();

    for (let index = 0; index < catalog.count; index += 37) {
      const a = catalog.semiMajorAxis[index]!;
      const e = catalog.eccentricity[index]!;
      const position = positionOf(catalog, index, catalog.epoch + 1234);
      const r = Math.hypot(position.x, position.y, position.z);

      expect(r).toBeGreaterThanOrEqual(a * (1 - e) - 1e-6);
      expect(r).toBeLessThanOrEqual(a * (1 + e) + 1e-6);
    }
  });
});

describe('троянцы Юпитера', () => {
  it('держатся возле точек Лагранжа, на шестьдесят градусов от планеты', () => {
    const catalog = asteroidCatalog();
    const jupiter = PLANETS.find((planet) => planet.id === 'jupiter')!;
    const jd = catalog.epoch;

    const planet = positionAt(jupiter.orbit!, jd);
    const planetLongitude = Math.atan2(planet.y, planet.x);

    const { start, count } = ASTEROID_GROUPS.trojans;
    let leading = 0;
    let trailing = 0;
    let between = 0;

    for (let i = start; i < start + count; i += 1) {
      const body = positionOf(catalog, i, jd);
      const longitude = Math.atan2(body.y, body.x);
      // Разность долгот в пределах ±180°: у греков она около +60°, у троянцев
      // около −60°, и путать знак здесь нельзя. normalizeRadians приводит
      // угол к (−π, π] сама, сдвигать его перед ней не нужно.
      const degrees = normalizeRadians(longitude - planetLongitude) * RAD;

      if (Math.abs(degrees - 60) <= 40) leading += 1;
      else if (Math.abs(degrees + 60) <= 40) trailing += 1;
      else between += 1;
    }

    // Оба облака населены, и в каждом сотни тел: греки впереди Юпитера
    // многочисленнее троянцев позади, но не на порядок.
    expect(leading).toBeGreaterThan(100);
    expect(trailing).toBeGreaterThan(100);
    // Либрация вокруг точки Лагранжа доходит до тридцати градусов, но между
    // облаками пусто: тело, ушедшее оттуда, перестаёт быть троянцем.
    expect(between).toBeLessThan(count * 0.15);
  });

  it('ходят по орбите Юпитера, а не по своей', () => {
    const catalog = asteroidCatalog();
    const jupiter = PLANETS.find((planet) => planet.id === 'jupiter')!;
    const { start, count } = ASTEROID_GROUPS.trojans;

    let inside = 0;
    for (let i = start; i < start + count; i += 1) {
      // Резонанс 1:1 - это равенство больших полуосей, а с ним и периодов.
      if (Math.abs(catalog.semiMajorAxis[i]! - jupiter.orbit!.a) < 0.3) inside += 1;
    }

    expect(inside).toBeGreaterThan(count * 0.9);
  });
});

describe('околоземные', () => {
  it('заходят внутрь орбиты Марса', () => {
    const catalog = asteroidCatalog();
    const mars = PLANETS.find((planet) => planet.id === 'mars')!;
    const { start, count } = ASTEROID_GROUPS.nearEarth;

    let crossing = 0;
    for (let i = start; i < start + count; i += 1) {
      const perihelion = catalog.semiMajorAxis[i]! * (1 - catalog.eccentricity[i]!);
      if (perihelion < mars.orbit!.a) crossing += 1;
    }

    // Определение группы: перигелий ближе 1.3 а.е. По нему они все и отобраны,
    // так что внутрь марсианской орбиты заходят поголовно.
    expect(crossing).toBe(count);
  });

  it('наклонения разбросаны шире, чем в поясе', () => {
    const catalog = asteroidCatalog();

    const spread = (group: { start: number; count: number }) => {
      let sum = 0;
      for (let i = group.start; i < group.start + group.count; i += 1) {
        sum += catalog.inclination[i]! * RAD;
      }
      return sum / group.count;
    };

    // Пояс - это диск, а околоземные приходят кто откуда: их средний наклон
    // заметно больше. Проверка ловит перепутанные местами группы.
    expect(spread(ASTEROID_GROUPS.nearEarth)).toBeGreaterThan(spread(ASTEROID_GROUPS.belt));
  });

  it('величины отобраны мельче, чем в поясе', () => {
    const catalog = asteroidCatalog();

    const faintest = (group: { start: number; count: number }) => {
      let worst = -Infinity;
      for (let i = group.start; i < group.start + group.count; i += 1) {
        worst = Math.max(worst, catalog.magnitude[i]!);
      }
      return worst;
    };

    expect(faintest(ASTEROID_GROUPS.belt)).toBeLessThan(13);
    expect(faintest(ASTEROID_GROUPS.nearEarth)).toBeGreaterThan(13);
  });
});

describe('единицы каталога', () => {
  it('углы разобраны в радианах, а не в градусах', () => {
    const catalog = asteroidCatalog();

    let maxNode = 0;
    for (let i = 0; i < catalog.count; i += 1) {
      maxNode = Math.max(maxNode, catalog.node[i]!);
    }

    // Долгота узла обходит полный круг, и в радианах её максимум чуть меньше
    // 2π. Если бы разбор оставил градусы, здесь было бы около 360.
    expect(maxNode).toBeGreaterThan(6);
    expect(maxNode).toBeLessThan(Math.PI * 2 + 1e-6);
  });

  it('среднее движение согласовано с большой полуосью', () => {
    const catalog = asteroidCatalog();

    for (let i = 0; i < catalog.count; i += 211) {
      // Третий закон Кеплера: n = k · a^(−3/2), где k - гауссова постоянная.
      const expected = 0.9856076686 * DEG * Math.pow(catalog.semiMajorAxis[i]!, -1.5);
      expect(catalog.meanMotion[i]!).toBeCloseTo(expected, 8);
    }
  });
});
