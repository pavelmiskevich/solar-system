import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';

import { starCatalog } from '../data/stars';
import { sphericalEquatorialToScene } from '../physics/frames';
import starVert from '../shaders/starpoint.vert.glsl?raw';
import starFrag from '../shaders/starpoint.frag.glsl?raw';
import { SKY_POINT_INTENSITY, magnitudeToBrightness, magnitudeToPointRadius } from './photometry';

/**
 * Во сколько раз пятно звезды крупнее её геометрического размера.
 *
 * Звезда — точечный источник, и геометрически её пятно всегда меньше пикселя.
 * Так её не видит ни глаз, ни матрица: и тот и другая размазывают точку в пятно
 * в несколько угловых минут. Без этого размазывания растеризатор закрашивает пиксель
 * частично и отбирает у звезды большую часть яркости: небо по каталогу
 * получалось пустым при тысяче звёзд в кадре.
 */
const STAR_SIZE_SCALE = 2.2;

/** Радиус звёздной сферы: далеко за Нептуном, но внутри дальней плоскости. */
const SKY_RADIUS = 1e11;



/**
 * Опорные точки цвета по показателю B−V: от горячих голубых до холодных
 * красных гигантов. Значения подогнаны под то, как звёзды выглядят на
 * длинной выдержке, а не под чистую физику абсолютно чёрного тела —
 * последняя даёт заметно более блёклую картинку.
 */
const BV_RAMP: [number, number, number, number][] = [
  [-0.4, 0.62, 0.72, 1.0],
  [0.0, 0.79, 0.85, 1.0],
  [0.4, 0.97, 0.96, 1.0],
  [0.65, 1.0, 0.94, 0.86],
  [1.0, 1.0, 0.86, 0.7],
  [1.5, 1.0, 0.74, 0.52],
  [2.0, 1.0, 0.63, 0.42],
];

function colorFromBV(bv: number, out: [number, number, number]): void {
  let i = 0;
  while (i < BV_RAMP.length - 2 && bv > BV_RAMP[i + 1]![0]) i++;
  const a = BV_RAMP[i]!;
  const b = BV_RAMP[i + 1]!;
  const t = Math.max(0, Math.min(1, (bv - a[0]) / (b[0] - a[0])));
  out[0] = a[1] + (b[1] - a[1]) * t;
  out[1] = a[2] + (b[2] - a[2]) * t;
  out[2] = a[3] + (b[3] - a[3]) * t;
}

/**
 * Звёздное небо по каталогу HYG.
 *
 * Восемь с половиной тысяч настоящих звёзд ярче шестой с половиной
 * величины: те же, что видны глазом в идеальную ночь. Созвездия при
 * этом складываются сами — их никто не рисует, и в этом весь смысл замены
 * процедурного неба на каталог: с орбиты Марса видны те же Орион и
 * Большая Медведица, что и с Земли, — звёзды слишком далеко, чтобы
 * перемещение на десятки а.е. что-то в них поменяло.
 *
 * Координаты в каталоге экваториальные, а сцена эклиптическая: без поворота
 * на наклон эклиптики всё небо оказалось бы повёрнуто на 23.4° относительно
 * плоскости орбит.
 */
export class Starfield {
  readonly points: Points<BufferGeometry, ShaderMaterial>;

  /** Яркость точки нулевой величины на экране — общая со всем небом. */
  private readonly baseIntensity = SKY_POINT_INTENSITY;

  constructor() {
    const catalog = starCatalog();
    const count = catalog.count;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const brightness = new Float32Array(count);
    const rgb: [number, number, number] = [1, 1, 1];
    const direction = new Vector3();

    for (let i = 0; i < count; i++) {
      sphericalEquatorialToScene(catalog.rightAscension[i]!, catalog.declination[i]!, direction);
      positions[i * 3 + 0] = direction.x * SKY_RADIUS;
      positions[i * 3 + 1] = direction.y * SKY_RADIUS;
      positions[i * 3 + 2] = direction.z * SKY_RADIUS;

      const magnitude = catalog.magnitude[i]!;
      sizes[i] = magnitudeToPointRadius(magnitude);
      brightness[i] = magnitudeToBrightness(magnitude);

      colorFromBV(catalog.colorIndex[i]!, rgb);
      colors[i * 3 + 0] = rgb[0];
      colors[i * 3 + 1] = rgb[1];
      colors[i * 3 + 2] = rgb[2];
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
    geometry.setAttribute('aBrightness', new BufferAttribute(brightness, 1));

    const material = new ShaderMaterial({
      vertexShader: starVert,
      fragmentShader: starFrag,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uSizeScale: { value: STAR_SIZE_SCALE },
        uIntensity: { value: 1.0 },
      },
    });

    this.points = new Points(geometry, material);
  }

  /**
   * Звёзды практически на бесконечности, поэтому сфера ездит вместе с камерой:
   * никакого параллакса при перелётах между планетами быть не должно.
   */
  followCamera(cameraRenderPosition: Vector3): void {
    this.points.position.copy(cameraRenderPosition);
  }

  /**
   * Отменить для звёзд адаптацию экспозиции.
   *
   * Экспозиция растёт в десятки раз по мере удаления от Солнца — иначе внешние
   * планеты не видно. Но звёзды находятся на бесконечности: их видимая яркость
   * не зависит от того, в какой точке Солнечной системы стоит наблюдатель, и
   * умножать её на ту же экспозицию физически неверно. Без компенсации у
   * орбиты Нептуна каждая звезда уходит за порог bloom и превращается в кляксу.
   */
  compensateExposure(exposure: number): void {
    this.points.material.uniforms.uIntensity!.value = this.baseIntensity / Math.max(exposure, 1e-4);
  }

  setPixelRatio(ratio: number): void {
    this.points.material.uniforms.uPixelRatio!.value = ratio;
  }
}
