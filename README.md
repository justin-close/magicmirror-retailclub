# Magic Mirror · RetailClub

Live webcam → temporally stabilised diffusion effect. WebGL2, entirely client-side.
Spun off from `~/diffusion-shader/` (Diffusion Shader Studio).

- **Live:** https://magicmirror-retailclub.quick.shopify.io
- **Deploy:** `quick deploy . magicmirror-retailclub -f`
- **Local:** `python3 -m http.server 8902` (camera needs HTTPS or localhost)

## Pipeline
`video → ingest (mirror + cover-crop + colour) → motion-adaptive EMA → motion field
      → [blur] → diffusion → [blur] → noise + vignette → screen`

## The steadiness problem (the whole reason this isn't just the still tool)
A live feed re-rolls the dissolve every frame. Three separate causes, three fixes:

1. **Sensor noise** — every pixel jitters a couple of levels, which the diffusion's
   content weighting amplifies into a boiling grain. Fixed by a temporal EMA on the
   ingested frame. Measured on a static region: **0.396 → 0.000** mean per-pixel
   frame-to-frame change.
2. **A plain EMA smears anything that moves.** So the EMA is **motion-adaptive**:
   `alpha = mix(alphaStatic, 1.0, motion * (1 - trail))`. Static pixels average
   heavily, moving pixels admit the new frame immediately. `Ghost trail` re-enables
   the smearing on purpose when you want it. Motion is one frame stale, which breaks
   the circular dependency and is invisible.
3. **The particle field itself** — grain cells are hashed from `gl_FragCoord`, so the
   dust is anchored in *screen* space and does not crawl with the subject.

### Half-float history is not optional
An 8-bit EMA **dead-bands**: `prev + a·(cur-prev)` rounds straight back to `prev`
unless `|cur-prev| > 1/a` levels. At a 1.4s time constant (a≈0.006) the history buffer
*freezes* rather than smooths — it looks steady but has stopped tracking. History and
motion buffers are `RGBA16F` (`EXT_color_buffer_float`), with an alpha floor of 0.02 as
an 8-bit fallback. Verified response to a step input: measured τ ≈ 1.2s against a
1.37s target, smooth exponential, no freeze.

## Motion field
Quarter-res, 5-tap smoothed, exponentially decaying: `max(0, |cur − smoothed| − floor) × gain`,
held with a time-constant decay (`Motion hold`). It drives three things:
- **Motion response** (−100…+100) — positive: movement dissolves you. Negative:
  stillness dissolves you and movement brings you back.
- **Origin follow** — a 48×27 readback every 6th frame gives a motion centroid, spring-smoothed.
- The motion meter in the status strip, for setting gain/floor against the real room.

All time constants are computed from `dt`, so behaviour is identical at 30 / 60 / 120 fps.

## Booth / install notes
- **Present mode** (`Present` button, `P`, or `?present=1`): full-bleed, no chrome,
  cursor auto-hides, `requestFullscreen` + `navigator.wakeLock` so the screen never sleeps.
- **Settings sync live over quick.db** (`magicmirror_state_v1`) — tune from a laptop
  while the booth display is running. Remote updates are ignored for 2.5s after a local
  edit so it can't fight you mid-drag. `Sync: This screen only` opts out.
- Camera auto-restarts on track `ended` (sleep/unplug) with a 1.5s backoff.
- Double-click the privacy line to attempt `exposureMode/whiteBalanceMode: manual` —
  auto-exposure hunting makes a mirror breathe. Not all cameras support it.
- **Test pattern** input drives the whole pipeline without a camera (with synthetic
  sensor noise), for tuning and for verification in a headless browser.
- Nothing is uploaded, recorded or stored. Only slider values touch the network.

## Perf
120 fps (vsync-bound) at 1124×800 with 8 samples on an M-series GPU. Render is at
display resolution × `Render` scale; spatial sliders are per-mille of render height so a
look holds its proportions on any screen size.

## Debug hook
`window.__mirror` → `P, DEF, setParam, applyParams, snapshot, startCamera, layout,
drawTest, testCv, FLOAT_OK, enterPresent, exitPresent, snapshotPng, RW, RH, fps,
motionLevel, origin, readScreen()`.
