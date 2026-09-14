import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';

import { satellitePosition } from '../src/physics/satellite';
import { equatorialBasis, tidalOrientation } from '../src/physics/rotation';
import { MOONS, bodyById } from '../src/data/bodies';
import { JD_J2000, SECONDS_PER_DAY } from '../src/core/units';

const moon = (id: string) => MOONS.find((m) => m.id === id)!;

/** Гравитационная постоянная, км³/(кг·с²). */
const G = 6.6743e-20;

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

      // Размах равен удвоенному эксцентриситету - это и есть проверка формы.
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
    // Точное соотношение - не «периоды как 1:2:4» (они отличаются на процент),
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
    // а к эклиптике - как наклон оси планеты, то есть 3° у Юпитера и 27°
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

      // Отклонение от экваториальной плоскости планеты - доли процента радиуса.
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

/**
 * Проверка самих данных, а не формул.
 *
 * Сверять период с той же таблицей, из которой он переписан, бессмысленно:
 * такая проверка зелена по построению и не ловит ровно ничего. Третий закон
 * Кеплера ловит: большая полуось и период связаны массой планеты, а масса
 * стоит в той же таблице тел и взята из другого источника. Опечатка в любом
 * из трёх чисел их разводит, и разводит сильно.
 */
describe('данные спутников', () => {
  it('третий закон Кеплера сходится с массой планеты', () => {
    for (const definition of MOONS) {
      const { a, period } = definition.satellite!;
      const host = bodyById(definition.parent!)!;

      const seconds = period * SECONDS_PER_DAY;
      const fromOrbit = (4 * Math.PI ** 2 * a ** 3) / (seconds * seconds);
      // Масса спутника входит в ту же сумму. У Харона она восьмая часть
      // плутоновой, и пренебречь ею здесь уже нельзя.
      const fromMass = G * (host.mass + definition.mass);

      // Полпроцента - невязка средних элементов: у Мимаса табличный период
      // отнесён к прецессирующей линии апсид и расходится с сидерическим
      // сильнее прочих. Ошибка в цифре большой полуоси даёт десятки процентов.
      expect(fromOrbit / fromMass, definition.id).toBeCloseTo(1, 2);
    }
  });
});

describe('крупные спутники планет', () => {
  const HOSTS: Readonly<Record<string, string>> = {
    phobos: 'mars',
    deimos: 'mars',
    mimas: 'saturn',
    enceladus: 'saturn',
    titania: 'uranus',
    oberon: 'uranus',
    triton: 'neptune',
    charon: 'pluto',
  };

  const ids = Object.keys(HOSTS);

  it('стоят в сцене и привязаны к своей планете', () => {
    for (const [id, parent] of Object.entries(HOSTS)) {
      const definition = bodyById(id);

      expect(definition, `${id}: нет в таблице тел`).toBeDefined();
      expect(definition!.parent, id).toBe(parent);
      expect(definition!.satellite, `${id}: нет элементов орбиты`).toBeDefined();
    }
  });

  it('Тритон обращается в обратную сторону, остальные - в прямую', () => {
    // Признак обратного движения - знак проекции момента импульса на полюс
    // планеты. Ось z у `satellitePosition` и есть полюс, поэтому проекция
    // считается по двум соседним точкам орбиты без всяких поворотов.
    const alongPole = (id: string) => {
      const elements = bodyById(id)!.satellite!;
      const first = satellitePosition(elements, JD_J2000);
      const next = satellitePosition(elements, JD_J2000 + elements.period / 64);

      return first.x * next.y - first.y * next.x;
    };

    // Тритон - захваченное тело, единственный крупный спутник системы на
    // обратной орбите. Из-за неё он и падает на Нептун.
    expect(alongPole('triton')).toBeLessThan(0);

    for (const id of ids) {
      if (id === 'triton') continue;
      expect(alongPole(id), id).toBeGreaterThan(0);
    }
  });

  it('наклонения к плоскости Лапласа малы у всех, кроме Тритона', () => {
    for (const id of ids) {
      const { i } = bodyById(id)!.satellite!;

      if (id === 'triton') {
        // Орбита наклонена к экватору Нептуна на 23°, но обходит планету в
        // обратную сторону - отсюда наклонение больше прямого угла.
        expect(i).toBeGreaterThan(90);
        expect(i).toBeLessThan(180);
      } else {
        expect(i, id).toBeLessThan(2);
      }
    }
  });

  it('все заперты приливами: сутки равны периоду обращения', () => {
    for (const id of ids) {
      const definition = bodyById(id)!;

      expect(definition.tidallyLocked, id).toBe(true);
      // Модуль: у Тритона скорость вращения отрицательная, как у Венеры.
      expect(Math.abs(360 / definition.rotation.rotationRate), id).toBeCloseTo(
        definition.satellite!.period,
        4,
      );
    }
  });

  it('у Тритона сутки обратные, как у Венеры и Урана', () => {
    // МАС считает северным полюсом тот, что лежит к северу от неизменной
    // плоскости. У Тритона это полюс со стороны нептунова севера, а вращение
    // вокруг него идёт вспять - знак скорости отрицательный, и карточка
    // показывает обратные сутки, что правда.
    expect(bodyById('triton')!.rotation.rotationRate).toBeLessThan(0);

    for (const id of ids) {
      if (id === 'triton') continue;
      expect(bodyById(id)!.rotation.rotationRate, id).toBeGreaterThan(0);
    }
  });
});
