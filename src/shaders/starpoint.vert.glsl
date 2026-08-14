attribute float aSize;
attribute float aBrightness;
attribute vec3 aColor;

uniform float uPixelRatio;
uniform float uSizeScale;

varying vec3 vColor;
varying float vBrightness;

void main() {
  vColor = aColor;

  // Звёзды практически на бесконечности, поэтому размер точки задаётся не
  // расстоянием, а звёздной величиной — как и в реальности.
  float px = aSize * uSizeScale * uPixelRatio;
  float floorPx = 0.8 * uPixelRatio;

  gl_PointSize = max(px, floorPx);

  // Ниже предела в один пиксель уменьшать пятно уже некуда, поэтому остаток
  // перепада уходит в яркость: иначе слабые звёзды сравнялись бы с яркими.
  vBrightness = aBrightness * min(1.0, px / floorPx);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
