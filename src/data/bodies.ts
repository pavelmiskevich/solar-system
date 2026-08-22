import type { OrbitalElements } from '../physics/kepler';
import type { SatelliteElements } from '../physics/satellite';

/**
 * Ориентация оси вращения и фаза вращения по отчёту рабочей группы МАС
 * (IAU WGCCRE 2015). Полюс задан в экваториальных координатах ICRF.
 */
export interface RotationElements {
  /** Прямое восхождение северного полюса, град. */
  poleRa: number;
  /** Склонение северного полюса, град. */
  poleDec: number;
  /** Долгота нулевого меридиана на эпоху J2000, град. */
  primeMeridian: number;
  /** Скорость вращения, град/сутки. Отрицательная — обратное вращение. */
  rotationRate: number;
}

export interface BodyDefinition {
  id: string;
  name: string;
  /** Экваториальный радиус, км. */
  radius: number;
  /**
   * Полярный радиус, км. У газовых гигантов сжатие достигает 10% и является
   * одной из тех «характерных черт», без которых Сатурн выглядит чужим.
   */
  polarRadius: number;
  /** Масса, кг — для карточки тела. */
  mass: number;
  /** Геометрическое альбедо — понадобится для расчёта отражённого света. */
  albedo: number;
  /** Цвет-заглушка до загрузки текстур и для точки-билборда вдали. */
  color: number;
  rotation: RotationElements;
  /** Элементы орбиты; у Солнца отсутствуют. */
  orbit?: OrbitalElements;
  /** Вокруг чего обращается тело. Отсутствие означает гелиоцентрическую орбиту. */
  parent?: string;
  /** Элементы орбиты вокруг родителя. У Луны их нет: её движение
   *  считается рядом Брауна, а не кеплеровыми элементами. */
  satellite?: SatelliteElements;
  /**
   * Синхронное вращение: тело всегда повёрнуто к родителю одной стороной.
   * Так честнее, чем задавать фазу вращения числом: синхронность — это связь
   * с орбитой, а не отдельное число, которое может с ней разойтись.
   */
  tidallyLocked?: boolean;
}

/**
 * Элементы орбит планет — таблица JPL «Keplerian Elements for Approximate
 * Positions of the Major Planets», вариант для интервала 1800–2050 гг.
 * Точность в этом интервале — единицы угловых минут, что на порядки меньше
 * любого различимого на экране отклонения.
 *
 * Для системы Земля–Луна элементы описывают барицентр, а не Землю: сама Земля
 * смещена от него примерно на 4700 км, и это смещение — та самая «качка»
 * Земли, из-за которой лунные затмения происходят там, где происходят.
 */
export const SUN: BodyDefinition = {
  id: 'sun',
  name: 'Солнце',
  radius: 696340,
  polarRadius: 696340,
  mass: 1.98847e30,
  albedo: 0,
  color: 0xfff4e6,
  rotation: {
    poleRa: 286.13,
    poleDec: 63.87,
    primeMeridian: 84.176,
    rotationRate: 14.1844,
  },
};

export const PLANETS: BodyDefinition[] = [
  {
    id: 'mercury',
    name: 'Меркурий',
    radius: 2439.7,
    polarRadius: 2439.7,
    mass: 3.3011e23,
    albedo: 0.142,
    color: 0x9c8f86,
    rotation: {
      poleRa: 281.0103,
      poleDec: 61.4155,
      primeMeridian: 329.5988,
      rotationRate: 6.1385108,
    },
    orbit: {
      a: 0.38709927, e: 0.20563593, i: 7.00497902,
      L: 252.2503235, lp: 77.45779628, node: 48.33076593,
      aDot: 0.00000037, eDot: 0.00001906, iDot: -0.00594749,
      LDot: 149472.67411175, lpDot: 0.16047689, nodeDot: -0.12534081,
    },
  },
  {
    id: 'venus',
    name: 'Венера',
    radius: 6051.8,
    polarRadius: 6051.8,
    mass: 4.8675e24,
    albedo: 0.689,
    color: 0xe3c88f,
    rotation: {
      poleRa: 272.76,
      poleDec: 67.16,
      primeMeridian: 160.2,
      rotationRate: -1.4813688,
    },
    orbit: {
      a: 0.72333566, e: 0.00677672, i: 3.39467605,
      L: 181.9790995, lp: 131.60246718, node: 76.67984255,
      aDot: 0.0000039, eDot: -0.00004107, iDot: -0.0007889,
      LDot: 58517.81538729, lpDot: 0.00268329, nodeDot: -0.27769418,
    },
  },
  {
    id: 'earth',
    name: 'Земля',
    radius: 6378.137,
    polarRadius: 6356.752,
    mass: 5.97237e24,
    albedo: 0.306,
    color: 0x4a7fc1,
    rotation: {
      poleRa: 0,
      poleDec: 90,
      primeMeridian: 190.147,
      rotationRate: 360.9856235,
    },
    orbit: {
      a: 1.00000261, e: 0.01671123, i: -0.00001531,
      L: 100.46457166, lp: 102.93768193, node: 0,
      aDot: 0.00000562, eDot: -0.00004392, iDot: -0.01294668,
      LDot: 35999.37244981, lpDot: 0.32327364, nodeDot: 0,
    },
  },
  {
    id: 'mars',
    name: 'Марс',
    radius: 3396.2,
    polarRadius: 3376.2,
    mass: 6.4171e23,
    albedo: 0.17,
    color: 0xc1603c,
    rotation: {
      poleRa: 317.269,
      poleDec: 54.432,
      primeMeridian: 176.049,
      rotationRate: 350.891982443297,
    },
    orbit: {
      a: 1.52371034, e: 0.0933941, i: 1.84969142,
      L: -4.55343205, lp: -23.94362959, node: 49.55953891,
      aDot: 0.00001847, eDot: 0.00007882, iDot: -0.00813131,
      LDot: 19140.30268499, lpDot: 0.44441088, nodeDot: -0.29257343,
    },
  },
  {
    id: 'jupiter',
    name: 'Юпитер',
    radius: 71492,
    polarRadius: 66854,
    mass: 1.8982e27,
    albedo: 0.538,
    color: 0xd0ad86,
    rotation: {
      poleRa: 268.056595,
      poleDec: 64.495303,
      primeMeridian: 284.95,
      rotationRate: 870.536,
    },
    orbit: {
      a: 5.202887, e: 0.04838624, i: 1.30439695,
      L: 34.39644051, lp: 14.72847983, node: 100.47390909,
      aDot: -0.00011607, eDot: -0.00013253, iDot: -0.00183714,
      LDot: 3034.74612775, lpDot: 0.21252668, nodeDot: 0.20469106,
    },
  },
  {
    id: 'saturn',
    name: 'Сатурн',
    radius: 60268,
    polarRadius: 54364,
    mass: 5.6834e26,
    albedo: 0.499,
    color: 0xd8c185,
    rotation: {
      poleRa: 40.589,
      poleDec: 83.537,
      primeMeridian: 38.9,
      rotationRate: 810.7939024,
    },
    orbit: {
      a: 9.53667594, e: 0.05386179, i: 2.48599187,
      L: 49.95424423, lp: 92.59887831, node: 113.66242448,
      aDot: -0.0012506, eDot: -0.00050991, iDot: 0.00193609,
      LDot: 1222.49362201, lpDot: -0.41897216, nodeDot: -0.28867794,
    },
  },
  {
    id: 'uranus',
    name: 'Уран',
    radius: 25559,
    polarRadius: 24973,
    mass: 8.681e25,
    albedo: 0.488,
    color: 0x9fd3e0,
    rotation: {
      poleRa: 257.311,
      poleDec: -15.175,
      primeMeridian: 203.81,
      rotationRate: -501.1600928,
    },
    orbit: {
      a: 19.18916464, e: 0.04725744, i: 0.77263783,
      L: 313.23810451, lp: 170.9542763, node: 74.01692503,
      aDot: -0.00196176, eDot: -0.00004397, iDot: -0.00242939,
      LDot: 428.48202785, lpDot: 0.40805281, nodeDot: 0.04240589,
    },
  },
  {
    id: 'neptune',
    name: 'Нептун',
    radius: 24764,
    polarRadius: 24341,
    mass: 1.02413e26,
    albedo: 0.442,
    color: 0x4f70d8,
    rotation: {
      poleRa: 299.36,
      poleDec: 43.46,
      primeMeridian: 253.18,
      rotationRate: 536.3128492,
    },
    orbit: {
      a: 30.06992276, e: 0.00859048, i: 1.77004347,
      L: -55.12002969, lp: 44.96476227, node: 131.78422574,
      aDot: 0.00026291, eDot: 0.00005105, iDot: 0.00035372,
      LDot: 218.45945325, lpDot: -0.32241464, nodeDot: -0.00508664,
    },
  },
  {
    id: 'pluto',
    name: 'Плутон',
    radius: 1188.3,
    polarRadius: 1188.3,
    mass: 1.303e22,
    albedo: 0.52,
    color: 0xc4ab97,
    rotation: {
      poleRa: 132.993,
      poleDec: -6.163,
      primeMeridian: 302.695,
      rotationRate: 56.3625225,
    },
    orbit: {
      a: 39.48211675, e: 0.2488273, i: 17.14001206,
      L: 238.92903833, lp: 224.06891629, node: 110.30393684,
      aDot: -0.00031596, eDot: 0.0000517, iDot: 0.00004818,
      LDot: 145.20780515, lpDot: -0.04062942, nodeDot: -0.01183482,
    },
  },
];

export const MOON: BodyDefinition = {
  id: 'moon',
  name: 'Луна',
  radius: 1737.4,
  polarRadius: 1737.4,
  mass: 7.342e22,
  albedo: 0.136,
  color: 0x9a938c,
  parent: 'earth',
  rotation: {
    poleRa: 269.9949,
    poleDec: 66.5392,
    primeMeridian: 38.3213,
    rotationRate: 13.17635815,
  },
};


/**
 * Спутники газовых гигантов.
 *
 * Элементы орбит — таблицы JPL «Planetary Satellite Mean Elements» на эпоху
 * J2000, отнесённые к плоскости Лапласа: у этих пяти она практически совпадает
 * с экватором планеты. Полюса вращения взяты равными полюсу планеты — у тел,
 * запертых приливами в её экваториальной плоскости, это верно с точностью до
 * долей градуса.
 *
 * Все пять вращаются синхронно: Ио, Европа, Ганимед, Каллисто и Титан всегда
 * повёрнуты к своей планете одной стороной, как Луна к Земле.
 *
 * Периоды взяты сидерические, а не из той же таблицы: табличные отнесены к
 * прецессирующей линии апсид и у Ио с Европой отличаются от сидерических на
 * треть процента. За год это набегает в целый оборот, а главное — ломает резонанс
 * Лапласа: средние движения Ио, Европы и Ганимеда связаны точным
 * соотношением n₁ − 3n₂ + 2n₃ = 0, и соблюсти его важнее, чем взять все числа
 * из одной таблицы.
 */
const JUPITER_POLE = { poleRa: 268.056595, poleDec: 64.495303 };
const SATURN_POLE = { poleRa: 40.589, poleDec: 83.537 };

/** Скорость вращения синхронного спутника: оборот за период обращения. */
function synchronous(pole: { poleRa: number; poleDec: number }, periodDays: number) {
  return { ...pole, primeMeridian: 0, rotationRate: 360 / periodDays };
}

export const MOONS: BodyDefinition[] = [
  {
    id: 'io',
    name: 'Ио',
    radius: 1821.6,
    polarRadius: 1821.6,
    mass: 8.931938e22,
    // Самое вулканически активное тело системы: поверхность обновляется
    // сернистыми извержениями быстрее, чем накапливаются кратеры.
    albedo: 0.63,
    color: 0xd8c070,
    parent: 'jupiter',
    tidallyLocked: true,
    rotation: synchronous(JUPITER_POLE, 1.769138),
    satellite: {
      a: 421800,
      e: 0.004,
      i: 0.0,
      node: 0.0,
      peri: 49.1,
      meanAnomaly: 330.9,
      period: 1.769138,
    },
  },
  {
    id: 'europa',
    name: 'Европа',
    radius: 1560.8,
    polarRadius: 1560.8,
    mass: 4.799844e22,
    albedo: 0.67,
    color: 0xd6c9b4,
    parent: 'jupiter',
    tidallyLocked: true,
    rotation: synchronous(JUPITER_POLE, 3.551181),
    satellite: {
      a: 671100,
      e: 0.009,
      i: 0.5,
      node: 184.0,
      peri: 45.0,
      meanAnomaly: 345.4,
      period: 3.551181,
    },
  },
  {
    id: 'ganymede',
    name: 'Ганимед',
    radius: 2631.2,
    polarRadius: 2631.2,
    // Крупнее Меркурия: самый большой спутник в Солнечной системе.
    mass: 1.4819e23,
    albedo: 0.43,
    color: 0x9a8d80,
    parent: 'jupiter',
    tidallyLocked: true,
    rotation: synchronous(JUPITER_POLE, 7.154553),
    satellite: {
      a: 1070400,
      e: 0.001,
      i: 0.2,
      node: 58.5,
      peri: 198.3,
      meanAnomaly: 324.8,
      period: 7.154553,
    },
  },
  {
    id: 'callisto',
    name: 'Каллисто',
    radius: 2410.3,
    polarRadius: 2410.3,
    mass: 1.075938e23,
    // Древнейшая поверхность системы: кратеров столько, что новые ложатся
    // поверх старых, и альбедо втрое ниже, чем у соседней Европы.
    albedo: 0.22,
    color: 0x6f665c,
    parent: 'jupiter',
    tidallyLocked: true,
    rotation: synchronous(JUPITER_POLE, 16.689018),
    satellite: {
      a: 1882700,
      e: 0.007,
      i: 0.3,
      node: 309.1,
      peri: 43.8,
      meanAnomaly: 87.4,
      period: 16.689018,
    },
  },
  {
    id: 'titan',
    name: 'Титан',
    radius: 2574.7,
    polarRadius: 2574.7,
    mass: 1.3452e23,
    // Единственный спутник с плотной атмосферой: полтора бара азота, из-за
    // дымки поверхности не видно вовсе.
    albedo: 0.22,
    color: 0xd9a35c,
    parent: 'saturn',
    tidallyLocked: true,
    rotation: synchronous(SATURN_POLE, 15.945421),
    satellite: {
      a: 1221900,
      e: 0.029,
      i: 0.3,
      node: 78.6,
      peri: 78.3,
      meanAnomaly: 11.7,
      period: 15.945421,
    },
  },
];

/**
 * Доля Луны в массе системы Земля–Луна. На неё смещена Земля относительно
 * барицентра, для которого заданы кеплеровы элементы.
 */
export const MOON_MASS_FRACTION = MOON.mass / (PLANETS[2]!.mass + MOON.mass);

export const ALL_BODIES: BodyDefinition[] = [SUN, ...PLANETS, MOON, ...MOONS];

export function bodyById(id: string): BodyDefinition | undefined {
  return ALL_BODIES.find((b) => b.id === id);
}

/**
 * Кто может закрыть телу Солнце: родитель, соседи по родителю и его спутники.
 *
 * Список короткий не из экономии, а по существу: заслонить свет способен
 * только сосед — тело, до которого несколько своих радиусов, а не миллионы.
 * Марс Земле Солнца не закроет никогда, и держать его в списке значило бы
 * считать в шейдере заведомую пустоту на каждом пикселе каждого кадра.
 *
 * Солнце в списки не входит: оно и есть источник света.
 */
export function eclipseCasters(id: string): string[] {
  const body = bodyById(id);
  if (!body || id === SUN.id) return [];

  // Родитель — только настоящий: у планет его нет вовсе, и считать Солнце
  // родителем значило бы записать все планеты друг другу в соседи.
  const parent = body.parent && body.parent !== SUN.id ? body.parent : null;

  const casters: string[] = [];

  // Планета закрывает Солнце своему спутнику — это лунное затмение.
  if (parent) casters.push(parent);

  for (const other of ALL_BODIES) {
    if (other.id === id || other.id === SUN.id) continue;
    // Спутники тела — солнечные затмения на нём; соседи по родителю —
    // взаимные затмения спутников, какие видны у галилеевых лун.
    if (other.parent === id || (parent && other.parent === parent)) casters.push(other.id);
  }

  return casters;
}
