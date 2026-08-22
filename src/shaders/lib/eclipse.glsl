// Затмение: какую долю солнечного диска закрывает другое тело.
//
// Тень здесь не «эффект», а прямая геометрия: из точки поверхности видно два
// круга — Солнце и заслоняющее тело, — и вопрос лишь в том, насколько они
// перекрываются. Отсюда сразу и полутень (круги задели друг друга краями), и
// полная фаза (маленький круг целиком накрыл большой), и кольцеобразное
// затмение (Луна в апогее меньше Солнца и не закрывает его целиком) — ничего
// из этого не нужно программировать отдельно.

/**
 * Тела, способные закрыть Солнце: xyz — центр в координатах сцены, w — видимый
 * радиус, км. Их немного: родитель, соседи по родителю и собственные спутники.
 */
uniform vec4 uEclipseCasters[ECLIPSE_CASTERS];

/** Видимый радиус Солнца, км. */
uniform float uSunRadius;

/**
 * Плотность атмосферы у каждого заслоняющего тела — тем же числом, каким она
 * задана в его внешности. У безвоздушного тела ноль.
 */
uniform float uEclipseAir[ECLIPSE_CASTERS];

/**
 * Цвет света, пробравшегося в тень сквозь атмосферу.
 *
 * Солнечный свет проходит по касательной сквозь всю толщу воздуха, синее в
 * нём рассеивается, и в тень попадает то, что осталось, — медно-красное.
 * Ровно поэтому Луна в полном затмении не исчезает, а становится тёмно-красной.
 */
const vec3 ECLIPSE_GLOW_COLOR = vec3(1.0, 0.33, 0.11);

/**
 * Во сколько раз этот свет слабее прямого солнечного.
 *
 * Настоящая разница — тысячи раз, но такое число значило бы чёрный диск на
 * любой разумной экспозиции. Здесь взято столько, чтобы затменная Луна была
 * явно темнее полной и явно не пропадала: важен цвет и сам факт, а не
 * фотометрическая точность там, где её всё равно не с чем сверить.
 */
const float ECLIPSE_GLOW = 0.02;

/**
 * Доля закрытого солнечного диска: 0 — Солнце открыто, 1 — закрыто целиком.
 *
 * @param point точка поверхности в координатах сцены, км
 * @param toSun вектор от точки до центра Солнца, км
 * @param sunDistance его длина
 * @param sunRadius видимый радиус Солнца, км
 * @param caster xyz — центр заслоняющего тела в координатах сцены, w — радиус
 */
float eclipseCoverage(vec3 point, vec3 toSun, float sunDistance, float sunRadius, vec4 caster) {
  if (caster.w <= 0.0) return 0.0;

  vec3 toCaster = caster.xyz - point;
  float casterDistance = length(toCaster);

  // Тело за Солнцем ничего не заслоняет, а нулевое расстояние — это мы сами.
  if (casterDistance < 1.0 || casterDistance > sunDistance) return 0.0;

  float separation = acos(clamp(dot(toCaster / casterDistance, toSun / sunDistance), -1.0, 1.0));
  float sunAngle = asin(clamp(sunRadius / sunDistance, 0.0, 1.0));
  float casterAngle = asin(clamp(caster.w / casterDistance, 0.0, 1.0));

  // Больше, чем отношение площадей, закрыть нельзя: Луна в апогее меньше
  // Солнца, и затмение выходит кольцеобразным, а не полным.
  float deepest = min(1.0, (casterAngle * casterAngle) / max(sunAngle * sunAngle, 1e-12));

  // Круги разошлись — света полный; вложились друг в друга — тень предельная;
  // между этим полутень. Точная площадь пересечения кругов дала бы то же
  // самое с точностью до формы перехода, которую всё равно размывает атмосфера.
  float outer = sunAngle + casterAngle;
  float inner = abs(sunAngle - casterAngle);
  return deepest * (1.0 - smoothstep(inner, outer, separation));
}

/**
 * Во сколько раз ослаблен солнечный свет в точке. 1 — затмения нет.
 *
 * Заодно копит свет, попавший в тень сквозь атмосферу заслонившего тела:
 * он возвращается через inout-параметр, потому что считается из тех же
 * долей закрытого диска и второго прохода по соседям не стоит.
 */
float sunlightThrough(
  vec3 point,
  vec3 toSun,
  float sunDistance,
  float sunRadius,
  inout vec3 refracted
) {
  float light = 1.0;

  for (int i = 0; i < ECLIPSE_CASTERS; i++) {
    float coverage = eclipseCoverage(point, toSun, sunDistance, sunRadius, uEclipseCasters[i]);
    light *= 1.0 - coverage;
    refracted += ECLIPSE_GLOW_COLOR * (ECLIPSE_GLOW * uEclipseAir[i] * coverage);
  }

  return light;
}
