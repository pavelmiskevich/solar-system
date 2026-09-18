import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';

import { AU } from '../core/units';
import { asteroidCatalog } from '../data/asteroids';
import { solveKepler } from '../physics/kepler';
import starVert from '../shaders/starpoint.vert.glsl?raw';
import starFrag from '../shaders/starpoint.frag.glsl?raw';

/**
 * Цвет камня.
 *
 * Один на весь рой, и это не упрощение, а честность: каталог не знает
 * спектральных классов отобранных тел, а раскрасить их наугад значило бы
 * сообщить зрителю то, чего мы не знаем. Тёплый серый - усреднённый
 * астероид, каким его видит камера: тело без атмосферы, отражающее солнечный
 * свет пылью.
 */
const ROCK_COLOR: [number, number, number] = [1.0, 0.93, 0.83];

/**
 * Во сколько раз пятно астероида крупнее геометрического размера.
 *
 * У звёзд множитель отыгрывает размазывание точечного источника глазом и
 * матрицей. Здесь он меньше: астероид не источник, а отражатель, и ореола
 * вокруг него быть не должно - иначе рой читается как россыпь звёзд между
 * орбитами, а не как вещество.
 */
const ROCK_SIZE_SCALE = 1.4;

/**
 * Яркость роя - разметка, а не фотометрия. И это осознанная неправда.
 *
 * Честная величина астероида главного пояса, видимого с Земли, - около
 * шестнадцатой: в сотни раз слабее самой слабой звезды, различимой глазом.
 * С десяти астрономических единиц сверху, откуда пояс только и виден целиком,
 * выходит двадцатая. Через `apparentMagnitude`, которой считаются планеты,
 * рой не проступил бы ни из одной точки сцены - получился бы пустой экран и
 * пять тысяч честно посчитанных невидимых точек.
 *
 * Поэтому пояс живёт по тем же правилам, что линии орбит и фигуры созвездий:
 * он не изображает вещество, он показывает, где вещество лежит. Отсюда и
 * собственная шкала, и отмена адаптации экспозиции - рой обязан выглядеть
 * одинаково и от Земли, и с орбиты Нептуна.
 *
 * Физика остаётся в двух местах, где она видна: крупные тела ярче мелких, и
 * освещённая доля диска гасит те, что зашли за Солнце.
 */
const MARKING_BRIGHTNESS = 0.32;

/** Абсолютная величина, от которой считается перепад яркости в рое. */
const REFERENCE_MAGNITUDE = 9;

/**
 * Пояс астероидов, троянцы и околоземные.
 *
 * Пять тысяч настоящих тел из базы малых тел JPL, а не облако случайных
 * точек. Смысл в этом и состоит: люки Кирквуда, два облака троянцев у точек
 * Лагранжа и разреженная мелочь во внутренней системе - это не нарисованные
 * особенности, а то, что получается само, если взять настоящие орбиты.
 *
 * Рой считается на CPU каждый кадр. У астероида нет вековых членов, поэтому
 * плоскость его орбиты неподвижна: в каталоге лежат готовые гауссовы векторы
 * (см. src/data/asteroids.ts), и за кадр на тело остаётся одно решение
 * уравнения Кеплера и десяток умножений.
 *
 * Яркость роя считается не по фотометрии планет, а по шкале разметки - см.
 * MARKING_BRIGHTNESS ниже, там же и причина.
 */
export class AsteroidBelt {
  readonly group = new Group();
  /** Мировая позиция Солнца - группа привязывается к ней. */
  readonly worldPosition = new Vector3(0, 0, 0);

  readonly points: Points<BufferGeometry, ShaderMaterial>;

  private readonly positions: Float32Array;
  private readonly brightness: Float32Array;
  /** Яркость тела при полностью освещённом диске: от размера, и только. */
  private readonly litBrightness: Float32Array;
  private readonly catalog = asteroidCatalog();
  private intensity = MARKING_BRIGHTNESS;

  constructor() {
    const count = this.catalog.count;

    this.positions = new Float32Array(count * 3);
    this.brightness = new Float32Array(count);
    this.litBrightness = new Float32Array(count);

    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3 + 0] = ROCK_COLOR[0];
      colors[i * 3 + 1] = ROCK_COLOR[1];
      colors[i * 3 + 2] = ROCK_COLOR[2];

      /*
       * Размер и опорная яркость считаются один раз: обе зависят только от
       * абсолютной величины, а та у астероида не меняется. За кадр остаётся
       * положение и фаза.
       *
       * Показатель 0.08 вместо физических 0.4 - сжатие шкалы. Между Вестой и
       * километровым околоземным телом почти четырнадцать величин, то есть
       * четыре порядка яркости по-настоящему; в кадре этот перепад означал бы,
       * что видно одну Весту.
       */
      const relative = this.catalog.magnitude[i]! - REFERENCE_MAGNITUDE;
      this.litBrightness[i] = Math.min(3, Math.pow(10, -0.08 * relative));
      sizes[i] = this.catalog.magnitude[i]! < 6 ? 1.4 : 1;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
    geometry.setAttribute('aBrightness', new BufferAttribute(this.brightness, 1));

    const material = new ShaderMaterial({
      vertexShader: starVert,
      fragmentShader: starFrag,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uSizeScale: { value: ROCK_SIZE_SCALE },
        uIntensity: { value: MARKING_BRIGHTNESS },
      },
    });

    this.points = new Points(geometry, material);
    // Отключено намеренно: границы роя меняются каждый кадр, а группу
    // переставляет плавающее начало координат - по той же причине, что и у
    // линий орбит.
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  /**
   * Пересчитать рой на момент jd.
   *
   * @param observerWorld положение наблюдателя в мировых координатах, км
   */
  update(jd: number, observerWorld: Vector3): void {
    const catalog = this.catalog;
    const count = catalog.count;
    const days = jd - catalog.epoch;

    const ox = observerWorld.x;
    const oy = observerWorld.y;
    const oz = observerWorld.z;

    for (let i = 0; i < count; i += 1) {
      const a = catalog.semiMajorAxis[i]!;
      const e = catalog.eccentricity[i]!;
      const E = solveKepler(catalog.meanAnomaly[i]! + catalog.meanMotion[i]! * days, e);

      const cosE = Math.cos(E);
      const inPlaneX = a * (cosE - e);
      const inPlaneY = a * Math.sqrt(1 - e * e) * Math.sin(E);

      // Эклиптические координаты, а.е.
      const x = catalog.px[i]! * inPlaneX + catalog.qx[i]! * inPlaneY;
      const y = catalog.py[i]! * inPlaneX + catalog.qy[i]! * inPlaneY;
      const z = catalog.pz[i]! * inPlaneX + catalog.qz[i]! * inPlaneY;

      // Оси сцены: та же перестановка, что в eclipticToScene.
      const sceneX = x * AU;
      const sceneY = z * AU;
      const sceneZ = -y * AU;

      this.positions[i * 3 + 0] = sceneX;
      this.positions[i * 3 + 1] = sceneY;
      this.positions[i * 3 + 2] = sceneZ;

      // Расстояние до Солнца берётся из решения Кеплера, без корня:
      // r = a(1 − e·cos E).
      const sunKm = a * (1 - e * cosE) * AU;

      const dx = ox - sceneX;
      const dy = oy - sceneY;
      const dz = oz - sceneZ;
      const cameraKm = Math.sqrt(dx * dx + dy * dy + dz * dz);

      /*
       * Доля освещённого диска, видимая наблюдателю.
       *
       * Угол фазы считается между направлениями «на Солнце» и «на
       * наблюдателя» из самого тела. Астероид светит отражённым светом, и без
       * этого множителя рой по ту сторону Солнца был бы виден так же, как
       * ближняя его половина, - а он там повёрнут к зрителю ночной стороной.
       *
       * Это единственная физика, оставленная в яркости: она видна глазом и
       * даёт поясу объём, которого не даёт ни одна подгонка.
       */
      const cosPhase =
        cameraKm > 0 ? (-sceneX * dx - sceneY * dy - sceneZ * dz) / (sunKm * cameraKm) : 1;
      const phase = (1 + Math.max(-1, Math.min(1, cosPhase))) / 2;

      // Пол по фазе: у самого терминатора тело не пропадает совсем, как не
      // пропадает и узкий серп Луны.
      this.brightness[i] = this.litBrightness[i]! * Math.max(phase, 0.08);
    }

    const geometry = this.points.geometry;
    geometry.getAttribute('position').needsUpdate = true;
    geometry.getAttribute('aBrightness').needsUpdate = true;
  }

  /**
   * Отменить для роя адаптацию экспозиции - как у звёзд и линий орбит.
   *
   * Экспозиция растёт в десятки раз с удалением от Солнца, и рой, едущий
   * вместе с ней, у внешних планет превратился бы в сплошное молоко, а у
   * Меркурия пропал бы вовсе. Пояс - разметка: он обязан читаться одинаково
   * отовсюду.
   */
  compensateExposure(exposure: number): void {
    this.points.material.uniforms.uIntensity!.value = this.intensity / Math.max(exposure, 1e-4);
  }
}
