/**
 * Жесты пальцами: протаскивание одним и щипок двумя.
 *
 * Модуль нарочно ничего не знает ни о холсте, ни о камере: ему подают
 * координаты касаний, он отдаёт смещения и отношение разведения пальцев. Так
 * состояние жеста - а его здесь больше, чем кажется: сколько пальцев, где они
 * были, исчерпан ли жест - проверяется без браузера, обычным тестом.
 *
 * Два пальца всегда значат щипок, а не протаскивание двумя. Одновременно
 * крутить и приближать невозможно: вращение от первого пальца сложилось бы с
 * расхождением пальцев, и кадр уезжал бы в сторону при каждом приближении.
 */

export interface TouchGestureHandlers {
  /**
   * Протаскивание одним пальцем.
   *
   * @param dx, dy смещение с предыдущего события, пиксели
   */
  onDrag(dx: number, dy: number): void;
  /**
   * Щипок двумя пальцами.
   *
   * @param factor во сколько раз разошлись пальцы с предыдущего события:
   *        больше единицы - развели, меньше - сдвинули
   */
  onPinch(factor: number): void;
}

interface Touch {
  x: number;
  y: number;
}

/** Путь пальца, начиная с которого касание считается жестом, пиксели. */
const GESTURE_THRESHOLD_PX = 4;

export class TouchGestures {
  /** Пальцы на экране: их порядок не важен, важно только количество. */
  private readonly touches = new Map<number, Touch>();

  /** Расстояние между пальцами на предыдущем событии, пиксели. */
  private spread = 0;

  /**
   * Жест исчерпан: щипок начался, и один палец уже подняли.
   *
   * Без этого подъём второго пальца превращал бы остаток щипка в
   * протаскивание - кадр доворачивался бы после каждого приближения.
   * Исчерпанный жест оживает только когда с экрана ушли все пальцы.
   */
  private spent = false;

  private travelled = 0;

  constructor(private readonly handlers: TouchGestureHandlers) {}

  /** Сколько палец прошёл за жест, пиксели: этим касание отличают от жеста. */
  get travel(): number {
    return this.travelled;
  }

  get isPinching(): boolean {
    return this.touches.size >= 2;
  }

  /** Сколько пальцев на экране. */
  get fingers(): number {
    return this.touches.size;
  }

  down(id: number, x: number, y: number): void {
    if (this.touches.size === 0) {
      this.travelled = 0;
      this.spent = false;
    }

    this.touches.set(id, { x, y });
    if (this.touches.size === 2) this.spread = this.currentSpread();
  }

  /**
   * Палец сдвинулся.
   *
   * @returns false, если это касание жесту не принадлежит - его начали до
   *          того, как жесты взяли управление, и разбираться с ним не здесь.
   *          Так уживаются два обработчика: свайп по остановкам экскурсии
   *          ведёт свой, и отданное ему касание не должно заодно крутить камеру.
   */
  move(id: number, x: number, y: number): boolean {
    const touch = this.touches.get(id);
    if (!touch) return false;

    const dx = x - touch.x;
    const dy = y - touch.y;
    touch.x = x;
    touch.y = y;

    this.travelled += Math.abs(dx) + Math.abs(dy);
    if (this.travelled < GESTURE_THRESHOLD_PX) return true;

    if (this.touches.size >= 2) {
      const spread = this.currentSpread();
      // Пальцы сошлись в точку - отношение обратилось бы в бесконечность.
      if (this.spread > 1 && spread > 1) this.handlers.onPinch(spread / this.spread);
      this.spread = spread;
      return true;
    }

    if (!this.spent) this.handlers.onDrag(dx, dy);
    return true;
  }

  up(id: number): void {
    // Щипок кончился подъёмом пальца - значит, он кончился весь, а не
    // превратился в протаскивание оставшимся.
    if (this.touches.size >= 2) this.spent = true;

    this.touches.delete(id);
    if (this.touches.size === 0) this.spent = false;
  }

  /** Забыть все касания: страница потеряла их, например ушла в фон. */
  reset(): void {
    this.touches.clear();
    this.spent = false;
    this.travelled = 0;
  }

  private currentSpread(): number {
    const [first, second] = Array.from(this.touches.values());
    if (!first || !second) return 0;
    return Math.hypot(second.x - first.x, second.y - first.y);
  }
}
