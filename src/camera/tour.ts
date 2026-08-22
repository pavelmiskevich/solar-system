import type { OrbitControls } from './orbit';
import type { TravelController } from '../camera/travel';

export interface TourStop {
  id: string;
  caption: string;
}

const TOUR_STOPS: TourStop[] = [
  { id: 'sun', caption: 'Солнце — наша звезда. В нём сосредоточено 99.8% массы всей системы.' },
  { id: 'mercury', caption: 'Меркурий — самая маленькая и быстрая планета. Здесь нет атмосферы, а кратеры хранят вечную тень.' },
  { id: 'venus', caption: 'Венера — самое горячее место в системе. Плотные облака серной кислоты создают парниковый ад.' },
  { id: 'earth', caption: 'Земля — наш дом. Единственная известная планета с жидкой водой на поверхности и жизнью.' },
  { id: 'moon', caption: 'Луна — единственный естественный спутник Земли. Она всегда повёрнута к нам одной стороной.' },
  { id: 'mars', caption: 'Марс — холодная красная пустыня. Когда-то здесь текли реки и были огромные озёра.' },
  { id: 'jupiter', caption: 'Юпитер — крупнейший газовый гигант. В его атмосфере столетиями бушует Большое красное пятно.' },
  { id: 'saturn', caption: 'Сатурн — властелин колец, состоящих из мириад ледяных обломков.' },
  { id: 'uranus', caption: 'Уран — ледяной гигант. Он уникален тем, что вращается, лёжа на боку.' },
  { id: 'neptune', caption: 'Нептун — самая далёкая планета. Здесь дуют самые быстрые ветры в Солнечной системе.' },
  { id: 'pluto', caption: 'Плутон — карликовая планета на холодной окраине нашей системы, в поясе Койпера.' }
];

/** Сколько стоим у тела, разглядывая его, секунды. */
const WAIT_TIME = 8;

/**
 * Сколько ждём прибытия, прежде чем считать перелёт сорвавшимся, секунды.
 *
 * Перелёт длится самое большее семь секунд, так что двадцать — это не «долго
 * летим», а «не долетим уже никогда»: тело не нашлось по имени и перелёт не
 * начался, орбитальный режим отпустило на подлёте. Без этого срока экскурсия
 * молча зависала бы навсегда — без подписи, с кнопкой «Остановить» на экране.
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
  ) {}

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
   * С последней остановки идти вперёд некуда — экскурсия кончается так же,
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
    // к следующей планете сама по себе — и это выглядит поломкой.
    if (this.state === 'traveling') this.travel.cancel();
    this.setCaption(null);
  }

  update(dt: number) {
    if (!this.active) return;

    if (this.state === 'traveling') {
      if (!this.travel.isActive && this.orbit.isActive) {
        this.state = 'arrived';
        this.timer = 0;
        this.setCaption(TOUR_STOPS[this.step]!.caption);
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
      // Досмотрели — дальше по маршруту тем же ходом, что и по стрелке.
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
    this.doTravelTo(TOUR_STOPS[step]!.id);
  }
}
