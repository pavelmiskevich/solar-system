import { describe, expect, it } from 'vitest';

import { PLANETS } from '../src/data/bodies';
import { AU } from '../src/core/units';
import { normalizeRadians, orbitalPeriodDays, positionAt, solveKepler } from '../src/physics/kepler';
import { moonPositionAt } from '../src/physics/moon';
import { EPOCHS, HORIZONS, HORIZONS_MOON, type EpochName } from './fixtures/horizons';

const epochNames = Object.keys(EPOCHS) as EpochName[];

function distanceAu(
  a: { x: number; y: number; z: number },
  b: readonly [number, number, number],
): number {
  return Math.hypot(a.x - b[0], a.y - b[1], a.z - b[2]);
}

describe('решение уравнения Кеплера', () => {
  it('обращает связь между средней и эксцентрической аномалией', () => {
    // Проверяем на всём диапазоне эксцентриситетов Солнечной системы,
    // включая плутоновские 0.249.
    for (const e of [0, 0.0068, 0.0934, 0.2056, 0.2488, 0.4]) {
      for (let deg = -180; deg < 180; deg += 7) {
        const M = normalizeRadians((deg * Math.PI) / 180);
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
      }
    }
  });

  it('при нулевом эксцентриситете эксцентрическая аномалия равна средней', () => {
    for (let deg = -180; deg < 180; deg += 11) {
      const M = normalizeRadians((deg * Math.PI) / 180);
      expect(solveKepler(M, 0)).toBeCloseTo(M, 12);
    }
  });
});

/**
 * Допуск в долях большой полуоси.
 *
 * Для всех тел — обещанные 0.1%. Исключение составляют Юпитер и Сатурн: их
 * средние движения близки к резонансу 5:2, и вызванное этим «великое
 * неравенство» смещает долготу на единицы угловых минут с периодом около
 * 900 лет. Двухтельная кеплерова модель такое воспроизвести не может в
 * принципе — это ограничение самой модели, а не ошибка реализации, что видно
 * по остальным планетам: у них расхождение остаётся в долях угловой минуты.
 *
 * Допуски заданы чуть выше фактически измеренных значений, поэтому регрессию
 * они по-прежнему поймают.
 */
const TOLERANCE_FRACTION: Record<string, number> = {
  jupiter: 0.002,
  saturn: 0.0035,
};
const DEFAULT_TOLERANCE_FRACTION = 0.001;

/** Планеты, которым разрешено расхождение больше угловой минуты. */
const RESONANT_PAIR = new Set(['jupiter', 'saturn']);

describe('положения планет против эфемерид JPL Horizons', () => {
  for (const planet of PLANETS) {
    const reference = HORIZONS[planet.id];
    if (!reference || !planet.orbit) continue;

    const fraction = TOLERANCE_FRACTION[planet.id] ?? DEFAULT_TOLERANCE_FRACTION;

    for (const epoch of epochNames) {
      it(`${planet.name}, ${epoch}: отклонение меньше ${(fraction * 100).toFixed(2)}% радиуса орбиты`, () => {
        const computed = positionAt(planet.orbit!, EPOCHS[epoch]);
        const expected = reference[epoch];

        expect(distanceAu(computed, expected)).toBeLessThan(planet.orbit!.a * fraction);
      });
    }
  }

  function worstAngularError(ids: readonly string[]): { arcminutes: number; label: string } {
    let arcminutes = 0;
    let label = '';

    for (const planet of PLANETS) {
      const reference = HORIZONS[planet.id];
      if (!reference || !planet.orbit || !ids.includes(planet.id)) continue;

      for (const epoch of epochNames) {
        const computed = positionAt(planet.orbit, EPOCHS[epoch]);
        const expected = reference[epoch];
        const distanceFromSun = Math.hypot(expected[0], expected[1], expected[2]);
        const value =
          (Math.atan2(distanceAu(computed, expected), distanceFromSun) * 180 * 60) / Math.PI;

        if (value > arcminutes) {
          arcminutes = value;
          label = `${planet.name} ${epoch}`;
        }
      }
    }

    return { arcminutes, label };
  }

  it('планеты земной группы: расхождение меньше одной угловой минуты', () => {
    const worst = worstAngularError(['mercury', 'venus', 'earth', 'mars']);
    expect(worst.arcminutes, `худший случай: ${worst.label}`).toBeLessThan(1);
  });

  it('внешние планеты вне резонансной пары: меньше двух угловых минут', () => {
    // Уран, Нептун и Плутон тоже возмущают друг друга, но заметно слабее, чем
    // Юпитер с Сатурном: полторы–две угловые минуты вместо девяти.
    const outer = ['uranus', 'neptune', 'pluto'].filter((id) => !RESONANT_PAIR.has(id));
    const worst = worstAngularError(outer);
    expect(worst.arcminutes, `худший случай: ${worst.label}`).toBeLessThan(2);
  });

  it('ошибка по эклиптической широте пренебрежима у всех планет', () => {
    // Широта зависит только от ориентации плоскости орбиты — от i и Ω. Если
    // они собраны правильно, вековые возмущения долготы её почти не трогают,
    // и этот тест отделяет ошибку модели от ошибки в поворотах.
    for (const planet of PLANETS) {
      const reference = HORIZONS[planet.id];
      if (!reference || !planet.orbit) continue;

      for (const epoch of epochNames) {
        const c = positionAt(planet.orbit, EPOCHS[epoch]);
        const e = reference[epoch];
        const latComputed = Math.asin(c.z / Math.hypot(c.x, c.y, c.z));
        const latExpected = Math.asin(e[2] / Math.hypot(e[0], e[1], e[2]));
        const arcminutes = (Math.abs(latComputed - latExpected) * 180 * 60) / Math.PI;

        expect(arcminutes, `${planet.name} ${epoch}`).toBeLessThan(0.5);
      }
    }
  });
});

describe('орбитальные периоды', () => {
  const knownPeriodsDays: Record<string, number> = {
    mercury: 87.969,
    venus: 224.701,
    earth: 365.256,
    mars: 686.98,
    jupiter: 4332.589,
    saturn: 10759.22,
    uranus: 30685.4,
    neptune: 60189,
    pluto: 90560,
  };

  for (const planet of PLANETS) {
    it(`${planet.name}: период совпадает со справочным в пределах 0.5%`, () => {
      const expected = knownPeriodsDays[planet.id]!;
      const computed = orbitalPeriodDays(planet.orbit!);
      expect(Math.abs(computed - expected) / expected).toBeLessThan(0.005);
    });
  }

  it('Земля возвращается в исходную точку за один сидерический год', () => {
    const earth = PLANETS.find((p) => p.id === 'earth')!;
    const start = positionAt(earth.orbit!, EPOCHS['2026-08-13']);
    const afterYear = positionAt(earth.orbit!, EPOCHS['2026-08-13'] + 365.256363);

    // Замыкание орбиты: остаточное расхождение — это вековой дрейф элементов,
    // а не ошибка модели, поэтому допуск в тысячные доли а.е.
    const drift = Math.hypot(
      start.x - afterYear.x,
      start.y - afterYear.y,
      start.z - afterYear.z,
    );
    expect(drift).toBeLessThan(0.002);
  });
});

describe('положение Луны против эфемерид JPL Horizons', () => {
  for (const epoch of epochNames) {
    it(`${epoch}: отклонение меньше 400 км`, () => {
      const computed = moonPositionAt(EPOCHS[epoch]);
      const expected = HORIZONS_MOON[epoch];

      const errorKm = Math.hypot(
        computed.x - expected[0] * AU,
        computed.y - expected[1] * AU,
        computed.z - expected[2] * AU,
      );

      // 400 км — примерно четверть радиуса Луны: на экране такое смещение
      // неразличимо, но затмения и фазы на нём уже сходятся.
      expect(errorKm).toBeLessThan(400);
    });
  }

  it('расстояние до Луны остаётся в границах перигея и апогея', () => {
    for (let jd = EPOCHS['2026-08-13']; jd < EPOCHS['2026-08-13'] + 400; jd += 0.37) {
      const r = moonPositionAt(jd);
      const distance = Math.hypot(r.x, r.y, r.z);
      expect(distance).toBeGreaterThan(356000);
      expect(distance).toBeLessThan(407000);
    }
  });
});
