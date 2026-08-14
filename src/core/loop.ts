/** Максимальный шаг кадра. Защищает от скачка после переключения вкладки. */
const MAX_DT = 1 / 15;

/**
 * Главный цикл. Кроме вызова колбэка ведёт скользящее среднее времени кадра —
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

  constructor(private readonly onFrame: (dt: number, elapsed: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      this.handle = requestAnimationFrame(tick);
      const raw = (now - this.last) / 1000;
      this.last = now;

      // Постоянная сглаживания подобрана так, чтобы среднее реагировало за
      // ~0.5 с: достаточно быстро для реакции на просадку, достаточно медленно,
      // чтобы одиночный тяжёлый кадр не дёргал качество.
      this.frameTimeMs += (Math.min(raw, MAX_DT) * 1000 - this.frameTimeMs) * 0.03;

      this.onFrame(Math.min(raw, MAX_DT), now / 1000);
    };
    this.handle = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }
}
