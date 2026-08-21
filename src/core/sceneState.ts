import { TIME_SCALES } from './clock';
import { dateFromJulianDay, julianDayFromDate } from './units';
import { bodyById } from '../data/bodies';

/**
 * Состояние сцены: тот кадр, которым делятся.
 *
 * Модуль не знает ни про адрес страницы, ни про интерфейс, ни про three.js —
 * только про то, из чего состоит вид: когда, откуда и на что смотрим. Так его
 * можно проверить целиком юнит-тестами, и так же он пригодится сценариям:
 * готовый вид — это те же поля, только записанные в коде, а не в ссылке.
 *
 * Разбор адреса намеренно снисходителен. Ссылку правят руками, к ней
 * приклеиваются чужие метки вроде `utm_source`, её обрезает мессенджер.
 * Испорченная часть выбрасывается поодиночке: лучше показать верную дату без
 * камеры, чем встретить человека пустой сценой и молчанием.
 */

/** Камера привязана к телу: расстояние в его радиусах и два угла вокруг него. */
export interface BodyView {
  kind: 'body';
  body: string;
  /** Расстояние до центра тела в его видимых радиусах. */
  radii: number;
  /** Азимут вокруг тела, градусы. */
  azimuth: number;
  /** Возвышение над плоскостью, градусы. */
  elevation: number;
}

/** Свободный полёт: привязки нет, поэтому положение мировое, а взгляд — углами. */
export interface FreeView {
  kind: 'free';
  /** Положение камеры в мировых координатах, км. */
  position: [number, number, number];
  /** Курс, градусы. */
  yaw: number;
  /** Тангаж, градусы. */
  pitch: number;
}

export interface SceneState {
  /** Юлианская дата сцены. */
  jd?: number;
  /** Сколько суток симуляции проходит за реальную секунду. */
  timeScale?: number;
  paused?: boolean;
  view?: BodyView | FreeView;
}

/** Ближе этого к центру тела камера не ставится: внутри планеты смотреть нечего. */
const MIN_RADII = 1.05;
const MAX_RADII = 1e6;

/** Дальше Солнечной системы состояние не восстанавливается, км. */
const MAX_DISTANCE = 1e11;

/**
 * Возвышение зажато у полюсов.
 *
 * На самом полюсе азимут теряет смысл — вокруг вертикали крутить нечего, — и
 * камера, пришедшая туда из ссылки, встала бы не так, как её ставили.
 */
const MAX_ELEVATION = 89;

/** Ниже 1600 и выше 2600 года разговор о положениях планет теряет смысл. */
const MIN_YEAR = 1600;
const MAX_YEAR = 2600;

const SLOWEST = TIME_SCALES[0]!;
const FASTEST = TIME_SCALES[TIME_SCALES.length - 1]!;

/** Состояние сцены строкой запроса — читаемой, а не упакованной. */
export function encodeSceneState(state: SceneState): string {
  const search = new URLSearchParams();

  if (state.jd !== undefined) search.set('d', isoFromJulianDay(state.jd));
  if (state.timeScale !== undefined) search.set('t', round(state.timeScale, 6));
  if (state.paused) search.set('p', '1');

  const { view } = state;

  if (view?.kind === 'body') {
    search.set('b', view.body);
    search.set('r', round(view.radii, 3));
    search.set('az', round(view.azimuth, 2));
    search.set('el', round(view.elevation, 2));
  } else if (view?.kind === 'free') {
    // Километры без дробной части: доли километра не переживают ни один
    // пересказ ссылки, а на межпланетных расстояниях ничего не значат.
    search.set('x', round(view.position[0], 1));
    search.set('y', round(view.position[1], 1));
    search.set('z', round(view.position[2], 1));
    search.set('yaw', round(view.yaw, 2));
    search.set('pitch', round(view.pitch, 2));
  }

  // Двоеточия в дате возвращаются на место: `URLSearchParams` заменяет их
  // на `%3A`, и ссылка перестаёт читаться глазами, ради чего всё и затеяно.
  // В строке запроса двоеточие законно, и адрес остаётся правильным.
  return search.toString().replace(/%3A/g, ':');
}

/** Разобрать строку запроса, выбрасывая всё, чему нельзя верить. */
export function decodeSceneState(search: string): SceneState {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const state: SceneState = {};

  const jd = julianDayFromIso(query.get('d'));
  if (jd !== null) state.jd = jd;

  const timeScale = number(query.get('t'));
  if (timeScale !== null && timeScale > 0) {
    state.timeScale = clamp(timeScale, SLOWEST, FASTEST);
  }

  if (query.get('p') === '1') state.paused = true;
  else if (query.get('p') === '0') state.paused = false;

  const view = decodeView(query);
  if (view) state.view = view;

  return state;
}

function decodeView(query: URLSearchParams): BodyView | FreeView | undefined {
  const body = query.get('b');

  // Привязка к телу важнее свободного полёта: тело в ссылке значит, что
  // человек показывал именно его, а не точку пространства.
  if (body !== null && (body === 'sun' || bodyById(body))) {
    return {
      kind: 'body',
      body,
      radii: clamp(number(query.get('r')) ?? 3.4, MIN_RADII, MAX_RADII),
      azimuth: wrapDegrees(number(query.get('az')) ?? 0),
      elevation: clamp(number(query.get('el')) ?? 0, -MAX_ELEVATION, MAX_ELEVATION),
    };
  }

  const x = number(query.get('x'));
  const y = number(query.get('y'));
  const z = number(query.get('z'));

  // Половина координат — не положение: такую камеру ставить некуда.
  if (x === null || y === null || z === null) return undefined;
  if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > MAX_DISTANCE) return undefined;

  return {
    kind: 'free',
    position: [x, y, z],
    yaw: wrapDegrees(number(query.get('yaw')) ?? 0),
    pitch: clamp(number(query.get('pitch')) ?? 0, -MAX_ELEVATION, MAX_ELEVATION),
  };
}

/** Дата сцены в виде, который читается в ссылке: `2032-06-01T12:00:00Z`. */
export function isoFromJulianDay(jd: number): string {
  return `${dateFromJulianDay(jd).toISOString().slice(0, 19)}Z`;
}

/** Обратный разбор: `null` вместо исключения — испорченная дата не должна ронять вид. */
export function julianDayFromIso(iso: string | null): number | null {
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  if (year < MIN_YEAR || year > MAX_YEAR) return null;

  return julianDayFromDate(date);
}

function number(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Углы приводятся к (−180, 180]: 400° и 40° — один и тот же поворот. */
function wrapDegrees(value: number): number {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/** Число без хвоста нулей: `3.400` в ссылке только мешает читать. */
function round(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)));
}
