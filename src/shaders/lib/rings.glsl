// Кольца планеты: плотность вещества по расстоянию от центра и тень планеты.
// Общий код для материала самих колец и для теста «падает ли тень кольца на
// планету»: расходиться этим двум местам нельзя, иначе тень ляжет не туда, где
// кольцо. Требует gnoise/fbm из noise.glsl.
//
// Система колец описана набором полос: внутренний радиус, внешний, плотность и
// мягкость края. Отрицательная плотность — щель, вычитающая вещество: так
// задана щель Энке в кольце A. Числа приходят из данных, а не зашиты сюда,
// потому что кольца Сатурна и Урана устроены совершенно по-разному — у первого
// это сплошной диск шириной в шестьдесят тысяч километров, у второго десяток
// нитей шириной в единицы километров.

uniform float uRingInner;
uniform float uRingOuter;
uniform vec4 uRingBands[RING_BANDS];
/** Сила мелкой структуры: у ледяных колец Сатурна тысячи колечек, у Урана нет. */
uniform float uRingletStrength;

/** Плотность колец на расстоянии r от центра планеты, км. 0…1. */
float ringDensity(float r) {
  if (r < uRingInner || r > uRingOuter) return 0.0;

  // Сколько километров радиуса приходится на пиксель экрана. Кольца Урана
  // шириной в два километра тоньше пикселя с любого разумного расстояния:
  // без этой поправки они превращались бы в мерцающую пунктирную кашу.
  float pixel = max(fwidth(r), 1e-4);

  float density = 0.0;

  for (int i = 0; i < RING_BANDS; i++) {
    vec4 band = uRingBands[i];
    float width = band.y - band.x;
    if (width <= 0.0) continue;

    // Край не может быть резче пикселя.
    float edge = max(band.w, pixel);
    float profile =
      smoothstep(band.x - edge * 0.5, band.x + edge * 0.5, r) *
      (1.0 - smoothstep(band.y - edge * 0.5, band.y + edge * 0.5, r));

    // Полоса тоньше пикселя рисуется шириной в пиксель, но во столько же раз
    // тусклее: вещества в ней не прибавилось. Тот же приём, которым спасены
    // от исчезновения далёкие планеты и звёзды.
    density += band.z * profile * min(1.0, width / pixel);
  }

  if (uRingletStrength > 0.0) {
    float ringlets = fbm(vec3(r * 0.0016, 0.0, 0.0), 5) + fbm(vec3(r * 0.012, 3.0, 0.0), 3) * 0.4;
    density *= 1.0 - uRingletStrength + uRingletStrength * (0.72 + 0.55 * (ringlets + 0.5));
  }

  return clamp(density, 0.0, 1.0);
}

/**
 * Затенение планетой: 0 — полная тень, 1 — свет.
 *
 * @param pos точка в системе координат тела, км
 * @param toSun направление на Солнце в той же системе
 * @param equatorial экваториальный радиус планеты
 * @param polar полярный радиус планеты
 */
float planetShadow(vec3 pos, vec3 toSun, float equatorial, float polar) {
  // Сжатие вдоль оси превращает эллипсоид в сферу — дальше обычный тест луча.
  float k = equatorial / polar;
  vec3 p = vec3(pos.x, pos.y * k, pos.z);
  vec3 l = normalize(vec3(toSun.x, toSun.y * k, toSun.z));

  float t = dot(-p, l);
  if (t <= 0.0) return 1.0;

  float distance = length(p + l * t);
  // Мягкий край: у тени планеты есть полутень, и она заметно шире пикселя.
  return smoothstep(equatorial * 0.995, equatorial * 1.03, distance);
}
