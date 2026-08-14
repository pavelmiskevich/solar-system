import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type PerspectiveCamera,
} from 'three';

import { DEG, SUN_RADIUS } from '../core/units';
import noiseGlsl from '../shaders/lib/noise.glsl?raw';
import sunVert from '../shaders/sun.vert.glsl?raw';
import sunFrag from '../shaders/sun.frag.glsl?raw';
import coronaVert from '../shaders/corona.vert.glsl?raw';
import coronaFrag from '../shaders/corona.frag.glsl?raw';

/**
 * Источника света как объекта сцены нет, и это осознанно: все поверхности
 * считают освещение сами, потому что им нужны терминатор с мягкостью по
 * плотности атмосферы, тени колец и отражённый свет соседнего тела. Стандартный
 * PointLight не умеет ничего из этого, а лишний источник заставлял бы three
 * собирать для каждой программы униформы, которыми никто не пользуется.
 * Опорная величина освещённости лежит в core/units.ts.
 */

/** Во сколько раз билборд короны шире фотосферы. */
const CORONA_SCALE = 3.4;

/**
 * Минимальный радиус короны на экране в пикселях.
 *
 * С орбиты Нептуна угловой диаметр Солнца — 0.44 пикселя, и растеризатор
 * теряет его полностью: на месте самого яркого объекта неба оказывается
 * пустота. Поэтому билборду задаётся нижняя граница размера — тот же приём,
 * которым в M5 будут спасаться далёкие планеты.
 */
const MIN_CORONA_PIXELS = 2.5;

const BASE_CORONA_INTENSITY = 2.4;

export class Sun {
  readonly group = new Group();
  /** Солнце в центре гелиоцентрической системы. */
  readonly worldPosition = new Vector3(0, 0, 0);

  /**
   * Множитель размера — общий с планетами.
   *
   * Раздувать планеты, оставляя Солнце настоящим, нельзя: при ×1000 Юпитер
   * становится крупнее звезды, вокруг которой обращается, и вся картина
   * перестаёт быть моделью чего бы то ни было.
   */
  private exaggeration = 1;
  private readonly surface: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly corona: Mesh<PlaneGeometry, ShaderMaterial>;

  constructor() {
    const surfaceMaterial = new ShaderMaterial({
      vertexShader: sunVert,
      fragmentShader: `${noiseGlsl}\n${sunFrag}`,
      side: FrontSide,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 6.0 },
        uCoolColor: { value: new Color(0.98, 0.42, 0.11) },
        uHotColor: { value: new Color(1.0, 0.95, 0.86) },
      },
    });

    this.surface = new Mesh(new SphereGeometry(SUN_RADIUS, 96, 48), surfaceMaterial);
    this.group.add(this.surface);

    const coronaMaterial = new ShaderMaterial({
      vertexShader: coronaVert,
      fragmentShader: `${noiseGlsl}\n${coronaFrag}`,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: BASE_CORONA_INTENSITY },
        uColor: { value: new Color(1.0, 0.78, 0.44) },
        uCoreRadius: { value: 1 / CORONA_SCALE },
      },
    });

    const size = SUN_RADIUS * CORONA_SCALE * 2;
    this.corona = new Mesh(new PlaneGeometry(size, size), coronaMaterial);
    this.corona.renderOrder = 2;
    this.group.add(this.corona);
  }

  /** Видимый радиус с учётом множителя размера, км. */
  get visualRadius(): number {
    return SUN_RADIUS * this.exaggeration;
  }

  setSizeExaggeration(value: number): void {
    if (value === this.exaggeration) return;
    this.exaggeration = value;
    this.surface.scale.setScalar(value);
  }

  update(elapsed: number, camera: PerspectiveCamera, viewportHeightPx: number): void {
    this.surface.material.uniforms.uTime!.value = elapsed;
    this.corona.material.uniforms.uTime!.value = elapsed;

    // Билборд всегда развёрнут к камере.
    this.corona.quaternion.copy(camera.quaternion);

    // И обязательно отодвинут за центр Солнца: если оставить его в центре,
    // ближняя половина плоскости окажется перед фотосферой и зальёт диск —
    // корона должна светиться только вокруг диска, а не поверх него.
    // Глубина отодвигания — чуть больше радиуса, чтобы сфера гарантированно
    // перекрывала центральную часть билборда.
    const radius = this.visualRadius;
    const away = this.group.position;
    const distance = away.length();
    if (distance > 1e-6) {
      this.corona.position.copy(away).multiplyScalar((radius * 1.08) / distance);
    } else {
      this.corona.position.set(0, 0, 0);
      return;
    }

    // Нижняя граница углового размера. Радиан на пиксель по вертикали кадра.
    const radiansPerPixel = (camera.fov * DEG) / viewportHeightPx;
    const naturalAngularRadius = (radius * CORONA_SCALE) / distance;
    const minAngularRadius = MIN_CORONA_PIXELS * radiansPerPixel;
    const scale = Math.max(1, minAngularRadius / naturalAngularRadius);
    // Геометрия короны построена в настоящих километрах, поэтому множитель
    // размера входит в её масштаб наравне с раздутием под нижнюю границу.
    this.corona.scale.setScalar(scale * this.exaggeration);

    // Раздувая билборд, мы размазываем тот же световой поток по большей
    // площади — значит, яркость должна упасть на квадрат раздутия. Без этого
    // «спасённое» Солнце превращается у внешних планет в исполинскую кляксу;
    // с этим оно остаётся тем, чем и является — очень яркой звездой.
    this.corona.material.uniforms.uIntensity!.value = BASE_CORONA_INTENSITY / (scale * scale);
  }
}
