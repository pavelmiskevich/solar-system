// @ts-check
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

/**
 * Снимки сцены для README.
 *
 * Кадры делает тот же headless-Chromium, что и сквозные тесты, и тем же
 * отладочным доступом `window.sim` ставит камеру, дату и масштаб. Смысл в
 * повторяемости: картинки в описании проекта должны обновляться командой, а не
 * пересниматься вручную, иначе они устаревают молча.
 *
 * Требуется поднятый dev-сервер (`window.sim` есть только в режиме разработки):
 *
 *   npm run dev -- --host 127.0.0.1 --port 5174
 *   node scripts/shots.mjs
 */

const URL = 'http://127.0.0.1:5174';
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/shots');

/** Локальный адрес мимо системного прокси — иначе браузер получает 502 на свой же порт. */
process.env.NO_PROXY = ['localhost', '127.0.0.1', process.env.NO_PROXY].filter(Boolean).join(',');
process.env.no_proxy = process.env.NO_PROXY;

/** Дата съёмки. Фиксированная: иначе тела каждый раз стоят по-разному. */
const DATE = '2026-08-14T12:00:00Z';

/**
 * Кадры. `goTo(id, радиусы, фазовый угол)` ставит камеру так, чтобы тело было
 * освещено: угол 0° — Солнце за спиной, 180° — прямо в объектив.
 */
const SHOTS = [
  {
    file: 'saturn.png',
    what: 'Сатурн: кольца, тень планеты на кольцах и тень колец на планете',
    // Кольца освещены по сезону Сатурна: в 2025-м они прошли плоскостью через
    // Солнце и почти не видны, к началу 2030-х раскрываются на максимум.
    date: '2032-01-01T00:00:00Z',
    place: (sim) => sim.goTo('saturn', 4.2, 40),
  },
  {
    file: 'rings-back.png',
    what: 'Кольца Сатурна с неосвещённой стороны: плотное B темнее разреженного C',
    date: '2032-01-01T00:00:00Z',
    // Камера встаёт зеркально Солнцу относительно плоскости колец: планета при
    // этом освещена, а кольца видны на просвет под тем же углом, что и на
    // кадре выше. Тот же Сатурн, та же дата — вся разница в стороне.
    place: (sim) => {
      const saturn = sim.system.find('saturn');
      const p = saturn.worldPosition;
      const V = p.constructor;

      const pole = new V(0, 1, 0).applyQuaternion(saturn.group.quaternion).normalize();
      const toSun = new V(-p.x, -p.y, -p.z).normalize();
      const mirrored = toSun.clone().addScaledVector(pole, -2 * toSun.dot(pole));
      const d = saturn.visualRadius * 4.2;

      sim.lookAt(
        [p.x + mirrored.x * d, p.y + mirrored.y * d, p.z + mirrored.z * d],
        [p.x, p.y, p.z],
      );
    },
  },
  {
    file: 'jupiter.png',
    what: 'Юпитер: полосы, Красное пятно и галилеевы спутники',
    place: (sim) => sim.goTo('jupiter', 4.6, 45),
  },
  {
    file: 'earth.png',
    what: 'Земля: океаны, облака, полярные шапки',
    place: (sim) => sim.goTo('earth', 3.0, 55),
  },
  {
    file: 'atmosphere.png',
    what: 'Атмосфера Земли с орбиты: голубая кайма и красный терминатор',
    // Камера на четырёхстах километрах над поверхностью — там, откуда
    // атмосферу и снимают, — смотрит вдоль горизонта назад, на терминатор:
    // именно в этом ракурсе видно, как голубое небо у горизонта краснеет.
    place: (sim) => {
      const earth = sim.system.find('earth');
      const e = earth.worldPosition;
      const s = sim.sun.worldPosition;

      let sx = s.x - e.x;
      let sy = s.y - e.y;
      let sz = s.z - e.z;
      const sl = Math.hypot(sx, sy, sz);
      sx /= sl;
      sy /= sl;
      sz /= sl;

      let ux = 0;
      let uy = 1;
      let uz = 0;
      const dot = sx * ux + sy * uy + sz * uz;
      ux -= sx * dot;
      uy -= sy * dot;
      uz -= sz * dot;
      const ul = Math.hypot(ux, uy, uz);
      ux /= ul;
      uy /= ul;
      uz /= ul;

      const point = (degrees, radius) => {
        const a = (degrees * Math.PI) / 180;
        return [
          e.x + (sx * Math.cos(a) + ux * Math.sin(a)) * radius,
          e.y + (sy * Math.cos(a) + uy * Math.sin(a)) * radius,
          e.z + (sz * Math.cos(a) + uz * Math.sin(a)) * radius,
        ];
      };

      sim.lookAt(point(100, earth.visualRadius + 400), point(72, earth.visualRadius));
    },
  },
  {
    file: 'moon.png',
    what: 'Луна: кратеры и моря вдоль терминатора',
    place: (sim) => sim.goTo('moon', 3.0, 75),
  },
  {
    file: 'milkyway.png',
    what: 'Млечный Путь: полоса Галактики и созвездия',
    // Камера смотрит в сторону центра Галактики (17ʰ45ᵐ, −29°), направление
    // переведено в координаты сцены поворотом на наклон эклиптики. Разметка
    // неба включается на этот кадр: полоса и линии созвездий вместе
    // показывают, что небо настоящее, а не декорация.
    place: (sim) => {
      const OBLIQUITY = (23.4392911 * Math.PI) / 180;
      const ra = (17 + 45 / 60) * (Math.PI / 12);
      const dec = (-28.94 * Math.PI) / 180;
      const x = Math.cos(dec) * Math.cos(ra);
      const y = Math.cos(dec) * Math.sin(ra);
      const z = Math.sin(dec);
      const at = [
        x,
        -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY),
        -(y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY)),
      ];
      const from = [3e8, 1e8, 2e8];
      sim.lookAt(from, [from[0] + at[0] * 1e12, from[1] + at[1] * 1e12, from[2] + at[2] * 1e12]);
    },
    sky: true,
  },
  {
    file: 'eclipse.png',
    what: 'Солнечное затмение 12 августа 2026 года: тень Луны на Земле',
    date: '2026-08-12T17:50:00Z',
    // Камера на оси лунной тени: пятно приходится на середину диска, вокруг
    // него — полутень в несколько тысяч километров.
    place: (sim) => {
      const earth = sim.system.find('earth');
      const moon = sim.system.find('moon');
      const sun = sim.sun.worldPosition;
      const m = moon.worldPosition;
      const e = earth.worldPosition;

      let dx = m.x - sun.x;
      let dy = m.y - sun.y;
      let dz = m.z - sun.z;
      const d = Math.hypot(dx, dy, dz);
      dx /= d;
      dy /= d;
      dz /= d;

      const ox = m.x - e.x;
      const oy = m.y - e.y;
      const oz = m.z - e.z;
      const b = 2 * (ox * dx + oy * dy + oz * dz);
      const c = ox * ox + oy * oy + oz * oz - earth.visualRadius * earth.visualRadius;
      const t = (-b - Math.sqrt(b * b - 4 * c)) / 2;

      let nx = m.x + dx * t - e.x;
      let ny = m.y + dy * t - e.y;
      let nz = m.z + dz * t - e.z;
      const n = Math.hypot(nx, ny, nz);
      nx /= n;
      ny /= n;
      nz /= n;

      const distance = earth.visualRadius * 3;
      sim.lookAt(
        [e.x + nx * distance, e.y + ny * distance, e.z + nz * distance],
        [e.x, e.y, e.z],
      );
    },
  },
  {
    file: 'system.png',
    what: 'Внутренняя система с орбитами — вид сверху',
    place: (sim) => sim.lookAt([1.5e8, 2.2e8, 2.6e8], [0, 0, 0]),
  },
  {
    file: 'interface.png',
    what: 'Интерфейс: список тел и карточка тела',
    // Именно перелёт, а не расстановка камеры: карточка тела появляется по
    // прибытии, вместе с привязкой к системе отсчёта планеты.
    place: (sim) => sim.travelTo('mars'),
    awaitTravel: true,
    // B открывает список тел.
    press: ['KeyB'],
  },
];

/** Экспозиция подтягивается полторы секунды, и после перестановки камеры ей нужно время. */
const SETTLE_MS = 5000;

const browser = await chromium.launch({
  args: [
    // Видеокарты в headless нет; программный растеризатор по умолчанию
    // считается «небезопасным» и WebGL2 без этого не выдаётся.
    '--enable-unsafe-swiftshader',
    '--no-proxy-server',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
});

const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

try {
  await page.goto(URL);
  await page.waitForFunction(() => typeof window.sim === 'object' && window.sim !== null, null, {
    timeout: 60_000,
  });

  // Справка открыта при загрузке и накрывает кадр — закрываем.
  await page.keyboard.press('Escape');
  await page.locator('#help.closed').waitFor();

  await page.evaluate((date) => {
    window.sim.clock.paused = true;
    window.sim.setDate(date);
  }, DATE);

  mkdirSync(OUTPUT, { recursive: true });

  for (const shot of SHOTS) {
    await page.evaluate((date) => window.sim.setDate(date), shot.date ?? DATE);
    await page.evaluate(`(${shot.place.toString()})(window.sim)`);
    if (shot.awaitTravel) {
      // Перелёт идёт секунды и во время него камера ещё в пути.
      await page.evaluate(() => {
        window.sim.clock.paused = false;
      });
      await page.waitForFunction(() => window.sim.travel.isActive === false, null, {
        timeout: 60_000,
      });
      await page.evaluate(() => {
        window.sim.clock.paused = true;
      });
    }
    for (const key of shot.press ?? []) await page.keyboard.press(key);
    // Разметка неба включается на свой кадр и тут же выключается: иначе
    // подписи звёзд остались бы на всех следующих снимках.
    if (shot.sky) await page.keyboard.press('KeyN');
    await page.waitForTimeout(SETTLE_MS);

    await page.screenshot({ path: resolve(OUTPUT, shot.file) });
    if (shot.sky) await page.keyboard.press('KeyN');
    console.log(`${shot.file} — ${shot.what}`);
  }
} finally {
  await browser.close();
}
