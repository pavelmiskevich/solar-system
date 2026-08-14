/**
 * Адаптивное качество.
 *
 * Сцена честно рисует шум по восемь октав на пиксель, клеточный шум кратеров
 * и полноэкранный bloom — на слабой видеокарте этого хватает, чтобы уронить
 * кадры вдвое. Ронять при этом надо не физику и не масштабы, а картинку:
 * первым уходит bloom (он стоит четверти кадра и заметен только у Солнца),
 * следом — разрешение композитора.
 *
 * Переключение с гистерезисом и по времени, а не по мгновенному fps: один
 * тяжёлый кадр на подлёте к Луне не повод выключать свечение, а мигание
 * качества туда-сюда раздражает сильнее, чем низкий, но ровный кадр.
 */

export interface QualityLevel {
  bloom: boolean;
  /** Множитель внутреннего разрешения композитора. */
  resolutionScale: number;
}

export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { bloom: true, resolutionScale: 1 },
  { bloom: false, resolutionScale: 1 },
  { bloom: false, resolutionScale: 0.75 },
];

/** Ниже этого — качество понижается. Выше верхнего — возвращается. */
const DOWNGRADE_FPS = 45;
const UPGRADE_FPS = 75;

/** Сколько секунд подряд должно держаться условие. */
const DOWNGRADE_SECONDS = 2;
const UPGRADE_SECONDS = 6;

/**
 * Первые секунды после запуска не считаются: пока компилируются шейдеры и
 * прогреваются буферы, кадры проседают у кого угодно, и решать по ним нельзя.
 */
const WARMUP_SECONDS = 3;

export class AdaptiveQuality {
  private index = 0;
  private lowSeconds = 0;
  private highSeconds = 0;
  private warmup = WARMUP_SECONDS;

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

    if (fps < DOWNGRADE_FPS) {
      this.lowSeconds += dt;
      this.highSeconds = 0;
    } else if (fps > UPGRADE_FPS) {
      this.highSeconds += dt;
      this.lowSeconds = 0;
    } else {
      // Между порогами — ничего не копим: это рабочий режим.
      this.lowSeconds = 0;
      this.highSeconds = 0;
    }

    if (this.lowSeconds >= DOWNGRADE_SECONDS && this.index < QUALITY_LEVELS.length - 1) {
      this.index += 1;
      this.lowSeconds = 0;
      return true;
    }

    if (this.highSeconds >= UPGRADE_SECONDS && this.index > 0) {
      this.index -= 1;
      this.highSeconds = 0;
      return true;
    }

    return false;
  }
}
