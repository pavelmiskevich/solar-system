varying vec3 vObjectPosition;
varying vec3 vViewNormal;
varying vec3 vViewPosition;

void main() {
  vObjectPosition = normalize(position);
  vViewNormal = normalize(normalMatrix * normal);

  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = viewPosition.xyz;

  gl_Position = projectionMatrix * viewPosition;
}
