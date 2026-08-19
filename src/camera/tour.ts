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

const WAIT_TIME = 8; // seconds

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

  cancel() {
    if (!this.active) return;
    this.active = false;
    this.setCaption(null);
  }

  update(dt: number) {
    if (!this.active) return;

    if (this.state === 'traveling') {
      if (!this.travel.isActive && this.orbit.isActive) {
        this.state = 'arrived';
        this.timer = 0;
        this.setCaption(TOUR_STOPS[this.step]!.caption);
      }
    } else if (this.state === 'arrived') {
      // 1000 - base viewport height for math
      if (this.orbit.isActive) {
        this.orbit.drag(dt * 150, 0, 1000);
      }
      
      this.timer += dt;
      if (this.timer >= WAIT_TIME) {
        this.step++;
        if (this.step >= TOUR_STOPS.length) {
          this.cancel();
          return;
        }
        
        this.state = 'traveling';
        this.setCaption(null);
        this.doTravelTo(TOUR_STOPS[this.step]!.id);
      }
    }
  }
}
