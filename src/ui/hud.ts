import {
  bodyName,
  formatDateTime,
  formatInteger,
  onLanguageChange,
  strings,
  type Dictionary,
} from '../i18n';
import { cycleDistanceUnit, distanceUnit, formatDistance, unitName } from './distanceUnits';

/** Скорость света, км/с - ориентир для показаний скорости. */
const C = 299_792.458;

/*
 * Дата сцены - всемирным временем, как и всё остальное в ней (см.
 * `formatDateTime`).
 *
 * Часовой пояс зрителя здесь не при чём: эфемериды считаются в UTC, поле
 * ввода даты подписано UTC, ссылка на вид хранит UTC. Пока показания шли
 * местным временем, на одном экране стояли два времени, расходящиеся на
 * часовой пояс: поле обещало 12:00, HUD показывал 02:00. Разницу видно
 * не всем и не сразу - в Лондоне её нет вовсе, - а сверить их зрителю
 * нечем.
 */

export interface HudData {
  fps: number;
  speedKmS: number;
  distanceToSunKm: number;
  date: Date;
  timeScale: string;
  nearestBody: string;
  nearestDistanceKm: number;
  /** Тело, в системе отсчёта которого камера; null - гелиоцентрическая. */
  frame: string | null;
  /** Захваченное тело: камера держит его в центре кадра. null - захвата нет. */
  aim: string | null;
  /** Во сколько раз раздуты размеры тел. Единица - настоящие. */
  sizeExaggeration: number;
}

type RowKey = keyof Dictionary['hud']['rows'];

/** Строки сверху вниз; подписи к ним - в словаре. */
const ROWS: readonly RowKey[] = [
  'date',
  'time',
  'sun',
  'nearest',
  'frame',
  'aim',
  'size',
  'speed',
  'fps',
];

/** Строки, показывающие расстояние: щелчок по ним меняет единицы. */
const DISTANCE_ROWS: ReadonlySet<RowKey> = new Set(['sun']);

/**
 * Ширина колонки подписей, знаки.
 *
 * Плашка стоит в `white-space: pre`, и значения отбиваются от подписей
 * пробелами. Десяти знаков хватает самой длинной подписи на обоих языках -
 * «ближайшее» и «date, UTC».
 */
const LABEL_WIDTH = 10;

/**
 * Сделать показание расстояния переключателем единиц.
 *
 * Живёт здесь, а не заводится в каждом месте заново: расстояния показывают и
 * HUD, и карточка тела, и щелчок по любому из них должен делать одно и то же.
 */
export function makeUnitToggle(node: HTMLElement): void {
  node.classList.add('unit-toggle');
  node.tabIndex = 0;
  node.setAttribute('role', 'button');
  refreshTitle(node);
  onLanguageChange(() => refreshTitle(node));

  const toggle = () => {
    cycleDistanceUnit();
    refreshTitle(node);
  };

  node.addEventListener('click', (event) => {
    // Показание расстояния бывает внутри кнопки перелёта: щелчок по нему
    // меняет единицы и не должен вдобавок уносить камеру к телу.
    event.stopPropagation();
    toggle();
  });

  node.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    toggle();
  });
}

function refreshTitle(node: HTMLElement): void {
  node.title = strings().unitToggleTitle(unitName(distanceUnit()));
}

/**
 * Строки HUD собираются один раз, дальше меняется только текст значений.
 * Пересборка разметки каждый кадр стоила бы разбора HTML и лишнего layout
 * шестьдесят раз в секунду - за такое платить нечем.
 */
export class Hud {
  private readonly labels: HTMLElement[] = [];
  private readonly values: HTMLElement[] = [];

  /**
   * Расстояние до ближайшего тела - отдельным узлом внутри своей строки.
   *
   * В строке стоит «Сатурн, 144 643 км», и переключатель единиц - только
   * вторая половина. Будь строка одним узлом, пунктир под ней обещал бы, что
   * по названию тела тоже можно щёлкнуть, а по нему нельзя.
   */
  private readonly nearestDistance = document.createElement('span');

  constructor(element: HTMLElement) {
    element.textContent = '';
    for (const row of ROWS) {
      const key = document.createElement('span');

      const value = document.createElement('b');
      value.textContent = '-';
      if (DISTANCE_ROWS.has(row)) makeUnitToggle(value);
      if (row === 'nearest') {
        makeUnitToggle(this.nearestDistance);
        value.appendChild(this.nearestDistance);
      }

      element.append(key, value, document.createTextNode('\n'));
      this.labels.push(key);
      this.values.push(value);
    }

    // Значения переписываются каждый кадр и сменят язык сами, а подписи
    // написаны один раз - их надо переписать.
    this.writeLabels();
    onLanguageChange(() => this.writeLabels());
  }

  private writeLabels(): void {
    const names = strings().hud.rows;
    ROWS.forEach((row, index) => {
      const label = this.labels[index];
      if (label) label.textContent = names[row].padEnd(LABEL_WIDTH, ' ');
    });
  }

  update(data: HudData): void {
    this.set(0, formatDateTime(data.date));
    this.set(1, data.timeScale);
    this.set(2, formatDistance(data.distanceToSunKm));
    this.setNearest(data.nearestBody, formatDistance(data.nearestDistanceKm));
    // Гелиоцентрическая система - состояние по умолчанию, и называть её честнее так,
    // чем прочерком: камера всё равно всегда в чьёй-то системе отсчёта.
    this.set(4, data.frame ?? bodyName('sun'));
    // Прочерк здесь честнее слова: захвата либо нет вовсе, либо он на теле.
    this.set(5, data.aim ?? '-');
    this.set(
      6,
      data.sizeExaggeration === 1 ? strings().hud.trueSizes : `×${data.sizeExaggeration}`,
    );
    this.set(7, formatSpeed(data.speedKmS));
    this.set(8, `${data.fps.toFixed(0)} fps`);
  }

  /** Название тела - обычным текстом, расстояние - переключателем единиц. */
  private setNearest(name: string, distance: string): void {
    const node = this.values[3];
    if (!node) return;

    const prefix = `${name}, `;
    if (node.firstChild?.nodeType === Node.TEXT_NODE) {
      if (node.firstChild.textContent !== prefix) node.firstChild.textContent = prefix;
    } else {
      node.insertBefore(document.createTextNode(prefix), this.nearestDistance);
    }

    if (this.nearestDistance.textContent !== distance) {
      this.nearestDistance.textContent = distance;
    }
  }

  private set(index: number, text: string): void {
    const node = this.values[index];
    if (node && node.textContent !== text) node.textContent = text;
  }
}

export function formatSpeed(kmS: number): string {
  const units = strings().units;
  if (kmS < 1) return `${(kmS * 1000).toFixed(0)} ${units.metersPerSecond}`;
  if (kmS < C * 0.01) return `${formatInteger(kmS)} ${units.kmPerSecond}`;
  return `${(kmS / C).toFixed(kmS / C < 10 ? 2 : 0)} c`;
}
