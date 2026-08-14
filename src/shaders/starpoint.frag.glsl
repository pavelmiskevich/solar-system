uniform float uIntensity;

varying vec3 vColor;
varying float vBrightness;

void main() {
  // Мягкий круглый профиль вместо квадратной точки.
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;

  float core = exp(-r2 * 5.0);
  float glow = pow(max(0.0, 1.0 - r2), 2.0) * 0.35;
  float a = (core + glow) * vBrightness * uIntensity;

  // Альфа ровно единица, а не `a`. Аддитивное смешивание в three — это
  // (SrcAlpha, One), то есть вклад фрагмента уже домножается на альфу. Если
  // записать сюда `a`, яркость пойдёт как a², и любая линейная компенсация
  // экспозиции перестанет работать: у Нептуна звёзды просто исчезают.
  gl_FragColor = vec4(vColor * a, 1.0);
}
