import { defineConfig, devices } from '@playwright/test';

// Локальные адреса мимо системного прокси: иначе и проверка готовности
// сервера, и сам браузер идут через него и получают 502 на свой же порт.
process.env.NO_PROXY = ['localhost', '127.0.0.1', process.env.NO_PROXY].filter(Boolean).join(',');
process.env.no_proxy = process.env.NO_PROXY;

/**
 * Сквозные тесты.
 *
 * Гоняются против dev-сервера, а не собранной страницы, и на то есть причина:
 * отладочный доступ `window.sim` существует только в режиме разработки. Через
 * него тест спрашивает у сцены то, чего не видно снаружи, — где камера, какая
 * экспозиция, в какой системе отсчёта наблюдатель. Проверять это по пикселям
 * было бы гаданием.
 *
 * Браузер один — Chromium. Сцена целиком построена на WebGL2 и шейдерах без
 * расширений, поэтому смысла в матрице браузеров нет: либо WebGL2 есть, либо
 * страницы нет вовсе.
 */
export default defineConfig({
  testDir: './e2e',
  // Кадры считает видеокарта, а в headless — программный растеризатор:
  // на перелёт в пять секунд модельного времени уходит заметно больше.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 900, height: 600 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 900, height: 600 },
        launchOptions: {
          args: [
            // Без этого headless-Chromium отказывается отдавать WebGL2:
            // видеокарты в контейнере нет, а программный растеризатор
            // по умолчанию считается «небезопасным».
            '--enable-unsafe-swiftshader',
            '--no-proxy-server',
            '--use-gl=angle',
            '--use-angle=swiftshader',
          ],
        },
      },
    },
  ],

  webServer: {
    // Явный IPv4: без --host vite слушает только ::1, и проверка готовности
    // по 127.0.0.1 не проходит.
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
