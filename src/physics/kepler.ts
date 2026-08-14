import { DEG, JD_J2000, centuriesSinceJ2000 } from '../core/units';

/**
 * Кеплеровы элементы орбиты на эпоху J2000.0 и их вековые изменения.
 *
 * Формат соответствует таблице JPL «Keplerian Elements for Approximate
 * Positions of the Major Planets» (Standish), вариант для интервала
 * 1800–2050 гг. Углы в градусах, большая полуось в астрономических единицах,
 * скорости — за юлианское столетие.
 */
export interface OrbitalElements {
  /** Большая полуось, а.е. */
  a: number;
  /** Эксцентриситет. */
  e: number;
  /** Наклонение к эклиптике, град. */
  i: number;
  /** Средняя долгота, град. */
  L: number;
  /** Долгота перигелия ϖ = Ω + ω, град. */
  lp: number;
  /** Долгота восходящего узла Ω, град. */
  node: number;

  /** Вековые изменения тех же величин. */
  aDot: number;
  eDot: number;
  iDot: number;
  LDot: number;
  lpDot: number;
  nodeDot: number;
}

/** Гелиоцентрические эклиптические координаты в а.е. */
export interface EclipticVector {
  x: number;
  y: number;
  z: number;
}

/**
 * Решение уравнения Кеплера M = E − e·sin E методом Ньютона.
 *
 * Начальное приближение E₀ = M + e·sin M сходится за 3–4 итерации при
 * эксцентриситетах Солнечной системы (максимум 0.249 у Плутона). Ограничение
 * в 12 итераций — страховка от зацикливания, а не рабочий режим.
 */
export function solveKepler(meanAnomaly: number, e: number, tolerance = 1e-12): number {
  const M = normalizeRadians(meanAnomaly);
  let E = M + e * Math.sin(M);

  for (let iteration = 0; iteration < 12; iteration++) {
    const deltaM = M - (E - e * Math.sin(E));
    const deltaE = deltaM / (1 - e * Math.cos(E));
    E += deltaE;
    if (Math.abs(deltaE) < tolerance) break;
  }

  return E;
}

/**
 * Положение тела на кеплеровой орбите в гелиоцентрических эклиптических
 * координатах эпохи J2000.0.
 *
 * @param elements элементы орбиты и их вековые изменения
 * @param jd юлианская дата
 */
export function positionAt(elements: OrbitalElements, jd: number): EclipticVector {
  const T = centuriesSinceJ2000(jd);

  // 1. Элементы на нужный момент.
  const a = elements.a + elements.aDot * T;
  const e = elements.e + elements.eDot * T;
  const i = (elements.i + elements.iDot * T) * DEG;
  const L = (elements.L + elements.LDot * T) * DEG;
  const lp = (elements.lp + elements.lpDot * T) * DEG;
  const node = (elements.node + elements.nodeDot * T) * DEG;

  // 2. Аргумент перигелия и средняя аномалия.
  const argPeri = lp - node;
  const M = normalizeRadians(L - lp);

  // 3. Эксцентрическая аномалия.
  const E = solveKepler(M, e);

  // 4. Координаты в плоскости орбиты: перицентр по оси x.
  const xOrbital = a * (Math.cos(E) - e);
  const yOrbital = a * Math.sqrt(1 - e * e) * Math.sin(E);

  // 5. Поворот в плоскость эклиптики: ω, затем i, затем Ω.
  const cosArg = Math.cos(argPeri);
  const sinArg = Math.sin(argPeri);
  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  const cosInc = Math.cos(i);
  const sinInc = Math.sin(i);

  return {
    x:
      (cosArg * cosNode - sinArg * sinNode * cosInc) * xOrbital +
      (-sinArg * cosNode - cosArg * sinNode * cosInc) * yOrbital,
    y:
      (cosArg * sinNode + sinArg * cosNode * cosInc) * xOrbital +
      (-sinArg * sinNode + cosArg * cosNode * cosInc) * yOrbital,
    z: sinArg * sinInc * xOrbital + cosArg * sinInc * yOrbital,
  };
}

/**
 * Точки орбиты для отрисовки линии. Обходит эксцентрическую аномалию
 * равномерно, а не время: у эллиптичных орбит это даёт равномерную по длине
 * дуги линию вместо сгущения точек в афелии.
 */
export function sampleOrbit(
  elements: OrbitalElements,
  jd: number,
  segments = 512,
): EclipticVector[] {
  const T = centuriesSinceJ2000(jd);

  const a = elements.a + elements.aDot * T;
  const e = elements.e + elements.eDot * T;
  const i = (elements.i + elements.iDot * T) * DEG;
  const lp = (elements.lp + elements.lpDot * T) * DEG;
  const node = (elements.node + elements.nodeDot * T) * DEG;
  const argPeri = lp - node;

  const cosArg = Math.cos(argPeri);
  const sinArg = Math.sin(argPeri);
  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  const cosInc = Math.cos(i);
  const sinInc = Math.sin(i);

  const points: EclipticVector[] = [];
  for (let s = 0; s <= segments; s++) {
    const E = (s / segments) * Math.PI * 2;
    const xOrbital = a * (Math.cos(E) - e);
    const yOrbital = a * Math.sqrt(1 - e * e) * Math.sin(E);

    points.push({
      x:
        (cosArg * cosNode - sinArg * sinNode * cosInc) * xOrbital +
        (-sinArg * cosNode - cosArg * sinNode * cosInc) * yOrbital,
      y:
        (cosArg * sinNode + sinArg * cosNode * cosInc) * xOrbital +
        (-sinArg * sinNode + cosArg * cosNode * cosInc) * yOrbital,
      z: sinArg * sinInc * xOrbital + cosArg * sinInc * yOrbital,
    });
  }

  return points;
}

/** Орбитальный период в сутках — из скорости изменения средней долготы. */
export function orbitalPeriodDays(elements: OrbitalElements): number {
  return (360 / elements.LDot) * 36525;
}

/** Привести угол к диапазону (−π, π]. */
export function normalizeRadians(angle: number): number {
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a > Math.PI) a -= twoPi;
  if (a <= -Math.PI) a += twoPi;
  return a;
}

/**
 * Нормаль к плоскости орбиты в эклиптических координатах, единичный вектор.
 *
 * Наклон оси вращения принято отсчитывать не от эклиптики, а от плоскости
 * орбиты самого тела: справочные 26.7° у Сатурна — это угол именно к ней.
 * Разница набегает на наклонение орбиты, у Сатурна это полтора градуса.
 */
export function orbitNormal(elements: OrbitalElements, jd = JD_J2000): EclipticVector {
  const t = centuriesSinceJ2000(jd);
  const i = (elements.i + elements.iDot * t) * DEG;
  const node = (elements.node + elements.nodeDot * t) * DEG;

  return {
    x: Math.sin(i) * Math.sin(node),
    y: -Math.sin(i) * Math.cos(node),
    z: Math.cos(i),
  };
}
