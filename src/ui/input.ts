import type { PerspectiveCamera } from 'three';

import type { FlightControls } from '../camera/flight';
import type { OrbitControls } from '../camera/orbit';
import type { TravelController } from '../camera/travel';
import type { TourController } from '../camera/tour';
import type { SimClock } from '../core/clock';
import type { BodyList } from './bodyList';
import type { HelpPanel } from './help';
import type { LabelLayer } from './labels';
import { pickBody, type PickCandidate } from './picking';
import type { SupportPanel } from './support';

/**
 * Ввод: клавиатура и клики по кадру.
 *
 * Вынесено из места сборки сцены отдельным модулем не ради размера файла. У
 * ввода своя связность: почти каждое действие здесь трогает сразу несколько
 * подсистем — клавиша прерывает перелёт и снимает выделение в списке, клик
 * либо ведёт к телу, либо забирает мышь. Разбираться в этих связях удобнее,
 * когда они собраны вместе, а не перемежаются с кадровым циклом.
 *
 * Модуль ничем не владеет и состояния не держит: он переводит события в вызовы
 * тех, кто владеет. Всё, что он меняет, живёт в переданных объектах.
 */

/**
 * Клавиши, которыми пользователь берёт управление на себя. Любая из них
 * прерывает перелёт: если человек тронул рули, он больше не пассажир.
 */
const TAKEOVER_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyC',
  'Space',
  'ControlLeft',
  'Escape',
]);

export interface SceneInputOptions {
  /** Холст сцены: по нему приходят клики и от него берутся размеры кадра. */
  canvas: HTMLCanvasElement;
  camera: PerspectiveCamera;
  clock: SimClock;
  flight: FlightControls;
  travel: TravelController;
  tour: TourController;
  /** Орбитальный режим: протаскивание вращает, колесо приближает. */
  orbit: OrbitControls;
  labels: LabelLayer;
  bodyList: BodyList;
  help: HelpPanel;
  support: SupportPanel;
  /**
   * Тела, по которым можно попасть кликом. Достаточно минимального контракта
   * выбора: имя и цвет вводу не нужны, и требовать их значило бы привязывать
   * модуль к чужому типу без причины.
   */
  targets: readonly PickCandidate[];
  /** Начать перелёт к телу. */
  travelTo(id: string): void;
  /**
   * Переключить множитель размеров на следующий.
   *
   * Именно вызов наружу, а не смена числа здесь: вместе с размером тела
   * отодвигается камера, чтобы угловой размер в кадре сохранился, — а это уже
   * работа со сценой, не с вводом.
   */
  cycleSizePreset(): void;
  /** Подсказка внизу экрана; прячется, как только пользователь взял мышь. */
  hint?: HTMLElement | null;
}

export function bindSceneInput(options: SceneInputOptions): void {
  bindKeyboard(options);
  bindPointer(options);
}

function bindKeyboard(options: SceneInputOptions): void {
  const { clock, travel, tour, labels, bodyList, help, support, orbit } = options;

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;

    if (TAKEOVER_KEYS.has(event.code)) {
      if (tour.isActive) tour.cancel();
      if (travel.isActive) {
        travel.cancel();
        bodyList.setActive(null);
      }
      // Тронул рули — вышел из орбитального режима. Иначе камера сопротивлялась
      // бы движению: каждый кадр она возвращалась бы на свою окружность.
      orbit.release();
    }

    switch (event.code) {
      case 'KeyT':
        if (tour.isActive) {
          tour.cancel();
        } else {
          help.setOpen(false);
          support.setOpen(false);
          tour.start();
        }
        break;
      case 'KeyB':
        bodyList.toggle();
        break;
      case 'KeyH':
      case 'Slash':
        help.toggle();
        break;
      case 'Escape':
        help.setOpen(false);
        support.setOpen(false);
        if (tour.isActive) tour.cancel();
        break;
      case 'KeyP':
        clock.paused = !clock.paused;
        break;
      case 'Comma':
        clock.stepScale(-1);
        break;
      case 'Period':
        clock.stepScale(1);
        break;
      case 'KeyL':
        labels.setEnabled(!labels.isEnabled());
        break;
      case 'KeyM':
        options.cycleSizePreset();
        break;
      default:
        break;
    }
  });
}

/** Сдвиг курсора, начиная с которого нажатие считается протаскиванием, пиксели. */
const DRAG_THRESHOLD_PX = 4;

function bindPointer(options: SceneInputOptions): void {
  const { canvas, camera, flight, travel, tour, bodyList, targets, travelTo, hint, orbit } = options;

  // Подсказка по управлению уходит, как только пользователь взял мышь.
  canvas.addEventListener('click', () => hint?.classList.add('hidden'), { once: true });

  /*
   * Протаскивание вращает тело перед камерой.
   *
   * Порог в несколько пикселей отделяет протаскивание от клика: без него
   * дрожание руки при нажатии превращало бы каждый клик по телу в поворот на
   * долю градуса и отменяло бы перелёт. Клик после протаскивания подавляется —
   * иначе отпускание кнопки где-нибудь над Юпитером внезапно уводило бы к нему.
   */
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener('pointerdown', (event) => {
    if (tour.isActive) tour.cancel();
    
    // Захваченная мышь — это свободный полёт: там осмотр идёт движением мыши,
    // а не протаскиванием, и перехватывать его нечего.
    if (event.button !== 0 || flight.isLocked || !orbit.isActive) return;

    dragging = true;
    moved = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;

    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    moved += Math.abs(dx) + Math.abs(dy);
    if (moved < DRAG_THRESHOLD_PX) return;

    orbit.drag(dx, dy, canvas.clientHeight);
  });

  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // Колесо в орбитальном режиме приближает и отдаляет; в свободном полёте оно
  // по-прежнему подстраивает скорость — там приближать нечего.
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (tour.isActive) tour.cancel();
      if (orbit.isActive && !flight.isLocked) orbit.zoom(event.deltaY);
    },
    { passive: true },
  );

  /*
   * Клик по кадру.
   *
   * Смысл клика зависит от того, захвачена ли мышь. Захвачена — курсора нет, и
   * выбор идёт по прицелу в центре кадра. Не захвачена — по самому курсору.
   * Попали в тело — летим к нему; попали в пустоту — берём мышь и смотрим сами.
   */
  canvas.addEventListener('click', (event) => {
    if (tour.isActive) tour.cancel();
    
    // Клик, оказавшийся концом протаскивания, не считается кликом.
    if (moved >= DRAG_THRESHOLD_PX) {
      moved = 0;
      return;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    let x = width / 2;
    let y = height / 2;
    if (!flight.isLocked) {
      const rect = canvas.getBoundingClientRect();
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
    }

    const hit = pickBody(x, y, targets, camera, width, height);
    if (hit) {
      travelTo(hit.candidate.id);
      return;
    }

    if (travel.isActive) {
      travel.cancel();
      bodyList.setActive(null);
      return;
    }

    flight.requestLook();
  });

  // Прицел показывается только когда мышь захвачена: без захвата целятся курсором.
  document.addEventListener('pointerlockchange', () => {
    document.body.classList.toggle('locked', document.pointerLockElement !== null);
  });
}
