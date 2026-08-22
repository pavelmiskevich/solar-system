/**
 * Поверхность тела и её освещение.
 *
 * Освещение считается вручную, а не стандартным материалом three, по двум
 * причинам. Первая: облучённость должна честно падать как 1/r² в диапазоне от
 * Меркурия до Плутона — это шесть порядков, и никакой «художественной»
 * подсветки теней быть не должно, иначе теряется главное ощущение — что
 * дальше от Солнца действительно темнее. Вторая: рисунок поверхности всё
 * равно процедурный, и разделять его с освещением незачем.
 *
 * Требует noise.glsl (gnoise, fbm) и, для твёрдых тел, cellular.glsl.
 */

#include <logdepthbuf_pars_fragment>

uniform vec3 uSunPosition;
/** Квадрат астрономической единицы: облучённость на 1 а.е. равна единице. */
uniform float uIrradianceScale;

/** Вторичный источник: Земля для Луны и наоборот. */
uniform vec3 uSecondPosition;
uniform vec3 uSecondColor;
uniform float uSecondStrength;

uniform vec3 uBase;
uniform vec3 uAccent;
uniform vec3 uHighlight;
uniform vec3 uCapColor;
uniform vec3 uAtmosphereColor;
uniform vec3 uSpotColor;

uniform float uDetail;
uniform float uContrast;
uniform float uCapLatitude;
uniform float uCraters;
uniform float uAtmosphere;
uniform float uSpecular;
uniform float uBumpScale;
uniform float uTime;

/** xyz — направление на центр пятна в системе тела, w — угловой радиус, рад. */
uniform vec4 uSpot;
/** x — вытянутость по долготе, y — сила. */
uniform vec2 uSpotShape;

#ifdef RING_SHADOW
/** Направление на Солнце в системе координат тела. */
uniform vec3 uSunBodyDirection;
/** Настоящие радиусы тела, км: в них же заданы радиусы колец. */
uniform float uTrueEquatorial;
uniform float uTruePolar;
#endif

varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

/**
 * Возмущение нормали по градиенту высоты, взятому экранными производными.
 * Высота нигде не хранится: она считается тем же шумом, что и цвет, а её
 * наклон восстанавливается из соседних пикселей — это стоит двух инструкций
 * вместо трёх лишних выборок шума.
 */
vec3 perturbNormal(vec3 N, vec3 posWorld, float height, float scale) {
  if (scale <= 0.0) return N;

  vec3 dpdx = dFdx(posWorld);
  vec3 dpdy = dFdy(posWorld);
  float dhdx = dFdx(height);
  float dhdy = dFdy(height);

  vec3 r1 = cross(dpdy, N);
  vec3 r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  if (abs(det) < 1e-12) return N;

  vec3 gradient = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * N - scale * gradient);
}

/** Синус широты → широта. */
float latitudeOf(vec3 p) {
  return asin(clamp(p.y, -1.0, 1.0));
}

/**
 * Маска пятна. Считается в широте и долготе, а не по углу между направлениями:
 * вихри газовых гигантов вытянуты вдоль полос, и круглое пятно на Юпитере
 * выглядит чужеродно.
 */
float spotMask(vec3 p) {
  if (uSpotShape.y <= 0.0) return 0.0;

  float latP = latitudeOf(p);
  float latC = latitudeOf(uSpot.xyz);
  float dLat = latP - latC;

  float lonP = atan(p.z, p.x);
  float lonC = atan(uSpot.z, uSpot.x);
  // Разность долгот через atan(sin, cos): иначе на нулевом меридиане разрыв.
  float dLon = atan(sin(lonP - lonC), cos(lonP - lonC)) * cos(latP);

  float d = length(vec2(dLon / uSpotShape.x, dLat)) / max(uSpot.w, 1e-4);
  return (1.0 - smoothstep(0.68, 1.0, d)) * uSpotShape.y;
}

void main() {
  #include <logdepthbuf_fragment>

  vec3 p = vObjectPosition;
  float height = 0.0;
  float gloss = 0.0;
  vec3 albedo;

#ifdef FAMILY_ROCKY
  // Твёрдая поверхность: крупные альбедные области, мелкая пестрота, кратеры.
  float macro = fbm(p * uDetail * 0.8, 4);
  float fine = fbm(p * uDetail * 5.0 + 3.7, 4);

  albedo = mix(uHighlight, uBase, smoothstep(-0.3, 0.35, macro + fine * 0.5));

  // Тёмные равнины: лунные моря, марсианский Сырт, пояс Плутона. Моря залиты
  // базальтом позже основной бомбардировки, поэтому они не только темнее, но и
  // заметно ровнее — кратеров на них почти нет, и это их главная примета.
  float plains = smoothstep(0.02, 0.13, macro);
  albedo = mix(albedo, uAccent, plains * uContrast);

  height = fine * 0.4 + macro * 0.3;

  if (uCraters > 0.0) {
    float basins = craterHeight(p * uDetail * 1.1);
    float big = craterHeight(p * uDetail * 3.6);
    float small = craterHeight(p * uDetail * 13.0);
    float craters = (basins * 1.3 + big + small * 0.5) * uCraters * (1.0 - plains * 0.75);
    height += craters * 0.8;
    // Свежий вал светлее выброшенным реголитом, дно темнее тенью и лавой.
    albedo *= 1.0 + craters * 0.16;
  }

  albedo = mix(albedo, uSpotColor, spotMask(p));

  // Полярная шапка с рваной границей: ровный круг выдаёт подделку сразу.
  float capEdge = uCapLatitude - fine * 0.07;
  albedo = mix(albedo, uCapColor, smoothstep(capEdge, capEdge + 0.035, abs(p.y)));
#endif

#ifdef FAMILY_GAS
  // Облачный слой: зоны и пояса по широте, размытые турбулентностью.
  // Шум сплюснут по вертикали — вихри вытягиваются вдоль полос, как в природе.
  // Шум сплюснут по вертикали в несколько раз: зональные ветры на порядок
  // быстрее меридиональных, и любой вихрь вытягивается вдоль полосы.
  float turbulence = fbm(vec3(p.x, p.y * 6.0, p.z) * uDetail * 0.45 + uTime * 0.003, 5);
  float wisps = fbm(vec3(p.x, p.y * 10.0, p.z) * uDetail * 1.1 + 5.2, 4);

  float lat = latitudeOf(p);
  // Второй синус ломает правильность: без него полосы ложатся мишенью, а у
  // гиганта они разной ширины, и границы у них рваные от той же турбулентности.
  float bands = sin(lat * uDetail * 4.2 + sin(lat * 5.3) * 1.1 + turbulence * 3.2 + wisps * 1.1);

  // Пояса и зоны несимметричны: тёмные пояса узкие, светлые зоны широкие.
  albedo = mix(uBase, uAccent, smoothstep(-0.35, -0.9, bands));
  albedo = mix(albedo, uHighlight, smoothstep(0.15, 0.85, bands));
  albedo *= 1.0 + wisps * 0.16 * uContrast;

  // Контраст задаёт, насколько далеко тон уходит от среднего: у Юпитера
  // пояса резкие, у Урана метановая дымка почти всё выравнивает.
  vec3 mean = (uBase + uHighlight) * 0.5;
  albedo = mix(mean, albedo, clamp(uContrast * 1.25, 0.0, 1.0));

  albedo = mix(albedo, uSpotColor, spotMask(p));

  // Полярная дымка: у гигантов полюса глуше и темнее полос.
  albedo = mix(albedo, mix(albedo, uAccent, 0.45) * 0.88, smoothstep(0.72, 0.98, abs(p.y)));
#endif

#ifdef FAMILY_EARTH
  float continents = fbm(p * uDetail, 6);
  float detail = fbm(p * uDetail * 5.0 + 3.1, 5);
  float band = abs(p.y);

  // Береговая линия: узкий переход, ниже него — океан. Мелкий шум рвёт её на
  // заливы и полуострова, без него материки outline'ом похожи на кляксы.
  // Порог смещён вверх: суша занимает три десятых поверхности, а не половину.
  float land = smoothstep(0.075, 0.115, continents + detail * 0.06);

  // Шельф светлее глубины — по нему и читается очертание материков.
  vec3 ocean = mix(uBase * 0.7, uBase * 1.6, smoothstep(-0.1, 0.075, continents));

  // Пояс пустынь около тридцатых широт, зелень в средних, тундра за шестидесятой.
  float arid = exp(-pow((band - 0.42) / 0.15, 2.0)) * 0.85 + smoothstep(0.32, 0.8, detail) * 0.45;
  vec3 ground = mix(uAccent, uHighlight, clamp(arid, 0.0, 1.0));
  ground = mix(ground, vec3(0.3, 0.33, 0.3), smoothstep(0.6, 0.9, band));
  // Пестрота растительного покрова: без неё материки выглядят залитыми одним
  // цветом, чего на снимках Земли не бывает нигде.
  ground *= 0.78 + fbm(p * uDetail * 14.0 + 17.0, 3) * 0.9;

  albedo = mix(ocean, ground, land);

  float capEdge = uCapLatitude - detail * 0.05;
  albedo = mix(albedo, uCapColor, smoothstep(capEdge, capEdge + 0.04, band));

  // Облака — отдельный слой поверх поверхности, и они же гасят блик.
  // Широтная модуляция обязательна: над экватором сплошная облачность зоны
  // конвергенции, над тридцатыми широтами — пояс пустынь и чистое небо.
  float clouds = smoothstep(0.05, 0.32, fbm(p * uDetail * 6.0 + vec3(uTime * 0.004, 0.0, 0.0), 6));
  clouds *= 0.5 + 0.5 * (1.0 - exp(-pow((band - 0.42) / 0.2, 2.0)));
  albedo = mix(albedo, vec3(0.94, 0.95, 0.98), clouds * 0.9);

  gloss = uSpecular * (1.0 - land) * (1.0 - clouds);
  height = continents * 0.6 + detail * 0.25;
#endif

  vec3 N = perturbNormal(normalize(vWorldNormal), vWorldPosition, height, uBumpScale);

  vec3 toSun = uSunPosition - vWorldPosition;
  float sunDistance = max(length(toSun), 1.0);
  vec3 L = toSun / sunDistance;
  float irradiance = uIrradianceScale / (sunDistance * sunDistance);

  // Терминатор: у безвоздушного тела граница света и тени почти геометрическая,
  // атмосфера её размывает тем сильнее, чем она плотнее.
  float wrap = 0.015 + uAtmosphere * 0.07;
  float ndl = dot(N, L);
  float diffuse = max((ndl + wrap) / (1.0 + wrap), 0.0);

  // Затмение: соседнее тело закрывает Солнце — целиком или частью диска.
  // Ослабляется весь прямой солнечный свет: и рассеянный поверхностью, и
  // блик, и свечение лимба. Пепельный свет считается от облучённости без
  // этой поправки — он приходит не от Солнца, а от соседа.
  float sunlight = 1.0;
  vec3 refracted = vec3(0.0);
#ifdef ECLIPSE_CASTERS
  sunlight = sunlightThrough(vWorldPosition, toSun, sunDistance, uSunRadius, refracted);
#endif
  float sunIrradiance = irradiance * sunlight;

  vec3 color = albedo * diffuse * sunIrradiance;

  // Свет, прошедший в тень сквозь атмосферу заслонившего тела. Он приходит
  // оттуда же, откуда солнечный, — значит, и падает на ту же половину диска.
  color += albedo * refracted * irradiance * max(ndl, 0.0);

#ifdef RING_SHADOW
  // Тень колец на планете. Из точки поверхности пускается луч на Солнце; если
  // он пересекает плоскость колец там, где кольцо плотное, точка в тени. Эта
  // полоса на диске Сатурна — примета не менее узнаваемая, чем сами кольца.
  if (abs(uSunBodyDirection.y) > 1e-4) {
    vec3 bodyPoint = vec3(
      vObjectPosition.x * uTrueEquatorial,
      vObjectPosition.y * uTruePolar,
      vObjectPosition.z * uTrueEquatorial
    );
    float t = -bodyPoint.y / uSunBodyDirection.y;
    if (t > 0.0) {
      vec3 crossing = bodyPoint + uSunBodyDirection * t;
      color *= 1.0 - ringDensity(length(crossing.xz)) * 0.88;
    }
  }
#endif

  vec3 V = normalize(-vWorldPosition);

  if (gloss > 0.0) {
    vec3 H = normalize(L + V);
    // Показатель высокий: солнечная дорожка на океане — это блик почти
    // зеркальной поверхности, а не широкое пятно глянца.
    float spec = pow(max(dot(N, H), 0.0), 260.0) * gloss * step(0.0, ndl);
    color += vec3(1.0, 0.97, 0.9) * spec * sunIrradiance * 1.6;
  }

  if (uAtmosphere > 0.0) {
    // Лимб: у края диска луч идёт сквозь толщу атмосферы по касательной и
    // проходит в разы больший путь — оттого край и светится.
    float rim = pow(1.0 - abs(dot(normalize(vWorldNormal), V)), 3.0);
    color += uAtmosphereColor * rim * uAtmosphere * 0.55 * max(ndl + 0.3, 0.0) * sunIrradiance;
  }

  if (uSecondStrength > 0.0) {
    // Пепельный свет: ночная сторона Луны подсвечена Землёй, и это не эффект,
    // а тот же солнечный свет, отражённый дважды.
    vec3 toSecond = uSecondPosition - vWorldPosition;
    float secondDistance = max(length(toSecond), 1.0);
    float diffuse2 = max(dot(N, toSecond / secondDistance), 0.0);
    color += albedo * diffuse2 * uSecondStrength * uSecondColor * irradiance;
  }

#ifdef FAMILY_EARTH
  // Огни городов. Видны только на суше, гаснут под облаками и появляются
  // после терминатора — там, где на дневной стороне их не различить.
  float night = smoothstep(0.06, -0.18, ndl);
  float cities = land * (1.0 - clouds) * smoothstep(0.42, 0.78, fbm(p * uDetail * 8.0 + 9.3, 4));
  color += vec3(1.0, 0.78, 0.42) * night * cities * 0.035;
#endif

  gl_FragColor = vec4(color, 1.0);
}
