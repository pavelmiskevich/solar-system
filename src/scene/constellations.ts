import { BufferAttribute, BufferGeometry, LineSegments, ShaderMaterial, Vector3 } from 'three';

import { CONSTELLATIONS } from '../data/sky';
import { sphericalEquatorialToScene } from '../physics/frames';
import { createMarkingMaterial } from './orbits';
import { SKY_RADIUS } from './starfield';

/**
 * Цвет и насыщенность линий созвездий.
 *
 * Голубоватый и слабый: фигура должна читаться, но не спорить со звёздами,
 * ради которых её и включили. Ярче — и небо превращается в чертёж, на котором
 * звёзд уже не разглядеть.
 */
const LINE_COLOR = 0x6f8fb5;
const LINE_OPACITY = 0.5;

/**
 * Линии созвездий.
 *
 * Рисуют то, что на небе и так есть: вершины отрезков — настоящие звёзды
 * каталога, а не собственные точки разметки. Поэтому фигура работает не
 * только с Земли: звёзды слишком далеко, чтобы перелёт на десятки а.е. что-то
 * в их взаимном расположении поменял, и Орион с орбиты Нептуна остаётся
 * Орионом.
 *
 * Геометрия лежит на той же сфере, что и звёзды, и так же ездит вместе с
 * камерой — иначе линии разошлись бы со звёздами на параллаксе.
 */
export class ConstellationLines {
  readonly lines: LineSegments<BufferGeometry, ShaderMaterial>;

  constructor() {
    const segments = CONSTELLATIONS.flatMap((figure) => figure.segments);
    const positions = new Float32Array(segments.length * 6);
    const direction = new Vector3();

    segments.forEach((segment, index) => {
      const [ra1, dec1, ra2, dec2] = segment;

      sphericalEquatorialToScene(ra1, dec1, direction);
      positions[index * 6 + 0] = direction.x * SKY_RADIUS;
      positions[index * 6 + 1] = direction.y * SKY_RADIUS;
      positions[index * 6 + 2] = direction.z * SKY_RADIUS;

      sphericalEquatorialToScene(ra2, dec2, direction);
      positions[index * 6 + 3] = direction.x * SKY_RADIUS;
      positions[index * 6 + 4] = direction.y * SKY_RADIUS;
      positions[index * 6 + 5] = direction.z * SKY_RADIUS;
    });

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));

    this.lines = new LineSegments(geometry, createMarkingMaterial(LINE_COLOR, LINE_OPACITY));
    this.lines.visible = false;
    // Границы считаются в собственных координатах сферы, а её саму каждый
    // кадр переставляют вслед за камерой.
    this.lines.frustumCulled = false;
  }

  setEnabled(enabled: boolean): void {
    this.lines.visible = enabled;
  }

  isEnabled(): boolean {
    return this.lines.visible;
  }

  /** Сфера неба ездит вместе с камерой: параллакса у звёзд быть не должно. */
  followCamera(cameraRenderPosition: Vector3): void {
    this.lines.position.copy(cameraRenderPosition);
  }

  /**
   * Отменить для линий адаптацию экспозиции — по той же причине, что и для
   * звёзд: небо не разгорается оттого, что наблюдатель отошёл от Солнца.
   * Без этого у орбиты Нептуна фигуры превращались бы в яркую сетку поверх
   * всего кадра.
   */
  compensateExposure(exposure: number): void {
    this.lines.material.uniforms.uOpacity!.value = LINE_OPACITY / Math.max(exposure, 1e-4);
  }
}
