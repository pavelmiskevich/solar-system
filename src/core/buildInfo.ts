/**
 * Какая сборка перед глазами: версия из package.json и короткий хеш коммита.
 * Оба подставляет vite при сборке (define в vite.config.ts), в разработке
 * вместо хеша - dev.
 */

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

/** Строка версии для справки: «v0.17.4 · cbd88f7», без хеша - просто «v0.17.4». */
export function versionLine(version: string, commit: string): string {
  return commit ? `v${version} · ${commit}` : `v${version}`;
}

/** Строка версии этой сборки. */
export function buildVersion(): string {
  return versionLine(__APP_VERSION__, __APP_COMMIT__);
}
