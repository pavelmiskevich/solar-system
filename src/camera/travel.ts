import { Vector3 } from 'three';

import { framingPosition } from './framing';
import type { FlightControls } from './flight';

/**
 * Перелёт к телу.
 *
 * Свободный полёт масштабирует скорость по расстоянию до ближайшей
 * поверхности, и это правильно для осмотра, но безнадёжно для перелёта: от
 * Земли до Урана двадцать восемь миллиардов километров, и лететь их даже на
 * разгоне — минуты. Поэтому дальние перелёты сделаны отдельным движением.
 *
 * Три решения, на которых всё держится:
 *
 * 1. Расстояние до цели интерполируется в логарифме. Оно проходит пять-шесть
 *    порядков, и при линейной интерполяции почти весь перелёт выглядит как
 *    неподвижная звезда, а последняя доля секунды — как удар в планету.
 *    В логарифме тело растёт на экране равномерно всю дорогу.
 * 2. Цель пересчитывается каждый кадр. Планета за время перелёта смещается на
 *    сотни тысяч километров, и точка, вычисленная на старте, промахнётся.
 * 3. Камера всё время смотрит на цель. Это и ориентир, и единственный способ
 *    увидеть, что перелёт вообще происходит.
 */

export interface TravelTarget {
  readonly id: string;
  readonly name: string;
  /** Мировая позиция тела, км. Читается каждый кадр — тело движется. */
  readonly worldPosition: Vector3;
  /** Видимый радиус тела, км. */
  readonly radius: number;
}

/** Расстояние остановки в радиусах тела: диск занимает примерно треть кадра. */
const ARRIVAL_RADII = 3.4;

/** Границы длительности перелёта, секунды. */
const MIN_DURATION = 2.5;
const MAX_DURATION = 7;

/**
 * Длительность перелёта: база плюс полсекунды на каждый порядок сближения.
 * Прыжок к соседней луне не должен тянуться столько же, сколько бросок через
 * всю систему, но и разница не должна быть пропорциональной расстоянию —
 * иначе перелёт к Плутону занял бы минуты.
 */
export function travelDuration(startDistance: number, endDistance: number): number {
  const decades = Math.log10(Math.max(startDistance, 1) / Math.max(endDistance, 1));
  return clamp(2.2 + 0.55 * Math.max(decades, 0), MIN_DURATION, MAX_DURATION);
}

/** Плавный старт и мягкая остановка. */
export function easeInOut(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Интерполяция расстояния в логарифме: экранный размер цели растёт ровно. */
export function interpolateDistance(from: number, to: number, s: number): number {
  const a = Math.log(Math.max(from, 1e-6));
  const b = Math.log(Math.max(to, 1e-6));
  return Math.exp(a + (b - a) * clamp(s, 0, 1));
}

/**
 * Поворот направления по кратчайшей дуге.
 *
 * Обычная интерполяция векторов провисает внутрь: на противоположных
 * направлениях длина обращается в ноль, и камера на середине пути оказывается
 * внутри планеты. Поворот по дуге сохраняет длину и идёт вокруг цели.
 */
export function slerpDirection(from: Vector3, to: Vector3, t: number, out = new Vector3()): Vector3 {
  const dot = clamp(from.dot(to), -1, 1);

  // Почти сонаправленные векторы: дуга вырождается, обычная интерполяция точнее.
  if (dot > 0.9995) return out.copy(from).lerp(to, t).normalize();

  // Противоположные: дуга не определена, любая плоскость годится — берём любую
  // перпендикулярную ось, иначе результат зависел бы от ошибок округления.
  if (dot < -0.9995) {
    perpendicular.set(1, 0, 0);
    if (Math.abs(from.x) > 0.9) perpendicular.set(0, 1, 0);
    perpendicular.crossVectors(from, perpendicular).normalize();
    return out.copy(from).applyAxisAngle(perpendicular, Math.PI * clamp(t, 0, 1));
  }

  const angle = Math.acos(dot);
  const sin = Math.sin(angle);
  const a = Math.sin((1 - t) * angle) / sin;
  const b = Math.sin(t * angle) / sin;

  return out.set(
    from.x * a + to.x * b,
    from.y * a + to.y * b,
    from.z * a + to.z * b,
  ).normalize();
}

const perpendicular = new Vector3();

/**
 * Куда встать у цели: направление от её центра и расстояние, км.
 *
 * Не мировая точка: за время перелёта тело уедет по орбите на миллионы
 * километров, и точка, верная на старте, к прибытию окажется в пустоте.
 * Направление же остаётся верным всю дорогу.
 */
export interface ArrivalView {
  direction: Vector3;
  distance: number;
}

export class TravelController {
  private target: TravelTarget | null = null;

  /**
   * Заданная точка прибытия — её приносят готовые виды.
   *
   * Обычный перелёт сам ставит камеру с освещённой стороны в 3.4 радиуса:
   * для «полететь к Сатурну» это верно, а «Кольца Сатурна с ребра» так не
   * покажешь — нужен свой угол.
   */
  private arrival: ArrivalView | null = null;
  private elapsed = 0;
  private duration = 1;
  private startDistance = 1;

  private readonly startDirection = new Vector3();
  private readonly endPosition = new Vector3();
  private readonly endDirection = new Vector3();
  private readonly direction = new Vector3();
  private readonly position = new Vector3();

  get isActive(): boolean {
    return this.target !== null;
  }

  get targetId(): string | null {
    return this.target?.id ?? null;
  }

  /**
   * Насколько перелёт «разогнан», 0…1. Ноль на старте и на финише, единица в
   * середине. Этим значением раздвигается поле зрения: без него скорость в
   * пустоте не читается вообще, потому что смотреть не на что.
   */
  get intensity(): number {
    if (!this.target) return 0;
    const t = clamp(this.elapsed / this.duration, 0, 1);
    return Math.sin(t * Math.PI);
  }

  /**
   * @param cameraPosition текущее положение камеры, км
   * @param sunWorldPosition положение Солнца, км
   */
  start(
    target: TravelTarget,
    cameraPosition: Vector3,
    sunWorldPosition: Vector3,
    arrival?: ArrivalView,
  ): void {
    this.target = target;
    this.elapsed = 0;
    this.arrival = arrival
      ? { direction: arrival.direction.clone().normalize(), distance: arrival.distance }
      : null;

    this.startDirection.subVectors(cameraPosition, target.worldPosition);
    this.startDistance = this.startDirection.length();

    // Уже стоим в цели — направление подлёта неизвестно, берём любое разумное.
    if (this.startDistance < 1e-6) {
      this.startDirection.set(0, 0, 1);
      this.startDistance = target.radius * ARRIVAL_RADII;
    } else {
      this.startDirection.divideScalar(this.startDistance);
    }

    this.resolveArrival(cameraPosition, sunWorldPosition);
    this.duration = travelDuration(
      this.startDistance,
      this.endPosition.distanceTo(target.worldPosition),
    );
  }

  cancel(): void {
    this.target = null;
    this.arrival = null;
  }

  /**
   * Продвинуть перелёт. Возвращает false, когда лететь больше некуда — тогда
   * управление возвращается свободному полёту.
   */
  update(dt: number, flight: FlightControls, sunWorldPosition: Vector3): boolean {
    const target = this.target;
    if (!target) return false;

    this.elapsed += dt;
    const s = easeInOut(this.elapsed / this.duration);

    this.resolveArrival(flight.worldPosition, sunWorldPosition);

    const endDistance = this.endPosition.distanceTo(target.worldPosition);
    const distance = interpolateDistance(this.startDistance, endDistance, s);

    slerpDirection(this.startDirection, this.endDirection, s, this.direction);
    this.position.copy(target.worldPosition).addScaledVector(this.direction, distance);

    flight.placeLookingAt(this.position, target.worldPosition);

    if (this.elapsed >= this.duration) {
      this.target = null;
      return false;
    }

    return true;
  }

  /** Точка прибытия и направление на неё от цели. */
  private resolveArrival(cameraPosition: Vector3, sunWorldPosition: Vector3): void {
    const target = this.target!;
    const distance = target.radius * ARRIVAL_RADII;

    if (this.arrival) {
      this.endDirection.copy(this.arrival.direction);
      this.endPosition
        .copy(target.worldPosition)
        .addScaledVector(this.endDirection, this.arrival.distance);
      return;
    }

    if (target.worldPosition.distanceToSquared(sunWorldPosition) < 1) {
      // Само Солнце: «встать так, чтобы было освещено» для него бессмысленно,
      // поэтому подлетаем с той стороны, с которой смотрели.
      this.endDirection.subVectors(cameraPosition, target.worldPosition);
      if (this.endDirection.lengthSq() < 1e-12) this.endDirection.set(0, 0, 1);
      this.endDirection.normalize();
      this.endPosition.copy(target.worldPosition).addScaledVector(this.endDirection, distance);
      return;
    }

    framingPosition(
      target.worldPosition,
      sunWorldPosition,
      target.radius,
      { distanceInRadii: ARRIVAL_RADII },
      this.endPosition,
    );
    this.endDirection.subVectors(this.endPosition, target.worldPosition).normalize();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
