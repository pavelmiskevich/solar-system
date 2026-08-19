import {
  FloatType,
  RGBAFormat,
  WebGLRenderTarget,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';

/**
 * Измерение яркости кадра.
 *
 * Экспозиция по расстоянию до Солнца знает, сколько света в этой точке
 * системы, но не знает, куда направлена камера. Разница между этими двумя
 * вопросами — вся ночная сторона: стоя у тёмного полушария Луны, наблюдатель
 * находится в одной астрономической единице от Солнца, а видит перед собой
 * почти черноту. Глаз в такой ситуации раскрывает зрачок, а расстояние до
 * Солнца при этом не меняется.
 *
 * Поэтому кадр измеряется: сцена рисуется в крошечный буфер, пиксели читаются
 * обратно и по ним берётся типичная яркость того, на что смотрят.
 *
 * Считать её надо не по всему кадру, а по пикселям, где вообще что-то есть.
 * В космосе пустота занимает почти весь кадр, и любой процентиль по всем
 * пикселям — это яркость пустоты, то есть ноль: экспозиция от такой метрики
 * разгоняется до предела на любом виде, что и произошло при первой попытке.
 * По занятым же пикселям медиана отвечает ровно на нужный вопрос: насколько
 * светло то, что перед нами. У ночной стороны Луны это пепельный свет, у
 * освещённой планеты — её диск, у тонкого серпа — сам серп.
 *
 * Небо и точки-билборды из измерения исключены: их яркость и так не зависит
 * от экспозиции (они её компенсируют), а на крошечном буфере точки занимают
 * заметную долю кадра и перетянули бы измерение на себя.
 */

/** Сторона буфера измерения. Тысяча пикселей — достаточно для процентиля. */
const SIZE = 32;

/**
 * Процентиль занятых пикселей.
 *
 * Высокий намеренно: экспозиция должна подстраиваться под самое светлое из
 * того, что в кадре есть по существу. Если в кадре ночная сторона Луны и
 * тонкий освещённый серп, глаз приспосабливается к серпу, а не к пепельному
 * свету, — и пепельный свет становится виден, только когда серп уходит за
 * край. Медиана вместо процентиля давала обратное: экспозиция раскрывалась на
 * пепельный свет, а серп выжигал вместе с собой половину кадра.
 *
 * Не максимум: одинокий блик на океане или пиксель солнечного диска не должен
 * решать за весь кадр.
 */
const PERCENTILE = 0.98;

/** Пиксель считается занятым, если в нём есть хоть что-то ярче этого. */
const OCCUPIED = 1e-9;

/**
 * Какую долю кадра должно занимать тело, чтобы по нему мерили.
 *
 * Меньше — это далёкая точка в пустоте: подстраивать под неё экспозицию
 * бессмысленно, она всё равно нарисована билбордом с собственной яркостью.
 */
const MIN_COVERAGE = 0.02;

/** Как часто мерить, секунды. Чтение из видеопамяти синхронное и не бесплатное. */
const INTERVAL = 0.1;

export class SceneLuminance {
  private readonly target = new WebGLRenderTarget(SIZE, SIZE, {
    type: FloatType,
    format: RGBAFormat,
    depthBuffer: true,
  });

  private readonly pixels = new Float32Array(SIZE * SIZE * 4);
  private readonly samples = new Float32Array(SIZE * SIZE);

  private age = INTERVAL;
  private value = 0;

  /** Последнее измерение: яркость кадра до применения экспозиции. */
  get luminance(): number {
    return this.value;
  }

  /**
   * @param exclude слои, которые не должны попадать в измерение
   * @returns яркость кадра или null, если в этот раз не мерили
   */
  measure(
    dt: number,
    renderer: WebGLRenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    exclude: readonly Object3D[],
  ): number | null {
    this.age += dt;
    if (this.age < INTERVAL) return null;
    this.age = 0;

    const hidden = exclude.filter((object) => object.visible);
    for (const object of hidden) object.visible = false;

    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, this.pixels);
    renderer.setRenderTarget(previousTarget);

    for (const object of hidden) object.visible = true;

    let occupied = 0;
    for (let i = 0; i < this.samples.length; i += 1) {
      const offset = i * 4;
      // Стандартные веса яркости: глаз чувствительнее всего к зелёному.
      const luminance =
        0.2126 * this.pixels[offset]! +
        0.7152 * this.pixels[offset + 1]! +
        0.0722 * this.pixels[offset + 2]!;

      if (luminance > OCCUPIED) this.samples[occupied++] = luminance;
    }

    if (occupied < this.samples.length * MIN_COVERAGE) {
      this.value = 0;
      return null;
    }

    this.value = percentile(this.samples.subarray(0, occupied), PERCENTILE);
    return this.value;
  }

  dispose(): void {
    this.target.dispose();
  }
}

/** Процентиль набора значений. Сортировка тысячи чисел десять раз в секунду. */
export function percentile(values: Float32Array, fraction: number): number {
  values.sort();
  const index = Math.min(values.length - 1, Math.floor(fraction * values.length));
  return values[index] ?? 0;
}
