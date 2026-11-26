import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';

import { satellitePosition } from '../src/physics/satellite';
import { equatorialBasis, tidalOrientation } from '../src/physics/rotation';
import { MOONS, bodyById } from '../src/data/bodies';
import { JD_J2000, SECONDS_PER_DAY, julianDayFromDate } from '../src/core/units';
import { positionAt } from '../src/physics/kepler';
import { eclipticToScene } from '../src/scene/system';

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

/*
 * Фаза по наблюдениям.
 *
 * Проверки выше ловят форму орбиты и опечатку в периоде, но не то, где на
 * орбите спутник стоит: средняя аномалия на эпоху ни с чем внутри таблицы не
 * связана, и ошибка в ней видна только на небе. Так Титан с самого начала
 * проекта стоял не на той стороне орбиты, и ни одна проверка этого не
 * заметила.
 *
 * Мера - тень: прошла ли ось тени спутника через диск планеты в момент,
 * когда тень на диске видели. Время наблюдения с Земли позже геометрического
 * на путь света от планеты, и он здесь вычтен.
 */
describe('фаза спутников по наблюдениям', () => {
  /** Гелиоцентрическое положение, км, в осях сцены - как в SolarSystem.update. */
  function place(id: string, jd: number): Vector3 {
    const definition = bodyById(id)!;
    if (!definition.parent) {
      const p = positionAt(definition.orbit!, jd);
      return eclipticToScene(p, new Vector3());
    }
    const host = place(definition.parent, jd);
    const local = satellitePosition(definition.satellite!, jd);
    const basis = equatorialBasis(bodyById(definition.parent)!.rotation);
    return host
      .addScaledVector(basis.node, local.x)
      .addScaledVector(basis.third, local.y)
      .addScaledVector(basis.pole, local.z);
  }

  /** Расстояние от центра планеты до оси тени спутника, в радиусах планеты. */
  function shadowOffset(id: string, jd: number): number {
    const definition = bodyById(id)!;
    const satellite = place(id, jd);
    const planet = place(definition.parent!, jd);
    const axis = satellite.clone().normalize();
    const offset = planet.sub(satellite);
    const along = offset.dot(axis);
    if (along <= 0) return Infinity;
    return offset.sub(axis.multiplyScalar(along)).length() / bodyById(definition.parent!)!.radius;
  }

  const moment = (iso: string, lightMinutes: number) =>
    julianDayFromDate(new Date(iso)) - lightMinutes / (24 * 60);

  it('тройная тень на Юпитере 24 января 2015 года', () => {
    // С Земли тени Ио, Европы и Каллисто были на диске разом с 06:27 до
    // 06:52 UT. Свет от Юпитера шёл 36 минут.
    const jd = moment('2015-01-24T06:40:00Z', 36);
    for (const id of ['io', 'europa', 'callisto']) {
      expect(shadowOffset(id, jd), id).toBeLessThan(1);
    }
  });

  it('тень Титана на Сатурне в день снимка Хаббла, 24 февраля 2009 года', () => {
    // Снимок сделан около равноденствия Сатурна, когда тени спутников
    // ложатся на диск; часа съёмки здесь нет, поэтому берётся ближайший к
    // оси тени час тех суток. Свет от Сатурна шёл 73 минуты. С прежними
    // элементами Титан в эти сутки стоял по другую сторону Сатурна, и тени
    // на диске не было вовсе.
    let closest = Infinity;
    for (let hour = 0; hour < 24; hour += 1) {
      const iso = `2009-02-24T${String(hour).padStart(2, '0')}:00:00Z`;
      closest = Math.min(closest, shadowOffset('titan', moment(iso, 73)));
    }
    expect(closest).toBeLessThan(1);
  });
});
