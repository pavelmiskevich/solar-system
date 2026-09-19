import { positionAt, type EclipticVector, type OrbitalElements } from './kepler';

/**
 * Хвосты кометы.
 *
 * Считаются здесь, а не в сцене, по той же причине, по какой здесь считаются
 * орбиты: это механика, и её можно проверить числами, не заводя браузера.
 * Сцена берёт готовые точки и натягивает на них ленты.
 *
 * Хвоста два, и они разной природы. Ионный - газ, сорванный с ядра солнечным
 * ветром: лёгкий, разогнанный почти мгновенно, и оттого прямой и точно
 * противосолнечный. Пылевой - песчинки, которые свет давит слабее, чем ветер
 * дует на ионы; пока их сносит, комета уходит по орбите вперёд, и хвост
 * остаётся позади изогнутой полосой. Оба видны на любом снимке кометы, и по
 * ним её и узнают.
 */

/**
 * Дальше этого расстояния от Солнца хвоста нет, а.е.
 *
 * Лёд начинает испаряться примерно там, где солнечного тепла хватает на
 * возгонку воды, - около трёх астрономических единиц. Дальше комета всего
 * лишь тёмная глыба: сейчас Галлея в 34 а.е., и это именно тот случай.
 */
export const TAIL_CUTOFF_AU = 3;

/**
 * Гравитационный параметр Солнца в единицах сцены: а.е.³/сут².
 *
 * Тот самый GM, что стоит в третьем законе Кеплера, - через него и считается
 * снос пылинки давлением света.
 */
const GM_SUN_AU3_PER_DAY2 = 2.959122082855911e-4;

/**
 * Отношение давления света к притяжению Солнца для пылинки, β.
 *
 * Для частиц около микрона оно близко к половине: свет отталкивает почти
 * так же сильно, как тяготение притягивает. Мелкая пыль улетает быстрее,
 * крупная почти не сносится, и настоящий хвост - веер из всех сразу; здесь
 * взято одно значение из середины, иначе вместо ленты пришлось бы рисовать
 * семейство.
 */
const DUST_BETA = 0.6;

/** За сколько суток до наблюдения выпущена самая старая видимая пыль. */
const DUST_AGE_DAYS = 30;

/** Длина ионного хвоста в перигелии, а.е. */
const ION_LENGTH_AU = 0.32;

/**
 * Насколько комета деятельна на данном расстоянии от Солнца, 0…1.
 *
 * Испарение идёт тем быстрее, чем больше тепла приходит на единицу
 * поверхности, то есть как 1/r². Отсчёт ведётся от перигелия - там единица, -
 * и сходит на ноль у порога: за ним хвоста нет совсем, а не «чуть-чуть».
 */
export function activityAt(sunDistanceAu: number, perihelionAu: number): number {
  if (sunDistanceAu >= TAIL_CUTOFF_AU) return 0;

  const cutoff = 1 / (TAIL_CUTOFF_AU * TAIL_CUTOFF_AU);
  const here = 1 / (sunDistanceAu * sunDistanceAu) - cutoff;
  const most = 1 / (perihelionAu * perihelionAu) - cutoff;

  return Math.min(1, Math.max(0, here / most));
}

/**
 * Точки ионного хвоста, от ядра наружу. Пустой массив - хвоста нет.
 *
 * Прямая линия: ионы разгоняются ветром до сотен километров в секунду, и на
 * длине хвоста их собственное движение по орбите уже незаметно.
 */
export function ionTailPoints(
  orbit: OrbitalElements,
  jd: number,
  count: number,
): EclipticVector[] {
  const nucleus = positionAt(orbit, jd);
  const distance = Math.hypot(nucleus.x, nucleus.y, nucleus.z);
  const activity = activityAt(distance, orbit.a * (1 - orbit.e));
  if (activity === 0 || count < 2) return [];

  const length = ION_LENGTH_AU * activity;
  const points: EclipticVector[] = [];

  for (let i = 0; i < count; i += 1) {
    const reach = (length * i) / (count - 1);
    const scale = 1 + reach / distance;
    points.push({ x: nucleus.x * scale, y: nucleus.y * scale, z: nucleus.z * scale });
  }

  return points;
}

/**
 * Точки пылевого хвоста, от ядра наружу. Пустой массив - хвоста нет.
 *
 * Изгиб не рисуется, а получается сам, и вот откуда.
 *
 * Пылинка уносит с собой скорость ядра, так что без давления света она шла бы
 * по той же орбите и осталась бы при комете - никакого хвоста бы не было.
 * Свет добавляет ей ускорение β·GM/r² от Солнца, то есть ослабляет для неё
 * тяготение. Дальше начинается орбитальная механика: пылинку приподнимает
 * наружу, на более высокой орбите она идёт медленнее и отстаёт. Первое даёт
 * хвосту длину, второе - изгиб.
 *
 * Считается это уравнениями Хилла - тем же приближением, которым считают
 * сближение кораблей на орбите. Для постоянного ускорения вдоль радиуса оно
 * даёт смещение наружу 2·(a/ω²)·(1 − cos ωτ) и отставание вдоль орбиты
 * −2·(a/ω)·(τ − sin(ωτ)/ω), где ω - угловая скорость кометы.
 *
 * Приближение, а не точное решение: ускорение считается постоянным, а β у
 * настоящей пыли не одно - крупные песчинки почти не сносит, мелкие улетают
 * первыми, и настоящий хвост поэтому веер, а не лента. Зато здесь нет ни
 * одной подогнанной на глаз величины.
 */
export function dustTailPoints(
  orbit: OrbitalElements,
  jd: number,
  count: number,
): EclipticVector[] {
  const nucleus = positionAt(orbit, jd);
  const distance = Math.hypot(nucleus.x, nucleus.y, nucleus.z);
  const activity = activityAt(distance, orbit.a * (1 - orbit.e));
  if (activity === 0 || count < 2) return [];

  // Скорость - разностью положений: отдельной её в кеплеровом решении нет, а
  // заводить ради этого вторую формулу значит завести и второй источник
  // ошибок.
  const step = 0.01;
  const ahead = positionAt(orbit, jd + step);
  const behind = positionAt(orbit, jd - step);
  const velocity = {
    x: (ahead.x - behind.x) / (2 * step),
    y: (ahead.y - behind.y) / (2 * step),
    z: (ahead.z - behind.z) / (2 * step),
  };

  // Наружу - вдоль радиуса; вперёд - поперёк него в плоскости орбиты.
  const outward = scaled(nucleus, 1 / distance);
  const momentum = cross(nucleus, velocity);
  const forward = normalized(cross(momentum, nucleus));

  const angularRate = Math.hypot(momentum.x, momentum.y, momentum.z) / (distance * distance);
  const push = (DUST_BETA * GM_SUN_AU3_PER_DAY2) / (distance * distance);

  /*
   * Возраст пыли не зависит от того, сколько её вылетело. Активность правит
   * плотностью хвоста - тем, насколько он ярок, - а форму задаёт механика:
   * пылинка месячной давности отстала на столько, на сколько отстала.
   *
   * Смешать одно с другим - готовая ошибка: если умножать на активность и
   * возраст, хвост схлопывается в точку уже в полутора астрономических
   * единицах от Солнца, хотя у настоящей кометы он там ещё виден.
   */
  const oldest = DUST_AGE_DAYS;
  const points: EclipticVector[] = [nucleus];

  for (let i = 1; i < count; i += 1) {
    const age = (oldest * i) / (count - 1);
    const phase = angularRate * age;

    const out = (2 * push * (1 - Math.cos(phase))) / (angularRate * angularRate);
    const lag = (-2 * push * (age - Math.sin(phase) / angularRate)) / angularRate;

    points.push({
      x: nucleus.x + outward.x * out + forward.x * lag,
      y: nucleus.y + outward.y * out + forward.y * lag,
      z: nucleus.z + outward.z * out + forward.z * lag,
    });
  }

  return points;
}

function scaled(v: EclipticVector, k: number): EclipticVector {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

function cross(a: EclipticVector, b: EclipticVector): EclipticVector {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalized(v: EclipticVector): EclipticVector {
  return scaled(v, 1 / Math.hypot(v.x, v.y, v.z));
}
