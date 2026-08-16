import { Vector3 } from 'three';

import { FlightControls } from './camera/flight';
import { framingPosition } from './camera/framing';
import { DEFAULT_TIME_SCALE, SimClock } from './core/clock';
import { FloatingOrigin } from './core/floatingOrigin';
import { RenderLoop } from './core/loop';
import { AdaptiveQuality } from './core/quality';
import { Viewport } from './core/renderer';
import { AU } from './core/units';
import { kindOf, listOrder } from './data/targets';
import { AdaptiveExposure } from './lighting/exposure';
import { SceneLuminance } from './lighting/sceneLuminance';
import { OrbitLines } from './scene/orbits';
import { Starfield } from './scene/starfield';
import { Sun } from './scene/sun';
import { SIZE_PRESETS, SolarSystem } from './scene/system';
import { ReferenceFrame } from './camera/frame';
import { TravelController } from './camera/travel';
import { BodyCard, type CardSource } from './ui/bodyCard';
import { BodyList } from './ui/bodyList';
import { HINT, HelpPanel } from './ui/help';
import { SupportPanel } from './ui/support';
import { Hud } from './ui/hud';
import { LabelLayer } from './ui/labels';
import { bindSceneInput } from './ui/input';
import { createSourceLink } from './ui/sourceLink';

const container = document.getElementById('viewport');
const hudElement = document.getElementById('hud');
const overlayElement = document.getElementById('overlay');
const panelElement = document.getElementById('panel');
const loaderElement = document.getElementById('loader');
const hintElement = document.getElementById('hint');

if (!container || !hudElement || !overlayElement || !panelElement) {
  throw new Error('Разметка страницы не найдена');
}

const viewport = new Viewport({ container });
const clock = new SimClock(new Date(), DEFAULT_TIME_SCALE);
const origin = new FloatingOrigin();
const exposure = new AdaptiveExposure();
/** Замер яркости кадра — им экспозиция узнаёт, на что направлена камера. */
const luminance = new SceneLuminance();
const hud = new Hud(hudElement);

const sun = new Sun();
viewport.scene.add(sun.group);
origin.track(sun.group, sun.worldPosition);

const system = new SolarSystem();
viewport.scene.add(system.root);
viewport.scene.add(system.pointLayer);
for (const body of system.bodies) origin.track(body.group, body.worldPosition);

const orbits = new OrbitLines(clock.jd);
viewport.scene.add(orbits.group);
origin.track(orbits.group, orbits.worldPosition);

const starfield = new Starfield();
viewport.scene.add(starfield.points);

system.update(clock.jd);

// Стартовый кадр: над плоскостью эклиптики, откуда видны орбиты внутренних
// планет и Солнце занимает несколько градусов.
const flight = new FlightControls(viewport.renderer.domElement);
flight.placeLookingAt(new Vector3(0.28 * AU, 0.09 * AU, 0.2 * AU), sun.worldPosition);
exposure.reset(flight.worldPosition.length());

/**
 * Единый список целей.
 *
 * Одна и та же таблица обслуживает подписи, выбор курсором, список тел и
 * перелёт. Развести их по отдельным спискам означало бы четыре места, где
 * тело может отсутствовать по недосмотру, и рассинхронизацию между тем, что
 * подписано, и тем, по чему можно кликнуть.
 *
 * Позиции берутся прямо из групп сцены: те уже пересчитаны плавающим началом
 * координат, то есть заданы относительно камеры — ровно то, что нужно проекции.
 */
interface Target {
  readonly id: string;
  readonly name: string;
  /** Пометка в списке: звезда, планета, спутник. */
  readonly kind: string;
  readonly color: number;
  /** Мировая позиция, км. */
  readonly worldPosition: Vector3;
  /** Позиция в координатах сцены — камера в начале координат, км. */
  readonly renderPosition: Vector3;
  /** Видимый радиус, км. */
  readonly radius: number;
  isDrawn(): boolean;
}

const targets: Target[] = [
  {
    id: 'sun',
    name: 'Солнце',
    kind: kindOf('sun'),
    color: 0xffd9a0,
    worldPosition: sun.worldPosition,
    renderPosition: sun.group.position,
    get radius() {
      return sun.visualRadius;
    },
    isDrawn: () => true,
  },
  ...system.bodies.map((body) => ({
    id: body.definition.id,
    name: body.definition.name,
    kind: kindOf(body.definition.id),
    color: body.definition.color,
    worldPosition: body.worldPosition,
    renderPosition: body.group.position,
    get radius() {
      return body.visualRadius;
    },
    isDrawn: () => body.point.drawn,
  })),
];

/** Порядок в списке выводится из определений тел, см. data/targets.ts. */
const LIST_ORDER = listOrder();

function findTarget(id: string): Target | undefined {
  return targets.find((target) => target.id === id);
}

const travel = new TravelController();
const frame = new ReferenceFrame();

function travelTo(id: string): void {
  const target = findTarget(id);
  if (!target) return;

  // Старую привязку надо отпустить сразу: пока летим к Урану, тащиться вместе
  // с Землёй незачем — это увело бы камеру с рассчитанной траектории.
  frame.release();
  travel.start(target, flight.worldPosition, sun.worldPosition);
  bodyList.setActive(id);
  hintElement?.classList.add('hidden');
}

/** Тело, в системе отсчёта которого сейчас находится камера. */
function frameTargetName(): string | null {
  const id = frame.targetId;
  return id ? (findTarget(id)?.name ?? null) : null;
}

const labels = new LabelLayer(overlayElement, targets, travelTo);

const bodyList = new BodyList(
  panelElement,
  LIST_ORDER.map((id) => findTarget(id))
    .filter((target): target is Target => target !== undefined)
    .map((target) => ({
      id: target.id,
      name: target.name,
      kind: target.kind,
      color: target.color,
      // Расстояние до поверхности, а не до центра: именно оно осмысленно,
      // когда стоишь в трёх радиусах от Юпитера.
      distance: () => target.worldPosition.distanceTo(flight.worldPosition) - target.radius,
    })),
  travelTo,
);

/**
 * Карточка тела живёт в той же колонке, что и список, и показывает то тело,
 * к которому летим или рядом с которым стоим.
 */
const bodyCard = new BodyCard(bodyList.column);

function cardSourceFor(id: string | null): CardSource | null {
  const target = id ? findTarget(id) : undefined;
  if (!target) return null;

  return {
    id: target.id,
    name: target.name,
    kind: target.kind,
    distanceToCamera: () => target.worldPosition.distanceTo(flight.worldPosition) - target.radius,
    distanceToSun: () => target.worldPosition.length(),
  };
}

/*
 * Кнопки справки и поддержки встают над списком тел, в той же колонке и в том
 * же виде. Обе панели занимают середину экрана, поэтому открытие одной
 * закрывает другую — иначе карточки легли бы одна поверх другой.
 *
 * Порядок создания задаёт порядок кнопок: обе кладут свою через `prepend`, и
 * каждая следующая встаёт выше предыдущей. Сверху вниз получается
 * «Поддержать», «Справка», «Тела».
 */
const help = new HelpPanel(panelElement, bodyList.column, () => support.setOpen(false));
const support = new SupportPanel(panelElement, bodyList.column, () => help.setOpen(false));

// Ссылка на исходники — последней кнопкой, но до списка тел: тот раскрывается
// вниз, и кнопка под ним оказалась бы то у края экрана, то посреди списка.
bodyList.column.insertBefore(createSourceLink(), bodyList.column.querySelector('.bodies-list'));

/*
 * Справка открыта на старте. Сцена не объясняет себя сама: мышь здесь надо
 * сначала захватить кликом, перелёт делается кликом по телу, а время течёт со
 * скоростью, которую нужно уметь менять. Один Esc закрывает справку — цена
 * ошибки для того, кто и так всё знает, невелика.
 */
help.setOpen(true);

if (hintElement) hintElement.textContent = HINT;

/** Линии орбит перестраиваются раз в модельный год: вековой дрейф медленный. */
const ORBIT_REBUILD_INTERVAL_DAYS = 365;
let lastOrbitRebuildJd = clock.jd;

let sizeIndex = 0;

const sizeOffset = new Vector3();

/**
 * Смена множителя размеров с отводом камеры.
 *
 * Расстояния остаются настоящими, а тела растут — значит, наблюдатель,
 * стоявший в трёх радиусах от Земли, после ×10 оказался бы у неё внутри.
 * Поэтому камера отодвигается во столько же раз: угловой размер тела
 * в кадре сохраняется, и меняется ровно то, ради чего множитель включают —
 * соотношение размеров с расстояниями.
 */
function applySizeExaggeration(next: number): void {
  const previous = system.getSizeExaggeration();
  if (next === previous) return;

  const anchor =
    (frame.targetId ? findTarget(frame.targetId) : undefined) ??
    findTarget(system.distanceToNearestSurface(flight.worldPosition).body?.definition.id ?? '');

  system.setSizeExaggeration(next);
  sun.setSizeExaggeration(next);
  if (!anchor) return;

  sizeOffset
    .subVectors(flight.worldPosition, anchor.worldPosition)
    .multiplyScalar(next / previous);
  flight.worldPosition.copy(anchor.worldPosition).add(sizeOffset);
}

/** Следующий множитель размеров по кругу. */
function cycleSizePreset(): void {
  // Раздутые тела — честная модель, а не обман: вместе с планетой растёт вся
  // её внутренняя геометрия, а расстояния остаются настоящими.
  sizeIndex = (sizeIndex + 1) % SIZE_PRESETS.length;
  applySizeExaggeration(SIZE_PRESETS[sizeIndex]!);
}

/**
 * Адаптивное качество: на слабой видеокарте первым уходит bloom,
 * следом — внутреннее разрешение. Масштабы и физика не трогаются никогда.
 */
const quality = new AdaptiveQuality();

const loop = new RenderLoop((dt, elapsed) => {
  clock.advance(dt);
  system.update(clock.jd);

  // Камера идёт вместе с телом, к которому привязана. Это делается сразу после
  // пересчёта орбит и до всего остального: расстояния, скорость полёта и
  // плавающее начало координат должны считаться уже в новой системе отсчёта.
  if (!frame.apply(flight.worldPosition)) bodyList.setActive(travel.targetId);

  if (Math.abs(clock.jd - lastOrbitRebuildJd) > ORBIT_REBUILD_INTERVAL_DAYS) {
    orbits.rebuild(clock.jd);
    lastOrbitRebuildJd = clock.jd;
  }

  const distanceToSun = flight.worldPosition.length();
  const nearest = system.distanceToNearestSurface(flight.worldPosition);
  const distanceToSurface = Math.max(
    Math.min(nearest.distance, distanceToSun - sun.visualRadius),
    1,
  );

  // Перелёт и свободный полёт не могут двигать камеру одновременно.
  if (travel.isActive) {
    const arrivalId = travel.targetId;
    if (!travel.update(dt, flight, sun.worldPosition)) {
      // Долетели: дальше камера живёт в системе отсчёта тела, иначе оно уйдёт
      // из кадра быстрее, чем успеешь его рассмотреть.
      const arrived = arrivalId ? findTarget(arrivalId) : undefined;
      if (arrived) frame.lockTo(arrived);
    }
  } else {
    flight.update(dt, distanceToSurface);
  }

  // Поле зрения раздвигается на разгоне: в пустоте скорость не читается ничем
  // другим — смотреть, мимо чего проносишься, здесь просто не на что.
  const fov = viewport.baseFov * (1 + 0.22 * travel.intensity);
  if (Math.abs(viewport.camera.fov - fov) > 0.01) {
    viewport.camera.fov = fov;
    viewport.camera.updateProjectionMatrix();
  }

  // Камера всегда в начале координат сцены, мир сдвигается под неё.
  origin.setOrigin(flight.worldPosition);
  origin.apply();
  viewport.camera.position.set(0, 0, 0);
  viewport.camera.quaternion.copy(flight.quaternion);

  // Экспозиция считается до всего, что от неё зависит: точки тел, звёзды и
  // линии орбит компенсируют её, чтобы небо не разгоралось при удалении.
  // Небо и точки в измерение не входят: их яркость экспозицию компенсирует.
  const frameLuminance = luminance.measure(dt, viewport.renderer, viewport.scene, viewport.camera, [
    starfield.points,
    system.pointLayer,
    orbits.group,
  ]);
  viewport.exposure = exposure.update(dt, distanceToSun, frameLuminance);

  sun.update(elapsed, viewport.camera, viewport.renderer.domElement.height);
  system.updateLighting(sun.group.position, elapsed, viewport.camera);
  system.updatePoints(
    viewport.camera,
    viewport.renderer.domElement.height,
    sun.group.position,
    viewport.exposure,
  );
  starfield.followCamera(viewport.camera.position);
  starfield.compensateExposure(viewport.exposure);
  orbits.update(distanceToSun, distanceToSurface, viewport.exposure);

  if (quality.update(dt, loop.fps)) {
    viewport.setBloomEnabled(quality.level.bloom);
    viewport.setResolutionScale(quality.level.resolutionScale);
  }

  viewport.render();

  // Подписи обновляются после кадра: проекция опирается на матрицы камеры,
  // а те приводятся в порядок отрисовкой.
  labels.update(
    viewport.camera,
    viewport.renderer.domElement.clientWidth,
    viewport.renderer.domElement.clientHeight,
    dt,
  );
  bodyList.update(dt);
  bodyCard.show(cardSourceFor(travel.targetId ?? frame.targetId));
  bodyCard.update(dt);

  hud.update({
    fps: loop.fps,
    speedKmS: flight.speed,
    distanceToSunKm: distanceToSun,
    date: clock.date,
    timeScale: clock.describeScale(),
    nearestBody: nearest.body?.definition.name ?? 'Солнце',
    nearestDistanceKm: Math.max(nearest.distance, 0),
    frame: frameTargetName(),
    sizeExaggeration: system.getSizeExaggeration(),
  });
});

loop.start();

// Прячем загрузчик только после первого отрисованного кадра, иначе на слабой
// машине видно чёрное окно между исчезновением заставки и появлением картинки.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    loaderElement?.classList.add('done');
    setTimeout(() => loaderElement?.remove(), 900);
  });
});

bindSceneInput({
  canvas: viewport.renderer.domElement,
  camera: viewport.camera,
  clock,
  flight,
  travel,
  labels,
  bodyList,
  help,
  support,
  targets,
  travelTo,
  cycleSizePreset,
  hint: hintElement,
});

// Отладочный доступ из консоли: позволяет ставить камеру и время программно,
// без чего невозможна проверка сцены скриншотами.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).sim = {
    flight,
    clock,
    viewport,
    sun,
    system,
    orbits,
    exposure,
    labels,
    bodyList,
    travel,
    frame,
    quality,
    travelTo,
    lookAt(from: [number, number, number], at: [number, number, number] = [0, 0, 0]) {
      flight.placeLookingAt(new Vector3(...from), new Vector3(...at));
      exposure.reset(flight.worldPosition.length());
    },
    /** Встать рядом с телом так, чтобы оно было освещено, и посмотреть на него. */
    goTo(id: string, radii = 3.4, phaseAngleDeg = 60) {
      const body = system.find(id);
      if (!body) return `нет тела ${id}`;
      const position = framingPosition(body.worldPosition, sun.worldPosition, body.visualRadius, {
        distanceInRadii: radii,
        phaseAngle: (phaseAngleDeg * Math.PI) / 180,
      });
      flight.placeLookingAt(position, body.worldPosition);
      exposure.reset(flight.worldPosition.length());
      return body.definition.name;
    },
    setDate(iso: string) {
      clock.date = new Date(iso);
      system.update(clock.jd);
      orbits.rebuild(clock.jd);
    },
  };
}
