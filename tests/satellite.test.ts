import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';

import { satellitePosition } from '../src/physics/satellite';
import { equatorialBasis, tidalOrientation } from '../src/physics/rotation';
import { MOONS, bodyById } from '../src/data/bodies';
import { JD_J2000 } from '../src/core/units';

const moon = (id: string) => MOONS.find((m) => m.id === id)!;

describe('орбиты спутников', () => {
  it('расстояние до планеты держится около большой полуоси', () => {
    for (const definition of MOONS) {
      const elements = definition.satellite!;
      let min = Infinity;
      let max = 0;

      // Полный оборот с шагом в сотую периода.
      for (let k = 0; k < 100; k += 1) {
        const r = satellitePosition(elements, JD_J2000 + (k / 100) * elements.period).length();
        min = Math.min(min, r);
        max = Math.max(max, r);
      }

      // Размах равен удвоенному эксцентриситету — это и есть проверка формы.
      expect(min).toBeGreaterThan(elements.a * (1 - elements.e - 0.001));
      expect(max).toBeLessThan(elements.a * (1 + elements.e + 0.001));
    }
  });

  it('через период спутник возвращается на прежнее место', () => {
    const io = moon('io').satellite!;
    const start = satellitePosition(io, JD_J2000);
    const later = satellitePosition(io, JD_J2000 + io.period);

    expect(start.distanceTo(later)).toBeLessThan(io.a * 1e-6);
  });

  it('за полпериода спутник оказывается по другую сторону планеты', () => {
    const europa = moon('europa').satellite!;
    const start = satellitePosition(europa, JD_J2000).normalize();
    const half = satellitePosition(europa, JD_J2000 + europa.period / 2).normalize();

    expect(start.dot(half)).toBeLessThan(-0.99);
  });

  it('галилеевы спутники связаны резонансом Лапласа', () => {
    // Точное соотношение — не «периоды как 1:2:4» (они отличаются на процент),
    // а равенство n₁ − 3n₂ + 2n₃ = 0 для средних движений. Именно оно
    // держит три спутника в сцепке и разогревает недра Ио.
    const n = (id: string) => 360 / moon(id).satellite!.period;
    const laplace = n('io') - 3 * n('europa') + 2 * n('ganymede');

    expect(Math.abs(laplace)).toBeLessThan(0.05);
  });

  it('периоды совпадают со справочными сидерическими', () => {
    const reference: Record<string, number> = {
      io: 1.769138,
      europa: 3.551181,
      ganymede: 7.154553,
      callisto: 16.689018,
      titan: 15.945421,
    };

    for (const [id, period] of Object.entries(reference)) {
      expect(moon(id).satellite!.period).toBeCloseTo(period, 4);
      // Синхронное вращение: сутки равны году.
      expect(360 / moon(id).rotation.rotationRate).toBeCloseTo(period, 4);
    }
  });

  it('орбиты лежат в плоскости экватора планеты, а не эклиптики', () => {
    // Наклонение к плоскости Лапласа у всех пяти меньше половины градуса,
    // а к эклиптике — как наклон оси планеты, то есть 3° у Юпитера и 27°
    // у Сатурна. Проверяем, что орбита строится именно в первой.
    const jupiter = bodyById('jupiter')!;
    const basis = equatorialBasis(jupiter.rotation);
    const io = moon('io').satellite!;

    for (let k = 0; k < 12; k += 1) {
      const local = satellitePosition(io, JD_J2000 + (k / 12) * io.period);
      const scene = new Vector3()
        .addScaledVector(basis.node, local.x)
        .addScaledVector(basis.third, local.y)
        .addScaledVector(basis.pole, local.z);

      // Отклонение от экваториальной плоскости планеты — доли процента радиуса.
      expect(Math.abs(scene.dot(basis.pole)) / scene.length()).toBeLessThan
      (0.01);
    }
  });
});

describe('приливная ориентация', () => {
  it('нулевой меридиан смотрит на планету', () => {
    const pole = new Vector3(0, 1, 0);
    const toHost = new Vector3(3, 0, 4).normalize();

    const q = tidalOrientation(toHost, pole);
    const primeMeridian = new Vector3(1, 0, 0).applyQuaternion(q);

    expect(primeMeridian.dot(toHost)).toBeCloseTo(1, 6);
  });

  it('полюс остаётся полюсом', () => {
    const pole = new Vector3(0.2, 0.9, -0.1).normalize();
    const toHost = new Vector3(1, 0.3, 0).normalize();

    const q = tidalOrientation(toHost, pole);
    const up = new Vector3(0, 1, 0).applyQuaternion(q);

    expect(up.dot(pole)).toBeCloseTo(1, 6);
  });

  it('поворот остаётся ортонормированным при любом направлении', () => {
    const pole = new Vector3(0, 1, 0);

    for (let k = 0; k < 8; k += 1) {
      const angle = (k / 8) * Math.PI * 2;
      const toHost = new Vector3(Math.cos(angle), 0.4, Math.sin(angle)).normalize();
      const q = tidalOrientation(toHost, pole);

      const x = new Vector3(1, 0, 0).applyQuaternion(q);
      const y = new Vector3(0, 1, 0).applyQuaternion(q);

      expect(x.length()).toBeCloseTo(1, 6);
      expect(x.dot(y)).toBeCloseTo(0, 6);
    }
  });

  it('хозяин точно над полюсом не ломает ориентацию', () => {
    const pole = new Vector3(0, 1, 0);
    const q = tidalOrientation(pole.clone(), pole);
    const up = new Vector3(0, 1, 0).applyQuaternion(q);

    expect(Number.isNaN(up.x)).toBe(false);
    expect(up.dot(pole)).toBeCloseTo(1, 6);
  });
});
