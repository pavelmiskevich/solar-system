/** Максимальный шаг кадра. Защищает от скачка после переключения вкладки. */
const MAX_DT = 1 / 15;

/**
 * Потолок длительности кадра для замера скорости, с.
 *
 * Свой, а не MAX_DT: тот ограничивает шаг модели, и замер по нему не видел
 * кадров медленнее пятнадцати в секунду, а адаптивное качество, копившее
 * секунды тем же шагом, при кадре в секунду ждало прогрева сорок пять секунд.
 * Совсем без потолка тоже нельзя: после возврата на вкладку первый кадр
 * длится столько, сколько вкладка была скрыта, и выглядел бы минутной
 * просадкой.
 */
const MAX_FRAME_SECONDS = 0.5;

/** Длительность кадра для замера скорости: настоящая, но не дольше потолка. */
export function measuredFrameSeconds(rawSeconds: number): number {
  return Math.min(Math.max(rawSeconds, 0), MAX_FRAME_SECONDS);
}

/**
 * Сглаженное время кадра после ещё одного кадра, мс.
 *
 * Постоянная подобрана так, чтобы среднее реагировало за ~0.5 с при обычной
 * частоте: достаточно быстро для реакции на просадку, достаточно медленно,
 * чтобы одиночный тяжёлый кадр не дёргал качество.
 */
export function smoothFrameTime(averageMs: number, frameSeconds: number): number {
  return averageMs + (frameSeconds * 1000 - averageMs) * 0.03;
}

/**
 * Главный цикл. Кроме вызова колбэка ведёт скользящее среднее времени кадра -
 * на нём в M7 строится адаптивное качество.
 */
export class RenderLoop {
  /** Сглаженное время кадра в миллисекундах. */
  frameTimeMs = 16.7;

  /** Сглаженные кадры в секунду. */
  get fps(): number {
    return 1000 / this.frameTimeMs;
  }

  private handle = 0;
  private last = 0;
  private running = false;

  /**
   * @param onFrame получает шаг модели (не длиннее MAX_DT), время с начала и
   * настоящую длительность кадра (не длиннее MAX_FRAME_SECONDS) - по ней
   * меряется скорость, а не движется сцена.
   */
  constructor(
    private readonly onFrame: (dt: number, elapsed: number, frameSeconds: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      this.handle = requestAnimationFrame(tick);
      const raw = (now - this.last) / 1000;
      this.last = now;

      const frameSeconds = measuredFrameSeconds(raw);
      this.frameTimeMs = smoothFrameTime(this.frameTimeMs, frameSeconds);

      this.onFrame(Math.min(raw, MAX_DT), now / 1000, frameSeconds);
    };
    this.handle = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }
}
