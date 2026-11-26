import { strings } from '../i18n';
import { SECONDS_PER_DAY, dateFromJulianDay, julianDayFromDate } from './units';

/**
 * Годы, в которых живёт сцена, включительно.
 *
 * Элементы орбит экстраполируются линейно, и за этими пределами разговор о
 * положениях планет теряет смысл, а очень далеко они ломаются вовсе:
 * эксцентриситет уходит за единицу. Один диапазон на всё - часы, поле даты,
 * адрес страницы. Раньше адрес принимал только эти годы, а поле и течение
 * времени уводили дальше, и дата, которую удалось поставить, терялась при
 * перезагрузке.
 */
export const FIRST_YEAR = 1600;
export const LAST_YEAR = 2600;

/** Первый момент диапазона: начало первого года. */
export const EARLIEST_JD = julianDayFromDate(new Date(Date.UTC(FIRST_YEAR, 0, 1)));

/**
 * Последний момент диапазона: полдень последнего дня последнего года. Не
 * полночь: дата в адресе пишется с округлением, и запись в последнюю секунду
 * года могла бы выйти уже следующим годом.
 */
export const LATEST_JD = julianDayFromDate(new Date(Date.UTC(LAST_YEAR, 11, 31, 12)));

/** Насколько дата может разойтись с часами и ещё считаться «сейчас», мс. */
export const IN_STEP_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Подтягивание к часам после фоновой вкладки.
 *
 * Пока вкладка скрыта, кадров нет и время сцены стоит, а первый кадр после
 * возврата ограничен долей секунды. Сцена в реальном времени после этого шла
 * с отставанием на всё время, пока вкладка была скрыта, и HUD при этом писал
 * «реальное время». Решение задачи #201: часы, которые шли вровень с
 * настоящими, после возврата ставятся на «сейчас»; остальные не трогаются.
 *
 * Вровень или нет, решается в момент скрытия: после возврата отставание уже
 * набежало и любые часы выглядят отставшими.
 */
export class WallClockFollower {
  private wasInStep = false;

  constructor(private readonly clock: SimClock) {}

  /** Вкладку скрыли. */
  hidden(nowMs: number): void {
    this.wasInStep = this.clock.inStepWithWallClock(nowMs);
  }

  /** Вкладку вернули. Возвращает, подтянуты ли часы. */
  shown(nowMs: number): boolean {
    const follow = this.wasInStep;
    this.wasInStep = false;
    // Пока вкладка была скрыта, кадров не было, и поменять скорость или
    // дату было некому. Но проверка дешёвая и спасает от сюрприза, если
    // кадры в фоне всё-таки шли: часы, ушедшие с реального времени, не
    // подтягиваются.
    if (!follow || this.clock.paused || Math.abs(this.clock.timeScale * SECONDS_PER_DAY - 1) > 1e-6) {
      return false;
    }
    this.clock.date = new Date(nowMs);
    return true;
  }
}

/**
 * Симуляционное время.
 *
 * Кеплеровские орбиты - аналитическая функция времени, а не численное
 * интегрирование, поэтому фиксированный шаг симуляции здесь не нужен: позиции
 * можно честно вычислить на любой момент, в том числе прямо на время кадра.
 * Это заодно избавляет от интерполяции и от дрожания при просадке кадров.
 */
export class SimClock {
  private current = 0;

  /** Сколько суток симуляции проходит за одну реальную секунду. */
  timeScale: number;

  paused = false;

  constructor(start: Date = new Date(), timeScale = 1) {
    this.jd = julianDayFromDate(start);
    this.timeScale = timeScale;
  }

  /**
   * Текущая юлианская дата, всегда внутри диапазона сцены.
   *
   * Зажимается здесь, а не в поле даты: дату ставят и поле, и стрелки «год
   * назад, год вперёд», и ссылка, и само течение времени, и только часы видят
   * их все.
   */
  get jd(): number {
    return this.current;
  }

  set jd(value: number) {
    this.current = Math.min(LATEST_JD, Math.max(EARLIEST_JD, value));
  }

  /**
   * Часы стоят на краю диапазона. По этому HUD говорит, почему время встало:
   * дата, которая молча перестала меняться, выглядит как зависание.
   */
  get atEdge(): boolean {
    return this.paused && (this.current <= EARLIEST_JD || this.current >= LATEST_JD);
  }

  /**
   * Продвинуть время на `dt` реальных секунд.
   *
   * Дойдя до края диапазона, время встаёт на паузу. На верхней ступени, 20
   * лет в секунду, сцена доходит от сегодняшнего дня до 2600 года за
   * полминуты.
   */
  advance(dt: number): void {
    if (this.paused) return;
    const next = this.current + dt * this.timeScale;
    this.jd = next;
    if (next <= EARLIEST_JD || next >= LATEST_JD) this.paused = true;
  }

  /**
   * Часы идут вровень с настоящими: в реальном времени, без паузы, и дата не
   * дальше `IN_STEP_TOLERANCE_MS` от `nowMs`.
   *
   * Это сцена, открытая «сейчас»: без даты в ссылке или кнопкой «сейчас».
   * Ей пропуск времени в фоновой вкладке ломает смысл, и такие часы после
   * возврата подтягиваются (#201). Сцену, поставленную на другую дату, -
   * хотя бы на час раньше, - подтягивать нельзя: её дату выбрали нарочно.
   *
   * Допуск в минуты, а не в секунды: и в открытой вкладке шаг кадра
   * ограничен, и на медленной машине реальное время понемногу отстаёт.
   */
  inStepWithWallClock(nowMs: number): boolean {
    if (this.paused) return false;
    if (Math.abs(this.timeScale * SECONDS_PER_DAY - 1) > 1e-6) return false;
    return Math.abs(this.date.getTime() - nowMs) <= IN_STEP_TOLERANCE_MS;
  }

  get date(): Date {
    return dateFromJulianDay(this.jd);
  }

  set date(value: Date) {
    this.jd = julianDayFromDate(value);
  }

  /** Человекочитаемая скорость течения времени. */
  describeScale(): string {
    const words = strings().timeScale;
    if (this.atEdge) return words.atEdge(FIRST_YEAR, LAST_YEAR);
    return this.paused ? words.paused : describeTimeScale(this.timeScale);
  }

  /**
   * Шаг по лестнице скоростей.
   *
   * Ступень ищется по текущему значению, а не хранится отдельным счётчиком.
   * Счётчик пришлось бы держать снаружи и синхронизировать с `timeScale` при
   * каждом изменении со стороны - а расходятся такие пары молча.
   *
   * Значение вне лестницы (его может выставить отладочный доступ или будущий
   * ползунок) не ломает шаг: берётся ближайшая ступень.
   */
  stepScale(direction: -1 | 1): number {
    const current = this.nearestScaleIndex();
    const next = Math.min(TIME_SCALES.length - 1, Math.max(0, current + direction));
    this.timeScale = TIME_SCALES[next]!;
    return this.timeScale;
  }

  /** Номер ближайшей ступени лестницы - сравнение в логарифме. */
  private nearestScaleIndex(): number {
    // Лестница охватывает семь порядков, и «ближайшая» по разности означала бы
    // на её верхнем конце совсем не то, что на нижнем: между «сутки в секунду»
    // и «неделя в секунду» разница шесть суток, между реальным временем и
    // десятью секундами - ничтожные доли. В логарифме ступени равноудалены.
    const target = Math.log(Math.max(this.timeScale, Number.MIN_VALUE));

    let best = 0;
    let bestDistance = Infinity;

    for (let i = 0; i < TIME_SCALES.length; i += 1) {
      const distance = Math.abs(Math.log(TIME_SCALES[i]!) - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }

    return best;
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
  const words = strings().timeScale;
  if (daysPerSecond === 0) return words.stopped;

  const seconds = daysPerSecond * SECONDS_PER_DAY;
  const absolute = Math.abs(seconds);

  if (absolute < 1.5) return words.realTime;
  if (absolute < 60) return words.seconds(round(seconds));
  if (absolute < 3600) return words.minutes(round(seconds / 60));
  if (absolute < SECONDS_PER_DAY) return words.hours(round(seconds / 3600));
  if (Math.abs(daysPerSecond) < 45) return words.days(round(daysPerSecond));
  if (Math.abs(daysPerSecond) < 365) return words.months(round(daysPerSecond / 30.44));

  // Слово при числе - «год», «года», «лет» или «year», «years» - выбирает
  // словарь: правила числа у каждого языка свои.
  return words.years(round(daysPerSecond / 365.25));
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
 * времени - вращение при этом не разглядеть, оно превращается в мельтешение.
 * Чтобы увидеть, как планета поворачивается, нужны минуты в секунду, а чтобы
 * увидеть движение по орбите - недели. Одной ступенью эти два режима не
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
 * время осмотра. Плата - вращение гигантов: Юпитер оборачивается за десять
 * часов, то есть при этом масштабе больше двух раз в секунду. Кому нужно
 * разглядеть его полосы, замедляет время клавишей «,» - на ступени «час в
 * секунду» оборот занимает десять секунд.
 */
export const DEFAULT_TIME_SCALE = 1;
