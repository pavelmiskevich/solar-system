#include <common>
#include <logdepthbuf_pars_vertex>

varying vec3 vDirection;

void main() {
  // Сфера неба огромна и ездит вместе с камерой, поэтому направление на
  // точку — это просто её положение на сфере, без всяких вычитаний.
  vDirection = position;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

  #include <logdepthbuf_vertex>
}
