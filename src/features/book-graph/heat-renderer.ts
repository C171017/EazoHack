import type { MapView } from '../../shared/schemas';
import { baseScale, type Size } from './map-framing';
import { SOURCE_Z_SPAN } from './projection';
import { HEAT_COLORS, HEAT_MAX, type HeatVolume } from './heat-field';

const vertex = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const colorVector = (rgb: readonly number[]) => `vec3(${rgb.map(c => (c / 255).toFixed(6)).join(',')})`;
const fragment = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler3D volume;
uniform vec2 resolution, viewport, pan;
uniform vec3 lower, upper, center, rightAxis, downAxis, depthAxis;
uniform float scale;
out vec4 outColor;
vec3 heatColor(float value) {
  vec3 green = ${colorVector(HEAT_COLORS[0].rgb)}, yellow = ${colorVector(HEAT_COLORS[1].rgb)};
  vec3 orange = ${colorVector(HEAT_COLORS[2].rgb)}, red = ${colorVector(HEAT_COLORS[3].rgb)};
  if (value < 4.0) return mix(green, yellow, clamp((value - 1.0) / 3.0, 0.0, 1.0));
  if (value < 8.0) return mix(yellow, orange, (value - 4.0) / 4.0);
  return mix(orange, red, clamp((value - 8.0) / 4.0, 0.0, 1.0));
}
void main() {
  vec2 pixel = vec2(gl_FragCoord.x / resolution.x, 1.0 - gl_FragCoord.y / resolution.y) * viewport;
  vec2 q = (pixel - viewport * .5 - pan) / scale;
  vec3 origin = center + rightAxis * q.x + downAxis * q.y;
  // Slab intersection with parallel-ray handling, including exact XY/XZ/YZ views.
  float enter = -1000000.0, leave = 1000000.0;
  for (int axis = 0; axis < 3; axis++) {
    float d = depthAxis[axis];
    if (abs(d) < .00001) {
      if (origin[axis] < lower[axis] || origin[axis] > upper[axis]) { outColor = vec4(0); return; }
    } else {
      float a = (lower[axis] - origin[axis]) / d, b = (upper[axis] - origin[axis]) / d;
      enter = max(enter, min(a, b)); leave = min(leave, max(a, b));
    }
  }
  if (leave <= enter) { outColor = vec4(0); return; }
  // Maximum intensity projection of a TRUE 3D sum. Projected overlap alone
  // cannot turn two depth-separated green sources yellow or red.
  float density = 0.0;
  for (int i = 0; i < 128; i++) {
    float t = mix(enter, leave, (float(i) + .5) / 128.0);
    vec3 uvw = (origin + depthAxis * t - lower) / (upper - lower);
    density = max(density, texture(volume, uvw).r);
    if (density > .998) break;
  }
  float value = density * ${HEAT_MAX.toFixed(1)};
  float alpha = smoothstep(.06, .85, value) * .76;
  outColor = vec4(heatColor(value) * alpha, alpha);
}`;

/** One GPU draw on demand; no animation loop and no third-party 3D engine. */
export function createHeatRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error('3D heat needs WebGL 2. Counts and saved results remain available.');
  function compile(type: number, source: string) {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, source); gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      const message = gl!.getShaderInfoLog(shader); gl!.deleteShader(shader); throw new Error(message ?? 'Heat shader failed');
    }
    return shader;
  }
  const program = gl.createProgram()!, vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); throw new Error('Heat shader link failed'); }
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, axis, gl.CLAMP_TO_EDGE);
  const uniforms = new Map(['volume', 'resolution', 'viewport', 'pan', 'lower', 'upper', 'center', 'rightAxis', 'downAxis', 'depthAxis', 'scale']
    .map(name => [name, gl.getUniformLocation(program, name)]));
  let uploaded: HeatVolume | null = null;
  return {
    draw(field: HeatVolume, view: MapView, size: Size, readingProgress: number) {
      if (!size.width || !size.height || gl.isContextLost()) return;
      // At most 180k shaded pixels, independent of display DPR or a 4K window.
      const ratio = Math.min(1, Math.sqrt(180000 / (size.width * size.height)));
      const width = Math.max(1, Math.round(size.width * ratio)), height = Math.max(1, Math.round(size.height * ratio));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height); gl.useProgram(program); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, texture);
      if (uploaded !== field) {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, ...field.dimensions, 0, gl.RED, gl.UNSIGNED_BYTE, field.data);
        uploaded = field;
      }
      const c = view.framing?.center ?? { x: 0, y: 0, z: 0 };
      const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
      gl.uniform1i(uniforms.get('volume')!, 0);
      gl.uniform2f(uniforms.get('resolution')!, width, height);
      gl.uniform2f(uniforms.get('viewport')!, size.width, size.height);
      gl.uniform2f(uniforms.get('pan')!, view.x, view.y);
      gl.uniform3f(uniforms.get('lower')!, field.min.x, field.min.y, field.min.z);
      gl.uniform3f(uniforms.get('upper')!, field.max.x, field.max.y, field.max.z);
      // Undo the reader's Z translation to sample the immutable source field.
      gl.uniform3f(uniforms.get('center')!, c.x, c.y, c.z - readingProgress * SOURCE_Z_SPAN);
      gl.uniform3f(uniforms.get('rightAxis')!, cy, sy, 0);
      gl.uniform3f(uniforms.get('downAxis')!, -sy * sp, cy * sp, -cp);
      gl.uniform3f(uniforms.get('depthAxis')!, -sy * cp, cy * cp, sp);
      gl.uniform1f(uniforms.get('scale')!, baseScale(size) * (view.framing?.scale ?? 1) * view.zoom);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() { gl.deleteTexture(texture); gl.deleteProgram(program); },
  };
}
