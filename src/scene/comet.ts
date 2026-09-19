import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';

import { AU } from '../core/units';
import { activityAt, dustTailPoints, ionTailPoints } from '../physics/cometTail';
import { positionAt, type EclipticVector, type OrbitalElements } from '../physics/kepler';
import tailVert from '../shaders/cometTail.vert.glsl?raw';
import tailFrag from '../shaders/cometTail.frag.glsl?raw';
import { eclipticToScene } from './system';

/** Сколько точек вдоль ленты. Хватает на плавный изгиб пылевого хвоста. */
const SEGMENTS = 48;

/**
 * Ширина хвоста у конца, в долях его длины.
 *
 * Ионный узкий: ветер уносит ионы почти параллельным пучком. Пылевой шире -
 * у песчинок разный размер, свет давит на них по-разному, и веер расходится.
 * Настоящий хвост от этого и выглядит как метла, а не как луч.
 */
const ION_FLARE = 0.05;
const DUST_FLARE = 0.16;

/** Цвета хвостов. */
const ION_COLOR = 0x8fb9ff;
const DUST_COLOR = 0xffe2b0;

/** Яркость в перигелии, до применения экспозиции. */
const ION_INTENSITY = 0.55;
const DUST_INTENSITY = 0.75;

interface Ribbon {
  mesh: Mesh<BufferGeometry, ShaderMaterial>;
  positions: Float32Array;
  flare: number;
  intensity: number;
}

/**
 * Хвосты кометы.
 *
 * Геометрия строится относительно ядра, а не Солнца, и это не мелочь. У
 * афелия комета в тридцати пяти астрономических единицах, и координаты там
 * такие, что шаг Float32 доходит до сотен километров: хвост, заданный
 * абсолютными координатами, отрывался бы от собственного ядра при подлёте к
 * нему вплотную. Группу по мировому положению кометы ведёт плавающее начало
 * координат - так же, как орбиты спутников ведут по их планетам.
 *
 * Ленты поворачиваются к камере каждый кадр: хвост - не плоский лист, а
 * облако, и с любой стороны он должен выглядеть одинаково широким.
 *
 * Сама форма хвостов сюда не входит - её считает physics/cometTail.ts,
 * который можно проверить числами без всякого браузера.
 */
export class CometTails {
  readonly group = new Group();

  private readonly ion: Ribbon;
  private readonly dust: Ribbon;
  private readonly perihelionAu: number;

  constructor(private readonly orbit: OrbitalElements) {
    this.perihelionAu = orbit.a * (1 - orbit.e);

    this.ion = this.createRibbon(ION_COLOR, ION_FLARE, ION_INTENSITY);
    this.dust = this.createRibbon(DUST_COLOR, DUST_FLARE, DUST_INTENSITY);

    // Пылевой рисуется первым: он шире и тусклее, ионный ложится поверх.
    this.group.add(this.dust.mesh, this.ion.mesh);
  }

  /**
   * Пересчитать хвосты на момент jd.
   *
   * @param cameraOffset положение камеры относительно ядра, км
   */
  update(jd: number, cameraOffset: Vector3): void {
    const nucleus = positionAt(this.orbit, jd);
    const distance = Math.hypot(nucleus.x, nucleus.y, nucleus.z);
    const activity = activityAt(distance, this.perihelionAu);

    if (activity === 0) {
      this.ion.mesh.visible = false;
      this.dust.mesh.visible = false;
      return;
    }

    this.shape(this.ion, ionTailPoints(this.orbit, jd, SEGMENTS), nucleus, cameraOffset, activity);
    this.shape(this.dust, dustTailPoints(this.orbit, jd, SEGMENTS), nucleus, cameraOffset, activity);
  }

  /** Отменить адаптацию экспозиции - как у звёзд и линий орбит. */
  compensateExposure(exposure: number): void {
    const scale = 1 / Math.max(exposure, 1e-4);
    this.ion.mesh.material.uniforms.uExposure!.value = scale;
    this.dust.mesh.material.uniforms.uExposure!.value = scale;
  }

  private createRibbon(color: number, flare: number, intensity: number): Ribbon {
    const positions = new Float32Array(SEGMENTS * 2 * 3);
    const sides = new Float32Array(SEGMENTS * 2);
    const reach = new Float32Array(SEGMENTS * 2);
    const indices: number[] = [];

    for (let i = 0; i < SEGMENTS; i += 1) {
      sides[i * 2] = -1;
      sides[i * 2 + 1] = 1;
      reach[i * 2] = i / (SEGMENTS - 1);
      reach[i * 2 + 1] = i / (SEGMENTS - 1);

      if (i < SEGMENTS - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aSide', new BufferAttribute(sides, 1));
    geometry.setAttribute('aReach', new BufferAttribute(reach, 1));
    geometry.setIndex(indices);

    const material = new ShaderMaterial({
      vertexShader: tailVert,
      fragmentShader: tailFrag,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uColor: { value: new Color(color) },
        uIntensity: { value: intensity },
        uExposure: { value: 1 },
      },
    });

    const mesh = new Mesh(geometry, material);
    // Границы ленты меняются каждый кадр, а группу переставляет плавающее
    // начало координат - по той же причине, что у линий орбит.
    mesh.frustumCulled = false;

    return { mesh, positions, flare, intensity };
  }

  /** Натянуть ленту на точки хвоста и повернуть её к камере. */
  private shape(
    ribbon: Ribbon,
    points: EclipticVector[],
    nucleus: EclipticVector,
    cameraOffset: Vector3,
    activity: number,
  ): void {
    if (points.length < 2) {
      ribbon.mesh.visible = false;
      return;
    }

    const tip = points[points.length - 1]!;
    const span =
      Math.hypot(tip.x - nucleus.x, tip.y - nucleus.y, tip.z - nucleus.z) * AU;

    /*
     * Гаснет при подлёте вплотную - как гаснут линии орбит у планеты.
     *
     * Хвост здесь лента, и с расстояния в сотни километров от ядра зритель
     * оказывается внутри неё: лента разворачивается поперёк взгляда и
     * закрывает полнеба белым полотном. В жизни изнутри хвоста не видно
     * ничего - вещества в нём меньше, чем в лабораторном вакууме, и светится
     * он только набранной по лучу зрения толщиной.
     *
     * Поэтому вблизи хвост убирается. Порог - в долях его собственной длины:
     * у кометы она меняется в разы, и постоянное число в километрах
     * означало бы разное на разных расстояниях от Солнца.
     */
    const distanceToCamera = cameraOffset.length();
    const closeness = Math.min(1, Math.max(0, (distanceToCamera / span - 0.02) / 0.48));
    const nearFade = closeness * closeness;

    if (nearFade <= 0) {
      ribbon.mesh.visible = false;
      return;
    }

    ribbon.mesh.visible = true;
    ribbon.mesh.material.uniforms.uIntensity!.value = ribbon.intensity * activity * nearFade;

    const local = new Vector3();
    const next = new Vector3();
    const tangent = new Vector3();
    const toCamera = new Vector3();
    const across = new Vector3();

    for (let i = 0; i < SEGMENTS; i += 1) {
      const point = points[Math.min(i, points.length - 1)]!;
      toScene(point, nucleus, local);

      const after = points[Math.min(i + 1, points.length - 1)]!;
      toScene(after, nucleus, next);

      tangent.subVectors(next, local);
      if (tangent.lengthSq() < 1e-12) tangent.set(1, 0, 0);
      tangent.normalize();

      // Лента разворачивается поперёк луча зрения: иначе с ребра она
      // пропадала бы в ничто.
      toCamera.subVectors(cameraOffset, local);
      across.crossVectors(tangent, toCamera);
      if (across.lengthSq() < 1e-12) across.set(0, 1, 0);
      across.normalize();

      const reach = i / (SEGMENTS - 1);
      // У ядра лента сходится почти в точку: там кома, а не хвост.
      const halfWidth = span * ribbon.flare * (0.08 + 0.92 * reach);

      const offset = i * 6;
      ribbon.positions[offset] = local.x - across.x * halfWidth;
      ribbon.positions[offset + 1] = local.y - across.y * halfWidth;
      ribbon.positions[offset + 2] = local.z - across.z * halfWidth;
      ribbon.positions[offset + 3] = local.x + across.x * halfWidth;
      ribbon.positions[offset + 4] = local.y + across.y * halfWidth;
      ribbon.positions[offset + 5] = local.z + across.z * halfWidth;
    }

    ribbon.mesh.geometry.getAttribute('position').needsUpdate = true;
  }
}

/** Точка хвоста в осях сцены, относительно ядра, км. */
function toScene(point: EclipticVector, nucleus: EclipticVector, out: Vector3): Vector3 {
  return eclipticToScene(
    { x: point.x - nucleus.x, y: point.y - nucleus.y, z: point.z - nucleus.z },
    out,
  );
}
