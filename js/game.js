import * as THREE from '../vendor/three.module.min.js';

const $ = (id) => document.getElementById(id);

const N = 8;
const HIDDEN_STAR_TOTAL = 12;
const PLAZA_I = 3;
const PLAZA_J = 3;
const BLOCK = 38;
const ROAD = 16;
const STEP = BLOCK + ROAD;
const HALF_CITY = (N * STEP) / 2;
const SAVE_KEY = 'zoomCity_v1';

const CAR_SPECS = [
  { id: 'sunny', name: 'Sunny', color: 0xffc828, accent: 0xfff3b0, max: 28, accel: 22, brake: 36, steer: 2.4, grip: 0.12, cost: 0, kind: 'hatch', desc: 'Your first car. Easy and friendly.' },
  { id: 'taxi', name: 'Taxi', color: 0xffd400, accent: 0x1a1a1a, max: 26, accel: 20, brake: 34, steer: 2.2, grip: 0.12, cost: 0, kind: 'taxi', desc: 'A bright taxi. Great for giving rides.' },
  { id: 'hauler', name: 'Hauler', color: 0x4d8fff, accent: 0xdce8ff, max: 24, accel: 16, brake: 32, steer: 1.8, grip: 0.16, cost: 0, kind: 'van', desc: 'A roomy van. Steady on ramps.' },
  { id: 'bolt', name: 'Bolt', color: 0xff3355, accent: 0x2a2a30, max: 38, accel: 32, brake: 40, steer: 2.8, grip: 0.1, cost: 0, kind: 'sport', desc: 'A fast red sports car.' },
  { id: 'rocket', name: 'Rocket', color: 0xb44aff, accent: 0xffce54, max: 36, accel: 30, brake: 42, steer: 3.1, grip: 0.18, cost: 0, kind: 'stunt', desc: 'A stunt car with sticky grip.' },
];

function lotC(i) { return (i - (N - 1) / 2) * STEP; }
function roadC(i) { return (i - N / 2) * STEP; }

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAng(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function col(hex) { return new THREE.Color(hex); }

function mergeGeos(geos) {
  const pos = [], nor = [], uv = [], idx = [], colr = [];
  let off = 0;
  const hasColor = geos.some((g) => g.getAttribute('color'));
  for (const g of geos) {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    const c = g.getAttribute('color');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
      if (hasColor) {
        if (c) colr.push(c.getX(i), c.getY(i), c.getZ(i));
        else colr.push(1, 1, 1);
      }
    }
    const id = g.getIndex();
    if (id) {
      for (let i = 0; i < id.count; i++) idx.push(id.getX(i) + off);
    } else {
      for (let i = 0; i < p.count; i++) idx.push(off + i);
    }
    off += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (hasColor) out.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  out.setIndex(idx);
  return out;
}

function boxAt(w, h, d, x, y, z, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Matrix4();
  m.makeRotationY(rotY);
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

function tintGeo(g, color, start = 0, count = -1) {
  const p = g.getAttribute('position');
  let cols = g.getAttribute('color');
  if (!cols) {
    const arr = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      arr[i * 3] = 1; arr[i * 3 + 1] = 1; arr[i * 3 + 2] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    cols = g.getAttribute('color');
  }
  const c = col(color);
  const n = count < 0 ? p.count - start : count;
  for (let i = start; i < start + n; i++) cols.setXYZ(i, c.r, c.g, c.b);
  return g;
}

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  } else {
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  return tex;
}

function makeTextSign(text, w, h, bg, fg, lines) {
  const tex = canvasTex(512, 256, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(8, 8, 496, 240);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const parts = lines || String(text).split('\n');
    const size = parts.length > 2 ? 42 : (parts.length > 1 ? 52 : 64);
    ctx.font = '800 ' + size + 'px Trebuchet MS, Arial, sans-serif';
    const mid = 128;
    const step = 70;
    const start = mid - ((parts.length - 1) * step) / 2;
    parts.forEach((line, i) => ctx.fillText(line, 256, start + i * step));
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  return mesh;
}

function allCarIds() { return CAR_SPECS.map((c) => c.id); }

function loadSave() {
  const blank = { coins: 0, unlocked: allCarIds(), selected: 'sunny', hiddenStars: [] };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return blank;
    const d = JSON.parse(raw);
    d.unlocked = allCarIds();
    d.coins = Math.max(0, d.coins | 0);
    if (!Array.isArray(d.hiddenStars)) d.hiddenStars = [];
    if (!CAR_SPECS.some((c) => c.id === d.selected)) d.selected = 'sunny';
    return d;
  } catch (e) {
    return blank;
  }
}

function writeSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* ignore quota */ }
}

class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.engOsc = null;
    this.engGain = null;
    this.musicOn = false;
    this._step = 0;
    this._next = 0;
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.engOsc = this.ctx.createOscillator();
      this.engOsc.type = 'sawtooth';
      this.engOsc.frequency.value = 70;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      this.engGain = this.ctx.createGain();
      this.engGain.gain.value = 0;
      this.engOsc.connect(filter);
      filter.connect(this.engGain);
      this.engGain.connect(this.master);
      this.engOsc.start();
      this.musicOn = true;
      this._next = this.ctx.currentTime + 0.2;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }
  tone(freq, dur, type, vol, at, slide) {
    if (!this.ctx || this.muted) return;
    const t = at ?? this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  coin() { this.tone(880, 0.08, 'sine', 0.16); this.tone(1320, 0.16, 'sine', 0.12, this.ctx ? this.ctx.currentTime + 0.06 : 0); }
  success() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.14, t + i * 0.1));
  }
  fail() { this.tone(240, 0.3, 'triangle', 0.12, undefined, 120); }
  horn() { this.tone(420, 0.22, 'square', 0.12); this.tone(528, 0.22, 'square', 0.1); }
  click() { this.tone(700, 0.06, 'square', 0.06); }
  pop() { this.tone(360, 0.12, 'sine', 0.1, undefined, 180); }
  setEngine(inCar, speed, max) {
    if (!this.engGain) return;
    const t = this.ctx.currentTime;
    const k = inCar ? clamp(Math.abs(speed) / (max || 28), 0, 1) : 0;
    this.engGain.gain.setTargetAtTime(inCar ? 0.015 + k * 0.05 : 0, t, 0.08);
    if (this.engOsc) this.engOsc.frequency.setTargetAtTime(70 + k * 140, t, 0.08);
  }
  tickMusic() {
    if (!this.ctx || !this.musicOn || this.muted) return;
    const now = this.ctx.currentTime;
    while (this._next < now + 0.3) {
      const step = this._step % 16;
      const root = 196;
      const scale = [0, 2, 4, 7, 9, 7, 4, 2, 0, 4, 7, 9, 12, 9, 7, 4];
      if (step % 2 === 0) this.tone(root * Math.pow(2, scale[step] / 12), 0.28, 'triangle', 0.035, this._next);
      if (step % 4 === 0) this.tone(root / 2, 0.35, 'sine', 0.04, this._next);
      this._next += 0.28;
      this._step++;
    }
  }
  crash() { this.tone(180, 0.12, 'square', 0.1, undefined, 70); this.tone(90, 0.18, 'sawtooth', 0.06); }
  boom() {
    this.tone(90, 0.35, 'sawtooth', 0.14, undefined, 40);
    this.tone(220, 0.2, 'triangle', 0.1, this.ctx ? this.ctx.currentTime + 0.05 : 0, 80);
  }
  smash() { this.tone(300, 0.1, 'square', 0.08, undefined, 120); }
  wanted() { this.tone(520, 0.12, 'square', 0.1); this.tone(390, 0.2, 'square', 0.08, this.ctx ? this.ctx.currentTime + 0.12 : 0); }
  whoosh() { this.tone(200, 0.25, 'sawtooth', 0.07, undefined, 480); }
  sirenTick(on) {
    if (!this.ctx || this.muted) return;
    if (!on) return;
    if (!this._sirenAt || this.ctx.currentTime > this._sirenAt) {
      const hi = this._sirenHi;
      this._sirenHi = !hi;
      this.tone(hi ? 660 : 520, 0.22, 'square', 0.045);
      this._sirenAt = this.ctx.currentTime + 0.22;
    }
  }
  yelp() { this.tone(640, 0.08, 'sine', 0.05, undefined, 400); }
}

class Input {
  constructor() {
    this.keys = {};
    this.joy = { x: 0, y: 0 };
    this.gas = 0;
    this.brake = 0;
    this.enterQueued = false;
    this.hornQueued = false;
    this.nitroBtn = 0;
    this.driftBtn = 0;
    this.joyId = null;
  }
  bind() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyE' || e.code === 'KeyF') this.enterQueued = true;
      if (e.code === 'KeyH') this.hornQueued = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    this._joy($('joy-base') || $('joy-wrap'));
    this._hold($('btn-gas'), (v) => { this.gas = v; });
    this._hold($('btn-brake'), (v) => { this.brake = v; });
    if ($('btn-nitro')) this._hold($('btn-nitro'), (v) => { this.nitroBtn = v; });
    if ($('btn-drift')) this._hold($('btn-drift'), (v) => { this.driftBtn = v; });
    $('btn-enter').addEventListener('pointerdown', (e) => { e.preventDefault(); this.enterQueued = true; });
    $('btn-horn').addEventListener('pointerdown', (e) => { e.preventDefault(); this.hornQueued = true; });
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e));
    this._blockBrowserGestures();
  }
  _blockBrowserGestures() {
    const inMenu = (t) => t && t.closest && t.closest('.screen');
    const block = (e) => { if (!inMenu(e.target)) e.preventDefault(); };
    document.addEventListener('touchmove', block, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    let lastTap = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTap < 320 && !inMenu(e.target)) e.preventDefault();
      lastTap = now;
    }, { passive: false });
  }
  _hold(el, fn) {
    if (!el) return;
    const ids = new Set();
    const down = (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      ids.add(e.pointerId);
      el.classList.add('held');
      fn(1);
    };
    const up = (e) => {
      if (e) ids.delete(e.pointerId);
      if (ids.size === 0) {
        el.classList.remove('held');
        fn(0);
      }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  _joy(el) {
    if (!el) return;
    const move = (e) => {
      if (this.joyId !== e.pointerId) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const max = r.width * 0.36;
      let x = e.clientX - cx, y = e.clientY - cy;
      const len = Math.hypot(x, y);
      if (len > max) { x *= max / len; y *= max / len; }
      const knob = $('joy-knob');
      if (knob) knob.style.transform = 'translate(calc(-50% + ' + x + 'px), calc(-50% + ' + y + 'px))';
      this.joy.x = Math.abs(x / max) < 0.15 ? 0 : x / max;
      this.joy.y = Math.abs(y / max) < 0.15 ? 0 : -(y / max);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.joyId = e.pointerId;
      move(e);
    });
    el.addEventListener('pointermove', move);
  }
  _up(e) {
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.joy.x = 0; this.joy.y = 0;
      const knob = $('joy-knob');
      if (knob) knob.style.transform = 'translate(-50%, -50%)';
    }
  }
  axis() {
    let x = this.joy.x, y = this.joy.y;
    if (this.keys.KeyA || this.keys.ArrowLeft) x -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) x += 1;
    if (this.keys.KeyW || this.keys.ArrowUp) y += 1;
    if (this.keys.KeyS || this.keys.ArrowDown) y -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  drive() {
    const ax = this.axis();
    let gas = this.gas, brake = this.brake;
    if (this.keys.KeyW || this.keys.ArrowUp) gas = 1;
    if (this.keys.KeyS || this.keys.ArrowDown) brake = 1;
    if (ax.y > 0.35) gas = Math.max(gas, ax.y);
    if (ax.y < -0.35) brake = Math.max(brake, -ax.y);
    const nitro = this.nitroBtn || this.keys.ShiftLeft || this.keys.ShiftRight ? 1 : 0;
    return { steer: ax.x, gas, brake, handbrake: !!(this.keys.Space || this.driftBtn), nitro };
  }
  consumeEnter() { const v = this.enterQueued; this.enterQueued = false; return v; }
  consumeHorn() { const v = this.hornQueued; this.hornQueued = false; return v; }
}

const uNight = { value: 0 };

function patchBuildingMaterial(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;\nvarying vec3 vWn;')
      .replace('#include <project_vertex>', [
        'vec4 wp4 = vec4(transformed, 1.0);',
        '#ifdef USE_INSTANCING',
        'wp4 = instanceMatrix * wp4;',
        '#endif',
        'vWp = (modelMatrix * wp4).xyz;',
        'vec3 wn = objectNormal;',
        '#ifdef USE_INSTANCING',
        'wn = mat3(instanceMatrix) * wn;',
        '#endif',
        'vWn = normalize(mat3(modelMatrix) * wn);',
        '#include <project_vertex>'
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;\nvarying vec3 vWn;\nuniform float uNight;')
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'vec3 n = abs(normalize(vWn));',
        'if (n.y > 0.65) {',
        '  vec2 rp = vWp.xz * 0.55;',
        '  float tile = step(0.86, fract(rp.x)) + step(0.86, fract(rp.y));',
        '  diffuseColor.rgb *= 0.72 + 0.08 * tile;',
        '  diffuseColor.rgb += vec3(0.08, 0.07, 0.05) * uNight * 0.0;',
        '} else {',
        '  vec2 wp = (n.x > n.z) ? vWp.zy : vWp.xy;',
        '  float ground = step(vWp.y, 3.15) * step(1.05, vWp.y);',
        '  float wx = mix(1.7, 2.6, ground); float wy = mix(1.9, 2.8, ground);',
        '  vec2 cell = floor(wp / vec2(wx, wy));',
        '  vec2 fv = fract(wp / vec2(wx, wy));',
        '  float frame = step(0.12, fv.x) * step(fv.x, 0.88) * step(0.18, fv.y) * step(fv.y, 0.86);',
        '  float mullion = 1.0 - (step(0.48, fv.x) * step(fv.x, 0.52) + step(0.48, fv.y) * step(fv.y, 0.52));',
        '  frame *= mullion;',
        '  frame *= step(1.15, vWp.y);',
        '  float ledge = step(0.88, fv.y) * step(1.2, vWp.y);',
        '  float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);',
        '  vec3 winDay = vec3(0.55, 0.78, 0.92);',
        '  vec3 winNight = vec3(1.0, 0.86, 0.45);',
        '  vec3 winOff = vec3(0.08, 0.1, 0.16);',
        '  float lit = step(0.32, h) * step(h, 0.92);',
        '  vec3 win = mix(winDay, mix(winOff, winNight, lit), uNight);',
        '  // storefront tint on the ground floor',
        '  vec3 store = diffuseColor.rgb * vec3(0.85, 0.9, 1.0);',
        '  vec3 wall = mix(diffuseColor.rgb * 0.94, store, ground * 0.35);',
        '  wall = mix(wall, wall * 0.62, ledge);',
        '  // door on the ground floor, centered-ish',
        '  float door = ground * step(0.38, fv.x) * step(fv.x, 0.62) * step(0.02, fv.y) * step(fv.y, 0.72) * step(vWp.y, 2.6);',
        '  vec3 doorCol = vec3(0.28, 0.2, 0.14);',
        '  diffuseColor.rgb = mix(mix(wall, win, frame), doorCol, door);',
        '}',
      ].join('\n'));
    mat.userData.shader = shader;
  };
}

function specialLot(i, j) {
  if (i === PLAZA_I && j === PLAZA_J) return 'plaza';
  if (i === 0 && j === 0) return 'stunt';
  if (i === 1 && j === 5) return 'park';
  if (i === 5 && j === 1) return 'park';
  if (i === 7 && j === 5) return 'park';
  if (i === 3 && j === 6) return 'park';
  if (i === 7 && j === 1) return 'post';
  if ((i === 4 && j === 3) || (i === 1 && j === 3) || (i === 6 && j === 6)) return 'bank';
  if (i === 6 && j === 2) return 'gas';
  if (i === 2 && j === 6) return 'wash';
  if (i === 4 && j === 2) return 'burger';
  return 'build';
}

function districtOf(i, j) {
  if (specialLot(i, j) === 'plaza') return 'downtown';
  if (j >= N - 2) return 'harbor';
  if (i <= 1 && j <= 2) return 'suburb';
  if (i >= N - 2 && j <= 2) return 'industry';
  if (Math.abs(i - PLAZA_I) <= 1 && Math.abs(j - PLAZA_J) <= 1) return 'downtown';
  return 'city';
}

function treeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.3, 1.5, 6);
  trunk.translate(0, 0.75, 0);
  tintGeo(trunk, 0x8a5a32);
  const leaves = new THREE.ConeGeometry(1.35, 2.7, 7);
  leaves.translate(0, 2.5, 0);
  tintGeo(leaves, 0x3fa34a);
  const top = new THREE.ConeGeometry(0.95, 1.8, 7);
  top.translate(0, 3.4, 0);
  tintGeo(top, 0x62c25a);
  return mergeGeos([trunk, leaves, top]);
}

function lampGeometry() {
  const pole = new THREE.CylinderGeometry(0.08, 0.1, 4.4, 6);
  pole.translate(0, 2.2, 0);
  tintGeo(pole, 0x4a5160);
  const arm = new THREE.BoxGeometry(0.1, 0.08, 1.1);
  arm.translate(0, 4.35, 0.4);
  tintGeo(arm, 0x4a5160);
  const bulb = new THREE.SphereGeometry(0.22, 8, 6);
  bulb.translate(0, 4.15, 0.85);
  tintGeo(bulb, 0xfff1b8);
  return mergeGeos([pole, arm, bulb]);
}

function makeCarMesh(spec) {
  const g = new THREE.Group();
  const kind = spec.kind;
  const bodyW = kind === 'van' ? 2.0 : 1.8;
  const bodyL = kind === 'van' ? 4.2 : (kind === 'sport' || kind === 'stunt' ? 4.0 : 3.6);
  const bodyH = kind === 'van' ? 1.5 : 0.7;
  const bodyY = kind === 'van' ? 0.85 : 0.55;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW, bodyH, bodyL),
    new THREE.MeshLambertMaterial({ color: spec.color })
  );
  body.position.y = bodyY;
  g.add(body);
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW * 0.92, kind === 'van' ? 0.9 : 0.7, kind === 'van' ? bodyL * 0.55 : 1.6),
    new THREE.MeshLambertMaterial({ color: 0x8fd4ea })
  );
  cab.position.set(0, kind === 'van' ? 1.7 : 1.15, kind === 'van' ? 0.3 : -0.15);
  g.add(cab);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW * 0.95, 0.12, kind === 'van' ? bodyL * 0.58 : 1.65),
    new THREE.MeshLambertMaterial({ color: spec.accent })
  );
  roof.position.set(0, kind === 'van' ? 2.16 : 1.52, cab.position.z);
  g.add(roof);
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.28, 0.8), new THREE.MeshLambertMaterial({ color: 0xffe066 }));
    sign.position.set(0, 1.8, 0);
    g.add(sign);
  }
  if (kind === 'sport' || kind === 'stunt') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.9, 0.1, 0.35), new THREE.MeshLambertMaterial({ color: spec.accent }));
    spoiler.position.set(0, 1.2, bodyL * 0.42);
    g.add(spoiler);
  }
  if (kind === 'stunt') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, bodyH + 0.02, bodyL + 0.02), new THREE.MeshLambertMaterial({ color: spec.accent }));
    stripe.position.y = bodyY;
    g.add(stripe);
  }
  let lightR = null, lightB = null;
  if (kind === 'police') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.02, 0.25, bodyL * 0.7), new THREE.MeshLambertMaterial({ color: 0x1d4ed8 }));
    stripe.position.y = bodyY;
    g.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.7, 0.18, 0.5), new THREE.MeshLambertMaterial({ color: 0x222 }));
    bar.position.set(0, 1.72, 0);
    g.add(bar);
    lightR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2244 }));
    lightB = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    lightR.position.set(-0.28, 1.86, 0);
    lightB.position.set(0.28, 1.86, 0);
    g.add(lightR, lightB);
  }
  const boost = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 1.1, 8),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85 })
  );
  boost.rotation.x = Math.PI;
  boost.position.set(0, 0.5, bodyL * 0.52);
  boost.visible = false;
  g.add(boost);
  const bumperM = new THREE.MeshLambertMaterial({ color: 0x2a2d34 });
  const fb = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.98, 0.22, 0.22), bumperM);
  fb.position.set(0, 0.32, -bodyL * 0.5);
  g.add(fb);
  const rb = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.98, 0.22, 0.22), bumperM);
  rb.position.set(0, 0.32, bodyL * 0.5);
  g.add(rb);
  const mirM = new THREE.MeshLambertMaterial({ color: 0x33363e });
  for (const sx of [-1, 1]) {
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.22), mirM);
    mir.position.set(sx * (bodyW * 0.5 + 0.08), kind === 'van' ? 1.25 : 0.95, -bodyL * 0.12);
    g.add(mir);
  }
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  const tlMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
  const headlights = [], taillights = [];
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.1), hlMat);
    hl.position.set(sx * bodyW * 0.35, bodyY, -bodyL * 0.5 - 0.02);
    g.add(hl);
    headlights.push(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.1), tlMat);
    tl.position.set(sx * bodyW * 0.35, bodyY, bodyL * 0.5 + 0.02);
    g.add(tl);
    taillights.push(tl);
  }
  const wheels = [];
  const wMat = new THREE.MeshLambertMaterial({ color: 0x22252c });
  const capMat = new THREE.MeshLambertMaterial({ color: 0xc8ccd4 });
  const zOff = bodyL * 0.32;
  const xOff = bodyW * 0.55;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 10), wMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * xOff, 0.38, sz * zOff);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8), capMat);
      cap.rotation.z = Math.PI / 2;
      w.add(cap);
      g.add(w);
      wheels.push(w);
    }
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  g.add(shadow);
  g.userData = { wheels, body, cab, roof, bodyL, bodyW, spec, boost, lightR, lightB, headlights, taillights };
  return g;
}

function makePerson(shirt, pants, skin, hair) {
  const g = new THREE.Group();
  const skinM = new THREE.MeshLambertMaterial({ color: skin });
  const shirtM = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsM = new THREE.MeshLambertMaterial({ color: pants });
  const hairM = new THREE.MeshLambertMaterial({ color: hair });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirtM);
  body.position.y = 1.15;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skinM);
  head.position.y = 1.72;
  g.add(head);
  const eyeM = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), eyeM);
    eye.position.set(sx * 0.09, 1.76, -0.2);
    g.add(eye);
  }
  const hairMsh = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), hairM);
  hairMsh.position.y = 1.82;
  hairMsh.scale.set(1, 0.7, 1);
  g.add(hairMsh);
  if ((shirt + hair) % 5 === 0) {
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.16, 10), new THREE.MeshLambertMaterial({ color: shirt }));
    hat.position.y = 1.98;
    g.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 10), new THREE.MeshLambertMaterial({ color: shirt }));
    brim.position.y = 1.92;
    g.add(brim);
  }
  const legGeo = new THREE.BoxGeometry(0.2, 0.55, 0.22);
  legGeo.translate(0, -0.27, 0);
  const lLeg = new THREE.Mesh(legGeo, pantsM);
  const rLeg = new THREE.Mesh(legGeo, pantsM);
  lLeg.position.set(-0.14, 0.45, 0);
  rLeg.position.set(0.14, 0.45, 0);
  const shoeM = new THREE.MeshLambertMaterial({ color: 0x2b2b30 });
  const shoeGeo = new THREE.BoxGeometry(0.2, 0.1, 0.3);
  const lShoe = new THREE.Mesh(shoeGeo, shoeM);
  const rShoe = new THREE.Mesh(shoeGeo, shoeM);
  lShoe.position.set(0, -0.52, -0.04);
  rShoe.position.set(0, -0.52, -0.04);
  lLeg.add(lShoe); rLeg.add(rShoe);
  g.add(lLeg, rLeg);
  const armGeo = new THREE.BoxGeometry(0.16, 0.55, 0.16);
  armGeo.translate(0, -0.25, 0);
  const lArm = new THREE.Mesh(armGeo, shirtM);
  const rArm = new THREE.Mesh(armGeo, shirtM);
  lArm.position.set(-0.38, 1.35, 0);
  rArm.position.set(0.38, 1.35, 0);
  g.add(lArm, rArm);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 10),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);
  g.userData = { lLeg, rLeg, lArm, rArm, baseY: 0 };
  return g;
}

function makeDog(fur) {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: fur });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.5), m);
  body.position.y = 0.28;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), m);
  head.position.set(0, 0.4, -0.28);
  g.add(head);
  const earM = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.08), earM);
    ear.position.set(s * 0.1, 0.52, -0.28);
    g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.22), m);
  tail.position.set(0, 0.36, 0.32);
  tail.rotation.x = 0.4;
  g.add(tail);
  g.userData.tail = tail;
  return g;
}

function animateWalk(p, t, moving) {
  const sw = moving ? Math.sin(t * 10) * 0.55 : 0;
  p.userData.lLeg.rotation.x = sw;
  p.userData.rLeg.rotation.x = -sw;
  p.userData.lArm.rotation.x = -sw * 0.8;
  p.userData.rArm.rotation.x = sw * 0.8;
  if (moving) p.position.y += Math.abs(Math.sin(t * 10)) * 0.05;
}

class Game {
  constructor() {
    this.save = loadSave();
    this.sfx = new Sfx();
    this.input = new Input();
    this.mode = 'title';
    this.night = 0;
    this.nightTarget = 0;
    this.autoNight = true;
    this.clock = new THREE.Clock();
    this.colliders = [];
    this.ramps = [];
    this.cars = [];
    this.traffic = [];
    this.peds = [];
    this.coins = [];
    this.mission = null;
    this.playerCar = null;
    this.lastSafe = new THREE.Vector3(0, 0, 0);
    this.heading = 0;
    this.walkVel = new THREE.Vector3();
    this.camPos = new THREE.Vector3(40, 35, 60);
    this.look = new THREE.Vector3();
    this.toastT = 0;
    this.promptText = '';
    this.time = 0;
    this.hornT = 0;
    this.params = new URLSearchParams(location.search);
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0
      || this.params.has('touch') || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
    this.lite = this.isTouch || Math.min(innerWidth, innerHeight) < 700;
    this.stars = 0;
    this.nitro = 1;
    this.escapeT = 0;
    this.lastWantedAt = -10;
    this.police = [];
    this.props = [];
    this.particles = [];
    this.lights = [];
    this.busStops = [];
    this.benches = [];
    this.holdBust = 0;
    this.redLock = '';
    this.rotateHintDismissed = false;
    this.banks = [];
    this.hiddenStars = [];
    this.places = {};
    this.parked = [];
    this.washCool = 0;
    this.fedT = 0;
    this._fps = 60;
    this._fpsFrames = 0;
    this._fpsT = 0;
  }

  init() {
    writeSave(this.save);
    this.scene = new THREE.Scene();
    this.scene.background = col(0x7ec8e3);
    this.fogFarDay = this.lite ? 230 : 430;
    this.fogNearDay = this.lite ? 70 : 100;
    this.scene.fog = new THREE.Fog(0x7ec8e3, this.fogNearDay, this.fogFarDay);
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.2, this.lite ? 520 : 780);
    this.camera.position.copy(this.camPos);
    this.renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: !this.isTouch, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.isTouch ? 1.5 : 1.75));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.hemi = new THREE.HemisphereLight(0xecf6ff, 0x5a7a4a, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff4d6, 1.05);
    this.sun.position.set(60, 90, 40);
    this.scene.add(this.sun);
    let softGL = false;
    try {
      const gl = this.renderer.getContext();
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const info = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
      softGL = /swiftshader|llvmpipe|soft/i.test(info);
    } catch (e) { softGL = false; }
    this.softGL = softGL;
    if (!this.lite && !softGL) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const cam = this.sun.shadow.camera;
      cam.near = 10; cam.far = 260;
      cam.left = -120; cam.right = 120; cam.top = 120; cam.bottom = -120;
    }
    this.buildWorld();
    this.spawnActors();
    this.makeMarkers();
    this.input.bind();
    this.bindUI();
    this.renderGarage();
    this.resize();
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize);
      window.visualViewport.addEventListener('scroll', onResize);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clock.getDelta();
      else this.sfx.unlock();
    });
    const unlockAudio = () => this.sfx.unlock();
    document.addEventListener('pointerdown', unlockAudio);
    document.addEventListener('touchstart', unlockAudio, { passive: true });
    document.addEventListener('click', unlockAudio);
    this.loop();
    window.__game = this;
    window.__zc = () => ({
      stars: this.stars, mode: this.mode, fps: this._fps, lite: this.lite,
      chasing: this.police.filter((c) => c.chasing && c.mesh.visible).length,
      patrol: this.police.filter((c) => c.mesh.visible && !c.chasing).length,
      policeOn: this.police.filter((c) => c.mesh && c.mesh.visible).length,
      banks: (this.banks || []).map((b) => ({ id: b.id, open: b.open, hold: +(b.hold || 0).toFixed(2), x: b.x, z: b.z })),
      hidden: (this.save && this.save.hiddenStars ? this.save.hiddenStars.length : 0),
    });
    if (this.params.get('shot') === 'garage') {
      this.openGarage('title');
    } else if (this.params.has('demo') || ['drive','chase','busted','day','night','bank','overview','copsaw'].includes(this.params.get('shot'))) {
      this.startGame(true);
    }
  }

  viewSize() {
    const vv = window.visualViewport;
    const w = Math.max(1, Math.round(vv && vv.width ? vv.width : innerWidth));
    const h = Math.max(1, Math.round(vv && vv.height ? vv.height : innerHeight));
    return { w, h, left: vv ? vv.offsetLeft : 0, top: vv ? vv.offsetTop : 0 };
  }

  resize() {
    const { w, h, left, top } = this.viewSize();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isTouch ? 1.5 : 1.75));
    this.renderer.setSize(w, h, false);
    const c = $('c');
    if (c) { c.style.width = w + 'px'; c.style.height = h + 'px'; }
    const app = $('app');
    if (app) {
      app.style.width = w + 'px';
      app.style.height = h + 'px';
      app.style.transform = 'translate(' + left + 'px,' + top + 'px)';
    }
    document.body.classList.toggle('portrait', h > w);
    document.body.classList.toggle('landscape', w >= h);
    document.body.classList.toggle('touch-ui', !!this.isTouch);
    this.updateRotateHint();
  }

  updateRotateHint() {
    const el = $('rotate-hint');
    if (!el) return;
    const { w, h } = this.viewSize();
    const show = this.isTouch && !this.rotateHintDismissed && h > w
      && (this.mode === 'play' || this.mode === 'pause');
    el.classList.toggle('hidden', !show);
  }

  bindUI() {
    $('btn-play').addEventListener('click', () => { this.sfx.unlock(); this.sfx.click(); this.startGame(false); });
    $('btn-garage-title').addEventListener('click', () => { this.sfx.unlock(); this.sfx.click(); this.openGarage('title'); });
    $('btn-garage-pause').addEventListener('click', () => { this.sfx.click(); this.openGarage('pause'); });
    $('btn-garage-close').addEventListener('click', () => { this.sfx.click(); this.closeGarage(); });
    $('btn-pause').addEventListener('click', () => this.togglePause(true));
    $('btn-resume').addEventListener('click', () => this.togglePause(false));
    $('btn-unstick').addEventListener('click', () => { this.sfx.click(); this.unstick(); this.togglePause(false); });
    $('btn-mute').addEventListener('click', () => {
      this.sfx.setMuted(!this.sfx.muted);
      $('btn-mute').textContent = this.sfx.muted ? 'Sound: Off' : 'Sound: On';
    });
    $('btn-quit').addEventListener('click', () => { this.sfx.click(); this.quitToTitle(); });
    if ($('btn-busted')) $('btn-busted').addEventListener('click', () => { this.sfx.click(); this.clearBusted(); });
    if ($('btn-rotate-dismiss')) {
      $('btn-rotate-dismiss').addEventListener('click', () => {
        this.rotateHintDismissed = true;
        this.updateRotateHint();
      });
    }
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if ($('a2hs-tip')) $('a2hs-tip').classList.toggle('hidden', standalone);
    $('btn-day').addEventListener('click', () => {
      this.autoNight = false;
      this.nightTarget = this.night < 0.5 ? 1 : 0;
      $('btn-day').textContent = this.nightTarget > 0.5 ? '\uD83C\uDF19' : '\u2600\uFE0F';
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.mode === 'play') this.togglePause(true);
        else if (this.mode === 'pause') this.togglePause(false);
      }
      if (e.code === 'KeyN' && (this.mode === 'play' || this.mode === 'pause')) {
        this.autoNight = false;
        this.nightTarget = this.night < 0.5 ? 1 : 0;
        $('btn-day').textContent = this.nightTarget > 0.5 ? '\uD83C\uDF19' : '\u2600\uFE0F';
      }
    });
  }

  startGame(demo) {
    $('title').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('garage').classList.add('hidden');
    $('hud').classList.remove('hidden');
    if (this.isTouch || this.params.has('touch')) {
      this.isTouch = true;
      $('touch').classList.remove('hidden');
    }
    this.mode = 'play';
    this.updateRotateHint();
    this.demo = !!demo && !['bank','day','night','overview','copsaw'].includes(this.params.get('shot'));
    this.aerialView = this.params.get('shot') === 'overview';
    this.clock.getDelta();
    if (this.params.get('night') === '1' || this.params.get('shot') === 'night') {
      this.autoNight = false;
      this.night = 1;
      this.nightTarget = 1;
    } else if (['day','bank','drive','overview','copsaw'].includes(this.params.get('shot'))) {
      this.autoNight = false;
      this.night = 0;
      this.nightTarget = 0;
    }
    if (this.params.get('shot') === 'bank' && this.banks && this.banks[0]) {
      const b = this.banks[0];
      const c = this.cars.find((x) => x.spec.id === 'sunny') || this.cars[0];
      if (c) {
        c.pos.set(b.x, 0, b.z + 0.8);
        c.heading = 0;
        c.speed = 0;
        c.vel.set(0, 0, 0);
        this.placeCar(c);
        this.enterCar(c);
      }
    }
    if (this.params.get('shot') === 'copsaw') this._setupCopSawShot();
    if ((this.params.get('shot') === 'day' || this.params.get('shot') === 'night') && this.plaza) {
      const c = this.cars.find((x) => x.spec.id === 'sunny') || this.cars[0];
      if (c) {
        c.pos.set(this.plaza.x, 0, this.plaza.z + 12);
        c.heading = 0;
        c.speed = 0;
        c.vel.set(0, 0, 0);
        this.placeCar(c);
        this.enterCar(c);
      }
    }
    if (demo && !['bank','day','night','overview','copsaw'].includes(this.params.get('shot'))) {
      const c = this.cars.find((x) => x.spec.id === 'sunny') || this.cars[0];
      c.pos.set(roadC(PLAZA_I), 0, roadC(PLAZA_J + 1) - 22);
      c.heading = 0;
      c.speed = 16;
      c.vel.set(0, 0, -16);
      this.placeCar(c);
      this.enterCar(c);
      if (this.params.get('shot') === 'chase' || this.params.get('demo') === 'chase') {
        this.stars = 3;
        this.ensureCops();
        const fwdX = Math.sin(c.heading), fwdZ = -Math.cos(c.heading);
        const active = this.police.filter((x) => x.active);
        const spots = [
          [18, 3],
          [12, -4],
          [8, 5],
        ];
        active.forEach((cop, i) => {
          const s = spots[i % spots.length];
          cop.pos.set(c.pos.x + fwdX * s[0] - fwdZ * s[1], 0, c.pos.z + fwdZ * s[0] + fwdX * s[1]);
          cop.heading = c.heading;
          cop.speed = 18;
          this.placeCar(cop);
        });
      }
    }
    const fs = document.documentElement.requestFullscreen;
    if (fs && !demo) {
      Promise.resolve(fs.call(document.documentElement)).catch(() => {});
    }
    if (this.params.get('shot') === 'busted') {
      this.stars = 3;
      setTimeout(() => { if (this.mode === 'play') this.doBust(); }, 700);
    }
  }


  _setupCopSawShot() {
    const ix = roadC(2), iz = roadC(2);
    const c = this.cars.find((x) => x.spec.id === 'sunny') || this.cars[0];
    if (c) {
      c.pos.set(ix, 0, iz);
      c.heading = 0;
      c.speed = 0;
      c.vel.set(0, 0, 0);
      this.placeCar(c);
      this.enterCar(c);
    }
    this._spawnPatrolCops();
    // cop stands in front of the player, looking at them along an open road
    const cop = this.police[0];
    if (cop) {
      cop.pos.set(ix + 2.4, 0, iz - 28);
      cop.heading = Math.PI;
      cop.speed = 0;
      cop.chasing = false;
      cop.active = true;
      cop.wrecked = false;
      cop.mesh.visible = true;
      this.placeCar(cop);
    }
    for (let i = 1; i < this.police.length; i++) {
      const o = this.police[i];
      o.pos.set(lotC(0) - 40, 0, lotC(0) - 40);
      o.heading = Math.PI;
      o.chasing = false;
      o.speed = 0;
      this.placeCar(o);
    }
    this.time = 2.6;
    this.freezePatrol = true;
    if (this.traffic) {
      for (const t of this.traffic) {
        if (Math.hypot(t.pos.x - ix, t.pos.z - iz) < 55) {
          t.pos.set(ix + 90, 0, iz + 90);
          t.speed = 0;
          this.placeCar(t);
        }
      }
    }
    this.reportCrime(1, '⭐ You ran a red light!');
    this.toastT = 8;
  }

  quitToTitle() {
    this.leaveCar();
    this.mode = 'title';
    this.mission = null;
    this.hideMission();
    $('pause').classList.add('hidden');
    $('garage').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('touch').classList.add('hidden');
    $('title').classList.remove('hidden');
    this.updateRotateHint();
    this.player.position.set(lotC(PLAZA_I) + 8, 0, lotC(PLAZA_J) + 14);
    this.heading = 0;
  }

  togglePause(on) {
    if (on) {
      if (this.mode !== 'play') return;
      this.mode = 'pause';
      $('pause').classList.remove('hidden');
    } else {
      $('pause').classList.add('hidden');
      $('garage').classList.add('hidden');
      this.mode = 'play';
      this.clock.getDelta();
    }
  }

  openGarage(from) {
    this.garageFrom = from;
    this.renderGarage();
    $('garage').classList.remove('hidden');
    if (from === 'pause') $('pause').classList.add('hidden');
    if (from === 'title') $('title').classList.add('hidden');
  }

  closeGarage() {
    $('garage').classList.add('hidden');
    if (this.garageFrom === 'pause') $('pause').classList.remove('hidden');
    else $('title').classList.remove('hidden');
  }

  renderGarage() {
    $('garage-coins').textContent = this.save.coins;
    const list = $('car-list');
    list.innerHTML = '';
    for (const spec of CAR_SPECS) {
      const el = document.createElement('div');
      el.className = 'car-card' + (this.save.selected === spec.id ? ' selected' : '');
      const info = document.createElement('div');
      info.innerHTML = '<div class="name">' + spec.name + '</div><div class="meta">' + spec.desc + ' Ready to go!</div>';
      const btn = document.createElement('button');
      if (this.playerCar && this.playerCar.spec.id === spec.id && this.mode === 'play') {
        btn.className = 'in-use';
        btn.textContent = 'In use';
      } else {
        btn.textContent = 'Use this car';
        btn.addEventListener('click', () => this.callCar(spec));
      }
      el.append(info, btn);
      list.append(el);
    }
  }

    callCar(spec) {
    this.save.selected = spec.id;
    writeSave(this.save);
    const car = this.cars.find((c) => c.spec.id === spec.id);
    if (!car) return;
    car.locked = false;
    if (this.playerCar === car) { this.renderGarage(); return; }
    if (this.playerCar) this.leaveCar();
    const p = this.player.position;
    const ang = this.heading;
    car.pos.set(p.x + Math.sin(ang) * -5, 0, p.z + Math.cos(ang) * -5);
    car.heading = ang;
    car.speed = 0;
    this.resolvePos(car.pos, 1.4);
    this.placeCar(car);
    this.sfx.click();
    this.toast(spec.name + ' is parked next to you.');
    this.renderGarage();
    if (this.mode === 'play' || this.garageFrom === 'pause') {
      $('garage').classList.add('hidden');
      $('pause').classList.add('hidden');
      this.mode = 'play';
    }
  }

  toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    this.toastT = 2.4;
  }

  setPrompt(msg) {
    const el = $('prompt');
    if (!msg) {
      el.classList.add('hidden');
      this.promptText = '';
      return;
    }
    if (msg !== this.promptText) {
      el.textContent = msg;
      this.promptText = msg;
    }
    el.classList.remove('hidden');
  }

  updateCoins() { $('coin-count').textContent = this.save.coins; }

  addCoins(n, why) {
    this.save.coins += n;
    writeSave(this.save);
    this.updateCoins();
    this.sfx.coin();
    if (why) this.toast((n > 0 ? '+' : '') + n + ' coins \u00B7 ' + why);
  }

  buildWorld() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(980, 980),
      new THREE.MeshLambertMaterial({ color: 0x5fbf62 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = !this.lite;
    this.scene.add(ground);

    const roads = [], walks = [], yel = [], wht = [];
    const halfR = ROAD / 2;
    const extent = HALF_CITY + halfR;
    for (let i = 0; i <= N; i++) {
      const r = roadC(i);
      roads.push(boxAt(ROAD, 0.06, extent * 2, r, 0.02, 0));
      roads.push(boxAt(extent * 2, 0.06, ROAD, 0, 0.021, r));
      for (let s = -1; s <= 1; s += 2) {
        yel.push(boxAt(0.18, 0.02, extent * 2, r + s * 0.2, 0.055, 0));
        yel.push(boxAt(extent * 2, 0.02, 0.18, 0, 0.056, r + s * 0.2));
      }
    }
    const curbs = [];
    const dash = 2.2, gap = 3.4;
    for (let i = 0; i <= N; i++) {
      const r = roadC(i);
      for (const s of [-1, 1]) {
        for (let t = -extent + 2; t < extent - 2; t += dash + gap) {
          wht.push(boxAt(0.12, 0.02, dash, r + s * 3.15, 0.057, t));
          wht.push(boxAt(dash, 0.02, 0.12, t, 0.057, r + s * 3.15));
        }
      }
    }

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = lotC(i), z = lotC(j);
        const kind = specialLot(i, j);
        const pad = BLOCK + 3.2;
        walks.push(boxAt(pad, 0.12, pad, x, 0.05, z));
        // curbs along the lot edge
        const halfB = BLOCK / 2 + 0.2;
        curbs.push(boxAt(BLOCK + 0.8, 0.28, 0.35, x, 0.16, z - halfB));
        curbs.push(boxAt(BLOCK + 0.8, 0.28, 0.35, x, 0.16, z + halfB));
        curbs.push(boxAt(0.35, 0.28, BLOCK + 0.8, x - halfB, 0.16, z));
        curbs.push(boxAt(0.35, 0.28, BLOCK + 0.8, x + halfB, 0.16, z));
        const dist = districtOf(i, j);
        if (kind === 'park' || kind === 'plaza' || kind === 'stunt') {
          const grass = new THREE.Mesh(
            new THREE.BoxGeometry(BLOCK - 1, 0.08, BLOCK - 1),
            new THREE.MeshLambertMaterial({ color: kind === 'stunt' ? 0xb8b3a4 : 0x6dcc6a })
          );
          grass.position.set(x, 0.1, z);
          this.scene.add(grass);
        } else if (kind === 'build' && dist === 'suburb') {
          const lawn = new THREE.Mesh(
            new THREE.BoxGeometry(BLOCK - 2, 0.08, BLOCK - 2),
            new THREE.MeshLambertMaterial({ color: 0x7ed36a })
          );
          lawn.position.set(x, 0.1, z);
          this.scene.add(lawn);
        } else if (kind === 'build' && dist === 'industry') {
          const pad = new THREE.Mesh(
            new THREE.BoxGeometry(BLOCK - 2, 0.08, BLOCK - 2),
            new THREE.MeshLambertMaterial({ color: 0x6a6e74 })
          );
          pad.position.set(x, 0.1, z);
          this.scene.add(pad);
        } else if (kind === 'build' && dist === 'harbor') {
          const board = new THREE.Mesh(
            new THREE.BoxGeometry(BLOCK - 2, 0.08, BLOCK - 2),
            new THREE.MeshLambertMaterial({ color: 0xe6d5a8 })
          );
          board.position.set(x, 0.1, z);
          this.scene.add(board);
        }
        if (kind === 'plaza') {
          const tile = new THREE.Mesh(
            new THREE.BoxGeometry(BLOCK - 4, 0.1, BLOCK - 4),
            new THREE.MeshLambertMaterial({ color: 0xefe6c8 })
          );
          tile.position.set(x, 0.12, z);
          this.scene.add(tile);
        }
        for (const dir of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const cx = x + dir[0] * (BLOCK / 2 + 2.2);
          const cz = z + dir[1] * (BLOCK / 2 + 2.2);
          for (let k = -2; k <= 2; k++) {
            if (dir[0] !== 0) wht.push(boxAt(1.4, 0.02, 0.4, cx, 0.058, cz + k * 0.7));
            else wht.push(boxAt(0.4, 0.02, 1.4, cx + k * 0.7, 0.058, cz));
          }
        }
      }
    }

    const roadMesh = new THREE.Mesh(mergeGeos(roads), new THREE.MeshLambertMaterial({ color: 0x3d4454 }));
    const walkMesh = new THREE.Mesh(mergeGeos(walks), new THREE.MeshLambertMaterial({ color: 0xd8d3c6 }));
    roadMesh.receiveShadow = !this.lite;
    walkMesh.receiveShadow = !this.lite;
    this.scene.add(roadMesh);
    this.scene.add(walkMesh);
    this.scene.add(new THREE.Mesh(mergeGeos(yel), new THREE.MeshBasicMaterial({ color: 0xffe066 })));
    this.scene.add(new THREE.Mesh(mergeGeos(wht), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 })));
    if (curbs.length) this.scene.add(new THREE.Mesh(mergeGeos(curbs), new THREE.MeshLambertMaterial({ color: 0xb9b3a4 })));

    const bColors = [0xf28b82, 0xf6c28b, 0xfff1b8, 0xa8e6a1, 0x8ecae6, 0xd4b5f7, 0xffd6e0, 0xf4f1de, 0x80cfcf, 0xffc97a, 0xcdeac0, 0xbde0fe];
    const dummy = new THREE.Object3D();
    const bMat = new THREE.MeshLambertMaterial({ vertexColors: false, color: 0xffffff });
    patchBuildingMaterial(bMat);
    const placements = [];
    const rng = makeRng(20261124);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const kind = specialLot(i, j);
        const x = lotC(i), z = lotC(j);
        if (kind === 'park') this._fillPark(x, z, rng);
        else if (kind === 'plaza') this._fillPlaza(x, z);
        else if (kind === 'stunt') this._fillStunt(x, z);
        else if (kind === 'post') this._fillPost(x, z, placements);
        else if (kind === 'bank') this._fillBank(x, z);
        else if (kind === 'gas') this._fillGas(x, z);
        else if (kind === 'wash') this._fillWash(x, z);
        else if (kind === 'burger') this._fillBurger(x, z);
        else if (districtOf(i, j) === 'suburb') this._fillSuburb(x, z, placements, rng);
        else if (districtOf(i, j) === 'industry') this._fillIndustry(x, z, placements, rng);
        else if (districtOf(i, j) === 'harbor') this._fillHarbor(x, z, placements, rng);
        else this._fillBuildings(x, z, placements, bColors, rng, districtOf(i, j));
      }
    }

    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bMat, placements.length);
    const c = new THREE.Color();
    placements.forEach((p, i) => {
      dummy.position.set(p.x, p.h / 2, p.z);
      dummy.scale.set(p.w, p.h, p.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, c.setHex(p.color));
      this.colliders.push({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2, h: p.h });
    });
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = !this.lite;
    im.receiveShadow = !this.lite;
    this.scene.add(im);
    this.buildings = im;
    this._decorateBuildings(placements, rng);

    this._placeTreesAndLamps();
    this._placeHighway();
    this._placeWaterAndBridge();
    this._placeRiverJump();
    this._placeBeachExtras();
    this._placeCoins();
    this._skyBits();
    this._placeActionWorld();
    this._placeHiddenStars();
    this._placeParkedCars(rng);
  }

  _fillBuildings(x, z, out, colors, rng, dist = 'city') {
    const downtown = dist === 'downtown';
    const pal = downtown
      ? [0x9aa4b2, 0xc5d5e4, 0xdfe6ef, 0x8fa4b8, 0xb9c6d6, 0xe8eef5, 0x7f8fa0, 0xd0c8bc]
      : colors;
    const split = rng() > (downtown ? 0.35 : 0.55);
    if (split) {
      const gap = 1.6;
      const w = (BLOCK - 6 - gap) / 2;
      const d = BLOCK - 8;
      const h1 = downtown ? 18 + Math.floor(rng() * 28) : 5 + Math.floor(rng() * 18);
      const h2 = downtown ? 16 + Math.floor(rng() * 26) : 5 + Math.floor(rng() * 16);
      out.push({ x: x - w / 2 - gap / 2, z, w, d, h: h1, color: pal[(rng() * pal.length) | 0] });
      out.push({ x: x + w / 2 + gap / 2, z, w, d, h: h2, color: pal[(rng() * pal.length) | 0] });
    } else {
      const w = BLOCK - 7 - rng() * 4;
      const d = BLOCK - 7 - rng() * 4;
      const h = downtown ? 20 + Math.floor(rng() * 28) : 6 + Math.floor(rng() * 22);
      out.push({ x, z, w, d, h, color: pal[(rng() * pal.length) | 0] });
    }
  }

  _fillPost(x, z, out) {
    out.push({ x, z: z - 4, w: BLOCK - 10, d: 16, h: 8, color: 0xff9f43 });
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 5, 0.1), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    flag.position.set(x + 8, 2.5, z + 8);
    this.scene.add(flag);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.08), new THREE.MeshLambertMaterial({ color: 0x4d8fff }));
    banner.position.set(x + 8.7, 4.4, z + 8);
    this.scene.add(banner);
    this.scene.add(this._jobSign(x, z + 14, 0xff9f43));
    this.postSpot = new THREE.Vector3(x, 0, z + 16);
  }

  _fillPlaza(x, z) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.5, 16), new THREE.MeshLambertMaterial({ color: 0xd0cbc0 }));
    base.position.set(x, 0.3, z);
    this.scene.add(base);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.3, 16), new THREE.MeshLambertMaterial({ color: 0x5ecbe3 }));
    water.position.set(x, 0.5, z);
    this.scene.add(water);
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.35, 16), new THREE.MeshLambertMaterial({ color: 0xcfc8b8 }));
    mid.position.set(x, 0.85, z);
    this.scene.add(mid);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.6, 8), new THREE.MeshLambertMaterial({ color: 0x9ad9ea }));
    spout.position.set(x, 1.7, z);
    this.scene.add(spout);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshLambertMaterial({ color: 0x9ad9ea }));
    ball.position.set(x, 2.9, z);
    this.scene.add(ball);
    this.fountainSpray = new THREE.Group();
    for (let k = 0; k < 8; k++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xb9efff, transparent: true, opacity: 0.75 }));
      this.fountainSpray.add(drop);
    }
    this.fountainSpray.position.set(x, 0, z);
    this.scene.add(this.fountainSpray);
    this.colliders.push({ minX: x - 3.4, maxX: x + 3.4, minZ: z - 3.4, maxZ: z + 3.4, h: 2 });
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x8a5a32 });
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.5), benchMat);
      b.position.set(x + Math.cos(a) * 8, 0.4, z + Math.sin(a) * 8);
      b.rotation.y = a + Math.PI / 2;
      this.scene.add(b);
    }
    this.plaza = new THREE.Vector3(x, 0, z);
    const dtown = makeTextSign('DOWNTOWN', 10, 2, '#1d4ed8', '#ffe066', ['DOWNTOWN']);
    dtown.position.set(x, 8, z + 16);
    this.scene.add(dtown);
    this.scene.add(this._jobSign(x + 12, z + 12, 0xffd400));
    this.taxiSpot = new THREE.Vector3(x + 12, 0, z + 14);
  }

  _fillPark(x, z, rng) {
    const path = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, BLOCK - 4), new THREE.MeshLambertMaterial({ color: 0xe6d7a8 }));
    path.position.set(x, 0.14, z);
    this.scene.add(path);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 8), new THREE.MeshLambertMaterial({ color: 0x5fa85a }));
    bed.position.set(x, 0.18, z);
    this.scene.add(bed);
    for (let k = 0; k < 10; k++) {
      const fl = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 6, 5),
        new THREE.MeshLambertMaterial({ color: [0xff6b9a, 0xffd93d, 0xff7f50, 0xc77dff][k % 4] })
      );
      fl.position.set(x + (rng() - 0.5) * 7, 0.4, z + (rng() - 0.5) * 7);
      this.scene.add(fl);
    }
    const bushM = new THREE.MeshLambertMaterial({ color: 0x3d8f3a });
    const nBush = this.lite ? 4 : 8;
    for (let k = 0; k < nBush; k++) {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.7 + rng() * 0.3, 7, 6), bushM);
      bush.position.set(x + (rng() - 0.5) * 16, 0.55, z + (rng() - 0.5) * 16);
      bush.scale.y = 0.7;
      this.scene.add(bush);
    }
  }

  _fillStunt(x, z) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(BLOCK - 2, 0.12, BLOCK - 2), new THREE.MeshLambertMaterial({ color: 0x9a9588 }));
    pad.position.set(x, 0.12, z);
    this.scene.add(pad);
    const ramps = [
      { x: x - 8, z: z - 6, len: 12, w: 5, yaw: 0, h0: 0, h1: 4.5 },
      { x: x + 8, z: z + 4, len: 10, w: 5, yaw: Math.PI, h0: 0, h1: 3.5 },
      { x: x, z: z + 10, len: 8, w: 4, yaw: -Math.PI / 2, h0: 0, h1: 3.2 },
    ];
    const rampMat = new THREE.MeshLambertMaterial({ color: 0xff8a3d });
    for (const r of ramps) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.35, r.len), rampMat);
      mesh.position.set(
        r.x + Math.sin(r.yaw) * r.len / 2,
        (r.h0 + r.h1) / 2,
        r.z - Math.cos(r.yaw) * r.len / 2
      );
      const tilt = Math.atan2(r.h1 - r.h0, r.len);
      mesh.rotation.y = r.yaw;
      mesh.rotation.x = -tilt;
      this.scene.add(mesh);
      this.ramps.push(r);
    }
    for (const ringZ of [z - 2, z + 8]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.2, 0.18, 8, 16),
        new THREE.MeshLambertMaterial({ color: 0xffe566, emissive: 0x665500 })
      );
      ring.position.set(x - 8, 3.6, ringZ);
      ring.rotation.y = Math.PI / 2;
      this.scene.add(ring);
    }
    const banner = makeTextSign('STUNT PARK', 8, 2.2, '#ff4d6d', '#fffbe6', ['STUNT PARK']);
    banner.position.set(x, 5.5, z - 16);
    this.scene.add(banner);
    const banner2 = banner.clone();
    banner2.position.set(x, 5.5, z + 16);
    banner2.rotation.y = Math.PI;
    this.scene.add(banner2);
    this.scene.add(this._jobSign(x + 14, z - 16, 0xff4d6d));
    this.raceSpot = new THREE.Vector3(x + 14, 0, z - 18);
  }

  _addColliderBox(x, z, w, d, h) {
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
  }

  _fillBank(x, z) {
    const id = 'bank-' + this.banks.length;
    const bx = x, bz = z - 5;
    const w = 20, d = 14, h = 9;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: 0xf3efe3 }));
    body.position.set(bx, h / 2, bz);
    body.castShadow = !this.lite;
    this.scene.add(body);
    this._addColliderBox(bx, bz, w, d, h);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4), new THREE.MeshLambertMaterial({ color: 0xd4af37 }));
    trim.position.set(bx, h, bz);
    this.scene.add(trim);
    const step = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 3), new THREE.MeshLambertMaterial({ color: 0xddd6c4 }));
    step.position.set(bx, 0.2, bz + d / 2 + 1.2);
    this.scene.add(step);
    const colM = new THREE.MeshLambertMaterial({ color: 0xf7f4ea });
    for (const sx of [-6, -2, 2, 6]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 6.5, 10), colM);
      col.position.set(bx + sx, 3.4, bz + d / 2 + 0.2);
      this.scene.add(col);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.4, 0.2), new THREE.MeshLambertMaterial({ color: 0x2c4c7c }));
    door.position.set(bx, 1.8, bz + d / 2 + 0.15);
    this.scene.add(door);
    const sign = makeTextSign('ZOOM CITY BANK', 10, 2.2, '#1d4ed8', '#ffe566', ['ZOOM CITY', 'BANK']);
    sign.position.set(bx, 7.4, bz + d / 2 + 0.3);
    this.scene.add(sign);
    const back = sign.clone();
    back.position.set(bx, 7.4, bz - d / 2 - 0.3);
    back.rotation.y = Math.PI;
    this.scene.add(back);
    const bags = new THREE.Group();
    const bagM = new THREE.MeshLambertMaterial({ color: 0xc9a227 });
    for (let k = 0; k < 3; k++) {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), bagM);
      bag.scale.y = 1.2;
      bag.position.set((k - 1) * 0.7, 0.5, 0);
      bags.add(bag);
    }
    bags.visible = false;
    this.scene.add(bags);
    const mx = bx, mz = bz + d / 2 + 4.2;
    const marker = this._makePlaceMarker(0xffe066);
    marker.position.set(mx, 0, mz);
    this.scene.add(marker);
    const closed = makeTextSign('BANK CLOSED', 10, 2.2, '#555', '#ffe066', ['BANK', 'CLOSED']);
    closed.position.copy(sign.position);
    closed.visible = false;
    this.scene.add(closed);
    this.banks.push({
      id, x: mx, z: mz, bx, bz, open: true, hold: 0, coolUntil: 0, marker, bags, sign, closedSign: closed, openSign: sign,
    });
  }

  _fillGas(x, z) {
    const shop = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), new THREE.MeshLambertMaterial({ color: 0xfff3b0 }));
    shop.position.set(x - 8, 2.5, z - 6);
    this.scene.add(shop);
    this._addColliderBox(x - 8, z - 6, 10, 8, 5);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(16, 0.35, 12), new THREE.MeshLambertMaterial({ color: 0xff4d4d }));
    canopy.position.set(x + 4, 4.2, z + 4);
    this.scene.add(canopy);
    for (const sx of [-5, 5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4.2, 8), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      post.position.set(x + 4 + sx, 2.1, z + 4);
      this.scene.add(post);
    }
    const pumpM = new THREE.MeshLambertMaterial({ color: 0xee3333 });
    for (const sx of [-3, 3]) {
      for (const sz of [-2.5, 2.5]) {
        const pump = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.5), pumpM);
        pump.position.set(x + 4 + sx, 0.8, z + 4 + sz);
        this.scene.add(pump);
      }
    }
    const sign = makeTextSign('GAS', 6, 2, '#c81e1e', '#ffffff', ['GAS']);
    sign.position.set(x + 4, 5.6, z + 4);
    this.scene.add(sign);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(16, 0.08, 12), new THREE.MeshLambertMaterial({ color: 0x4a5160 }));
    pad.position.set(x + 4, 0.1, z + 4);
    this.scene.add(pad);
    this.places.gas = { x: x + 4, z: z + 4, r: 6, hold: 0 };
  }

  _fillWash(x, z) {
    const hall = 16;
    const archM = new THREE.MeshLambertMaterial({ color: 0x6ec6ff });
    const foamM = new THREE.MeshLambertMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.35 });
    for (let k = 0; k < 3; k++) {
      const zz = z - 6 + k * 6;
      for (const sx of [-2.4, 2.4]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.6, 1.0), archM);
        post.position.set(x + sx, 1.8, zz);
        this.scene.add(post);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 1.2), archM);
      top.position.set(x, 3.7, zz);
      this.scene.add(top);
      const foam = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 0.2), foamM);
      foam.position.set(x, 2.0, zz);
      this.scene.add(foam);
    }
    const soap = new THREE.Mesh(new THREE.BoxGeometry(5, 0.08, hall), new THREE.MeshLambertMaterial({ color: 0xc8f4ff, transparent: true, opacity: 0.55 }));
    soap.position.set(x, 0.12, z);
    this.scene.add(soap);
    const shop = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 8), new THREE.MeshLambertMaterial({ color: 0x8ecae6 }));
    shop.position.set(x - 10, 2, z);
    this.scene.add(shop);
    this._addColliderBox(x - 10, z, 8, 8, 4);
    const sign = makeTextSign('CAR WASH', 8, 2, '#00bbf9', '#083344', ['CAR WASH']);
    sign.position.set(x, 5, z - 8);
    this.scene.add(sign);
    this.places.wash = { x, z, r: 4, len: 10 };
  }

  _fillBurger(x, z) {
    const shop = new THREE.Mesh(new THREE.BoxGeometry(14, 5.5, 12), new THREE.MeshLambertMaterial({ color: 0xffb703 }));
    shop.position.set(x, 2.75, z - 3);
    shop.castShadow = !this.lite;
    this.scene.add(shop);
    this._addColliderBox(x, z - 3, 14, 12, 5.5);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.2, 2.2), new THREE.MeshLambertMaterial({ color: 0xe63946 }));
    awn.position.set(x, 3.4, z + 4);
    this.scene.add(awn);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshLambertMaterial({ color: 0xf4a261 }));
    bun.position.set(x + 4, 6.4, z - 3);
    bun.scale.y = 0.55;
    this.scene.add(bun);
    const patty = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 10), new THREE.MeshLambertMaterial({ color: 0x6d3b16 }));
    patty.position.set(x + 4, 6.05, z - 3);
    this.scene.add(patty);
    const sign = makeTextSign('ZOOM BURGER', 8, 2.2, '#e63946', '#fff5d6', ['ZOOM', 'BURGER']);
    sign.position.set(x, 6.4, z + 3.2);
    this.scene.add(sign);
    for (const sx of [-4, 0, 4]) {
      const table = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0x8d6e4c }));
      table.position.set(x + sx, 0.7, z + 8);
      this.scene.add(table);
    }
    this.places.burger = { x, z: z + 8, r: 5, hold: 0, coolUntil: 0 };
  }

  _makePlaceMarker(color) {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 9, 10, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.y = 4.5;
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), new THREE.MeshBasicMaterial({ color }));
    diamond.position.y = 5.4;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.1, 20),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.14;
    g.add(beam, diamond, ring);
    g.userData = { diamond, ring };
    return g;
  }

  _fillSuburb(x, z, out, rng) {
    const colors = [0xf7efe3, 0xffe0bd, 0xf4d6c6, 0xe8f0d8, 0xfff3c4, 0xdce8f5];
    const roofC = [0xc0392b, 0x8b4513, 0x4a6572, 0xb85c38, 0x555];
    const n = 3 + ((rng() * 2) | 0);
    for (let k = 0; k < n; k++) {
      const ox = ((k % 2) * 2 - 1) * (7 + rng() * 3);
      const oz = (k < 2 ? -1 : 1) * (7 + rng() * 3);
      const hx = x + ox, hz = z + oz;
      const w = 7 + rng() * 2, d = 6 + rng() * 2, h = 3.4;
      out.push({ x: hx, z: hz, w, d, h, color: colors[(rng() * colors.length) | 0] });
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(w, d) * 0.72, 2.2, 4),
        new THREE.MeshLambertMaterial({ color: roofC[(rng() * roofC.length) | 0] })
      );
      roof.position.set(hx, h + 1.1, hz);
      roof.rotation.y = Math.PI / 4;
      this.scene.add(roof);
      const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), new THREE.MeshLambertMaterial({ color: 0x8a4f3a }));
      chim.position.set(hx + w * 0.2, h + 1.8, hz + d * 0.15);
      this.scene.add(chim);
    }
  }

  _fillIndustry(x, z, out, rng) {
    const w = BLOCK - 10, d = BLOCK - 12, h = 6 + rng() * 4;
    out.push({ x, z: z - 2, w, d, h, color: [0x8a8e95, 0x6d6258, 0x9aa0a8][(rng() * 3) | 0] });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 0.8, 0.2), new THREE.MeshLambertMaterial({ color: 0xffb703 }));
    stripe.position.set(x, 3, z - 2 + d / 2 + 0.1);
    this.scene.add(stripe);
    const tankN = this.lite ? 1 : 2;
    for (let k = 0; k < tankN; k++) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 5, 10), new THREE.MeshLambertMaterial({ color: 0xb0b7c4 }));
      tank.position.set(x + (k === 0 ? 10 : -10), 2.6, z + 12);
      this.scene.add(tank);
      this._addColliderBox(x + (k === 0 ? 10 : -10), z + 12, 4.4, 4.4, 5);
    }
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 10, 8), new THREE.MeshLambertMaterial({ color: 0x4a4e56 }));
    stack.position.set(x - 8, 5, z - 8);
    this.scene.add(stack);
    if (!this._industrySign) {
      const s = makeTextSign('INDUSTRIAL', 10, 2, '#4a4e56', '#ffb703', ['INDUSTRIAL']);
      s.position.set(x, 9, z + 16);
      this.scene.add(s);
      this._industrySign = true;
    }
  }

  _fillHarbor(x, z, out, rng) {
    const w = 14 + rng() * 4, d = 10, h = 5;
    out.push({ x, z: z - 4, w, d, h, color: [0xe8d5a3, 0x87a8b8, 0xf2efe6][(rng() * 3) | 0] });
    if (!this.lite) {
      for (let k = 0; k < 3; k++) this._addProp('crate', x + (k - 1) * 3, 0, z + 10);
    }
    if (!this._harborSign) {
      const s = makeTextSign('HARBOR', 8, 2, '#1d4e7c', '#fff5d6', ['HARBOR']);
      s.position.set(x, 8, z + 14);
      this.scene.add(s);
      this._harborSign = true;
    }
  }

  _placeHighway() {
    const halfW = 8;
    const r = HALF_CITY + ROAD / 2 + 22;
    this.highway = { r, halfW };
    const hw = [], dash = [];
    const len = r * 2 + halfW * 2;
    // four sides, centered on axes
    hw.push(boxAt(len, 0.08, halfW * 2, 0, 0.04, -r));
    hw.push(boxAt(len, 0.08, halfW * 2, 0, 0.04, r));
    hw.push(boxAt(halfW * 2, 0.08, len, -r, 0.04, 0));
    hw.push(boxAt(halfW * 2, 0.08, len, r, 0.04, 0));
    // on-ramps from mid outer city roads to the highway
    const cityEdge = HALF_CITY + ROAD / 2;
    for (const side of [
      { x: 0, z0: cityEdge, z1: r, axis: 'z' },
      { x: 0, z0: -cityEdge, z1: -r, axis: 'z' },
      { z: 0, x0: cityEdge, x1: r, axis: 'x' },
      { z: 0, x0: -cityEdge, x1: -r, axis: 'x' },
    ]) {
      if (side.axis === 'z') {
        const mid = (side.z0 + side.z1) / 2;
        const span = Math.abs(side.z1 - side.z0);
        hw.push(boxAt(10, 0.08, span + 2, side.x, 0.045, mid));
      } else {
        const mid = (side.x0 + side.x1) / 2;
        const span = Math.abs(side.x1 - side.x0);
        hw.push(boxAt(span + 2, 0.08, 10, mid, 0.045, side.z));
      }
    }
    const dashLen = 3, gap = 4;
    for (const z of [-r, r]) {
      for (let x = -r + 4; x < r - 4; x += dashLen + gap) dash.push(boxAt(dashLen, 0.02, 0.16, x, 0.09, z));
    }
    for (const x of [-r, r]) {
      for (let z = -r + 4; z < r - 4; z += dashLen + gap) dash.push(boxAt(0.16, 0.02, dashLen, x, 0.09, z));
    }
    this.scene.add(new THREE.Mesh(mergeGeos(hw), new THREE.MeshLambertMaterial({ color: 0x3a3f4c })));
    this.scene.add(new THREE.Mesh(mergeGeos(dash), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 })));
    const sign = makeTextSign('HIGHWAY', 10, 2, '#2b6b2e', '#ffffff', ['HIGHWAY']);
    sign.position.set(0, 5, -r);
    this.scene.add(sign);
    const sign2 = sign.clone();
    sign2.position.set(0, 5, r);
    sign2.rotation.y = Math.PI;
    this.scene.add(sign2);
  }

  _placeBeachExtras() {
    const shore = this.waterZ;
    const r = this.highway ? this.highway.r : HALF_CITY;
    // pier
    const pierX = 70;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(6, 0.35, 28), new THREE.MeshLambertMaterial({ color: 0xc4a574 }));
    pier.position.set(pierX, 0.3, shore + 12);
    this.scene.add(pier);
    this.pier = { x: pierX, z: shore + 12 };
    for (const sx of [-2.6, 2.6]) {
      for (let k = 0; k < 4; k++) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.6, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a40 }));
        post.position.set(pierX + sx, 0.2, shore + 2 + k * 7);
        this.scene.add(post);
      }
    }
    // simple boats
    const boatM = new THREE.MeshLambertMaterial({ color: 0xf4f1de });
    for (let k = 0; k < (this.lite ? 1 : 3); k++) {
      const boat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.8, 8), boatM);
      boat.position.set(pierX + 8 + k * 10, 0.2, shore + 16);
      this.scene.add(boat);
    }
    // umbrellas
    if (!this.lite) {
      for (let k = 0; k < 5; k++) {
        const ux = -40 + k * 12, uz = shore + 3;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), new THREE.MeshLambertMaterial({ color: 0xddd }));
        pole.position.set(ux, 1.1, uz);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.7, 8), new THREE.MeshLambertMaterial({ color: [0xff6b9a, 0xffe066, 0x4d8fff][k % 3] }));
        cap.position.set(ux, 2.3, uz);
        this.scene.add(pole, cap);
      }
    }
    const light = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 10, 8), new THREE.MeshLambertMaterial({ color: 0xf2efe6 }));
    light.position.set(-r + 10, 5, shore + 8);
    this.scene.add(light);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.2, 8), new THREE.MeshLambertMaterial({ color: 0xc0392b }));
    top.position.set(-r + 10, 11, shore + 8);
    this.scene.add(top);
    const be = makeTextSign('BEACH', 8, 2, '#1d4ed8', '#ffe066', ['BEACH']);
    be.position.set(-20, 4, shore - 2);
    this.scene.add(be);
  }

  _jobSign(x, z, color) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 6), new THREE.MeshLambertMaterial({ color: 0x555b68 }));
    pole.position.set(x, 1.6, z);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 0.12), new THREE.MeshLambertMaterial({ color }));
    board.position.set(x, 3.1, z);
    g.add(pole, board);
    return g;
  }

  _placeTreesAndLamps() {
    const treePts = [];
    const lampPts = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = lotC(i), z = lotC(j);
        const kind = specialLot(i, j);
        const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        if (kind === 'park') {
          for (let k = 0; k < 7; k++) {
            treePts.push({
              x: x + (hash2(i + k, j) - 0.5) * (BLOCK - 8),
              z: z + (hash2(j, i + k + 3) - 0.5) * (BLOCK - 8),
              s: 0.85 + hash2(k, i + j) * 0.5,
            });
          }
        } else if (kind !== 'stunt') {
          for (const sxsz of corners) {
            treePts.push({ x: x + sxsz[0] * (BLOCK / 2 - 2.2), z: z + sxsz[1] * (BLOCK / 2 - 2.2), s: 0.8 + hash2(i, j + sxsz[0]) * 0.3 });
          }
        }
        for (const sxsz of corners) {
          lampPts.push({ x: x + sxsz[0] * (BLOCK / 2 + 1.4), z: z + sxsz[1] * (BLOCK / 2 + 1.4) });
        }
      }
    }
    const tGeo = treeGeometry();
    const tMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const trees = new THREE.InstancedMesh(tGeo, tMat, treePts.length);
    const dummy = new THREE.Object3D();
    treePts.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.scale.setScalar(p.s);
      dummy.rotation.y = hash2(i, 9) * Math.PI * 2;
      dummy.updateMatrix();
      trees.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(trees);

    const lGeo = lampGeometry();
    const lMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const lamps = new THREE.InstancedMesh(lGeo, lMat, lampPts.length);
    lampPts.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.scale.setScalar(1);
      dummy.rotation.y = (i % 2) * Math.PI / 2;
      dummy.updateMatrix();
      lamps.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(lamps);
    const bulbGeo = new THREE.SphereGeometry(0.28, 8, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0 });
    this.lampBulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampPts.length);
    lampPts.forEach((p, i) => {
      dummy.position.set(p.x, 4.15, p.z);
      dummy.scale.setScalar(1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      this.lampBulbs.setMatrixAt(i, dummy.matrix);
    });
    this.lampBulbs.visible = false;
    this.scene.add(this.lampBulbs);
  }

  _placeWaterAndBridge() {
    const shore = this.highway
      ? this.highway.r + this.highway.halfW + 10
      : HALF_CITY + ROAD / 2 + 6;
    this.waterZ = shore;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(760, 240),
      new THREE.MeshLambertMaterial({ color: 0x3cb0c8, transparent: true, opacity: 0.94 })
    );
    water.rotation.x = -Math.PI / 2;
    // sit just above the ground plane so the harbor is visible from the air
    water.position.set(0, 0.12, shore + 100);
    this.scene.add(water);
    this.waterMesh = water;
    const sand = new THREE.Mesh(
      new THREE.BoxGeometry(720, 0.2, 14),
      new THREE.MeshLambertMaterial({ color: 0xf2e0a8 })
    );
    sand.position.set(0, 0.05, shore + 2);
    this.scene.add(sand);

    const islandZ = shore + 62;
    this.island = { x: 0, z: islandZ, r: 28 };
    const island = new THREE.Mesh(
      new THREE.CylinderGeometry(28, 30, 1.2, 20),
      new THREE.MeshLambertMaterial({ color: 0x62c25a })
    );
    island.position.set(0, 0.3, islandZ);
    this.scene.add(island);
    const palm = treeGeometry();
    const tMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      const t = new THREE.Mesh(palm, tMat);
      t.position.set(Math.cos(a) * 14, 0.8, islandZ + Math.sin(a) * 14);
      t.scale.setScalar(1.15);
      this.scene.add(t);
    }

    const deckH = 3.2;
    const approach = 16;
    this.ramps.push({ x: 0, z: shore - 2, len: approach, w: 8, yaw: Math.PI, h0: 0, h1: deckH });
    this.ramps.push({ x: 0, z: islandZ - 22, len: approach, w: 8, yaw: 0, h0: deckH, h1: 0 });
    this.bridge = { minZ: shore - 2 - approach, maxZ: islandZ - 22 + approach, w: 8, h: deckH, flat0: shore - 2 + approach, flat1: islandZ - 22 };

    const bMat = new THREE.MeshLambertMaterial({ color: 0x8b93a6 });
    const up = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, approach), bMat);
    up.position.set(0, deckH / 2, shore - 2 + approach / 2);
    up.rotation.x = -Math.atan2(deckH, approach);
    this.scene.add(up);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, this.bridge.flat1 - this.bridge.flat0), bMat);
    deck.position.set(0, deckH, (this.bridge.flat0 + this.bridge.flat1) / 2);
    this.scene.add(deck);
    const down = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, approach), bMat);
    down.position.set(0, deckH / 2, islandZ - 22 + approach / 2);
    down.rotation.x = Math.atan2(deckH, approach);
    this.scene.add(down);
    const railM = new THREE.MeshLambertMaterial({ color: 0xeee6c8 });
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, this.bridge.flat1 - this.bridge.flat0), railM);
      rail.position.set(s * 3.8, deckH + 0.5, (this.bridge.flat0 + this.bridge.flat1) / 2);
      this.scene.add(rail);
    }
    for (let k = 0; k < 4; k++) {
      const pz = this.bridge.flat0 + (k + 0.5) * (this.bridge.flat1 - this.bridge.flat0) / 4;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, deckH, 1.2), new THREE.MeshLambertMaterial({ color: 0x7a8194 }));
      pillar.position.set(0, deckH / 2, pz);
      this.scene.add(pillar);
    }
  }

  _placeCoins() {
    const spots = [];
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        if ((i + j) % 2 === 0) spots.push({ x: roadC(i) + 3, z: roadC(j) + 3 });
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (specialLot(i, j) === 'park') {
          spots.push({ x: lotC(i), z: lotC(j) + 6 });
          spots.push({ x: lotC(i) - 6, z: lotC(j) });
        }
      }
    }
    spots.push({ x: 0, z: this.island.z });
    spots.push({ x: -8, z: this.island.z + 6 });
    spots.push({ x: lotC(0) - 8, z: lotC(0) - 2 });
    const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffd24a, emissive: 0x664400, emissiveIntensity: 0.25 });
    this.coinMesh = new THREE.InstancedMesh(geo, mat, spots.length);
    this.coins = spots.map((s, i) => ({ x: s.x, z: s.z, got: false, respawn: 0, i }));
    this.scene.add(this.coinMesh);
  }

  _skyBits() {
    const cMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.clouds = [];
    const nCloud = this.lite ? 5 : 10;
    for (let i = 0; i < nCloud; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(4 + (k % 2), 8, 6), cMat);
        p.position.set(k * 4 - 4, (k % 2) * 1.2, (hash2(i, k) - 0.5) * 3);
        p.scale.set(1.4, 0.7, 1);
        g.add(p);
      }
      g.position.set((i - 4) * 28, 42 + (i % 3) * 4, (hash2(i, 1) - 0.5) * 160);
      this.scene.add(g);
      this.clouds.push(g);
    }
    this.sunBall = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    this.scene.add(this.sunBall);
    this.moonBall = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 10), new THREE.MeshBasicMaterial({ color: 0xdde6ff }));
    this.scene.add(this.moonBall);
    const skyGeo = new THREE.SphereGeometry(620, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x6ec4e8) },
        mid: { value: new THREE.Color(0xb7e4f7) },
        bot: { value: new THREE.Color(0xefe7c8) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;',
        'void main(){',
        '  float h = normalize(vP).y;',
        '  vec3 c = mix(bot, mid, smoothstep(-0.15, 0.15, h));',
        '  c = mix(c, top, smoothstep(0.15, 0.85, h));',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n'),
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyMat = skyMat;
    this.scene.add(this.skyDome);
  }

  _decorateBuildings(placements, rng) {
    const acGeo = new THREE.BoxGeometry(1.4, 0.7, 1.1);
    const tankGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.3, 8);
    const antGeo = mergeGeos([
      (() => { const p = new THREE.CylinderGeometry(0.05, 0.06, 3.2, 5); p.translate(0, 1.6, 0); return p; })(),
      (() => { const p = new THREE.BoxGeometry(1.2, 0.08, 0.08); p.translate(0, 3.1, 0); return p; })(),
    ]);
    const doorGeo = new THREE.BoxGeometry(1.2, 2.1, 0.12);
    const awnGeo = new THREE.BoxGeometry(2.4, 0.12, 1.1);
    const acs = [], tanks = [], ants = [], doors = [], awns = [];
    const n = placements.length;
    const step = this.lite ? 2 : 1;
    for (let i = 0; i < n; i += step) {
      const p = placements[i];
      const topY = p.h;
      acs.push({ x: p.x + (rng() - 0.5) * p.w * 0.4, y: topY + 0.4, z: p.z + (rng() - 0.5) * p.d * 0.4 });
      if (rng() > 0.45) tanks.push({ x: p.x + (rng() - 0.5) * p.w * 0.35, y: topY + 0.7, z: p.z + (rng() - 0.5) * p.d * 0.35 });
      if (rng() > 0.5) ants.push({ x: p.x + (rng() - 0.5) * p.w * 0.3, y: topY, z: p.z + (rng() - 0.5) * p.d * 0.3 });
      // door/awning on the side nearest a road
      let faceX = 0, faceZ = 1;
      let best = 99;
      for (let k = 0; k <= N; k++) {
        const r = roadC(k);
        if (Math.abs(p.x - r) < best) { best = Math.abs(p.x - r); faceX = Math.sign(r - p.x) || 1; faceZ = 0; }
        if (Math.abs(p.z - r) < best) { best = Math.abs(p.z - r); faceZ = Math.sign(r - p.z) || 1; faceX = 0; }
      }
      const dx = faceX * (p.w / 2 + 0.06);
      const dz = faceZ * (p.d / 2 + 0.06);
      const yaw = faceX !== 0 ? Math.PI / 2 : 0;
      doors.push({ x: p.x + dx, y: 1.05, z: p.z + dz, yaw });
      awns.push({ x: p.x + dx + faceX * 0.4, y: 2.3, z: p.z + dz + faceZ * 0.4, yaw });
    }
    const dummy = new THREE.Object3D();
    const inst = (geo, hex, list) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: hex }), list.length);
      list.forEach((q, i) => {
        dummy.position.set(q.x, q.y, q.z);
        dummy.rotation.set(0, q.yaw || 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = !this.lite;
      this.scene.add(mesh);
    };
    inst(acGeo, 0x8b93a6, acs);
    inst(tankGeo, 0xb0b7c4, tanks);
    inst(antGeo, 0x555b68, ants);
    inst(doorGeo, 0x4a3422, doors);
    inst(awnGeo, 0xe85d04, awns);
  }

  _placeRiverJump() {
    const shore = this.waterZ;
    const islandZ = this.island.z;
    const x = 18;
    const deckH = 5.4;
    const approach = 18;
    this.ramps.push({ x, z: shore - 2, len: approach, w: 7, yaw: Math.PI, h0: 0, h1: deckH });
    this.ramps.push({ x, z: islandZ - 18, len: 14, w: 8, yaw: 0, h0: 2.2, h1: 0 });
    const mat = new THREE.MeshLambertMaterial({ color: 0xff7a18 });
    const up = new THREE.Mesh(new THREE.BoxGeometry(7, 0.4, approach), mat);
    up.position.set(x, deckH / 2, shore - 2 + approach / 2);
    up.rotation.x = -Math.atan2(deckH, approach);
    this.scene.add(up);
    const sign = makeTextSign('RIVER JUMP', 8, 2, '#ff7a18', '#1b1408', ['RIVER JUMP']);
    sign.position.set(x, 4.5, shore - 10);
    this.scene.add(sign);
    const land = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 10), new THREE.MeshLambertMaterial({ color: 0x9a9588 }));
    land.position.set(x, 0.4, islandZ - 10);
    this.scene.add(land);
    this.places.jump = { x, z: shore - 8 };
  }

  _placeParkedCars(rng) {
    this.parked = [];
    const colors = [0x4d8fff, 0xff6b9a, 0x2bb673, 0xffb703, 0xf4f1de, 0x222244, 0x80cbc4, 0xff7043];
    const n = this.lite ? 10 : 24;
    let k = 0;
    for (let i = 0; i <= N && k < n; i++) {
      for (let j = 0; j < N && k < n; j++) {
        if ((i + j + k) % 2 !== 0) continue;
        const alongZ = (k % 2 === 0);
        const x = alongZ ? (roadC(i) + (k % 4 < 2 ? 6.2 : -6.2)) : lotC(j % N);
        const z = alongZ ? lotC(j) : (roadC(i) + (k % 4 < 2 ? 6.2 : -6.2));
        if (Math.hypot(x, z) < 8) continue;
        const spec = {
          id: 'parked' + k, name: 'Parked', color: colors[k % colors.length], accent: 0xffffff,
          max: 0, kind: ['hatch', 'van', 'sport'][k % 3],
        };
        const mesh = makeCarMesh(spec);
        const car = {
          spec, mesh, pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(),
          heading: alongZ ? 0 : Math.PI / 2, speed: 0, hp: 40, wrecked: false, parked: true,
        };
        this.placeCar(car);
        this.scene.add(mesh);
        this.parked.push(car);
        k += 1;
      }
    }
  }

  _placeHiddenStars() {
    const spots = [
      { id: 'island', x: 0, z: (this.island && this.island.z) + 10, y: 1.4 },
      { id: 'fountain', x: lotC(PLAZA_I) - 10, z: lotC(PLAZA_J) - 10, y: 1.3 },
      { id: 'stunt', x: lotC(0) - 10, z: lotC(0) + 12, y: 1.3 },
      { id: 'parkA', x: lotC(1) + 8, z: lotC(5) - 8, y: 1.3 },
      { id: 'parkB', x: lotC(5) - 8, z: lotC(1) + 8, y: 1.3 },
      { id: 'post', x: lotC(N - 1) + 10, z: lotC(1) + 10, y: 1.3 },
      { id: 'shore', x: -22, z: this.waterZ - 4, y: 1.4 },
      { id: 'bridge', x: 0, z: (this.bridge.flat0 + this.bridge.flat1) / 2, y: 5.2 },
      { id: 'harbor', x: 70, z: (this.waterZ || 0) + 12, y: 1.4 },
      { id: 'highway', x: 0, z: this.highway ? -this.highway.r : -HALF_CITY, y: 1.3 },
      { id: 'industry', x: lotC(N - 1) - 8, z: lotC(0) + 8, y: 1.3 },
      { id: 'suburb', x: lotC(1) + 6, z: lotC(1) - 6, y: 1.3 },
    ];
    const geo = new THREE.OctahedronGeometry(0.55);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe566 });
    this.hiddenStars = spots.map((s) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(s.x, s.y, s.z);
      const got = this.save.hiddenStars.includes(s.id);
      mesh.visible = !got;
      this.scene.add(mesh);
      return { id: s.id, x: s.x, z: s.z, y: s.y, mesh, got };
    });
  }

  updateHiddenStars(dt) {
    const p = this.playerCar ? this.playerCar.mesh.position : this.player.position;
    for (const s of this.hiddenStars) {
      if (s.got) continue;
      s.mesh.rotation.y += dt * 2.2;
      s.mesh.position.y = s.y + Math.sin(this.time * 3 + s.x) * 0.2;
      if (Math.hypot(s.x - p.x, s.z - p.z) < 2.2 && Math.abs((s.mesh.position.y) - p.y) < 4) {
        s.got = true;
        s.mesh.visible = false;
        if (!this.save.hiddenStars.includes(s.id)) {
          this.save.hiddenStars.push(s.id);
          writeSave(this.save);
        }
        this.sfx.success();
        this.addCoins(3, 'Hidden star!');
        this.toast('🌟 You found a hidden star!  ' + this.save.hiddenStars.length + ' / ' + HIDDEN_STAR_TOTAL);
      }
    }
  }

  makeMarkers() {
    this.markers = {};
    for (const id of ['job', 'goal', 'pickup']) {
      const g = new THREE.Group();
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 10, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
      );
      beam.position.y = 5;
      const diamond = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.9),
        new THREE.MeshBasicMaterial({ color: 0xffe066 })
      );
      diamond.position.y = 5.5;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.4, 1.8, 20),
        new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.12;
      g.add(beam, diamond, ring);
      g.visible = false;
      this.scene.add(g);
      this.markers[id] = { g, diamond, ring };
    }
  }

  spawnActors() {
    const skins = [0xf3c7a1, 0xd9a066, 0x8d5524, 0xffe0bd, 0xc68642];
    const shirts = [0x4d8fff, 0xff6b9a, 0x3ccf6e, 0xffb703, 0x7b6cff, 0xff7043];
    const pants = [0x3d4a6b, 0x2e7d4f, 0x5a4632, 0x444444];
    const hairs = [0x2b1d14, 0x6b3a1f, 0x1a1a1a, 0xffe066, 0xc0392b, 0xf5f5f5];

    this.player = makePerson(0x2bb673, 0x2c3e6b, 0xf3c7a1, 0x2b1d14);
    this.player.position.set(lotC(PLAZA_I) + 8, 0, lotC(PLAZA_J) + 14);
    this.scene.add(this.player);
    this.lastSafe.copy(this.player.position);

    const carSpawns = [
      { id: 'sunny', x: lotC(PLAZA_I) + 8, z: lotC(PLAZA_J) + 20, h: Math.PI },
      { id: 'taxi', x: lotC(PLAZA_I) + 18, z: lotC(PLAZA_J) + 4, h: Math.PI / 2 },
      { id: 'hauler', x: lotC(N - 1) - 6, z: lotC(1) + 16, h: 0 },
      { id: 'bolt', x: lotC(PLAZA_I), z: roadC(PLAZA_I) + 4, h: -Math.PI / 2 },
      { id: 'rocket', x: lotC(0) + 16, z: lotC(0) - 16, h: Math.PI / 2 },
    ];
    for (const s of carSpawns) {
      const spec = CAR_SPECS.find((c) => c.id === s.id);
      const mesh = makeCarMesh(spec);
      const car = {
        spec, mesh, locked: false,
        pos: new THREE.Vector3(s.x, 0, s.z),
        vel: new THREE.Vector3(),
        heading: s.h,
        speed: 0,
        airborne: false,
        hp: 100, wrecked: false,
      };
      this.placeCar(car);
      this.scene.add(mesh);
      this.cars.push(car);
    }

    const routes = this._trafficRoutes();
    const trafficColors = [0x6ec6ff, 0xff8fab, 0x95d5b2, 0xffd6a5, 0xc8b6ff, 0x90a4ae, 0xfff3b0, 0x80cbc4];
    const trafficN = this.lite ? 6 : 12;
    for (let i = 0; i < trafficN; i++) {
      const spec = {
        id: 'ai' + i, name: 'Car', color: trafficColors[i], accent: 0xffffff,
        max: 14 + (i % 3), kind: i % 3 === 0 ? 'hatch' : (i % 3 === 1 ? 'van' : 'sport'),
      };
      const mesh = makeCarMesh(spec);
      const route = routes[i % routes.length];
      const start = (i * 3) % route.length;
      const tr = {
        mesh, spec, route, idx: start,
        pos: route[start].clone(),
        heading: 0, speed: 10, vel: new THREE.Vector3(),
        hp: 100, wrecked: false,
      };
      const nxt = route[(start + 1) % route.length];
      tr.heading = Math.atan2(nxt.x - tr.pos.x, -(nxt.z - tr.pos.z));
      this.placeCar(tr);
      this.scene.add(mesh);
      this.traffic.push(tr);
    }

    this._spawnCivilians(skins, shirts, pants, hairs);
    this._spawnPatrolCops();
  }

  _trafficRoutes() {
    const off = 3.2;
    const coords = [];
    for (let i = 0; i <= N; i++) coords.push(roadC(i));
    const min = coords[0], max = coords[coords.length - 1];
    const loopA = [
      new THREE.Vector3(min + off, 0, min + off),
      new THREE.Vector3(max + off, 0, min + off),
      new THREE.Vector3(max + off, 0, max + off),
      new THREE.Vector3(min + off, 0, max + off),
    ];
    const mid = coords[Math.floor(N / 2)];
    const loopB = [
      new THREE.Vector3(min + off, 0, mid + off),
      new THREE.Vector3(max + off, 0, mid + off),
      new THREE.Vector3(max + off, 0, max - off),
      new THREE.Vector3(mid - off, 0, max - off),
      new THREE.Vector3(mid - off, 0, min + off),
      new THREE.Vector3(min + off, 0, min + off),
    ];
    const loopC = [
      new THREE.Vector3(coords[1] - off, 0, coords[1] - off),
      new THREE.Vector3(coords[N - 1] - off, 0, coords[1] - off),
      new THREE.Vector3(coords[N - 1] - off, 0, coords[N - 1] - off),
      new THREE.Vector3(coords[1] - off, 0, coords[N - 1] - off),
    ];
    const routes = [loopA, loopB, loopC, loopA.slice().reverse(), loopC.slice().reverse()];
    if (this.highway) {
      const R = this.highway.r, o = 3;
      const hw = [
        new THREE.Vector3(-R + o, 0, -R + o),
        new THREE.Vector3(R - o, 0, -R + o),
        new THREE.Vector3(R - o, 0, R - o),
        new THREE.Vector3(-R + o, 0, R - o),
      ];
      routes.push(hw, hw.slice().reverse());
    }
    return routes;
  }

  _sidewalkLoop(i, j) {
    const x = lotC(i), z = lotC(j);
    const s = BLOCK / 2 + 1.2;
    return [
      new THREE.Vector3(x - s, 0, z - s),
      new THREE.Vector3(x + s, 0, z - s),
      new THREE.Vector3(x + s, 0, z + s),
      new THREE.Vector3(x - s, 0, z + s),
    ];
  }

  _loopPos(loop, t) {
    const n = loop.length;
    const u = ((t % 1) + 1) % 1;
    const f = u * n;
    const i = Math.floor(f) % n;
    const k = f - Math.floor(f);
    const a = loop[i], b = loop[(i + 1) % n];
    return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), dx: b.x - a.x, dz: b.z - a.z };
  }

  heightAt(x, z) {
    let h = 0;
    for (const r of this.ramps) {
      const dx = x - r.x, dz = z - r.z;
      const along = dx * Math.sin(r.yaw) + dz * -Math.cos(r.yaw);
      const side = dx * Math.cos(r.yaw) + dz * Math.sin(r.yaw);
      if (along >= 0 && along <= r.len && Math.abs(side) <= r.w / 2) {
        const hh = lerp(r.h0, r.h1, along / r.len);
        if (hh > h) h = hh;
      }
    }
    if (this.bridge) {
      const b = this.bridge;
      if (Math.abs(x) <= b.w / 2 && z >= b.flat0 && z <= b.flat1) h = Math.max(h, b.h);
    }
    if (this.island && Math.hypot(x - this.island.x, z - this.island.z) < this.island.r) h = Math.max(h, 0.8);
    return h;
  }

  onRoad(x, z) {
    const half = ROAD / 2 + 0.8;
    if (Math.abs(x) <= HALF_CITY + half && Math.abs(z) <= HALF_CITY + half) {
      for (let i = 0; i <= N; i++) {
        const r = roadC(i);
        if (Math.abs(x - r) <= half || Math.abs(z - r) <= half) return true;
      }
    }
    if (this.bridge && Math.abs(x) <= this.bridge.w / 2 + 1 && z >= this.bridge.minZ && z <= this.bridge.maxZ) return true;
    if (this.island && Math.hypot(x - this.island.x, z - this.island.z) < this.island.r) return true;
    if (this.highway) {
      const R = this.highway.r, h = this.highway.halfW + 1.2;
      if ((Math.abs(Math.abs(x) - R) <= h && Math.abs(z) <= R + h) ||
          (Math.abs(Math.abs(z) - R) <= h && Math.abs(x) <= R + h)) return true;
      const edge = HALF_CITY + ROAD / 2;
      if (Math.abs(x) <= 6 && ((z > edge && z < R) || (z < -edge && z > -R))) return true;
      if (Math.abs(z) <= 6 && ((x > edge && x < R) || (x < -edge && x > -R))) return true;
    }
    return false;
  }

  inWater(x, z, y) {
    if (y > 0.6) return false;
    if (this.bridge && Math.abs(x) <= this.bridge.w / 2 + 0.4 && z >= this.bridge.minZ && z <= this.bridge.maxZ) return false;
    if (this.island && Math.hypot(x - this.island.x, z - this.island.z) < this.island.r - 1) return false;
    if (this.highway && this.onRoad(x, z)) return false;
    return z > this.waterZ + 1;
  }

  resolvePos(pos, radius) {
    let hit = false;
    for (const b of this.colliders) {
      const minX = b.minX - radius, maxX = b.maxX + radius;
      const minZ = b.minZ - radius, maxZ = b.maxZ + radius;
      if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
        const l = pos.x - minX, r = maxX - pos.x, t = pos.z - minZ, bo = maxZ - pos.z;
        const m = Math.min(l, r, t, bo);
        if (m === l) pos.x = minX;
        else if (m === r) pos.x = maxX;
        else if (m === t) pos.z = minZ;
        else pos.z = maxZ;
        hit = true;
      }
    }
    const bound = (this.highway ? this.highway.r : HALF_CITY) + 40;
    pos.x = clamp(pos.x, -bound, bound);
    pos.z = clamp(pos.z, -bound, this.island ? this.island.z + 36 : bound);
    return hit;
  }

  placeCar(car) {
    const y = this.heightAt(car.pos.x, car.pos.z);
    car.mesh.position.set(car.pos.x, y, car.pos.z);
    car.mesh.rotation.y = car.heading;
  }

  unstick() {
    const p = this.playerCar ? this.playerCar.pos : this.player.position;
    p.copy(this.lastSafe);
    if (this.playerCar) {
      this.playerCar.speed = 0;
      this.playerCar.vel.set(0, 0, 0);
      this.placeCar(this.playerCar);
    } else {
      this.player.position.copy(this.lastSafe);
    }
    this.toast('Back on the road!');
  }

  nearestCar(maxD) {
    let best = null, bestD = maxD;
    const p = this.player.position;
    for (const c of this.cars) {
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  enterCar(car) {
    if (!car) return;
    car.locked = false;
    this.playerCar = car;
    this.player.visible = false;
    this.heading = car.heading;
    this.sfx.pop();
    $('btn-enter').textContent = 'Hop out';
  }

  leaveCar() {
    if (!this.playerCar) return;
    const c = this.playerCar;
    const side = 2.2;
    this.player.position.set(
      c.pos.x + Math.cos(c.heading) * side,
      this.heightAt(c.pos.x, c.pos.z),
      c.pos.z + Math.sin(c.heading) * side
    );
    this.resolvePos(this.player.position, 0.4);
    this.player.visible = true;
    if (c.mesh.userData.boost) c.mesh.userData.boost.visible = false;
    this.playerCar = null;
    this.sfx.setEngine(false, 0, 1);
    $('btn-enter').textContent = 'Hop in';
    this.sfx.pop();
  }

  loop = () => {
    requestAnimationFrame(this.loop);
    const raw = this.clock.getDelta();
    const dt = clamp(raw, 0, 0.05);
    this.time += dt;
    this._fpsFrames += 1;
    this._fpsT += raw;
    if (this._fpsT >= 0.75) {
      this._fps = this._fpsFrames / this._fpsT;
      this._fpsFrames = 0;
      this._fpsT = 0;
      window.__zcFps = this._fps;
    }
    this.updateDay(dt);
    if (this.mode === 'play') this.updatePlay(dt);
    else this.updateIdle(dt);
    this.updateFarCull();
    this._updateCopBang();
    this.updateCamera(dt);
    this.drawMinimap();
    this.sfx.tickMusic();
    this.renderer.render(this.scene, this.camera);
  };

  updateIdle(dt) {
    for (const c of this.traffic) this.updateTraffic(c, dt);
    this.updatePolice(dt);
    this.updatePeds(dt);
    this.updateTrafficLights();
    this.updateCoinsVisual();
    this.updateHiddenStars(dt);
    this.updateParticles(dt);
  }

  updatePlay(dt) {
    if (this.input.consumeHorn() && this.playerCar) {
      this.sfx.horn();
      this.hornT = 0.4;
    }
    this.hornT = Math.max(0, this.hornT - dt);

    if (this.playerCar) this.updateDrive(dt);
    else this.updateWalk(dt);

    if (this.input.consumeEnter()) this.tryEnterExit();

    for (const c of this.traffic) this.updateTraffic(c, dt);
    this.updatePolice(dt);
    if (this.playerCar) {
      for (const pk of this.parked) {
        if (pk.wrecked) { this.tryRespawnCar(pk); continue; }
        this.bumpCars(this.playerCar, pk, false);
      }
    }
    this.updateWanted(dt);
    for (const c of this.cars) if (c.wrecked) this.tryRespawnCar(c);
    this.updatePeds(dt);
    this.updateProps(dt);
    this.updateParticles(dt);
    this.updateTrafficLights();
    this.updateCoinsCollect();
    this.updateCoinsVisual();
    this.updateHiddenStars(dt);
    this.updatePlaces(dt);
    this.updateMissions(dt);
    this.updateHud();

    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) $('toast').classList.add('hidden');
    }

    const p = this.playerCar ? this.playerCar.pos : this.player.position;
    const y = this.playerCar ? this.playerCar.mesh.position.y : this.player.position.y;
    if (this.onRoad(p.x, p.z) && this.heightAt(p.x, p.z) < 0.5) {
      this.lastSafe.set(p.x, 0, p.z);
    }
    if (this.inWater(p.x, p.z, y)) {
      this.toast('Splash! Back to the shore.');
      this.sfx.pop();
      this.unstick();
    }
    if (this.demo && this.playerCar) {
      this.playerCar.speed = Math.max(this.playerCar.speed, 16);
    }
  }

  tryEnterExit() {
    if (this.playerCar) { this.leaveCar(); return; }
    const c = this.nearestCar(4.5);
    if (c) this.enterCar(c);
  }

  updateWalk(dt) {
    const ax = this.input.axis();
    const cam = this.camera.position;
    const p = this.player.position;
    let fx = p.x - cam.x, fz = p.z - cam.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    const rx = -fz, rz = fx;
    const mx = fx * ax.y + rx * ax.x;
    const mz = fz * ax.y + rz * ax.x;
    const moving = Math.hypot(mx, mz) > 0.08;
    const spd = 6.5;
    if (moving) {
      p.x += mx * spd * dt;
      p.z += mz * spd * dt;
      this.heading = lerpAng(this.heading, Math.atan2(mx, -mz), 1 - Math.pow(0.001, dt));
    }
    this.resolvePos(p, 0.4);
    p.y = this.heightAt(p.x, p.z);
    this.player.rotation.y = this.heading;
    animateWalk(this.player, this.time, moving);

    const near = this.nearestCar(4.5);
    if (near) {
      this.setPrompt(this.isTouch ? 'Tap Hop in to drive the ' + near.spec.name + '.' : 'Press E to hop into the ' + near.spec.name + '.');
    } else this.setPrompt('');
    this.sfx.setEngine(false, 0, 1);
  }

  updateDrive(dt) {
    const car = this.playerCar;
    const d = this.demo ? { steer: 0, gas: 1, brake: 0, handbrake: false, nitro: 0 } : this.input.drive();
    const spec = car.spec;
    const boosting = !!(d.nitro && this.nitro > 0.04);
    if (boosting) {
      this.nitro = Math.max(0, this.nitro - dt * 0.42);
      car.speed += (spec.accel + 38) * dt;
      if (car.mesh.userData.boost) car.mesh.userData.boost.visible = true;
      if (this.hornT <= 0) { this.sfx.whoosh(); this.hornT = 0.35; }
    } else {
      this.nitro = Math.min(1, this.nitro + dt * 0.14);
      if (car.mesh.userData.boost) car.mesh.userData.boost.visible = false;
    }
    if (d.gas > 0 && !boosting) car.speed += spec.accel * d.gas * dt;
    if (d.brake > 0) {
      if (car.speed > 0.8) car.speed -= spec.brake * d.brake * dt;
      else car.speed -= spec.accel * 0.6 * d.brake * dt;
    }
    if (d.gas <= 0 && d.brake <= 0) car.speed *= Math.pow(0.22, dt);
    car.speed = clamp(car.speed, -spec.max * 0.4, spec.max * (boosting ? 1.45 : 1) * (this.fedT > 0 ? 1.08 : 1));
    const speedK = Math.abs(car.speed) / spec.max;
    let steer = d.steer * spec.steer * (1 - 0.62 * speedK);
    if (d.handbrake) steer *= 1.35;
    if (Math.abs(car.speed) > 0.4) car.heading += steer * Math.sign(car.speed) * dt * (2.2 + speedK);
    const fwdX = Math.sin(car.heading);
    const fwdZ = -Math.cos(car.heading);
    let grip = d.handbrake ? 0.45 : spec.grip + 0.55;
    if (Math.abs(d.steer) > 0.7 && speedK > 0.5) grip *= 0.7;
    const tx = fwdX * car.speed, tz = fwdZ * car.speed;
    const k = 1 - Math.pow(1 - clamp(grip, 0.05, 1), dt * 60);
    car.vel.x = lerp(car.vel.x, tx, k);
    car.vel.z = lerp(car.vel.z, tz, k);
    car.pos.x += car.vel.x * dt;
    car.pos.z += car.vel.z * dt;
    const gh = this.heightAt(car.pos.x, car.pos.z);
    const y = car.mesh.position.y;
    if (y > gh + 0.25) {
      car.airborne = true;
      car.vel.y = (car.vel.y || 0) - 28 * dt;
      car.mesh.position.y = y + car.vel.y * dt;
      if (car.mesh.position.y < gh) {
        car.mesh.position.y = gh;
        car.vel.y = 0;
        car.airborne = false;
      }
    } else {
      const climb = gh - y;
      if (climb > 0.6 && !car.airborne) {
        car.vel.y = Math.max(car.vel.y || 0, climb * 4 + Math.abs(car.speed) * 0.25);
        car.airborne = true;
        car.mesh.position.y = y + Math.max(climb, 0) * 0.5;
      } else {
        car.mesh.position.y = gh;
        car.vel.y = 0;
        car.airborne = false;
      }
    }
    if (this.resolvePos(car.pos, 1.25)) {
      const impact = Math.abs(car.speed);
      if (impact > 8) {
        this.hurtCar(car, impact * 1.8);
        this.spawnSparks(car.pos.x, car.mesh.position.y + 0.6, car.pos.z);
        this.sfx.crash();
      }
      car.speed *= 0.35;
      car.vel.x *= 0.35;
      car.vel.z *= 0.35;
    }
    this.collidePlayerWithCars();
    this.checkRedLight(car);
    this.smashProps(car);
    this.carSmoke(car, dt);
    car.mesh.position.x = car.pos.x;
    car.mesh.position.z = car.pos.z;
    car.mesh.rotation.y = car.heading;
    const roll = -d.steer * speedK * 0.18;
    car.mesh.userData.body.rotation.z = lerp(car.mesh.userData.body.rotation.z || 0, roll, 0.15);
    const spin = car.speed * dt * 2.2;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
    this.heading = car.heading;
    this.player.position.copy(car.mesh.position);
    this.setPrompt(this.isTouch ? 'Tap Hop out to walk.' : 'Press E to hop out.');
    this.sfx.setEngine(true, car.speed, spec.max);
  }

  updateTraffic(tr, dt) {
    if (tr === this.playerCar) return;
    if (tr.wrecked) { this.tryRespawnCar(tr); return; }
    const route = tr.route;
    const tgt = route[(tr.idx + 1) % route.length];
    const dx = tgt.x - tr.pos.x, dz = tgt.z - tr.pos.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, -dz);
    tr.heading = lerpAng(tr.heading, want, 1 - Math.pow(0.05, dt));
    const p = this.playerCar ? this.playerCar.pos : this.player.position;
    const dPlayer = Math.hypot(tr.pos.x - p.x, tr.pos.z - p.z);
    let spd = tr.speed;
    if (dPlayer < 8) spd *= 0.35;
    tr.pos.x += Math.sin(tr.heading) * spd * dt;
    tr.pos.z += -Math.cos(tr.heading) * spd * dt;
    if (dist < 3) tr.idx = (tr.idx + 1) % route.length;
    this.placeCar(tr);
    const spin = spd * dt * 2;
    if (tr.mesh.userData.wheels) for (const w of tr.mesh.userData.wheels) w.rotation.x += spin;
  }

  updatePeds(dt) {
    this.updateCivilians(dt);
  }

  updateCoinsCollect() {
    const p = this.playerCar ? this.playerCar.mesh.position : this.player.position;
    for (const c of this.coins) {
      if (c.got) {
        if (this.time > c.respawn) c.got = false;
        continue;
      }
      if (Math.hypot(c.x - p.x, c.z - p.z) < 1.8) {
        c.got = true;
        c.respawn = this.time + 50;
        this.addCoins(1);
      }
    }
  }

  updateCoinsVisual() {
    const dummy = this._dummy || (this._dummy = new THREE.Object3D());
    this.coins.forEach((c, i) => {
      dummy.position.set(c.x, c.got ? -10 : 1.1 + Math.sin(this.time * 3 + i) * 0.15, c.z);
      dummy.rotation.set(Math.PI / 2, this.time * 2 + i, 0);
      dummy.scale.setScalar(c.got ? 0.001 : 1);
      dummy.updateMatrix();
      this.coinMesh.setMatrixAt(i, dummy.matrix);
    });
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  updateDay(dt) {
    if (this.autoNight && this.mode === 'play') {
      this.night += dt / 120;
      if (this.night > 1) this.night = 0;
      this.nightTarget = this.night;
    } else if (this.nightTarget != null && Math.abs(this.night - this.nightTarget) > 0.002) {
      this.night = lerp(this.night, this.nightTarget, 1 - Math.pow(0.02, dt));
    }
    uNight.value = this.night;
    const dayCol = new THREE.Color(0x7ec8e3);
    const duskCol = new THREE.Color(0xff9b6a);
    const nightCol = new THREE.Color(0x141a33);
    const sky = this.night < 0.5
      ? dayCol.clone().lerp(duskCol, this.night * 2)
      : duskCol.clone().lerp(nightCol, (this.night - 0.5) * 2);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    if (this.skyMat) {
      const top = sky.clone().lerp(new THREE.Color(0x1a2a55), this.night * 0.35);
      top.lerp(new THREE.Color(0x3a87c8), 0.25 * (1 - this.night));
      this.skyMat.uniforms.top.value.copy(top);
      this.skyMat.uniforms.mid.value.copy(sky);
      const bot = sky.clone().lerp(new THREE.Color(0xffe0b0), 0.25 * (1 - this.night));
      this.skyMat.uniforms.bot.value.copy(bot);
    }
    if (this.fountainSpray) {
      this.fountainSpray.children.forEach((d, i) => {
        const a = this.time * 2 + i * 0.8;
        d.position.set(Math.sin(a) * 0.4, 2.2 + (a % 1.6) * 1.1, Math.cos(a * 1.3) * 0.4);
      });
    }
    this.scene.fog.near = lerp(this.fogNearDay || 90, 50, this.night);
    this.scene.fog.far = lerp(this.fogFarDay || 280, this.lite ? 150 : 240, this.night);
    this.hemi.intensity = lerp(0.95, 0.18, this.night);
    this.sun.intensity = lerp(1.05, 0.08, this.night);
    const ang = lerp(1.15, -0.2, this.night);
    this.sun.position.set(Math.cos(ang) * 80, Math.max(8, Math.sin(ang) * 110), 40);
    this.sunBall.position.copy(this.sun.position).setLength(160);
    this.moonBall.position.set(-this.sunBall.position.x, Math.max(20, 80 - this.sunBall.position.y * 0.4), -this.sunBall.position.z * 0.4);
    this.sunBall.visible = this.night < 0.72;
    this.moonBall.visible = this.night > 0.35;
    if (this.lampBulbs) this.lampBulbs.visible = this.night > 0.45;
    const hlOn = this.night > 0.5;
    const glowCars = this.cars.concat(this.traffic, this.police, this.parked || []);
    for (const c of glowCars) {
      if (!c || !c.mesh || !c.mesh.userData.headlights) continue;
      for (const h of c.mesh.userData.headlights) h.scale.setScalar(hlOn ? 1.25 : 1);
      for (const tl of c.mesh.userData.taillights) tl.scale.setScalar(hlOn ? 1.15 : 1);
    }
    if (this.playerCar && !this.headlight) {
      this.headlight = new THREE.SpotLight(0xfff2d0, 0, 40, 0.55, 0.4, 1);
      this.headlight.position.set(0, 1.1, -1.6);
      this.headlight.target.position.set(0, 0.4, -12);
      this.playerCar.mesh.add(this.headlight);
      this.playerCar.mesh.add(this.headlight.target);
      this._hlCar = this.playerCar;
    }
    if (this.headlight && this._hlCar !== this.playerCar) {
      if (this._hlCar) {
        this._hlCar.mesh.remove(this.headlight);
        this._hlCar.mesh.remove(this.headlight.target);
      }
      if (this.playerCar) {
        this.playerCar.mesh.add(this.headlight);
        this.playerCar.mesh.add(this.headlight.target);
      }
      this._hlCar = this.playerCar;
    }
    if (this.headlight) this.headlight.intensity = (this.playerCar && hlOn) ? 2.2 : 0;
    $('btn-day').textContent = this.night > 0.5 ? '\uD83C\uDF19' : '\u2600\uFE0F';
    for (const cl of this.clouds) {
      cl.position.x += dt * 1.2;
      if (cl.position.x > 160) cl.position.x = -160;
    }
    if (this.waterMesh) this.waterMesh.material.opacity = 0.86 + Math.sin(this.time * 0.7) * 0.06;
  }

  updateCamera(dt) {
    if (this.aerialView) {
      this.scene.fog.near = 280;
      this.scene.fog.far = 1800;
      if (this.camera.far < 2200) {
        this.camera.far = 2200;
        this.camera.updateProjectionMatrix();
      }
      // South of the harbor, looking north over the beach, highway, and city
      this.camera.position.set(30, 185, 455);
      this.camera.lookAt(0, 4, 10);
      return;
    }
    if (this.mode === 'title' || (this.mode !== 'play' && this.mode !== 'pause' && this.mode !== 'busted')) {
      const t = this.time * 0.12;
      this.camera.position.set(Math.sin(t) * 130, 64, Math.cos(t) * 130);
      this.camera.lookAt(lotC(PLAZA_I), 4, lotC(PLAZA_J));
      return;
    }
    const inCar = !!this.playerCar;
    const target = inCar ? this.playerCar.mesh.position : this.player.position;
    const hd = inCar ? this.playerCar.heading : this.heading;
    const back = inCar ? 12 : 6.8;
    const up = inCar ? 5.4 : 3.4;
    const ideal = new THREE.Vector3(
      target.x - Math.sin(hd) * back,
      target.y + up,
      target.z + Math.cos(hd) * back
    );
    this.resolvePos(ideal, 0.6);
    const gh = this.heightAt(ideal.x, ideal.z);
    if (ideal.y < gh + 1.5) ideal.y = gh + 1.5;
    const k = 1 - Math.pow(0.0008, dt);
    this.camera.position.lerp(ideal, k);
    const look = this._look || (this._look = new THREE.Vector3());
    look.lerp(new THREE.Vector3(target.x + Math.sin(hd) * 6, target.y + 1.2, target.z - Math.cos(hd) * 6), k);
    this.camera.lookAt(look);
  }

  hideMission() {
    $('mission-banner').classList.add('hidden');
    for (const k of Object.keys(this.markers)) this.markers[k].g.visible = false;
  }

  updateMissions(dt) {
    this.updateJobMarkers(dt);
    if (!this.mission) {
      if (this.aerialView || ['overview','copsaw'].includes(this.params.get('shot'))) return;
      if (!this.jobArmed) this.jobArmed = {};
      const px = this.playerCar ? this.playerCar.pos.x : this.player.position.x;
      const pz = this.playerCar ? this.playerCar.pos.z : this.player.position.z;
      for (const start of this.jobStarts()) {
        const close = Math.hypot(px - start.pos.x, pz - start.pos.z) < 4.5;
        if (close && !this.jobArmed[start.type]) {
          this.jobArmed[start.type] = true;
          this.beginMission(start.type);
        }
        if (!close) this.jobArmed[start.type] = false;
      }
      return;
    }
    const m = this.mission;
    m.time -= dt;
    if (m.time <= 0) {
      this.sfx.fail();
      this.toast('Time is up. You can try that job again!');
      this.mission = null;
      this.hideMission();
      return;
    }
    const p = this.playerCar ? this.playerCar.pos : this.player.position;
    if (m.type === 'delivery') {
      if (m.stage === 'pick' && Math.hypot(p.x - m.pick.x, p.z - m.pick.z) < 5) {
        m.stage = 'drop';
        this.sfx.pop();
        this.toast('Got the package! Now deliver it.');
      }
      if (m.stage === 'drop' && Math.hypot(p.x - m.drop.x, p.z - m.drop.z) < 5) {
        this.completeMission(15, 'Package delivered!');
      }
    } else if (m.type === 'taxi') {
      if (m.stage === 'pick' && Math.hypot(p.x - m.pick.x, p.z - m.pick.z) < 5) {
        if (!this.playerCar) { this.toast('Hop into a car first to give the ride.'); }
        else {
          m.stage = 'drop';
          m.passenger.mesh.visible = false;
          this.sfx.pop();
          this.toast('Passenger is in! Drive to the green marker.');
        }
      }
      if (m.stage === 'drop' && this.playerCar && Math.hypot(p.x - m.drop.x, p.z - m.drop.z) < 5) {
        m.passenger.mesh.visible = true;
        const drop = m.drop;
        m.passenger.mesh.position.set(drop.x + 2, 0, drop.z + 2);
        this.completeMission(15, 'Nice ride!');
      }
    } else if (m.type === 'race') {
      const cp = m.points[m.i];
      if (this.playerCar && Math.hypot(p.x - cp.x, p.z - cp.z) < 6) {
        m.i++;
        this.sfx.coin();
        if (m.i >= m.points.length) this.completeMission(25, 'You won the race!');
        else this.toast('Checkpoint ' + m.i + ' of ' + m.points.length + '!');
      }
    } else if (m.type === 'getaway') {
      if (m.stage === 'grab' && Math.hypot(p.x - m.pick.x, p.z - m.pick.z) < 5) {
        m.stage = 'escape';
        this.stars = Math.max(this.stars, 3);
        this.ensureCops();
        this.escapeT = 0;
        this.sfx.wanted();
        this.toast('They saw that! Lose the police!');
      }
      if (m.stage === 'escape' && this.stars <= 0) {
        this.completeMission(30, 'You got away!');
      }
    }
    this.showMissionHud();
  }

  completeMission(coins, msg) {
    this.addCoins(coins, msg);
    this.sfx.success();
    this.toast(msg + '  +' + coins + ' coins');
    this.mission = null;
    this.hideMission();
  }

  nearJob() {
    const jobs = this.jobStarts();
    const p = this.playerCar ? this.playerCar.pos : this.player.position;
    let best = null, bd = 90;
    for (const j of jobs) {
      const d = Math.hypot(p.x - j.pos.x, p.z - j.pos.z);
      if (d < bd) { best = j; bd = d; }
    }
    return bd < 80 ? best : null;
  }

  jobStarts() {
    return [
      { type: 'delivery', pos: this.postSpot || new THREE.Vector3(lotC(N - 1), 0, lotC(1) + 16) },
      { type: 'taxi', pos: this.taxiSpot || new THREE.Vector3(lotC(PLAZA_I) + 12, 0, lotC(PLAZA_J) + 14) },
      { type: 'race', pos: this.raceSpot || new THREE.Vector3(lotC(0) + 14, 0, lotC(0) - 18) },
      { type: 'getaway', pos: this.getawaySpot || new THREE.Vector3(lotC(2) + 16, 0, lotC(5) + 16) },
    ];
  }

  updateJobMarkers(dt) {
    const bob = 0.4 + Math.sin(this.time * 3) * 0.15;
    if (!this.mission) {
      this.markers.goal.g.visible = false;
      this.markers.pickup.g.visible = false;
      const jobs = this.jobStarts();
      const colors = [0xff9f43, 0xffd400, 0x66ff99, 0xc77dff];
      if (!this.jobBeams) {
        this.jobBeams = jobs.map((j, i) => {
          const g = this.markers.job.g.clone();
          g.visible = true;
          g.position.copy(j.pos);
          g.traverse((o) => {
            if (o.material) {
              o.material = o.material.clone();
              if (o.material.color) o.material.color.setHex(colors[i]);
            }
          });
          this.scene.add(g);
          return g;
        });
      }
      this.jobBeams.forEach((g, i) => {
        g.visible = true;
        g.position.copy(jobs[i].pos);
        g.position.y = bob;
      });
      this.markers.job.g.visible = false;
    } else {
      if (this.jobBeams) this.jobBeams.forEach((g) => { g.visible = false; });
      const m = this.mission;
      const showPick = m.stage === 'pick' && m.pick;
      const showGoal = (m.stage === 'drop' && m.drop) || (m.type === 'race');
      this.markers.pickup.g.visible = !!showPick;
      if (showPick) {
        this.markers.pickup.g.position.set(m.pick.x, bob, m.pick.z);
        this.markers.pickup.diamond.rotation.y += dt * 2;
      }
      this.markers.goal.g.visible = !!showGoal;
      if (m.type === 'race') {
        const cp = m.points[m.i];
        this.markers.goal.g.position.set(cp.x, bob, cp.z);
        this.markers.goal.g.traverse((o) => { if (o.material && o.material.color) o.material.color.setHex(0x66ff99); });
      } else if (showGoal) {
        this.markers.goal.g.position.set(m.drop.x, bob, m.drop.z);
        this.markers.goal.g.traverse((o) => { if (o.material && o.material.color) o.material.color.setHex(0x66ff99); });
      }
      this.markers.goal.diamond.rotation.y += dt * 2;
    }
  }

  beginMission(type) {
    if (this.mission) return;
    if (type === 'delivery') {
      this.mission = {
        type, stage: 'pick', time: 90,
        pick: new THREE.Vector3(lotC(N - 1), 0, lotC(1) + 4),
        drop: new THREE.Vector3(lotC(0) + 4, 0, lotC(N - 2)),
        title: 'Package run',
        pickText: 'Pick up the package at the orange marker.',
        dropText: 'Deliver the package to the green marker.',
      };
      this.toast('Package run! Pick up the package.');
    } else if (type === 'taxi') {
      const ped = this.peds[3];
      const lp = this._loopPos(ped.loop, ped.t);
      this.mission = {
        type, stage: 'pick', time: 90, passenger: ped,
        pick: new THREE.Vector3(lp.x, 0, lp.z),
        drop: new THREE.Vector3(this.island.x, 0, this.island.z),
        title: 'Taxi ride',
        pickText: 'Pick up the waiting passenger.',
        dropText: 'Drive them to the island.',
      };
      this.toast('Taxi job! Pick up your passenger.');
    } else if (type === 'race') {
      this.mission = {
        type: 'race', stage: 'race', time: 75, i: 0, title: 'City race',
        pickText: '', dropText: 'Drive through the checkpoints!',
        points: [
          new THREE.Vector3(lotC(0) + 8, 0, lotC(0) - 4),
          new THREE.Vector3(roadC(1), 0, roadC(2)),
          new THREE.Vector3(roadC(3), 0, roadC(3)),
          new THREE.Vector3(0, 3, this.waterZ + 20),
          new THREE.Vector3(0, 0, this.island.z),
          new THREE.Vector3(roadC(N), 0, roadC(2)),
          new THREE.Vector3(lotC(0) + 14, 0, lotC(0) - 16),
        ],
      };
      this.toast('Race! Drive through every checkpoint.');
    } else if (type === 'getaway') {
      const pick = (this.getawaySpot || new THREE.Vector3(lotC(2) + 16, 0, lotC(5) + 16)).clone();
      this.mission = {
        type, stage: 'grab', time: 100, pick,
        title: 'Getaway',
        pickText: 'Grab the bag at the purple marker.',
        dropText: 'Lose the police! Hide until your stars are gone.',
      };
      this.toast('Getaway job! Grab the bag.');
    }
    this.sfx.click();
    this.showMissionHud();
  }

  showMissionHud() {
    const m = this.mission;
    if (!m) { $('mission-banner').classList.add('hidden'); return; }
    $('mission-banner').classList.remove('hidden');
    $('mission-title').textContent = m.title;
    let goal = m.dropText;
    if (m.type === 'delivery') goal = m.stage === 'pick' ? m.pickText : m.dropText;
    if (m.type === 'taxi') goal = m.stage === 'pick' ? m.pickText : m.dropText;
    if (m.type === 'race') goal = 'Checkpoint ' + (m.i + 1) + ' of ' + m.points.length;
    if (m.type === 'getaway') goal = m.stage === 'grab' ? m.pickText : ('Lose the police!  Stars: ' + this.stars);
    $('mission-goal').textContent = goal;
    const sec = Math.max(0, Math.ceil(m.time));
    $('mission-time').textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  updateHud() {
    const spd = this.playerCar ? Math.abs(this.playerCar.speed) * 3.1 : 0;
    $('speed-num').textContent = Math.round(spd);
    this.updateCoins();
    const wanted = $('wanted');
    if (wanted) {
      wanted.classList.remove('hidden');
      wanted.querySelectorAll('.star').forEach((el) => {
        const i = +el.getAttribute('data-i');
        el.classList.toggle('on', i <= this.stars);
      });
    }
    const fill = $('nitro-fill');
    if (fill) fill.style.transform = 'scaleX(' + this.nitro + ')';
    const esc = $('escape-hint');
    if (esc) {
      const hidden = this.stars > 0 && this.escapeT > 1.2;
      esc.classList.toggle('hidden', !hidden);
      if (hidden) esc.textContent = 'Hiding... ' + Math.max(0, 16.5 - this.escapeT).toFixed(0) + 's to lose a star';
    }
    const sc = $('star-count');
    if (sc) sc.textContent = (this.save.hiddenStars ? this.save.hiddenStars.length : 0) + '/' + HIDDEN_STAR_TOTAL;
  }

  updateFarCull() {
    if (this.aerialView) return;
    const p = this.playerCar ? this.playerCar.pos : (this.player ? this.player.position : { x: 0, z: 0 });
    const cut = this.lite ? 100 : 170;
    const cutT = this.lite ? 120 : 220;
    if (this.parked) {
      for (const c of this.parked) {
        if (!c.mesh || c.wrecked) continue;
        c.mesh.visible = Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < cut;
      }
    }
    if (this.props) {
      for (const pr of this.props) {
        if (!pr.mesh || pr.broken) continue;
        pr.mesh.visible = Math.hypot(pr.x - p.x, pr.z - p.z) < cut;
      }
    }
    if (this.traffic) {
      for (const tr of this.traffic) {
        if (!tr.mesh || tr.wrecked) continue;
        tr.mesh.visible = Math.hypot(tr.pos.x - p.x, tr.pos.z - p.z) < cutT;
      }
    }
  }

  drawMinimap() {
    if (this.mode === 'title') return;
    const cv = $('minimap');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    const p = this.playerCar ? this.playerCar.pos : this.player.position;
    const hd = this.playerCar ? this.playerCar.heading : this.heading;
    const span = (this.highway ? this.highway.r : HALF_CITY) + 70;
    const scale = this.aerialView ? ((W / 2 - 4) / span) : Math.max(0.28, (W / 2 - 8) / (span * 0.95));
    ctx.fillStyle = '#3d8a4e';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    if (!this.aerialView) ctx.rotate(hd);
    const cx = this.aerialView ? 0 : p.x, cz = this.aerialView ? 0 : p.z;
    ctx.translate(-cx * scale, -cz * scale);

    const dcol = { downtown: '#8a96a6', suburb: '#8ed48a', industry: '#6a6e74', harbor: '#e6d5a8', city: '#d9a08a' };
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const kind = specialLot(i, j);
        const dist = districtOf(i, j);
        ctx.fillStyle = kind === 'park' || kind === 'plaza' ? '#6dcc6a' : (dcol[dist] || '#d9a08a');
        ctx.fillRect((lotC(i) - BLOCK / 2) * scale, (lotC(j) - BLOCK / 2) * scale, BLOCK * scale, BLOCK * scale);
      }
    }

    ctx.fillStyle = '#3a4152';
    const half = ROAD / 2;
    for (let i = 0; i <= N; i++) {
      const r = roadC(i);
      ctx.fillRect((r - half) * scale, (-HALF_CITY - half) * scale, ROAD * scale, (HALF_CITY + half) * 2 * scale);
      ctx.fillRect((-HALF_CITY - half) * scale, (r - half) * scale, (HALF_CITY + half) * 2 * scale, ROAD * scale);
    }
    if (this.highway) {
      const R = this.highway.r, h = this.highway.halfW;
      ctx.fillStyle = '#3a3f4c';
      ctx.fillRect((-R - h) * scale, (-R - h) * scale, (R * 2 + h * 2) * scale, (h * 2) * scale);
      ctx.fillRect((-R - h) * scale, (R - h) * scale, (R * 2 + h * 2) * scale, (h * 2) * scale);
      ctx.fillRect((-R - h) * scale, (-R - h) * scale, (h * 2) * scale, (R * 2 + h * 2) * scale);
      ctx.fillRect((R - h) * scale, (-R - h) * scale, (h * 2) * scale, (R * 2 + h * 2) * scale);
    }
    if (this.bridge) {
      ctx.fillStyle = '#7a8194';
      ctx.fillRect(-4 * scale, this.bridge.minZ * scale, 8 * scale, (this.bridge.maxZ - this.bridge.minZ) * scale);
    }
    ctx.fillStyle = '#3cb0c8';
    ctx.fillRect(-360 * scale, this.waterZ * scale, 720 * scale, 180 * scale);
    ctx.fillStyle = '#62c25a';
    ctx.beginPath();
    ctx.arc(this.island.x * scale, this.island.z * scale, this.island.r * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#d9a08a';
    for (const b of this.colliders) {
      ctx.fillRect(b.minX * scale, b.minZ * scale, (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
    }
    ctx.fillStyle = '#ffd24a';
    for (const c of this.coins) {
      if (c.got) continue;
      ctx.beginPath();
      ctx.arc(c.x * scale, c.z * scale, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#6ec6ff';
    for (const t of this.traffic) {
      if (t.wrecked) continue;
      ctx.fillRect(t.pos.x * scale - 2, t.pos.z * scale - 3, 4, 6);
    }
    ctx.fillStyle = '#3b6cff';
    for (const c of this.police) {
      if (!c.mesh || !c.mesh.visible || c.wrecked) continue;
      ctx.fillRect(c.pos.x * scale - 2, c.pos.z * scale - 3, 4, 6);
    }
    for (const b of this.banks || []) {
      ctx.fillStyle = b.open ? '#ffe066' : '#888866';
      const bx = b.x * scale, bz = b.z * scale;
      ctx.fillRect(bx - 4, bz - 4, 8, 8);
      ctx.fillStyle = '#1d4ed8';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('B', bx, bz);
    }
    const markPlace = (pl, color) => {
      if (!pl) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pl.x * scale, pl.z * scale, 3.5, 0, Math.PI * 2);
      ctx.fill();
    };
    if (this.places) {
      markPlace(this.places.gas, '#ff4d4d');
      markPlace(this.places.wash, '#6ec6ff');
      markPlace(this.places.burger, '#ffb703');
      markPlace(this.places.jump, '#ff7a18');
    }
    if (this.mission) {
      ctx.fillStyle = '#66ff99';
      const gp = this.mission.type === 'race' ? this.mission.points[this.mission.i]
        : (this.mission.stage === 'pick' ? this.mission.pick : this.mission.drop);
      if (gp) {
        ctx.beginPath();
        ctx.arc(gp.x * scale, gp.z * scale, 5 + Math.sin(this.time * 6) * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#ffe066';
      for (const j of this.jobStarts()) {
        ctx.beginPath();
        ctx.arc(j.pos.x * scale, j.pos.z * scale, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.fillStyle = '#2bb673';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  _placeActionWorld() {
    this.props = [];
    this.lights = [];
    this.busStops = [];
    this.benches = this.benches || [];
    const rng = makeRng(77);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = lotC(i), z = lotC(j);
        if ((i + j) % 2 === 0) {
          this._addProp('hydrant', x + (BLOCK / 2 + 0.8), 0, z + (BLOCK / 2 - 4));
        }
        if ((i + j) % 3 === 0) {
          this._addProp('mailbox', x - (BLOCK / 2 + 0.8), 0, z - (BLOCK / 2 - 5));
        }
        if ((i + j) % 2 === 1 && !this.lite) {
          this._addProp('trash', x + (BLOCK / 2 - 3), 0, z - (BLOCK / 2 + 0.7));
        }
        if (specialLot(i, j) === 'stunt' || specialLot(i, j) === 'park') {
          for (let k = 0; k < 3; k++) {
            this._addProp('crate', x + (rng() - 0.5) * 16, 0, z + (rng() - 0.5) * 16);
          }
        }
        if (specialLot(i, j) === 'park') {
          const bx = x + 6, bz = z - 8;
          const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.5), new THREE.MeshLambertMaterial({ color: 0x8a5a32 }));
          bench.position.set(bx, 0.4, bz);
          this.scene.add(bench);
          this.benches.push({ x: bx, z: bz, rot: 0 });
        }
      }
    }
    // fences around stunt park edges
    const sx = lotC(0), sz = lotC(0);
    for (let k = -3; k <= 3; k++) {
      this._addProp('fence', sx - 16, 0, sz + k * 3.2, Math.PI / 2);
    }
    // cones along a road
    for (let k = 0; k < 8; k++) {
      this._addProp('cone', roadC(4) + 6, 0, roadC(1) + 8 + k * 3);
    }
    const lightStep = this.lite ? 4 : 2;
    for (let i = 0; i <= N; i += lightStep) {
      for (let j = 0; j <= N; j += lightStep) {
        this._addTrafficLight(roadC(i), roadC(j));
      }
    }
    // bus stops
    const stops = [
      [roadC(1) - 9, roadC(2) + 18],
      [roadC(3) + 9, roadC(1) - 18],
      [roadC(5) - 9, roadC(4) + 10],
      [roadC(2) + 9, roadC(5) - 10],
      [roadC(0) + 9, roadC(3) + 16],
      [roadC(4) - 9, roadC(0) + 16],
      [roadC(6) + 9, roadC(3) - 16],
      [roadC(7) - 9, roadC(6) + 10],
    ];
    for (const s of stops) this._addBusStop(s[0], s[1]);
    // getaway sign
    const gx = lotC(2) + 16, gz = lotC(5) + 16;
    this.scene.add(this._jobSign(gx, gz, 0x9b5de5));
    this.getawaySpot = new THREE.Vector3(gx, 0, gz + 2);
  }

  _addTrafficLight(x, z) {
    const make = (ox, oz, rot) => {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.6, 6), new THREE.MeshLambertMaterial({ color: 0x333843 }));
      pole.position.y = 1.8;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.8, 0.22), new THREE.MeshLambertMaterial({ color: 0x222 }));
      box.position.y = 3.5;
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0x661111 }));
      const y = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0x665511 }));
      const g2 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0x116611 }));
      r.position.set(0, 3.72, 0.12);
      y.position.set(0, 3.5, 0.12);
      g2.position.set(0, 3.28, 0.12);
      g.add(pole, box, r, y, g2);
      g.position.set(x + ox, 0, z + oz);
      g.rotation.y = rot;
      this.scene.add(g);
      return { g, r, y, g2, ns: Math.abs(ox) > Math.abs(oz) };
    };
    const off = ROAD / 2 + 0.4;
    this.lights.push(make(off, off, 0));
    this.lights.push(make(-off, -off, Math.PI));
  }

  _addBusStop(x, z) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), new THREE.MeshLambertMaterial({ color: 0x888 }));
    post.position.y = 1.3;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.08), new THREE.MeshLambertMaterial({ color: 0x3d8bff }));
    sign.position.y = 2.4;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.2), new THREE.MeshLambertMaterial({ color: 0x4a90d9 }));
    roof.position.set(0.8, 2.2, 0);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.45), new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
    bench.position.set(0.8, 0.35, 0);
    g.add(post, sign, roof, bench);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.busStops.push({ x, z });
    this.benches.push({ x: x + 0.8, z, rot: 0 });
  }

  _addProp(type, x, y, z, rotY = 0) {
    let mesh, rad = 0.6, hp = 1;
    if (type === 'hydrant') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 8), new THREE.MeshLambertMaterial({ color: 0xe23d3d }));
      mesh.position.set(x, 0.35, z);
      rad = 0.5;
    } else if (type === 'mailbox') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.3), new THREE.MeshLambertMaterial({ color: 0x3d6fd9 }));
      mesh.position.set(x, 0.45, z);
      rad = 0.5;
    } else if (type === 'crate') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshLambertMaterial({ color: 0xc68a3c }));
      mesh.position.set(x, 0.55, z);
      rad = 0.8;
    } else if (type === 'fence') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 3.1), new THREE.MeshLambertMaterial({ color: 0xd8c9a0 }));
      mesh.position.set(x, 0.6, z);
      mesh.rotation.y = rotY;
      rad = 1.4;
    } else if (type === 'trash') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.7, 8), new THREE.MeshLambertMaterial({ color: 0x4a5a4a }));
      mesh.position.set(x, 0.35, z);
      rad = 0.45;
    } else {
      mesh = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 8), new THREE.MeshLambertMaterial({ color: 0xff7a18 }));
      mesh.position.set(x, 0.35, z);
      rad = 0.35;
    }
    this.scene.add(mesh);
    this.props.push({ type, mesh, x, z, rad, hp, broken: false, spray: null, rotY });
  }

  _spawnCivilians(skins, shirts, pants, hairs) {
    this.peds = [];
    const pick = (arr, n) => arr[n % arr.length];
    const moreShirts = shirts.concat([0x222222, 0xf7f3ee, 0xff8fab, 0x00bbf9, 0x9b5de5, 0xfee440, 0x00f5d4, 0xef476f]);
    const morePants = pants.concat([0x1d3557, 0x6d6875, 0xf4a261, 0x2a9d8f, 0xeeeeee]);
    const dogFur = [0x8a5a32, 0xf3e2c5, 0x333333, 0xd9a066, 0x888888];
    let n = 0;
    const add = (role, extra) => {
      const mesh = makePerson(pick(moreShirts, n), pick(morePants, n + 2), pick(skins, n + 1), pick(hairs, n + 3));
      const ped = Object.assign({
        mesh, role, t: n * 0.05, speed: 1.2 + (n % 5) * 0.12, side: 0,
        diveT: 0, waveT: 0, visible: true, loop: null,
      }, extra);
      this.scene.add(mesh);
      if (role === 'dog') {
        const dog = makeDog(pick(dogFur, n));
        this.scene.add(dog);
        ped.dog = dog;
      }
      this.peds.push(ped);
      n += 1;
      return ped;
    };
    // walkers
    const nWalk = this.lite ? 12 : 26;
    for (let i = 0; i < nWalk; i++) {
      const li = i % N, lj = (i * 2 + 1) % N;
      const loop = this._sidewalkLoop(li, lj);
      const ped = add('walk', { loop, t: i * 0.04 });
      const pos = this._loopPos(loop, ped.t);
      ped.mesh.position.set(pos.x, 0, pos.z);
    }
    // dog walkers
    const nDog = this.lite ? 3 : 6;
    for (let i = 0; i < nDog; i++) {
      const loop = this._sidewalkLoop((i + 1) % N, (i * 2) % N);
      const ped = add('dog', { loop, t: 0.1 * i });
      const pos = this._loopPos(loop, ped.t);
      ped.mesh.position.set(pos.x, 0, pos.z);
    }
    // crossers
    const nCross = this.lite ? 4 : 8;
    for (let i = 0; i < nCross; i++) {
      const a = roadC(i % (N + 1)), b = roadC((i + 2) % (N + 1));
      const along = (i % 2 === 0);
      const wait = along
        ? { x: a - ROAD / 2 - 1.2, z: b + 4 }
        : { x: b + 4, z: a - ROAD / 2 - 1.2 };
      const dest = along
        ? { x: a + ROAD / 2 + 1.2, z: b + 4 }
        : { x: b + 4, z: a + ROAD / 2 + 1.2 };
      const ped = add('cross', { wait, dest, crossT: 0, crossing: false, back: false });
      ped.mesh.position.set(wait.x, 0, wait.z);
    }
    // waiters at bus stops
    const nWait = this.lite ? 4 : 6;
    for (let i = 0; i < nWait; i++) {
      const s = this.busStops[i] || { x: roadC(i), z: roadC(0) - 10 };
      const ped = add('wait', { home: { x: s.x + 0.3, z: s.z + 0.6 } });
      ped.mesh.position.set(ped.home.x, 0, ped.home.z);
    }
    // sitters
    const nSit = this.lite ? 4 : 6;
    for (let i = 0; i < nSit; i++) {
      const b = this.benches[i] || { x: lotC(PLAZA_I) + 8, z: lotC(PLAZA_J), rot: 0 };
      const ped = add('sit', { home: { x: b.x, z: b.z }, sitRot: b.rot || 0 });
      ped.mesh.position.set(b.x, 0, b.z);
      ped.mesh.rotation.y = ped.sitRot;
      ped.mesh.userData.lLeg.rotation.x = -1.2;
      ped.mesh.userData.rLeg.rotation.x = -1.2;
    }
    // chatters in parks, pairs
    const parks = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (specialLot(i, j) === 'park' || specialLot(i, j) === 'plaza') parks.push({ x: lotC(i), z: lotC(j) });
    const nChat = this.lite ? 2 : 4;
    for (let i = 0; i < nChat; i++) {
      const pk = parks[i % parks.length];
      const ox = (i % 2) * 4 - 2, oz = (i * 3 % 5) - 2;
      const a = add('chat', { home: { x: pk.x + ox, z: pk.z + oz }, partner: null });
      const b = add('chat', { home: { x: pk.x + ox + 1.2, z: pk.z + oz }, partner: a });
      a.partner = b;
      a.mesh.position.set(a.home.x, 0, a.home.z);
      b.mesh.position.set(b.home.x, 0, b.home.z);
      a.mesh.rotation.y = Math.PI / 2;
      b.mesh.rotation.y = -Math.PI / 2;
    }
  }

  updateCivilians(dt) {
    const danger = this.playerCar ? this.playerCar.pos : this.player.position;
    const carFast = !!(this.playerCar && Math.abs(this.playerCar.speed) > 6);
    const dangerR = this.playerCar ? (carFast ? 7.5 : 5) : 2.6;
    const RANGE = this.lite ? 80 : 120;
    const onFoot = !this.playerCar;
    const nsGreen = Math.floor(this.time / 5) % 2 === 0;
    for (const ped of this.peds) {
      if (this.mission && this.mission.passenger === ped) continue;
      const mx = ped.mesh.position.x, mz = ped.mesh.position.z;
      const distP = Math.hypot(mx - danger.x, mz - danger.z);
      const near = distP < RANGE;
      if (ped.mesh.visible !== near) ped.mesh.visible = near;
      if (ped.dog) ped.dog.visible = near;
      if (!near) continue;

      if (ped.diveT > 0) {
        ped.diveT -= dt;
        const k = 1 - ped.diveT / 0.7;
        ped.mesh.rotation.z = Math.sin(k * Math.PI) * 0.9 * (ped.diveDir || 1);
        ped.mesh.position.y = this.heightAt(mx, mz) + Math.sin(k * Math.PI) * 1.1;
        if (ped.diveT <= 0) {
          ped.mesh.rotation.z = 0;
          ped.mesh.position.y = this.heightAt(mx, mz);
        }
        continue;
      }

      if (ped.downT > 0) {
        ped.downT -= dt;
        const k = 1 - ped.downT / 2.2;
        ped.mesh.rotation.z = Math.min(1, k * 2) * (Math.PI / 2) * (ped.diveDir || 1);
        ped.mesh.position.y = this.heightAt(mx, mz) + 0.15;
        if (ped.stars) {
          ped.stars.visible = true;
          ped.stars.position.set(mx, ped.mesh.position.y + 1.3, mz);
          ped.stars.rotation.y += dt * 6;
        }
        if (ped.downT <= 0) {
          ped.mesh.rotation.z = 0;
          ped.mesh.position.y = this.heightAt(mx, mz);
          if (ped.stars) ped.stars.visible = false;
        }
        continue;
      }

      if (this.playerCar && Math.abs(this.playerCar.speed) > 7 && distP < 2.15) {
        ped.downT = 2.2;
        ped.diveDir = (hash2(mx, mz) > 0.5) ? 1 : -1;
        if (!ped.stars) {
          ped.stars = new THREE.Group();
          const sm = new THREE.MeshBasicMaterial({ color: 0xffe066 });
          for (let k = 0; k < 3; k++) {
            const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), sm);
            st.position.set(Math.cos(k * 2.1) * 0.4, 0, Math.sin(k * 2.1) * 0.4);
            ped.stars.add(st);
          }
          this.scene.add(ped.stars);
        }
        this.sfx.yelp();
        this.reportCrime(1, '⭐ Bumped a person!');
        continue;
      }

      if (carFast && distP < dangerR) {
        ped.diveT = 0.7;
        ped.diveDir = (hash2(mx, mz) > 0.5) ? 1 : -1;
        const ang = Math.atan2(mx - danger.x, mz - danger.z);
        ped.mesh.position.x += Math.sin(ang) * 1.6;
        ped.mesh.position.z += Math.cos(ang) * 1.6;
        this.sfx.yelp();
        continue;
      }

      if (onFoot && distP < 4.2 && (ped.role === 'walk' || ped.role === 'wait' || ped.role === 'dog' || ped.role === 'cross')) {
        ped.waveT = 1.2;
      }
      if (ped.waveT > 0) {
        ped.waveT -= dt;
        ped.mesh.userData.rArm.rotation.z = Math.sin(this.time * 10) * 1.1;
        ped.mesh.userData.rArm.rotation.x = -1.4;
        animateWalk(ped.mesh, this.time, false);
        // still allow walkers to pause and wave
        if (ped.role !== 'walk' && ped.role !== 'dog') continue;
      } else if (ped.mesh.userData.rArm) {
        ped.mesh.userData.rArm.rotation.z = 0;
      }

      if (ped.role === 'walk' || ped.role === 'dog') {
        ped.t += (ped.speed * dt) / 80;
        const pos = this._loopPos(ped.loop, ped.t);
        const d = Math.hypot(pos.x - danger.x, pos.z - danger.z);
        if (d < dangerR) ped.side = lerp(ped.side, 2.4, 1 - Math.pow(0.01, dt));
        else ped.side = lerp(ped.side, 0, 1 - Math.pow(0.05, dt));
        const len = Math.hypot(pos.dx, pos.dz) || 1;
        const sx = -pos.dz / len * ped.side, sz = pos.dx / len * ped.side;
        ped.mesh.position.set(pos.x + sx, this.heightAt(pos.x, pos.z), pos.z + sz);
        ped.mesh.rotation.y = Math.atan2(pos.dx, -pos.dz);
        animateWalk(ped.mesh, this.time + ped.t * 10, ped.waveT <= 0);
        if (ped.dog) {
          const ox = -pos.dz / len * 0.8, oz = pos.dx / len * 0.8;
          ped.dog.position.set(pos.x + sx + ox, this.heightAt(pos.x, pos.z), pos.z + sz + oz);
          ped.dog.rotation.y = ped.mesh.rotation.y;
          if (ped.dog.userData.tail) ped.dog.userData.tail.rotation.y = Math.sin(this.time * 8) * 0.5;
        }
      } else if (ped.role === 'cross') {
        const go = nsGreen;
        const movingNS = Math.abs(ped.dest.z - ped.wait.z) > Math.abs(ped.dest.x - ped.wait.x);
        const canGo = movingNS ? go : !go;
        if (!ped.crossing && canGo) { ped.crossing = true; ped.crossT = 0; }
        if (ped.crossing) {
          ped.crossT += dt * 0.45;
          const a = ped.back ? ped.dest : ped.wait;
          const b = ped.back ? ped.wait : ped.dest;
          const k = Math.min(1, ped.crossT);
          ped.mesh.position.set(lerp(a.x, b.x, k), this.heightAt(lerp(a.x, b.x, k), lerp(a.z, b.z, k)), lerp(a.z, b.z, k));
          ped.mesh.rotation.y = Math.atan2(b.x - a.x, -(b.z - a.z));
          animateWalk(ped.mesh, this.time, true);
          if (k >= 1) { ped.crossing = false; ped.back = !ped.back; }
        } else {
          const stand = ped.back ? ped.dest : ped.wait;
          ped.mesh.position.set(stand.x, this.heightAt(stand.x, stand.z), stand.z);
          animateWalk(ped.mesh, this.time, false);
        }
      } else if (ped.role === 'wait') {
        ped.mesh.position.set(ped.home.x, this.heightAt(ped.home.x, ped.home.z), ped.home.z);
        ped.mesh.rotation.y = Math.sin(this.time * 0.3 + ped.t) * 0.4;
        animateWalk(ped.mesh, this.time, false);
      } else if (ped.role === 'sit') {
        ped.mesh.position.set(ped.home.x, this.heightAt(ped.home.x, ped.home.z), ped.home.z);
        ped.mesh.userData.lLeg.rotation.x = -1.2;
        ped.mesh.userData.rLeg.rotation.x = -1.2;
        ped.mesh.userData.lArm.rotation.x = 0.3;
        ped.mesh.userData.rArm.rotation.x = 0.3;
      } else if (ped.role === 'chat') {
        ped.mesh.position.set(ped.home.x, this.heightAt(ped.home.x, ped.home.z), ped.home.z);
        if (ped.partner) {
          ped.mesh.lookAt(ped.partner.mesh.position.x, ped.mesh.position.y, ped.partner.mesh.position.z);
        }
        ped.mesh.userData.rArm.rotation.x = -0.4 + Math.sin(this.time * 3 + ped.t) * 0.5;
        animateWalk(ped.mesh, this.time, false);
      }
    }
  }

  _spawnPatrolCops() {
    const routes = this._trafficRoutes();
    const n = 5;
    while (this.police.length < n) {
      const spec = { id: 'cop', name: 'Police', color: 0xf4f6fa, accent: 0x1a1a2a, max: 30, accel: 24, brake: 38, steer: 2.6, grip: 0.14, kind: 'police' };
      const mesh = makeCarMesh(spec);
      const route = routes[(this.police.length * 2) % routes.length];
      const start = (this.police.length * 4) % route.length;
      const cop = {
        spec, mesh, pos: route[start].clone(), vel: new THREE.Vector3(),
        heading: 0, speed: 11, hp: 100, wrecked: false, active: true, airborne: false, police: true,
        chasing: false, route, idx: start,
      };
      const nxt = route[(start + 1) % route.length];
      cop.heading = Math.atan2(nxt.x - cop.pos.x, -(nxt.z - cop.pos.z));
      this.placeCar(cop);
      if (cop.mesh.userData.lightR) cop.mesh.userData.lightR.visible = false;
      if (cop.mesh.userData.lightB) cop.mesh.userData.lightB.visible = false;
      this.scene.add(mesh);
      this.police.push(cop);
    }
  }

  updatePlaces(dt) {
    if (this.mode !== 'play') return;
    const p = this.playerCar ? this.playerCar.pos : this.player.position;
    this.washCool = Math.max(0, this.washCool - dt);
    if (this.fedT > 0) this.fedT = Math.max(0, this.fedT - dt);
    let holding = false;
    let prompt = '';

    // banks
    for (const b of this.banks) {
      if (!b.open && this.time >= b.coolUntil) {
        b.open = true;
        b.hold = 0;
        if (b.marker) b.marker.visible = true;
        if (b.openSign) b.openSign.visible = true;
        if (b.closedSign) b.closedSign.visible = false;
        this.toast('A Zoom City Bank is open again.');
      }
      if (b.marker && b.marker.userData.diamond) {
        b.marker.userData.diamond.rotation.y += dt * 2;
        const s = 1 + Math.sin(this.time * 4) * 0.08;
        if (b.marker.userData.ring) b.marker.userData.ring.scale.setScalar(s);
      }
      if (!b.open) { b.hold = 0; continue; }
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d < 4.2) {
        b.hold += dt;
        holding = true;
        prompt = 'Stay here to grab the money bags...';
        const el = $('hold-meter'), lab = $('hold-label'), fill = $('hold-fill');
        if (el) el.classList.remove('hidden');
        if (lab) lab.textContent = 'Stay to grab the money bags...';
        if (fill) fill.style.transform = 'scaleX(' + Math.min(1, b.hold / 3) + ')';
        if (b.hold >= 3) this._robBank(b);
      } else {
        b.hold = Math.max(0, b.hold - dt * 1.2);
      }
    }
    if (!holding) {
      const el = $('hold-meter');
      if (el) el.classList.add('hidden');
    }

    // gas
    const gas = this.places.gas;
    if (gas && this.playerCar && Math.hypot(p.x - gas.x, p.z - gas.z) < gas.r) {
      if (this.nitro < 0.99) {
        this.nitro = Math.min(1, this.nitro + dt * 0.55);
        prompt = prompt || 'Filling nitro...';
        if (this.nitro >= 0.99) this.toast('Tank is full! Nitro is refilled.');
      } else if (!prompt) prompt = 'Nitro is full.';
    }

    // car wash
    const wash = this.places.wash;
    if (wash && this.playerCar && Math.abs(p.x - wash.x) < 3 && Math.abs(p.z - wash.z) < wash.len / 2) {
      if (this.washCool <= 0) {
        const palette = [0xffc828, 0xff3355, 0x4d8fff, 0x2bb673, 0xb44aff, 0xff8fab, 0xf4f1de, 0x00bbf9, 0xff7043];
        const hex = palette[(Math.random() * palette.length) | 0];
        const body = this.playerCar.mesh.userData.body;
        if (body && body.material) body.material.color.setHex(hex);
        this.washCool = 8;
        this.toast('Car wash! Your car has a new color.');
        this.sfx.pop();
      } else if (!prompt) prompt = 'What a shiny paint job!';
    }

    // burger
    const bur = this.places.burger;
    if (bur && Math.hypot(p.x - bur.x, p.z - bur.z) < bur.r) {
      if (this.time >= (bur.coolUntil || 0)) {
        bur.hold = (bur.hold || 0) + dt;
        prompt = prompt || 'Stay for a Zoom Burger...';
        if (bur.hold >= 1.2) {
          bur.coolUntil = this.time + 20;
          bur.hold = 0;
          this.fedT = 12;
          if (this.playerCar) this.playerCar.hp = 100;
          this.nitro = Math.min(1, this.nitro + 0.35);
          this.toast('Zoom Burger! You feel great.');
          this.sfx.success();
        }
      }
    } else if (bur) bur.hold = 0;

    if (prompt) this.setPrompt(prompt);
  }

  _robBank(b) {
    if (!b.open) return;
    b.open = false;
    b.hold = 0;
    b.coolUntil = this.time + 70;
    if (b.marker) b.marker.visible = false;
    if (b.openSign) b.openSign.visible = false;
    if (b.closedSign) b.closedSign.visible = true;
    if (b.bags) {
      for (let k = 0; k < 3; k++) {
        const bag = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), new THREE.MeshLambertMaterial({ color: 0xc9a227 }));
        bag.scale.y = 1.2;
        bag.position.set(b.x + (k - 1) * 0.6, 0.8, b.z);
        this.scene.add(bag);
        this.particles.push({
          mesh: bag, vel: new THREE.Vector3((k - 1) * 1.2, 5, 0.4), life: 1.15,
        });
      }
    }
    this.addCoins(20);
    this.reportCrime(3, '⭐⭐⭐ Bank robbery! The alarm called the police!', { alarm: true });
  }


  copCanSee(cop, pos, range = 72) {
    if (!cop || cop.wrecked || !cop.mesh || !cop.mesh.visible) return false;
    const dx = pos.x - cop.pos.x, dz = pos.z - cop.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.4) return true;
    if (dist > range) return false;
    const fx = Math.sin(cop.heading), fz = -Math.cos(cop.heading);
    const ndot = (fx * dx + fz * dz) / dist;
    if (ndot < 0.25) return false; // ~150 degree wide cone
    return this.hasLineOfSight(cop.pos.x, cop.pos.z, pos.x, pos.z);
  }

  hasLineOfSight(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(2, Math.ceil(dist / 3));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = ax + dx * t, z = az + dz * t;
      for (const b of this.colliders) {
        if ((b.h || 0) < 3.2) continue;
        if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return false;
      }
    }
    return true;
  }

  copWhoSees(pos) {
    let best = null, bestD = 999;
    for (const c of this.police) {
      if (!this.copCanSee(c, pos, 72)) continue;
      const d = Math.hypot(pos.x - c.pos.x, pos.z - c.pos.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  _copSpots(cop) {
    if (!cop) return;
    if (!this._bangMesh) {
      const g = new THREE.Group();
      const bg = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
      const bang = makeTextSign('!', 0.9, 0.9, '#ffe066', '#111111', ['!']);
      bang.position.z = 0.45;
      g.add(bg, bang);
      this.scene.add(g);
      this._bangMesh = g;
    }
    cop.bangUntil = this.time + 2.4;
    this._bangCop = cop;
    this._bangMesh.visible = true;
  }

  _updateCopBang() {
    if (!this._bangMesh) return;
    const cop = this._bangCop;
    if (!cop || this.time > (cop.bangUntil || 0) || cop.wrecked) {
      this._bangMesh.visible = false;
      return;
    }
    this._bangMesh.visible = true;
    this._bangMesh.position.set(cop.pos.x, 3.4, cop.pos.z);
    this._bangMesh.lookAt(this.camera.position);
  }

  reportCrime(amount, why, opts) {
    if (this.mode !== 'play') return;
    const p = this.playerCar ? this.playerCar.pos : this.player.position;
    if (opts && opts.alarm) {
      this.addWanted(amount, why || '⭐⭐⭐ Bank robbery! The alarm called the police!');
      return;
    }
    const cop = (opts && opts.cop) || this.copWhoSees(p);
    if (cop) {
      this._copSpots(cop);
      this.addWanted(amount, '👀 A cop saw that! ⭐');
    } else {
      if (!this.lastCrimeToast || this.time - this.lastCrimeToast > 1.0) {
        this.toast('😅 No cops saw that');
        this.lastCrimeToast = this.time;
      }
    }
  }

    addWanted(amount, why) {
    if (this.mode !== 'play') return;
    if (this.time - this.lastWantedAt < 1.15 && amount < 2) return;
    this.lastWantedAt = this.time;
    const old = this.stars;
    this.stars = Math.min(5, this.stars + amount);
    if (this.stars > old) {
      this.sfx.wanted();
      this.toast(why || ('⭐ Wanted!  ' + this.stars + ' star' + (this.stars > 1 ? 's' : '')));
      const el = $('wanted');
      if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 400); }
      this.ensureCops();
      this.escapeT = 0;
    }
  }

  updateWanted(dt) {
    if (this.stars <= 0) { this.escapeT = 0; this.sfx.sirenTick(false); return; }
    let nearest = 999;
    let seen = false;
    const p = this.playerCar ? this.playerCar.pos : this.player.position;
    for (const c of this.police) {
      if (!c.active || c.wrecked) continue;
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      nearest = Math.min(nearest, d);
      if (d < 60 && this.hasLineOfSight(c.pos.x, c.pos.z, p.x, p.z)) seen = true;
    }
    this.sfx.sirenTick(nearest < 70);
    if (!seen) this.escapeT += dt;
    else this.escapeT = 0;
    if (this.escapeT > 16.5) {
      this.stars -= 1;
      this.escapeT = 0;
      if (this.stars <= 0) {
        this.stars = 0;
        this.returnToPatrol();
        this.toast('You escaped! The police went back to patrol.');
        this.sfx.success();
      } else {
        this.toast('The police are losing you!');
        this.ensureCops();
      }
    }
  }

  ensureCops() {
    if (this.stars <= 0) { this.returnToPatrol(); return; }
    this._spawnPatrolCops();
    const p = this.playerCar ? this.playerCar.pos : this.player.position;
    const need = Math.min(5, Math.max(2, this.stars)); // at most the 5 patrol cars
    let on = 0;
    for (const c of this.police) {
      if (c.wrecked) continue;
      c.active = true;
      c.chasing = true;
      c.mesh.visible = true;
      const dist = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      if (dist > 95 && on < need) {
        const ang = Math.random() * Math.PI * 2;
        const d = 28 + Math.random() * 16;
        c.pos.set(p.x + Math.sin(ang) * d, 0, p.z + Math.cos(ang) * d);
        let best = c.pos.x, bestZ = c.pos.z, bd = 99;
        for (let i = 0; i <= N; i++) {
          const r = roadC(i);
          if (Math.abs(c.pos.x - r) < bd) { bd = Math.abs(c.pos.x - r); best = r; bestZ = c.pos.z; }
          if (Math.abs(c.pos.z - r) < bd) { bd = Math.abs(c.pos.z - r); best = c.pos.x; bestZ = r; }
        }
        c.pos.set(best, 0, bestZ);
        c.heading = Math.atan2(p.x - c.pos.x, -(p.z - c.pos.z));
        c.speed = 16;
        this.placeCar(c);
      }
      on++;
    }
    while (on < need && this.police.length < 5) {
      const spec = { id: 'cop', name: 'Police', color: 0xf4f6fa, accent: 0x1a1a2a, max: 30, accel: 24, brake: 38, steer: 2.6, grip: 0.14, kind: 'police' };
      const mesh = makeCarMesh(spec);
      const routes = this._trafficRoutes();
      const route = routes[on % routes.length];
      const cop = {
        spec, mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        heading: 0, speed: 16, hp: 100, wrecked: false, active: true, airborne: false, police: true,
        chasing: true, route, idx: 0,
      };
      const ang = Math.random() * Math.PI * 2;
      cop.pos.set(p.x + Math.sin(ang) * 30, 0, p.z + Math.cos(ang) * 30);
      cop.heading = Math.atan2(p.x - cop.pos.x, -(p.z - cop.pos.z));
      this.placeCar(cop);
      this.scene.add(mesh);
      this.police.push(cop);
      on++;
    }
  }

  dismissCops() { this.returnToPatrol(); }

  returnToPatrol() {
    this._spawnPatrolCops();
    for (const c of this.police) {
      c.chasing = false;
      c.active = true;
      if (c.wrecked) continue;
      c.mesh.visible = true;
      c.speed = 11;
      if (c.mesh.userData.boost) c.mesh.userData.boost.visible = false;
      if (c.mesh.userData.lightR) c.mesh.userData.lightR.visible = false;
      if (c.mesh.userData.lightB) c.mesh.userData.lightB.visible = false;
      if (c.route) {
        const pt = c.route[c.idx % c.route.length];
        const far = Math.hypot(c.pos.x - pt.x, c.pos.z - pt.z) > 80;
        if (far) { c.pos.copy(pt); this.placeCar(c); }
      }
    }
  }

  updatePolice(dt) {
    if (this.freezePatrol) {
      for (const cop of this.police) {
        cop.speed = 0;
        if (cop.mesh) {
          this.placeCar(cop);
          if (cop.mesh.userData.lightR) cop.mesh.userData.lightR.visible = this.stars > 0;
          if (cop.mesh.userData.lightB) cop.mesh.userData.lightB.visible = this.stars > 0;
        }
      }
      return;
    }
    if (this.stars <= 0) {
      for (const cop of this.police) cop.chasing = false;
    }
    const p = this.playerCar ? this.playerCar.pos : this.player.position;
    const phd = this.playerCar ? this.playerCar.heading : this.heading;
    const pspd = this.playerCar ? this.playerCar.speed : 0;
    let closeCount = 0;
    let i = 0;
    this._bustTouch = 0;
    for (const cop of this.police) {
      if (!cop.mesh.visible && !cop.chasing) continue;
      if (cop.wrecked) { this.tryRespawnCar(cop); continue; }
      const dist = Math.hypot(p.x - cop.pos.x, p.z - cop.pos.z);
      const chasing = this.stars > 0 && cop.chasing;
      if (!chasing) {
        if (cop.route) {
          const tgt = cop.route[(cop.idx + 1) % cop.route.length];
          const dx = tgt.x - cop.pos.x, dz = tgt.z - cop.pos.z;
          const td = Math.hypot(dx, dz);
          cop.heading = lerpAng(cop.heading, Math.atan2(dx, -dz), 1 - Math.pow(0.05, dt));
          cop.speed = lerp(cop.speed, 11, 0.15);
          cop.pos.x += Math.sin(cop.heading) * cop.speed * dt;
          cop.pos.z += -Math.cos(cop.heading) * cop.speed * dt;
          if (td < 3) cop.idx = (cop.idx + 1) % cop.route.length;
        }
        this.resolvePos(cop.pos, 1.2);
        this.placeCar(cop);
        if (cop.mesh.userData.wheels) {
          const spin = cop.speed * dt * 2;
          for (const w of cop.mesh.userData.wheels) w.rotation.x += spin;
        }
        if (cop.mesh.userData.lightR) cop.mesh.userData.lightR.visible = false;
        if (cop.mesh.userData.lightB) cop.mesh.userData.lightB.visible = false;
        if (this.playerCar) this.bumpCars(this.playerCar, cop, true);
        this.carSmoke(cop, dt);
        continue;
      }
      i++;
      const fx = Math.sin(phd), fz = -Math.cos(phd);
      let tx = p.x, tz = p.z;
      const role = i % 3;
      if (this.stars >= 3 && role === 0) { tx = p.x + fx * 22; tz = p.z + fz * 22; }
      else if (this.stars >= 3 && role === 1) { tx = p.x - fz * 10; tz = p.z + fx * 10; }
      const dx = tx - cop.pos.x, dz = tz - cop.pos.z;
      const want = Math.atan2(dx, -dz);
      cop.heading = lerpAng(cop.heading, want, 1 - Math.pow(0.08, dt));
      const max = cop.spec.max * (0.85 + this.stars * 0.04);
      if (dist > 6) cop.speed = Math.min(max, cop.speed + (cop.spec.accel + 6) * dt);
      else if (dist > 3.4) cop.speed = lerp(cop.speed, Math.max(Math.abs(pspd), 7), 0.35);
      else cop.speed = Math.min(cop.speed, Math.max(3, Math.abs(pspd) + 1.5));
      cop.pos.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.pos.z += -Math.cos(cop.heading) * cop.speed * dt;
      this.resolvePos(cop.pos, 1.2);
      this.placeCar(cop);
      if (cop.mesh.userData.wheels) {
        const spin = cop.speed * dt * 2;
        for (const w of cop.mesh.userData.wheels) w.rotation.x += spin;
      }
      const flash = Math.sin(this.time * 16) > 0;
      if (cop.mesh.userData.lightR) cop.mesh.userData.lightR.visible = flash;
      if (cop.mesh.userData.lightB) cop.mesh.userData.lightB.visible = !flash;
      if (this.playerCar) this.bumpCars(this.playerCar, cop, true);
      if (dist < 6) closeCount++;
      if (dist < 3.7) this._bustTouch = (this._bustTouch || 0) + 1;
      this.carSmoke(cop, dt);
    }
    if (this.mode === 'play') this.updateBustMeter(dt, closeCount, pspd);
  }

  updateBustMeter(dt, closeCount, pspd) {
    this._bustTouch = this._bustTouch || 0;
    const touch = this._bustTouch;
    this._bustTouch = 0;
    const speed = Math.abs(pspd || 0);
    const catching = this.stars > 0 && (
      (touch >= 1 && speed < 12) ||
      (closeCount >= 2 && speed < 14) ||
      (touch >= 1 && closeCount >= 2 && speed < 20) ||
      (!this.playerCar && closeCount >= 1)
    );
    const NEED = 2;
    if (catching) this.holdBust = Math.min(NEED, this.holdBust + dt);
    else this.holdBust = Math.max(0, this.holdBust - dt * 0.7);
    const el = $('bust-meter');
    const fill = $('bust-fill');
    if (el && fill) {
      const show = this.holdBust > 0.05 && this.stars > 0 && this.mode === 'play';
      el.classList.toggle('hidden', !show);
      const k = this.holdBust / NEED;
      fill.style.transform = 'scaleX(' + k + ')';
      const lab = $('bust-label');
      if (lab) lab.textContent = k > 0.75 ? 'Busted!' : "They're catching you!";
    }
    if (this.holdBust >= NEED) this.doBust();
  }

  doBust() {
    if (this.mode !== 'play') return;
    this.holdBust = 0;
    this.stars = 0;
    this.dismissCops();
    if (this.mission && this.mission.type === 'getaway') {
      this.mission = null;
      this.hideMission();
      this.toast('The getaway failed.');
    }
    const plaza = this.plaza || new THREE.Vector3(lotC(PLAZA_I) + 8, 0, lotC(PLAZA_J) + 16);
    const car = this.playerCar || this.cars.find((c) => c.spec.id === this.save.selected) || this.cars[0];
    if (car) {
      car.speed = 0;
      car.vel.set(0, 0, 0);
      car.hp = 100;
      car.wrecked = false;
      car.locked = false;
      car.mesh.visible = true;
      car.pos.copy(plaza);
      car.heading = 0;
      this.placeCar(car);
      if (this.playerCar !== car) this.enterCar(car);
    }
    this.player.position.copy(plaza);
    this.lastSafe.copy(plaza);
    this.holdBust = 0;
    this._bustTouch = 0;
    this.mode = 'busted';
    if ($('busted')) $('busted').classList.remove('hidden');
    this.sfx.fail();
    this.updateHud();
    const esc = $('escape-hint');
    if (esc) esc.classList.add('hidden');
    const bust = $('bust-meter');
    if (bust) bust.classList.add('hidden');
  }

  clearBusted() {
    if ($('busted')) $('busted').classList.add('hidden');
    this.mode = 'play';
    this.clock.getDelta();
  }

  collidePlayerWithCars() {
    if (!this.playerCar || this.playerCar.wrecked) return;
    for (const tr of this.traffic) this.bumpCars(this.playerCar, tr, false);
    for (const cop of this.police) if (cop.active) this.bumpCars(this.playerCar, cop, true);
  }

  bumpCars(a, b, isCop) {
    if (!a || !b || a.wrecked || b.wrecked) return;
    const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 3.15 || d < 0.0001) return;
    const nx = dx / d, nz = dz / d;
    const overlap = 3.15 - d;
    a.pos.x += nx * overlap * 0.5;
    a.pos.z += nz * overlap * 0.5;
    b.pos.x -= nx * overlap * 0.5;
    b.pos.z -= nz * overlap * 0.5;
    const rel = Math.abs((a.speed || 0) - (b.speed || 0)) + Math.hypot((a.vel && a.vel.x) || 0, (a.vel && a.vel.z) || 0) * 0.2;
    if (rel > 6) {
      const slow = Math.abs(a.speed || 0) < 5;
      this.hurtCar(a, rel * (slow ? 0.25 : 1.6));
      this.hurtCar(b, rel * (slow ? 0.4 : 2.1));
      this.spawnSparks((a.pos.x + b.pos.x) / 2, 0.8, (a.pos.z + b.pos.z) / 2);
      this.sfx.crash();
      a.speed *= 0.55;
      b.speed *= 0.4;
      if (!isCop && a === this.playerCar && rel > 8) this.reportCrime(1, '⭐ You crashed into traffic!');
      if (isCop && a === this.playerCar && Math.abs(a.speed || 0) > 10 && rel > 10) this.reportCrime(1, '⭐ You bumped a police car!', { cop: b });
    }
  }

  hurtCar(car, dmg) {
    if (!car || car.wrecked) return;
    car.hp = (car.hp == null ? 100 : car.hp) - dmg;
    if (car.hp <= 0) this.wreckCar(car);
  }

  wreckCar(car) {
    if (!car || car.wrecked) return;
    car.wrecked = true;
    car.speed = 0;
    car.hp = 0;
    this.spawnBoom(car.mesh.position.x, car.mesh.position.y + 0.8, car.mesh.position.z);
    this.sfx.boom();
    car.mesh.visible = false;
    if (car.mesh.userData.boost) car.mesh.userData.boost.visible = false;
    if (car === this.playerCar) {
      this.leaveCar();
      this.toast('Your car popped in a cartoon boom! (No one was inside.) Call another from the Garage.');
      car.respawnAt = this.time + 6;
      car.locked = false;
    } else {
      car.respawnAt = this.time + 7;
    }
  }

  tryRespawnCar(car) {
    if (!car.wrecked || this.time < (car.respawnAt || 0)) return;
    car.wrecked = false;
    car.hp = 100;
    car.speed = 0;
    car.vel.set(0, 0, 0);
    if (car.route) {
      const p = car.route[car.idx % car.route.length];
      car.pos.copy(p);
    } else if (car.police) {
      car.wrecked = false;
      car.hp = 100;
      car.mesh.visible = true;
      car.chasing = this.stars > 0;
      if (car.route) {
        const pt = car.route[car.idx % car.route.length];
        car.pos.copy(pt);
      }
      this.placeCar(car);
      if (this.stars > 0) this.ensureCops();
      return;
    } else {
      const plaza = this.plaza || new THREE.Vector3(lotC(PLAZA_I) + 8, 0, lotC(PLAZA_J) + 20);
      car.pos.copy(plaza);
    }
    car.mesh.visible = true;
    this.placeCar(car);
  }

  checkRedLight(car) {
    if (!car || Math.abs(car.speed) < 12) return;
    const half = ROAD / 2 + 1;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const x = roadC(i), z = roadC(j);
        if (Math.abs(car.pos.x - x) < half && Math.abs(car.pos.z - z) < half) {
          const key = i + ',' + j + ',' + Math.floor(this.time / 5);
          if (this.redLock === key) return;
          const nsGreen = Math.floor(this.time / 5) % 2 === 0;
          const movingNS = Math.abs(Math.cos(car.heading)) > Math.abs(Math.sin(car.heading));
          const red = movingNS ? !nsGreen : nsGreen;
          if (red) {
            this.redLock = key;
            this.reportCrime(1, '⭐ You ran a red light!');
          }
          return;
        }
      }
    }
  }

  updateTrafficLights() {
    const nsGreen = Math.floor(this.time / 5) % 2 === 0;
    const amber = (this.time % 5) > 4.2;
    for (const L of this.lights) {
      const go = L.ns ? nsGreen : !nsGreen;
      L.r.material.color.setHex(!go && !amber ? 0xff2a2a : 0x441111);
      L.y.material.color.setHex(amber ? 0xffd24a : 0x443311);
      L.g2.material.color.setHex(go && !amber ? 0x3cff6a : 0x114411);
    }
  }

  smashProps(car) {
    if (!car || Math.abs(car.speed) < 6) return;
    for (const pr of this.props) {
      if (pr.broken) continue;
      if (Math.hypot(car.pos.x - pr.x, car.pos.z - pr.z) < pr.rad + 1.2) {
        pr.broken = true;
        pr.mesh.visible = false;
        this.spawnSparks(pr.x, 0.6, pr.z);
        this.sfx.smash();
        this.reportCrime(1, pr.type === 'hydrant' ? '⭐ You smashed a hydrant!' : '⭐ You smashed something!');
        if (pr.type === 'hydrant') {
          const spray = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.35, 4, 8),
            new THREE.MeshBasicMaterial({ color: 0x7ad7ff, transparent: true, opacity: 0.55 })
          );
          spray.position.set(pr.x, 2.1, pr.z);
          this.scene.add(spray);
          pr.spray = spray;
          pr.sprayUntil = this.time + 4;
        }
      }
    }
  }

  updateProps(dt) {
    for (const pr of this.props) {
      if (pr.spray && this.time > pr.sprayUntil) {
        this.scene.remove(pr.spray);
        pr.spray = null;
      }
    }
  }

  spawnSparks(x, y, z) {
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 5, 4),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffe066 : 0xff7a1a })
      );
      m.position.set(x, y, z);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6),
        life: 0.45 + Math.random() * 0.2,
      });
    }
    this.trimParticles();
  }

  spawnBoom(x, y, z) {
    const colors = [0xff9f1c, 0xffd024, 0xff5c2e, 0xfff3b0, 0x888];
    for (let i = 0; i < 16; i++) {
      const star = i % 3 === 0;
      const m = new THREE.Mesh(
        star ? new THREE.OctahedronGeometry(0.35) : new THREE.SphereGeometry(0.25 + Math.random() * 0.35, 6, 5),
        new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, opacity: 0.95 })
      );
      m.position.set(x, y, z);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 8, 2 + Math.random() * 6, (Math.random() - 0.5) * 8),
        life: 0.55 + Math.random() * 0.3,
        fade: true,
      });
    }
    this.trimParticles();
  }

  carSmoke(car, dt) {
    if (!car || car.wrecked || (car.hp != null && car.hp > 50)) return;
    car._smT = (car._smT || 0) - dt;
    if (car._smT > 0) return;
    car._smT = 0.16;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0.45 })
    );
    const fwd = 0.6;
    m.position.set(car.pos.x - Math.sin(car.heading) * fwd, (car.mesh.position.y || 0) + 1.1, car.pos.z + Math.cos(car.heading) * fwd);
    this.scene.add(m);
    this.particles.push({ mesh: m, vel: new THREE.Vector3(0, 1.2, 0), life: 0.6, fade: true, grow: 1.6 });
    this.trimParticles();
  }

  trimParticles() {
    while (this.particles.length > 90) {
      const p = this.particles.shift();
      this.scene.remove(p.mesh);
      if (p.mesh.geometry) p.mesh.geometry.dispose();
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 10 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.grow) p.mesh.scale.multiplyScalar(1 + dt * p.grow);
      if (p.fade && p.mesh.material) p.mesh.material.opacity = Math.max(0, p.mesh.material.opacity - dt * 1.4);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }


}

const game = new Game();

game.init();
