import { Euler, Quaternion, Vector3 } from 'three';

/** Время затухания скорости. Даёт инерцию без ощущения ватности. */
const VELOCITY_TAU = 0.35;

/** Время сглаживания взгляда. Достаточно мало, чтобы мышь не казалась вязкой. */
const LOOK_TAU = 0.045;

/** Время подстройки крейсерской скорости под расстояние до ближайшей поверхности. */
const SPEED_TAU = 0.4;

/**
 * Крейсерская скорость как функция расстояния до ближайшей поверхности:
 * `speed = SPEED_FACTOR * d^SPEED_EXPONENT`, км/с.
 *
 * Показатель намеренно больше единицы. При линейной зависимости одна и та же
 * константа не может обслужить оба режима: если сделать облёт поверхности
 * приятным, до соседней орбиты лететь полчаса, а если сделать перелёт быстрым,
 * базовая скорость на орбите Земли оказывается около сотни световых, и вся
 * внутренняя система пролетает быстрее, чем успеваешь посмотреть.
 *
 * Коэффициенты подобраны по двум опорным точкам:
 *   1000 км над поверхностью  →  ~24 км/с  (облёт планеты за десятки секунд)
 *   1 а.е. от Солнца          →  ~7e7 км/с (пересечь за пару секунд)
 *
 * Точная подстройка под задачу — колесом мыши: множитель ходит от 1/50 до 40,
 * и медленный осмотр поверхности никуда не делся, он просто не по умолчанию.
 *
 * Дальние перелёты — всё равно не задача свободного полёта: для них есть варп.
 */
const SPEED_FACTOR = 4.24e-3;
const SPEED_EXPONENT = 1.25;

/** Границы крейсерской скорости, км/с. */
const MIN_SPEED = 0.4;
const MAX_SPEED = 5e8;

/** Ускорение по Shift. Десятикратное — поверх и без того быстрого крейсера. */
const BOOST = 10;

/**
 * Свободный полёт с шестью степенями свободы, но с фиксированной вертикалью:
 * рыскание вокруг нормали к эклиптике, тангаж с ограничением ±89°. Полный
 * 6DOF с креном красивее в трейлере и невыносим в реальном использовании —
 * в пустоте без ориентиров теряешься за десять секунд.
 */
export class FlightControls {
  readonly worldPosition = new Vector3();
  readonly quaternion = new Quaternion();
  readonly velocity = new Vector3();

  /** Ручной множитель скорости — колесо мыши. */
  speedMultiplier = 1;

  enabled = true;

  private yaw = 0;
  private pitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;
  private cruiseSpeed = MIN_SPEED;
  private snapCruiseSpeed = true;
  private locked = false;

  private readonly keys = new Set<string>();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly desired = new Vector3();

  constructor(
    private readonly domElement: HTMLElement,
    /** Нормаль к эклиптике — «верх» для рыскания. */
    private readonly up = new Vector3(0, 1, 0),
  ) {
    this.attach();
  }

  get speed(): number {
    return this.velocity.length();
  }

  get isLocked(): boolean {
    return this.locked;
  }

  /** Поставить камеру в точку и направить её на цель. */
  placeLookingAt(position: Vector3, target: Vector3): void {
    this.worldPosition.copy(position);
    this.velocity.set(0, 0, 0);
    this.snapCruiseSpeed = true;

    const dir = new Vector3().subVectors(target, position).normalize();
    this.targetPitch = Math.asin(clamp(dir.dot(this.up), -1, 1));
    // Рыскание считаем в плоскости, перпендикулярной вертикали.
    const flat = new Vector3().copy(dir).addScaledVector(this.up, -dir.dot(this.up));
    this.targetYaw = flat.lengthSq() > 1e-12 ? Math.atan2(-flat.x, -flat.z) : this.targetYaw;
    this.yaw = this.targetYaw;
    this.pitch = this.targetPitch;
    this.applyOrientation();
  }

  /**
   * @param dt шаг кадра в секундах
   * @param distanceToNearestSurface расстояние до ближайшей поверхности, км —
   *        именно оно задаёт масштаб скорости
   */
  update(dt: number, distanceToNearestSurface: number): void {
    if (!this.enabled) return;

    // Взгляд: экспоненциальное сглаживание к целевым углам.
    const lookAlpha = 1 - Math.exp(-dt / LOOK_TAU);
    this.yaw += shortestAngle(this.yaw, this.targetYaw) * lookAlpha;
    this.pitch += (this.targetPitch - this.pitch) * lookAlpha;
    this.applyOrientation();

    // Крейсерская скорость следует за расстоянием до ближайшей поверхности.
    const targetCruise = clamp(
      SPEED_FACTOR * Math.pow(Math.max(distanceToNearestSurface, 0), SPEED_EXPONENT),
      MIN_SPEED,
      MAX_SPEED,
    );

    // Сглаживание в логарифмическом пространстве. Скорость здесь пробегает
    // десять порядков, и линейное сглаживание ведёт себя несимметрично:
    // разгон мгновенный, а торможение растягивается на секунды — после подлёта
    // к планете камера ещё долго несётся со скоростью межпланетного перелёта.
    // В логарифме время перехода одинаково, на сколько бы порядков ни менялась
    // цель, и подлёт всегда занимает одно и то же время.
    if (this.snapCruiseSpeed) {
      // После телепорта сглаживать нечего: старая скорость относилась к другой
      // точке системы и никакого отношения к новой не имеет.
      this.cruiseSpeed = targetCruise;
      this.snapCruiseSpeed = false;
    } else {
      const speedAlpha = 1 - Math.exp(-dt / SPEED_TAU);
      this.cruiseSpeed = Math.exp(
        Math.log(this.cruiseSpeed) +
          (Math.log(targetCruise) - Math.log(this.cruiseSpeed)) * speedAlpha,
      );
    }

    // Направление из ввода: вперёд/вбок в системе камеры, вверх/вниз — мировой.
    this.forward.set(0, 0, -1).applyQuaternion(this.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion);
    this.desired.set(0, 0, 0);

    if (this.keys.has('KeyW')) this.desired.add(this.forward);
    if (this.keys.has('KeyS')) this.desired.sub(this.forward);
    if (this.keys.has('KeyD')) this.desired.add(this.right);
    if (this.keys.has('KeyA')) this.desired.sub(this.right);
    if (this.keys.has('Space')) this.desired.add(this.up);
    if (this.keys.has('ControlLeft') || this.keys.has('KeyC')) this.desired.sub(this.up);

    const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? BOOST : 1;
    if (this.desired.lengthSq() > 0) {
      this.desired.normalize().multiplyScalar(this.cruiseSpeed * boost * this.speedMultiplier);
    }

    // Инерция: скорость экспоненциально тянется к желаемой. Останов такой же
    // плавный, как разгон — резких стартов и стопов нет ни в одну сторону.
    const velAlpha = 1 - Math.exp(-dt / VELOCITY_TAU);
    this.velocity.lerp(this.desired, velAlpha);
    this.worldPosition.addScaledVector(this.velocity, dt);
  }

  private applyOrientation(): void {
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.quaternion.setFromEuler(this.euler);
  }

  /**
   * Запросить захват мыши. Вызывается снаружи, а не по клику внутри: клик по
   * телу должен уводить в перелёт, а не в режим осмотра, и решать, что именно
   * произошло, полёту неоткуда — он не знает, где какое тело.
   */
  requestLook(): void {
    if (!this.locked) void this.domElement.requestPointerLock();
  }

  private attach(): void {
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.domElement.addEventListener('wheel', this.onWheel, { passive: true });
  }

  dispose(): void {
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.domElement.removeEventListener('wheel', this.onWheel);
  }

  private readonly onPointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.domElement;
    if (!this.locked) this.keys.clear();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.locked || !this.enabled) return;
    const sensitivity = 0.0022;
    this.targetYaw -= e.movementX * sensitivity;
    this.targetPitch -= e.movementY * sensitivity;
    this.targetPitch = clamp(this.targetPitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement) return;
    this.keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    const step = Math.exp(-Math.sign(e.deltaY) * -0.15);
    this.speedMultiplier = clamp(this.speedMultiplier * step, 0.02, 40);
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Кратчайшая разница углов — чтобы рыскание не разматывалось через 2π. */
function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
