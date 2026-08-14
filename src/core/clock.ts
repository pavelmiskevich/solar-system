import { SECONDS_PER_DAY, dateFromJulianDay, julianDayFromDate } from './units';

/**
 * Симуляционное время.
 *
 * Кеплеровские орбиты — аналитическая функция времени, а не численное
 * интегрирование, поэтому фиксированный шаг симуляции здесь не нужен: позиции
 * можно честно вычислить на любой момент, в том числе прямо на время кадра.
 * Это заодно избавляет от интерполяции и от дрожания при просадке кадров.
 */
export class SimClock {
  /** Текущая юлианская дата. */
  jd: number;

  /** Сколько суток симуляции проходит за одну реальную секунду. */
  timeScale: number;

  paused = false;

  constructor(start: Date = new Date(), timeScale = 1) {
    this.jd = julianDayFromDate(start);
    this.timeScale = timeScale;
  }

  /** Продвинуть время на `dt` реальных секунд. */
  advance(dt: number): void {
    if (!this.paused) this.jd += dt * this.timeScale;
  }

  get date(): Date {
    return dateFromJulianDay(this.jd);
  }

  set date(value: Date) {
    this.jd = julianDayFromDate(value);
  }

  /** Человекочитаемая скорость течения времени. */
  describeScale(): string {
    return this.paused ? 'пауза' : describeTimeScale(this.timeScale);
  }
}

/**
 * Скорость течения времени словами.
 *
 * Единица выбирается по величине: секунды, минуты, часы, сутки, месяцы, годы.
 * Показывать «0.0007 сут/с» бессмысленно, а именно столько составляет реальное
 * время в сутках за секунду.
 */
export function describeTimeScale(daysPerSecond: number): string {
  if (daysPerSecond === 0) return 'остановлено';

  const seconds = daysPerSecond * SECONDS_PER_DAY;
  const absolute = Math.abs(seconds);

  if (absolute < 1.5) return 'реальное время';
  if (absolute < 60) return `${round(seconds)} с/с`;
  if (absolute < 3600) return `${round(seconds / 60)} мин/с`;
  if (absolute < SECONDS_PER_DAY) return `${round(seconds / 3600)} ч/с`;
  if (Math.abs(daysPerSecond) < 45) return `${round(daysPerSecond)} сут/с`;
  if (Math.abs(daysPerSecond) < 365) return `${round(daysPerSecond / 30.44)} мес/с`;

  const years = daysPerSecond / 365.25;
  return `${round(years)} ${yearWord(years)}/с`;
}

/** Год, года, лет: «1 лет/с» в интерфейсе выглядит как опечатка. */
function yearWord(years: number): string {
  const value = Math.abs(years);
  if (!Number.isInteger(value)) return 'лет';

  const last = value % 10;
  const lastTwo = value % 100;
  if (last === 1 && lastTwo !== 11) return 'год';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'года';
  return 'лет';
}

/** Дробная часть нужна только у мелких значений: «1.5 ч/с», но «30 сут/с». */
function round(value: number): string {
  const absolute = Math.abs(value);
  if (absolute < 10) return value.toFixed(absolute < 3 ? 1 : 0).replace(/\.0$/, '');
  return value.toFixed(0);
}

/**
 * Шкала времени: реальное время → 20 лет в секунду, в сутках за секунду.
 *
 * Ступени идут примерно в три-шесть раз, и внизу шкала намеренно частая. При
 * сутках в секунду Юпитер делает два с половиной оборота за секунду реального
 * времени — вращение при этом не разглядеть, оно превращается в мельтешение.
 * Чтобы увидеть, как планета поворачивается, нужны минуты в секунду, а чтобы
 * увидеть движение по орбите — недели. Одной ступенью эти два режима не
 * обслужить, поэтому их между собой шесть.
 */
export const TIME_SCALES = [
  1 / SECONDS_PER_DAY,        // реальное время
  10 / SECONDS_PER_DAY,       // 10 секунд в секунду
  60 / SECONDS_PER_DAY,       // минута
  (5 * 60) / SECONDS_PER_DAY, // 5 минут
  (20 * 60) / SECONDS_PER_DAY,
  1 / 24,                     // час
  1 / 4,                      // 6 часов
  1,                          // сутки
  7,
  30.44,
  91.3,
  365.25,
  365.25 * 5,
  365.25 * 20,
] as const;

/**
 * С чего начинается сцена: сутки в секунду.
 *
 * Так система сразу живёт: Земля делает оборот вокруг оси за секунду, Луна
 * обходит её за полминуты, внутренние планеты заметно смещаются по орбитам за
 * время осмотра. Плата — вращение гигантов: Юпитер оборачивается за десять
 * часов, то есть при этом масштабе больше двух раз в секунду. Кому нужно
 * разглядеть его полосы, замедляет время клавишей «,» — на ступени «час в
 * секунду» оборот занимает десять секунд.
 */
export const DEFAULT_TIME_SCALE = 1;
