import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Line,
  ShaderMaterial,
  Vector3,
} from 'three';

import { PLANETS } from '../data/bodies';
import { AU } from '../core/units';
import { sampleOrbit } from '../physics/kepler';
import { eclipticToScene } from './system';

const SEGMENTS = 720;

/** Насыщенность линии орбиты в самом видном её положении. */
export const ORBIT_OPACITY = 0.22;

/**
 * Линия орбиты: геометрия из готовых точек и общий для всех орбит вид.
 *
 * Вид один и тот же у гелиоцентрических орбит и у орбит спутников, и это не
 * совпадение, а смысл: обе — навигационная разметка, и разное оформление
 * читалось бы как разная природа линий. Отсюда и общая точка сборки.
 *
 * Аддитивное смешение без записи глубины: линии не заслоняют друг друга и не
 * спорят с тем, что за ними, а складываются с ним.
 */
export function createOrbitLine(
  positions: Float32Array,
  color: number,
): Line<BufferGeometry, ShaderMaterial> {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));

  const material = new ShaderMaterial({
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    uniforms: {
      uColor: { value: new Color(color) },
      uOpacity: { value: ORBIT_OPACITY },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>

      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>

      uniform vec3 uColor;
      uniform float uOpacity;

      void main() {
        #include <logdepthbuf_fragment>

        gl_FragColor = vec4(uColor * uOpacity, 1.0);
      }
    `,
  });

  const line = new Line(geometry, material);
  // Отключено намеренно: границы линии считаются в её собственных
  // координатах, а группа переставляется плавающим началом каждый кадр.
  line.frustumCulled = false;

  return line;
}

/**
 * Линии орбит.
 *
 * Геометрия строится в гелиоцентрических координатах, поэтому вся группа
 * должна быть привязана к позиции Солнца в системе плавающего начала
 * координат. Точки берутся равномерно по эксцентрической аномалии, а не по
 * времени: иначе у эллиптичных орбит точки сгущаются в афелии и линия там
 * выглядит толще.
 *
 * Прозрачность гасится по мере приближения камеры: вблизи планеты линия
 * орбиты — это яркая полоса поперёк всего кадра, которая только мешает.
 */
export class OrbitLines {
  readonly group = new Group();
  /** Мировая позиция Солнца — группа привязывается к ней. */
  readonly worldPosition = new Vector3(0, 0, 0);

  private readonly lines: { line: Line<BufferGeometry, ShaderMaterial>; semiMajorKm: number }[] = [];

  constructor(jd: number) {
    for (const planet of PLANETS) {
      if (!planet.orbit) continue;

      const points = sampleOrbit(planet.orbit, jd, SEGMENTS);
      const positions = new Float32Array(points.length * 3);
      const scratch = new Vector3();

      for (let i = 0; i < points.length; i++) {
        eclipticToScene(points[i]!, scratch);
        positions[i * 3 + 0] = scratch.x;
        positions[i * 3 + 1] = scratch.y;
        positions[i * 3 + 2] = scratch.z;
      }

      const line = createOrbitLine(positions, planet.color);
      this.group.add(line);
      this.lines.push({ line, semiMajorKm: planet.orbit.a * AU });
    }
  }

  /**
   * @param cameraDistanceToSun расстояние камеры до Солнца, км
   * @param nearestSurfaceDistance расстояние до ближайшей поверхности, км
   * @param exposure текущая экспозиция — линии не должны разгораться вместе с ней
   */
  update(cameraDistanceToSun: number, nearestSurfaceDistance: number, exposure: number): void {
    // Линии орбит — навигационная разметка для общего плана. Стоит подойти к
    // планете, и собственная её орбита превращается в яркую полосу поперёк
    // кадра, которая перечёркивает то самое, ради чего подлетали. Поэтому у
    // разметки два независимых условия гашения: близость к любому телу и
    // уход камеры глубоко внутрь орбиты.
    const proximity = smoothstep(0.002 * AU, 0.03 * AU, nearestSurfaceDistance);

    for (const { line, semiMajorKm } of this.lines) {
      const inside = smoothstep(0.04, 0.35, cameraDistanceToSun / semiMajorKm);
      const visibility = inside * proximity;

      line.material.uniforms.uOpacity!.value =
        (ORBIT_OPACITY * visibility) / Math.max(exposure, 1e-4);
      line.visible = visibility > 0.002;
    }
  }

  /** Перестроить линии — вековой дрейф элементов заметен на масштабе десятилетий. */
  rebuild(jd: number): void {
    let index = 0;
    const scratch = new Vector3();

    for (const planet of PLANETS) {
      if (!planet.orbit) continue;
      const entry = this.lines[index++];
      if (!entry) break;

      const points = sampleOrbit(planet.orbit, jd, SEGMENTS);
      const attribute = entry.line.geometry.getAttribute('position') as BufferAttribute;
      const array = attribute.array as Float32Array;

      for (let i = 0; i < points.length; i++) {
        eclipticToScene(points[i]!, scratch);
        array[i * 3 + 0] = scratch.x;
        array[i * 3 + 1] = scratch.y;
        array[i * 3 + 2] = scratch.z;
      }

      attribute.needsUpdate = true;
    }
  }
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
