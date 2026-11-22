import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { bodyFacts } from '../src/data/bodyFacts';
import { MOONS, bodyById } from '../src/data/bodies';
import { equatorialBasis } from '../src/physics/rotation';
import { orbitNormalInHost } from '../src/physics/satellite';
import {
  formatMass,
  formatOrbitalPeriod,
  formatRelative,
  formatRotationPeriod,
} from '../src/ui/bodyCard';

const facts = (id: string) => bodyFacts(bodyById(id)!);

describe('bodyFacts', () => {
  it('период обращения выводится из большой полуоси третьим законом Кеплера', () => {
    // Справочные сидерические периоды: Земля 365.256, Юпитер 4332.6 суток.
    expect(facts('earth').orbitalPeriodDays!).toBeCloseTo(365.25, 0);
    expect(facts('jupiter').orbitalPeriodDays! / 4332.6).toBeCloseTo(1, 2);
    expect(facts('neptune').orbitalPeriodDays! / 60195).toBeCloseTo(1, 2);
  });

  it('у Солнца периода обращения нет, у Луны он равен сидерическому месяцу', () => {
    expect(facts('sun').orbitalPeriodDays).toBeNull();
    expect(facts('moon').orbitalPeriodDays!).toBeCloseTo(27.32, 2);
  });

  it('наклон оси совпадает со справочным', () => {
    expect(facts('earth').axialTiltDeg).toBeCloseTo(23.44, 1);
    expect(facts('saturn').axialTiltDeg).toBeCloseTo(26.73, 1);
    // Уран лежит на боку, Венера перевёрнута почти вверх ногами.
    expect(facts('uranus').axialTiltDeg).toBeCloseTo(97.77, 0);
    expect(facts('venus').axialTiltDeg).toBeCloseTo(177.36, 0);
  });

  it('обратное вращение Венеры и Урана даёт отрицательный период', () => {
    expect(facts('venus').rotationPeriodDays).toBeLessThan(0);
    expect(facts('uranus').rotationPeriodDays).toBeLessThan(0);
    expect(Math.abs(facts('venus').rotationPeriodDays)).toBeCloseTo(243.02, 1);
  });

  it('сутки Юпитера - девять часов пятьдесят пять минут', () => {
    expect(facts('jupiter').rotationPeriodDays * 24).toBeCloseTo(9.925, 2);
  });
});

describe('форматирование карточки', () => {
  it('масса пишется мантиссой и степенью десяти', () => {
    expect(formatMass(5.97237e24)).toBe('5.97·10²⁴ кг');
    expect(formatMass(1.8982e27)).toBe('1.90·10²⁷ кг');
  });

  it('период обращения переходит из суток в годы', () => {
    expect(formatOrbitalPeriod(27.321661)).toBe('27.3 сут');
    expect(formatOrbitalPeriod(365.25)).toBe('1.00 года');
    expect(formatOrbitalPeriod(60195)).toBe('164.8 года');
    expect(formatOrbitalPeriod(null)).toBe('-');
  });

  it('короткие сутки пишутся в часах и минутах', () => {
    expect(formatRotationPeriod(9.925 / 24)).toBe('9 ч 56 мин');
    expect(formatRotationPeriod(1)).toBe('24 ч 0 мин');
  });

  it('обратное вращение помечается словом', () => {
    expect(formatRotationPeriod(-243.02)).toBe('243 сут, обратное');
    // Синхронный спутник: сутки обязаны совпадать с периодом обращения.
    expect(formatRotationPeriod(16.689018)).toBe('16.7 сут');
    expect(formatRotationPeriod(-0.718)).toContain('обратное');
  });

  it('отношение к земному сохраняет разрядность по величине', () => {
    expect(formatRelative(11.21, 'R⊕')).toBe('11.2 R⊕');
    expect(formatRelative(317.8, 'M⊕')).toBe('318 M⊕');
    expect(formatRelative(0.0123, 'M⊕')).toBe('0.01 M⊕');
  });
});

describe('наклон оси спутников (#176)', () => {
  /** Спутники с собственными элементами орбиты. Луна - отдельно: их у неё нет. */
  const satellites = MOONS.filter((moon) => moon.satellite);

  it('у синхронного спутника ось почти перпендикулярна его орбите', () => {
    // Справочный наклон синхронного спутника к своей орбите - доли градуса.
    // Здесь до двух градусов: полюс спутника взят полюсом планеты, и наклон
    // равен наклонению орбиты к её экватору, у Деймоса это 1,8°.
    expect(satellites.length).toBeGreaterThan(10);
    for (const moon of satellites) {
      expect(facts(moon.id).axialTiltDeg, moon.id).toBeLessThan(2);
    }
  });

  it('число в карточке спутника - не наклон его планеты', () => {
    // Раньше: 28.05° у спутников Сатурна, 151.97° у Тритона, 2.22° у
    // галилеевых - наклон полюса планеты к эклиптике.
    for (const moon of satellites) {
      const parentTilt = bodyFacts(bodyById(moon.parent!)!).axialTiltDeg;
      expect(Math.abs(facts(moon.id).axialTiltDeg - parentTilt), moon.id).toBeGreaterThan(1);
    }
  });

  it('нарисованная ось Тритона перпендикулярна его орбите, а вращение обратное', () => {
    const triton = bodyById('triton')!;
    const neptune = bodyById('neptune')!;
    const basis = equatorialBasis(neptune.rotation);
    const local = orbitNormalInHost(triton.satellite!);
    const normal = new Vector3()
      .addScaledVector(basis.node, local.x)
      .addScaledVector(basis.third, local.y)
      .addScaledVector(basis.pole, local.z)
      .normalize();

    // Сцена ставит спутнику полюс из `equatorialBasis` его же элементов.
    const drawn = equatorialBasis(triton.rotation).pole;
    expect(Math.abs(drawn.dot(normal))).toBeCloseTo(1, 9);
    // Полюс МАС - к северу от эклиптики, обращение вокруг него обратное.
    expect(drawn.y).toBeGreaterThan(0);
    expect(facts('triton').rotationPeriodDays).toBeLessThan(0);
    expect(facts('triton').axialTiltDeg).toBeLessThan(0.01);
  });

  it('у планет наклон по-прежнему к их собственной орбите', () => {
    expect(facts('earth').axialTiltDeg).toBeCloseTo(23.44, 1);
    expect(facts('saturn').axialTiltDeg).toBeCloseTo(26.73, 1);
  });
});
