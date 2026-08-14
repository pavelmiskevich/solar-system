// defineConfig из vitest/config — тот же, что у vite, но знает про поле test.
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
});
