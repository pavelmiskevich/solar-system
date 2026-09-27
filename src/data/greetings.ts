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

export function avoidFromEarth(jd: number): Avoid {
  const earth = heliocentric('earth', jd);
  return {
    sun: towards(earth, { x: 0, y: 0, z: 0 }),
    others: GLARE.map((id) => towards(earth, heliocentric(id, jd))),
  };
}

let stars: BrightStar[] | null = null;

/**
 * Надпись поздравления на эту дату.
 *
 * @param targetWidth ширина надписи, радианы: по умолчанию 60°, на узком
 *   экране - сколько вмещает кадр, см. `fittingWidth`
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
