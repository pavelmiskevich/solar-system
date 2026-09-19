import { describe, expect, it } from 'vitest';

import { bodyById } from '../src/data/bodies';
import {
  TAIL_CUTOFF_AU,
  activityAt,
  dustTailPoints,
  ionTailPoints,
} from '../src/physics/cometTail';
import { positionAt } from '../src/physics/kepler';
import type { EclipticVector, OrbitalElements } from '../src/physics/kepler';

const orbit = (): OrbitalElements => bodyById('halley')!.orbit!;

/** Перигелий и афелий орбиты, а.е. */
const perihelion = () => orbit().a * (1 - orbit().e);

function julianDayOf(iso: string): number {
  return new Date(iso).getTime() / 86_400_000 + 2440587.5;
}

const PERIHELION_1986 = julianDayOf('1986-02-08T00:00:00Z');

function minus(a: EclipticVector, b: EclipticVector): EclipticVector {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: EclipticVector, b: EclipticVector): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v: EclipticVector): number {
  return Math.hypot(v.x, v.y, v.z);
}

function unit(v: EclipticVector): EclipticVector {
  const l = length(v);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Направление движения кометы - по разности положений через малый шаг. */
function velocityDirection(jd: number): EclipticVector {
  const ahead = positionAt(orbit(), jd + 0.01);
  const behind = positionAt(orbit(), jd - 0.01);
  return unit(minus(ahead, behind));
}

describe('активность кометы', () => {
  it('за порогом активности нет вовсе', () => {
    expect(activityAt(TAIL_CUTOFF_AU, perihelion())).toBe(0);
    expect(activityAt(TAIL_CUTOFF_AU + 1, perihelion())).toBe(0);
    expect(activityAt(35, perihelion())).toBe(0);
  });

  it('растёт по мере приближения к Солнцу', () => {
    const q = perihelion();
    const near = activityAt(1, q);
    const far = activityAt(2.5, q);

    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it('в перигелии выходит на единицу и выше неё не поднимается', () => {
    const q = perihelion();

    expect(activityAt(q, q)).toBeCloseTo(1, 6);
    // Ближе перигелия комета не бывает, но формула не обязана об этом знать:
    // потолок нужен, чтобы хвост не рос без предела при делении на малое.
    expect(activityAt(q / 2, q)).toBeLessThanOrEqual(1);
  });
});

describe('ионный хвост', () => {
  it('у афелия хвоста нет', () => {
    const jd = julianDayOf('2026-09-19T00:00:00Z');
    expect(ionTailPoints(orbit(), jd, 16)).toHaveLength(0);
  });

  it('в перигелии тянется точно от Солнца', () => {
    const points = ionTailPoints(orbit(), PERIHELION_1986, 16);
    expect(points.length).toBeGreaterThan(1);

    const nucleus = positionAt(orbit(), PERIHELION_1986);
    const antiSun = unit(nucleus);

    for (const point of points.slice(1)) {
      const offset = minus(point, nucleus);
      const direction = unit(offset);

      // Косинус с направлением «от Солнца» - единица с точностью счёта.
      // Солнечный ветер сдувает ионы точно по лучу, без отставания.
      expect(dot(direction, antiSun)).toBeCloseTo(1, 6);
    }
  });

  it('остаётся противосолнечным в любой точке орбиты', () => {
    for (let day = 0; day < 360; day += 37) {
      const jd = PERIHELION_1986 + day;
      const points = ionTailPoints(orbit(), jd, 8);
      if (points.length === 0) continue;

      const nucleus = positionAt(orbit(), jd);
      const antiSun = unit(nucleus);
      const tip = minus(points[points.length - 1]!, nucleus);

      expect(dot(unit(tip), antiSun)).toBeCloseTo(1, 6);
    }
  });

  it('у перигелия длиннее, чем на подлёте', () => {
    const atPerihelion = ionTailPoints(orbit(), PERIHELION_1986, 16);
    const approaching = ionTailPoints(orbit(), PERIHELION_1986 - 60, 16);

    const span = (points: EclipticVector[]) =>
      points.length === 0 ? 0 : length(minus(points[points.length - 1]!, points[0]!));

    expect(span(atPerihelion)).toBeGreaterThan(span(approaching));
    expect(span(approaching)).toBeGreaterThan(0);
  });
});

describe('пылевой хвост', () => {
  it('у афелия хвоста нет', () => {
    const jd = julianDayOf('2026-09-19T00:00:00Z');
    expect(dustTailPoints(orbit(), jd, 16)).toHaveLength(0);
  });

  it('отклонён от Солнца и отстаёт по орбите - одновременно', () => {
    const points = dustTailPoints(orbit(), PERIHELION_1986, 24);
    expect(points.length).toBeGreaterThan(2);

    const nucleus = positionAt(orbit(), PERIHELION_1986);
    const antiSun = unit(nucleus);
    const forward = velocityDirection(PERIHELION_1986);

    for (const point of points.slice(2)) {
      const offset = minus(point, nucleus);

      // Пыль сдувает от Солнца - это первая составляющая. Но, поднявшись
      // наружу, пылинка идёт по более высокой орбите и отстаёт, а комета
      // уходит вперёд, - это вторая. Одна положительна, другая отрицательна,
      // и вместе они и есть изгиб.
      expect(dot(offset, antiSun)).toBeGreaterThan(0);
      expect(dot(offset, forward)).toBeLessThan(0);
    }
  });

  it('изогнут: его направление расходится с ионным', () => {
    const jd = PERIHELION_1986 + 20;
    const ion = ionTailPoints(orbit(), jd, 24);
    const dust = dustTailPoints(orbit(), jd, 24);

    const nucleus = positionAt(orbit(), jd);
    const ionTip = unit(minus(ion[ion.length - 1]!, nucleus));
    const dustTip = unit(minus(dust[dust.length - 1]!, nucleus));

    // Расхождение в добрый десяток градусов - иначе два хвоста слились бы в
    // один и рисовать второй было бы незачем.
    const angleDeg = (Math.acos(dot(ionTip, dustTip)) * 180) / Math.PI;
    expect(angleDeg).toBeGreaterThan(10);
    expect(angleDeg).toBeLessThan(90);
  });

  it('не схлопывается вдали от Солнца, но изгибается там слабее', () => {
    // Урок, добытый числами: активность правит плотностью хвоста, а не
    // возрастом пыли. Стоит умножить на неё ещё и возраст - и в полутора
    // астрономических единицах хвост исчезает, хотя у настоящей кометы он
    // там ещё виден.
    const far = PERIHELION_1986 - 69; // около 1.47 а.е.
    const nucleusFar = positionAt(orbit(), far);
    const tailFar = dustTailPoints(orbit(), far, 24);

    expect(length(minus(tailFar[tailFar.length - 1]!, nucleusFar))).toBeGreaterThan(0.05);

    const bend = (jd: number) => {
      const nucleus = positionAt(orbit(), jd);
      const dust = dustTailPoints(orbit(), jd, 24);
      const tip = unit(minus(dust[dust.length - 1]!, nucleus));
      return Math.acos(dot(tip, unit(nucleus)));
    };

    // Ближе к Солнцу комета идёт быстрее и уходит от собственной пыли
    // заметнее: изгиб у перигелия круче, чем на подлёте.
    expect(bend(PERIHELION_1986)).toBeGreaterThan(bend(far));
  });

  it('начинается у самого ядра', () => {
    const points = dustTailPoints(orbit(), PERIHELION_1986, 16);
    const nucleus = positionAt(orbit(), PERIHELION_1986);

    // Первая точка - само ядро: лента не должна начинаться в пустоте.
    expect(length(minus(points[0]!, nucleus))).toBeLessThan(1e-9);
  });
});
