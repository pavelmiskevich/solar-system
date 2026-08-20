/** Сколько кнопка держит подтверждение «Снимок ✓», миллисекунды. */
const CONFIRM_TIME = 1400;

/**
 * Сколько живёт ссылка на файл после нажатия, миллисекунды.
 *
 * Освобождать её сразу после `click` нельзя: браузер начинает читать блоб уже
 * после возврата из обработчика, и отобранная ссылка обрывает скачивание на
 * пустом файле. Минуты хватит любому диску, а держится всё это время один
 * кадр в памяти вкладки.
 */
const LINK_LIFETIME = 60_000;

const LABEL = 'Снимок ⤓';
const DONE_LABEL = 'Снимок ✓';

/**
 * Имя файла снимка — по модельной дате кадра, а не по системным часам.
 *
 * Снимок ценен тем, что на нём: положение планет однозначно задаётся датой
 * сцены. Часы зрителя об этом не говорят ничего — сцена может стоять на 2032
 * годе, пока он смотрит на неё в 2026-м.
 */
export function snapshotFileName(date: Date): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  const year = pad(date.getUTCFullYear(), 4);
  const day = `${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;

  return `solar-system-${year}-${day}-${time}.png`;
}

/**
 * Сохранить содержимое холста файлом PNG.
 *
 * Звать это можно только сразу после отрисовки кадра и в том же заходе
 * кадрового цикла. Буфер WebGL заведён без `preserveDrawingBuffer` — он живёт
 * до вывода кадра на экран и очищается сразу после; из таймера или обработчика
 * события сюда пришёл бы уже пустой прямоугольник.
 */
export function saveCanvasPng(canvas: HTMLCanvasElement, fileName: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), LINK_LIFETIME);
  }, 'image/png');
}

/**
 * Кнопка снимка.
 *
 * Стоит в той же колонке и в том же виде, что экскурсия и справка. Нажатие
 * только просит снимок: сделать его можно лишь в кадровом цикле, сразу после
 * отрисовки, — поэтому кнопка ничего не снимает сама, а сцена подтверждает ей
 * сделанное вызовом `confirm`.
 */
export class SnapshotButton {
  private readonly button: HTMLButtonElement;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    container: HTMLElement,
    private readonly onTake: () => void,
  ) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'bodies-toggle';
    this.button.title = 'Снимок кадра в PNG (K)';
    this.button.textContent = LABEL;
    this.button.addEventListener('click', () => {
      this.onTake();
    });

    container.prepend(this.button);
  }

  /**
   * Показать, что снимок сделан.
   *
   * Окно загрузок видно не всегда — в Chrome оно свёрнуто в угол и на полном
   * экране не показывается вовсе. Без ответа кнопки нажатие выглядит
   * провалившимся, и его повторяют.
   */
  confirm(): void {
    this.button.textContent = DONE_LABEL;

    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.button.textContent = LABEL;
      this.timer = null;
    }, CONFIRM_TIME);
  }
}
