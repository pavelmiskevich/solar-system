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
import { TouchGestures } from './touchGestures';
import type { SupportPanel } from './support';

/**
 * Ввод: клавиатура и клики по кадру.
 *
 * Вынесено из места сборки сцены отдельным модулем не ради размера файла. У
 * ввода своя связность: почти каждое действие здесь трогает сразу несколько
 * подсистем - клавиша прерывает перелёт и снимает выделение в списке, клик
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
   * отодвигается камера, чтобы угловой размер в кадре сохранился, - а это уже
   * работа со сценой, не с вводом.
   */
  cycleSizePreset(): void;
  /** Показать или убрать разметку неба: линии созвездий и имена звёзд. */
  toggleSky(): void;
  /**
   * Захватить тело, на которое показывают, - или отпустить захваченное.
   *
   * Ввод передаёт только имя тела под прицелом или под курсором и `null`,
   * если там пусто. Чем заменить пустоту, знает сцена: ввод не ведает ни
   * системы отсчёта, ни того, что захвачено сейчас.
   */
  toggleAimLock(id: string | null): void;
  /**
   * Попросить снимок кадра.
   *
   * Снять его прямо здесь нельзя: буфер WebGL живёт до вывода кадра, и к
   * обработчику клавиши в нём уже пусто. Ввод только просит - снимает
   * кадровый цикл, сразу после отрисовки.
   */
  takeSnapshot(): void;
  /** Список готовых видов. */
  scenarios: { toggle(): void };
  /** Список ближайших астрономических событий. */
  events: { toggle(): void };
  /** Подсказка внизу экрана; прячется, как только пользователь взял мышь. */
  hint?: HTMLElement | null;
}

export function bindSceneInput(options: SceneInputOptions): void {
  bindKeyboard(options);
  bindPointer(options);
}

function bindKeyboard(options: SceneInputOptions): void {
  const { clock, travel, tour, labels, bodyList, help, support, orbit, flight } = options;

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;

    if (TAKEOVER_KEYS.has(event.code)) {
      if (tour.isActive) tour.cancel();
      if (travel.isActive) {
        travel.cancel();
        bodyList.setActive(null);
      }
      // Тронул рули - вышел из орбитального режима. Иначе камера сопротивлялась
      // бы движению: каждый кадр она возвращалась бы на свою окружность.
      orbit.release();
    }

    switch (event.code) {
      // Стрелки принадлежат экскурсии, пока она идёт: они переводят её на
      // соседнюю остановку, а не рулят камерой. Вне экскурсии заняты не они.
      case 'ArrowRight':
        if (tour.isActive) {
          event.preventDefault();
          tour.next();
        }
        break;
      case 'ArrowLeft':
        if (tour.isActive) {
          event.preventDefault();
          tour.previous();
        }
        break;
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
      case 'KeyV':
        options.scenarios.toggle();
        break;
      case 'KeyE':
        options.events.toggle();
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
      case 'KeyK':
        options.takeSnapshot();
        break;
      case 'KeyN':
        options.toggleSky();
        break;
      case 'KeyF':
        // Захватывается то, на что человек показывает: с захваченной мышью -
        // прицел в центре кадра, без неё - курсор, то есть подсвеченная
        // подпись. Ровно тот же выбор, каким отработал бы щелчок.
        options.toggleAimLock(flight.isLocked ? pickAtCrosshair(options) : labels.highlightedId);
        break;
      default:
        break;
    }
  });
}

/**
 * Тело под прицелом в центре кадра - или null, если там пусто.
 *
 * Нужно только захвату цели: у щелчка есть свои координаты, а у клавиши их
 * нет, и целиться ей больше нечем.
 */
function pickAtCrosshair(options: SceneInputOptions): string | null {
  const { canvas } = options;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const hit = pickBody(width / 2, height / 2, options.targets, options.camera, width, height);
  return hit?.candidate.id ?? null;
}

/** Сдвиг курсора, начиная с которого нажатие считается протаскиванием, пиксели. */
const DRAG_THRESHOLD_PX = 4;

/**
 * Сдвиг, начиная с которого протаскивание во время экскурсии считается
 * свайпом, пиксели.
 *
 * Порог большой нарочно: внутри него жест ещё не решён - экскурсия не
 * оборвана, но и остановка не сменена. Мелкое движение пальца при нажатии не
 * должно ни того, ни другого.
 */
const SWIPE_THRESHOLD_PX = 48;

function bindPointer(options: SceneInputOptions): void {
  const { canvas, camera, flight, travel, tour, bodyList, labels, targets, travelTo, hint, orbit } =
    options;

  // Подсказка по управлению уходит, как только пользователь взял мышь.
  canvas.addEventListener('click', () => hint?.classList.add('hidden'), { once: true });

  /*
   * Протаскивание вращает тело перед камерой.
   *
   * Порог в несколько пикселей отделяет протаскивание от клика: без него
   * дрожание руки при нажатии превращало бы каждый клик по телу в поворот на
   * долю градуса и отменяло бы перелёт. Клик после протаскивания подавляется -
   * иначе отпускание кнопки где-нибудь над Юпитером внезапно уводило бы к нему.
   */
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;

  /*
   * Протаскивание, начатое во время экскурсии, не решает свою судьбу сразу.
   *
   * Раньше любое нажатие по холсту обрывало экскурсию - теперь горизонтальное
   * движение переводит её на соседнюю остановку, а всё остальное обрывает
   * по-прежнему. Отличить одно от другого можно только по движению, поэтому
   * нажатие лишь запоминает точку, а решение принимается на первом же сдвиге
   * сверх порога (или на отпускании - тогда это был щелчок).
   */
  let swipeFrom: { x: number; y: number } | null = null;

  /*
   * Пальцем управляют иначе, чем мышью, и различает их не устройство, а само
   * событие: `pointerType` у каждого свой, и ноутбук с сенсорным экраном
   * слушается обоих.
   *
   * Разница в двух вещах. Осмотр: мышь для него захватывается, а палец
   * захватить нельзя - значит, протаскивание делает то, что в свободном полёте
   * делает захваченная мышь. И приближение: колеса на телефоне нет, вместо
   * него щипок.
   */
  const gestures = new TouchGestures({
    onDrag(dx, dy) {
      moved += Math.abs(dx) + Math.abs(dy);
      // У тела протаскивание поворачивает его перед камерой, в пустоте -
      // поворачивает взгляд. Жест один и тот же, и выбор между ними тот же,
      // что у колеса: есть тело, вокруг которого ходит камера, или нет.
      if (orbit.isActive) orbit.drag(dx, dy, canvas.clientHeight);
      else flight.lookBy(dx, dy);
    },
    onPinch(factor) {
      // Развели пальцы - приблизились: расстояние до тела уменьшается во
      // столько же раз, во сколько разошлись пальцы.
      moved += Math.abs(1 - factor) * canvas.clientHeight;
      orbit.zoomBy(1 / factor);
    },
  });

  /** Чем начат текущий жест: у касания и у мыши разные последствия щелчка. */
  let touchGesture = false;

  /**
   * Подсветка тела под курсором.
   *
   * Считается тем же выбором, что и щелчок, - иначе подсветилось бы одно, а
   * улетели бы к другому. Пока мышь захвачена, курсора нет и целятся прицелом
   * в центре кадра: подсвечивать там нечего, это делает сам прицел.
   */
  canvas.addEventListener('pointermove', (event) => {
    // Наведение пальцем не существует: палец или касается, или его нет. Будь
    // иначе, подсветка оставалась бы висеть на теле после касания по нему.
    if (flight.isLocked || event.pointerType === 'touch') {
      labels.setHighlighted(null);
      canvas.style.cursor = '';
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const hit = pickBody(
      event.clientX - rect.left,
      event.clientY - rect.top,
      targets,
      camera,
      canvas.clientWidth,
      canvas.clientHeight,
    );

    labels.setHighlighted(hit?.candidate.id ?? null);
    // Указатель - обещание, что здесь есть куда нажать. Обещание держится
    // ровно тем же выбором, каким отработает щелчок.
    canvas.style.cursor = hit ? 'pointer' : '';
  });

  // Курсор ушёл с холста - подсветке неоткуда взяться.
  canvas.addEventListener('pointerleave', () => {
    labels.setHighlighted(null);
    canvas.style.cursor = '';
  });

  canvas.addEventListener('pointerdown', (event) => {
    touchGesture = event.pointerType === 'touch';

    if (tour.isActive) {
      // Пока экскурсия идёт, судьба жеста решается по движению. Свайп нужен и
      // на перелёте между остановками, где орбитального режима ещё нет, -
      // поэтому проверка орбиты сюда не входит.
      if (event.button === 0 && !flight.isLocked) {
        swipeFrom = { x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      tour.cancel();
    }

    // Касания разбираются отдельно, ниже: у пальца своя цель - не только
    // холст, но и подписи над ним.
    if (event.pointerType === 'touch') return;

    // Захваченная мышь - это свободный полёт: там осмотр идёт движением мыши,
    // а не протаскиванием, и перехватывать его нечего.
    if (event.button !== 0 || flight.isLocked || !orbit.isActive) return;

    dragging = true;
    moved = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (swipeFrom) {
      const dx = event.clientX - swipeFrom.x;
      const dy = event.clientY - swipeFrom.y;

      // Горизонталь - перемотка: движение влево уводит к следующей
      // остановке, вправо - к предыдущей, как листают страницы. Жест на этом
      // истрачен: следующий шаг - следующим жестом.
      if (Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
        swipeFrom = null;
        moved = Math.abs(dx) + Math.abs(dy);
        if (dx < 0) tour.next();
        else tour.previous();
        return;
      }

      // Вертикаль - человек взялся осматривать сам: экскурсия обрывается, а
      // начатое движение подхватывается вращением, чтобы жест не пропал.
      if (Math.abs(dy) >= SWIPE_THRESHOLD_PX) {
        swipeFrom = null;
        tour.cancel();
        if (orbit.isActive) {
          dragging = true;
          moved = Math.abs(dx) + Math.abs(dy);
          lastX = event.clientX;
          lastY = event.clientY;
        }
      }

      return;
    }

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
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);


    // Жест кончился, так и не став свайпом, - значит это был щелчок по
    // холсту, а он экскурсию обрывает, как обрывал всегда.
    if (swipeFrom) {
      swipeFrom = null;
      tour.cancel();
    }

    dragging = false;
  };

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // Колесо в орбитальном режиме приближает и отдаляет; в свободном полёте оно
  // по-прежнему подстраивает скорость - там приближать нечего.
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
   * Смысл клика зависит от того, захвачена ли мышь. Захвачена - курсора нет, и
   * выбор идёт по прицелу в центре кадра. Не захвачена - по самому курсору.
   * Попали в тело - летим к нему; попали в пустоту - берём мышь и смотрим сами.
   */
  canvas.addEventListener('click', (event) => {
    if (tour.isActive) tour.cancel();

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

    // Захват мыши на сенсорном экране и невозможен, и вреден: захватывать
    // нечего, а захваченным полёт считал бы себя всерьёз - и перестал бы
    // слушаться пальца. Касание по пустому небу там не делает ничего: осмотр
    // и без него идёт протаскиванием.
    if (!touchGesture) flight.requestLook();
  });

  /*
   * Жесты пальцем слушает окно, а не холст.
   *
   * Палец попадает не только в холст: подписи тел лежат поверх него и ловят
   * касания сами - подпись это кнопка перелёта. На телефоне их в кадре
   * десяток, и жест, начавшийся на подписи, пропадал бы целиком; щипку хватило
   * бы и одного пальца на подписи, чтобы приближение не случилось вовсе.
   *
   * Поэтому сценой считается холст вместе с подписями над ним, а всё
   * остальное - кнопки, списки, карточки - сценой не считается: там палец
   * листает список, а не поворачивает камеру.
   */
  const isScene = (target: EventTarget | null): boolean =>
    target === canvas || (target instanceof Element && target.closest('.label') !== null);

  window.addEventListener(
    'pointerdown',
    (event) => {
      // Экскурсия разбирает касание сама: по его движению она решает,
      // перемотать себя или оборваться, и осмотру это касание не отдаётся.
      if (event.pointerType !== 'touch' || tour.isActive || !isScene(event.target)) return;

      touchGesture = true;
      // Новый жест начинается с чистого пути: им потом отличат касание от
      // протаскивания. Второй палец щипка путь уже накопил - его не сбрасываем.
      if (gestures.fingers === 0) moved = 0;
      gestures.down(event.pointerId, event.clientX, event.clientY);
    },
    true,
  );

  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch')
        gestures.move(event.pointerId, event.clientX, event.clientY);
    },
    true,
  );

  const endTouch = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') gestures.up(event.pointerId);
  };

  window.addEventListener('pointerup', endTouch, true);
  window.addEventListener('pointercancel', endTouch, true);

  /*
   * Щелчок, оказавшийся концом жеста, щелчком не считается.
   *
   * Гасится он на перехвате, раньше всех остальных обработчиков, и тому две
   * причины. Протаскивание кончается над чем попало - над подписью в том числе,
   * а у подписи свой обработчик, и проверка внутри чужого до него не доходит:
   * палец, повернувший сцену, уводил бы к случайному телу. И экскурсия: свайп
   * по остановкам кончается щелчком по холсту, и обрывать её этим щелчком
   * значило бы отменять только что сделанный переход.
   */
  window.addEventListener(
    'click',
    (event) => {
      if (!isScene(event.target) || moved < DRAG_THRESHOLD_PX) return;
      moved = 0;
      event.stopPropagation();
      event.preventDefault();
    },
    true,
  );

  // Прицел показывается только когда мышь захвачена: без захвата целятся курсором.
  document.addEventListener('pointerlockchange', () => {
    document.body.classList.toggle('locked', document.pointerLockElement !== null);
  });
}
