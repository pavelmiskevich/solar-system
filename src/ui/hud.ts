import { AU } from '../core/units';

/** Скорость света, км/с — ориентир для показаний скорости. */
const C = 299_792.458;

const DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export interface HudData {
  fps: number;
  speedKmS: number;
  distanceToSunKm: number;
  date: Date;
  timeScale: string;
  nearestBody: string;
  nearestDistanceKm: number;
  /** Тело, в системе отсчёта которого камера; null — гелиоцентрическая. */
  frame: string | null;
  /** Во сколько раз раздуты размеры тел. Единица — настоящие. */
  sizeExaggeration: number;
}

const ROWS = [
  'дата',
  'время',
  'до Солнца',
  'ближайшее',
  'отсчёт',
  'размеры',
  'скорость',
  'кадры',
] as const;

/**
 * Строки HUD собираются один раз, дальше меняется только текст значений.
 * Пересборка разметки каждый кадр стоила бы разбора HTML и лишнего layout
 * шестьдесят раз в секунду — за такое платить нечем.
 */
export class Hud {
  private readonly values: HTMLElement[] = [];

  constructor(element: HTMLElement) {
    element.textContent = '';
    for (const label of ROWS) {
      const key = document.createElement('span');
      key.textContent = label.padEnd(10, ' ');

      const value = document.createElement('b');
      value.textContent = '—';

      element.append(key, value, document.createTextNode('\n'));
      this.values.push(value);
    }
  }

  update(data: HudData): void {
    this.set(0, DATE_FORMAT.format(data.date));
    this.set(1, data.timeScale);
    this.set(2, formatDistance(data.distanceToSunKm));
    this.set(3, `${data.nearestBody}, ${formatDistance(data.nearestDistanceKm)}`);
    // Гелиоцентрическая система — состояние по умолчанию, и называть её честнее так,
    // чем прочерком: камера всё равно всегда в чьёй-то системе отсчёта.
    this.set(4, data.frame ?? 'Солнце');
    this.set(5, data.sizeExaggeration === 1 ? 'настоящие' : `×${data.sizeExaggeration}`);
    this.set(6, formatSpeed(data.speedKmS));
    this.set(7, `${data.fps.toFixed(0)} fps`);
  }

  private set(index: number, text: string): void {
    const node = this.values[index];
    if (node && node.textContent !== text) node.textContent = text;
  }
}

export function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} м`;
  if (km < 1e6) return `${km.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} км`;
  return `${(km / AU).toFixed(km / AU < 10 ? 3 : 2)} а.е.`;
}

export function formatSpeed(kmS: number): string {
  if (kmS < 1) return `${(kmS * 1000).toFixed(0)} м/с`;
  if (kmS < C * 0.01) return `${kmS.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} км/с`;
  return `${(kmS / C).toFixed(kmS / C < 10 ? 2 : 0)} c`;
}
