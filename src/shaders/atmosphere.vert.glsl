#include <common>
#include <logdepthbuf_pars_vertex>

varying vec3 vLocalPosition;

void main() {
  // Геометрия оболочки задана в настоящих километрах в системе координат
  // тела - в них же считается и весь интеграл рассеяния.
  vLocalPosition = position;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

  #include <logdepthbuf_vertex>
}
