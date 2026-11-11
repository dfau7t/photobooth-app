// =============================================================
// doodleAnim.js — Experiment B: play the doodle collage as an animation.
//
//   startDoodleAnimation(collage)  -> start (or restart) playing
//   isDoodleAnimating()            -> still playing?
//   drawDoodleAnimation(x, y, w, h) -> draw the current moment, in that box
//   stopDoodleAnimation()
//
// The timeline (all times in CONFIG.doodle.animation):
//   1. the line is traced, as if someone is drawing it:
//      head, neck, nose, hair (lineMs, about 1.5 s)
//   2. the stickers drop on one by one: ears -> lips -> nose -> eyes.
//      Each one starts a bit bigger (1.08x, still "in the air") and
//      shrinks to 1x as it lands, while its shadow appears.
//   3. the marks and caption fade in
// After that, the finished collage is shown as a normal picture.
//
// We don't draw anything new here: composeDoodle() already made all
// the pieces (collage.parts). We only decide how much of each to show.
// =============================================================

let doodleAnim = null; // null = not playing

function startDoodleAnimation(collage) {
  stopDoodleAnimation();
  if (!collage || !collage.parts) return;
  const W = CONFIG.output.width;
  const H = CONFIG.output.height;
  const parts = collage.parts;

  // All pen strokes in drawing order, as one long list. The lighter
  // second pass goes with its main stroke, so they're drawn together.
  const steps = [];
  for (const line of parts.lines) {
    for (let i = 0; i < line.main.length; i++) {
      steps.push({ main: line.main[i], light: line.light ? line.light[i] : null });
    }
  }

  doodleAnim = {
    start: millis(),
    parts: parts,
    steps: steps,
    drawn: 0, // how many strokes are drawn so far
    // The line grows on two layers (light pass under, main line on top),
    // so a new light stroke can never cover an older main stroke
    lightLayer: makeLayer(W, H),
    mainLayer: makeLayer(W, H),
    frame: makeLayer(W, H), // where one moment of the animation is put together
  };
}

function stopDoodleAnimation() {
  if (!doodleAnim) return;
  doodleAnim.lightLayer.remove();
  doodleAnim.mainLayer.remove();
  doodleAnim.frame.remove();
  doodleAnim = null;
}

function isDoodleAnimating() {
  return doodleAnim !== null;
}

// Draw the animation as it is right now, into the box (x, y, w, h) on the stage
function drawDoodleAnimation(x, y, w, h) {
  const a = doodleAnim;
  const cfg = CONFIG.doodle.animation;
  const t = millis() - a.start; // milliseconds since the start
  const stickers = a.parts.stickers;

  // ---- 1. Line: add the strokes that should be there by now ----
  const lineProgress = constrain(t / cfg.lineMs, 0, 1);
  const target = floor(lineProgress * a.steps.length);
  while (a.drawn < target) {
    const step = a.steps[a.drawn];
    if (step.light) drawStroke(a.lightLayer, step.light, a.parts.lightColour);
    drawStroke(a.mainLayer, step.main, a.parts.lineColour);
    a.drawn++;
  }

  const f = a.frame;
  f.background(CONFIG.doodle.paper);
  f.image(a.lightLayer, 0, 0);
  f.image(a.mainLayer, 0, 0);

  // ---- 2. Stickers: each one drops 'dropGapMs' after the one before ----
  for (let i = 0; i < stickers.length; i++) {
    const since = t - cfg.lineMs - i * cfg.dropGapMs; // ms since this sticker started dropping
    if (since < 0) break; // not yet (and neither are the ones after it)
    const landed = easeOut(constrain(since / cfg.dropMs, 0, 1)); // 0 = in the air, 1 = landed
    drawSticker(f, stickers[i], lerp(1.08, 1, landed), landed);
  }

  // ---- 3. Marks and caption: fade in after the last sticker lands ----
  const overlayStart = cfg.lineMs + (stickers.length - 1) * cfg.dropGapMs + cfg.dropMs;
  const fade = constrain((t - overlayStart) / cfg.fadeMs, 0, 1);
  if (fade > 0) {
    f.drawingContext.globalAlpha = fade; // see-through while fading in
    f.image(a.parts.overlay, 0, 0);
    f.drawingContext.globalAlpha = 1;
  }

  // Show this moment on the stage
  image(f, x, y, w, h);

  // All done? From now on the finished collage is shown instead.
  if (fade >= 1) stopDoodleAnimation();
}

// ---------- helpers ----------

// A full-size, see-through drawing layer
function makeLayer(w, h) {
  const g = createGraphics(w, h);
  g.pixelDensity(1);
  return g;
}

// Starts fast, slows down at the end, like something settling into place.
// t goes from 0 to 1.
function easeOut(t) {
  return 1 - pow(1 - t, 3);
}
