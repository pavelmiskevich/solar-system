import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';

import { julianDayFromDate } from '../src/core/units';
import { MOON_MASS_FRACTION } from '../src/data/bodies';
import { SatelliteOrbits } from '../src/scene/satelliteOrbits';
import { SIZE_PRESETS, SolarSystem, type Body } from '../src/scene/system';

/**
 * Множитель размеров раздувает планетную систему целиком: тела, кольца и
 * орбиты спутников. Расстояния между планетами остаются настоящими.
 */

const JD = julianDayFromDate(new Date('2026-11-28T00:00:00Z'));

/** Видимый радиус Солнца, км: здесь он нужен только освещению. */
const SUN_RADIUS = 696_000;

function sceneAt(k: number, jd = JD): SolarSystem {
  const system = new SolarSystem();
  system.setSizeExaggeration(k);
  system.update(jd);
  // Начало координат сцены - Солнце: позиция в сцене и есть мировая.
  for (const body of system.bodies) body.group.position.copy(body.worldPosition);
  return system;
}

function satellites(system: SolarSystem): { body: Body; host: Body }[] {
  return system.bodies.flatMap((body) => {
    const host = body.definition.parent ? system.find(body.definition.parent) : undefined;
    return host ? [{ body, host }] : [];
  });
}

describe('множитель размеров', () => {
  it.each(SIZE_PRESETS)('при ×%d ни один спутник не лежит внутри своей планеты', (k) => {
    const system = sceneAt(k);
    const pairs = satellites(system);
    expect(pairs.length).toBeGreaterThan(10);
    for (const { body, host } of pairs) {
      const distance = body.worldPosition.distanceTo(host.worldPosition);
      expect(distance, `${body.definition.id} при ×${k}`).toBeGreaterThan(
        host.visualRadius + body.visualRadius,
      );
    }
  });

  it.each(SIZE_PRESETS)('при ×%d система спутника подобна настоящей', (k) => {
    // Смещение спутника от планеты растёт ровно во столько же раз, что и
    // радиусы: углы внутри системы, а с ними затмения, не меняются.
    const real = sceneAt(1);
    const grown = sceneAt(k);
    for (const { body, host } of satellites(grown)) {
      const realBody = real.find(body.definition.id)!;
      const realHost = real.find(host.definition.id)!;
      const expected = new Vector3().subVectors(realBody.worldPosition, realHost.worldPosition).multiplyScalar(k);
      const actual = new Vector3().subVectors(body.worldPosition, host.worldPosition);
      expect(actual.distanceTo(expected), body.definition.id).toBeLessThan(1e-6 * expected.length());
    }
  });

  it('межпланетные расстояния остаются настоящими', () => {
    const real = sceneAt(1);
    const grown = sceneAt(1000);
    for (const id of ['mercury', 'mars', 'jupiter', 'saturn', 'neptune']) {
      expect(grown.find(id)!.worldPosition.distanceTo(real.find(id)!.worldPosition), id).toBe(0);
    }
    // Барицентр Земля-Луна тоже на месте: растёт только пара вокруг него.
    const barycentre = (system: SolarSystem) => {
      const earth = system.find('earth')!.worldPosition;
      const moon = system.find('moon')!.worldPosition;
      return earth.clone().lerp(moon, MOON_MASS_FRACTION);
    };
    expect(barycentre(grown).distanceTo(barycentre(real))).toBeLessThan(1);
  });

  it('смена множителя сразу переставляет спутники', () => {
    const system = sceneAt(1);
    const before = system.find('io')!.worldPosition.clone();
    system.setSizeExaggeration(100);
    const jupiter = system.find('jupiter')!.worldPosition;
    const io = system.find('io')!.worldPosition;
    expect(io.distanceTo(jupiter)).toBeCloseTo(before.distanceTo(jupiter) * 100, -2);
  });

  it('отражённый свет Земли на Луне не зависит от множителя', () => {
    // Доля облучённости от соседа - отношение радиуса к расстоянию в квадрате.
    // Раздутый радиус на настоящем расстоянии при ×100 делал лунную ночь днём.
    const strength = (k: number) => {
      const system = sceneAt(k);
      system.updateLighting(new Vector3(), SUN_RADIUS * k, 0, new PerspectiveCamera());
      return system.find('moon')!.mesh.material.uniforms.uSecondStrength!.value as number;
    };
    const real = strength(1);
    expect(real).toBeGreaterThan(0);
    // Не ровно единица: Солнце от пары не отодвигается, и выросшая Луна видит
    // Землю под чуть другой фазой. При ×1000 это 5%, а без раздутых орбит
    // было бы ×1000000.
    for (const k of SIZE_PRESETS) {
      expect(strength(k) / real, `×${k}`).toBeGreaterThan(0.9);
      expect(strength(k) / real, `×${k}`).toBeLessThan(1.1);
    }
  });

  it.each(SIZE_PRESETS)('при ×%d спутник стоит на линии своей орбиты', (k) => {
    const system = sceneAt(k);
    const orbits = new SatelliteOrbits(system, JD);
    orbits.update(new Vector3(1e12, 0, 0), 1e12, 1, JD);
    for (const { group, worldPosition } of orbits.groups) group.position.copy(worldPosition);
    orbits.group.updateMatrixWorld(true);

    const point = new Vector3();
    for (const { body, host } of satellites(system)) {
      // Линия спутника - та, что лежит в группе его планеты и проходит к нему
      // ближе всех; промах меряется в долях радиуса орбиты.
      const radius = body.worldPosition.distanceTo(host.worldPosition);
      let miss = Infinity;
      for (const { group } of orbits.groups) {
        for (const line of group.children as import('three').Line[]) {
          const position = line.geometry.getAttribute('position');
          for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i).applyMatrix4(line.matrixWorld);
            miss = Math.min(miss, point.distanceTo(body.worldPosition));
          }
        }
      }
      // Хорда между соседними точками из 256 (у Луны 180) отходит от
      // спутника не дальше половины шага по дуге.
      expect(miss / radius, `${body.definition.id} при ×${k}`).toBeLessThan(0.02);
    }
  });
});
