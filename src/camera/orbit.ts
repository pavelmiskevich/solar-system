import { Vector3 } from 'three';

/**
 * Орбитальный режим: камера ходит вокруг выбранного тела.
 *
 * Основное занятие в такой сцене — рассмотреть тело со всех сторон, и до сих
 * пор для этого приходилось облетать его свободным полётом, промахиваясь и
 * теряя из виду: планета мелкая, а скорость подстраивается под расстояние, так
 * что мимо неё проносишься.
 *
 * Здесь положение камеры задаётся не координатами, а тремя числами
 * относительно тела: азимут, высота над плоскостью и расстояние. Мышь меняет
 * первые два, колесо — третье; тело при этом само остаётся на месте в кадре.
 *
 * Вертикаль — нормаль к эклиптике, а не ось вращения тела. Ось была бы
 * «правильнее» физически, но у Урана она лежит на боку, и одно и то же
 * движение мыши крутило бы разные планеты в разные стороны. Постоянная
 * вертикаль предсказуема, и это тот же выбор, что сделан в свободном полёте.
 */

/** Ближе этого к поверхности не подпускаем: дальше начинается геометрия внутри тела. */
const MIN_DISTANCE_IN_RADII = 1.15;

/**
 * Дальше этого режим бессмысленен: тело становится точкой, и вращать вокруг
 * него нечего. Совпадает с порогом, на котором отпускается система отсчёта.
 */
const MAX_DISTANCE_IN_RADII = 1000;

/** Сколько радиан поворота даёт протаскивание на всю высоту кадра. */
const DRAG_TO_RADIANS = Math.PI;

/** Во сколько раз меняется расстояние за один щелчок колеса. */
const ZOOM_STEP = 1.2;

/** Постоянная сглаживания, секунды. Та же, что у взгляда в свободном полёте. */
const TAU = 0.09;

/** Предел по высоте: у полюсов направление на тело вырождается. */
const MAX_ELEVATION = Math.PI / 2 - 0.02;

const offset = new Vector3();
const flat = new Vector3();

export class OrbitControls {
  private active = false;

  private azimuth = 0;
  private elevation = 0;
  private distance = 0;

  private targetAzimuth = 0;
  private targetElevation = 0;
  private targetDistance = 0;

  get isActive(): boolean {
    return this.active;
  }

  /** Текущее расстояние до центра тела, км. */
  get radius(): number {
    return this.distance;
  }

  /**
   * Включить режим, не сдвинув камеру.
   *
   * Углы и расстояние берутся из того, где камера уже стоит. Иначе включение
   * дёргало бы кадр — а включается режим сам, по прибытии, и рывок в этот
   * момент выглядел бы поломкой.
   */
  engage(cameraPosition: Vector3, bodyPosition: Vector3): void {
    offset.subVectors(cameraPosition, bodyPosition);

    this.distance = Math.max(offset.length(), 1e-6);
    this.elevation = Math.asin(clamp(offset.y / this.distance, -1, 1));

    flat.set(offset.x, 0, offset.z);
    this.azimuth = flat.lengthSq() > 1e-12 ? Math.atan2(offset.x, offset.z) : 0;

    this.targetAzimuth = this.azimuth;
    this.targetElevation = this.elevation;
    this.targetDistance = this.distance;
    this.active = true;
  }

  release(): void {
    this.active = false;
  }

  /**
   * Протаскивание мышью.
   *
   * @param dx, dy смещение курсора в пикселях
   * @param viewportHeightPx высота кадра — от неё зависит, сколько это в углах
   */
  drag(dx: number, dy: number, viewportHeightPx: number): void {
    if (!this.active) return;

    const scale = DRAG_TO_RADIANS / Math.max(viewportHeightPx, 1);
    // Тянем вправо — тело поворачивается вправо, то есть камера идёт влево.
    // Знак выбран так, чтобы схватить и повернуть, а не «управлять камерой».
    this.targetAzimuth += dx * scale;
    this.targetElevation = clamp(
      this.targetElevation - dy * scale,
      -MAX_ELEVATION,
      MAX_ELEVATION,
    );
  }

  /** Колесо: приближение и отдаление. Знак как у прокрутки — от себя ближе. */
  zoom(deltaY: number): void {
    if (!this.active) return;
    this.targetDistance *= deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  }

  /**
   * Пересчитать положение камеры.
   *
   * @param bodyRadius видимый радиус тела — им ограничивается приближение
   * @param out куда записать мировую позицию камеры
   * @returns false, если режим сам отключился: тело слишком далеко
   */
  update(dt: number, bodyPosition: Vector3, bodyRadius: number, out: Vector3): boolean {
    if (!this.active) return false;

    const minDistance = bodyRadius * MIN_DISTANCE_IN_RADII;
    const maxDistance = bodyRadius * MAX_DISTANCE_IN_RADII;

    if (this.targetDistance > maxDistance) {
      this.active = false;
      return false;
    }

    this.targetDistance = clamp(this.targetDistance, minDistance, maxDistance);

    // Сглаживание такое же, как у взгляда в свободном полёте: мгновенная
    // реакция на мышь ощущается дёрганой, а заметная задержка — вязкой.
    const alpha = 1 - Math.exp(-dt / TAU);
    this.azimuth += shortestAngle(this.azimuth, this.targetAzimuth) * alpha;
    this.elevation += (this.targetElevation - this.elevation) * alpha;
    // Расстояние — в логарифме: оно ходит на порядки, и в линейной шкале
    // приближение вплотную шло бы неразличимо медленно после отдаления.
    this.distance = Math.exp(
      Math.log(this.distance) + (Math.log(this.targetDistance) - Math.log(this.distance)) * alpha,
    );

    const horizontal = Math.cos(this.elevation) * this.distance;
    out.set(
      bodyPosition.x + Math.sin(this.azimuth) * horizontal,
      bodyPosition.y + Math.sin(this.elevation) * this.distance,
      bodyPosition.z + Math.cos(this.azimuth) * horizontal,
    );

    return true;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Кратчайшая разница углов — чтобы азимут не разматывался через 2π. */
function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
