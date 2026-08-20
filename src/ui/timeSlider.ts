import { TIME_SCALES } from '../core/clock';
import type { SimClock } from '../core/clock';

export class TimeSlider {
  private readonly input: HTMLInputElement;

  constructor(container: HTMLElement, private readonly clock: SimClock) {
    const wrapper = document.createElement('div');
    wrapper.className = 'time-slider-wrapper';

    this.input = document.createElement('input');
    this.input.type = 'range';
    this.input.min = '0';
    this.input.max = String(TIME_SCALES.length - 1);
    this.input.step = '1';
    
    // Set initial value based on clock
    const initialIndex = TIME_SCALES.indexOf(clock.timeScale as any);
    this.input.value = String(initialIndex >= 0 ? initialIndex : 7);

    this.input.addEventListener('input', () => {
      const index = parseInt(this.input.value, 10);
      this.clock.timeScale = TIME_SCALES[index]!;
    });

    const marks = document.createElement('div');
    marks.className = 'time-slider-marks';

    const labels = [
      { index: 0, text: 'реальное' },
      { index: 5, text: 'час/с' },
      { index: 7, text: 'сутки/с' },
      { index: 11, text: 'год/с' }
    ];

    for (const label of labels) {
      const mark = document.createElement('div');
      mark.className = 'time-slider-mark';
      mark.style.left = `${(label.index / (TIME_SCALES.length - 1)) * 100}%`;
      mark.textContent = label.text;
      marks.appendChild(mark);
    }

    wrapper.append(this.input, marks);
    container.appendChild(wrapper);
  }

  update() {
    // In case time scale was changed via keyboard
    const index = TIME_SCALES.indexOf(this.clock.timeScale as any);
    if (index >= 0) {
      this.input.value = String(index);
    }
  }
}
