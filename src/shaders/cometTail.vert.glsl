#include <common>
#include <logdepthbuf_pars_vertex>

/** Поперечная координата ленты: -1 у одного края, +1 у другого. */
attribute float aSide;
/** Доля пути от ядра к концу хвоста: 0 у ядра, 1 на конце. */
attribute float aReach;

varying float vSide;
varying float vReach;

void main() {
  vSide = aSide;
  vReach = aReach;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

  #include <logdepthbuf_vertex>
}
