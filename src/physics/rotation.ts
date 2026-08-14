import { Matrix4, Quaternion, Vector3 } from 'three';

import type { RotationElements } from '../data/bodies';
import { orbitNormal, type OrbitalElements } from './kepler';
import { DEG, JD_J2000, OBLIQUITY_J2000 } from '../core/units';

/**
 * Ориентация тела по элементам вращения МАС.
 *
 * Полюс задан в экваториальных координатах ICRF (прямое восхождение и
 * склонение), а сцена живёт в эклиптических, поэтому направление полюса
 * приходится поворачивать на наклон эклиптики. Именно отсюда берутся
 * характерные наклоны: 23.4° у Земли, 26.7° у Сатурна и 98° у Урана,
 * лежащего на боку.
 */

const poleEquatorial = new Vector3();
const nodeEquatorial = new Vector3();
const poleWorld = new Vector3();
const primeMeridianWorld = new Vector3();
const thirdAxis = new Vector3();
const referenceAxis = new Vector3();
const basis = new Matrix4();

/**
 * Кватернион ориентации тела на заданный момент.
 *
 * Локальная ось +Y меша совмещается с северным полюсом, локальная +X — с
 * нулевым меридианом. Отсчёт нулевого меридиана ведётся от восходящего узла
 * экватора тела на экваторе ICRF, как это определено в отчёте МАС.
 *
 * @param out кватернион, куда записать результат
 */
export function orientationAt(
  elements: RotationElements,
  jd: number,
  out = new Quaternion(),
): Quaternion {
  const days = jd - JD_J2000;
  const alpha = elements.poleRa * DEG;
  const delta = elements.poleDec * DEG;
  const W = (elements.primeMeridian + elements.rotationRate * days) * DEG;

  // Северный полюс в экваториальных координатах.
  poleEquatorial.set(
    Math.cos(delta) * Math.cos(alpha),
    Math.cos(delta) * Math.sin(alpha),
    Math.sin(delta),
  );

  // Восходящий узел экватора тела: направление α₀ + 90° в экваториальной плоскости.
  nodeEquatorial.set(-Math.sin(alpha), Math.cos(alpha), 0);

  // Нулевой меридиан — узел, повёрнутый вокруг полюса на угол W.
  const spun = nodeEquatorial.clone().applyAxisAngle(poleEquatorial, W);

  equatorialToWorld(poleEquatorial, poleWorld).normalize();
  equatorialToWorld(spun, primeMeridianWorld).normalize();

  // Ортогонализация: после двух поворотов накапливается погрешность, а базис
  // обязан остаться ортонормированным, иначе тело будет заметно «дышать».
  primeMeridianWorld.addScaledVector(poleWorld, -primeMeridianWorld.dot(poleWorld)).normalize();
  thirdAxis.crossVectors(primeMeridianWorld, poleWorld);

  basis.makeBasis(primeMeridianWorld, poleWorld, thirdAxis);
  return out.setFromRotationMatrix(basis);
}

/**
 * Ориентация тела, запертого приливами.
 *
 * Синхронное вращение — это не «оборот за столько-то суток», а связь: тело
 * повёрнуто к своему хозяину одной и той же стороной. Поэтому ориентация
 * строится прямо из направления на хозяина, и рассинхронизироваться ей не с
 * чем. Так вращаются Луна и все крупные спутники гигантов.
 *
 * @param toHost направление на планету в координатах сцены
 * @param pole северный полюс тела в координатах сцены
 */
export function tidalOrientation(
  toHost: Vector3,
  pole: Vector3,
  out = new Quaternion(),
): Quaternion {
  // Нулевой меридиан смотрит на хозяина, но обязан лежать в плоскости
  // экватора: убираем из направления составляющую вдоль полюса.
  primeMeridianWorld.copy(toHost).normalize();
  primeMeridianWorld.addScaledVector(pole, -primeMeridianWorld.dot(pole));

  if (primeMeridianWorld.lengthSq() < 1e-12) {
    // Хозяин точно над полюсом — вырожденный случай, годится любая долгота.
    primeMeridianWorld.set(1, 0, 0).addScaledVector(pole, -pole.x);
  }

  primeMeridianWorld.normalize();
  thirdAxis.crossVectors(primeMeridianWorld, pole);

  basis.makeBasis(primeMeridianWorld, pole, thirdAxis);
  return out.setFromRotationMatrix(basis);
}

/**
 * Базис экваториальной системы тела в координатах сцены.
 *
 * Ось `pole` — северный полюс, `node` — восходящий узел экватора тела на
 * экваторе ICRF, `third` дополняет их до правой тройки. В этом базисе заданы
 * орбиты спутников: без него пришлось бы поворачивать их орбиты вручную на
 * наклон оси планеты и на положение её узла, то есть повторять ту же работу
 * второй раз и другим способом.
 */
export interface EquatorialBasis {
  node: Vector3;
  pole: Vector3;
  third: Vector3;
}

export function equatorialBasis(
  elements: RotationElements,
  out: EquatorialBasis = { node: new Vector3(), pole: new Vector3(), third: new Vector3() },
): EquatorialBasis {
  const alpha = elements.poleRa * DEG;
  const delta = elements.poleDec * DEG;

  poleEquatorial.set(
    Math.cos(delta) * Math.cos(alpha),
    Math.cos(delta) * Math.sin(alpha),
    Math.sin(delta),
  );
  nodeEquatorial.set(-Math.sin(alpha), Math.cos(alpha), 0);

  equatorialToWorld(poleEquatorial, out.pole).normalize();
  equatorialToWorld(nodeEquatorial, out.node).normalize();
  out.third.crossVectors(out.pole, out.node).normalize();

  return out;
}

/**
 * Экваториальные координаты ICRF → координаты сцены.
 *
 * Сначала поворот на наклон эклиптики, затем перестановка осей под
 * соглашение three.js (ось Y вверх): эклиптический (x, y, z) переходит в
 * (x, z, −y), что сохраняет правую тройку.
 */
function equatorialToWorld(equatorial: Vector3, out: Vector3): Vector3 {
  const cosE = Math.cos(OBLIQUITY_J2000);
  const sinE = Math.sin(OBLIQUITY_J2000);

  const xEcliptic = equatorial.x;
  const yEcliptic = equatorial.y * cosE + equatorial.z * sinE;
  const zEcliptic = -equatorial.y * sinE + equatorial.z * cosE;

  return out.set(xEcliptic, zEcliptic, -yEcliptic);
}

/**
 * Наклон оси вращения в градусах.
 *
 * Отсчитывается от нормали к плоскости орбиты тела, а не от эклиптики: именно
 * так определены справочные величины — 23.4° у Земли, 26.7° у Сатурна, 98° у
 * лежащего на боку Урана. Разница набегает на наклонение орбиты и у Сатурна
 * составляет полтора градуса, то есть больше, чем точность, с которой это
 * число вообще имеет смысл показывать.
 *
 * Без элементов орбиты (у Солнца их нет) остаётся отсчёт от эклиптики.
 */
export function axialTilt(elements: RotationElements, orbit?: OrbitalElements): number {
  const alpha = elements.poleRa * DEG;
  const delta = elements.poleDec * DEG;
  poleEquatorial.set(
    Math.cos(delta) * Math.cos(alpha),
    Math.cos(delta) * Math.sin(alpha),
    Math.sin(delta),
  );
  equatorialToWorld(poleEquatorial, poleWorld).normalize();

  // Наклон отсчитывается к оси вращения по правилу буравчика, а не к северному
  // полюсу МАС: у обратных вращателей это противоположные направления. Отсюда
  // и берутся справочные 177° у Венеры и 98° у Урана — они больше прямого угла
  // ровно потому, что тела вращаются «не в ту сторону».
  if (elements.rotationRate < 0) poleWorld.negate();

  if (!orbit) {
    // Ось Y сцены — северный полюс эклиптики.
    return Math.acos(clampUnit(poleWorld.y)) / DEG;
  }

  const normal = orbitNormal(orbit);
  // Тот же переход в координаты сцены, что и для полюса: (x, y, z) → (x, z, −y).
  referenceAxis.set(normal.x, normal.z, -normal.y).normalize();

  return Math.acos(clampUnit(poleWorld.dot(referenceAxis))) / DEG;
}

function clampUnit(value: number): number {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}
