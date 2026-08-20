/**
 * Единицы расстояния в интерфейсе.
 *
 * «Восемь световых минут до Солнца» объясняет масштаб лучше, чем «149 597 871
 * километр»: первое можно представить, второе — только прочитать. Но обратное
 * тоже верно, и до Луны световые секунды говорят меньше, чем километры.
 * Поэтому единицы не выбраны раз и навсегда, а переключаются щелчком по любому
 * расстоянию в HUD или в карточке тела.
 *
 * Состояние здесь одно на весь интерфейс, а не своё у каждого места. Иначе
 * HUD показывал бы астрономические единицы, карточка — километры, и сравнить
 * одно с другим было бы нельзя.
 */

import { AU } from '../core/units';
import { superscript } from './superscript';

/** Скорость света, км/с. */
const C = 299_792.458;

const LIGHT_SECOND = C;
const LIGHT_MINUTE = C * 60;

export type DistanceUnit = 'auto' | 'km' | 'au' | 'light';

/**
 * Порядок обхода. «Авто» первым, потому что это состояние по умолчанию:
 * оно подбирает единицу под величину и в большинстве мест право.
 */
const ORDER: readonly DistanceUnit[] = ['auto', 'km', 'au', 'light'];

/** Как называется текущий выбор — для подсказки на наведении. */
export const UNIT_NAMES: Readonly<Record<DistanceUnit, string>> = {
  auto: 'по величине',
  km: 'километры',
  au: 'астрономические единицы',
  light: 'световые минуты',
};

let current: DistanceUnit = 'auto';
const listeners = new Set<() => void>();

export function distanceUnit(): DistanceUnit {
  return current;
}

/** Следующая единица по кругу. Возвращает ту, что стала текущей. */
export function cycleDistanceUnit(): DistanceUnit {
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!;
  setDistanceUnit(next);
  return next;
}

export function setDistanceUnit(unit: DistanceUnit): void {
  if (unit === current) return;
  current = unit;
  for (const listener of listeners) listener();
}

/**
 * Подписка на смену единиц.
 *
 * Нужна не всем: HUD и карточка перерисовывают расстояния сами по нескольку
 * раз в секунду. А вот список тел и подписи держат последнее показанное
 * значение и трогают вёрстку, только когда оно изменилось, — им нужно сказать,
 * что показанное устарело, иначе новые единицы появлялись бы там с задержкой
 * в секунду, а у неподвижного тела не появлялись бы вовсе.
 */
export function onDistanceUnitChange(listener: () => void): void {
  listeners.add(listener);
}

/** Расстояние в текущих единицах. */
export function formatDistance(km: number): string {
  return formatDistanceIn(km, current);
}

export function formatDistanceIn(km: number, unit: DistanceUnit): string {
  switch (unit) {
    case 'km':
      return `${round(km)} км`;

    case 'au':
      return `${au(km)} а.е.`;

    case 'light':
      // Ближе светового радиуса минуты — в секундах: до Луны 1.28 световой
      // секунды, и это как раз тот ориентир, ради которого сюда и смотрят.
      // В минутах то же расстояние — 0.02, число ни о чём.
      return km < LIGHT_MINUTE
        ? `${(km / LIGHT_SECOND).toFixed(2)} св. с`
        : `${(km / LIGHT_MINUTE).toFixed(km / LIGHT_MINUTE < 10 ? 2 : 1)} св. мин`;

    default:
      // Прежнее поведение: единица подбирается под величину. Метры у
      // поверхности, километры внутри системы, астрономические — между планет.
      if (km < 1) return `${(km * 1000).toFixed(0)} м`;
      if (km < 1e6) return `${round(km)} км`;
      return `${au(km)} а.е.`;
  }
}

function round(km: number): string {
  return km < 1
    ? km.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
    : km.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

function au(km: number): string {
  const value = km / AU;

  // Внутри планетной системы астрономическая единица слишком велика: до Луны
  // это 0.000028, число, которое не читается. Показатель степени читается.
  if (value > 0 && value < 0.001) {
    const exponent = Math.floor(Math.log10(value));
    return `${(value / Math.pow(10, exponent)).toFixed(2)}·10${superscript(exponent)}`;
  }

  return value.toFixed(value < 10 ? 3 : 2);
}
