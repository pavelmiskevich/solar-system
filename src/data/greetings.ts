import {
  SNAP_MAGNITUDE,
  layoutInscription,
  type Avoid,
  type BrightStar,
  type InscriptionLayout,
  type SkyPoint,
} from '../core/inscription';
import type { FreeView } from '../core/sceneState';
import { OBLIQUITY_J2000, RAD } from '../core/units';
import { heliocentric } from '../physics/events';
import { brightStars } from './stars';

/**
 * Поздравления надписью на небе.
 *
 * Пока их задаёт только владелец сайта, здесь, как готовые виды. Открыть
 * это посетителям - отдельное решение (#121): ссылка с надписью на нашем
 * адресе читается так, будто это говорит сам сайт.
 *
 * Поздравление - чистые данные, без кода. Так тот же объект можно будет
 * принять и из подписанной ссылки, не переделывая ничего вокруг.
 *
 * Тексты не переводятся: это слова автора, на его языке. `from` пишется
 * целиком, как подпись, - «от Павла», - склонять имя словарь не умеет и не
 * должен.
 */
export interface Greeting {
  /** Имя в ссылке: `?greeting=<id>`. */
  readonly id: string;
  /** Что написать звёздами: одно-два коротких слова. */
  readonly stars: string;
  /** Строка на плашке. */
  readonly title: string;
  /** Подпись на плашке. */
  readonly from?: string;
  /** Место на небе вручную, если выбранное само не понравилось. */
  readonly place?: { readonly raDeg: number; readonly decDeg: number };
}

/** Имя поздравления в ссылке: латиница, цифры и дефис. */
export const GREETING_ID = /^[a-z0-9-]{1,40}$/;

export const GREETINGS: readonly Greeting[] = [
  {
    // Образец и опора сквозных проверок: по нему видно, как пишется
    // поздравление, и проверки не зависят от чужих праздников.
    id: 'primer',
    stars: 'ПРИВЕТ',
    title: 'Так выглядит поздравление на небе',
    from: 'Солнечная система',
  },
];

export function greetingById(id: string): Greeting | undefined {
  return GREETINGS.find((greeting) => greeting.id === id);
}

/** Что засвечивает небо с Земли: Солнце, Луна и яркие планеты. */
const GLARE = ['moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];

type Ecl = { x: number; y: number; z: number };

function towards(from: Ecl, to: Ecl): SkyPoint {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const z = to.z - from.z;
  // Эклиптические - в экваториальные: поворот на наклон эклиптики.
  const c = Math.cos(OBLIQUITY_J2000);
  const s = Math.sin(OBLIQUITY_J2000);
  const ex = x;
  const ey = y * c - z * s;
  const ez = y * s + z * c;
  const ra = Math.atan2(ey, ex);
  return { ra: ra < 0 ? ra + 2 * Math.PI : ra, dec: Math.atan2(ez, Math.hypot(ex, ey)) };
}

/** Где тело на небе с Земли в этот момент. */
export function seenFromEarth(id: string, jd: number): SkyPoint {
  return towards(heliocentric('earth', jd), heliocentric(id, jd));
}

/** Начало суток по всемирному времени, в которые попадает момент. */
export function dayStart(jd: number): number {
  return Math.floor(jd - 0.5) + 0.5;
}

/**
 * Через сколько часов отмечается путь тел за сутки.
 *
 * Луна за сутки проходит 12-15°, за три часа - меньше двух. Вершина, которая
 * отстоит на 10° от каждой отметки, отстоит от пути между ними хотя бы на
 * 9.95°: отступ держится весь день.
 */
const PATH_STEP_HOURS = 3;

/**
 * Что засвечивает небо с Земли в течение суток, куда попадает момент.
 *
 * Засветка на сам момент открытия двигала место внутри дня: Луна за сутки
 * сдвигает свою запретную зону на 13°, и утром и вечером по одной ссылке
 * выходили места в десятках градусов друг от друга. Засветка на начало суток
 * держит место, но к вечеру Луна могла войти в буквы. Поэтому запретны все
 * точки пути Луны и планет за сутки: место одно на весь день и чисто весь
 * день. Расширить круг вокруг Луны на её суточный ход вышло бы втрое дороже
 * по площади неба, а звёзд в надписи путь не отнимает - на полугоде проб
 * настоящих вершин в среднем столько же.
 *
 * Солнце за сутки уходит на градус, при отступе в 45° это ничего не меняет:
 * оно берётся на начало суток.
 */
export function avoidFromEarth(jd: number): Avoid {
  const start = dayStart(jd);
  const others: SkyPoint[] = [];
  for (let hour = 0; hour <= 24; hour += PATH_STEP_HOURS) {
    for (const id of GLARE) others.push(seenFromEarth(id, start + hour / 24));
  }
  return { sun: seenFromEarth('sun', start), others };
}

let stars: BrightStar[] | null = null;

/**
 * Надпись поздравления на эту дату.
 *
 * @param targetWidth ширина надписи, радианы: по умолчанию 60°, на узком
 *   экране - сколько вмещает кадр, см. `fittingWidth`. Меняет только размер
 *   букв, место на небе от экрана не зависит.
 */
export function greetingLayout(greeting: Greeting, jd: number, targetWidth?: number): InscriptionLayout {
  stars ??= brightStars(SNAP_MAGNITUDE);
  const place = greeting.place
    ? { ra: greeting.place.raDeg / RAD, dec: greeting.place.decDeg / RAD }
    : undefined;
  return layoutInscription(greeting.stars, stars, avoidFromEarth(jd), place, targetWidth);
}

/**
 * Скорость времени, с которой открывается поздравление: реальная.
 *
 * Сцена открывается у Земли на сегодняшнюю дату, а при обычных сутках в
 * секунду за шесть секунд уходят два дня, и Земля уплывает из-за спины.
 * Останавливать время незачем: небо с надписью живёт, как настоящее.
 */
export const GREETING_TIME_SCALE = 1 / 86_400;

/** Камера отступает от Земли, чтобы та не закрывала полкадра, - как у парада. */
const STANDOFF_KM = 20 * 6378.137;

/** Встать у Земли и смотреть на надпись: углы по тем же правилам, что у `paradeView`. */
export function greetingView(centre: SkyPoint, jd: number): FreeView {
  const earth = heliocentric('earth', jd);
  const eq = [
    Math.cos(centre.dec) * Math.cos(centre.ra),
    Math.cos(centre.dec) * Math.sin(centre.ra),
    Math.sin(centre.dec),
  ] as const;
  const c = Math.cos(OBLIQUITY_J2000);
  const s = Math.sin(OBLIQUITY_J2000);
  const ecl = { x: eq[0], y: eq[1] * c + eq[2] * s, z: -eq[1] * s + eq[2] * c };
  const forward = { x: ecl.x, y: ecl.z, z: -ecl.y };

  return {
    kind: 'free',
    position: [
      earth.x + forward.x * STANDOFF_KM,
      earth.z + forward.y * STANDOFF_KM,
      -earth.y + forward.z * STANDOFF_KM,
    ],
    yaw: Math.atan2(-forward.x, -forward.z) * RAD,
    pitch: Math.asin(Math.max(-1, Math.min(1, forward.y))) * RAD,
  };
}
