import { describe, expect, it } from 'vitest';

import { TIME_SCALES } from '../src/core/clock';
import { decodeSceneState, encodeSceneState } from '../src/core/sceneState';
import { dateFromJulianDay } from '../src/core/units';
import { SCENARIOS, scenarioById } from '../src/data/scenarios';
import { bodyById } from '../src/data/bodies';

describe('готовые виды', () => {
  it('у каждого своё имя и свой опознаватель', () => {
    const ids = new Set(SCENARIOS.map((scenario) => scenario.id));
    const names = new Set(SCENARIOS.map((scenario) => scenario.name));

    expect(ids.size).toBe(SCENARIOS.length);
    expect(names.size).toBe(SCENARIOS.length);
    for (const scenario of SCENARIOS) expect(scenarioById(scenario.id)).toBe(scenario);
  });

  it('ведут к тому телу, которое названо в самом виде', () => {
    for (const scenario of SCENARIOS) {
      // Тело перелёта и тело привязки камеры — одно и то же: иначе камера
      // прилетела бы к одному, а встала бы вокруг другого.
      expect(scenario.state.view.body, scenario.id).toBe(scenario.body);
      expect(scenario.body === 'sun' || bodyById(scenario.body) !== undefined, scenario.id).toBe(
        true,
      );
    }
  });

  it('стоят на разумном расстоянии и в пределах эфемерид', () => {
    for (const scenario of SCENARIOS) {
      const { radii, elevation } = scenario.state.view;

      // Ближе радиуса — внутри тела, дальше тысячи — тело в точку.
      expect(radii, scenario.id).toBeGreaterThan(1.05);
      expect(radii, scenario.id).toBeLessThan(1000);
      expect(Math.abs(elevation), scenario.id).toBeLessThan(90);

      const year = dateFromJulianDay(scenario.state.jd!).getUTCFullYear();
      // Таблицы JPL, по которым считаются положения, покрывают 1800–2050.
      expect(year, scenario.id).toBeGreaterThanOrEqual(1800);
      expect(year, scenario.id).toBeLessThanOrEqual(2050);

      expect(scenario.state.timeScale!, scenario.id).toBeGreaterThanOrEqual(TIME_SCALES[0]!);
      expect(scenario.state.timeScale!, scenario.id).toBeLessThanOrEqual(
        TIME_SCALES[TIME_SCALES.length - 1]!,
      );
    }
  });

  it('каждый вид — готовая ссылка: переживает дорогу через адрес страницы', () => {
    // Не украшение проверки, а суть устройства: вид и ссылка — одно и то же
    // состояние сцены. Разойдись они, и «поделиться видом» перестало бы
    // означать «поделиться тем, что видишь».
    for (const scenario of SCENARIOS) {
      const decoded = decodeSceneState(encodeSceneState(scenario.state));

      expect(decoded.view, scenario.id).toEqual(scenario.state.view);
      expect(decoded.jd!, scenario.id).toBeCloseTo(scenario.state.jd!, 6);
    }
  });

  it('рассказывают, на что смотреть', () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.hint.length, scenario.id).toBeGreaterThan(20);
      expect(scenario.hint.endsWith('.'), `${scenario.id}: подсказка без точки в конце`).toBe(false);
    }
  });
});
