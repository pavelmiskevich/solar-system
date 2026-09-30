import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineSegments,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';

import type { InscriptionLayout } from '../core/inscription';
import { sphericalEquatorialToScene } from '../physics/frames';
import { createMarkingMaterial } from './orbits';
import { magnitudeToBrightness, magnitudeToPointRadius } from './photometry';
import { SKY_RADIUS } from './starfield';

/**
 * Надпись на небе в сцене.
 *
 * Живёт по правилам линий созвездий: на той же сфере, что и звёзды, едет
 * вместе с камерой и не разгорается от адаптации экспозиции. Своё здесь -
 * только звёзды в вершинах, которым не нашлось настоящей; рисуются они тем
 * же шейдером, что и каталог, и выглядят звёздами, а не точками разметки.
 *
 * Линии тёплые, золотые: голубые уже заняты созвездиями, и надпись не должна
 * читаться как ещё одно созвездие.
 */

const LINE_COLOR = 0xe0c070;
const LINE_OPACITY = 0.75;

/** Своя звезда - как яркая звезда неба: заметна, но не ярче Сириуса. */
const ADDED_MAGNITUDE = 1.0;

/** Звёзды загораются за это время по ходу письма, секунды. */
export const STAR_PHASE = 1.2;
/** Каждая звезда разгорается за это время. */
const STAR_RISE = 0.3;
/** Линии проступают за это время после звёзд. */
const LINE_PHASE = 0.8;

export function appearance(age: number, index: number, count: number): number {
  const start = count > 1 ? (index / (count - 1)) * (STAR_PHASE - STAR_RISE) : 0;
  return Math.max(0, Math.min(1, (age - start) / STAR_RISE));
}

export function lineAppearance(age: number): number {
  return Math.max(0, Math.min(1, (age - STAR_PHASE) / LINE_PHASE));
}

export class InscriptionView {
  readonly group = new Group();
  private lines: LineSegments<BufferGeometry, ShaderMaterial> | null = null;
  private stars: Points<BufferGeometry, ShaderMaterial> | null = null;
  private fullBrightness = 0;
  private age = 0;

  constructor(private readonly starMaterial: ShaderMaterial) {
    this.group.visible = false;
  }

  get isShown(): boolean {
    return this.group.visible;
  }

  /** Сколько своих звёзд пришлось добавить - для проверок. */
  get addedStars(): number {
    return this.stars ? this.stars.geometry.getAttribute('position').count : 0;
  }

  show(layout: InscriptionLayout): void {
    this.clear();

    const scene = layout.vertices.map((v) =>
      sphericalEquatorialToScene(v.ra, v.dec, new Vector3()).multiplyScalar(SKY_RADIUS),
    );

    const positions = new Float32Array(layout.edges.length * 6);
    layout.edges.forEach(([a, b], i) => {
      const from = scene[a]!;
      const to = scene[b]!;
      positions.set([from.x, from.y, from.z, to.x, to.y, to.z], i * 6);
    });
    const lineGeometry = new BufferGeometry();
    lineGeometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.lines = new LineSegments(lineGeometry, createMarkingMaterial(LINE_COLOR, LINE_OPACITY));
    this.lines.frustumCulled = false;
    this.group.add(this.lines);

    const added = scene.filter((_, i) => !layout.vertices[i]!.real);
    if (added.length > 0) {
      const starPositions = new Float32Array(added.length * 3);
      added.forEach((p, i) => starPositions.set([p.x, p.y, p.z], i * 3));
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(starPositions, 3));
      geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(added.length * 3).fill(1), 3));
      geometry.setAttribute(
        'aSize',
        new BufferAttribute(new Float32Array(added.length).fill(magnitudeToPointRadius(ADDED_MAGNITUDE)), 1),
      );
      geometry.setAttribute('aBrightness', new BufferAttribute(new Float32Array(added.length), 1));
      // Материал общий с каталогом: его уравнивание экспозиции звёзды
      // получают даром, и своя звезда не выйдет ярче соседних настоящих.
      this.stars = new Points(geometry, this.starMaterial);
      this.stars.frustumCulled = false;
      this.group.add(this.stars);
    }

    this.fullBrightness = magnitudeToBrightness(ADDED_MAGNITUDE);
    this.age = 0;
    this.group.visible = true;
  }

  clear(): void {
    for (const child of [this.lines, this.stars]) {
      if (!child) continue;
      this.group.remove(child);
      child.geometry.dispose();
    }
    this.lines?.material.dispose();
    this.lines = null;
    this.stars = null;
    this.group.visible = false;
  }

  update(dt: number, cameraRenderPosition: Vector3, exposure: number): void {
    if (!this.group.visible) return;
    this.group.position.copy(cameraRenderPosition);

    const settled = this.age > STAR_PHASE + LINE_PHASE;
    this.age += dt;

    if (this.lines) {
      this.lines.material.uniforms.uOpacity!.value =
        (LINE_OPACITY * lineAppearance(this.age)) / Math.max(exposure, 1e-4);
    }

    if (this.stars && !settled) {
      const brightness = this.stars.geometry.getAttribute('aBrightness') as BufferAttribute;
      for (let i = 0; i < brightness.count; i++) {
        brightness.setX(i, this.fullBrightness * appearance(this.age, i, brightness.count));
      }
      brightness.needsUpdate = true;
    }
  }
}
