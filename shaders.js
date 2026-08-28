/* ─────────────────────────────────────────────────────────────
   Magic Mirror — GLSL ES 3.00
   video → ingest → temporal EMA → motion field
         → [blur] → diffusion → [blur] → noise/vignette → display
   ───────────────────────────────────────────────────────────── */
const SH = {};

SH.vert = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const RAND = `
uint pcg(uint v){
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float rf(inout uint st){ st = pcg(st); return float(st) * 2.3283064365386963e-10; }
`;

const FLOW = `
float vhash(vec2 ip){
  uint h = pcg(uint(ip.x + 4096.0) + 374761393u * pcg(uint(ip.y + 4096.0)));
  return float(h) * 2.3283064365386963e-10;
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(vhash(i), vhash(i + vec2(1.0,0.0)), f.x),
             mix(vhash(i + vec2(0.0,1.0)), vhash(i + vec2(1.0,1.0)), f.x), f.y);
}
vec2 curl2(vec2 p){
  const float e = 0.035;
  float a = vnoise(p + vec2(0.0,e)), b = vnoise(p - vec2(0.0,e));
  float c = vnoise(p + vec2(e,0.0)), d = vnoise(p - vec2(e,0.0));
  return vec2(a - b, d - c) / (2.0 * e);
}
vec2 rot2(vec2 v, float a){ float s = sin(a), c = cos(a); return vec2(v.x*c - v.y*s, v.x*s + v.y*c); }
`;

/* ── 1 · ingest: mirror + cover-crop + colour ── */
SH.ingest = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc;
uniform vec2  uCrop, uOff;
uniform float uMirror;
uniform float uHue, uSat, uLight, uContrast;
vec3 hueRot(vec3 c, float a){
  const vec3 k = vec3(0.57735027);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
void main(){
  vec2 uv = vUv;
  if (uMirror > 0.5) uv.x = 1.0 - uv.x;
  uv = uOff + uv * uCrop;
  vec3 c = texture(uSrc, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
  c = hueRot(c, uHue);
  float l = dot(clamp(c,0.0,1.0), vec3(0.2126,0.7152,0.0722));
  c = mix(vec3(l), c, uSat);
  c = uLight >= 0.0 ? mix(c, vec3(1.0), uLight) : c * (1.0 + uLight);
  c = (c - 0.5) * (1.0 + uContrast) + 0.5;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/* ── 2 · motion-adaptive temporal EMA — the thing that makes a live feed steady.
   Static pixels are heavily averaged (kills sensor noise, so the grain sits
   still); moving pixels admit the new frame immediately (no smear) unless
   uTrail deliberately asks for ghosting. Motion is one frame stale, which is
   invisible and breaks the circular dependency. */
SH.ema = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uCur, uPrev, uMot;
uniform float uAlpha;        // admittance for STATIC pixels
uniform float uTrail;        // 0 crisp motion … 1 full ghosting
void main(){
  vec3 cur = texture(uCur, vUv).rgb;
  vec3 prv = texture(uPrev, vUv).rgb;
  float mo = clamp(texture(uMot, vUv).r, 0.0, 1.0);
  float a = mix(clamp(uAlpha, 0.0, 1.0), 1.0, mo * (1.0 - uTrail));
  o = vec4(mix(prv, cur, a), 1.0);
}`;

/* ── 3 · motion energy (quarter res, 5-tap smoothed, decaying) ── */
SH.motion = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uCur, uSmooth, uPrev;
uniform vec2  uTexel;
uniform float uGain, uThresh, uDecay;
float diffAt(vec2 uv){
  vec3 a = texture(uCur, uv).rgb;
  vec3 b = texture(uSmooth, uv).rgb;
  return length(a - b);
}
void main(){
  float m = diffAt(vUv) * 0.4
          + (diffAt(vUv + vec2(uTexel.x, 0.0)) + diffAt(vUv - vec2(uTexel.x, 0.0))
          +  diffAt(vUv + vec2(0.0, uTexel.y)) + diffAt(vUv - vec2(0.0, uTexel.y))) * 0.15;
  m = max(0.0, m - uThresh) * uGain;
  float prev = texture(uPrev, vUv).r * uDecay;
  o = vec4(max(m, prev), 0.0, 0.0, 1.0);
}`;

/* ── 4 · diffusion ── */
SH.diffuse = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc, uMot;
uniform vec2  uRes;
uniform float uAspect;
uniform vec2  uOrigin;
uniform float uInner, uFeather, uCurve;
uniform float uRadius, uSpread, uAngle, uDirBias, uDisp, uGrain;
uniform int   uSamples;
uniform float uLumaW, uSatW, uMotionAmt;
uniform uint  uSeed;
uniform int   uDrift;
uniform float uTime, uRate, uFlow, uFlowScale, uSwirl;
${RAND}
${FLOW}
void main(){
  vec4 c0 = texture(uSrc, vUv);

  vec2  d = vec2((vUv.x - uOrigin.x) * uAspect, vUv.y - uOrigin.y);
  float dist = length(d);
  float t = clamp((dist - uInner) / max(uFeather, 1e-4), 0.0, 1.0);
  float mask = pow(t, uCurve);

  float luma = dot(c0.rgb, vec3(0.2126,0.7152,0.0722));
  float mx = max(max(c0.r,c0.g),c0.b), mn = min(min(c0.r,c0.g),c0.b);
  float sat = mx <= 1e-5 ? 0.0 : (mx - mn) / mx;
  float wgt = 1.0;
  wgt *= uLumaW >= 0.0 ? mix(1.0, luma, uLumaW) : mix(1.0, 1.0 - luma, -uLumaW);
  wgt *= uSatW  >= 0.0 ? mix(1.0, sat,  uSatW ) : mix(1.0, 1.0 - sat,  -uSatW );

  /* local motion energy steers the dissolve */
  float mo = clamp(texture(uMot, vUv).r, 0.0, 1.0);
  wgt *= uMotionAmt >= 0.0 ? mix(1.0, mo, uMotionAmt) : mix(1.0, 1.0 - mo, -uMotionAmt);

  float R = uRadius * mask * wgt;
  if (R < 0.35 || uSamples < 1){ o = c0; return; }

  vec2 rad  = dist > 1e-6 ? d / dist : vec2(0.0, 1.0);
  vec2 dirV = vec2(cos(uAngle), sin(uAngle));

  vec2 cell = floor(gl_FragCoord.xy / max(uGrain, 0.5));
  uint base = pcg(uint(cell.x) + 1013904223u * pcg(uint(cell.y) + uSeed));

  float flowAng = 0.0;
  if (uDrift == 1 && uFlow != 0.0){
    float th = 6.28318530718 * fract(uTime * 0.037);
    vec2 adv = uSwirl * vec2(cos(th), sin(th));
    vec2 q = vec2(vUv.x * uAspect, vUv.y) * uFlowScale + 64.0;
    vec2 v = curl2(q + adv) + 0.5 * curl2(q * 2.7 - adv * 1.4);
    flowAng = uFlow * clamp(v.x + v.y, -3.0, 3.0);
  }

  vec4  acc  = vec4(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 64; i++){
    if (i >= uSamples) break;
    uint st = pcg(base + uint(i) * 2654435761u);
    float a     = rf(st) * 6.28318530718;
    float birth = rf(st);
    vec2  rnd   = vec2(cos(a), sin(a));

    float life = birth;
    float env  = 1.0;
    if (uDrift == 1){
      life = fract(birth + uTime * uRate);
      env  = 1.0 - smoothstep(0.72, 1.0, life);
    }
    float rr = pow(life, uDisp);

    vec2 dir = mix(rnd, -rad, uSpread);
    dir = mix(dir, -dirV, uDirBias);
    float dl = length(dir);
    dir = dl > 1e-5 ? dir / dl : rnd;
    if (flowAng != 0.0) dir = rot2(dir, flowAng * (0.35 + 0.65 * life));

    vec2 off = dir * (rr * R);
    vec2 suv = clamp(vUv + vec2(off.x / uRes.x, off.y / uRes.y), vec2(0.0), vec2(1.0));
    acc  += env * texture(uSrc, suv);
    wsum += env;
  }
  if (wsum < 1e-5){ o = c0; return; }
  o = vec4(acc.rgb / wsum, 1.0);
}`;

/* ── 5 · blur helpers ── */
SH.down4 = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uTexel;
void main(){
  o = (texture(uSrc, vUv + vec2(-0.5,-0.5)*uTexel) + texture(uSrc, vUv + vec2(0.5,-0.5)*uTexel)
     + texture(uSrc, vUv + vec2(-0.5, 0.5)*uTexel) + texture(uSrc, vUv + vec2(0.5, 0.5)*uTexel)) * 0.25;
}`;

SH.blur = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uStep; uniform float uSigma;
void main(){
  float sig = max(uSigma, 1e-3);
  int taps = int(min(ceil(sig * 3.0), 64.0));
  vec4 acc = texture(uSrc, vUv);
  float wsum = 1.0;
  for (int i = 1; i <= 64; i++){
    if (i > taps) break;
    float fi = float(i);
    float w = exp(-0.5 * fi * fi / (sig * sig));
    acc += w * (texture(uSrc, vUv + uStep*fi) + texture(uSrc, vUv - uStep*fi));
    wsum += 2.0 * w;
  }
  o = acc / wsum;
}`;

/* ── 6 · aura (gradient-map + drifting field) + noise + vignette ── */
SH.finish = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc;
uniform float uAmount, uScale, uColorMix;
uniform int   uBlend;
uniform uint  uSeed;
uniform float uVig, uVigSoft, uAspect;
uniform vec3  uBg;
/* aura */
uniform float uAuraAmt;    // 0…1 overall aura mix
uniform float uKeep;       // 0…1 how much the sharp core keeps true colour
uniform vec2  uOrigin;
uniform float uInner, uFeather, uCurve;
uniform vec3  uC1, uC2, uC3;   // walked ramp stops (shadow / mid / highlight)
uniform float uFieldW;         // 0 luma-map … 1 pure spatial field
uniform float uFieldScale;
uniform vec4  uPh;             // walked phases/directions from JS
${RAND}
vec3 ramp3(float t){
  t = clamp(t, 0.0, 1.0);
  return t < 0.5 ? mix(uC1, uC2, t * 2.0) : mix(uC2, uC3, t * 2.0 - 1.0);
}
void main(){
  vec3 c = texture(uSrc, vUv).rgb;

  if (uAuraAmt > 0.001){
    /* same falloff mask as the diffusion — sharp core stays true colour */
    vec2  d = vec2((vUv.x - uOrigin.x) * uAspect, vUv.y - uOrigin.y);
    float m = pow(clamp((length(d) - uInner) / max(uFeather, 1e-4), 0.0, 1.0), uCurve);

    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    /* slow organic field: two drifting sine waves, phases walked in JS */
    vec2 p = vec2(vUv.x * uAspect, vUv.y) * uFieldScale;
    float field = 0.5 + 0.35 * sin(p.x * cos(uPh.z) + p.y * sin(uPh.z) + uPh.x)
                      + 0.15 * sin(p.x * sin(uPh.w) - p.y * cos(uPh.w) + uPh.y);
    vec3 aura = ramp3(mix(luma, clamp(field, 0.0, 1.0), uFieldW));

    float mixAmt = uAuraAmt * mix(1.0, m, uKeep);
    c = mix(c, aura, mixAmt);
  }
  if (uAmount > 0.0){
    vec2 cell = floor(gl_FragCoord.xy / max(uScale, 0.5));
    uint st = pcg(uint(cell.x) + 2246822519u * pcg(uint(cell.y) + uSeed));
    float m = rf(st);
    vec3 rgb = vec3(rf(st), rf(st), rf(st));
    vec3 n = mix(vec3(m), rgb, uColorMix);
    if (uBlend == 0) c += (n - 0.5) * uAmount;
    else {
      vec3 lo = 2.0 * c * n, hi = 1.0 - 2.0 * (1.0 - c) * (1.0 - n);
      c = mix(c, mix(lo, hi, step(vec3(0.5), c)), uAmount);
    }
  }
  if (uVig > 0.0){
    float r = length((vUv - 0.5) * vec2(uAspect, 1.0)) / (0.5 * length(vec2(uAspect, 1.0)));
    c = mix(c, uBg, smoothstep(1.0 - uVigSoft, 1.0, r) * uVig);
  }
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

SH.copy = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc;
void main(){ o = texture(uSrc, vUv); }`;
