import { BufferAttribute, Group, Line, Vector3 } from 'three';
import type { BufferGeometry, ShaderMaterial } from 'three';

import { MOON, MOONS } from '../data/bodies';
import { sampleMoonOrbit } from '../physics/moon';
import { equatorialBasis } from '../physics/rotation';
import { sampleSatelliteOrbit } from '../physics/satellite';
import { ORBIT_OPACITY, createOrbitLine, smoothstep } from './orbits';
import { eclipticToScene } from './system';
import type { SolarSystem } from './system';

const SEGMENTS = 256;

/**
 * У Луны точек меньше, чем у спутников гигантов, и это осознанно: её линию
 * приходится пересчитывать на ходу рядом ELP2000, а он на порядок дороже
 * эллипса. Сто восемьдесят точек дают отклонение хорды от кривой в шесть
 * десятков километров — при радиусе Луны 1737 км это невидимо.
 */
const MOON_SEGMENTS = 180;

/** Насколько сцена может уйти от даты построения лунной линии, суток. */
const MOON_DRIFT = 0.5;

/** Угловой радиус орбиты, при котором линия появляется и полностью разгорается. */
const ANGULAR_FADE_IN = 0.012;
const ANGULAR_FULL = 0.05;

/**
 * Линии орбит спутников.
 *
 * Отличие от гелиоцентрических орбит не в отрисовке — она общая, из
 * `orbits.ts`, — а в том, к чему линии привязаны и когда их видно.
 *
 * Привязка. Орбита спутника задана относительно планеты, поэтому каждая
 * группа встаёт в мировую позицию своей планеты. Позиция берётся по ссылке на
 * тот же вектор, который сцена обновляет каждый кадр: плавающее начало
 * координат переставит группу само, и линии поедут за планетой без единой
 * строки в кадровом цикле. Группа при этом не вложена в группу планеты —
 * иначе орбиты вращались бы вместе с её сутками.
 *
 * Видимость. У планетных орбит линия гаснет при подлёте к телу, потому что
 * мешает смотреть. Здесь наоборот: подлёт к Юпитеру — это и есть то место,
 * ради которого линии рисуются, там они кольцами лежат вокруг наблюдателя.
 * Поэтому гашение считается по угловому размеру орбиты: пока она мельче
 * десятка точек на экране, линия только сорит в кадре, и её нет. Второе
 * условие — близость к поверхности: стоя у самой Ио, её собственную орбиту
 * видишь не кольцом, а полосой поперёк всего кадра.
 */
export class SatelliteOrbits {
  /**
   * Корень разметки: в нём лежат группы отдельных планет.
   *
   * Сам он стоит в начале координат и ничего не двигает — он нужен, чтобы
   * сцена добавляла и прятала все линии спутников одним объектом, как она
   * это делает с гелиоцентрическими орбитами.
   */
  readonly group = new Group();

  /** Группы планет и их мировые позиции — этим кормится плавающее начало. */
  readonly groups: { group: Group; worldPosition: Vector3 }[] = [];

  private readonly lines: {
    line: Line<BufferGeometry, ShaderMaterial>;
    semiMajorKm: number;
    hostWorldPosition: Vector3;
  }[] = [];

  private moonLine: Line<BufferGeometry, ShaderMaterial> | null = null;
  private moonJd: number;

  constructor(system: SolarSystem, jd: number) {
    this.moonJd = jd;

    const groupByHost = new Map<string, Group>();
    const hostPosition = (id: string): Vector3 | null => system.find(id)?.worldPosition ?? null;

    const groupFor = (hostId: string): Group | null => {
      const existing = groupByHost.get(hostId);
      if (existing) return existing;

      const worldPosition = hostPosition(hostId);
      if (!worldPosition) return null;

      const group = new Group();
      groupByHost.set(hostId, group);
      this.group.add(group);
      this.groups.push({ group, worldPosition });

      return group;
    };

    for (const definition of MOONS) {
      const { satellite, parent } = definition;
      if (!satellite || !parent) continue;

      const host = system.find(parent);
      const group = groupFor(parent);
      if (!host || !group) continue;

      // Точки орбиты приходят в экваториальной системе планеты, и переводит их
      // в сцену тот же базис, которым сцена расставляет сами спутники.
      const basis = equatorialBasis(host.definition.rotation);
      const points = sampleSatelliteOrbit(satellite, SEGMENTS);
      const positions = new Float32Array(points.length * 3);
      const scratch = new Vector3();

      for (let i = 0; i < points.length; i += 1) {
        const point = points[i]!;
        scratch
          .set(0, 0, 0)
          .addScaledVector(basis.node, point.x)
          .addScaledVector(basis.third, point.y)
          .addScaledVector(basis.pole, point.z);

        positions[i * 3 + 0] = scratch.x;
        positions[i * 3 + 1] = scratch.y;
        positions[i * 3 + 2] = scratch.z;
      }

      const line = createOrbitLine(positions, definition.color);
      group.add(line);
      this.lines.push({ line, semiMajorKm: satellite.a, hostWorldPosition: host.worldPosition });
    }

    const earth = system.find('earth');
    const earthGroup = groupFor('earth');

    if (earth && earthGroup) {
      const line = createOrbitLine(new Float32Array((MOON_SEGMENTS + 1) * 3), MOON.color);
      earthGroup.add(line);
      this.moonLine = line;
      this.writeMoonOrbit(jd);

      // Большая полуось лунной орбиты — ею меряется угловой размер линии.
      this.lines.push({ line, semiMajorKm: 384400, hostWorldPosition: earth.worldPosition });
    }
  }

  /**
   * @param cameraWorldPosition положение камеры, км
   * @param nearestSurfaceDistance расстояние до ближайшей поверхности, км
   * @param exposure текущая экспозиция — линии не должны разгораться вместе с ней
   * @param jd текущая дата сцены: по ней перестраивается орбита Луны
   */
  update(
    cameraWorldPosition: Vector3,
    nearestSurfaceDistance: number,
    exposure: number,
    jd: number,
  ): void {
    if (Math.abs(jd - this.moonJd) > MOON_DRIFT) this.writeMoonOrbit(jd);

    for (const { line, semiMajorKm, hostWorldPosition } of this.lines) {
      const distance = Math.max(cameraWorldPosition.distanceTo(hostWorldPosition), 1);

      // Угловой радиус орбиты в кадре. Ниже порога линия занимает несколько
      // точек и читается как случайная засветка рядом с планетой.
      const angular = smoothstep(ANGULAR_FADE_IN, ANGULAR_FULL, semiMajorKm / distance);
      const proximity = smoothstep(0.02 * semiMajorKm, 0.1 * semiMajorKm, nearestSurfaceDistance);
      const visibility = angular * proximity;

      line.material.uniforms.uOpacity!.value =
        (ORBIT_OPACITY * visibility) / Math.max(exposure, 1e-4);
      line.visible = visibility > 0.002;
    }
  }

  /** Пересчитать линию Луны: её орбита возмущена и за месяц не замыкается. */
  private writeMoonOrbit(jd: number): void {
    if (!this.moonLine) return;

    const points = sampleMoonOrbit(jd, MOON_SEGMENTS);
    const attribute = this.moonLine.geometry.getAttribute('position') as BufferAttribute;
    const array = attribute.array as Float32Array;
    const scratch = new Vector3();

    for (let i = 0; i < points.length; i += 1) {
      // Геоцентрический вектор в километрах, поэтому масштаб единичный:
      // так же его берёт и сама сцена, расставляя Луну.
      eclipticToScene(points[i]!, scratch, 1);
      array[i * 3 + 0] = scratch.x;
      array[i * 3 + 1] = scratch.y;
      array[i * 3 + 2] = scratch.z;
    }

    attribute.needsUpdate = true;
    this.moonJd = jd;
  }
}

