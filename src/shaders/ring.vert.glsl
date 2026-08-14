varying vec3 vBodyPosition;
varying vec3 vWorldPosition;

void main() {
  // Геометрия кольца задана в километрах в системе координат тела: плоскость
  // колец — экватор планеты, и поворачивать её отдельно не нужно.
  vBodyPosition = position;

  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;

  gl_Position = projectionMatrix * viewMatrix * world;
}
