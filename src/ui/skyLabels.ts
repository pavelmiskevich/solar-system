import { Vector3, type PerspectiveCamera } from 'three';

import { CONSTELLATIONS, NAMED_STARS, figureVertices } from '../data/sky';
import { sphericalEquatorialToScene } from '../physics/frames';
import { SKY_RADIUS } from '../scene/starfield';
import { projectToScreen, type ScreenPoint } from './projection';

/**
 * Подписи неба: имена ярких звёзд и названия созвездий.
 *
 * Отдельный слой, а не часть подписей тел, и дело не в размере файла.
 * У подписи планеты есть расстояние, выноска к диску, щелчок с перелётом и
 * прореживание по угловому размеру — всё это про тело, до которого можно
 * долететь. Звезда же неподвижна, бесконечно далека и никуда не ведёт:
 * ей нужно только имя в нужной точке кадра. Общий слой пришлось бы половину
 * времени уговаривать не делать ничего из того, что он умеет.
 */

/** Скорость проявления и угасания подписи. Та же, что у подписей тел. */
const FADE_RATE = 6;

/** Насколько далеко за краем кадра подпись ещё считается уместной, пиксели. */
const MARGIN_PX = 24;

interface Entry {
  readonly element: HTMLElement;
  /** Точка сцены, в которой стоит подпись: направление на сфере неба. */
  readonly position: Vector3;
  /** Куда подпись отведена от своей точки — см. OFFSETS. */
  readonly offset: string;
  alpha: number;
  lastTransform: string;
}

/**
 * Отвод подписи от её точки.
 *
 * Имя звезды стоит справа от неё, а не поверх: подпись, положенная на звезду,
 * закрывает ровно то, что подписывает. Название созвездия отведено вниз от
 * середины фигуры — а середина фигуры обычно занята: у Ориона там Альнилам,
 * и два текста ложились друг на друга.
 */
const OFFSETS = {
  star: 'translate(10px, -50%)',
  figure: 'translate(-50%, 20px)',
};

export class SkyLabels {
  private readonly entries: Entry[] = [];
  private readonly point: ScreenPoint = { x: 0, y: 0, depth: 0 };
  private enabled = false;

  constructor(container: HTMLElement) {
    const direction = new Vector3();

    for (const star of NAMED_STARS) {
      sphericalEquatorialToScene(star.ra, star.dec, direction);
      this.entries.push(this.create(container, 'sky-label', star.name, direction, OFFSETS.star));
    }

    for (const figure of CONSTELLATIONS) {
      // Название стоит в середине фигуры: у созвездия нет одной главной
      // звезды, к которой его можно было бы привязать, — есть рисунок целиком.
      const centre = new Vector3();
      const vertex = new Vector3();
      for (const [ra, dec] of figureVertices(figure)) {
        centre.add(sphericalEquatorialToScene(ra, dec, vertex));
      }
      centre.normalize();

      this.entries.push(
        this.create(container, 'sky-label figure', figure.name, centre, OFFSETS.figure),
      );
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * @param widthPx ширина кадра в CSS-пикселях
   * @param heightPx высота кадра в CSS-пикселях
   */
  update(camera: PerspectiveCamera, widthPx: number, heightPx: number, dt: number): void {
    for (const entry of this.entries) {
      const onScreen =
        this.enabled &&
        projectToScreen(entry.position, camera, widthPx, heightPx, this.point) &&
        this.point.x > -MARGIN_PX &&
        this.point.x < widthPx + MARGIN_PX &&
        this.point.y > -MARGIN_PX &&
        this.point.y < heightPx + MARGIN_PX;

      this.fade(entry, onScreen ? 1 : 0, dt);
      if (onScreen && entry.alpha > 0.01) this.place(entry);
    }
  }

  private create(
    container: HTMLElement,
    className: string,
    text: string,
    direction: Vector3,
    offset: string,
  ): Entry {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text;
    element.style.opacity = '0';
    element.style.visibility = 'hidden';
    container.appendChild(element);

    return {
      element,
      // Звёзды на сфере неба: направление, растянутое до её радиуса. Сама
      // сфера ездит вместе с камерой, а камера всегда в начале координат
      // сцены — поэтому точка постоянна и считается один раз.
      position: direction.clone().normalize().multiplyScalar(SKY_RADIUS),
      offset,
      alpha: 0,
      lastTransform: '',
    };
  }

  private place(entry: Entry): void {
    // Округление до пикселя: дробный сдвиг размывает текст субпиксельным
    // сглаживанием, и подпись начинает «дышать» при малейшем движении камеры.
    const transform = `translate3d(${Math.round(this.point.x)}px, ${Math.round(
      this.point.y,
    )}px, 0) ${entry.offset}`;
    if (transform !== entry.lastTransform) {
      entry.element.style.transform = transform;
      entry.lastTransform = transform;
    }
  }

  private fade(entry: Entry, target: number, dt: number): void {
    const k = Math.min(1, dt * FADE_RATE);
    const alpha = entry.alpha + (target - entry.alpha) * k;
    entry.alpha = Math.abs(alpha - target) < 0.005 ? target : alpha;

    const rounded = Math.round(entry.alpha * 100) / 100;
    if (entry.element.style.opacity === String(rounded)) return;

    entry.element.style.opacity = String(rounded);
    // Ноль убирает узел из отрисовки целиком: невидимый, но существующий
    // элемент продолжает участвовать в композиции слоёв браузера.
    entry.element.style.visibility = rounded <= 0 ? 'hidden' : 'visible';
  }
}
