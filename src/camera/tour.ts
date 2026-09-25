import type { OrbitControls } from './orbit';
import type { TravelController } from '../camera/travel';
import { onLanguageChange, strings, type Dictionary } from '../i18n';

/**
 * Маршрут экскурсии - от Солнца наружу.
 *
 * Здесь только опознаватели тел: рассказ у каждой остановки - слова, и лежит
 * в словаре интерфейса (src/i18n) под тем же опознавателем. Остановку без
 * рассказа tsc не пропустит: ключ маршрута обязан быть ключом словаря.
 */
type TourStop = keyof Dictionary['tour'];

const TOUR_STOPS: readonly TourStop[] = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'moon',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
];

function captionOf(stop: TourStop): string {
  return strings().tour[stop];
}

/** Сколько стоим у тела, разглядывая его, секунды. */
const WAIT_TIME = 8;

/**
 * Сколько ждём прибытия, прежде чем считать перелёт сорвавшимся, секунды.
 *
 * Перелёт длится самое большее семь секунд, так что двадцать - это не «долго
 * летим», а «не долетим уже никогда»: тело не нашлось по имени и перелёт не
 * начался, орбитальный режим отпустило на подлёте. Без этого срока экскурсия
 * молча зависала бы навсегда - без подписи, с кнопкой «Остановить» на экране.
 */
const TRAVEL_LIMIT = 20;

export class TourController {
  private active = false;
  private step = 0;
  private state: 'traveling' | 'arrived' = 'traveling';
  private timer = 0;

  constructor(
    private readonly travel: TravelController,
    private readonly orbit: OrbitControls,
    private readonly doTravelTo: (id: string) => void,
    private readonly setCaption: (text: string | null) => void,
  ) {
    // Рассказ на экране сменит язык вместе со всем интерфейсом: у остановки
    // он висит восемь секунд, и дочитывать его на прежнем языке незачем.
    onLanguageChange(() => {
      const stop = TOUR_STOPS[this.step];
      if (this.active && this.state === 'arrived' && stop) this.setCaption(captionOf(stop));
    });
  }

  get isActive() { return this.active; }

  start() {
    this.active = true;
    this.step = -1;
    this.state = 'arrived';
    this.timer = WAIT_TIME;
  }

  /**
   * Перевести экскурсию на следующую остановку, не досматривая текущую.
   *
   * С последней остановки идти вперёд некуда - экскурсия кончается так же,
   * как по исчерпании списка.
   */
  next() {
    if (!this.active) return;
    const step = this.step + 1;
    if (step >= TOUR_STOPS.length) {
      this.cancel();
      return;
    }
    this.goTo(step);
  }

  /**
   * Вернуть экскурсию на предыдущую остановку.
   *
   * С первой назад идти некуда: там ничего не происходит, и рассказ у первого
   * тела доигрывается своим чередом, а не начинается заново.
   */
  previous() {
    if (!this.active || this.step <= 0) return;
    this.goTo(this.step - 1);
  }

  cancel() {
    if (!this.active) return;
    this.active = false;
    // Незаконченный перелёт надо оборвать вместе с экскурсией. Иначе
    // прервавший её щелчок останавливает рассказ, а камера продолжает лететь
    // к следующей планете сама по себе - и это выглядит поломкой.
    //
    // Но только свой перелёт. Если зритель уже выбрал другое тело, перелёт
    // принадлежит ему, и отмена экскурсии, пришедшая следом, оставила бы его
    // посреди пустоты без того, что он выбрал.
    if (this.state === 'traveling' && this.travel.targetId === TOUR_STOPS[this.step]) {
      this.travel.cancel();
    }
    this.setCaption(null);
  }

  update(dt: number) {
    if (!this.active) return;

    if (this.state === 'traveling') {
      if (!this.travel.isActive && this.orbit.isActive) {
        this.state = 'arrived';
        this.timer = 0;
        this.setCaption(captionOf(TOUR_STOPS[this.step]!));
        return;
      }

      this.timer += dt;
      if (this.timer >= TRAVEL_LIMIT) this.cancel();
    } else if (this.state === 'arrived') {
      // Тело медленно поворачивается само, чтобы его осмотрели со всех
      // сторон. Высота кадра здесь взята постоянной, а не настоящей: скорость
      // рассказа не должна зависеть от того, какое у зрителя окно.
      if (this.orbit.isActive) this.orbit.drag(dt * 150, 0, 1000);

      this.timer += dt;
      // Досмотрели - дальше по маршруту тем же ходом, что и по стрелке.
      if (this.timer >= WAIT_TIME) this.next();
    }
  }

  /**
   * Отправиться к остановке под номером step.
   *
   * Недолетевший перелёт обрывается: иначе переход по стрелке оставил бы
   * камеру лететь к брошенной остановке, пока рассказ идёт уже о новой.
   */
  private goTo(step: number): void {
    if (this.state === 'traveling') this.travel.cancel();
    this.step = step;
    this.state = 'traveling';
    this.timer = 0;
    this.setCaption(null);
    this.doTravelTo(TOUR_STOPS[step]!);
  }
}
