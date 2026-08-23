/**
 * Рассеяние света в атмосфере.
 *
 * Голубое небо, красный закат и светящийся ободок планеты — одно и то же
 * явление, а не три разных эффекта: молекулы воздуха рассеивают короткие
 * волны сильнее длинных (рэлеевское рассеяние, ~1/λ⁴), и оттого рассеянный в
 * сторону свет голубой, а прошедший сквозь толщу воздуха насквозь — красный.
 * У терминатора луч идёт по касательной и проходит в десятки раз больший
 * путь, чем в зените: синего в нём не остаётся вовсе, и ободок краснеет сам.
 *
 * Считается однократное рассеяние по лучу зрения: вдоль луча берётся
 * несколько точек, в каждой — сколько света дошло до неё от Солнца сквозь
 * атмосферу и сколько из рассеянного дойдёт до камеры. Многократное
 * рассеяние (свет, рассеянный дважды и трижды) не считается: оно даёт
 * заметный вклад только в глубоких сумерках, а стоит вдесятеро дороже.
 */

#include <logdepthbuf_pars_fragment>

/** Камера и направление на Солнце в системе координат тела, км. */
uniform vec3 uCameraLocal;
uniform vec3 uSunLocal;

uniform float uPlanetRadius;
uniform float uAtmosphereRadius;

/** Коэффициенты рассеяния, 1/км, и высоты однородной атмосферы, км. */
uniform vec3 uRayleigh;
uniform float uMie;
uniform float uScaleHeight;
uniform float uMieHeight;

/** Облучённость от Солнца на этом расстоянии — та же, что у поверхности. */
uniform float uSunIrradiance;

varying vec3 vLocalPosition;

/** Пи: три.js подставляет её только там, где подключён common. */
const float PI_ = 3.141592653589793;

/** Точек по лучу зрения и по лучу на Солнце. */
const int VIEW_STEPS = 16;
const int SUN_STEPS = 8;

/** Асимметрия рассеяния на аэрозоле: пыль и капли рассеивают вперёд. */
const float MIE_G = 0.76;

/**
 * Пересечение луча со сферой радиуса r с центром в начале координат.
 * Возвращает (вход, выход); x > y означает, что пересечения нет.
 */
vec2 raySphere(vec3 origin, vec3 direction, float r) {
  float b = dot(origin, direction);
  float c = dot(origin, origin) - r * r;
  float d = b * b - c;
  if (d < 0.0) return vec2(1.0, -1.0);

  float root = sqrt(d);
  return vec2(-b - root, -b + root);
}

/** Плотность воздуха на высоте h по двум шкалам: молекулы и аэрозоль. */
vec2 density(float height) {
  return exp(-max(height, 0.0) / vec2(uScaleHeight, uMieHeight));
}

void main() {
  #include <logdepthbuf_fragment>

  vec3 direction = normalize(vLocalPosition - uCameraLocal);

  vec2 atmosphere = raySphere(uCameraLocal, direction, uAtmosphereRadius);
  if (atmosphere.x > atmosphere.y) discard;

  float near = max(atmosphere.x, 0.0);
  float far = atmosphere.y;

  // Планета перекрывает луч: дальше её поверхности рассеивать нечего.
  vec2 planet = raySphere(uCameraLocal, direction, uPlanetRadius);
  if (planet.x <= planet.y && planet.y > 0.0) far = min(far, max(planet.x, 0.0));
  if (far <= near) discard;

  float step = (far - near) / float(VIEW_STEPS);
  vec2 viewDepth = vec2(0.0);
  vec3 rayleighSum = vec3(0.0);
  vec3 mieSum = vec3(0.0);

  for (int i = 0; i < VIEW_STEPS; i++) {
    vec3 point = uCameraLocal + direction * (near + step * (float(i) + 0.5));
    float height = length(point) - uPlanetRadius;
    vec2 local = density(height) * step;
    viewDepth += local;

    // Сколько света дошло сюда от Солнца. Луч на Солнце идёт сквозь ту же
    // атмосферу, и у терминатора этот путь в десятки раз длиннее.
    vec2 sunEdge = raySphere(point, uSunLocal, uAtmosphereRadius);
    vec2 sunGround = raySphere(point, uSunLocal, uPlanetRadius);
    // Точка в тени планеты: до неё прямой свет не доходит вовсе.
    if (sunGround.x <= sunGround.y && sunGround.y > 0.0 && sunGround.x > 0.0) continue;

    float sunStep = max(sunEdge.y, 0.0) / float(SUN_STEPS);
    vec2 sunDepth = vec2(0.0);
    for (int j = 0; j < SUN_STEPS; j++) {
      vec3 sunPoint = point + uSunLocal * (sunStep * (float(j) + 0.5));
      sunDepth += density(length(sunPoint) - uPlanetRadius) * sunStep;
    }

    // Ослабление по дороге туда и обратно. У аэрозоля поглощение примерно
    // на десятую часть больше рассеяния — отсюда множитель 1.1.
    vec3 opticalDepth =
      uRayleigh * (sunDepth.x + viewDepth.x) + uMie * 1.1 * (sunDepth.y + viewDepth.y);
    vec3 attenuation = exp(-opticalDepth);

    rayleighSum += local.x * attenuation;
    mieSum += local.y * attenuation;
  }

  float cosine = dot(direction, uSunLocal);
  float rayleighPhase = 3.0 / (16.0 * PI_) * (1.0 + cosine * cosine);

  float g2 = MIE_G * MIE_G;
  float miePhase = 3.0 / (8.0 * PI_) * ((1.0 - g2) * (1.0 + cosine * cosine)) /
    ((2.0 + g2) * pow(1.0 + g2 - 2.0 * MIE_G * cosine, 1.5));

  vec3 color = uSunIrradiance * (
    uRayleigh * rayleighSum * rayleighPhase +
    uMie * mieSum * miePhase
  );

  gl_FragColor = vec4(color, 1.0);
}
