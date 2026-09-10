import { describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera, Vector3 } from 'three';

import { APPEARANCE } from '../src/data/appearance';
import { julianDayFromDate } from '../src/core/units';
import { PlanetRings, packBands } from '../src/scene/rings';
import { SolarSystem } from '../src/scene/system';

/** Видимый радиус Солнца, км: в этих проверках размеры не раздуваются. */
const SUN_RADIUS = 696_000;

const saturn = APPEARANCE.saturn!.rings!;
const uranus = APPEARANCE.uranus!.rings!;

describe('системы колец', () => {
  it('полосы лежат внутри заявленных границ системы', () => {
    for (const system of [saturn, uranus]) {
      for (const band of system.bands) {
        expect(band.inner).toBeGreaterThanOrEqual(system.inner - 1);
        expect(band.outer).toBeLessThanOrEqual(system.outer + 1);
        expect(band.outer).toBeGreaterThan(band.inner);
      }
    }
  });

  it('кольца Сатурна начинаются выше предела Роша и не задевают планету', () => {
    // Внутренний край кольца C - 74 700 км, экваториальный радиус 60 268 км.
    expect(saturn.inner).toBeGreaterThan(60268);
  });

  it('щель Энке задана отрицательной плотностью внутри кольца A', () => {
    const encke = saturn.bands.find((b) => b.density < 0)!;
    const ringA = saturn.bands.find((b) => b.inner === 122170)!;

    expect(encke).toBeDefined();
    expect(encke.inner).toBeGreaterThan(ringA.inner);
    expect(encke.outer).toBeLessThan(ringA.outer);
    // Щель уже полукилометра плотности не пробьёт: она должна вычитать
    // почти всё вещество кольца A на своём месте.
    expect(ringA.density + encke.density).toBeLessThan(0.2);
  });

  it('деление Кассини разделяет кольца B и A и не пустое', () => {
    const cassini = saturn.bands.find((b) => b.inner === 117580)!;

    expect(cassini.density).toBeGreaterThan(0);
    expect(cassini.density).toBeLessThan(0.2);
    expect(cassini.outer).toBe(122170);
  });

  it('кольца Урана узкие: ширина от единиц до сотни километров', () => {
    const widths = uranus.bands.map((b) => b.outer - b.inner);

    expect(Math.min(...widths)).toBeLessThan(5);
    expect(Math.max(...widths)).toBeLessThan(100);
    // Эпсилон - самое широкое.
    expect(Math.max(...widths)).toBe(uranus.bands.at(-1)!.outer - uranus.bands.at(-1)!.inner);
  });

  it('кольца Урана темнее сатурновых', () => {
    // Альбедо вещества входит в цвет: у Урана оно почти угольное.
    const brightness = (color: number) =>
      ((color >> 16) & 255) + ((color >> 8) & 255) + (color & 255);

    expect(brightness(uranus.color)).toBeLessThan(brightness(saturn.color) * 0.6);
  });

  it('упаковка полос сохраняет порядок и значения', () => {
    const packed = packBands(saturn.bands);

    expect(packed).toHaveLength(saturn.bands.length);
    expect(packed[0]!.x).toBe(saturn.bands[0]!.inner);
    expect(packed[0]!.y).toBe(saturn.bands[0]!.outer);
    expect(packed[0]!.z).toBe(saturn.bands[0]!.density);
    expect(packed[0]!.w).toBe(saturn.bands[0]!.edge);
  });
});

/**
 * Камера в системе координат колец.
 *
 * Геометрия колец задана в настоящих километрах, а раздуваются они множителем
 * размеров через масштаб меша. Шейдер считает и плотность, и тень, и наклон
 * луча зрения в этих настоящих километрах - значит, и камеру ему надо давать
 * в них же. Без деления на множитель у ×1000 шейдер видит камеру в тысяче
 * радиусов от колец, стоя вплотную к ним.
 */
describe('камера в системе координат колец', () => {
  /** Кольца в группе тела, как их собирает сцена. */
  function ringsInGroup(scale: number): { rings: PlanetRings; group: Group } {
    const rings = new PlanetRings({
      inner: saturn.inner,
      outer: saturn.outer,
      color: saturn.color,
      bands: saturn.bands,
      ringlets: saturn.ringlets,
      equatorial: 60268,
      polar: 54364,
    });

    const group = new Group();
    group.add(rings.mesh);
    rings.mesh.scale.setScalar(scale);
    group.updateMatrixWorld(true);

    return { rings, group };
  }

  /** Положение камеры в системе координат колец после пересчёта. */
  function cameraInRings(scale: number, offset: Vector3): Vector3 {
    const { rings, group } = ringsInGroup(scale);
    const body = new Vector3(0, 0, 0);
    group.position.copy(body);

    const camera = new PerspectiveCamera();
    camera.position.copy(offset);

    rings.update(new Vector3(1e8, 0, 0), body, camera);

    return (rings.mesh.material.uniforms.uCameraBodyPosition!.value as Vector3).clone();
  }

  it('при настоящих размерах совпадает со смещением камеры от планеты', () => {
    const offset = new Vector3(0, 204911, 0);
    expect(cameraInRings(1, offset).y).toBeCloseTo(204911, 0);
  });

  it('при раздутых размерах уменьшается во столько же раз', () => {
    // Камера стоит в 3.4 раздутых радиуса от планеты, то есть там же
    // относительно колец, что и при настоящих размерах. Шейдер обязан увидеть
    // то же самое число: кольца для него всё те же 136 775 км.
    const offset = new Vector3(0, 204911 * 10, 0);
    expect(cameraInRings(10, offset).y).toBeCloseTo(204911, 0);

    const far = new Vector3(0, 204911 * 1000, 0);
    expect(cameraInRings(1000, far).y).toBeCloseTo(204911, 0);
  });
});

/**
 * Раскрытие колец к Солнцу.
 *
 * Кольцо светится отражённым светом, и достаётся ему тем меньше, чем ближе
 * плоскость к направлению на Солнце: в равноденствие Сатурна кольца гаснут
 * почти полностью. Это явление, а не поломка, и карточка тела говорит о нём
 * числом - значит, число обязано быть настоящим. Проверяется по датам, которые
 * известны независимо от этого кода.
 */
describe('кольца к Солнцу', () => {
  /** Сцена на заданный момент, начало координат - Солнце. */
  function sceneAt(iso: string): SolarSystem {
    const system = new SolarSystem();
    system.update(julianDayFromDate(new Date(iso)));
    // Начало координат сцены совпадает с Солнцем: тогда позиция в сцене и есть
    // мировая. Кадровый цикл делает то же самое, только относительно камеры.
    for (const body of system.bodies) body.group.position.copy(body.worldPosition);
    system.updateLighting(new Vector3(0, 0, 0), SUN_RADIUS, 0, new PerspectiveCamera());
    return system;
  }

  const saturnAt = (iso: string) => sceneAt(iso).find('saturn')!.ringSunElevation;

  it('в равноденствие Сатурна кольца стоят к Солнцу ребром', () => {
    // Шестое мая 2025 года - равноденствие на Сатурне: Солнце пересекает
    // плоскость колец, и они получают свет по касательной.
    expect(saturnAt('2025-05-06T00:00:00Z')).toBeLessThan(0.2);
    // Следующее пересечение - январь 2039-го, через половину оборота Сатурна.
    expect(saturnAt('2039-01-22T00:00:00Z')).toBeLessThan(0.3);
  });

  it('в начале тридцатых кольца раскрыты почти на максимум', () => {
    // Максимум равен наклону оси Сатурна к его орбите - 26.7°.
    const open = saturnAt('2032-01-01T00:00:00Z');

    expect(open).toBeGreaterThan(26);
    expect(open).toBeLessThan(27);
  });

  it('разница между этими кадрами - та самая, из-за которой кольца гаснут', () => {
    // Света на единицу площади кольца приходит пропорционально синусу угла.
    // Осенью 2026-го кольцам достаётся около четверти того, что в 2032-м, а
    // у самого равноденствия - считанные проценты: отсюда и берётся кадр, на
    // котором кольца почти неразличимы.
    const now = Math.sin((saturnAt('2026-09-09T00:00:00Z') * Math.PI) / 180);
    const open = Math.sin((saturnAt('2032-01-01T00:00:00Z') * Math.PI) / 180);

    expect(now / open).toBeGreaterThan(0.2);
    expect(now / open).toBeLessThan(0.35);
  });

  it('у лежащего на боку Урана кольца развёрнуты к Солнцу плашмя', () => {
    // Ось Урана наклонена на 98°, и его кольца по полвека смотрят на Солнце
    // почти плашмя - ребром они встают дважды за оборот, в 2007 и 2049 годах.
    expect(sceneAt('2032-01-01T00:00:00Z').find('uranus')!.ringSunElevation).toBeGreaterThan(70);
  });

  it('число то же, каким освещает кольца шейдер', () => {
    // Карточка обязана объяснять тот кадр, который человек видит, а не считать
    // его заново по-своему: в шейдер уходит синус этого угла.
    const saturn = sceneAt('2026-09-09T00:00:00Z').find('saturn')!;
    const toSun = saturn.rings!.mesh.material.uniforms.uSunBodyDirection!.value as Vector3;

    expect(Math.abs(toSun.y)).toBeCloseTo(Math.sin((saturn.ringSunElevation * Math.PI) / 180), 12);
  });

  it('у тела без колец величины нет', () => {
    const earth = sceneAt('2026-09-09T00:00:00Z').find('earth')!;

    expect(earth.rings).toBeNull();
    expect(earth.ringSunElevation).toBe(0);
  });
});
