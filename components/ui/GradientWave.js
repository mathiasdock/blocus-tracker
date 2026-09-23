import { useEffect, useRef } from "react";

// Animated mesh gradient (WebGL), from 21st.dev's "Gradient Wave" — itself a
// port of Stripe's minigl gradient. Ported to plain JavaScript for this
// project (no TypeScript, no shadcn) and hardened for a background that stays
// on screen while someone types:
//
// - renders at a fraction of the screen resolution: a gradient has no detail
//   to lose, and a quarter of the pixels is a quarter of the GPU work;
// - capped frame rate, and no frame at all while the tab is hidden;
// - a single still frame under prefers-reduced-motion;
// - the resize listener is removed on unmount (the original leaked it);
// - any WebGL failure leaves the container's CSS background in place.

function normalizeColor(hexCode) {
  return [((hexCode >> 16) & 255) / 255, ((hexCode >> 8) & 255) / 255, (255 & hexCode) / 255];
}

class MiniGl {
  constructor(canvas) {
    this.canvas = canvas;
    this.meshes = [];
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;
    const context = gl;
    const miniGl = this;

    this.Uniform = class {
      constructor(options) {
        this.type = "float";
        Object.assign(this, options);
        const typeMap = { float: "1f", int: "1i", vec2: "2fv", vec3: "3fv", vec4: "4fv", mat4: "Matrix4fv" };
        this.typeFn = typeMap[this.type] || "1f";
      }

      update(location) {
        if (this.value === undefined || location === null) return;
        const fn = `uniform${this.typeFn}`;
        if (this.typeFn.indexOf("Matrix") === 0) context[fn](location, this.transpose || false, this.value);
        else context[fn](location, this.value);
      }

      getDeclaration(name, type, length) {
        if (this.excludeFrom === type) return "";
        if (this.type === "array") {
          return `${this.value[0].getDeclaration(name, type, this.value.length)}\nconst int ${name}_length = ${this.value.length};`;
        }
        if (this.type === "struct") {
          let structName = name.replace("u_", "");
          structName = structName.charAt(0).toUpperCase() + structName.slice(1);
          const fields = Object.entries(this.value)
            .map(([field, uniform]) => uniform.getDeclaration(field, type).replace(/^uniform/, ""))
            .join("");
          return `uniform struct ${structName}\n{\n${fields}\n} ${name}${length ? `[${length}]` : ""};`;
        }
        return `uniform ${this.type} ${name}${length ? `[${length}]` : ""};`;
      }
    };

    this.Attribute = class {
      constructor(options) {
        this.type = context.FLOAT;
        this.normalized = false;
        this.buffer = context.createBuffer();
        Object.assign(this, options);
      }

      update() {
        if (!this.values) return;
        context.bindBuffer(this.target, this.buffer);
        context.bufferData(this.target, this.values, context.STATIC_DRAW);
      }

      attach(name, program) {
        const location = context.getAttribLocation(program, name);
        if (this.target === context.ARRAY_BUFFER) {
          context.bindBuffer(this.target, this.buffer);
          context.enableVertexAttribArray(location);
          context.vertexAttribPointer(location, this.size, this.type, this.normalized, 0, 0);
        }
        return location;
      }

      use(location) {
        context.bindBuffer(this.target, this.buffer);
        if (this.target === context.ARRAY_BUFFER) {
          context.enableVertexAttribArray(location);
          context.vertexAttribPointer(location, this.size, this.type, this.normalized, 0, 0);
        }
      }
    };

    this.Material = class {
      constructor(vertexShaders, fragments, uniforms = {}) {
        this.uniforms = uniforms;
        this.uniformInstances = [];
        const shader = (type, source) => {
          const compiled = context.createShader(type);
          context.shaderSource(compiled, source);
          context.compileShader(compiled);
          if (!context.getShaderParameter(compiled, context.COMPILE_STATUS)) {
            throw new Error(`Shader compilation error: ${context.getShaderInfoLog(compiled)}`);
          }
          return compiled;
        };
        const declarations = (list, type) => Object.entries(list)
          .map(([uniform, value]) => value.getDeclaration(uniform, type))
          .join("\n");
        const prefix = "precision highp float;";
        const vertexSource = `
          ${prefix}
          attribute vec4 position;
          attribute vec2 uv;
          attribute vec2 uvNorm;
          ${declarations(miniGl.commonUniforms, "vertex")}
          ${declarations(uniforms, "vertex")}
          ${vertexShaders}
        `;
        const fragmentSource = `
          ${prefix}
          ${declarations(miniGl.commonUniforms, "fragment")}
          ${declarations(uniforms, "fragment")}
          ${fragments}
        `;
        this.program = context.createProgram();
        context.attachShader(this.program, shader(context.VERTEX_SHADER, vertexSource));
        context.attachShader(this.program, shader(context.FRAGMENT_SHADER, fragmentSource));
        context.linkProgram(this.program);
        if (!context.getProgramParameter(this.program, context.LINK_STATUS)) {
          throw new Error(`Program linking error: ${context.getProgramInfoLog(this.program)}`);
        }
        context.useProgram(this.program);
        this.attachUniforms(undefined, miniGl.commonUniforms);
        this.attachUniforms(undefined, this.uniforms);
      }

      attachUniforms(name, uniforms) {
        if (name === undefined) {
          Object.entries(uniforms).forEach(([key, uniform]) => this.attachUniforms(key, uniform));
        } else if (uniforms.type === "array") {
          uniforms.value.forEach((uniform, index) => this.attachUniforms(`${name}[${index}]`, uniform));
        } else if (uniforms.type === "struct") {
          Object.entries(uniforms.value).forEach(([key, uniform]) => this.attachUniforms(`${name}.${key}`, uniform));
        } else {
          this.uniformInstances.push({ uniform: uniforms, location: context.getUniformLocation(this.program, name) });
        }
      }
    };

    this.PlaneGeometry = class {
      constructor() {
        this.width = 1;
        this.height = 1;
        this.vertexCount = 0;
        this.xSegCount = 0;
        this.ySegCount = 0;
        this.attributes = {
          position: new miniGl.Attribute({ target: context.ARRAY_BUFFER, size: 3 }),
          uv: new miniGl.Attribute({ target: context.ARRAY_BUFFER, size: 2 }),
          uvNorm: new miniGl.Attribute({ target: context.ARRAY_BUFFER, size: 2 }),
          index: new miniGl.Attribute({ target: context.ELEMENT_ARRAY_BUFFER, size: 3, type: context.UNSIGNED_SHORT }),
        };
      }

      setTopology(xSegs = 1, ySegs = 1) {
        this.xSegCount = xSegs;
        this.ySegCount = ySegs;
        this.vertexCount = (xSegs + 1) * (ySegs + 1);
        const quadCount = xSegs * ySegs * 2;
        const { uv, uvNorm, index } = this.attributes;
        uv.values = new Float32Array(2 * this.vertexCount);
        uvNorm.values = new Float32Array(2 * this.vertexCount);
        index.values = new Uint16Array(3 * quadCount);
        for (let y = 0; y <= ySegs; y += 1) {
          for (let x = 0; x <= xSegs; x += 1) {
            const i = y * (xSegs + 1) + x;
            uv.values[2 * i] = x / xSegs;
            uv.values[2 * i + 1] = 1 - y / ySegs;
            uvNorm.values[2 * i] = (x / xSegs) * 2 - 1;
            uvNorm.values[2 * i + 1] = 1 - (y / ySegs) * 2;
            if (x < xSegs && y < ySegs) {
              const s = y * xSegs + x;
              index.values[6 * s] = i;
              index.values[6 * s + 1] = i + 1 + xSegs;
              index.values[6 * s + 2] = i + 1;
              index.values[6 * s + 3] = i + 1;
              index.values[6 * s + 4] = i + 1 + xSegs;
              index.values[6 * s + 5] = i + 2 + xSegs;
            }
          }
        }
        uv.update();
        uvNorm.update();
        index.update();
      }

      setSize(width = 1, height = 1) {
        this.width = width;
        this.height = height;
        const position = this.attributes.position;
        position.values = new Float32Array(3 * this.vertexCount);
        const offsetX = width / -2;
        const offsetY = height / -2;
        const segWidth = width / this.xSegCount;
        const segHeight = height / this.ySegCount;
        for (let y = 0; y <= this.ySegCount; y += 1) {
          const posY = offsetY + y * segHeight;
          for (let x = 0; x <= this.xSegCount; x += 1) {
            const idx = y * (this.xSegCount + 1) + x;
            position.values[3 * idx] = offsetX + x * segWidth;
            position.values[3 * idx + 1] = -posY;
            position.values[3 * idx + 2] = 0;
          }
        }
        position.update();
      }
    };

    this.Mesh = class {
      constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
        this.attributeInstances = Object.entries(geometry.attributes).map(([name, attribute]) => ({
          attribute,
          location: attribute.attach(name, material.program),
        }));
        miniGl.meshes.push(this);
      }

      draw() {
        context.useProgram(this.material.program);
        this.material.uniformInstances.forEach(({ uniform, location }) => uniform.update(location));
        this.attributeInstances.forEach(({ attribute, location }) => attribute.use(location));
        context.drawElements(context.TRIANGLES, this.geometry.attributes.index.values.length, context.UNSIGNED_SHORT, 0);
      }
    };

    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    this.commonUniforms = {
      projectionMatrix: new this.Uniform({ type: "mat4", value: identity }),
      modelViewMatrix: new this.Uniform({ type: "mat4", value: identity }),
      resolution: new this.Uniform({ type: "vec2", value: [1, 1] }),
      aspectRatio: new this.Uniform({ type: "float", value: 1 }),
    };
  }

  // The scene keeps its CSS-pixel coordinates (the noise is scaled on them);
  // only the drawing buffer shrinks, and the browser stretches it back.
  setSize(width, height, scale) {
    this.width = width;
    this.height = height;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    this.commonUniforms.resolution.value = [width, height];
    this.commonUniforms.aspectRatio.value = width / height;
  }

  setOrthographicCamera() {
    this.commonUniforms.projectionMatrix.value = [
      2 / this.width, 0, 0, 0,
      0, 2 / this.height, 0, 0,
      0, 0, -0.001, 0,
      0, 0, 0, 1,
    ];
  }

  render() {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clearDepth(1);
    this.meshes.forEach(mesh => mesh.draw());
  }
}

const VERTEX_SHADER = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

vec3 blendNormal(vec3 base, vec3 blend, float opacity) { return (blend * opacity + base * (1.0 - opacity)); }

varying vec3 v_color;

void main() {
  float time = u_time * u_global.noiseSpeed;
  vec2 noiseCoord = resolution * uvNorm * u_global.noiseFreq;
  float tilt = resolution.y / 2.0 * uvNorm.y;
  float incline = resolution.x * uvNorm.x / 2.0 * u_vertDeform.incline;
  float offset = resolution.x / 2.0 * u_vertDeform.incline * mix(u_vertDeform.offsetBottom, u_vertDeform.offsetTop, uv.y);

  float noise = snoise(vec3(
    noiseCoord.x * u_vertDeform.noiseFreq.x + time * u_vertDeform.noiseFlow,
    noiseCoord.y * u_vertDeform.noiseFreq.y,
    time * u_vertDeform.noiseSpeed + u_vertDeform.noiseSeed
  )) * u_vertDeform.noiseAmp;

  noise *= 1.0 - pow(abs(uvNorm.y), 2.0);
  noise = max(0.0, noise);

  vec3 pos = vec3(position.x, position.y + tilt + incline + noise - offset, position.z);

  v_color = u_baseColor;

  for (int i = 0; i < u_waveLayers_length; i++) {
    if (u_active_colors[i + 1] == 1.) {
      WaveLayers layer = u_waveLayers[i];
      float layerNoise = smoothstep(
        layer.noiseFloor,
        layer.noiseCeil,
        snoise(vec3(
          noiseCoord.x * layer.noiseFreq.x + time * layer.noiseFlow,
          noiseCoord.y * layer.noiseFreq.y,
          time * layer.noiseSpeed + layer.noiseSeed
        )) / 2.0 + 0.5
      );
      v_color = blendNormal(v_color, layer.color, pow(layerNoise, 4.));
    }
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;

const FRAGMENT_SHADER = `
varying vec3 v_color;

void main() {
  vec3 color = v_color;
  if (u_darken_top == 1.0) {
    vec2 st = gl_FragCoord.xy/resolution.xy;
    color.g -= pow(st.y + sin(-12.0) * st.x, u_shadow_power) * 0.4;
  }
  gl_FragColor = vec4(color, 1.0);
}`;

class Gradient {
  constructor(canvas, colors, { scale = 0.5 } = {}) {
    this.canvas = canvas;
    this.scale = scale;
    this.time = 0;
    this.last = 0;
    this.minigl = new MiniGl(canvas);
    const minigl = this.minigl;
    const sectionColors = colors.map(hex => normalizeColor(parseInt(hex.replace("#", "0x"), 16)));
    const uniforms = {
      u_time: new minigl.Uniform({ value: 0 }),
      u_shadow_power: new minigl.Uniform({ value: 5 }),
      u_darken_top: new minigl.Uniform({ value: 0 }),
      u_active_colors: new minigl.Uniform({ value: [1, 1, 1, 1], type: "vec4" }),
      u_global: new minigl.Uniform({
        value: {
          noiseFreq: new minigl.Uniform({ value: [0.00014, 0.00029], type: "vec2" }),
          noiseSpeed: new minigl.Uniform({ value: 0.000005 }),
        },
        type: "struct",
      }),
      u_vertDeform: new minigl.Uniform({
        value: {
          incline: new minigl.Uniform({ value: 0 }),
          offsetTop: new minigl.Uniform({ value: -0.5 }),
          offsetBottom: new minigl.Uniform({ value: -0.5 }),
          noiseFreq: new minigl.Uniform({ value: [3, 4], type: "vec2" }),
          noiseAmp: new minigl.Uniform({ value: 320 }),
          noiseSpeed: new minigl.Uniform({ value: 10 }),
          noiseFlow: new minigl.Uniform({ value: 3 }),
          noiseSeed: new minigl.Uniform({ value: 5 }),
        },
        type: "struct",
        excludeFrom: "fragment",
      }),
      u_baseColor: new minigl.Uniform({ value: sectionColors[0], type: "vec3", excludeFrom: "fragment" }),
      u_waveLayers: new minigl.Uniform({ value: [], excludeFrom: "fragment", type: "array" }),
    };
    for (let i = 1; i < sectionColors.length; i += 1) {
      uniforms.u_waveLayers.value.push(new minigl.Uniform({
        value: {
          color: new minigl.Uniform({ value: sectionColors[i], type: "vec3" }),
          noiseFreq: new minigl.Uniform({ value: [2 + i / sectionColors.length, 3 + i / sectionColors.length], type: "vec2" }),
          noiseSpeed: new minigl.Uniform({ value: 11 + 0.3 * i }),
          noiseFlow: new minigl.Uniform({ value: 6.5 + 0.3 * i }),
          noiseSeed: new minigl.Uniform({ value: 5 + 10 * i }),
          noiseFloor: new minigl.Uniform({ value: 0.1 }),
          noiseCeil: new minigl.Uniform({ value: 0.63 + 0.07 * i }),
        },
        type: "struct",
      }));
    }
    const material = new minigl.Material(VERTEX_SHADER, FRAGMENT_SHADER, uniforms);
    this.mesh = new minigl.Mesh(new minigl.PlaneGeometry(), material);
    this.uniforms = material.uniforms;
  }

  resize(width, height) {
    this.minigl.setSize(width, height, this.scale);
    this.minigl.setOrthographicCamera();
    this.mesh.geometry.setTopology(Math.ceil(width * 0.02), Math.ceil(height * 0.05));
    this.mesh.geometry.setSize(width, height);
  }

  // `elapsed` is real time in ms; a long pause (hidden tab) resumes smoothly.
  frame(elapsed) {
    this.time += Math.min(elapsed, 100);
    this.uniforms.u_time.value = this.time;
    this.minigl.render();
  }
}

/**
 * @param {string[]} colors      base colour first, then the wave layers
 * @param {number}   noiseSpeed  global speed (the 21st.dev default is 1e-5)
 * @param {number}   fps         frame cap; slow motion needs few frames
 * @param {number}   scale       drawing-buffer scale against CSS pixels
 * @param {number}   seed        time to start from, so the first frame is not the noise origin
 */
export default function GradientWave({
  colors = ["#38bdf8", "#ffffff", "#38bdf8", "#ffffff", "#38bdf8", "#ffffff"],
  isPlaying = true,
  className = "",
  shadowPower = 8,
  darkenTop = false,
  noiseSpeed = 0.00001,
  noiseFrequency = [0.0001, 0.0009],
  // The original assigned these over the uniform objects the shader had
  // already bound, so its default deform never reached the GPU: the look on
  // 21st.dev is the shader's own defaults. Empty keeps exactly that look;
  // values passed here are applied for real.
  deform = {},
  fps = 30,
  scale = 0.5,
  seed = 0,
}) {
  const containerRef = useRef(null);
  const colorKey = colors.join(",");
  const deformKey = JSON.stringify(deform);
  const frequencyKey = noiseFrequency.join(",");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
    canvas.setAttribute("aria-hidden", "true");

    let gradient;
    try {
      gradient = new Gradient(canvas, colorKey.split(","), { scale });
    } catch (error) {
      // The container's CSS background stays: the page still has its ground.
      return undefined;
    }
    const { uniforms } = gradient;
    uniforms.u_shadow_power.value = shadowPower;
    uniforms.u_darken_top.value = darkenTop ? 1 : 0;
    uniforms.u_global.value.noiseFreq.value = frequencyKey.split(",").map(Number);
    uniforms.u_global.value.noiseSpeed.value = noiseSpeed;
    Object.entries(JSON.parse(deformKey)).forEach(([key, value]) => {
      if (uniforms.u_vertDeform.value[key]) uniforms.u_vertDeform.value[key].value = value;
    });
    gradient.time = seed;

    const size = () => gradient.resize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    size();
    gradient.frame(0);
    container.appendChild(canvas);
    requestAnimationFrame(() => { canvas.dataset.ready = "true"; });

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const interval = 1000 / fps;
    let raf = 0;
    let last = 0;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (!last) { last = now; return; }
      if (now - last < interval) return;
      gradient.frame(now - last);
      last = now;
    };
    const play = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (isPlaying && !reduced.matches && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const onResize = () => { size(); gradient.frame(0); };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", play);
    reduced.addEventListener("change", play);
    play();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", play);
      reduced.removeEventListener("change", play);
      canvas.remove();
      gradient.minigl.gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [colorKey, isPlaying, shadowPower, darkenTop, noiseSpeed, frequencyKey, deformKey, fps, scale, seed]);

  return <div ref={containerRef} className={`bt-gradient-wave ${className}`.trim()} aria-hidden="true" />;
}
