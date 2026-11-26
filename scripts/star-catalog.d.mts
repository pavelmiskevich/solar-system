// Типы для tests/starCatalog.test.ts: сам скрипт на JS, чтобы node запускал его
// без сборки, а tsc без объявления не пустит его в строгий тест.

export const MAGNITUDE_LIMIT: number;
export const REQUIRED_COLUMNS: readonly string[];
export const MIN_STARS: number;

export interface Catalog {
  starCount: number;
  packedBytes: number;
  starsFile: string;
  namedCount: number;
  figureCount: number;
  segmentCount: number;
  skyFile: string;
}

export function buildCatalog(csv: string, options: { source: string; minStars?: number }): Catalog;
