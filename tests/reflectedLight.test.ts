import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';

import {
  illuminatedFraction,
  reflectedIrradianceFraction,
} from '../src/lighting/reflectedLight';
import { spotDirection } from '../src/scene/planetMaterial';
import { APPEARANCE } from '../src/data/appearance';
import { DEG } from '../src/core/units';

const EARTH_RADIUS = 6378.137;
const EARTH_ALBEDO = 0.306;
const MOON_DISTANCE = 384400;

describe('reflectedIrradianceFraction', () => {
  it('пепельный свет от Земли — около 8·10⁻⁵ солнечного', () => {
    // Полная Земля с Луны имеет −16.5ᵐ против −26.7ᵐ у Солнца: разница в
    // 10.2 звёздной величины, то есть 8.3·10⁻⁵.
    const fraction = reflectedIrradianceFraction(EARTH_ALBEDO, EARTH_RADIUS, MOON_DISTANCE, 1);

    expect(fraction).toBeGreaterThan(7e-5);
    expect(fraction).toBeLessThan(9e-5);
  });

  it('лунный свет на Земле в тридцать раз слабее пепельного', () => {
    const earthshine = reflectedIrradianceFraction(EARTH_ALBEDO, EARTH_RADIUS, MOON_DISTANCE, 1);
    const moonlight = reflectedIrradianceFraction(0.136, 1737.4, MOON_DISTANCE, 1);

    expect(earthshine / moonlight).toBeGreaterThan(25);
    expect(earthshine / moonlight).toBeLessThan(35);
  });

  it('падает как квадрат расстояния', () => {
    const near = reflectedIrradianceFraction(0.3, 6378, 100000, 1);
    const far = reflectedIrradianceFraction(0.3, 6378, 200000, 1);

    expect(near / far).toBeCloseTo(4, 6);
  });

  it('новая фаза отражателя не даёт света', () => {
    expect(reflectedIrradianceFraction(0.3, 6378, 384400, 0)).toBe(0);
  });

  it('нулевое расстояние не превращается в бесконечность', () => {
    expect(reflectedIrradianceFraction(0.3, 6378, 0, 1)).toBe(0);
  });
});

describe('illuminatedFraction', () => {
  const sun = new Vector3(0, 0, 0);

  it('отражатель между Солнцем и телом повёрнут ночной стороной', () => {
    // Земля на 1 а.е., Луна дальше по той же прямой: с Луны видна новая Земля.
    const earth = new Vector3(1.5e8, 0, 0);
    const moon = new Vector3(1.5e8 + MOON_DISTANCE, 0, 0);

    expect(illuminatedFraction(earth, moon, sun)).toBeCloseTo(0, 6);
  });

  it('тело между Солнцем и отражателем видит полную фазу', () => {
    const earth = new Vector3(1.5e8, 0, 0);
    const moon = new Vector3(1.5e8 - MOON_DISTANCE, 0, 0);

    expect(illuminatedFraction(earth, moon, sun)).toBeCloseTo(1, 6);
  });

  it('прямой угол даёт ровно половину диска', () => {
    const earth = new Vector3(1.5e8, 0, 0);
    const moon = new Vector3(1.5e8, MOON_DISTANCE, 0);

    expect(illuminatedFraction(earth, moon, sun)).toBeCloseTo(0.5, 6);
  });

  it('совпадение точек не ломает расчёт', () => {
    const p = new Vector3(1, 2, 3);
    expect(illuminatedFraction(p, p, sun)).toBe(0);
  });
});

describe('spotDirection', () => {
  it('широта переходит в высоту над экватором', () => {
    const jupiter = APPEARANCE.jupiter!.spot!;
    const direction = spotDirection(jupiter);

    expect(direction.length()).toBeCloseTo(1, 9);
    // Большое Красное пятно — южное, значит проекция на ось вращения отрицательна.
    expect(direction.y).toBeCloseTo(Math.sin(jupiter.latitude * DEG), 9);
  });

  it('нулевые широта и долгота смотрят вдоль нулевого меридиана', () => {
    const direction = spotDirection({
      latitude: 0,
      longitude: 0,
      radius: 5,
      aspect: 1,
      color: 0,
      strength: 1,
    });

    expect(direction.x).toBeCloseTo(1, 9);
    expect(direction.y).toBeCloseTo(0, 9);
    expect(direction.z).toBeCloseTo(0, 9);
  });

  it('долгота 90° уходит на ось z — так же, как её читает шейдер', () => {
    const direction = spotDirection({
      latitude: 0,
      longitude: 90,
      radius: 5,
      aspect: 1,
      color: 0,
      strength: 1,
    });

    // В шейдере долгота считается как atan(p.z, p.x): соглашения обязаны совпасть.
    expect(Math.atan2(direction.z, direction.x) / DEG).toBeCloseTo(90, 6);
  });
});
