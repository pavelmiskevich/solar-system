import {
  AdditiveBlending,
  BackSide,
  FrontSide,
  Mesh,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type PerspectiveCamera,
} from 'three';

import { SOLAR_IRRADIANCE_SCALE } from '../core/units';
import type { Scattering } from '../data/appearance';
import atmosphereVert from '../shaders/atmosphere.vert.glsl?raw';
import atmosphereFrag from '../shaders/atmosphere.frag.glsl?raw';

/**
 * Атмосфера планеты: настоящий слой рассеяния вместо подсветки лимба.
 *
 * Разница видна сразу, и она не в красоте: подсветка — это ободок, нарисованный
 * по краю диска, и она ничего не знает ни о том, где Солнце, ни о том, какой
 * длины путь прошёл луч. Слой знает: он и голубой на дневной стороне, и
 * красный у терминатора, и продолжает светиться за краем диска — там, где
 * планета уже кончилась, а воздух ещё нет.
 *
 * Геометрия — сфера чуть больше самой планеты, в настоящих километрах и в
 * системе координат тела: в них же считается весь интеграл в шейдере.
 */

/** Сегментов у оболочки: силуэт виден на просвет, огранка на нём заметна. */
const SEGMENTS = 96;

/**
 * Во сколько раз рассеянный свет ярче того, что даёт голый расчёт.
 *
 * Множитель не подгонка, а две поправки, сложенные вместе.
 *
 * Первая — π. Вся сцена считает яркость поверхности как albedo × освещённость,
 * без деления на π, которое стоит в формуле ламбертовой поверхности. Атмосфера
 * же считается по физике честно, и рядом с такой поверхностью выглядела бы
 * втрое темнее, чем должна. Приводить к общему знаменателю проще здесь, чем
 * менять яркость всех тел сцены.
 *
 * Вторая — двойка за многократное рассеяние. Модель считает только однократное:
 * свет, рассеянный один раз и ушедший к наблюдателю. На деле в плотной части
 * атмосферы фотон рассеивается по нескольку раз, и в синем это добавляет
 * примерно столько же, сколько даёт первое рассеяние. Считать честно вдесятеро
 * дороже, а разница — множитель.
 */
const SCATTER_GAIN = 2 * Math.PI;

/** Рабочий поворот: сцена → система координат тела. */
const toLocal = new Quaternion();

export interface AtmosphereOptions {
  /** Экваториальный радиус планеты, км. */
  radius: number;
  scattering: Scattering;
}

export class Atmosphere {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;

  private readonly planetRadius: number;
  private readonly outerRadius: number;
  private readonly camera = new Vector3();
  private readonly sun = new Vector3();

  constructor({ radius, scattering }: AtmosphereOptions) {
    this.planetRadius = radius;
    this.outerRadius = radius + scattering.thickness;

    const material = new ShaderMaterial({
      vertexShader: atmosphereVert,
      fragmentShader: atmosphereFrag,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: FrontSide,
      uniforms: {
        uCameraLocal: { value: new Vector3() },
        uSunLocal: { value: new Vector3(1, 0, 0) },
        uPlanetRadius: { value: radius },
        uAtmosphereRadius: { value: this.outerRadius },
        uRayleigh: { value: new Vector3(...scattering.rayleigh) },
        uMie: { value: scattering.mie },
        uScaleHeight: { value: scattering.scaleHeight },
        uMieHeight: { value: scattering.mieHeight },
        uSunIrradiance: { value: 0 },
      },
    });

    this.mesh = new Mesh(new SphereGeometry(this.outerRadius, SEGMENTS, SEGMENTS / 2), material);
    // Атмосфера рисуется после поверхности и после колец: она прозрачна и
    // складывается с тем, что за ней.
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
  }

  /**
   * @param sunRenderPosition положение Солнца в координатах сцены
   * @param bodyRenderPosition положение планеты в координатах сцены
   * @param camera камера — она всегда в начале координат сцены
   * @param scale множитель размеров: геометрия задана в настоящих километрах
   */
  update(
    sunRenderPosition: Vector3,
    bodyRenderPosition: Vector3,
    camera: PerspectiveCamera,
    scale: number,
  ): void {
    const parent = this.mesh.parent;
    if (!parent) return;

    const uniforms = this.mesh.material.uniforms;

    // Всё переводится в систему координат тела и в настоящие километры.
    // Поворот, обратный ориентации планеты, переводит направления; деление на
    // множитель размеров — длины: раздувает оболочку масштаб меша, а ни
    // геометрия, ни высоты, по которым считается плотность воздуха, при этом
    // не меняются.
    parent.getWorldQuaternion(toLocal).invert();

    this.camera
      .copy(camera.position)
      .sub(bodyRenderPosition)
      .applyQuaternion(toLocal)
      .divideScalar(scale || 1);
    (uniforms.uCameraLocal!.value as Vector3).copy(this.camera);

    this.sun
      .subVectors(sunRenderPosition, bodyRenderPosition)
      .applyQuaternion(toLocal)
      .normalize();
    (uniforms.uSunLocal!.value as Vector3).copy(this.sun);

    // Облучённость та же, что у поверхности: дальше от Солнца небо планеты
    // тускнеет ровно во столько же раз, во сколько и она сама.
    const distance = Math.max(sunRenderPosition.distanceTo(bodyRenderPosition), 1);
    uniforms.uSunIrradiance!.value =
      (SOLAR_IRRADIANCE_SCALE / (distance * distance)) * SCATTER_GAIN;

    // Изнутри оболочки видна её изнанка: рисовать надо ту грань, сквозь
    // которую смотрит камера, иначе слой пропадёт при подлёте вплотную.
    const inside = this.camera.length() < this.outerRadius;
    const side = inside ? BackSide : FrontSide;
    if (this.mesh.material.side !== side) {
      this.mesh.material.side = side;
      this.mesh.material.needsUpdate = true;
    }
  }

  /** Радиус слоя, км: по нему проверяется его толщина. */
  get radius(): number {
    return this.outerRadius;
  }

  get surfaceRadius(): number {
    return this.planetRadius;
  }
}
