/**
 * Адаптивное качество.
 *
 * Сцена честно рисует шум по восемь октав на пиксель, клеточный шум кратеров
 * и полноэкранный bloom - на слабой видеокарте этого хватает, чтобы уронить
 * кадры вдвое. Ронять при этом надо не физику и не масштабы, а картинку:
 * первым уходит сглаживание (его потерю видно разве что на краю дисков, а
 * стоит оно четыре сэмпла на каждый пиксель сцены), следом bloom (он стоит
 * четверти кадра и заметен только у Солнца), последним - разрешение
 * композитора.
 *
 * Переключение с гистерезисом и по времени, а не по мгновенному fps: один
 * тяжёлый кадр на подлёте к Луне не повод выключать свечение, а мигание
 * качества туда-сюда раздражает сильнее, чем низкий, но ровный кадр.
 *
 * Возврат качества упирается в развёртку экрана: браузер не рисует чаще неё,
 * и на мониторе 60 Гц кадров больше шестидесяти не бывает, сколько бы запаса
 * ни было у видеокарты. Поэтому порог возврата ставится от наблюдаемого
 * потолка, а не числом. У потолка запас не виден, и возврат там - проба:
 * если более высокая ступень не тянет и качество снова падает, следующая
 * проба на неё ждёт вчетверо дольше.
 */

export interface QualityLevel {
  /** Сглаживание в буфере композитора (см. msaaSamples в renderer.ts). */
  msaa: boolean;
  bloom: boolean;
  /** Множитель внутреннего разрешения композитора. */
  resolutionScale: number;
}

export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { msaa: true, bloom: true, resolutionScale: 1 },
  { msaa: false, bloom: true, resolutionScale: 1 },
  { msaa: false, bloom: false, resolutionScale: 1 },
  { msaa: false, bloom: false, resolutionScale: 0.75 },
];

/** Ниже этого - качество понижается. */
const DOWNGRADE_FPS = 45;

/**
 * Выше этого качество возвращается всегда: на экранах 90 Гц и чаще такие
 * кадры значат настоящий запас.
 */
const UPGRADE_FPS = 75;

/**
 * Ближе этой доли к потолку развёртки кадры считаются упёршимися в него, и
 * качество тоже возвращается: на 60 Гц порог выходит 57 кадров.
 */
const CEILING_SHARE = 0.95;

/**
 * Ниже этого не возвращается никогда, каким бы низким ни был потолок: иначе
 * сцена, которая на программном рендерере не набирает и двадцати кадров,
 * считала бы свои двадцать запасом.
 */
const MIN_UPGRADE_FPS = 55;

/** Сколько секунд подряд должно держаться условие. */
const DOWNGRADE_SECONDS = 2;
const UPGRADE_SECONDS = 6;

/**
 * Если качество упало раньше, чем через столько секунд после возврата,
 * возврат был неудачной пробой.
 */
const PROBE_SECONDS = 20;

/** Во сколько раз дольше ждёт каждая следующая проба после неудачной. */
const PROBE_BACKOFF = 4;

/**
 * Первые секунды после запуска не считаются: пока компилируются шейдеры и
 * прогреваются буферы, кадры проседают у кого угодно, и решать по ним нельзя.
 */
const WARMUP_SECONDS = 3;

/** Порог возврата при наблюдаемом потолке частоты кадров. */
export function upgradeFps(ceiling: number): number {
  return Math.min(UPGRADE_FPS, Math.max(MIN_UPGRADE_FPS, ceiling * CEILING_SHARE));
}

export class AdaptiveQuality {
  private index: number;
  private readonly top: number;
  private lowSeconds = 0;
  private highSeconds = 0;
  private warmup = WARMUP_SECONDS;
  /** Самая высокая сглаженная частота после прогрева - потолок развёртки. */
  private ceiling = 0;
  /** Неудачные пробы по ступеням: сколько раз возврат на неё не удержался. */
  private readonly failedProbes = QUALITY_LEVELS.map(() => 0);
  /** Секунды с последнего возврата, пока он ещё считается пробой. */
  private sinceUpgrade: number | null = null;

  /**
   * @param topIndex верхняя доступная ступень, с неё и начинается работа. Не
   * нулевая - когда заранее известно, что выше не по силам (см.
   * softwareRendered в renderer.ts): спускаться оттуда пришлось бы через
   * секунды почти стоящей сцены, а пробы возврата повторяли бы их снова.
   */
  constructor(topIndex = 0) {
    this.top = Math.min(Math.max(Math.round(topIndex), 0), QUALITY_LEVELS.length - 1);
    this.index = this.top;
  }

  get level(): QualityLevel {
    return QUALITY_LEVELS[this.index]!;
  }

  get levelIndex(): number {
    return this.index;
  }

  /**
   * @param dt длительность кадра, с
   * @param fps сглаженная частота кадров
   * @returns true, если уровень качества изменился
   */
  update(dt: number, fps: number): boolean {
    if (this.warmup > 0) {
      this.warmup -= dt;
      return false;
    }

    this.ceiling = Math.max(this.ceiling, fps);

    if (this.sinceUpgrade !== null) {
      this.sinceUpgrade += dt;
      // Возврат, продержавшийся дольше пробы, удачен: эту ступень снова можно
      // пробовать без долгого ожидания.
      if (this.sinceUpgrade >= PROBE_SECONDS) {
        this.failedProbes[this.index] = 0;
        this.sinceUpgrade = null;
      }
    }

    if (fps < DOWNGRADE_FPS) {
      this.lowSeconds += dt;
      this.highSeconds = 0;
    } else if (fps > upgradeFps(this.ceiling)) {
      this.highSeconds += dt;
      this.lowSeconds = 0;
    } else {
      // Между порогами - ничего не копим: это рабочий режим.
      this.lowSeconds = 0;
      this.highSeconds = 0;
    }

    if (this.lowSeconds >= DOWNGRADE_SECONDS && this.index < QUALITY_LEVELS.length - 1) {
      if (this.sinceUpgrade !== null) this.failedProbes[this.index]! += 1;
      this.sinceUpgrade = null;
      this.index += 1;
      this.lowSeconds = 0;
      return true;
    }

    if (this.index > this.top) {
      const wait = UPGRADE_SECONDS * PROBE_BACKOFF ** this.failedProbes[this.index - 1]!;
      if (this.highSeconds >= wait) {
        this.index -= 1;
        this.highSeconds = 0;
        this.sinceUpgrade = 0;
        return true;
      }
    }

    return false;
  }
}
