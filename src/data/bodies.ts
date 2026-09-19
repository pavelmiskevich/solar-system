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
  /** Скорость вращения, град/сутки. Отрицательная - обратное вращение. */
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
  /** Масса, кг - для карточки тела. */
  mass: number;
  /** Геометрическое альбедо - понадобится для расчёта отражённого света. */
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
   * Так честнее, чем задавать фазу вращения числом: синхронность - это связь
   * с орбитой, а не отдельное число, которое может с ней разойтись.
   */
  tidallyLocked?: boolean;
}

/**
 * Элементы орбит планет - таблица JPL «Keplerian Elements for Approximate
 * Positions of the Major Planets», вариант для интервала 1800-2050 гг.
 * Точность в этом интервале - единицы угловых минут, что на порядки меньше
 * любого различимого на экране отклонения.
 *
 * Для системы Земля-Луна элементы описывают барицентр, а не Землю: сама Земля
 * смещена от него примерно на 4700 км, и это смещение - та самая «качка»
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
 * Спутники планет, кроме Луны: у неё своя механика и своё определение выше.
 *
 * Элементы орбит - таблицы JPL «Planetary Satellite Mean Elements» на эпоху
 * J2000, отнесённые к плоскости Лапласа: у близких спутников она практически
 * совпадает с экватором планеты. Полюса вращения взяты равными полюсу планеты -
 * у тел, запертых приливами в её экваториальной плоскости, это верно с
 * точностью до долей градуса.
 *
 * Все они вращаются синхронно и всегда повёрнуты к своей планете одной
 * стороной, как Луна к Земле. Иначе крупный спутник и не может: приливное
 * трение останавливает вращение за время, много меньшее возраста системы.
 *
 * Периоды взяты сидерические, а не из той же таблицы: табличные отнесены к
 * прецессирующей линии апсид и у Ио с Европой отличаются от сидерических на
 * треть процента. За год это набегает в целый оборот, а главное - ломает резонанс
 * Лапласа: средние движения Ио, Европы и Ганимеда связаны точным
 * соотношением n₁ − 3n₂ + 2n₃ = 0, и соблюсти его важнее, чем взять все числа
 * из одной таблицы.
 */
const MARS_POLE = { poleRa: 317.269, poleDec: 54.432 };
const JUPITER_POLE = { poleRa: 268.056595, poleDec: 64.495303 };
const SATURN_POLE = { poleRa: 40.589, poleDec: 83.537 };
const URANUS_POLE = { poleRa: 257.311, poleDec: -15.175 };
const NEPTUNE_POLE = { poleRa: 299.36, poleDec: 43.46 };
const PLUTO_POLE = { poleRa: 132.993, poleDec: -6.163 };

/**
 * Скорость вращения синхронного спутника: оборот за период обращения.
 *
 * Период задаётся со знаком. У Тритона орбита обратная, значит и вращение
 * вокруг полюса Нептуна идёт вспять: МАС оставляет северным полюсом тот, что
 * лежит к северу от неизменной плоскости, и меняет знак скорости. Ровно так же
 * записаны Венера и Уран, и по той же причине их сутки в карточке
 * отрицательные.
 */
function synchronous(pole: { poleRa: number; poleDec: number }, periodDays: number) {
  return { ...pole, primeMeridian: 0, rotationRate: 360 / periodDays };
}

export const MOONS: BodyDefinition[] = [
  {
    id: 'phobos',
    name: 'Фобос',
    // Глыба 27 на 22 на 18 км; здесь стоит средний радиус, потому что сцена
    // рисует шар. У тела такого размера гравитации не хватает, чтобы стянуть
    // себя в шар, и настоящая его форма - картофелина.
    radius: 11.267,
    polarRadius: 11.267,
    mass: 1.0659e16,
    albedo: 0.071,
    color: 0x6b6157,
    parent: 'mars',
    tidallyLocked: true,
    rotation: synchronous(MARS_POLE, 0.31891023),
    satellite: {
      a: 9376,
      e: 0.0151,
      i: 1.075,
      node: 207.784,
      peri: 150.247,
      meanAnomaly: 92.474,
      period: 0.31891023,
    },
  },
  {
    id: 'deimos',
    name: 'Деймос',
    radius: 6.2,
    polarRadius: 6.2,
    mass: 1.4762e15,
    albedo: 0.068,
    color: 0x7c7167,
    parent: 'mars',
    tidallyLocked: true,
    rotation: synchronous(MARS_POLE, 1.263),
    satellite: {
      a: 23458,
      e: 0.0002,
      i: 1.788,
      node: 24.525,
      peri: 290.496,
      meanAnomaly: 296.23,
      period: 1.263,
    },
  },
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
    id: 'mimas',
    name: 'Мимас',
    radius: 198.2,
    polarRadius: 198.2,
    // Кратер Гершель занимает треть поперечника: удар был на пределе того,
    // что тело способно пережить, не рассыпавшись.
    mass: 3.7493e19,
    albedo: 0.962,
    color: 0xd7d4cd,
    parent: 'saturn',
    tidallyLocked: true,
    rotation: synchronous(SATURN_POLE, 0.9424218),
    satellite: {
      a: 185539,
      e: 0.0196,
      i: 1.574,
      node: 173.027,
      peri: 332.499,
      meanAnomaly: 14.848,
      period: 0.9424218,
    },
  },
  {
    id: 'enceladus',
    name: 'Энцелад',
    radius: 252.1,
    polarRadius: 252.1,
    mass: 1.0802e20,
    // Альбедо больше единицы - не опечатка: геометрическое альбедо сравнивает
    // яркость тела с идеально рассеивающим диском того же сечения, а свежий
    // снег из гейзеров отражает назад больше, чем такой диск. Белее Энцелада
    // в системе нет ничего.
    albedo: 1.375,
    color: 0xeef2f4,
    parent: 'saturn',
    tidallyLocked: true,
    rotation: synchronous(SATURN_POLE, 1.370218),
    satellite: {
      a: 237948,
      e: 0.0047,
      i: 0.009,
      node: 342.507,
      peri: 0.12,
      meanAnomaly: 199.686,
      period: 1.370218,
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
  {
    id: 'titania',
    name: 'Титания',
    radius: 788.4,
    polarRadius: 788.4,
    mass: 3.4e21,
    albedo: 0.35,
    color: 0x9b8e85,
    parent: 'uranus',
    tidallyLocked: true,
    rotation: synchronous(URANUS_POLE, 8.705872),
    satellite: {
      a: 436300,
      e: 0.0011,
      i: 0.079,
      node: 99.771,
      peri: 284.4,
      meanAnomaly: 24.614,
      period: 8.705872,
    },
  },
  {
    id: 'oberon',
    name: 'Оберон',
    radius: 761.4,
    polarRadius: 761.4,
    mass: 3.076e21,
    albedo: 0.31,
    color: 0x8d8077,
    parent: 'uranus',
    tidallyLocked: true,
    rotation: synchronous(URANUS_POLE, 13.463239),
    satellite: {
      a: 583519,
      e: 0.0014,
      i: 0.068,
      node: 279.771,
      peri: 104.4,
      meanAnomaly: 283.088,
      period: 13.463239,
    },
  },
  {
    id: 'triton',
    name: 'Тритон',
    radius: 1353.4,
    polarRadius: 1353.4,
    mass: 2.1389e22,
    // Азотный иней, намёрзший поверх поверхности: отражает три четверти света
    // при том, что до Нептуна его доходит тысячная доля земного.
    albedo: 0.76,
    color: 0xd3cdc6,
    parent: 'neptune',
    tidallyLocked: true,
    // Знак минус - обратное вращение вслед за обратной орбитой, см. `synchronous`.
    rotation: synchronous(NEPTUNE_POLE, -5.876854),
    satellite: {
      a: 354759,
      e: 0.000016,
      // Больше прямого угла: единственный крупный спутник системы, идущий
      // вокруг планеты вспять. Так ходят захваченные тела, а не выросшие
      // рядом, и Тритон - пойманный объект пояса Койпера. Приливы за это
      // берут своё: орбита медленно сжимается, и когда-нибудь он разорвётся
      // в кольцо.
      i: 156.865,
      node: 177.608,
      peri: 66.142,
      meanAnomaly: 352.257,
      period: 5.876854,
    },
  },
  {
    id: 'charon',
    name: 'Харон',
    radius: 606,
    polarRadius: 606,
    // Половина поперечника Плутона: такого отношения нет больше нигде.
    // Плутон с Хароном повёрнуты друг к другу одной стороной оба сразу -
    // приливы остановили не только спутник, но и планету.
    mass: 1.586e21,
    albedo: 0.38,
    color: 0x9e968e,
    parent: 'pluto',
    tidallyLocked: true,
    rotation: synchronous(PLUTO_POLE, 6.3872),
    satellite: {
      a: 19591,
      e: 0.0002,
      i: 0.08,
      node: 223.046,
      peri: 146.106,
      meanAnomaly: 0,
      period: 6.3872,
    },
  },
];

/**
 * Доля Луны в массе системы Земля-Луна. На неё смещена Земля относительно
 * барицентра, для которого заданы кеплеровы элементы.
 */
export const MOON_MASS_FRACTION = MOON.mass / (PLANETS[2]!.mass + MOON.mass);

/**
 * Кометы.
 *
 * Отдельным списком, а не внутри PLANETS: комета не планета, и список, где
 * она лежала бы среди них, врал бы своим именем. В сцену, к линиям орбит и в
 * список тел она подмешивается наравне с ними - там разницы нет.
 */
export const COMETS: BodyDefinition[] = [
  {
    id: 'halley',
    name: 'Комета Галлея',
    /*
     * Ядро - глыба 15 на 8 на 8 км, и шаром оно не является ни в каком
     * приближении. Здесь стоит средний радиус: сцена рисует шар, а настоящую
     * форму «арахиса» знают по снимкам «Джотто» с расстояния в шестьсот
     * километров.
     */
    radius: 5.5,
    polarRadius: 5.5,
    mass: 2.2e14,
    /*
     * Чернее угля и один из самых тёмных объектов системы: ядро покрыто
     * коркой органики, отражающей четыре процента света. Светится не оно, а
     * то, что с него испаряется.
     */
    albedo: 0.04,
    color: 0x6f6a63,
    rotation: {
      // Ядро вращается сложно, сразу вокруг двух осей, и единого периода у
      // него нет. Здесь стоит главный, 2.2 суток; полюс взят условно
      // перпендикулярным эклиптике - настоящий известен плохо и в сцене
      // неразличим на теле в одиннадцать километров.
      poleRa: 0,
      poleDec: 90,
      primeMeridian: 0,
      rotationRate: 360 / 2.2,
    },
    /*
     * Решение JPL (Davide Farnocchia), эпоха 2439875.5, переведённое в формат
     * таблицы Стэндиша: средняя аномалия и аргумент перицентра свёрнуты в
     * среднюю долготу и долготу перигелия, а сама долгота перенесена с родной
     * эпохи на J2000 средним движением.
     *
     * Наклонение больше прямого угла - обращение обратное, против движения
     * планет. Механике это безразлично, а выглядит так, будто комета идёт
     * системе навстречу.
     *
     * Вековых изменений нет, и это упрощение, которое надо знать: настоящую
     * орбиту Галлеи правят Юпитер с Сатурном и отдача испаряющегося газа,
     * отчего период гуляет между 74 и 79 годами. Перигелий 1986 года эти
     * элементы дают с точностью до суток, а вот возвращение 2061 года
     * приходится у них на полгода позже настоящего.
     */
    orbit: {
      a: 17.92863505, e: 0.96793600, i: 162.19053004,
      L: 237.23068670, lp: 171.34037867, node: 59.09894721,
      aDot: 0, eDot: 0, iDot: 0,
      LDot: 474.21300258, lpDot: 0, nodeDot: 0,
    },
  },
];

export const ALL_BODIES: BodyDefinition[] = [SUN, ...PLANETS, MOON, ...MOONS, ...COMETS];

export function bodyById(id: string): BodyDefinition | undefined {
  return ALL_BODIES.find((b) => b.id === id);
}

/**
 * Кто может закрыть телу Солнце: родитель, соседи по родителю и его спутники.
 *
 * Список короткий не из экономии, а по существу: заслонить свет способен
 * только сосед - тело, до которого несколько своих радиусов, а не миллионы.
 * Марс Земле Солнца не закроет никогда, и держать его в списке значило бы
 * считать в шейдере заведомую пустоту на каждом пикселе каждого кадра.
 *
 * Солнце в списки не входит: оно и есть источник света.
 */
export function eclipseCasters(id: string): string[] {
  const body = bodyById(id);
  if (!body || id === SUN.id) return [];

  // Родитель - только настоящий: у планет его нет вовсе, и считать Солнце
  // родителем значило бы записать все планеты друг другу в соседи.
  const parent = body.parent && body.parent !== SUN.id ? body.parent : null;

  const casters: string[] = [];

  // Планета закрывает Солнце своему спутнику - это лунное затмение.
  if (parent) casters.push(parent);

  for (const other of ALL_BODIES) {
    if (other.id === id || other.id === SUN.id) continue;
    // Спутники тела - солнечные затмения на нём; соседи по родителю -
    // взаимные затмения спутников, какие видны у галилеевых лун.
    if (other.parent === id || (parent && other.parent === parent)) casters.push(other.id);
  }

  return casters;
}
