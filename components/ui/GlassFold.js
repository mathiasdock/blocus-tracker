import { useEffect, useRef } from "react";

// GradFlow / 21st.dev Glass Fold. Original shader and palette; only the host
// lifecycle is adapted for Focus (pause/visibility, bounded buffers, cleanup).
// Source supplied by the user: https://gradflow.meerbahadin.dev
const VERTEX = `
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT = `
  precision highp float;

  uniform float u_time;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform vec3 u_color3;
  uniform float u_scale;
  uniform float u_noise;
  uniform vec2 u_resolution;
  varying vec2 vUv;

  float grain(vec2 st) {
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
  }

  // centered coordinates, y in [-0.5, 0.5], x stretched by the aspect ratio
  vec2 centered(vec2 uv) {
    vec2 p = uv - 0.5;
    p.x *= u_resolution.x / max(u_resolution.y, 1.0);
    return p;
  }

  mat2 rot(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
  }

  // panes of glass folded over each other. Each pane has one creased edge
  // that catches the light and thins out to nothing behind it; panes screen
  // over one another, so overlaps get brighter instead of darker.
  vec3 shade(vec2 uv, float time) {
    vec2 q = rot(0.6) * centered(uv) * 2.0 * u_scale;
    float t = time * 0.6;
    float pixel = 2.0 * u_scale / max(u_resolution.y, 1.0);

    vec3 color = mix(u_color2, u_color2 * 0.45, clamp(length(centered(uv)) * 1.3, 0.0, 1.0));

    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float bend = mod(fi, 2.0) * 2.0 - 1.0;

      float crease = (fi - 2.5) * 0.4
                   + 0.26 * sin(q.x * (1.05 + 0.12 * fi) + fi * 1.9 + t * (0.25 + 0.05 * fi))
                   + 0.1 * bend * q.x * q.x;
      float s = q.y - crease;
      float pane = smoothstep(-pixel, pixel, s);
      float back = max(s, 0.0);

      // thick near the crease, clear further in
      float body = exp(-back * 1.7);
      float fresnel = exp(-back * 8.0);
      // the lit edge, and a fainter line just inside it for the glass's thickness
      float rim = exp(-back * 80.0);
      float inner = exp(-pow((back - 0.045) / 0.014, 2.0));
      float bloom = exp(-abs(s) * 20.0);

      vec3 tint = mix(u_color1, u_color3, clamp(fresnel * 0.6 + 0.08 + 0.14 * sin(fi * 2.1 + q.x * 0.8 + t * 0.2), 0.0, 1.0));
      vec3 light = tint * pane * (body * 0.42 + fresnel * 0.4)
                 + u_color3 * (pane * (rim * 0.6 + inner * 0.12) + bloom * 0.1);

      // screen blend
      color += light * (1.0 - color);
    }

    return clamp(color, 0.0, 1.0);
  }

  void main() {
    vec3 color = shade(vUv, u_time);
    if (u_noise > 0.001) {
      float g = grain(vUv * 200.0 + u_time * 0.1);
      color *= 1.0 - u_noise * 0.4 + u_noise * g * 0.4;
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

function hexToVec3(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Optional development-only measurement of real GPU draw time, not a claimed
// hardware guarantee. Unsupported/disjoint timer queries are simply discarded.
function gpuProfile(gl, enabled) {
  const ext = enabled ? gl.getExtension("EXT_disjoint_timer_query") : null;
  const pending = [], samples = [];
  let active = null, measured = 0;
  const release = () => {
    if (active) { ext.endQueryEXT(ext.TIME_ELAPSED_EXT); ext.deleteQueryEXT(active); active = null; }
    pending.splice(0).forEach(query => ext.deleteQueryEXT(query));
  };
  return {
    begin() {
      if (!ext || measured >= 90) return;
      while (pending.length && ext.getQueryObjectEXT(pending[0], ext.QUERY_RESULT_AVAILABLE_EXT)) {
        const query = pending.shift();
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) samples.push(ext.getQueryObjectEXT(query, ext.QUERY_RESULT_EXT) / 1e6);
        ext.deleteQueryEXT(query);
      }
      if (samples.length >= 60) {
        const sorted = [...samples].sort((a, b) => a - b);
        console.info("Glass Fold GPU profile", JSON.stringify({ samples: samples.length, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * .95)], width: gl.canvas.width, height: gl.canvas.height }));
        measured = 90; release(); return;
      }
      if (pending.length >= 4) return;
      active = ext.createQueryEXT();
      if (active) { ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, active); measured += 1; }
    },
    end() { if (active) { ext.endQueryEXT(ext.TIME_ELAPSED_EXT); pending.push(active); active = null; } },
    dispose: release,
  };
}

export default function GlassFold({
  color1 = "#1e3cc8", color2 = "#06081e", color3 = "#96d7ff",
  speed = 0.5, scale = 1, noise = 0.12, isPlaying = true, profile = false, className = "",
}) {
  const containerRef = useRef(null);
  const settings = useRef({});
  settings.current = { color1, color2, color3, speed, scale, noise, isPlaying };
  const refreshRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "display:block;width:100%;height:100%;opacity:0";
    container.appendChild(canvas);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let gl, program, buffer, uniforms, profiler;
    let shaders = [], frame = 0, elapsed = 0, last = null, lastDraw = null, lost = false, failed = false, disposed = false;

    const stop = () => { cancelAnimationFrame(frame); frame = 0; last = null; lastDraw = null; };
    const release = () => {
      profiler?.dispose(); profiler = null;
      if (gl) {
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        shaders.forEach(shader => gl.deleteShader(shader));
      }
      buffer = program = uniforms = null; shaders = [];
    };
    const fail = () => { failed = true; stop(); canvas.style.opacity = "0"; canvas.removeAttribute("data-ready"); release(); };
    const resize = () => {
      const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
      // Never multiply by retina DPR. Bound fragment work to ~1M pixels on
      // large screens; scale is the source fold-density uniform, not resolution.
      const ratio = Math.min(1, Math.sqrt(1048576 / (width * height)), 2048 / Math.max(width, height));
      const w = Math.max(1, Math.floor(width * ratio)), h = Math.max(1, Math.floor(height * ratio));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    };
    const draw = () => {
      if (disposed || failed || lost || document.hidden || !program) return;
      try {
        const p = settings.current;
        gl.uniform1f(uniforms.time, elapsed);
        gl.uniform3fv(uniforms.color1, hexToVec3(p.color1));
        gl.uniform3fv(uniforms.color2, hexToVec3(p.color2));
        gl.uniform3fv(uniforms.color3, hexToVec3(p.color3));
        gl.uniform1f(uniforms.scale, p.scale);
        gl.uniform1f(uniforms.noise, p.noise);
        gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
        profiler?.begin(); gl.drawArrays(gl.TRIANGLES, 0, 6); profiler?.end();
        canvas.style.opacity = "1"; canvas.setAttribute("data-ready", "true");
      } catch { fail(); }
    };
    const canAnimate = () => !disposed && !failed && !lost && !document.hidden && !reduced.matches && settings.current.isPlaying && settings.current.speed > 0;
    const loop = now => {
      frame = 0;
      if (!canAnimate()) { last = null; return; }
      // Original time accumulation at speed 0.5; frame scheduling never
      // changes perceived speed. Hidden/paused intervals are not accumulated.
      if (last !== null) elapsed += Math.min((now - last) / 1000, 0.1) * settings.current.speed;
      last = now;
      if (lastDraw === null || now - lastDraw >= 1000 / 30 - 0.5) { draw(); lastDraw = now; }
      if (canAnimate()) frame = requestAnimationFrame(loop);
    };
    const refresh = () => { stop(); draw(); if (canAnimate()) frame = requestAnimationFrame(loop); };
    const onResize = () => { if (program && !lost && !failed) { resize(); draw(); } };
    const initialize = () => {
      if (disposed) return;
      try {
        gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
        if (!gl) { fail(); return; }
        const compile = (type, source) => {
          const shader = gl.createShader(type);
          if (!shader) throw Error("Shader allocation failed");
          shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error("Shader compilation failed");
          return shader;
        };
        program = gl.createProgram();
        if (!program) throw Error("Program allocation failed");
        gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error("Shader link failed");
        gl.useProgram(program);
        buffer = gl.createBuffer();
        if (!buffer) throw Error("Buffer allocation failed");
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "position");
        if (position < 0) throw Error("Position attribute missing");
        gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        uniforms = Object.fromEntries(["time", "color1", "color2", "color3", "scale", "noise", "resolution"].map(name => [name, gl.getUniformLocation(program, `u_${name}`)]));
        profiler = gpuProfile(gl, process.env.NODE_ENV === "development" && profile);
        lost = failed = false; resize(); refresh();
      } catch { fail(); }
    };
    const onLost = event => { event.preventDefault(); lost = true; stop(); canvas.style.opacity = "0"; canvas.removeAttribute("data-ready"); release(); };
    const onRestored = () => initialize();
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", refresh);
    reduced.addEventListener("change", refresh);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
    observer?.observe(container);
    refreshRef.current = refresh; initialize();
    return () => {
      disposed = true; stop(); observer?.disconnect();
      window.removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", refresh); reduced.removeEventListener("change", refresh);
      canvas.removeEventListener("webglcontextlost", onLost); canvas.removeEventListener("webglcontextrestored", onRestored);
      refreshRef.current = null; release(); gl?.getExtension("WEBGL_lose_context")?.loseContext(); canvas.remove();
    };
  }, [profile]);

  useEffect(() => { refreshRef.current?.(); }, [color1, color2, color3, speed, scale, noise, isPlaying]);
  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
