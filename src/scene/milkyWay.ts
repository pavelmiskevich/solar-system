import {
  AdditiveBlending,
  BackSide,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

import { galacticBasis } from '../physics/frames';
import noiseGlsl from '../shaders/lib/noise.glsl?raw';
import milkyWayVert from '../shaders/milkyway.vert.glsl?raw';
import milkyWayFrag from '../shaders/milkyway.frag.glsl?raw';
import { SKY_POINT_INTENSITY } from './photometry';
import { SKY_RADIUS } from './starfield';

/**
 * Млечный Путь.
 *
 * Самое заметное, что видно с ночной стороны любой планеты, — и это не
 * украшение: небо из одних только звёзд каталога выглядит правдоподобно, но
 * пусто, потому что глазом мы видим не восемь тысяч звёзд, а ещё и общее
 * свечение сотни миллиардов, слитых в полосу.
 *
 * Рисуется процедурно в шейдере, как и поверхности планет: карта неба весила
 * бы мегабайты, а нужна от неё широкая полоса с прожилками пыли. Ложится она
 * по галактическим координатам, а не на глаз, — оси системы приходят готовыми
 * из `galacticBasis`.
 *
 * Сфера — та же, на которой стоят звёзды, только чуть больше и вывернутая
 * наизнанку: полоса обязана быть позади всех звёзд, а не среди них.
 */

/**
 * Яркость полосы в самом ярком её месте.
 *
 * Настоящая поверхностная яркость Млечного Пути — около 21ᵐ с квадратной
 * секунды, то есть он еле различим и в идеальную ночь. Здесь взято столько,
 * чтобы полоса читалась, но не спорила со звёздами: небо должно оставаться
 * звёздным, а не молочным.
 */
const BAND_INTENSITY = SKY_POINT_INTENSITY * 0.095;

/** Сегментов немного: вся форма живёт в шейдере, геометрия здесь — просто шар. */
const SEGMENTS = 48;

export class MilkyWay {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;

  constructor() {
    const basis = galacticBasis();

    const material = new ShaderMaterial({
      vertexShader: milkyWayVert,
      fragmentShader: [noiseGlsl, milkyWayFrag].join('\n'),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      // Изнутри сферы видна её изнанка — рисовать надо именно её.
      side: BackSide,
      uniforms: {
        uCentre: { value: basis.centre },
        uEast: { value: basis.east },
        uPole: { value: basis.pole },
        uIntensity: { value: BAND_INTENSITY },
      },
    });

    // Радиус чуть больше звёздного: сфера со звёздами должна оказаться внутри.
    this.mesh = new Mesh(new SphereGeometry(SKY_RADIUS * 1.02, SEGMENTS, SEGMENTS / 2), material);
    // Небо рисуется первым: всё остальное в сцене стоит перед ним.
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  /** Сфера неба ездит вместе с камерой: параллакса у Галактики быть не может. */
  followCamera(cameraRenderPosition: Vector3): void {
    this.mesh.position.copy(cameraRenderPosition);
  }

  /**
   * Отменить адаптацию экспозиции — по той же причине, что и для звёзд:
   * Млечный Путь бесконечно далёк, и его яркость не зависит от того, в какой
   * точке Солнечной системы стоит наблюдатель.
   */
  compensateExposure(exposure: number): void {
    this.mesh.material.uniforms.uIntensity!.value = BAND_INTENSITY / Math.max(exposure, 1e-4);
  }
}
