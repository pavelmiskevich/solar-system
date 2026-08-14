import {
  Color,
  Group,
  Mesh,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

import type { PerspectiveCamera } from 'three';

import { MOON, MOONS, MOON_MASS_FRACTION, PLANETS, type BodyDefinition } from '../data/bodies';
import { APPEARANCE, type Appearance } from '../data/appearance';
import { AU } from '../core/units';
import {
  illuminatedFraction,
  reflectedIrradianceFraction,
} from '../lighting/reflectedLight';
import { BodyPoint } from './bodyPoint';
import { createPlanetMaterial, updatePlanetScale } from './planetMaterial';
import { PlanetRings } from './rings';
import type { EclipticVector } from '../physics/kepler';
import { positionAt } from '../physics/kepler';
import { moonPositionAt } from '../physics/moon';
import { equatorialBasis, orientationAt, tidalOrientation } from '../physics/rotation';
import { satellitePosition } from '../physics/satellite';

/**
 * Множитель размера тел.
 *
 * Расстояния всегда настоящие — это требование идеи. Размеры можно раздуть,
 * но раздувать их надо согласованно со всей внутренней геометрией планетной
 * системы: радиусом планеты, радиусами спутников, радиусами их орбит и колец.
 * Тогда все угловые соотношения внутри системы сохраняются, и затмения с
 * транзитами продолжают сходиться — меняется только видимый размер «модели».
 *
 * По умолчанию единица, то есть настоящий масштаб. Причина в том, что уже при
 * ×100 система Земля–Луна растягивается на четверть расстояния до Солнца, а
 * система Юпитера перекрывает орбиту Марса. Видимость далёких планет
 * обеспечивается не раздуванием, а нижней границей углового размера — тем же
 * приёмом, что спасает Солнце с орбиты Нептуна.
 */
export const SIZE_PRESETS = [1, 10, 100, 1000] as const;

export interface Body {
  readonly definition: BodyDefinition;
  readonly appearance: Appearance;
  /** Мировая позиция в километрах, Float64. */
  readonly worldPosition: Vector3;
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  readonly group: Group;
  /** Точка-билборд, спасающая тело от исчезновения на далёких дистанциях. */
  readonly point: BodyPoint;
  /** Кольца, если они есть. */
  readonly rings: PlanetRings | null;
  /** Видимый радиус с учётом множителя размера, км. */
  visualRadius: number;
}

const scratchEcliptic = new Vector3();
const scratchDirection = new Vector3();
const scratchOrbit = new Vector3();
const scratchBasis = { node: new Vector3(), pole: new Vector3(), third: new Vector3() };
const scratchQuaternion = new Quaternion();

/** Солнце в начале гелиоцентрической системы: система гелиоцентрическая. */
const SUN_WORLD_POSITION = new Vector3(0, 0, 0);

/**
 * Эклиптические координаты → координаты сцены.
 *
 * Эклиптическая система правая, ось z смотрит на северный полюс эклиптики.
 * three.js тоже правая, но вверх у неё ось y, поэтому (x, y, z) переходит в
 * (x, z, −y): перестановка сохраняет правую тройку, зеркалить ничего не надо.
 */
export function eclipticToScene(v: EclipticVector, out: Vector3, scale = AU): Vector3 {
  return out.set(v.x * scale, v.z * scale, -v.y * scale);
}

export class SolarSystem {
  readonly root = new Group();
  /**
   * Слой точек-билбордов. Отдельная группа нужна потому, что её позиции уже
   * заданы относительно камеры и плавающее начало координат их не трогает.
   */
  readonly pointLayer = new Group();
  readonly bodies: Body[] = [];

  private sizeExaggeration = 1;

  /** Указатель на тела по идентификатору, см. `find`. */
  private readonly byId = new Map<string, Body>();

  constructor() {
    for (const definition of [...PLANETS, MOON, ...MOONS]) {
      const body = this.createBody(definition);
      this.bodies.push(body);
      this.byId.set(definition.id, body);
    }
  }

  private createBody(definition: BodyDefinition): Body {
    // Единичная сфера: реальный радиус и сжатие задаются масштабом группы,
    // поэтому смена множителя размера не требует пересборки геометрии.
    // Сегментов много: на подлёте вплотную силуэт не должен выдавать многогранник.
    const geometry = new SphereGeometry(1, 128, 64);
    const appearance = APPEARANCE[definition.id]!;
    const material = createPlanetMaterial({
      appearance,
      radius: definition.radius,
      polarRadius: definition.polarRadius,
    });

    const mesh = new Mesh(geometry, material);
    const group = new Group();
    group.add(mesh);
    this.root.add(group);

    // Кольца вкладываются в группу тела: наклон оси достаётся им бесплатно.
    let rings: PlanetRings | null = null;
    if (appearance.rings) {
      rings = new PlanetRings({
        ...appearance.rings,
        equatorial: definition.radius,
        polar: definition.polarRadius,
      });
      group.add(rings.mesh);
    }

    // Точка живёт отдельно от группы тела: группа повёрнута по оси вращения
    // планеты, а билборд обязан смотреть в камеру.
    const point = new BodyPoint(definition.color, definition.albedo, definition.radius);
    this.pointLayer.add(point.mesh);

    const body: Body = {
      definition,
      appearance,
      worldPosition: new Vector3(),
      mesh,
      group,
      point,
      rings,
      visualRadius: definition.radius,
    };

    this.applySize(body);
    return body;
  }

  /**
   * Обновить точки-билборды. Вызывается после переноса сцены в координаты
   * относительно камеры, потому что работает с позициями на экране.
   */
  updatePoints(
    camera: PerspectiveCamera,
    viewportHeightPx: number,
    sunRenderPosition: Vector3,
    exposure: number,
  ): void {
    for (const body of this.bodies) {
      body.point.update(
        body.group.position,
        body.visualRadius,
        Math.max(body.worldPosition.length(), 1),
        sunRenderPosition,
        camera,
        viewportHeightPx,
        exposure,
      );
    }
  }

  /**
   * Обновить освещение поверхностей.
   *
   * @param sunRenderPosition положение Солнца в координатах сцены
   * @param elapsed время от запуска, с — им живут облака и вихри
   */
  updateLighting(sunRenderPosition: Vector3, elapsed: number, camera: PerspectiveCamera): void {
    for (const body of this.bodies) {
      const uniforms = body.mesh.material.uniforms;
      (uniforms.uSunPosition!.value as Vector3).copy(sunRenderPosition);
      uniforms.uTime!.value = elapsed;

      if (body.rings) {
        // Тень колец и сами кольца считаются в системе координат тела:
        // направление на Солнце переводится в неё поворотом, обратным
        // ориентации планеты.
        scratchDirection
          .subVectors(sunRenderPosition, body.group.position)
          .normalize()
          .applyQuaternion(scratchQuaternion.copy(body.group.quaternion).invert());
        (uniforms.uSunBodyDirection!.value as Vector3).copy(scratchDirection);

        body.rings.update(sunRenderPosition, body.group.position, camera);
      }
    }

    // Единственная пара, где отражённый свет действительно виден. Земля
    // освещает ночную сторону Луны в тысячи раз сильнее, чем любая планета
    // освещает соседнюю: всё дело в том, что она рядом.
    const earth = this.find('earth');
    const moon = this.find('moon');
    if (earth && moon) {
      this.applyReflectedLight(moon, earth);
      this.applyReflectedLight(earth, moon);
    }
  }

  private applyReflectedLight(target: Body, source: Body): void {
    const distance = target.worldPosition.distanceTo(source.worldPosition);
    const fraction = reflectedIrradianceFraction(
      source.definition.albedo,
      source.visualRadius,
      distance,
      illuminatedFraction(source.worldPosition, target.worldPosition, SUN_WORLD_POSITION),
    );

    const uniforms = target.mesh.material.uniforms;
    (uniforms.uSecondPosition!.value as Vector3).copy(source.group.position);
    (uniforms.uSecondColor!.value as Color).setHex(source.definition.color);
    uniforms.uSecondStrength!.value = fraction;
  }

  private applySize(body: Body): void {
    const { definition } = body;
    const k = this.sizeExaggeration;
    body.visualRadius = definition.radius * k;
    // Сжатие вдоль оси вращения: у Сатурна полярный радиус на 10% меньше
    // экваториального, и без этого он выглядит чужой планетой.
    body.mesh.scale.set(definition.radius * k, definition.polarRadius * k, definition.radius * k);
    updatePlanetScale(
      body.mesh.material,
      definition.radius * k,
      definition.polarRadius * k,
      body.appearance.relief,
    );
    // Кольца раздуваются вместе с планетой: их геометрия задана в настоящих
    // километрах, поэтому достаточно того же множителя на группе.
    body.rings?.mesh.scale.setScalar(k);
  }

  setSizeExaggeration(value: number): void {
    if (value === this.sizeExaggeration) return;
    this.sizeExaggeration = value;
    for (const body of this.bodies) this.applySize(body);
  }

  getSizeExaggeration(): number {
    return this.sizeExaggeration;
  }

  /**
   * Поиск тела по идентификатору.
   *
   * Через указатель, а не перебором: за кадр он вызывается по разу на Землю,
   * Луну и хозяина каждого спутника. При шестнадцати телах перебор ничего не
   * стоит, но и указатель обходится в одну строку в конструкторе, а
   * рассуждать о стоимости обращения потом не приходится.
   */
  find(id: string): Body | undefined {
    return this.byId.get(id);
  }

  /** Пересчитать положения и ориентации всех тел на заданный момент. */
  update(jd: number): void {
    const earth = this.find('earth');
    const moon = this.find('moon');

    for (const body of this.bodies) {
      const { orbit } = body.definition;
      if (!orbit) continue;
      eclipticToScene(positionAt(orbit, jd), body.worldPosition);
    }

    // Земля и Луна обращаются вокруг общего барицентра, положение которого и
    // дают кеплеровы элементы. Смещение Земли от него — около 4700 км: именно
    // эта «качка» определяет, где именно проходит лунная тень при затмении.
    if (earth && moon) {
      eclipticToScene(moonPositionAt(jd), scratchEcliptic, 1);
      earth.worldPosition.addScaledVector(scratchEcliptic, -MOON_MASS_FRACTION);
      moon.worldPosition.copy(earth.worldPosition).add(scratchEcliptic);
    }

    // Спутники гигантов: положение относительно планеты в её экваториальной
    // системе. Планеты к этому моменту уже расставлены, и родитель на месте.
    for (const body of this.bodies) {
      const { satellite, parent } = body.definition;
      if (!satellite || !parent) continue;

      const host = this.find(parent);
      if (!host) continue;

      satellitePosition(satellite, jd, scratchOrbit);
      equatorialBasis(host.definition.rotation, scratchBasis);

      body.worldPosition
        .copy(host.worldPosition)
        .addScaledVector(scratchBasis.node, scratchOrbit.x)
        .addScaledVector(scratchBasis.third, scratchOrbit.y)
        .addScaledVector(scratchBasis.pole, scratchOrbit.z);
    }

    for (const body of this.bodies) {
      const { parent, tidallyLocked, rotation } = body.definition;
      const host = tidallyLocked && parent ? this.find(parent) : undefined;

      if (host) {
        // Синхронное вращение: нулевой меридиан смотрит на планету, полюс
        // остаётся полюсом. Ни одной подгоночной константы для этого не нужно.
        scratchDirection.subVectors(host.worldPosition, body.worldPosition);
        equatorialBasis(rotation, scratchBasis);
        tidalOrientation(scratchDirection, scratchBasis.pole, scratchQuaternion);
      } else {
        orientationAt(rotation, jd, scratchQuaternion);
      }

      body.group.quaternion.copy(scratchQuaternion);
    }
  }

  /**
   * Расстояние до ближайшей поверхности — им задаётся масштаб скорости полёта.
   * Солнце сюда не входит: его добавляет вызывающая сторона, чтобы система
   * не зависела от объекта Солнца.
   */
  distanceToNearestSurface(worldPosition: Vector3): { distance: number; body: Body | null } {
    let best = Infinity;
    let nearest: Body | null = null;

    for (const body of this.bodies) {
      const distance = worldPosition.distanceTo(body.worldPosition) - body.visualRadius;
      if (distance < best) {
        best = distance;
        nearest = body;
      }
    }

    return { distance: best, body: nearest };
  }
}
