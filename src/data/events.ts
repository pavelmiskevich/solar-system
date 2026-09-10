import { RAD, dateFromJulianDay } from '../core/units';
import type { BodyView, SceneState } from '../core/sceneState';
import { bodyById } from './bodies';
import type { AstronomicalEvent } from '../physics/events';
import { findEvents, heliocentric } from '../physics/events';

/**
 * События списком: как их назвать и куда за ними лететь.
 *
 * Поиск живёт в physics/events.ts и знает только числа: момент, участников и
 * меру. Здесь к ним прибавляется всё остальное - имя по-русски, строка о том,
 * на что смотреть, и готовое состояние сцены.
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
  /** Название: «Полное солнечное затмение». */
  title: string;
  /** Одна строка о том, на что смотреть. */
  hint: string;
  jd: number;
  date: Date;
  /** Тело, к которому летит камера. */
  body: string;
  state: SceneState & { view: BodyView };
}

const PHASE_NAMES: Record<string, string> = {
  total: 'Полное',
  annular: 'Кольцеобразное',
  partial: 'Частное',
  penumbral: 'Полутеневое',
};

/** Имя тела по-русски; неизвестное тело не должно ронять список. */
function nameOf(id: string): string {
  return bodyById(id)?.name ?? id;
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
    default:
      return { body: 'saturn', from: 'earth', radii: 4.2 };
  }
}

/** Скорость времени: у затмения реальная, у медленных явлений - сутки в секунду. */
function timeScaleOf(kind: AstronomicalEvent['kind']): number {
  return kind === 'solar-eclipse' || kind === 'lunar-eclipse' || kind === 'transit'
    ? 1 / 86_400
    : 1;
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
    case 'ring-plane-crossing':
      return 'Земля переходит на другую сторону колец, и они пропадают из виду';
    default:
      return `Кольца раскрыты к Солнцу на ${event.value.toFixed(1)}° и освещены сильнее всего`;
  }
}

/** Событие как строка списка и как готовое состояние сцены. */
export function describeEvent(event: AstronomicalEvent): EventRow {
  const { body, from, radii } = viewpointOf(event);
  const angles = anglesFromEcliptic(towards(body, from, event.jd));

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
      paused: false,
      view: { kind: 'body', body, radii, ...angles },
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
