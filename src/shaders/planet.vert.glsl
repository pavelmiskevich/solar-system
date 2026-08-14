/**
 * Геометрия у всех тел одна — единичная сфера, а настоящий радиус и полярное
 * сжатие задаются масштабом. Нормаль от этого перестаёт совпадать с позицией:
 * у эллипсоида она равна (x/a², y/b², z/a²), и без деления на квадрат масштаба
 * освещение Сатурна врёт ровно на его сжатие.
 */
uniform vec3 uInvScaleSq;

varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  // Рисунок поверхности живёт в системе координат тела и вращается вместе с ним.
  vObjectPosition = normalize(position);

  vWorldNormal = normalize(mat3(modelMatrix) * (position * uInvScaleSq));

  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;

  gl_Position = projectionMatrix * viewMatrix * world;
}
