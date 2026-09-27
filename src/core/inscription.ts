import { GLYPH_GAP, SPACE_ADVANCE, glyphFor } from '../data/starFont';
import { OBLIQUITY_J2000 } from './units';

/**
 * Надпись на небе: строка превращается в вершины и рёбра на небесной сфере.
 *
 * Модуль ничего не знает о three.js и о сцене - только о направлениях. Так
 * раскладку, притяжение к звёздам и выбор места можно проверить целиком,
 * не открывая страницу.
 *
 * Надпись лежит в касательной плоскости к сфере в центре надписи. «Вверх» у
 * неё - к северному полюсу эклиптики: сцена эклиптическая, камера держит
 * горизонт в плоскости орбит, и буквы, выровненные по экватору, стояли бы
 * в кадре наискось на 23°.
 */

export interface SkyPoint {
  /** Прямое восхождение, радианы, J2000. */
  readonly ra: number;
  /** Склонение, радианы. */
  readonly dec: number;
}

export interface BrightStar extends SkyPoint {
  readonly magnitude: number;
}

/** Вершина надписи: на настоящей звезде или своя. */
export interface PlacedVertex extends SkyPoint {
  readonly real: boolean;
}

export interface Shape {
  /** Вершины в долях высоты буквы, строка по центру: x вправо, y вверх. */
  readonly points: readonly (readonly [number, number])[];
  readonly edges: readonly (readonly [number, number])[];
  /** Ширина строки в долях высоты буквы. */
  readonly width: number;
}

export interface Placement {
  readonly centre: SkyPoint;
  /** Угловая высота буквы, радианы. */
  readonly height: number;
}

export interface Avoid {
  readonly sun: SkyPoint;
  /** Луна и яркие планеты: засветка рядом с ними съедает звёзды надписи. */
  readonly others: readonly SkyPoint[];
}

export interface InscriptionLayout {
  readonly vertices: readonly PlacedVertex[];
  readonly edges: readonly (readonly [number, number])[];
  readonly placement: Placement;
}

const DEG = Math.PI / 180;

/** Ярче этого звезда держит вершину: слабее её в кадре почти не видно. */
export const SNAP_MAGNITUDE = 3.5;

/**
 * Насколько далеко вершина уходит к звезде, в долях высоты буквы.
 *
 * Проба 25 сентября: притяжение всех вершин давало сдвиг в пятую часть
 * высоты, и «А» с «Л» переставали читаться. Шесть процентов - меньше
 * градуса на букву в 16°: форма не страдает, а настоящая звезда там, где
 * небо и буква совпали, забирает вершину себе.
 */
export const SNAP_TOLERANCE = 0.06;

/** Ширина надписи: целиком в кадре и всё ещё крупно. */
export const TARGET_WIDTH = 60 * DEG;
/**
 * Какую долю ширины кадра занимает надпись на узком экране.
 *
 * Портретный телефон видит по горизонтали около 27°, и от «ПРИВЕТ» в 60° в
 * кадре оставалось одно «РИВ». Поэтому ширина надписи идёт за кадром, а
 * пятая часть остаётся полями, чтобы крайние буквы не липли к краю.
 */
export const FRAME_SHARE = 0.8;
/**
 * Нижний предел высоты буквы.
 *
 * Шесть букв на телефоне в 390 точек шириной выходят высотой около 4.5°, а
 * имя в восемь букв - чуть больше 3°. На экране это те же буквы, что на ноутбуке:
 * мелкими их делает узкий кадр, а не раскладка.
 */
const MIN_HEIGHT = 3 * DEG;
const MAX_HEIGHT = 20 * DEG;

/** Центр надписи не ближе этого к Солнцу. */
export const SUN_CLEARANCE = 45 * DEG;
/** Ни одна вершина не ближе этого к Солнцу, Луне и планетам. */
export const BODY_CLEARANCE = 10 * DEG;

/** Шаг перебора центров и предел по эклиптической широте. */
const SEARCH_STEP = 5 * DEG;
const SEARCH_LATITUDE = 60 * DEG;

type Vec = [number, number, number];

const ECLIPTIC_POLE: Vec = [0, -Math.sin(OBLIQUITY_J2000), Math.cos(OBLIQUITY_J2000)];

function vec(p: SkyPoint): Vec {
  const c = Math.cos(p.dec);
  return [c * Math.cos(p.ra), c * Math.sin(p.ra), Math.sin(p.dec)];
}

function sky(v: Vec): SkyPoint {
  const length = Math.hypot(v[0], v[1], v[2]);
  const ra = Math.atan2(v[1], v[0]);
  return { ra: ra < 0 ? ra + 2 * Math.PI : ra, dec: Math.asin(v[2] / length) };
}

function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: Vec): Vec {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

export function angleBetween(a: SkyPoint, b: SkyPoint): number {
  return Math.acos(Math.max(-1, Math.min(1, dot(vec(a), vec(b)))));
}

export function shapeOf(text: string): Shape {
  const points: [number, number][] = [];
  const edges: [number, number][] = [];
  let x = 0;
  let first = true;

  for (const char of text.toUpperCase()) {
    if (char === ' ') {
      x += SPACE_ADVANCE;
      first = true;
      continue;
    }
    const glyph = glyphFor(char);
    if (!glyph) throw new Error(`Знака «${char}» нет в звёздном шрифте`);
    if (!first) x += GLYPH_GAP;
    first = false;

    const base = points.length;
    for (const [gx, gy] of glyph.points) points.push([x + gx, gy]);
    for (const [a, b] of glyph.edges) edges.push([base + a, base + b]);
    x += glyph.width;
  }

  // По центру и по высоте: середина строки - центр надписи.
  const width = x;
  return {
    points: points.map(([px, py]) => [px - width / 2, py - 0.5] as const),
    edges,
    width,
  };
}

/**
 * Ширина надписи под кадр: 60°, если кадр шире, иначе его большая часть.
 *
 * @param verticalFov вертикальный угол обзора камеры, радианы
 * @param aspect отношение ширины кадра к высоте
 */
export function fittingWidth(verticalFov: number, aspect: number): number {
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  return Math.min(TARGET_WIDTH, FRAME_SHARE * horizontalFov);
}

/** @param targetWidth желаемая ширина надписи, радианы */
export function heightFor(shape: Shape, targetWidth = TARGET_WIDTH): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, targetWidth / Math.max(shape.width, 1e-6)));
}

/** Оси касательной плоскости: вправо в кадре и вверх, к полюсу эклиптики. */
function axes(centre: Vec): { east: Vec; north: Vec } {
  const north = normalize([
    ECLIPTIC_POLE[0] - centre[0] * dot(ECLIPTIC_POLE, centre),
    ECLIPTIC_POLE[1] - centre[1] * dot(ECLIPTIC_POLE, centre),
    ECLIPTIC_POLE[2] - centre[2] * dot(ECLIPTIC_POLE, centre),
  ]);
  // Изнутри сферы, лицом к центру и макушкой к полюсу, правая рука смотрит
  // вдоль «вперёд × вверх». Наоборот - и надпись выходит зеркальной.
  return { east: cross(centre, north), north };
}

function placeVectors(shape: Shape, centre: Vec, height: number): Vec[] {
  const { east, north } = axes(centre);
  return shape.points.map(([x, y]) =>
    normalize([
      centre[0] + (east[0] * x + north[0] * y) * height,
      centre[1] + (east[1] * x + north[1] * y) * height,
      centre[2] + (east[2] * x + north[2] * y) * height,
    ]),
  );
}

export function placeShape(shape: Shape, placement: Placement): SkyPoint[] {
  return placeVectors(shape, vec(placement.centre), placement.height).map(sky);
}

interface Snap {
  readonly star: number;
  readonly angle: number;
}

/**
 * Яркие звёзды, разложенные по полосам склонения шириной с допуск притяжения.
 *
 * Выбор места примеряет надпись к паре тысяч центров, и сравнение каждой
 * вершины с каждой звездой съедало весь срок в 200 мс. Звезда ближе допуска
 * отстоит от вершины по склонению не больше допуска, значит лежит в той же
 * полосе или в соседней - остальные можно не смотреть.
 */
interface StarBands {
  readonly vectors: readonly Vec[];
  /** Допуск притяжения, радианы: он же ширина полосы. */
  readonly tolerance: number;
  /** Номера звёзд по полосам, в каждой по возрастанию. */
  readonly bands: readonly (readonly number[])[];
}

function bandOf(z: number, tolerance: number, count: number): number {
  const band = Math.floor((Math.asin(Math.max(-1, Math.min(1, z))) + Math.PI / 2) / tolerance);
  return Math.min(count - 1, Math.max(0, band));
}

function starBands(vectors: readonly Vec[], tolerance: number): StarBands {
  const count = Math.max(1, Math.ceil(Math.PI / tolerance));
  const bands: number[][] = Array.from({ length: count }, () => []);
  vectors.forEach((v, i) => bands[bandOf(v[2], tolerance, count)]!.push(i));
  return { vectors, tolerance, bands };
}

/**
 * Притяжение по вершинам по порядку письма: ранняя буква выбирает первой.
 *
 * Из равных по близости звёзд берётся звезда с меньшим номером - так же, как
 * при переборе всех звёзд подряд: полосы только ускоряют поиск, но не меняют
 * его итог.
 */
function snapIndices(points: readonly Vec[], stars: StarBands): (Snap | null)[] {
  const { vectors, tolerance, bands } = stars;
  const limit = Math.cos(tolerance);
  const used = new Set<number>();

  return points.map((point) => {
    let best = -1;
    let bestDot = limit;
    const band = bandOf(point[2], tolerance, bands.length);
    for (let b = Math.max(0, band - 1); b <= Math.min(bands.length - 1, band + 1); b++) {
      for (const i of bands[b]!) {
        if (used.has(i)) continue;
        const d = dot(point, vectors[i]!);
        if (d > bestDot || (d === bestDot && best >= 0 && i < best)) {
          bestDot = d;
          best = i;
        }
      }
    }
    if (best < 0) return null;
    used.add(best);
    return { star: best, angle: Math.acos(Math.min(1, bestDot)) };
  });
}

function brightVectors(stars: readonly BrightStar[]): { vectors: Vec[]; source: BrightStar[] } {
  const source = stars.filter((star) => star.magnitude <= SNAP_MAGNITUDE);
  return { vectors: source.map(vec), source };
}

export function snapToStars(
  points: readonly SkyPoint[],
  height: number,
  stars: readonly BrightStar[],
): PlacedVertex[] {
  const { vectors, source } = brightVectors(stars);
  const snaps = snapIndices(points.map(vec), starBands(vectors, SNAP_TOLERANCE * height));

  return points.map((point, i) => {
    const snap = snaps[i];
    if (!snap) return { ra: point.ra, dec: point.dec, real: false };
    const star = source[snap.star]!;
    return { ra: star.ra, dec: star.dec, real: true };
  });
}

function eclipticToEquatorial(lon: number, lat: number): Vec {
  const x = Math.cos(lat) * Math.cos(lon);
  const y = Math.cos(lat) * Math.sin(lon);
  const z = Math.sin(lat);
  const c = Math.cos(OBLIQUITY_J2000);
  const s = Math.sin(OBLIQUITY_J2000);
  return [x, y * c - z * s, y * s + z * c];
}

/** Уточнение вокруг лучшего места: шаги, радианы, и сколько шагов в каждую сторону. */
const REFINE_STEPS = [1 * DEG, 0.2 * DEG];
const REFINE_REACH = 5;

/**
 * Лучшее место для надписи.
 *
 * Центры перебираются по сетке в эклиптических координатах - так их шаг
 * одинаков по всему небу, а широта ограничена: у полюса эклиптики «вверх»
 * вырождается, и надпись крутилась бы вокруг центра. Лучшее место - где
 * больше вершин встало на настоящие звёзды; при равенстве - где они ближе.
 *
 * Сетка в пять градусов грубее допуска притяжения, который меньше градуса:
 * со строгим допуском она совпадение неба с буквой почти всегда проскакивает
 * и уточнять стала бы не там. Поэтому каждый проход судит со своим допуском -
 * не меньше трёх четвертей своего шага: грубый ищет, где звёзды вообще рядом
 * с буквами, мелкие доводят до настоящего притяжения. Перед каждым мелким
 * проходом лучшее место переоценивается его допуском, иначе счёт грубого
 * прохода, более щедрый, не дал бы себя перебить.
 *
 * Порядок перебора постоянный, и первое из равных побеждает: одна ссылка в
 * один день даёт одно место.
 *
 * Ширины кадра перебор не знает и мерит надпись всегда в 60°. Через полсекунды
 * после открытия в адресе уже стоит камера, и ссылка, скопированная на
 * ноутбуке, открывается на телефоне его камерой. Ищи телефон место под свою
 * узкую надпись - он находил другое, в 10-26° от ноутбучного, и смотрел в
 * пустое небо. Узкая надпись ложится в том же центре, внутри широкой, и
 * отступы от Солнца, Луны и планет для неё тоже держатся.
 */
export function choosePlacement(shape: Shape, stars: readonly BrightStar[], avoid: Avoid): Placement {
  const height = heightFor(shape);
  const { vectors } = brightVectors(stars);
  const sun = vec(avoid.sun);
  const blockers = [sun, ...avoid.others.map(vec)];
  const sunLimit = Math.cos(SUN_CLEARANCE);
  const bodyLimit = Math.cos(BODY_CLEARANCE);
  const strict = SNAP_TOLERANCE * height;

  type Candidate = { centre: Vec; hits: number; miss: number };
  let best: Candidate | null = null;

  /** @param bands звёзды по полосам с допуском притяжения этого прохода */
  const consider = (centre: Vec, bands: StarBands): void => {
    if (dot(centre, sun) > sunLimit) return;

    const points = placeVectors(shape, centre, height);
    if (points.some((p) => blockers.some((b) => dot(p, b) > bodyLimit))) return;

    let hits = 0;
    let miss = 0;
    for (const snap of snapIndices(points, bands)) {
      if (snap) {
        hits += 1;
        miss += snap.angle;
      }
    }

    if (!best || hits > best.hits || (hits === best.hits && miss < best.miss)) {
      best = { centre, hits, miss };
    }
  };

  const coarse = starBands(vectors, Math.max(strict, 0.75 * SEARCH_STEP));
  for (let lat = -SEARCH_LATITUDE; lat <= SEARCH_LATITUDE + 1e-9; lat += SEARCH_STEP) {
    const step = SEARCH_STEP / Math.cos(lat);
    for (let lon = 0; lon < 2 * Math.PI - 1e-9; lon += step) consider(eclipticToEquatorial(lon, lat), coarse);
  }

  for (const step of REFINE_STEPS) {
    // best меняется внутри consider, а TypeScript замыкания не видит и
    // держит его пустым - отсюда приведение, как и в конце.
    const around = best as Candidate | null;
    if (!around) break;
    const fine = starBands(vectors, Math.max(strict, 0.75 * step));
    best = null;
    consider(around.centre, fine);
    const { east, north } = axes(around.centre);
    for (let i = -REFINE_REACH; i <= REFINE_REACH; i++) {
      for (let j = -REFINE_REACH; j <= REFINE_REACH; j++) {
        if (i === 0 && j === 0) continue;
        consider(
          normalize([
            around.centre[0] + (east[0] * i + north[0] * j) * step,
            around.centre[1] + (east[1] * i + north[1] * j) * step,
            around.centre[2] + (east[2] * i + north[2] * j) * step,
          ]),
          fine,
        );
      }
    }
  }

  // Если засветка заняла всё небо - лучше встать напротив Солнца, чем не
  // показать поздравление вовсе.
  const found = best as Candidate | null;
  const centre = found?.centre ?? ([-sun[0], -sun[1], -sun[2]] as Vec);
  return { centre: sky(centre), height };
}

/**
 * @param targetWidth ширина надписи под кадр, радианы. От неё зависит только
 *   размер букв: место одно на все экраны, см. `choosePlacement`.
 */
export function layoutInscription(
  text: string,
  stars: readonly BrightStar[],
  avoid: Avoid,
  place?: SkyPoint,
  targetWidth = TARGET_WIDTH,
): InscriptionLayout {
  const shape = shapeOf(text);
  const centre = place ?? choosePlacement(shape, stars, avoid).centre;
  const placement = { centre, height: heightFor(shape, targetWidth) };
  const vertices = snapToStars(placeShape(shape, placement), placement.height, stars);
  return { vertices, edges: shape.edges, placement };
}
