import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type PerspectiveCamera,
} from 'three';

import { AU, DEG } from '../core/units';
import coronaVert from '../shaders/corona.vert.glsl?raw';
import pointFrag from '../shaders/bodypoint.frag.glsl?raw';
import {
  SKY_POINT_INTENSITY,
  absoluteMagnitude,
  apparentMagnitude,
  magnitudeToBrightness,
  magnitudeToPointRadius,
} from './photometry';

/**
 * Точка-билборд для далёкого тела.
 *
 * При настоящем масштабе расстояний планета почти всегда меньше пикселя: с
 * орбиты Земли Юпитер имеет угловой диаметр около 40 угловых секунд, то есть
 * порядка сотой доли пикселя. Растеризатор такие треугольники теряет, и
 * планеты просто отсутствуют в кадре — а вместе с ними и вся сцена.
 *
 * Поэтому у каждого тела есть точка с нижней границей углового размера. Это
 * не условность: невооружённым глазом планеты и выглядят точками. Условностью
 * было бы обратное — раздувать сами планеты.
 *
 * Размер и яркость точки берутся из видимой звёздной величины по той же
 * шкале, что и у звёзд, поэтому Венера на общем плане ярче любой звезды, а
 * Плутон не виден вовсе — ровно как в действительности.
 */

/**
 * Границы перехода. Пока сферу видно хуже полутора пикселей, работает точка;
 * начиная с пяти — только сама сфера. Между ними плавное перекрытие, иначе
 * тело мигает на подлёте.
 */
const FADE_START_PIXELS = 1.5;
const FADE_END_PIXELS = 5;

/** Общая геометрия на все тела: билборд единичного полуразмера. */
const SHARED_GEOMETRY = new PlaneGeometry(2, 2);

const toCameraDirection = new Vector3();
const toSunDirection = new Vector3();

export class BodyPoint {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;

  /** Абсолютная звёздная величина тела — считается один раз. */
  private readonly absoluteMag: number;

  /** Радиус диска тела на экране на последнем кадре, пиксели. */
  private lastTruePixels = 0;

  /**
   * Видно ли тело в кадре хоть чем-нибудь. Точка гаснет в двух случаях:
   * тело слишком тусклое и его не должно быть видно вовсе — или, наоборот,
   * диск уже настолько велик, что точка не нужна. Различить их снаружи нельзя,
   * поэтому ответ даёт сам билборд. На этом держатся подписи: подпись не имеет
   * права стоять там, где ничего не нарисовано.
   */
  get drawn(): boolean {
    return this.mesh.visible || this.lastTruePixels >= FADE_START_PIXELS;
  }

  constructor(color: number, albedo: number, radiusKm: number) {
    this.absoluteMag = absoluteMagnitude(radiusKm * 2, albedo);

    const material = new ShaderMaterial({
      vertexShader: coronaVert,
      fragmentShader: pointFrag,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        uColor: { value: new Color(color) },
        uBrightness: { value: 0 },
      },
    });

    this.mesh = new Mesh(SHARED_GEOMETRY, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  /**
   * @param bodyRenderPosition позиция тела в координатах сцены (камера в нуле)
   * @param bodyRadiusKm видимый радиус тела
   * @param distanceToSunKm расстояние тела от Солнца
   * @param sunRenderPosition позиция Солнца в координатах сцены
   * @param exposure текущая экспозиция — небо не должно разгораться вместе с ней
   */
  update(
    bodyRenderPosition: Vector3,
    bodyRadiusKm: number,
    distanceToSunKm: number,
    sunRenderPosition: Vector3,
    camera: PerspectiveCamera,
    viewportHeightPx: number,
    exposure: number,
  ): void {
    const distance = bodyRenderPosition.length();
    if (distance < 1e-6) {
      this.mesh.visible = false;
      this.lastTruePixels = 0;
      return;
    }

    const radiansPerPixel = (camera.fov * DEG) / viewportHeightPx;
    const truePixels = bodyRadiusKm / distance / radiansPerPixel;
    this.lastTruePixels = truePixels;

    const opacity = 1 - smoothstep(FADE_START_PIXELS, FADE_END_PIXELS, truePixels);
    if (opacity <= 0.002) {
      this.mesh.visible = false;
      return;
    }

    // Фаза: какая доля обращённого к камере полушария освещена.
    toCameraDirection.copy(bodyRenderPosition).negate().normalize();
    toSunDirection.subVectors(sunRenderPosition, bodyRenderPosition).normalize();
    const phase = (1 + toCameraDirection.dot(toSunDirection)) / 2;

    const magnitude = apparentMagnitude(
      this.absoluteMag,
      distanceToSunKm / AU,
      distance / AU,
      phase,
    );

    // Слабее предела невооружённого глаза — не рисуем вовсе. Это не экономия,
    // а достоверность: Плутон с орбиты Земли не виден, и его не должно быть.
    if (magnitude > 7.5) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    // Размер точки не меньше физического — вблизи она обязана совпасть с диском.
    const pixelRadius = Math.max(magnitudeToPointRadius(magnitude), truePixels);

    /*
     * Билборд выносится вперёд собственной сферы.
     *
     * Если оставить его в центре тела, ближняя половина плоскости окажется
     * внутри сферы, и та закроет середину точки: вместо светящегося тела
     * получается тёмный диск с ободком. Ровно это и происходило с Ио.
     *
     * Выносить надо именно к камере, а не отключать проверку глубины: точка
     * обязана прятаться за телами, которые действительно перед ней. Запас
     * в пять процентов радиуса покрывает и сжатие тела у полюсов.
     */
    const standoff = bodyRadiusKm * 1.05;
    const billboardDistance = Math.max(distance - standoff, distance * 0.01);

    this.mesh.position
      .copy(bodyRenderPosition)
      .multiplyScalar(billboardDistance / distance);
    this.mesh.quaternion.copy(camera.quaternion);

    // Угловой размер считается от расстояния до самого билборда, иначе вынос
    // вперёд незаметно увеличил бы точку у близких тел.
    this.mesh.scale.setScalar(pixelRadius * radiansPerPixel * billboardDistance);

    this.mesh.material.uniforms.uBrightness!.value =
      (SKY_POINT_INTENSITY * magnitudeToBrightness(magnitude) * opacity) / Math.max(exposure, 1e-4);
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
