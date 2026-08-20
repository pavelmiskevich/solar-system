import type { PerspectiveCamera } from 'three';
import type { Vector3 } from 'three';

import { formatDistance, onDistanceUnitChange } from './distanceUnits';
import { angularRadiusPixels, projectToScreen, type ScreenPoint } from './projection';

/**
 * Слой подписей тел.
 *
 * Подписи живут в DOM, а не в сцене. Причина не в удобстве: текст в сцене
 * пришлось бы рисовать спрайтами, и он либо терял бы резкость на подлёте, либо
 * требовал атласа под каждый масштаб. DOM даёт настоящий шрифт с хинтингом за
 * десяток узлов, а нагрузка на кадр сводится к записи transform.
 *
 * Три правила, без которых подписи вредны:
 *
 * 1. Подпись не стоит там, где тела не видно. Плутон с орбиты Земли не виден
 *    глазом, и его подпись превратила бы пустоту в объект.
 * 2. Подпись не закрывает тело. Она отводится к краю диска, а на далёких телах
 *    к точке, и соединена с ним выноской.
 * 3. Подписи не наезжают друг на друга. При взгляде на внутреннюю систему
 *    издали четыре планеты укладываются в пару градусов, и без прореживания
 *    получается каша из букв.
 */

/** Отступ подписи от края диска, пиксели. */
const LEADER_LENGTH = 14;

/** Половина размеров прямоугольника подписи для проверки наложений, пиксели. */
const BOX_HALF_HEIGHT = 9;
const BOX_HALF_WIDTH_PER_CHAR = 3.6;
const BOX_PADDING = 8;

/** Скорость проявления и угасания подписи, 1/с. Мгновенная смена мигает. */
const FADE_RATE = 7;

/** Расстояние в подписи меняется дважды в секунду: чаще — только дёргает глаз. */
const DISTANCE_REFRESH_SECONDS = 0.5;

export interface LabelSource {
  readonly id: string;
  readonly name: string;
  /** Позиция в координатах сцены — камера в начале координат, км. */
  readonly renderPosition: Vector3;
  /** Видимый радиус тела, км. */
  readonly radius: number;
  /** Рисуется ли тело в кадре: за подписью обязано что-то стоять. */
  isDrawn(): boolean;
}

export interface LabelBox {
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
  /** Чем больше, тем важнее подпись. При конфликте выживает важнейшая. */
  priority: number;
}

/**
 * Прореживание налезающих подписей. Возвращает маску: true — подпись остаётся.
 *
 * Порядок разрешения конфликтов задаётся приоритетом, а не порядком в массиве,
 * иначе исход зависел бы от порядка тел в таблице и менялся бы произвольно.
 */
export function keepWithoutOverlap(boxes: readonly LabelBox[]): boolean[] {
  const order = boxes.map((_, index) => index);
  order.sort((a, b) => boxes[b]!.priority - boxes[a]!.priority);

  const kept: boolean[] = new Array(boxes.length).fill(false);
  const placed: LabelBox[] = [];

  for (const index of order) {
    const box = boxes[index]!;
    const collides = placed.some(
      (other) =>
        Math.abs(box.x - other.x) < box.halfWidth + other.halfWidth &&
        Math.abs(box.y - other.y) < box.halfHeight + other.halfHeight,
    );
    if (collides) continue;
    kept[index] = true;
    placed.push(box);
  }

  return kept;
}

/** Диск тела на экране — то, чем одно тело может закрыть другое. */
export interface LabelDisc {
  x: number;
  y: number;
  radiusPx: number;
  /** Расстояние до камеры; меньше — ближе. */
  depth: number;
}

/**
 * Закрыто ли тело диском другого тела.
 *
 * Нужно потому, что «тело нарисовано» и «тело видно» — разные вещи. Ганимед
 * уходит за Юпитер каждые несколько часов, и на это время его подпись начинает
 * указывать на облачные полосы Юпитера, обещая спутник там, где его нет.
 *
 * Закрывающим считается только тело, у которого есть различимый диск: далёкая
 * планета нарисована точкой в пару пикселей и закрыть собой ничего не может,
 * сколько бы точек ни совпало на экране.
 *
 * @param index номер проверяемого тела — само себя оно не закрывает
 */
export function isHiddenBehindDisc(
  discs: readonly (LabelDisc | null)[],
  index: number,
): boolean {
  const target = discs[index];
  if (!target) return false;

  for (let i = 0; i < discs.length; i += 1) {
    if (i === index) continue;

    const occluder = discs[i];
    if (!occluder) continue;
    // Точка закрыть не может, и дальнее не закрывает ближнее.
    if (occluder.radiusPx < MIN_OCCLUDER_RADIUS || occluder.depth >= target.depth) continue;

    const dx = target.x - occluder.x;
    const dy = target.y - occluder.y;
    // Небольшой недобор радиуса: у самого края диска тело видно краем, и
    // гасить подпись там значило бы мигать ею на каждом касании лимба.
    const limit = occluder.radiusPx * 0.98;
    if (dx * dx + dy * dy < limit * limit) return true;
  }

  return false;
}

/** Меньше этого радиуса тело — точка на небе, а не заслонка. */
const MIN_OCCLUDER_RADIUS = 1.5;

interface LabelEntry {
  readonly source: LabelSource;
  readonly element: HTMLElement;
  readonly nameNode: HTMLElement;
  readonly distanceNode: HTMLElement;
  alpha: number;
  distanceAge: number;
  shownDistance: string;
  lastTransform: string;
}

export class LabelLayer {
  private readonly entries: LabelEntry[] = [];
  private readonly point: ScreenPoint = { x: 0, y: 0, depth: 0 };
  private readonly probe: ScreenPoint = { x: 0, y: 0, depth: 0 };
  private readonly discs: (LabelDisc | null)[] = [];
  private readonly boxes: LabelBox[] = [];
  private enabled = true;

  /**
   * @param onSelect вызывается при клике по подписи. Подпись — самая крупная
   *        цель на экране для тела, которое само занимает доли пикселя, и не
   *        сделать её кнопкой было бы расточительством.
   */
  constructor(
    container: HTMLElement,
    sources: readonly LabelSource[],
    onSelect?: (id: string) => void,
  ) {
    for (const source of sources) {
      const element = document.createElement('div');
      element.className = 'label';
      element.style.opacity = '0';
      if (onSelect) {
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          onSelect(source.id);
        });
      }

      const nameNode = document.createElement('b');
      nameNode.textContent = source.name;

      const distanceNode = document.createElement('i');
      distanceNode.textContent = '';

      element.append(nameNode, distanceNode);
      container.appendChild(element);

      this.entries.push({
        source,
        element,
        nameNode,
        distanceNode,
        alpha: 0,
        distanceAge: DISTANCE_REFRESH_SECONDS,
        shownDistance: '',
        lastTransform: '',
      });
    }

    // Смена единиц не должна ждать очередного обновления расстояний: подписи
    // держат последнее показанное значение и трогают вёрстку, только когда
    // оно изменилось. У неподвижного тела оно не изменится вовсе.
    onDistanceUnitChange(() => {
      for (const entry of this.entries) entry.distanceAge = DISTANCE_REFRESH_SECONDS;
    });
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
    this.boxes.length = 0;

    // Первый проход: диски тел на экране — по ним видно, кто кого закрывает.
    this.discs.length = 0;
    for (const entry of this.entries) {
      if (!projectToScreen(entry.source.renderPosition, camera, widthPx, heightPx, this.probe)) {
        this.discs.push(null);
        continue;
      }
      this.discs.push({
        x: this.probe.x,
        y: this.probe.y,
        depth: this.probe.depth,
        radiusPx: angularRadiusPixels(entry.source.radius, this.probe.depth, camera.fov, heightPx),
      });
    }

    // Второй проход: где подпись оказалась бы и претендует ли она на место.
    const candidates: (LabelBox | null)[] = [];

    for (let i = 0; i < this.entries.length; i += 1) {
      const entry = this.entries[i]!;
      const box = isHiddenBehindDisc(this.discs, i)
        ? null
        : this.place(entry, camera, widthPx, heightPx);
      candidates.push(box);
      if (box) this.boxes.push(box);
    }

    // Второй проход: прореживание наложений — только среди претендентов.
    const kept = keepWithoutOverlap(this.boxes);
    let keptIndex = 0;

    for (let i = 0; i < this.entries.length; i += 1) {
      const entry = this.entries[i]!;
      const box = candidates[i];
      const visible = this.enabled && box !== null && kept[keptIndex]!;
      if (box) keptIndex += 1;

      this.fade(entry, visible ? 1 : 0, dt);
      if (box && entry.alpha > 0.01) this.applyPosition(entry, box, dt);
    }
  }

  /**
   * Экранное место подписи, либо null, если её не должно быть: тело за спиной,
   * за краем кадра, не нарисовано вовсе или закрыто другим телом.
   */
  private place(
    entry: LabelEntry,
    camera: PerspectiveCamera,
    widthPx: number,
    heightPx: number,
  ): LabelBox | null {
    const { source } = entry;
    if (!source.isDrawn()) return null;
    if (!projectToScreen(source.renderPosition, camera, widthPx, heightPx, this.point)) return null;

    const margin = 40;
    if (
      this.point.x < -margin ||
      this.point.x > widthPx + margin ||
      this.point.y < -margin ||
      this.point.y > heightPx + margin
    ) {
      return null;
    }

    // Подпись отводится от края диска по диагонали вверх-вправо. У далёкого
    // тела радиус нулевой, и отвод сводится к длине выноски.
    const radiusPx = angularRadiusPixels(source.radius, this.point.depth, camera.fov, heightPx);
    const offset = Math.min(radiusPx, Math.max(widthPx, heightPx)) * 0.7071 + LEADER_LENGTH;

    const halfWidth = source.name.length * BOX_HALF_WIDTH_PER_CHAR + BOX_PADDING;

    // Точка привязки — левый край подписи на середине её высоты. От неё же
    // рисуется выноска, и её длина остаётся постоянной при любом размере
    // диска: отвод складывается из радиуса и фиксированного зазора.
    return {
      x: this.point.x + offset + halfWidth,
      y: this.point.y - offset,
      halfWidth,
      halfHeight: BOX_HALF_HEIGHT + BOX_PADDING * 0.5,
      // Приоритет — угловой размер тела: ближнее и крупное важнее далёкого.
      priority: source.radius / this.point.depth,
    };
  }

  private applyPosition(entry: LabelEntry, box: LabelBox, dt: number): void {
    // Округление до пикселя: дробные сдвиги размывают текст субпиксельным
    // сглаживанием, и подпись начинает «дышать» при малейшем движении камеры.
    const left = Math.round(box.x - box.halfWidth);
    const middle = Math.round(box.y);
    const transform = `translate3d(${left}px, ${middle}px, 0) translateY(-50%)`;
    if (transform !== entry.lastTransform) {
      entry.element.style.transform = transform;
      entry.lastTransform = transform;
    }

    entry.distanceAge += dt;
    if (entry.distanceAge >= DISTANCE_REFRESH_SECONDS) {
      entry.distanceAge = 0;
      const text = formatDistance(Math.max(this.pointDepthFor(entry), 0));
      if (text !== entry.shownDistance) {
        entry.shownDistance = text;
        entry.distanceNode.textContent = text;
      }
    }
  }

  /** Расстояние до тела от камеры: камера всегда в начале координат сцены. */
  private pointDepthFor(entry: LabelEntry): number {
    return entry.source.renderPosition.length() - entry.source.radius;
  }

  private fade(entry: LabelEntry, target: number, dt: number): void {
    const k = Math.min(1, dt * FADE_RATE);
    const alpha = entry.alpha + (target - entry.alpha) * k;
    entry.alpha = Math.abs(alpha - target) < 0.005 ? target : alpha;

    const rounded = Math.round(entry.alpha * 100) / 100;
    if (entry.element.style.opacity !== String(rounded)) {
      entry.element.style.opacity = String(rounded);
      // Ноль убирает узел из отрисовки целиком: невидимый, но существующий
      // элемент продолжает участвовать в композиции слоёв браузера.
      entry.element.style.visibility = rounded <= 0 ? 'hidden' : 'visible';
    }
  }
}
