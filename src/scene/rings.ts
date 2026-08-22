import {
  Color,
  DoubleSide,
  Mesh,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Vector3,
  Vector4,
  type PerspectiveCamera,
} from 'three';

import { SOLAR_IRRADIANCE_SCALE } from '../core/units';
import type { RingBand } from '../data/appearance';
import noiseGlsl from '../shaders/lib/noise.glsl?raw';
import ringsGlsl from '../shaders/lib/rings.glsl?raw';
import ringVert from '../shaders/ring.vert.glsl?raw';
import ringFrag from '../shaders/ring.frag.glsl?raw';

/**
 * Кольца планеты.
 *
 * Геометрия строится сразу в километрах и в плоскости экватора тела, поэтому
 * достаточно вложить её в группу тела: наклон оси, а с ним и наклон колец,
 * получается сам собой. У Сатурна ось наклонена на 27°, и именно поэтому
 * кольца то раскрываются, то обращаются к нам ребром — с периодом в пятнадцать
 * лет. Отдельно этот эффект не программируется, он следует из ориентации.
 */

export interface RingOptions {
  /** Внутренний радиус системы колец, км. */
  inner: number;
  /** Внешний радиус, км. */
  outer: number;
  color: number;
  bands: RingBand[];
  ringlets: number;
  /** Экваториальный и полярный радиусы планеты — для расчёта её тени. */
  equatorial: number;
  polar: number;
}

/**
 * Сегментов по окружности много: кольцо тонкое и почти всегда видно под
 * острым углом, а на остром угле многоугольник выдаёт себя гранями.
 */
const RADIAL_SEGMENTS = 512;

/**
 * Колец по радиусу несколько: структура рисуется шейдером, но интерполяция
 * позиции по треугольнику должна быть достаточно частой, иначе у внутреннего
 * края появляется заметная огранка.
 */
const RING_SEGMENTS = 8;

const scratchSun = new Vector3();
const scratchCamera = new Vector3();
const bodyQuaternion = new Quaternion();
const inverseQuaternion = new Quaternion();

export class PlanetRings {
  readonly mesh: Mesh<RingGeometry, ShaderMaterial>;

  constructor(options: RingOptions) {
    const geometry = new RingGeometry(options.inner, options.outer, RADIAL_SEGMENTS, RING_SEGMENTS);
    // Кольцо three лежит в плоскости xy, а экватор тела — плоскость xz.
    geometry.rotateX(-Math.PI / 2);

    const material = new ShaderMaterial({
      vertexShader: ringVert,
      fragmentShader: [noiseGlsl, ringsGlsl, ringFrag].join('\n'),
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      defines: { RING_BANDS: String(options.bands.length) },
      uniforms: {
        uRingBands: { value: packBands(options.bands) },
        uRingletStrength: { value: options.ringlets },
        uSunPosition: { value: new Vector3() },
        uIrradianceScale: { value: SOLAR_IRRADIANCE_SCALE },
        uSunBodyDirection: { value: new Vector3(1, 0, 0) },
        uCameraBodyPosition: { value: new Vector3() },
        uColor: { value: new Color(options.color) },
        uEquatorial: { value: options.equatorial },
        uPolar: { value: options.polar },
        uRingInner: { value: options.inner },
        uRingOuter: { value: options.outer },
      },
    });

    this.mesh = new Mesh(geometry, material);
    // Кольца прозрачны и рисуются после непрозрачной поверхности планеты.
    this.mesh.renderOrder = 1;
  }

  /**
   * @param sunRenderPosition положение Солнца в координатах сцены
   * @param bodyRenderPosition положение планеты в координатах сцены
   * @param camera камера — она всегда в начале координат сцены
   */
  update(sunRenderPosition: Vector3, bodyRenderPosition: Vector3, camera: PerspectiveCamera): void {
    const uniforms = this.mesh.material.uniforms;
    (uniforms.uSunPosition!.value as Vector3).copy(sunRenderPosition);

    const parent = this.mesh.parent;
    if (!parent) return;

    // Направление на Солнце и положение камеры переводятся в систему тела:
    // в ней заданы и геометрия колец, и радиусы в шейдере.
    parent.getWorldQuaternion(bodyQuaternion);
    inverseQuaternion.copy(bodyQuaternion).invert();

    scratchSun
      .subVectors(sunRenderPosition, bodyRenderPosition)
      .normalize()
      .applyQuaternion(inverseQuaternion);
    (uniforms.uSunBodyDirection!.value as Vector3).copy(scratchSun);

    // Деление на масштаб меша — не мелочь. Геометрия колец задана в настоящих
    // километрах, и шейдер в них же считает и плотность, и тень, и наклон луча
    // зрения; множитель размеров раздувает кольца масштабом меша, не трогая
    // саму геометрию. Смещение камеры приходит сюда в километрах сцены, то
    // есть уже раздутых, — и без деления шейдер при ×1000 видел бы камеру в
    // тысяче радиусов от колец в тот момент, когда она стоит вплотную к ним.
    scratchCamera
      .copy(camera.position)
      .sub(bodyRenderPosition)
      .applyQuaternion(inverseQuaternion)
      .divideScalar(this.mesh.scale.x || 1);
    (uniforms.uCameraBodyPosition!.value as Vector3).copy(scratchCamera);
  }
}

/**
 * Полосы → массив vec4 для шейдера: внутренний, внешний, плотность, край.
 * Та же укладка нужна и материалу планеты — он считает тень колец тем же кодом.
 */
export function packBands(bands: readonly RingBand[]): Vector4[] {
  return bands.map((band) => new Vector4(band.inner, band.outer, band.density, band.edge));
}
