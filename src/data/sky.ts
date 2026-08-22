import { CONSTELLATIONS, NAMED_STARS } from './sky.generated';

/**
 * Разметка неба: имена ярких звёзд и фигуры созвездий.
 *
 * Звёзды на небе настоящие — восемь с половиной тысяч из каталога HYG, — но
 * узнать в них Орион можно, только если знаешь, что искать. Разметка отвечает
 * на этот вопрос: она не добавляет к небу ничего своего, а показывает то, что
 * там и так есть. Отсюда и главное требование к данным — вершины фигур обязаны
 * совпадать с нарисованными звёздами, иначе линия пройдёт мимо, и картинка
 * начнёт врать.
 *
 * Данные лежат в sky.generated.ts и делаются тем же скриптом, что и сам
 * каталог: одна загрузка, один источник, разъехаться нечему.
 */

export interface NamedStar {
  /** Имя по-русски: «Сириус», «Бетельгейзе». */
  readonly name: string;
  /** Прямое восхождение, радианы, эпоха J2000. */
  readonly ra: number;
  /** Склонение, радианы. */
  readonly dec: number;
  /** Видимая звёздная величина — она же порядок важности. */
  readonly magnitude: number;
}

/** Отрезок фигуры: ra и dec начала, ra и dec конца, радианы. */
export type ConstellationSegment = readonly [number, number, number, number];

export interface ConstellationFigure {
  /** Название по-русски: «Большая Медведица». */
  readonly name: string;
  readonly segments: readonly ConstellationSegment[];
}

export { CONSTELLATIONS, NAMED_STARS };

/** Все вершины фигуры без повторов — для подписи созвездия и для проверок. */
export function figureVertices(figure: ConstellationFigure): [number, number][] {
  const seen = new Set<string>();
  const vertices: [number, number][] = [];

  for (const [ra1, dec1, ra2, dec2] of figure.segments) {
    for (const [ra, dec] of [
      [ra1, dec1],
      [ra2, dec2],
    ] as const) {
      const key = `${ra.toFixed(6)} ${dec.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      vertices.push([ra, dec]);
    }
  }

  return vertices;
}
