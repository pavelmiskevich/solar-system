import { readFileSync } from 'node:fs';

import { loadEnv } from 'vite';
// defineConfig из vitest/config - тот же, что у vite, но знает про поле test.
import { defineConfig } from 'vitest/config';

import { version } from './package.json';

/**
 * Политика содержимого боевого сайта - из образца настройки Caddy, а не своей
 * копией. Сервер разработки отдаёт её же, и тогда каждый прогон сквозных
 * тестов идёт под боевой политикой: нарушение пишется ошибкой в консоль, а
 * консоль тесты проверяют. Новая зависимость или приём, который политика
 * запретит на сайте, падает здесь, а не у посетителя.
 */
function sitePolicy(): string {
  const caddyfile = readFileSync(new URL('./deploy/Caddyfile.example', import.meta.url), 'utf8');
  const policy = /^\s*Content-Security-Policy "([^"]+)"/m.exec(caddyfile)?.[1];
  // Молча работать без политики хуже, чем не запуститься: тесты зеленели бы,
  // ничего не проверяя.
  if (!policy) throw new Error('в deploy/Caddyfile.example не нашлось Content-Security-Policy');
  return policy;
}

const securityHeaders = { 'Content-Security-Policy': sitePolicy() };

export default defineConfig(({ command, mode }) => ({
  /*
   * Какая сборка на сайте - первый вопрос к каждому замечанию: закэшированная
   * страница, старая вкладка или второй домен могут показывать сборку
   * недельной давности. Версия и коммит подставляются при сборке и видны
   * внизу справки.
   *
   * Коммит берётся из GITHUB_SHA: выпуски собирает GitHub Actions. Сборка на
   * своей машине обходится без него, а в разработке вместо него - dev: код
   * там не закоммичен и меняется на лету.
   */
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(
      command === 'build' ? (loadEnv(mode, '.', 'GITHUB_SHA').GITHUB_SHA ?? '').slice(0, 7) : 'dev',
    ),
  },
  server: { port: 5173, headers: securityHeaders },
  preview: { headers: securityHeaders },
  build: {
    target: 'es2022',
    // Текстуры лежат в public/ и не должны инлайниться в бандл.
    assetsInlineLimit: 0,
  },
  test: {
    /*
     * Только юнит-тесты. Сквозные лежат в e2e/ и запускаются Playwright:
     * им нужен браузер с WebGL и поднятый сервер, а vitest пытался бы
     * выполнить их в node и падал на импорте @playwright/test.
     */
    include: ['tests/**/*.test.ts'],
  },
}));
