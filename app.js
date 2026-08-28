/* ═══════════════════════════════════════════════════════════════
   Magic Mirror · RetailClub
   Live webcam → temporally stabilised diffusion. WebGL2, all local.
   ═══════════════════════════════════════════════════════════════ */
(() => {
'use strict';

const $ = (id) => document.getElementById(id);
const canvas  = $('gl');
const stage   = $('stage');
const wrap    = $('canvasWrap');
const overlay = $('overlay');
const video   = $('video');
const statusEl= $('status');
const stripEl = $('tbStrip');
const metaEl  = $('camMeta');
const toasts  = $('toasts');

/* ─────────── parameters ───────────
   spatial:true → px at a 1000px-tall frame, so a look holds
   its proportions on any screen the mirror is shown on.        */
const SPEC = [
  { host:'secSteady', items:[
    { k:'stability',   label:'Temporal smoothing', min:0, max:100, step:1, def:74, unit:'%' },
    { k:'trail',       label:'Ghost trail',        min:0, max:100, step:1, def:0, unit:'%' },
    { k:'motionAmt',   label:'Motion response',    min:-100, max:100, step:1, def:0, unit:'%' },
    { k:'motionGain',  label:'Motion gain',        min:50, max:1500, step:10, def:420, unit:'%' },
    { k:'motionThresh',label:'Motion floor',       min:0, max:40, step:1, def:7, unit:'' },
    { k:'motionHold',  label:'Motion hold',        min:0, max:100, step:1, def:55, unit:'%' },
    { k:'originEase',  label:'Origin follow lag',  min:0, max:99, step:1, def:88, unit:'%' },
  ]},
  { host:'secDiffusion', items:[
    { k:'dissolve',   label:'Dissolve · master',  min:0, max:100, step:1, def:100, unit:'%' },
    { k:'intensity',  label:'Intensity',          min:0, max:400, step:1, def:70, spatial:true },
    { k:'spread',     label:'Spread · outward',   min:0, max:100, step:1, def:55, unit:'%' },
    { k:'angle',      label:'Direction',          min:0, max:360, step:1, def:90, unit:'°' },
    { k:'dirBias',    label:'Directional bias',   min:0, max:100, step:1, def:0, unit:'%' },
    { k:'dispersion', label:'Dispersion',         min:0, max:100, step:1, def:60, unit:'%' },
    { k:'grain',      label:'Grain · particle',   min:0.5, max:20, step:0.5, def:2.5, spatial:true },
    { k:'samples',    label:'Samples',            min:1, max:48, step:1, def:8, unit:'×' },
  ]},
  { host:'secOrigin', items:[
    { k:'ox',      label:'Origin X',      min:0, max:100, step:0.5, def:50, unit:'%' },
    { k:'oy',      label:'Origin Y',      min:0, max:100, step:0.5, def:45, unit:'%' },
    { k:'inner',   label:'Inner radius',  min:0, max:150, step:0.5, def:14, unit:'%' },
    { k:'feather', label:'Feather',       min:1, max:200, step:0.5, def:55, unit:'%' },
    { k:'curve',   label:'Falloff curve', min:15, max:400, step:5, def:120, unit:'γ' },
  ]},
  { host:'secAura', items:[
    { k:'aura',           label:'Aura amount',       min:0, max:100, step:1, def:60, unit:'%' },
    { k:'auraKeep',       label:'True-colour core',  min:0, max:100, step:1, def:80, unit:'%' },
    { k:'auraField',      label:'Luma → field',      min:0, max:100, step:1, def:45, unit:'%' },
    { k:'auraFieldScale', label:'Field scale',       min:0.5, max:8, step:0.1, def:1.6, unit:'' },
    { k:'auraSpeed',      label:'Drift speed',       min:0, max:100, step:1, def:40, unit:'%' },
    { k:'auraChroma',     label:'Vividness',         min:0, max:100, step:1, def:70, unit:'%' },
  ]},
  { host:'secWeight', items:[
    { k:'lumaW', label:'Luminance weight',  min:-100, max:100, step:1, def:0, unit:'%' },
    { k:'satW',  label:'Saturation weight', min:-100, max:100, step:1, def:0, unit:'%' },
  ]},
  { host:'secDrift', items:[
    { k:'driftRate', label:'Drift speed', min:2, max:200, step:1, def:30, unit:'' },
    { k:'flow',      label:'Curl flow',   min:0, max:100, step:1, def:35, unit:'%' },
    { k:'flowScale', label:'Flow scale',  min:1, max:40, step:1, def:9, unit:'' },
    { k:'swirl',     label:'Flow drift',  min:0, max:100, step:1, def:40, unit:'%' },
  ]},
  { host:'secBlur', items:[
    { k:'blurSigma', label:'Blur radius · σ', min:0, max:60, step:0.5, def:0, spatial:true },
  ]},
  { host:'secNoise', items:[
    { k:'noiseAmount', label:'Amount',     min:0, max:100, step:1, def:0, unit:'%' },
    { k:'noiseScale',  label:'Grain size', min:0.5, max:20, step:0.5, def:1.5, spatial:true },
    { k:'noiseColor',  label:'Mono → RGB', min:0, max:100, step:1, def:0, unit:'%' },
  ]},
  { host:'secColor', items:[
    { k:'hue',      label:'Hue',        min:-180, max:180, step:1, def:0, unit:'°' },
    { k:'sat',      label:'Saturation', min:0, max:300, step:1, def:100, unit:'%' },
    { k:'light',    label:'Lightness',  min:-100, max:100, step:1, def:0, unit:'%' },
    { k:'contrast', label:'Contrast',   min:-100, max:100, step:1, def:0, unit:'%' },
  ]},
  { host:'secStage', items:[
    { k:'vignette', label:'Edge fade',      min:0, max:100, step:1, def:0, unit:'%' },
    { k:'vigSoft',  label:'Edge softness',  min:5, max:100, step:1, def:55, unit:'%' },
  ]},
];
const SEGS = { source:0, mirror:1, originMode:0, drift:0, blurOrder:0, noiseBlend:0, renderScale:1 };
const FIELDS = { bg:'#000000', aspect:'0' };

const P = {}, DEF = {}, ITEM = {};
SPEC.forEach(s => s.items.forEach(i => { DEF[i.k] = i.def; P[i.k] = i.def; ITEM[i.k] = i; }));
Object.entries(SEGS).forEach(([k,v]) => { DEF[k] = v; P[k] = v; });
Object.entries(FIELDS).forEach(([k,v]) => { DEF[k] = v; P[k] = v; });
DEF.seed = 1; P.seed = 1;

/* ═══════════════ WebGL ═══════════════ */
/* preserveDrawingBuffer so Snapshot can read the canvas outside the frame callback */
const gl = canvas.getContext('webgl2', { alpha:false, antialias:false, depth:false, stencil:false, preserveDrawingBuffer:true });
if (!gl) { document.body.innerHTML = '<div style="padding:40px;font-family:monospace">WEBGL2 UNAVAILABLE</div>'; return; }

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s), src); throw new Error('compile'); }
  return s;
}
function program(frag) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, SH.vert));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); throw new Error('link'); }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = { loc: gl.getUniformLocation(p, info.name), type: info.type }; }
  return { p, u };
}
const PR = {
  ingest: program(SH.ingest), ema: program(SH.ema), motion: program(SH.motion),
  diffuse: program(SH.diffuse), down4: program(SH.down4), blur: program(SH.blur),
  finish: program(SH.finish), copy: program(SH.copy),
};

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

function setU(prog, vals) {
  for (const key in vals) {
    const u = prog.u[key]; if (!u) continue;
    const v = vals[key];
    switch (u.type) {
      case gl.FLOAT:        gl.uniform1f(u.loc, v); break;
      case gl.FLOAT_VEC2:   gl.uniform2f(u.loc, v[0], v[1]); break;
      case gl.FLOAT_VEC3:   gl.uniform3f(u.loc, v[0], v[1], v[2]); break;
      case gl.FLOAT_VEC4:   gl.uniform4f(u.loc, v[0], v[1], v[2], v[3]); break;
      case gl.INT: case gl.SAMPLER_2D: gl.uniform1i(u.loc, v); break;
      case gl.UNSIGNED_INT: gl.uniform1ui(u.loc, v >>> 0); break;
    }
  }
}
function draw(prog, dst, tex, vals) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
  gl.viewport(0, 0, dst ? dst.w : canvas.width, dst ? dst.h : canvas.height);
  gl.useProgram(prog.p);
  const units = {};
  let i = 0;
  for (const name in tex) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[name]); units[name] = i++; }
  setU(prog, Object.assign(units, vals));
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return dst ? dst.tex : null;
}

/* An 8-bit EMA with a small alpha DEAD-BANDS: prev + a*(cur-prev) rounds back to
   prev unless |cur-prev| > 1/a levels, so the history buffer freezes instead of
   smoothing. Half-float history is what makes long time constants actually work. */
const FLOAT_OK = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));

function makeFbo(w, h, float) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (float && FLOAT_OK) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { fb, tex, w, h };
}
/* short-lived buffers, keyed by slot+size */
const pool = new Map();
let renderGen = 0;
function getFbo(slot, w, h) {
  const key = `${slot}:${w}x${h}`;
  let f = pool.get(key);
  if (!f) { f = makeFbo(w, h); f.key = key; pool.set(key, f); }
  f.gen = renderGen;
  return f;
}
function sweepPool() {
  for (const [key, f] of pool) {
    if (renderGen - (f.gen ?? 0) > 4) { gl.deleteTexture(f.tex); gl.deleteFramebuffer(f.fb); pool.delete(key); }
  }
}

/* persistent history — must survive across frames, never pooled */
let BUF = null;
function ensureBuffers(w, h) {
  if (BUF && BUF.w === w && BUF.h === h) return false;
  if (BUF) [...BUF.hist, ...BUF.mot].forEach(f => { gl.deleteTexture(f.tex); gl.deleteFramebuffer(f.fb); });
  const mw = Math.max(2, Math.round(w / 4)), mh = Math.max(2, Math.round(h / 4));
  BUF = { w, h, mw, mh,
    hist: [makeFbo(w, h, true), makeFbo(w, h, true)],
    mot:  [makeFbo(mw, mh, true), makeFbo(mw, mh, true)], hi: 0, mi: 0 };
  return true;
}

/* source texture (video or test canvas) */
const srcTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, srcTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
let texW = 0, texH = 0;
function uploadSource(el, w, h) {
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  if (w !== texW || h !== texH) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, el); texW = w; texH = h; }
  else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, el);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
}

/* ═══════════════ source: camera / test pattern ═══════════════ */
let stream = null, camReady = false, camLabel = '';
let restartTimer = 0;

async function listCameras() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    const sel = $('camPick'), cur = sel.value;
    sel.innerHTML = '<option value="">Default camera</option>' +
      devs.map((d, i) => `<option value="${d.deviceId}">${(d.label || `Camera ${i + 1}`).replace(/</g, '')}</option>`).join('');
    if (cur) sel.value = cur;
  } catch (e) {}
}
async function startCamera(deviceId) {
  if (!navigator.mediaDevices?.getUserMedia) { toast('This browser has no camera API.', true); return; }
  busy('REQUESTING CAMERA');
  stopCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: Object.assign(
        { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 }, facingMode: 'user' },
        deviceId ? { deviceId: { exact: deviceId } } : {}),
    });
    video.srcObject = stream;
    await video.play();
    const track = stream.getVideoTracks()[0];
    camLabel = track.label || 'camera';
    camReady = true;
    track.addEventListener('ended', scheduleRestart);
    await listCameras();
    setParam('source', 0);
    $('empty').classList.add('hide'); wrap.classList.add('on');
    $('btnStart').textContent = 'Restart camera';
    idle();
  } catch (e) {
    console.error(e);
    camReady = false;
    err(e.name === 'NotAllowedError' ? 'CAMERA BLOCKED' : 'CAMERA FAILED');
    toast(e.name === 'NotAllowedError'
      ? 'Camera permission denied — allow it in the address bar, then press Start again.'
      : `Could not open the camera (${e.name}). Try the Test pattern input.`, true);
  }
}
function stopCamera() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  camReady = false;
}
function scheduleRestart() {
  if (restartTimer) return;
  camReady = false;
  err('CAMERA LOST');
  restartTimer = setTimeout(() => { restartTimer = 0; startCamera($('camPick').value || undefined); }, 1500);
}
async function lockExposure() {
  const track = stream?.getVideoTracks?.()[0];
  if (!track?.getCapabilities) { toast('This camera does not expose manual controls.', true); return; }
  const caps = track.getCapabilities();
  const adv = [];
  if (caps.exposureMode?.includes('manual')) adv.push({ exposureMode: 'manual' });
  if (caps.whiteBalanceMode?.includes('manual')) adv.push({ whiteBalanceMode: 'manual' });
  if (caps.focusMode?.includes('manual')) adv.push({ focusMode: 'manual' });
  if (!adv.length) { toast('Camera has no manual exposure / white balance.', true); return; }
  try { await track.applyConstraints({ advanced: adv }); toast('Exposure and white balance locked.'); }
  catch (e) { toast('Camera refused the lock request.', true); }
}

/* test pattern — a moving stand-in so the pipeline can be tuned without a camera */
const testCv = document.createElement('canvas');
testCv.width = 1280; testCv.height = 720;
const tcx = testCv.getContext('2d');
function drawTest(t) {
  const W = testCv.width, H = testCv.height;
  const g = tcx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#123049'); g.addColorStop(1, '#0d1a26');
  tcx.fillStyle = g; tcx.fillRect(0, 0, W, H);
  const cx = W / 2 + Math.sin(t * 0.25) * 80;      // person-paced, not frantic
  const cy = H * 0.62 + Math.sin(t * 0.4) * 14;
  tcx.fillStyle = '#e8c9a8';
  tcx.beginPath(); tcx.ellipse(cx, cy - 190, 74, 92, 0, 0, 7); tcx.fill();
  tcx.fillStyle = '#d23c30';
  tcx.beginPath();
  tcx.moveTo(cx - 130, H); tcx.quadraticCurveTo(cx - 118, cy - 96, cx, cy - 108);
  tcx.quadraticCurveTo(cx + 118, cy - 96, cx + 130, H); tcx.closePath(); tcx.fill();
  tcx.fillStyle = 'rgba(255,255,255,.10)';
  for (let i = 0; i < 3; i++) {
    const bx = (W * (0.2 + i * 0.3) + t * 14 * (i + 1)) % (W + 200) - 100;
    tcx.beginPath(); tcx.arc(bx, H * (0.25 + i * 0.11), 46 + i * 12, 0, 7); tcx.fill();
  }
  /* full-frame sensor noise, so temporal smoothing has something real to fight */
  tcx.save();
  tcx.globalAlpha = 0.09;
  const ox = -Math.floor(Math.random() * 256), oy = -Math.floor(Math.random() * 256);
  for (let x = ox; x < W; x += 256) for (let y = oy; y < H; y += 256) tcx.drawImage(noiseTile, x, y);
  tcx.restore();
}
const noiseTile = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const im = x.createImageData(256, 256);
  for (let i = 0; i < im.data.length; i += 4) {
    const v = 90 + Math.random() * 76;
    im.data[i] = im.data[i+1] = im.data[i+2] = v; im.data[i+3] = 255;
  }
  x.putImageData(im, 0, 0);
  return c;
})();

/* ═══════════════ layout ═══════════════ */
let RW = 0, RH = 0;
function layout() {
  const pad = document.body.classList.contains('present') ? 0 : 20;
  const bw = Math.max(80, stage.clientWidth - pad * 2);
  const bh = Math.max(80, stage.clientHeight - pad * 2);
  const ar = +P.aspect || 0;
  let cssW = bw, cssH = bh;
  if (ar > 0) { if (bw / bh > ar) cssW = Math.round(bh * ar); else cssH = Math.round(bw / ar); }
  wrap.style.width = cssW + 'px'; wrap.style.height = cssH + 'px';
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * (+P.renderScale || 1);
  RW = Math.max(2, Math.round(cssW * dpr));
  RH = Math.max(2, Math.round(cssH * dpr));
  canvas.width = RW; canvas.height = RH;
}

/* ═══════════════ aura colour walk (OKLCH, unrestricted rainbow) ═══════════════ */
function oklchToRgb(L, C, hDeg) {
  for (let k = 0; k < 8; k++) {           // gamut clip by chroma reduction
    const h = hDeg * Math.PI / 180;
    const a = C * Math.cos(h), b2 = C * Math.sin(h);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b2;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b2;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b2;
    const l3 = l_ ** 3, m3 = m_ ** 3, s3 = s_ ** 3;
    let r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
    let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
    let b = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
    if (r >= -0.001 && r <= 1.001 && g >= -0.001 && g <= 1.001 && b >= -0.001 && b <= 1.001) {
      const t = (x) => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; };
      return [t(r), t(g), t(b)];
    }
    C *= 0.82;
  }
  return oklchToRgb(L, 0, hDeg);
}
/* Ornstein–Uhlenbeck walk: drifts forever, never jumps, never repeats exactly */
const walk = {
  hue: Math.random() * 360, hueV: 4,
  spread1: 55, spread2: 120, s1V: 0, s2V: 0,
  ph: [Math.random() * 6, Math.random() * 6, Math.random() * 6, Math.random() * 6],
  phV: [0.05, -0.04, 0.01, -0.008],
};
function stepWalk(dt) {
  const speed = P.auraSpeed / 100;                     // 1 ≈ full circle ~45s, 0.4 ≈ ~110s
  const g = () => (Math.random() * 2 - 1);
  walk.hueV += (g() * 14 * speed - walk.hueV * 0.25) * dt;
  walk.hueV = clamp(walk.hueV, -16 * speed - 1, 16 * speed + 1);
  walk.hue = (walk.hue + walk.hueV * dt * 60 * 0.14 * (0.3 + speed) + 360) % 360;
  walk.s1V += (g() * 8 - walk.s1V * 0.4) * dt;
  walk.s2V += (g() * 8 - walk.s2V * 0.4) * dt;
  walk.spread1 = clamp(walk.spread1 + walk.s1V * dt * 8, 30, 90);
  walk.spread2 = clamp(walk.spread2 + walk.s2V * dt * 8, 90, 180);
  for (let i = 0; i < 4; i++) {
    walk.phV[i] += (g() * 0.05 - walk.phV[i] * 0.1) * dt;
    walk.ph[i] += walk.phV[i] * dt * (0.5 + speed) * (i < 2 ? 6 : 1.2);
  }
}
function auraStops() {
  const C = 0.04 + (P.auraChroma / 100) * 0.23;
  return [
    oklchToRgb(0.45, C, walk.hue),
    oklchToRgb(0.70, C * 1.05, walk.hue + walk.spread1),
    oklchToRgb(0.88, C * 0.8, walk.hue + walk.spread2),
  ];
}

/* ═══════════════ render loop ═══════════════ */
let last = performance.now(), clock = 0, fpsEMA = 60, frameNo = 0;
let originNow = { x: 0.5, y: 0.55 }, originTarget = { x: 0.5, y: 0.55 };
let motionLevel = 0;
const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt;
  fpsEMA += ((dt > 0 ? 1 / dt : 60) - fpsEMA) * 0.05;
  frameNo++;

  const testing = +P.source === 1;
  if (!testing && !camReady) return;
  if (!wrap.classList.contains('on')) { wrap.classList.add('on'); $('empty').classList.add('hide'); }

  let sw, sh;
  if (testing) { drawTest(clock); uploadSource(testCv, testCv.width, testCv.height); sw = testCv.width; sh = testCv.height; }
  else {
    if (video.readyState < 2 || !video.videoWidth) return;
    uploadSource(video, video.videoWidth, video.videoHeight);
    sw = video.videoWidth; sh = video.videoHeight;
  }

  if (RW < 2) layout();
  renderGen++;
  const fresh = ensureBuffers(RW, RH);
  const S = RH / 1000;
  const d = P.dissolve / 100;

  /* 1 · ingest: mirror, cover-crop, colour */
  const va = sw / sh, ta = RW / RH;
  const crop = va > ta ? [ta / va, 1] : [1, va / ta];
  const off = [(1 - crop[0]) / 2, (1 - crop[1]) / 2];
  const CUR = getFbo('CUR', RW, RH);
  draw(PR.ingest, CUR, { uSrc: srcTex }, {
    uCrop: crop, uOff: off, uMirror: +P.mirror ? 1 : 0,
    uHue: P.hue * Math.PI / 180, uSat: P.sat / 100, uLight: P.light / 100, uContrast: P.contrast / 100,
  });

  /* 2 · temporal EMA — frame-rate independent time constant */
  if (fresh) { draw(PR.copy, BUF.hist[0], { uSrc: CUR.tex }, {}); draw(PR.copy, BUF.hist[1], { uSrc: CUR.tex }, {}); }
  const tauS = Math.pow(P.stability / 100, 2) * 2.5;
  let alpha = tauS <= 0.001 ? 1 : 1 - Math.exp(-dt / tauS);
  if (!FLOAT_OK) alpha = Math.max(alpha, 0.02);      // 8-bit fallback: stay out of the dead band
  const prevH = BUF.hist[BUF.hi], nextH = BUF.hist[1 - BUF.hi];
  draw(PR.ema, nextH, { uCur: CUR.tex, uPrev: prevH.tex, uMot: BUF.mot[BUF.mi].tex },
    { uAlpha: alpha, uTrail: P.trail / 100 });
  BUF.hi = 1 - BUF.hi;

  /* 3 · motion energy */
  const tauM = Math.pow(P.motionHold / 100, 2) * 3;
  const decay = tauM <= 0.001 ? 0 : Math.exp(-dt / tauM);
  const prevM = BUF.mot[BUF.mi], nextM = BUF.mot[1 - BUF.mi];
  draw(PR.motion, nextM, { uCur: CUR.tex, uSmooth: nextH.tex, uPrev: prevM.tex }, {
    uTexel: [1 / BUF.mw, 1 / BUF.mh],
    uGain: P.motionGain / 100, uThresh: P.motionThresh / 1000, uDecay: decay,
  });
  BUF.mi = 1 - BUF.mi;

  /* 4 · origin */
  if (frameNo % 6 === 0) sampleCentroid(nextM);   // also drives the motion meter for tuning
  if (+P.originMode === 0) originTarget = { x: 0.5, y: 1 - P.oy / 100 };
  else if (+P.originMode === 2) originTarget = { x: P.ox / 100, y: 1 - P.oy / 100 };
  const k = 1 - Math.pow(P.originEase / 100, Math.max(dt, 1e-3) * 60);
  originNow.x += (originTarget.x - originNow.x) * (+P.originMode === 1 ? k : 1);
  originNow.y += (originTarget.y - originNow.y) * (+P.originMode === 1 ? k : 1);

  /* 5 · optional blur before */
  let tex = nextH.tex;
  const sigma = P.blurSigma * S;
  if (sigma > 0.05 && +P.blurOrder === 1) tex = blurChain(tex, sigma, RW, RH);

  /* 6 · diffusion */
  const DIF = getFbo('DIF', RW, RH);
  draw(PR.diffuse, DIF, { uSrc: tex, uMot: BUF.mot[1 - BUF.mi].tex }, {
    uRes: [RW, RH], uAspect: RW / RH,
    uOrigin: [originNow.x, originNow.y],
    uInner: (1 - d) * 1.6 + d * (P.inner / 100),
    uFeather: P.feather / 100, uCurve: P.curve / 100,
    uRadius: P.intensity * S * d,
    uSpread: P.spread / 100, uAngle: P.angle * Math.PI / 180, uDirBias: P.dirBias / 100,
    uDisp: Math.max(0.05, 2.2 - P.dispersion * 0.02),
    uGrain: Math.max(0.5, P.grain * S),
    uSamples: Math.round(P.samples),
    uLumaW: P.lumaW / 100, uSatW: P.satW / 100, uMotionAmt: P.motionAmt / 100,
    uSeed: (P.seed * 2654435761) >>> 0,
    uDrift: +P.drift === 1 ? 1 : 0,
    uTime: clock, uRate: P.driftRate / 100,
    uFlow: P.flow / 100 * 2.2, uFlowScale: P.flowScale, uSwirl: P.swirl / 100 * 3,
  });
  tex = DIF.tex;

  /* 7 · optional blur after */
  if (sigma > 0.05 && +P.blurOrder !== 1) tex = blurChain(tex, sigma, RW, RH);

  /* 8 · aura + noise + vignette → screen */
  stepWalk(dt);
  const [C1, C2, C3] = auraStops();
  draw(PR.finish, null, { uSrc: tex }, {
    uAmount: P.noiseAmount / 100, uScale: Math.max(0.5, P.noiseScale * S),
    uColorMix: P.noiseColor / 100, uBlend: +P.noiseBlend,
    uSeed: ((P.seed * 40503) ^ 0x9e3779b9) >>> 0,
    uVig: P.vignette / 100, uVigSoft: P.vigSoft / 100, uAspect: RW / RH, uBg: hex2rgb(P.bg),
    uAuraAmt: P.aura / 100, uKeep: P.auraKeep / 100,
    uOrigin: [originNow.x, originNow.y],
    uInner: (1 - d) * 1.6 + d * (P.inner / 100),
    uFeather: P.feather / 100, uCurve: P.curve / 100,
    uC1: C1, uC2: C2, uC3: C3,
    uFieldW: P.auraField / 100, uFieldScale: P.auraFieldScale,
    uPh: walk.ph,
  });

  sweepPool();
  if (frameNo % 15 === 0) updateStrip();
  if (frameNo % 15 === 0 && !document.body.classList.contains('present')) drawOverlay();
}

function blurChain(inTex, sigmaPx, w0, h0) {
  let f = 1, levels = 0;
  while (sigmaPx / f > 6 && f < 32 && Math.min(w0, h0) / (f * 2) >= 8) { f *= 2; levels++; }
  let tex = inTex, w = w0, h = h0;
  for (let i = 0; i < levels; i++) {
    const nw = Math.max(1, Math.ceil(w / 2)), nh = Math.max(1, Math.ceil(h / 2));
    tex = draw(PR.down4, getFbo('D' + i, nw, nh), { uSrc: tex }, { uTexel: [1 / w, 1 / h] });
    w = nw; h = nh;
  }
  const sig = sigmaPx / f;
  tex = draw(PR.blur, getFbo('BH', w, h), { uSrc: tex }, { uStep: [1 / w, 0], uSigma: sig });
  tex = draw(PR.blur, getFbo('BV', w, h), { uSrc: tex }, { uStep: [0, 1 / h], uSigma: sig });
  return draw(PR.copy, getFbo('BU', w0, h0), { uSrc: tex }, {});
}

/* motion centroid — tiny readback, every 6th frame */
const CENT_W = 48, CENT_H = 27;
const centBuf = new Uint8Array(CENT_W * CENT_H * 4);
function sampleCentroid(motFbo) {
  const small = getFbo('CENT', CENT_W, CENT_H);
  draw(PR.copy, small, { uSrc: motFbo.tex }, {});
  gl.bindFramebuffer(gl.FRAMEBUFFER, small.fb);
  gl.readPixels(0, 0, CENT_W, CENT_H, gl.RGBA, gl.UNSIGNED_BYTE, centBuf);
  let sx = 0, sy = 0, tot = 0;
  for (let y = 0; y < CENT_H; y++) {
    for (let x = 0; x < CENT_W; x++) {
      const v = centBuf[(y * CENT_W + x) * 4];
      if (v < 12) continue;
      sx += v * (x + 0.5) / CENT_W; sy += v * (y + 0.5) / CENT_H; tot += v;
    }
  }
  motionLevel = tot / (CENT_W * CENT_H * 255);
  if (tot > 400 && +P.originMode === 1) originTarget = { x: sx / tot, y: sy / tot };
}

function updateStrip() {
  stripEl.textContent =
    `${RW}×${RH} · ${fpsEMA.toFixed(0)}FPS · SMOOTH ${P.stability}% (${(Math.pow(P.stability/100,2)*2.5).toFixed(2)}S) · ` +
    `MOTION ${(motionLevel * 100).toFixed(0)}% · SCATTER ${(P.intensity * RH / 1000).toFixed(0)}PX · ` +
    `GRAIN ${(P.grain * RH / 1000).toFixed(1)}PX · ORIGIN ${(originNow.x*100).toFixed(0)},${((1-originNow.y)*100).toFixed(0)}`;
}

/* ─────────── origin overlay ─────────── */
function drawOverlay() {
  if (+P.originMode === 3) { overlay.innerHTML = ''; return; }
  const bw = wrap.clientWidth, bh = wrap.clientHeight;
  const x = originNow.x * bw, y = (1 - originNow.y) * bh;
  const pxH = bh;
  const rIn = (P.inner / 100) * pxH, rOut = ((P.inner + P.feather) / 100) * pxH;
  const manual = +P.originMode === 2;
  overlay.innerHTML = `
    <circle cx="${x}" cy="${y}" r="${Math.max(.5, rIn)}" fill="none" stroke="#fff" stroke-width="1" stroke-opacity=".5"/>
    <circle cx="${x}" cy="${y}" r="${Math.max(.5, rOut)}" fill="none" stroke="#fff" stroke-width="1" stroke-dasharray="4 4" stroke-opacity=".3"/>
    <g class="${manual ? 'hit' : ''}" id="handle">
      <circle cx="${x}" cy="${y}" r="13" fill="#fff" fill-opacity=".01"/>
      <circle cx="${x}" cy="${y}" r="6" fill="none" stroke="#fff" stroke-width="1.5" stroke-opacity=".8"/>
      <circle cx="${x}" cy="${y}" r="1.5" fill="#fff"/>
    </g>`;
  if (manual) $('handle')?.addEventListener('pointerdown', startHandleDrag);
}
function startHandleDrag(e) {
  e.preventDefault();
  const move = (ev) => {
    const r = wrap.getBoundingClientRect();
    setParam('ox', +clamp((ev.clientX - r.left) / r.width * 100, 0, 100).toFixed(1));
    setParam('oy', +clamp((ev.clientY - r.top) / r.height * 100, 0, 100).toFixed(1));
    drawOverlay(); markLocal();
  };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); pushState(); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  move(e);
}

/* ═══════════════ UI ═══════════════ */
function fmt(item, v) {
  if (item.spatial) { const px = v * RH / 1000; return RH ? `${v} · ${px < 10 ? px.toFixed(1) : Math.round(px)}px` : `${v}`; }
  if (item.unit === 'γ') return (v / 100).toFixed(2);
  return `${v}${item.unit || ''}`;
}
const rangeEls = {};
function buildControls() {
  SPEC.forEach(sec => {
    const host = $(sec.host);
    sec.items.forEach(item => {
      const d = document.createElement('div');
      d.className = 'ctrl';
      d.innerHTML = `<div class="ctrl-top"><label for="r_${item.k}">${item.label}</label>
        <span class="ctrl-val" id="v_${item.k}"></span></div>
        <input type="range" id="r_${item.k}" min="${item.min}" max="${item.max}" step="${item.step}" value="${item.def}" />`;
      host.appendChild(d);
      const r = d.querySelector('input');
      rangeEls[item.k] = r;
      r.addEventListener('input', () => { setParam(item.k, +r.value, false); markLocal(); });
      r.addEventListener('change', () => { setParam(item.k, +r.value, false); pushState(); });
      r.addEventListener('dblclick', () => { setParam(item.k, item.def); pushState(); });
    });
  });
  document.querySelectorAll('.seg[data-param]').forEach(seg => {
    const key = seg.dataset.param;
    seg.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => {
      setParam(key, b.dataset.val);
      if (key === 'renderScale' || key === 'aspect') layout();
      if (key === 'source' && +P.source === 1) { $('empty').classList.add('hide'); wrap.classList.add('on'); }
      pushState();
    }));
  });
  $('bg').addEventListener('input', () => { setParam('bg', $('bg').value, false); markLocal(); });
  $('bg').addEventListener('change', pushState);
  $('aspect').addEventListener('change', () => { setParam('aspect', $('aspect').value, false); layout(); pushState(); });
}
function setParam(k, v, syncUi = true) {
  P[k] = (k === 'bg' || k === 'aspect' || k === 'renderScale') ? v : +v;
  if (rangeEls[k]) { if (syncUi) rangeEls[k].value = P[k]; $('v_' + k).textContent = fmt(ITEM[k], P[k]); }
  if (k === 'bg' && syncUi) $('bg').value = P.bg;
  if (k === 'aspect' && syncUi) $('aspect').value = P.aspect;
  document.querySelectorAll(`.seg[data-param="${k}"]`).forEach(seg =>
    seg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', String(b.dataset.val) === String(P[k]))));
}
function syncAllUi() { Object.keys(DEF).forEach(k => setParam(k, P[k])); }

/* ═══════════════ present mode ═══════════════ */
let wakeLock = null, cursorTimer = 0;
async function enterPresent() {
  document.body.classList.add('present');
  $('presentHint').hidden = false;
  try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) {}
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) {}
  layout();
  bumpCursor();
}
async function exitPresent() {
  document.body.classList.remove('present', 'hidecursor');
  $('presentHint').hidden = true;
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) {}
  try { await wakeLock?.release(); } catch (e) {}
  wakeLock = null;
  layout();
}
function bumpCursor() {
  document.body.classList.remove('hidecursor');
  clearTimeout(cursorTimer);
  if (document.body.classList.contains('present'))
    cursorTimer = setTimeout(() => document.body.classList.add('hidecursor'), 2500);
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && document.body.classList.contains('present')) exitPresent();
});
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && document.body.classList.contains('present') && !wakeLock) {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) {}
  }
});

/* ═══════════════ persistence ═══════════════ */
const LS_STATE = 'magicmirror-retailclub-state-v1';
const LS_LOOKS = 'magicmirror-retailclub-looks-v1';
const DB_COLLECTION = 'magicmirror_state_v1';
let coll = null, doc = null, syncLive = true, lastLocalEdit = 0, saveTimer = 0;

const snapshot = () => { const o = {}; Object.keys(DEF).forEach(k => o[k] = P[k]); return o; };
function applyParams(o) {
  Object.keys(DEF).forEach(k => { if (o[k] !== undefined) P[k] = o[k]; });
  syncAllUi(); layout();
}
function markLocal() { lastLocalEdit = performance.now(); }
function pushState() {
  markLocal();
  try { localStorage.setItem(LS_STATE, JSON.stringify(snapshot())); } catch (e) {}
  if (!syncLive || !coll || !doc) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { coll.update(doc.id, { params: snapshot() }).catch(() => {}); }, 450);
}
function loadLocal() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_STATE) || 'null');
    if (o) Object.keys(DEF).forEach(k => { if (o[k] !== undefined) P[k] = o[k]; });
  } catch (e) {}
}
async function waitForQuick(ms = 3000) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (window.quick?.db) return true; await new Promise(r => setTimeout(r, 120)); }
  return false;
}
async function initSync() {
  if (!(await waitForQuick())) { $('syncState').textContent = 'LOCAL'; return; }
  try {
    coll = window.quick.db.collection(DB_COLLECTION);
    const docs = await coll.list();
    doc = docs?.[0] || await coll.create({ app: 'magicmirror-retailclub', params: snapshot() });
    if (doc?.params) applyParams(doc.params);
    coll.subscribe?.((docs2) => {
      const d = docs2?.find(x => x.id === doc.id) || docs2?.[0];
      if (!d) return;
      doc = d;
      if (!syncLive) return;
      if (performance.now() - lastLocalEdit < 2500) return;   // don't fight a live edit
      if (d.params) applyParams(d.params);
    });
    $('syncState').textContent = 'SYNCED';
    $('syncState').classList.add('live');
  } catch (e) { console.warn(e); $('syncState').textContent = 'LOCAL'; }
}

/* looks */
const getLooks = () => { try { return JSON.parse(localStorage.getItem(LS_LOOKS) || '{}'); } catch (e) { return {}; } };
function setLooks(o) { try { localStorage.setItem(LS_LOOKS, JSON.stringify(o)); } catch (e) {} renderLooks(); }
const BUILTIN = {
  'RAINBOW AURA ▸': { aura:60, auraKeep:80, auraField:45, auraFieldScale:1.6, auraSpeed:40, auraChroma:70,
    stability:82, trail:0, motionAmt:20, dissolve:100, intensity:80, spread:55, dispersion:60, grain:2.5,
    samples:10, inner:14, feather:60, curve:120, drift:0, blurSigma:4, blurOrder:1, noiseAmount:5, vignette:40 },
  'STEADY VEIL': { stability:82, trail:0, motionAmt:0, dissolve:100, intensity:64, spread:52, dispersion:60, grain:2.5,
    samples:10, inner:16, feather:58, curve:120, lumaW:0, satW:15, drift:0, blurSigma:4, blurOrder:1,
    noiseAmount:5, vignette:35, motionHold:55 },
  'MOVE TO VANISH': { stability:80, trail:0, motionAmt:85, motionGain:520, motionHold:62, dissolve:100, intensity:150,
    spread:65, dispersion:60, grain:2, samples:10, inner:0, feather:90, curve:100, drift:0, blurSigma:2,
    noiseAmount:4, vignette:30 },
  'STILLNESS DISSOLVES': { stability:86, motionAmt:-85, motionGain:600, motionHold:70, dissolve:100, intensity:170,
    spread:70, dispersion:62, grain:2, samples:12, inner:0, feather:100, curve:110, drift:1, driftRate:22,
    flow:40, blurSigma:3, noiseAmount:4, vignette:35 },
  'SLOW GHOST': { stability:86, trail:80, motionAmt:0, motionHold:65, dissolve:100, intensity:90, spread:58,
    dispersion:60, grain:2.5, samples:12, inner:8, feather:70, curve:120, drift:0, blurSigma:4, blurOrder:1,
    noiseAmount:5, vignette:40 },
  'DUST PORTRAIT': { stability:88, trail:20, motionAmt:25, dissolve:100, intensity:110, spread:60, dispersion:65, grain:3,
    samples:14, inner:10, feather:70, curve:130, lumaW:12, satW:20, drift:1, driftRate:26, flow:45, flowScale:8,
    swirl:45, blurSigma:5, blurOrder:1, noiseAmount:6, vignette:45 },
};
function renderLooks() {
  const looks = Object.assign({}, BUILTIN, getLooks());
  const list = $('presetList'); list.innerHTML = '';
  Object.keys(looks).forEach(name => {
    const custom = !!getLooks()[name];
    const row = document.createElement('div');
    row.className = 'preset-row';
    row.innerHTML = `<button class="pr-name">${name}</button>` + (custom ? `<button class="pr-del">×</button>` : '');
    row.querySelector('.pr-name').addEventListener('click', () => { applyParams(looks[name]); pushState(); toast(`“${name}” applied.`); });
    row.querySelector('.pr-del')?.addEventListener('click', () => { const o = getLooks(); delete o[name]; setLooks(o); });
    list.appendChild(row);
  });
}

/* ═══════════════ snapshot ═══════════════ */
function snapshotPng() {
  const c = document.createElement('canvas');
  c.width = RW; c.height = RH;
  c.getContext('2d').drawImage(canvas, 0, 0);
  c.toBlob(b => {
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url; a.download = `magicmirror-${Date.now()}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }, 'image/png');
  toast('Snapshot saved.');
}

/* ═══════════════ chrome ═══════════════ */
function clamp(v, a, b) { return Math.min(Math.max(v, a), b); }
function busy(t) { statusEl.textContent = t; statusEl.className = 'tb-status busy'; }
function err(t) { statusEl.textContent = t; statusEl.className = 'tb-status err'; }
function idle() { statusEl.textContent = camReady ? 'LIVE' : 'READY'; statusEl.className = 'tb-status'; metaEl.textContent = camReady ? `${camLabel} · ${video.videoWidth}×${video.videoHeight}` : 'CAMERA OFF'; }
function toast(msg, warn) {
  const d = document.createElement('div');
  d.className = 'toast' + (warn ? ' warn' : '');
  d.innerHTML = '<span></span><button aria-label="Dismiss">×</button>';
  d.querySelector('span').textContent = msg;
  d.querySelector('button').addEventListener('click', () => d.remove());
  toasts.appendChild(d);
  setTimeout(() => d.remove(), 6000);
}

/* ═══════════════ wiring ═══════════════ */
buildControls();
loadLocal();
syncAllUi();
renderLooks();
layout();

$('btnStart').addEventListener('click', () => startCamera($('camPick').value || undefined));
$('camPick').addEventListener('change', () => { if (camReady) startCamera($('camPick').value || undefined); });
$('btnShot').addEventListener('click', snapshotPng);
$('btnSeed').addEventListener('click', () => { P.seed = 1 + Math.floor(Math.random() * 1e5); pushState(); });
$('btnReset').addEventListener('click', () => { applyParams(Object.assign({}, DEF, { seed: P.seed, source: P.source })); pushState(); toast('Reset.'); });
$('btnPresent').addEventListener('click', enterPresent);
$('segSync').querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => {
  syncLive = b.dataset.val === '1';
  $('segSync').querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('active', x === b));
  $('syncState').textContent = syncLive ? (coll ? 'SYNCED' : 'LOCAL') : 'SOLO';
  $('syncState').classList.toggle('live', syncLive && !!coll);
}));
$('btnPresetSave').addEventListener('click', () => {
  const name = ($('presetName').value || '').trim().toUpperCase();
  if (!name) { toast('Name the look first.', true); return; }
  const o = getLooks(); o[name] = snapshot(); setLooks(o);
  $('presetName').value = ''; toast(`“${name}” saved.`);
});
/* long-press the privacy line to attempt an exposure lock (booth setup aid) */
$('privacy').addEventListener('dblclick', lockExposure);

window.addEventListener('resize', () => layout());
window.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  if (e.key === 'p') document.body.classList.contains('present') ? exitPresent() : enterPresent();
  if (e.key === 'Escape' && document.body.classList.contains('present')) exitPresent();
  if (e.key === 's') snapshotPng();
  if (e.key === 'r') { P.seed = 1 + Math.floor(Math.random() * 1e5); pushState(); }
});
window.addEventListener('mousemove', bumpCursor);

if (new URLSearchParams(location.search).has('present')) {
  addEventListener('click', function once() { removeEventListener('click', once); enterPresent(); }, { once: true });
}
initSync();
navigator.mediaDevices?.addEventListener?.('devicechange', listCameras);
listCameras();
requestAnimationFrame(tick);
idle();

window.__mirror = {
  P, DEF, setParam, applyParams, snapshot, startCamera, layout, drawTest, testCv, FLOAT_OK,
  enterPresent, exitPresent, snapshotPng,
  get RW() { return RW; }, get RH() { return RH; },
  get fps() { return fpsEMA; }, get motionLevel() { return motionLevel; },
  get origin() { return { ...originNow }; },
  readScreen() {
    const b = new Uint8Array(RW * RH * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, RW, RH, gl.RGBA, gl.UNSIGNED_BYTE, b);
    return b;
  },
};
})();
