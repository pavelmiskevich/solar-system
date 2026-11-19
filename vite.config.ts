import { loadEnv } from 'vite';
// defineConfig из vitest/config - тот же, что у vite, но знает про поле test.
import { defineConfig } from 'vitest/config';

import { version } from './package.json';

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
  server: { port: 5173 },
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
