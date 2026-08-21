import { DEFAULT_TIME_SCALE, TIME_SCALES } from '../core/clock';
import type { SimClock } from '../core/clock';

/**
 * Ползунок скорости времени.
 *
 * Лестница скоростей та же, что у клавиш «,» и «.», и это важно: два органа
 * управления одним и тем же должны ходить по одним ступеням, иначе клавиша
 * увела бы ползунок в промежуточное положение, которого на шкале нет.
 *
 * Ползунок ходит по номерам ступеней, а не по самим скоростям: шкала
 * охватывает семь порядков, и равномерное движение по значению означало бы,
 * что весь левый край — от реального времени до часа в секунду — умещается в
 * одном пикселе.
 */

/** Подписи под шкалой: только опорные ступени, иначе строка превращается в частокол. */
const MARKS = [
  { index: 0, text: 'реальное' },
  { index: 5, text: 'час/с' },
  { index: 7, text: 'сутки/с' },
  { index: 11, text: 'год/с' },
];

/** Ступени как числа: сравнивать литеральный кортеж со значением часов нельзя. */
const SCALES: readonly number[] = TIME_SCALES;

export class TimeSlider {
  private readonly input: HTMLInputElement;

  constructor(
    container: HTMLElement,
    private readonly clock: SimClock,
  ) {
    const wrapper = document.createElement('div');
    wrapper.className = 'time-slider-wrapper';

    this.input = document.createElement('input');
    this.input.type = 'range';
    this.input.min = '0';
    this.input.max = String(SCALES.length - 1);
    this.input.step = '1';
    this.input.title = 'Скорость течения времени';
    this.input.value = String(indexOfScale(this.clock.timeScale));

    this.input.addEventListener('input', () => {
      const index = Number(this.input.value);
      this.clock.timeScale = SCALES[index] ?? DEFAULT_TIME_SCALE;
    });

    const marks = document.createElement('div');
    marks.className = 'time-slider-marks';

    for (const mark of MARKS) {
      const item = document.createElement('div');
      item.className = 'time-slider-mark';
      item.style.left = `${(mark.index / (SCALES.length - 1)) * 100}%`;
      item.textContent = mark.text;
      marks.appendChild(item);
    }

    wrapper.append(this.input, marks);
    container.appendChild(wrapper);
  }

  /** Показать скорость, выставленную мимо ползунка — клавишами или ссылкой. */
  update(): void {
    const index = String(indexOfScale(this.clock.timeScale));
    if (this.input.value !== index) this.input.value = index;
  }
}

/**
 * Номер ступени по скорости.
 *
 * Скорость может прийти со стороны — из адреса страницы или отладочного
 * доступа — и не совпасть ни с одной ступенью точно. Тогда берётся ближайшая
 * в логарифме: в разности «неделя в секунду» оказалась бы ближе к «году», чем
 * реальное время к десяти секундам, хотя на шкале всё наоборот.
 */
function indexOfScale(scale: number): number {
  const exact = SCALES.indexOf(scale);
  if (exact >= 0) return exact;

  const target = Math.log(Math.max(scale, Number.MIN_VALUE));
  let best = SCALES.indexOf(DEFAULT_TIME_SCALE);
  let bestDistance = Infinity;

  for (let i = 0; i < SCALES.length; i += 1) {
    const distance = Math.abs(Math.log(SCALES[i]!) - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }

  return best;
}
