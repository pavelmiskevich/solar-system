import { Vector3 } from 'three';

/**
 * Система отсчёта наблюдателя.
 *
 * Сцена гелиоцентрическая, и камера по умолчанию неподвижна относительно
 * Солнца. Для осмотра планеты это никуда не годится: Уран идёт по орбите со
 * скоростью 6.8 км/с, а при масштабе времени «сутки в секунду» это почти
 * шестьсот тысяч километров за секунду реального времени. Планета, к которой
 * только что прилетел, уходит из кадра за пару секунд, и догнать её нельзя —
 * она движется быстрее любой разумной скорости полёта.
 *
 * Поэтому после прибытия камера переходит в систему отсчёта тела: каждый кадр
 * она получает то же смещение, что и тело. Свободный полёт продолжает работать
 * поверх этого — он двигает камеру относительно планеты, а не относительно
 * Солнца, что и требуется для облёта.
 */

export interface FrameTarget {
  readonly id: string;
  /** Мировая позиция тела, км. */
  readonly worldPosition: Vector3;
  /** Видимый радиус, км. */
  readonly radius: number;
}

/**
 * На каком удалении привязка отпускается сама.
 *
 * Держаться за планету, до которой тысяча её радиусов, бессмысленно: осмотр
 * давно закончился, а привязка при этом незаметно тащит камеру по орбите и
 * мешает лететь куда собирался.
 */
const RELEASE_IN_RADII = 1000;

export class ReferenceFrame {
  private target: FrameTarget | null = null;
  private readonly previous = new Vector3();
  private readonly delta = new Vector3();

  get targetId(): string | null {
    return this.target?.id ?? null;
  }

  lockTo(target: FrameTarget): void {
    this.target = target;
    this.previous.copy(target.worldPosition);
  }

  release(): void {
    this.target = null;
  }

  /**
   * Сдвинуть камеру вместе с телом. Вызывается сразу после пересчёта положений
   * тел и до всего остального: расстояния, скорость и начало координат должны
   * считаться уже в новой системе отсчёта.
   *
   * @returns true, если привязка ещё держится
   */
  apply(cameraPosition: Vector3): boolean {
    const target = this.target;
    if (!target) return false;

    this.delta.subVectors(target.worldPosition, this.previous);
    this.previous.copy(target.worldPosition);
    cameraPosition.add(this.delta);

    if (cameraPosition.distanceTo(target.worldPosition) > target.radius * RELEASE_IN_RADII) {
      this.target = null;
      return false;
    }

    return true;
  }
}
