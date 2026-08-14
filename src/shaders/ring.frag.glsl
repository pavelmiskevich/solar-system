/**
 * Кольца: яркость и прозрачность на расстоянии от планеты.
 *
 * Кольцо — это не диск, а миллиарды ледяных обломков в одной плоскости.
 * Отсюда всё поведение: оно светится отражённым светом пропорционально
 * наклону плоскости к Солнцу, с освещённой стороны выглядит ярче, чем на
 * просвет, у края становится плотнее — луч зрения проходит сквозь большую
 * толщу, — и на нём лежит тень планеты.
 *
 * Требует noise.glsl и rings.glsl.
 */

uniform vec3 uSunPosition;
uniform float uIrradianceScale;
/** Направление на Солнце в системе координат тела. */
uniform vec3 uSunBodyDirection;
/** Положение камеры в системе координат тела, км. */
uniform vec3 uCameraBodyPosition;
uniform vec3 uColor;
uniform float uEquatorial;
uniform float uPolar;

varying vec3 vBodyPosition;
varying vec3 vWorldPosition;

void main() {
  float radius = length(vBodyPosition.xz);
  float density = ringDensity(radius);
  if (density < 0.004) discard;

  vec3 toSun = uSunPosition - vWorldPosition;
  float sunDistance = max(length(toSun), 1.0);
  float irradiance = uIrradianceScale / (sunDistance * sunDistance);

  // Поток на единицу площади кольца падает с наклоном плоскости к Солнцу.
  // В равноденствие на Сатурне кольца гаснут почти полностью — и это правда.
  float sunElevation = abs(uSunBodyDirection.y);

  // С освещённой стороны кольцо отражает, с теневой — просвечивает.
  vec3 viewDirection = normalize(vBodyPosition - uCameraBodyPosition);
  float lit = step(0.0, -viewDirection.y * uSunBodyDirection.y);
  float scatter = mix(0.32, 1.0, lit);

  float shadow = planetShadow(vBodyPosition, uSunBodyDirection, uEquatorial, uPolar);

  // У края луч зрения идёт вдоль плоскости и проходит сквозь большую толщу:
  // кольцо становится непрозрачнее, хотя вещества в нём не прибавилось.
  float grazing = clamp(density / max(abs(viewDirection.y), 0.08), 0.0, 1.0);

  vec3 color = uColor * density * irradiance * sunElevation * scatter * shadow;
  gl_FragColor = vec4(color, grazing * mix(0.8, 1.0, lit));
}
