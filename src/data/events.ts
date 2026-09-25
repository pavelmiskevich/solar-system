import { RAD, dateFromJulianDay } from '../core/units';
import type { BodyView, FreeView, SceneState } from '../core/sceneState';
import { strings } from '../i18n';
import type { ParadeSky } from '../i18n/ru';
import type { AstronomicalEvent } from '../physics/events';
import { findEvents, geocentricLongitude, heliocentric } from '../physics/events';

/**
 * События списком: как их назвать и куда за ними лететь.
 *
 * Поиск живёт в physics/events.ts и знает только числа: момент, участников и
 * меру. Здесь к ним прибавляется всё остальное - имя, строка о том, на что
 * смотреть, и готовое состояние сцены. Слова для имени и строки берутся из
 * словаря интерфейса (src/i18n): порядок слов и падежи там свои у каждого
 * языка, а здесь решается только, какие слова нужны.
 *
 * Состояние - то же самое, чем описан готовый вид: дата, тело, расстояние в его
 * радиусах и два угла. Разница в том, что у вида они записаны в коде руками, а
 * здесь считаются из положений тел на момент события. Иначе и быть не может:
 * дата у события своя, а с ней своё и направление, с которого его видно.
 */

/** На сколько лет вперёд искать. */
export const EVENT_WINDOW_YEARS = 5;

/** Средняя длина юлианского года, сут. */
const DAYS_PER_YEAR = 365.25;

export interface EventRow {
  /** Устойчивый ключ: род события и дата. По нему строка находится в списке. */
  id: string;
  /** Название на текущем языке: «Полное солнечное затмение». */
  readonly title: string;
  /** Одна строка о том, на что смотреть, - на текущем языке. */
  readonly hint: string;
  jd: number;
  date: Date;
  /** Тело, к которому летит камера. У парада его нет: камера смотрит с Земли. */
  body: string;
  state: SceneState & { view: BodyView | FreeView };
}

/**
 * Направление на камеру в координатах сцены, углами.
 *
 * Эклиптический вектор переводится в оси сцены (x, z, −y), а из них - в азимут
 * и возвышение, которыми задан вид вокруг тела. Тот же перевод, что у всей
 * сцены; повторён здесь потому, что событие считается в эклиптических
 * координатах и до сцены не доходит вовсе.
 */
function anglesFromEcliptic(v: { x: number; y: number; z: number }): {
  azimuth: number;
  elevation: number;
} {
  const sceneX = v.x;
  const sceneY = v.z;
  const sceneZ = -v.y;
  const horizontal = Math.hypot(sceneX, sceneZ);

  return {
    azimuth: Math.atan2(sceneX, sceneZ) * RAD,
    elevation: Math.atan2(sceneY, horizontal) * RAD,
  };
}

/** Направление от одного тела к другому на заданный момент, эклиптическое. */
function towards(from: string, to: string, jd: number) {
  const a = heliocentric(from, jd);
  const b = heliocentric(to, jd);
  return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
}

/**
 * Откуда смотреть на событие.
 *
 * У каждого рода своя сторона, и она не выбрана из красоты, а следует из сути.
 * На затмение смотрят со стороны Солнца - иначе тень окажется за горизонтом.
 * На противостояние - тоже со стороны Солнца: противостояние и есть полная
 * фаза, и половинка диска её не покажет. На прохождение и на кольца - со
 * стороны Земли, потому что это явления земного неба и больше ничьего.
 */
function viewpointOf(event: AstronomicalEvent): { body: string; from: string; radii: number } {
  switch (event.kind) {
    case 'solar-eclipse':
      // Со стороны Луны: её тень лежит там, куда указывает эта же прямая.
      return { body: 'earth', from: 'moon', radii: 3 };
    case 'lunar-eclipse':
      return { body: 'moon', from: 'sun', radii: 3.5 };
    case 'opposition':
      return { body: event.bodies[0] ?? 'mars', from: 'sun', radii: 4 };
    case 'transit':
      // Со стороны Земли: планета идёт по диску Солнца, и видно её только так.
      return { body: event.bodies[0] ?? 'mercury', from: 'earth', radii: 4 };
    case 'conjunction':
      // Сближение - явление земного неба: с другой точки тела разойдутся.
      return { body: event.bodies[0] ?? 'jupiter', from: 'earth', radii: 6 };
    case 'planet-parade':
      // Земля названа здесь не как цель, а как место наблюдателя: вид у парада
      // свободный, и ни расстояние, ни сторона в нём не участвуют.
      return { body: 'earth', from: 'sun', radii: 3 };
    default:
      return { body: 'saturn', from: 'earth', radii: 4.2 };
  }
}

/* ── Парад планет ─────────────────────────────────────────────────────────── */

/**
 * Вечернее небо или утреннее.
 *
 * Долгота растёт к востоку, а восточнее Солнца тело заходит позже него - и
 * значит, видно вечером. Если Солнце попало внутрь дуги, планеты стоят по обе
 * стороны от него, и ни одно из двух слов не будет правдой: тогда так и
 * сказано, потому что разом такой парад не увидеть.
 *
 * Величина проверяемая, поэтому и сказана: без неё строка сообщала бы, что
 * парад будет, но не когда на него смотреть.
 */
function skyOf(event: AstronomicalEvent): ParadeSky {
  const sun = geocentricLongitude('sun', event.jd);
  const sides = event.bodies.map(
    (id) => (((geocentricLongitude(id, event.jd) - sun + 540) % 360) - 180),
  );

  if (sides.every((side) => side > 0)) return 'evening';
  if (sides.every((side) => side < 0)) return 'morning';
  return 'both';
}

/**
 * Откуда смотреть на парад.
 *
 * Единственное событие, на которое нельзя смотреть «на тело»: парад - явление
 * земного неба, и наблюдать его надо не на Землю, а с Земли наружу. Камера
 * встаёт рядом с Землёй, сдвинувшись в сторону дуги, и смотрит вдоль неё:
 * Земля остаётся за спиной, а планеты - в кадре, каждая со своей подписью.
 *
 * Сдвиг - двадцать земных радиусов. Против ста миллионов километров до ближней
 * планеты это ничто, и направление от такого сдвига не меняется; нужен он
 * только затем, чтобы Земля не закрывала половину кадра.
 */
const PARADE_STANDOFF_RADII = 20;
const EARTH_RADIUS_KM = 6378.137;

function paradeView(event: AstronomicalEvent): FreeView {
  const earth = heliocentric('earth', event.jd);

  // Середина дуги: сумма единичных направлений на участников. У тесной группы
  // она и есть её середина, а считать биссектрису по краям дуги значило бы
  // выбирать, какой край первый.
  const middle = { x: 0, y: 0, z: 0 };
  for (const id of event.bodies) {
    const v = towards('earth', id, event.jd);
    const length = Math.hypot(v.x, v.y, v.z) || 1;
    middle.x += v.x / length;
    middle.y += v.y / length;
    middle.z += v.z / length;
  }

  const length = Math.hypot(middle.x, middle.y, middle.z) || 1;
  const direction = { x: middle.x / length, y: middle.y / length, z: middle.z / length };
  const standoff = PARADE_STANDOFF_RADII * EARTH_RADIUS_KM;

  // Оси сцены из эклиптических - тот же перевод, что у всей сцены.
  const forward = { x: direction.x, y: direction.z, z: -direction.y };
  const position: [number, number, number] = [
    earth.x + forward.x * standoff,
    earth.z + forward.y * standoff,
    -earth.y + forward.z * standoff,
  ];

  /*
   * Углы взгляда из направления.
   *
   * Сцена читает их порядком YXZ и смотрит вдоль −z, то есть направление
   * получается как (−sin yaw · cos pitch, sin pitch, −cos yaw · cos pitch).
   * Здесь эти три равенства просто обращены. Проверка на совпадение с тем, как
   * их читает main.ts, живёт в тестах и разворачивает углы обратно.
   */
  return {
    kind: 'free',
    position,
    yaw: Math.atan2(-forward.x, -forward.z) * RAD,
    pitch: Math.asin(Math.max(-1, Math.min(1, forward.y))) * RAD,
  };
}

/** Скорость времени: у затмения реальная, у медленных явлений - сутки в секунду. */
function timeScaleOf(kind: AstronomicalEvent['kind']): number {
  return kind === 'solar-eclipse' || kind === 'lunar-eclipse' || kind === 'transit'
    ? 1 / 86_400
    : 1;
}

/**
 * Остановить ли время на событии.
 *
 * Затмение - процесс, и смотреть на него надо идущим. Парад - положение: за
 * те же секунды, что тень пробегает Землю, он не меняется вовсе, зато при
 * сутках в секунду расходится на глазах, и человек видит уже не то, что было
 * обещано в строке.
 */
function pausedOn(kind: AstronomicalEvent['kind']): boolean {
  return kind === 'planet-parade';
}

function titleOf(event: AstronomicalEvent): string {
  const phase = event.phase ? PHASE_NAMES[event.phase] : undefined;

  switch (event.kind) {
    case 'solar-eclipse':
      return `${phase ?? 'Солнечное'} солнечное затмение`;
    case 'lunar-eclipse':
      return `${phase ?? 'Лунное'} лунное затмение`;
    case 'opposition':
      return `Противостояние ${genitive(event.bodies[0] ?? '')}`;
    case 'transit':
      return `${nameOf(event.bodies[0] ?? '')} проходит по диску Солнца`;
    case 'conjunction':
      return `Сближение: ${nameOf(event.bodies[0] ?? '')} и ${nameOf(event.bodies[1] ?? '')}`;
    case 'planet-parade':
      return `Парад планет: ${PARADE_COUNTS[event.bodies.length] ?? 'несколько сразу'}`;
    case 'ring-plane-crossing':
      return 'Кольца Сатурна с ребра';
    default:
      return 'Кольца Сатурна раскрыты на максимум';
  }
}

/**
 * Родительный падеж названия планеты.
 *
 * Склонять по правилам незачем: планет девять, все известны заранее, и таблица
 * из девяти строк честнее любого разбора окончаний. Английская локализация,
 * когда до неё дойдёт, эту таблицу просто заменит своей.
 */
const GENITIVE: Record<string, string> = {
  mercury: 'Меркурия',
  venus: 'Венеры',
  earth: 'Земли',
  mars: 'Марса',
  jupiter: 'Юпитера',
  saturn: 'Сатурна',
  uranus: 'Урана',
  neptune: 'Нептуна',
  pluto: 'Плутона',
};

function genitive(id: string): string {
  return GENITIVE[id] ?? nameOf(id);
}

function hintOf(event: AstronomicalEvent): string {
  switch (event.kind) {
    case 'solar-eclipse':
      return event.value < 1
        ? `Ось тени проходит в ${(event.value).toFixed(2)} радиуса от центра Земли`
        : 'Полутень задевает Землю краем: полного затмения не будет нигде';
    case 'lunar-eclipse':
      return event.phase === 'penumbral'
        ? 'Луна идёт только сквозь полутень: потемнение едва заметно'
        : 'Луна входит в земную тень и становится медно-красной';
    case 'opposition':
      return `Планета напротив Солнца, до неё ${event.value.toFixed(2)} а.е.`;
    case 'transit':
      return 'Планета видна на солнечном диске чёрной точкой';
    case 'conjunction':
      return `Между ними ${event.value < 1 ? `${(event.value * 60).toFixed(0)}′` : `${event.value.toFixed(1)}°`}`;
    case 'planet-parade':
      return `${listNames(event.bodies)} в дуге ${event.value.toFixed(0)}° ${skyOf(event)}`;
    case 'ring-plane-crossing':
      return 'Земля переходит на другую сторону колец, и они пропадают из виду';
    default:
      return `Кольца раскрыты к Солнцу на ${event.value.toFixed(1)}° и освещены сильнее всего`;
  }
}

/** Событие как строка списка и как готовое состояние сцены. */
export function describeEvent(event: AstronomicalEvent): EventRow {
  const { body, from, radii } = viewpointOf(event);
  // У парада вид свободный: камера смотрит с Земли наружу, а не на тело.
  const view: BodyView | FreeView =
    event.kind === 'planet-parade'
      ? paradeView(event)
      : { kind: 'body', body, radii, ...anglesFromEcliptic(towards(body, from, event.jd)) };

  return {
    id: `${event.kind}-${dateFromJulianDay(event.jd).toISOString().slice(0, 13)}`,
    title: titleOf(event),
    hint: hintOf(event),
    jd: event.jd,
    date: dateFromJulianDay(event.jd),
    body,
    state: {
      jd: event.jd,
      timeScale: timeScaleOf(event.kind),
      paused: pausedOn(event.kind),
      view,
    },
  };
}

/**
 * Ближайшие события начиная с заданного момента.
 *
 * Считается около четверти секунды на пять лет вперёд, поэтому список берётся
 * один раз - когда его впервые открыли, - и держится, пока дата сцены не ушла
 * за его край. Считать это каждый кадр было бы нечем оправдать: события не
 * меняются от того, что камера повернулась.
 */
export function upcomingEvents(fromJd: number, years = EVENT_WINDOW_YEARS): EventRow[] {
  return findEvents(fromJd, fromJd + DAYS_PER_YEAR * years).map(describeEvent);
}
