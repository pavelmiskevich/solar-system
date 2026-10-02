// Типы для tests/e2eShard.test.ts: сам скрипт на JS, чтобы node запускал его
// без сборки, а tsc без объявления не пустит его в строгий тест.

export const DURATIONS_FILE: string;

export interface SpecFile {
  file: string;
  tests: number;
}

export interface Shard {
  files: string[];
  seconds: number;
}

export function listSpecFiles(): { rootDir: string; files: SpecFile[] };

export function planShards(files: SpecFile[], durations: Record<string, number>, total: number): Shard[];

export function checkPlan(shards: { files: string[] }[], files: string[]): void;

export function fileFilters(shardFiles: string[], allFiles: string[], rootDir: string, cwd: string): string[];
