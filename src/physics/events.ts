import { AU, DEG, OBLIQUITY_J2000, RAD, SUN_RADIUS } from '../core/units';
import { MOON, MOON_MASS_FRACTION, SUN, bodyById } from '../data/bodies';
import type { RotationElements } from '../data/bodies';
import type { EclipticVector } from './kepler';
import { positionAt } from './kepler';
import { moonPositionAt } from './moon';

/**
 * Поиск астрономических событий по времени.
 *
 * Даты здесь не заданы таблицей и не подобраны руками: положения тел уже
 * считаются точно, а событие - это всего лишь момент, когда некоторая величина
 * достигает предела. Затмение - когда ось тени проходит ближе всего к центру
 * тела; противостояние - когда планета дальше всего от Солнца по небу;
 * пересечение плоскости колец - когда высота наблюдателя над ней меняет знак.
 *
 * Отсюда общий приём: свести событие к скалярной функции времени и найти у неё
 * либо минимум, либо ноль. Всё остальное в этом файле - шесть таких функций и
 * два способа их уточнить.
 *
 * Точность ограничена не поиском, а моделью: элементы JPL дают положения планет
 * с ошибкой в считанные угловые минуты, и в датах это оборачивается минутами.
 * Уточнять момент тоньше часа поэтому незачем - см. REFINE_DAYS.
 */

/** Точность уточнения, сут. Час: тоньше модель всё равно не знает. */
const REFINE_DAYS = 1 / 24;

/** Экваториальный радиус Земли, км: по нему решается, попала ли тень. */
const EARTH_RADIUS = 6378.137;

/** Что за событие. */
export type EventKind =
  | 'solar-eclipse'
  | 'lunar-eclipse'
  | 'opposition'
  | 'conjunction'
  | 'transit'
  | 'ring-plane-crossing'
  | 'ring-opening'
  | 'planet-parade';

/**
 * Насколько глубоко зашло затмение.
 *
 * У солнечного «полное» и «кольцеобразное» - не степени одного и того же, а
 * разные исходы: Луна на эллиптической орбите то крупнее солнечного диска, то
 * мельче. У лунного полутеневое затмение глазом почти не отличить от полной
 * Луны, и назвать его просто «затмением» значило бы обмануть.
 */
export type EclipsePhase = 'total' | 'annular' | 'partial' | 'penumbral';

export interface AstronomicalEvent {
  kind: EventKind;
  /** Момент наибольшей фазы события, юлианская дата. */
  jd: number;
  /** Тела-участники: у затмения - заслоняющее и затмеваемое. */
  bodies: string[];
  /** Только у затмений. */
  phase?: EclipsePhase;
  /**
   * Мера события в единицах, своих для каждого рода: угловое расстояние в
   * градусах у сближений, доля радиуса Земли у затмений, градусы раскрытия у
   * колец. Она же отличает полное затмение от частного и великое
   * противостояние от рядового.
   */
  value: number;
}

/* ── Векторы ──────────────────────────────────────────────────────────────── */

type Vec = EclipticVector;

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: Vec): number => Math.sqrt(dot(a, a));

/** Угол между направлениями, град. */
function angle(a: Vec, b: Vec): number {
  const denominator = length(a) * length(b);
  if (denominator === 0) return 0;
  return Math.acos(Math.min(1, Math.max(-1, dot(a, b) / denominator))) * RAD;
}

/**
 * Гелиоцентрическое положение тела в эклиптических координатах J2000, км.
 *
 * Земля и Луна считаются так же, как в сцене: кеплеровы элементы описывают
 * барицентр системы, а Земля смещена от него примерно на 4700 км. Пренебречь
 * этим нельзя - от той же «качки» зависит, куда именно ляжет лунная тень.
 */
export function heliocentric(id: string, jd: number): Vec {
  if (id === SUN.id) return { x: 0, y: 0, z: 0 };

  const earthOrbit = bodyById('earth')?.orbit;

  if (id === 'earth' || id === MOON.id) {
    if (!earthOrbit) return { x: 0, y: 0, z: 0 };
    const barycentre = scaled(positionAt(earthOrbit, jd), AU);
    const toMoon = moonPositionAt(jd);
    const earth = {
      x: barycentre.x - toMoon.x * MOON_MASS_FRACTION,
      y: barycentre.y - toMoon.y * MOON_MASS_FRACTION,
      z: barycentre.z - toMoon.z * MOON_MASS_FRACTION,
    };
    return id === 'earth' ? earth : { x: earth.x + toMoon.x, y: earth.y + toMoon.y, z: earth.z + toMoon.z };
  }

  const orbit = bodyById(id)?.orbit;
  if (!orbit) return { x: 0, y: 0, z: 0 };
  return scaled(positionAt(orbit, jd), AU);
}

function scaled(v: Vec, k: number): Vec {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

/** Положение тела относительно Земли, км. */
function geocentric(id: string, jd: number): Vec {
  return sub(heliocentric(id, jd), heliocentric('earth', jd));
}

/* ── Поиск ────────────────────────────────────────────────────────────────── */

/**
 * Моменты минимумов функции на отрезке.
 *
 * Сначала грубый перебор с шагом step: минимум виден по тройке соседних узлов,
 * где средний ниже обоих краёв. Затем тройка ужимается золотым сечением до
 * REFINE_DAYS.
 *
 * Шаг обязан быть меньше половины времени, за которое величина успевает
 * опуститься и подняться: при большем шаге минимум проскочит между узлами и
 * событие потеряется целиком. Это единственное место, где ошибка в параметре
 * не даёт неверного ответа, а даёт молчание, - потому шаги подобраны с запасом.
 */
export function findMinima(
  f: (jd: number) => number,
  from: number,
  to: number,
  step: number,
): number[] {
  const found: number[] = [];
  let left = f(from);
  let middle = f(from + step);

  for (let jd = from + step; jd + step <= to; jd += step) {
    const right = f(jd + step);
    if (middle < left && middle <= right) found.push(refineMinimum(f, jd - step, jd + step));
    left = middle;
    middle = right;
  }

  return found;
}

/** Золотое сечение: отрезок ужимается до REFINE_DAYS вокруг минимума. */
function refineMinimum(f: (jd: number) => number, from: number, to: number): number {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = from;
  let b = to;
  let c = b - (b - a) * ratio;
  let d = a + (b - a) * ratio;
  let fc = f(c);
  let fd = f(d);

  while (b - a > REFINE_DAYS) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - (b - a) * ratio;
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + (b - a) * ratio;
      fd = f(d);
    }
  }

  return (a + b) / 2;
}

/**
 * Моменты, где функция меняет знак. Дихотомия: половина отрезка, в которой
 * знаки на концах разные, содержит ноль - и так до REFINE_DAYS.
 */
export function findRoots(
  f: (jd: number) => number,
  from: number,
  to: number,
  step: number,
): number[] {
  const found: number[] = [];
  let previous = f(from);

  for (let jd = from + step; jd <= to; jd += step) {
    const current = f(jd);
    if (previous !== 0 && current !== 0 && Math.sign(previous) !== Math.sign(current)) {
      found.push(bisect(f, jd - step, jd, previous));
    }
    previous = current;
  }

  return found;
}

function bisect(f: (jd: number) => number, from: number, to: number, fromValue: number): number {
  let a = from;
  let b = to;
  let fa = fromValue;

  while (b - a > REFINE_DAYS) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m;
      fa = fm;
    } else {
      b = m;
    }
  }

  return (a + b) / 2;
}

/* ── Затмения ─────────────────────────────────────────────────────────────── */

/**
 * Расстояние от центра тела до оси тени, км.
 *
 * Ось - прямая от Солнца через заслоняющее тело. Наименьшее её расстояние до
 * центра цели и есть мера затмения: меньше радиуса цели - тень попала в неё,
 * и где-то на поверхности Солнце закрыто целиком.
 */
function shadowAxisDistance(caster: string, target: string, jd: number): number {
  const casterPosition = heliocentric(caster, jd);
  const targetPosition = heliocentric(target, jd);

  const axis = casterPosition;
  const axisLength = length(axis);
  if (axisLength === 0) return Infinity;

  const direction = scaled(axis, 1 / axisLength);
  const offset = sub(targetPosition, casterPosition);
  const along = dot(offset, direction);

  // Цель перед заслоняющим телом, а не за ним: тени на ней быть не может.
  if (along <= 0) return Infinity;

  const perpendicular = sub(offset, scaled(direction, along));
  return length(perpendicular);
}

/**
 * Радиусы тени и полутени заслоняющего тела на расстоянии цели, км.
 *
 * Тень - конус, сходящийся за телом: его сечение сужается тем быстрее, чем
 * Солнце больше. Полутень - конус расходящийся: там Солнце закрыто лишь
 * частью. Оба радиуса нужны, чтобы отличить полное затмение от частного, не
 * подставляя порог наугад.
 *
 * @param along расстояние вдоль оси от заслоняющего тела до цели, км
 * @param sunDistance расстояние от Солнца до заслоняющего тела, км
 * @param casterRadius радиус заслоняющего тела, км
 */
function shadowRadii(
  along: number,
  sunDistance: number,
  casterRadius: number,
): { umbra: number; penumbra: number } {
  return {
    umbra: casterRadius - (along * (SUN_RADIUS - casterRadius)) / sunDistance,
    penumbra: casterRadius + (along * (SUN_RADIUS + casterRadius)) / sunDistance,
  };
}

/** Геометрия затмения в момент наибольшей фазы. */
function eclipseGeometry(caster: string, target: string, jd: number) {
  const casterPosition = heliocentric(caster, jd);
  const targetPosition = heliocentric(target, jd);
  const sunDistance = length(casterPosition);
  const offset = sub(targetPosition, casterPosition);
  const along = sunDistance === 0 ? 0 : dot(offset, scaled(casterPosition, 1 / sunDistance));

  const casterRadius = bodyById(caster)?.radius ?? 0;
  const targetRadius = bodyById(target)?.radius ?? 0;

  return {
    distance: shadowAxisDistance(caster, target, jd),
    targetRadius,
    ...shadowRadii(along, sunDistance, casterRadius),
  };
}

/**
 * Солнечные затмения: Луна закрывает Солнце Земле.
 *
 * Затмение есть, пока полутень задевает Землю: ось тени проходит ближе, чем
 * сумма радиуса Земли и радиуса полутени на её расстоянии - около 9 900 км,
 * или 1.55 земного радиуса. То самое число, что стоит в таблицах пределом
 * частного затмения, и здесь оно не задано, а получилось.
 *
 * Шаг перебора - четверть суток: тень Луны пробегает Землю за несколько часов,
 * и более крупный шаг перескочил бы через минимум.
 */
export function solarEclipses(from: number, to: number): AstronomicalEvent[] {
  const distance = (jd: number) => shadowAxisDistance(MOON.id, 'earth', jd);

  return findMinima(distance, from, to, 0.25)
    .map((jd) => ({ jd, g: eclipseGeometry(MOON.id, 'earth', jd) }))
    .filter(({ g }) => g.distance < g.targetRadius + g.penumbra)
    .map(({ jd, g }) => ({
      kind: 'solar-eclipse' as const,
      jd,
      bodies: [MOON.id, 'earth'],
      // Гамма: расстояние оси тени от центра Земли в её радиусах. Меньше
      // единицы - ось попала в диск, и где-то Солнце закрыто целиком.
      value: g.distance / g.targetRadius,
      phase: solarPhase(jd, g.distance, g.targetRadius),
    }));
}

/**
 * Полное затмение или кольцеобразное, решается одним сравнением: видимый
 * радиус Луны больше солнечного или меньше. У Луны на эллиптической орбите
 * бывает и так и так, и в этом вся разница между двумя родами затмений.
 */
function solarPhase(jd: number, distance: number, earthRadius: number): EclipsePhase {
  if (distance >= earthRadius) return 'partial';

  const toMoon = geocentric(MOON.id, jd);
  const toSun = geocentric(SUN.id, jd);
  const moonAngular = (bodyById(MOON.id)?.radius ?? 0) / length(toMoon);
  const sunAngular = SUN_RADIUS / length(toSun);

  return moonAngular >= sunAngular ? 'total' : 'annular';
}

/**
 * Лунные затмения: Земля закрывает Солнце Луне.
 *
 * Полное - Луна целиком внутри земной тени; частное - задела её краем;
 * полутеневое - в тень не вошла вовсе, и потемнение едва заметно глазом.
 */
export function lunarEclipses(from: number, to: number): AstronomicalEvent[] {
  const distance = (jd: number) => shadowAxisDistance('earth', MOON.id, jd);

  return findMinima(distance, from, to, 0.25)
    .map((jd) => ({ jd, g: eclipseGeometry('earth', MOON.id, jd) }))
    .filter(({ g }) => g.distance < g.penumbra + g.targetRadius)
    .map(({ jd, g }) => ({
      kind: 'lunar-eclipse' as const,
      jd,
      bodies: ['earth', MOON.id],
      value: g.distance / EARTH_RADIUS,
      phase:
        g.distance < g.umbra - g.targetRadius
          ? ('total' as const)
          : g.distance < g.umbra + g.targetRadius
            ? ('partial' as const)
            : ('penumbral' as const),
    }));
}

/* ── Противостояния, соединения, транзиты ─────────────────────────────────── */

/**
 * Противостояния планеты: она в точности напротив Солнца, если смотреть с
 * Земли. Направление «от Солнца» с Земли - это и есть гелиоцентрическое
 * направление на саму Землю, поэтому мерить угол больше не с чем.
 *
 * Величина события - расстояние до планеты в а.е.: у Марса именно оно и делает
 * противостояние великим, потому что оно приходится на его перигелий.
 */
export function oppositions(id: string, from: number, to: number): AstronomicalEvent[] {
  const elongation = (jd: number) =>
    angle(geocentric(id, jd), heliocentric('earth', jd));

  return findMinima(elongation, from, to, 1).map((jd) => ({
    kind: 'opposition' as const,
    jd,
    bodies: [id],
    value: length(geocentric(id, jd)) / AU,
  }));
}

/**
 * Соединения двух тел: они сходятся на небе.
 *
 * Мера - угловое расстояние в градусах. Сближения шире пяти градусов в список
 * не идут: они перестают читаться как событие, а найти их можно почти всегда.
 */
export function conjunctions(
  a: string,
  b: string,
  from: number,
  to: number,
  limitDegrees = 5,
): AstronomicalEvent[] {
  const separation = (jd: number) => angle(geocentric(a, jd), geocentric(b, jd));

  return findMinima(separation, from, to, 0.5)
    .filter((jd) => separation(jd) < limitDegrees)
    .map((jd) => ({
      kind: 'conjunction' as const,
      jd,
      bodies: [a, b],
      value: separation(jd),
    }));
}

/**
 * Прохождения по диску Солнца: Меркурий и Венера проходят между Землёй и
 * Солнцем и видны на нём точкой.
 *
 * От нижнего соединения транзит отличается только тем, что планета попадает в
 * солнечный диск, а не проходит мимо: наклонение орбиты уводит её выше или
 * ниже. Поэтому мерится то же угловое расстояние, а порогом служит видимый
 * радиус Солнца.
 */
export function transits(id: string, from: number, to: number): AstronomicalEvent[] {
  const separation = (jd: number) => angle(geocentric(id, jd), geocentric(SUN.id, jd));

  return findMinima(separation, from, to, 0.25)
    .filter((jd) => {
      // Планета между Землёй и Солнцем, а не за ним.
      const nearer = length(geocentric(id, jd)) < length(geocentric(SUN.id, jd));
      const sunAngularRadius = Math.asin(SUN_RADIUS / length(geocentric(SUN.id, jd))) * RAD;
      return nearer && separation(jd) < sunAngularRadius;
    })
    .map((jd) => ({
      kind: 'transit' as const,
      jd,
      bodies: [id, SUN.id],
      value: separation(jd),
    }));
}

/* ── Кольца Сатурна ───────────────────────────────────────────────────────── */

/**
 * Синус высоты точки над плоскостью колец Сатурна.
 *
 * Плоскость колец совпадает с экватором планеты, значит её нормаль - ось
 * вращения. Знак говорит, с какой стороны наблюдатель: смена знака и есть
 * пересечение плоскости, а модуль - раскрытие колец.
 */
function ringElevationSine(observer: Vec, jd: number): number {
  const saturn = bodyById('saturn');
  if (!saturn) return 0;

  const pole = polarAxis(saturn.rotation);
  const toObserver = sub(observer, heliocentric('saturn', jd));
  const distance = length(toObserver);
  if (distance === 0) return 0;

  return dot(toObserver, pole) / distance;
}

/**
 * Ось вращения тела в эклиптических координатах J2000.
 *
 * `equatorialBasis` из rotation.ts даёт то же самое, но в координатах сцены:
 * там ось y смотрит вверх, и порядок осей другой. Складывать её с векторами
 * этого файла нельзя, а переставлять оси туда и обратно ради одного скалярного
 * произведения - лишний повод перепутать знак. Поворот здесь один, на наклон
 * эклиптики, и он тот же, что в первой половине `equatorialToWorld`.
 */
function polarAxis(rotation: RotationElements): Vec {
  const alpha = rotation.poleRa * DEG;
  const delta = rotation.poleDec * DEG;

  const x = Math.cos(delta) * Math.cos(alpha);
  const y = Math.cos(delta) * Math.sin(alpha);
  const z = Math.sin(delta);

  return {
    x,
    y: y * Math.cos(OBLIQUITY_J2000) + z * Math.sin(OBLIQUITY_J2000),
    z: -y * Math.sin(OBLIQUITY_J2000) + z * Math.cos(OBLIQUITY_J2000),
  };
}

/** Раскрытие колец к Солнцу, град. Знак - сторона, с которой они освещены. */
export function ringOpeningToSun(jd: number): number {
  return Math.asin(ringElevationSine({ x: 0, y: 0, z: 0 }, jd)) * RAD;
}

/** Раскрытие колец к Земле, град. Столько их видно с неё. */
export function ringOpeningToEarth(jd: number): number {
  return Math.asin(ringElevationSine(heliocentric('earth', jd), jd)) * RAD;
}

/**
 * Пересечения плоскости колец: Земля переходит с одной их стороны на другую, и
 * кольца пропадают из виду - с ребра они тоньше всего, что можно разглядеть.
 *
 * Шаг в десять суток: Земля обходит Солнце за год, и чаще одного раза в
 * несколько месяцев знак не меняется.
 */
export function ringPlaneCrossings(from: number, to: number): AstronomicalEvent[] {
  return findRoots(ringOpeningToEarth, from, to, 10).map((jd) => ({
    kind: 'ring-plane-crossing' as const,
    jd,
    bodies: ['saturn'],
    value: ringOpeningToEarth(jd),
  }));
}

/**
 * Наибольшее раскрытие колец к Солнцу: сатурнианское солнцестояние. Кольца в
 * этот момент получают больше всего света и видны ярче всего.
 */
export function ringMaximumOpening(from: number, to: number): AstronomicalEvent[] {
  // Максимум модуля - это минимум величины со знаком минус.
  const closed = (jd: number) => -Math.abs(ringOpeningToSun(jd));

  return findMinima(closed, from, to, 30).map((jd) => ({
    kind: 'ring-opening' as const,
    jd,
    bodies: ['saturn'],
    value: Math.abs(ringOpeningToSun(jd)),
  }));
}

/* ── Парады планет ────────────────────────────────────────────────────────── */

/**
 * Парад планет.
 *
 * Канонического определения у него нет: в газетах парадом называют и пять
 * планет в кулаке вытянутой руки, и четыре, размазанные по полнеба. Поэтому
 * определение назначено здесь, и назначено проверяемым: k ярких планет в одной
 * дуге эклиптической долготы, считая с Земли, и каждая дальше пятнадцати
 * градусов от Солнца.
 *
 * Обе половины важны. Дуга отвечает за то, что планеты видны разом, а не
 * порознь за полночи. Удаление от Солнца - за то, что они видны вообще:
 * собрание, тонущее в заре, парадом называть нечестно, а по долготе оно
 * выглядит теснее любого настоящего.
 *
 * Планет ровно пять: Уран и Нептун глазу недоступны, и их присутствие в дуге
 * ничего не прибавляет к тому, что человек увидит.
 */
const BRIGHT_PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

/** Ближе этого к Солнцу планета тонет в заре, град. */
const PARADE_MIN_ELONGATION = 15;

/**
 * Предел дуги по числу планет, град.
 *
 * Чем больше планет, тем шире позволено: пятеро в двадцати градусах сходятся
 * раз в несколько веков, и требовать от них тесноты тройки значило бы не найти
 * ничего. Верхний предел задан полем зрения: дуга шире шестидесяти градусов не
 * умещается в кадр, и парад пришлось бы разглядывать, вертя головой.
 */
export const PARADE_LIMITS: Readonly<Record<number, number>> = { 3: 20, 4: 45, 5: 60 };

/**
 * Насколько эпизоды считаются одним, сут.
 *
 * Четвёрка почти всегда содержит в себе тройку, и без схлопывания список
 * показывал бы одно и то же собрание дважды подряд, отличая их только числом
 * участников.
 */
const PARADE_MERGE_DAYS = 15;

/** Эклиптическая долгота тела, каким его видно с Земли, град. */
export function geocentricLongitude(id: string, jd: number): number {
  const v = geocentric(id, jd);
  return (((Math.atan2(v.y, v.x) * RAD) % 360) + 360) % 360;
}

/** Угловое расстояние тела от Солнца на земном небе, град. */
export function elongationFromSun(id: string, jd: number): number {
  return angle(geocentric(id, jd), geocentric(SUN.id, jd));
}

/**
 * Наименьшая дуга, вмещающая все долготы, град.
 *
 * Считается не перебором пар, а от противного: самая широкая щель между
 * соседними долготами - это то, что в дугу не вошло. Остальное и есть ответ.
 */
export function arcSpan(longitudes: readonly number[]): number {
  if (longitudes.length < 2) return 0;

  const sorted = [...longitudes].map((l) => ((l % 360) + 360) % 360).sort((a, b) => a - b);
  let widestGap = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const next = i + 1 < sorted.length ? sorted[i + 1]! : sorted[0]! + 360;
    widestGap = Math.max(widestGap, next - sorted[i]!);
  }

  return 360 - widestGap;
}

/** Самая тесная группа из заданного числа видимых планет на этот момент. */
function tightestGroup(jd: number, count: number): { span: number; ids: string[] } {
  const visible = BRIGHT_PLANETS.filter(
    (id) => elongationFromSun(id, jd) > PARADE_MIN_ELONGATION,
  )
    .map((id) => ({ id, longitude: geocentricLongitude(id, jd) }))
    .sort((a, b) => a.longitude - b.longitude);

  // Меньше планет, чем требуется, - дуги нет вовсе. Полный круг здесь не
  // «очень плохо», а «никак»: поиск минимумов не примет ровное плато за
  // событие, и такие отрезки времени просто пропадают из рассмотрения.
  if (visible.length < count) return { span: 360, ids: [] };

  // Круг разрезается дважды, чтобы окно могло переходить через нулевую
  // долготу: без этого группа, стоящая по обе стороны от нуля, разрывалась бы.
  const doubled = [...visible, ...visible.map((p) => ({ ...p, longitude: p.longitude + 360 }))];

  let best = 360;
  let ids: string[] = [];

  for (let i = 0; i < visible.length; i += 1) {
    const span = doubled[i + count - 1]!.longitude - doubled[i]!.longitude;
    if (span < best) {
      best = span;
      ids = doubled.slice(i, i + count).map((p) => p.id);
    }
  }

  return { span: best, ids };
}

/**
 * Парады на отрезке времени.
 *
 * Перебор идёт от пятёрки к тройке, и найденное занимает место: если тройка
 * легла на уже найденную четвёрку, остаётся четвёрка. Иначе одно и то же
 * собрание попадало бы в список трижды.
 */
export function planetParades(from: number, to: number): AstronomicalEvent[] {
  const found: AstronomicalEvent[] = [];

  for (const count of [5, 4, 3]) {
    const span = (jd: number) => tightestGroup(jd, count).span;

    for (const jd of findMinima(span, from, to, 1)) {
      const group = tightestGroup(jd, count);

      if (group.span >= PARADE_LIMITS[count]!) continue;
      if (found.some((event) => Math.abs(event.jd - jd) <= PARADE_MERGE_DAYS)) continue;

      found.push({
        kind: 'planet-parade',
        jd,
        bodies: group.ids,
        value: group.span,
      });
    }
  }

  return found.sort((a, b) => a.jd - b.jd);
}

/* ── Всё вместе ───────────────────────────────────────────────────────────── */

/** Планеты, у которых противостояния имеют смысл: те, что дальше Земли. */
const OUTER = ['mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

/** Планеты между Землёй и Солнцем: только они и проходят по его диску. */
const INNER = ['mercury', 'venus'];

/** Пары для соединений: яркие тела, сближения которых видно невооружённым глазом. */
const CONJUNCTION_PAIRS: [string, string][] = [
  ['venus', 'jupiter'],
  ['venus', 'saturn'],
  ['venus', 'mars'],
  ['jupiter', 'saturn'],
  ['jupiter', 'mars'],
  ['mars', 'saturn'],
];

/**
 * Все события на отрезке, по времени.
 *
 * Перебор идёт по каждому роду отдельно, потому что у каждого свой шаг: у
 * затмения он в четверть суток, у противостояния - в сутки, у колец - в десять.
 * Один общий шаг пришлось бы взять по самому быстрому событию, и поиск
 * противостояний Нептуна стал бы в сорок раз дороже без всякой пользы.
 */
export function findEvents(from: number, to: number): AstronomicalEvent[] {
  const events: AstronomicalEvent[] = [
    ...solarEclipses(from, to),
    ...lunarEclipses(from, to),
    ...ringPlaneCrossings(from, to),
    ...ringMaximumOpening(from, to),
    ...planetParades(from, to),
  ];

  for (const id of OUTER) events.push(...oppositions(id, from, to));
  for (const id of INNER) events.push(...transits(id, from, to));
  for (const [a, b] of CONJUNCTION_PAIRS) events.push(...conjunctions(a, b, from, to));

  return events.sort((x, y) => x.jd - y.jd);
}

/** Тела, у которых бывают противостояния и прохождения: для списка и проверок. */
export const OPPOSITION_BODIES: readonly string[] = OUTER;
export const TRANSIT_BODIES: readonly string[] = INNER;
