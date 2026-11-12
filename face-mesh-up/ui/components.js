// =============================================================
// ui/components.js — the building blocks of every MUGSHOT(3) screen.
//
// A COMPONENT is one reusable drawing function for one kind of element
// (a page dot, a frame, a stamp...). Screens never draw their own
// version: they call the component. Every component:
//   - takes its sizes, strokes and wobble ONLY from the tokens
//     (CONFIG.ui.tokens) and its colours ONLY from the palette
//   - prints a shape made once (ui/doodleLine.js), never a new one
// So the same element looks the same on every screen, every frame.
// Only the CONTENT changes (label, colour, state).
//
//   TopBar(current, count)
//   PageDots(current, count, cx, cy)
//   KeyHint(label, x, cy, align)            -> its box { x, y, w, h }
//   KeyHintRow(items, x, cy)                [←][→] screens   [G] style guide ...
//   Toast(message)                          a short message in the middle
//   DoodleFrame(x, y, w, h, colour)
//   GridCell(x, y, state, colour, {progress, alpha})  state: 'idle' | 'active' | 'locked' | 'cleared'
//   Placard(x, y, number, date, colour)
//   TornPoster(slot, size, colour, cx, cy, drawContent)
//   makeStamp / showStamp / hideStamp / drawStamp
//   FloorMark(slot, cx, cy)                 a floor mark "01" in the person's colour
//   NumberBadge(number, label, x, cy)       (3) PEOPLE PER ROUND
//   TornBand(w, cx, cy, colour)             a wide torn paper strip
//   ChalkFigure(variant, cx, cy, angle, ms) a chalk body outline that draws itself on
//   FacePhoto(face, x, y, size)             the live camera, cropped around a face
//   WantedPoster(slot, size, cx, cy, face, number)   a WANTED poster, empty or with a face
//   SirenFlash(ms)                          the whole stage flashes red / blue
//   SlamWord(words, x, baseline, startedAt, style, from)   a word that slams in
//   PoliceOfficer(x, feetY, talking, facing)  the cartoon officer with a megaphone
//   SpeechBubble(text, chars, x, cy, tail)  a doodle bubble that fits its words; types 'chars' letters
//   SoundLog(entries, x, bottom)            the sound log overlay (Shift+L, testing)
//   PoliceCar(x, groundY, state)            the police car (wheels, light bar, optional POLICE)
//   SirenGlow(cx, cy, ms, strength)         a soft red / blue glow on the background
//   GroundLine(y)                           a faint doodle line for the ground
//   StatusLabel(slot, handsUp, cx, cy, latched)  HANDS UP 0/2 · 1/2 · 2/2 (· 2/2 ✓)
//   CameraView(source, view)                the camera (or the photo) in a doodle frame
//   viewPoint(camX, camY, source, view)     camera pixels -> a point on that view
//   HeightChart(view)                       the height lines over the picture
//   Countdown(n, cx, cy)                    a big 3 / 2 / 1 in a doodle circle
//   CameraFlash(ms)                         the white flash after the photo
//
// Text helpers (one rule set for all text):
//   setType('label')                  font + size + line height + letter-spacing
//   textCentered(words, x, cy)        centred optically on (x, cy)
// =============================================================

// ---------- text ----------

// Use one of the text styles from tokens.type
function setType(styleName) {
  const st = CONFIG.ui.tokens.type[styleName];
  textFont(CONFIG.ui.fonts[st.font]);
  textSize(st.size);
  textLeading(st.line);
  // Letter-spacing isn't a p5 function; the browser's canvas has it
  drawingContext.letterSpacing = st.track * st.size + 'px';
}

// Draw text so that its CAPITALS (and digits) sit exactly in the middle
// of cy. textAlign(CENTER, CENTER) centres the font's whole box,
// including room for letters like "g", so capitals look too high.
// Instead we measure the real height of a capital H and use that.
function textCentered(words, x, cy) {
  textAlign(CENTER, BASELINE);
  const capHeight = drawingContext.measureText('H').actualBoundingBoxAscent;
  text(words, x, cy + capHeight / 2);
}

// The left edge of grid column i (0 – 11) of the 12-column grid
function gridX(i) {
  const l = CONFIG.ui.tokens.layout;
  return l.margin + i * (l.column + l.gutter);
}

// Round up to the 8 px baseline grid
function snap8(v) {
  return ceil(v / 8) * 8;
}

// ---------- top bar ----------

let nextButtonBox = { x: 0, y: 0, w: 0, h: 0 }; // where ">>>" is (for clicks)

function TopBar(current, count) {
  const t = CONFIG.ui.tokens;
  const cy = t.topBar.height / 2;

  // Left: the logo, on the outer margin
  push();
  noStroke();
  fill(CONFIG.ui.colors.text);
  setType('title');
  textAlign(LEFT, BASELINE);
  const cap = drawingContext.measureText('H').actualBoundingBoxAscent;
  text('MUGSHOT(3)', t.layout.margin, cy + cap / 2);
  pop();

  // Middle: the page dots, centred as a group
  PageDots(current, count, CONFIG.stage.width / 2, cy);

  // Right: the ">>>" button, its right edge on the outer margin
  nextButtonBox = KeyHint('>>>', CONFIG.stage.width - t.layout.margin, cy, 'right');
  cursor(isOverNextButton(stageMouse()) ? HAND : ARROW);
}

function isOverNextButton(p) {
  const b = nextButtonBox;
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

// ---------- page dots ----------

// One dot per screen. current = filled grey; before it = 'done'
// (white outline); after it = 'upcoming' (white outline at 50%).
// ALL dots print the SAME outline: same diameter, stroke, wobble and gap.
function PageDots(current, count, cx, cy) {
  const t = CONFIG.ui.tokens.pageDot;
  const c = CONFIG.ui.colors;
  const pitch = t.diameter + t.gap; // centre to centre
  const firstX = cx - ((count - 1) * pitch) / 2; // centred as a group
  const shape = circleShape('pagedot', t.diameter, t); // made once, reused for every dot

  for (let i = 0; i < count; i++) {
    const x = firstX + i * pitch;
    const state = i < current ? 'done' : i === current ? 'current' : 'upcoming';
    const alpha = state === 'upcoming' ? 0.5 : 1;

    push();
    if (state === 'current') {
      // The fill stays inside the wobble, so it never peeks out past the line
      noStroke();
      fill(c.dotFill);
      circle(x, cy, t.diameter - 2 * shape.wobble);
    }
    drawShape(shape, x, cy, c.chalk, { alpha: alpha });

    // The label: always centred in the fixed circle, never sizing it
    const label = color(c.text);
    label.setAlpha(255 * alpha);
    noStroke();
    fill(label);
    setType(t.label);
    textCentered(nf(i, 2), x, cy);
    pop();

    if (uiDebug) debugPageDot(i, x, cy, shape);
  }
}

// ---------- key hint / button ----------

// A key or button label in a thin doodle box, e.g. ">>>" or "SPACE".
// align 'left': x is the left edge; 'right': x is the right edge.
// The box is as wide as the label (snapped to 8 px), as tall as the token.
// The same label always gives the same box.
function KeyHint(label, x, cy, align) {
  const t = CONFIG.ui.tokens.keyHint;
  push();
  setType(t.label);
  const w = snap8(textWidth(label) + 2 * t.padX);
  const h = t.height;
  const left = align === 'right' ? x - w : x;
  const box = { x: left, y: cy - h / 2, w: w, h: h };

  // Dimmed until the mouse is over it
  const p = stageMouse();
  const hover = p.x >= box.x && p.x <= box.x + w && p.y >= box.y && p.y <= box.y + h;
  const alpha = hover ? 1 : 0.7;

  drawShape(rectShape('keyhint', w, h, t), left + w / 2, cy, CONFIG.ui.colors.chalk, { alpha: alpha });
  const c = color(CONFIG.ui.colors.text);
  c.setAlpha(255 * alpha);
  noStroke();
  fill(c);
  textCentered(label, left + w / 2, cy);
  pop();

  if (uiDebug) debugRect(left + w / 2, cy, w, h, 0);
  return box;
}

// A row of key hints with what they do, e.g.  [←][→] screens   [G] style guide
// items: [{ keys: ['←', '→'], text: 'screens' }, ...]. x = left edge.
function KeyHintRow(items, x, cy) {
  const s = CONFIG.ui.tokens.space;
  let left = x;
  for (const item of items) {
    for (const k of item.keys) {
      const box = KeyHint(k, left, cy, 'left');
      left += box.w + s.s;
    }
    push();
    noStroke();
    fill(CONFIG.ui.colors.muted);
    setType('label');
    textAlign(LEFT, BASELINE);
    const cap = drawingContext.measureText('H').actualBoundingBoxAscent;
    text(item.text, left, cy + cap / 2);
    left += textWidth(item.text) + s.xxl;
    pop();
  }
}

// ---------- toast (short message) ----------

// A short message in the middle of the stage, e.g. "Saved ...".
// msg = { text, until }: shown until millis() passes 'until'.
// A flat grey panel with a doodle frame and the text in 'lead'.
function Toast(msg) {
  if (!msg.text || millis() > msg.until) return;
  const t = CONFIG.ui.tokens.toast;
  const cx = CONFIG.stage.width / 2;
  const cy = CONFIG.stage.height / 2;
  push();
  noStroke();
  fill(CONFIG.ui.colors.panel);
  rectMode(CENTER);
  rect(cx, cy, t.w, t.h); // printed: a flat panel
  drawShape(rectShape('toast', t.w, t.h, t), cx, cy, CONFIG.ui.colors.chalk);
  fill(CONFIG.ui.colors.text);
  setType('lead');
  textCentered(msg.text, cx, cy);
  pop();
  if (uiDebug) debugRect(cx, cy, t.w, t.h, 0);
}

// ---------- frames and grid cells ----------

// A hand-drawn frame (photo frames, the camera frame). x, y = top-left.
// Every frame of the same size prints the same outline.
// alpha (optional): 0–1, e.g. for the pulsing frame of an empty poster.
function DoodleFrame(x, y, w, h, colour, alpha) {
  const t = CONFIG.ui.tokens.frame;
  drawShape(rectShape('frame', w, h, t), x + w / 2, y + h / 2, colour ?? CONFIG.ui.colors.chalk, { alpha: alpha ?? 1 });
  if (uiDebug) debugRect(x + w / 2, y + h / 2, w, h, 0);
}

// One box of the evidence grid. x, y = top-left.
//   idle:    chalk, 50%
//   active:  the spinning highlight: person colour, thick
//   locked:  the match: person colour, thick
//   cleared: not the match: chalk, faint
// options (optional): progress 0–1 (the frame drawing on), alpha 0–1 (times the state's own)
function GridCell(x, y, state, colour, options) {
  const t = CONFIG.ui.tokens.gridCell;
  const o = options || {};
  const thick = state === 'active' || state === 'locked';
  const style = { stroke: thick ? t.lockedStroke : t.stroke, wobble: t.wobble, ends: t.ends };
  const shape = rectShape('gridcell', t.w, t.h, style);
  const lineColour = thick ? colour : CONFIG.ui.colors.chalk;
  const own = state === 'idle' ? t.idleAlpha : state === 'cleared' ? t.clearedAlpha : 1;
  drawShape(shape, x + t.w / 2, y + t.h / 2, lineColour, { alpha: own * (o.alpha ?? 1), progress: o.progress ?? 1 });
  if (uiDebug) debugRect(x + t.w / 2, y + t.h / 2, t.w, t.h, 0);
}

// ---------- placard ----------

// The small black sign under each face on the mugshot screen:
// booking number and date, in the person's colour. x, y = top-left.
function Placard(x, y, number, date, colour) {
  const t = CONFIG.ui.tokens.placard;
  const s = CONFIG.ui.tokens.space;
  push();
  noStroke();
  fill(CONFIG.ui.colors.ink);
  rect(x, y, t.w, t.h); // printed: a flat black card
  drawShape(rectShape('placard', t.w, t.h, t), x + t.w / 2, y + t.h / 2, colour);
  fill(colour);
  setType('label');
  textCentered(number, x + t.w / 2, y + s.xl + s.s);
  setType('caption');
  textCentered(date, x + t.w / 2, y + t.h - s.xl);
  pop();
  if (uiDebug) debugRect(x + t.w / 2, y + t.h / 2, t.w, t.h, 0);
}

// ---------- torn poster ----------

// A torn paper poster. slot 0/1/2 = person 01/02/03: each slot has its
// own FIXED tears and tilt (from tokens), the same every frame and round.
// size: 'S' | 'M' | 'L'. drawContent(w, h) draws what's on the poster,
// with (0, 0) in the middle of the poster, already tilted.
function TornPoster(slot, size, colour, cx, cy, drawContent) {
  const t = CONFIG.ui.tokens.poster;
  const w = t[size][0];
  const h = t[size][1];
  const angle = t.angles[slot % t.angles.length];
  const name = 'poster-' + nf(slot + 1, 2);

  // White paper fibres peeking out under the tear, then the coloured paper
  drawTorn(tornShape(name + '-fibre', w + 2 * t.fibre, h + 2 * t.fibre), cx, cy, CONFIG.ui.colors.paper, angle);
  drawTorn(tornShape(name, w, h), cx, cy, colour, angle);

  if (drawContent) {
    push();
    translate(cx, cy);
    rotate(radians(angle));
    drawContent(w, h);
    pop();
  }
  if (uiDebug) debugRect(cx, cy, w, h, angle);
}

// ---------- stamps ----------
// "SURRENDERED", "MATCH", "AT LARGE": rotated text in a doodle frame.
//   const s = makeStamp('MATCH', { x, y, size: 'S', color })   (once)
//   showStamp(s)  slam it on: 1.4x -> 1.0x
//   hideStamp(s)  fade it out
//   drawStamp(s)  every frame
// The tilt, stroke, wobble and padding are the same for every stamp.
// The frame is as wide as the word (same word = same frame).

function makeStamp(words, options) {
  const o = options || {};
  return {
    words: words,
    x: o.x ?? 0,
    y: o.y ?? 0,
    size: o.size ?? 'M',
    color: o.color ?? CONFIG.ui.colors.sirenRed,
    shownAt: -1, // millis() when it was slammed on (-1 = not shown)
    hiddenAt: -1, // millis() when it started fading (-1 = not fading)
  };
}

function showStamp(s) {
  if (s.shownAt >= 0 && s.hiddenAt < 0) return; // already on
  s.shownAt = millis();
  s.hiddenAt = -1;
  // milestone 8: play the thud here
}

function hideStamp(s) {
  if (s.shownAt < 0 || s.hiddenAt >= 0) return; // not on, or already fading
  s.hiddenAt = millis();
}

function drawStamp(s) {
  if (s.shownAt < 0) return;
  const t = CONFIG.ui.tokens.stamp;
  const timing = CONFIG.ui.tokens.timing;

  // How strong: 1 = fully there, fading to 0 after hideStamp()
  let alpha = 1;
  if (s.hiddenAt >= 0) {
    alpha = 1 - (millis() - s.hiddenAt) / timing.stampFadeMs;
    if (alpha <= 0) {
      s.shownAt = -1;
      s.hiddenAt = -1;
      return;
    }
  }
  // How big: 1.4x when it lands, settling to 1.0x
  const slam = slamScale(s.shownAt, 1.4);

  const textPx = t[s.size];
  push();
  translate(s.x, s.y);
  rotate(radians(t.angle));
  scale(slam);

  textFont(CONFIG.ui.fonts.display);
  textSize(textPx);
  drawingContext.letterSpacing = '0px';
  const w = snap8(textWidth(s.words) + 2 * t.padX);
  const h = snap8(textPx + 2 * t.padY);
  drawShape(rectShape('stamp', w, h, t), 0, 0, s.color, { alpha: alpha });

  // The text twice: full, then 1 px off at half strength (a rough print)
  const ink = color(s.color);
  noStroke();
  ink.setAlpha(255 * alpha);
  fill(ink);
  textCentered(s.words, 0, 0);
  ink.setAlpha(255 * alpha * 0.5);
  fill(ink);
  textCentered(s.words, 1, 1);
  pop();

  if (uiDebug) debugRect(s.x, s.y, w, h, t.angle);
}

// ---------- floor marks and badges ----------

// One of the three marks on the floor: a doodle circle with "01" in the
// person's colour. slot 0/1/2 = person 01/02/03.
function FloorMark(slot, cx, cy) {
  const t = CONFIG.ui.tokens.floorMark;
  const colour = CONFIG.colors.people[slot];
  drawShape(circleShape('floormark', t.diameter, t), cx, cy, colour);
  push();
  noStroke();
  fill(colour);
  setType(t.label);
  textCentered(nf(slot + 1, 2), cx, cy);
  pop();
  if (uiDebug) debugCircle(cx, cy, t.diameter);
}

// A number in a small doodle circle, followed by a label: (3) PEOPLE PER ROUND.
// x = the left edge of the circle.
function NumberBadge(number, label, x, cy) {
  const t = CONFIG.ui.tokens.badge;
  const cx = x + t.diameter / 2;
  drawShape(circleShape('badge', t.diameter, t), cx, cy, CONFIG.ui.colors.chalk);
  push();
  noStroke();
  fill(CONFIG.ui.colors.text);
  setType(t.label);
  textCentered(number, cx, cy);
  setType('label');
  textAlign(LEFT, BASELINE);
  const cap = drawingContext.measureText('H').actualBoundingBoxAscent;
  text(label, x + t.diameter + CONFIG.ui.tokens.space.m, cy + cap / 2);
  pop();
  if (uiDebug) debugCircle(cx, cy, t.diameter);
}

// ---------- torn band ----------

// A wide strip of torn paper, tilted (height and tilt from tokens.band),
// with white paper fibres peeking out at the tear.
function TornBand(w, cx, cy, colour) {
  const t = CONFIG.ui.tokens;
  const h = t.band.h;
  drawTorn(tornShape('band-fibre', w + 2 * t.poster.fibre, h + 2 * t.poster.fibre), cx, cy, CONFIG.ui.colors.paper, t.band.angle);
  drawTorn(tornShape('band', w, h), cx, cy, colour, t.band.angle);
  if (uiDebug) debugRect(cx, cy, w, h, t.band.angle);
}

// ---------- chalk figures ----------

// A chalk outline of a body, like at a crime scene. 3 poses (variant 0/1/2).
// It draws itself on, stays, fades out, and starts again (timings in
// tokens.chalkFigure). ms = time since the screen started; each figure can
// start a bit later (stagger) by passing a smaller ms.
function ChalkFigure(variant, cx, cy, angle, ms) {
  const t = CONFIG.ui.tokens.chalkFigure;
  if (ms < 0) return; // not started yet
  const cycle = t.drawMs + t.holdMs + t.fadeMs;
  const tc = ms % cycle; // time inside the current loop
  const progress = tc / t.drawMs; // more than 1 = fully drawn
  const alpha = tc < t.drawMs + t.holdMs ? 1 : 1 - (tc - t.drawMs - t.holdMs) / t.fadeMs;
  const shape = lineShape('chalk-figure-' + variant, chalkFigurePoints(variant), t);
  drawShape(shape, cx, cy, CONFIG.ui.colors.chalk, { progress: progress, alpha: alpha, angle: angle });
}

// The outline of each pose, as points (standing upright, centred on 0,0).
// One continuous line: over the head, down the right side, across the
// legs, up the left side. Scaled by tokens.chalkFigure.scale.
function chalkFigurePoints(variant) {
  // Right halves (from the neck down to between the legs)
  const armUp = [[14, -104], [40, -112], [56, -168], [66, -208], [78, -222], [94, -214], [86, -168], [72, -110], [58, -66], [52, -10], [48, 40], [60, 110], [68, 172], [74, 188], [54, 192], [40, 130], [26, 72], [0, 60]];
  const armOut = [[14, -104], [56, -96], [110, -90], [160, -84], [178, -86], [186, -74], [176, -62], [150, -60], [104, -62], [60, -56], [52, -10], [48, 40], [80, 108], [104, 160], [112, 178], [94, 186], [66, 124], [30, 72], [0, 60]];
  // A left half with the arm down by the side (from between the legs up to the neck)
  const leftArmDown = [[-28, 72], [-40, 130], [-52, 184], [-74, 188], [-66, 120], [-52, 44], [-66, 36], [-76, 14], [-70, -30], [-58, -92], [-14, -104]];
  // The mirror image of a right half = a left half
  const mirror = (right) => right.slice(0, -1).reverse().map((p) => [-p[0], p[1]]);

  const poses = [
    armUp.concat(mirror(armUp)), // 0: both hands up
    armOut.concat(leftArmDown), // 1: one arm out, one down
    armUp.concat(mirror(armOut)), // 2: one arm up, one out
  ];
  // The head: an arc from the left of the neck, over the top, to the right
  const head = [];
  for (let a = 115; a <= 425; a += 15) head.push([cos(radians(a)) * 28, -132 + sin(radians(a)) * 28]);

  const k = CONFIG.ui.tokens.chalkFigure.scale;
  const all = head.concat(poses[variant % 3]);
  all.push(head[0]); // close the outline at the head
  return all.map((p) => ({ x: p[0] * k, y: p[1] * k }));
}

// ---------- the face photo ----------

// The live camera picture, cropped to a square around a face, mirrored
// like the preview. x, y = top-left, size = width and height.
// crop = { cx, cy, side } in camera pixels (see faceCropTarget).
function FacePhoto(crop, x, y, size) {
  if (!crop || !cameraReady) return;
  // Keep the crop inside the camera picture
  const side = min(crop.side, video.width, video.height);
  const sx = constrain(crop.cx - side / 2, 0, video.width - side);
  const sy = constrain(crop.cy - side / 2, 0, video.height - side);
  push();
  if (CONFIG.camera.mirror) {
    translate(x + size, y);
    scale(-1, 1);
    image(video, 0, 0, size, size, sx, sy, side, side);
  } else {
    image(video, x, y, size, size, sx, sy, side, side);
  }
  pop();
}

// Where a face's photo crop should be: a square around the face box
function faceCropTarget(face) {
  const m = CONFIG.ui.tokens.faceCrop.margin;
  return {
    cx: face.box.xMin + face.box.width / 2,
    cy: face.box.yMin + face.box.height / 2,
    side: max(face.box.width, face.box.height) * (1 + 2 * m),
  };
}

// ---------- WANTED poster ----------

// A torn WANTED poster in the person's colour:
//   WANTED (headline, size depends on the poster size)
//   a square photo frame: the live face, or (empty) a pulsing frame + "SUSPECT 01"
//   the booking number
// slot 0/1/2 = person 01/02/03. size: 'S' | 'M' | 'L'.
// crop: where the face is (or null = empty). number: "48213907" (or null).
function WantedPoster(slot, size, cx, cy, crop, number) {
  const t = CONFIG.ui.tokens;
  const c = CONFIG.ui.colors;
  TornPoster(slot, size, CONFIG.colors.people[slot], cx, cy, function (w, h) {
    const pad = t.space.xl;
    noStroke();
    fill(c.ink);

    // Headline, on the poster's top padding
    setType(t.wantedPoster.headline[size]);
    textAlign(CENTER, BASELINE);
    const cap = drawingContext.measureText('H').actualBoundingBoxAscent;
    const headlineBase = -h / 2 + pad + cap;
    text('WANTED', 0, headlineBase);

    // The square photo frame, as wide as the poster minus the padding
    const f = w - 2 * pad;
    const fx = -f / 2;
    const fy = headlineBase + t.space.l;
    const inset = t.wantedPoster.photoInset;
    if (crop) {
      FacePhoto(crop, fx + inset, fy + inset, f - 2 * inset);
      DoodleFrame(fx, fy, f, f, c.ink);
    } else {
      // Empty: the frame pulses slowly, waiting for a suspect
      const pulse = 0.5 + 0.5 * sin((millis() / t.timing.pulseMs) * TWO_PI);
      DoodleFrame(fx, fy, f, f, c.ink, 0.3 + 0.7 * pulse);
      fill(c.ink);
      setType('label');
      textCentered('SUSPECT ' + nf(slot + 1, 2), 0, fy + f / 2);
    }

    // The booking number, under the frame
    fill(c.ink);
    setType('label');
    textCentered(number ? 'No. ' + number : 'No. --------', 0, fy + f + t.space.xl);
  });
}

// Where a poster's photo should be now: it follows its face smoothly.
// old = last frame's crop (or null), face = the face now (or null).
function smoothCrop(old, face) {
  if (!face) return null; // nobody there: empty poster
  const target = faceCropTarget(face);
  if (!old) return target;
  const k = CONFIG.ui.tokens.faceCrop.smoothing;
  return { cx: lerp(old.cx, target.cx, k), cy: lerp(old.cy, target.cy, k), side: lerp(old.side, target.side, k) };
}

// ---------- slam (shared by stamps and slam words) ----------

// How big something that slams in is right now: 'from' (e.g. 1.4x)
// when it lands, settling to 1.0x in tokens.timing.stampSlamMs.
// Everything that slams in uses this, so it all moves the same way.
function slamScale(startedAt, from) {
  const k = constrain((millis() - startedAt) / CONFIG.ui.tokens.timing.stampSlamMs, 0, 1);
  return lerp(from, 1, 1 - pow(1 - k, 3)); // fast at first, then settles
}

// ---------- siren flash ----------

// The whole stage flashes siren red, siren blue, red, blue... (tokens:
// handsup.flashes times each, timing.sirenFlashMs each flash).
// ms = time since the flashing started. Draw it LAST, over everything.
// flashes (optional): how many red + blue pairs (default: tokens.handsup.flashes).
function SirenFlash(ms, flashes) {
  const one = CONFIG.ui.timing.sirenFlashMs;
  const total = (flashes ?? CONFIG.ui.tokens.handsup.flashes) * 2 * one;
  if (ms < 0 || ms >= total) return;
  const c = CONFIG.ui.colors;
  push();
  noStroke();
  fill(floor(ms / one) % 2 === 0 ? c.sirenRed : c.sirenBlue);
  rect(0, 0, CONFIG.stage.width, CONFIG.stage.height);
  pop();
}

// ---------- slam word ----------

// A word in a type style that slams in at 'startedAt' (from 'from' x
// its size down to 1x), then stays. x = left edge, on a baseline.
// Returns its width (so the next word can follow it).
function SlamWord(words, x, baseline, startedAt, style, from) {
  push();
  setType(style);
  const w = textWidth(words);
  if (millis() >= startedAt) {
    const cap = drawingContext.measureText('H').actualBoundingBoxAscent;
    // Grow / shrink around the middle of the word
    translate(x + w / 2, baseline - cap / 2);
    scale(slamScale(startedAt, from));
    noStroke();
    fill(CONFIG.ui.colors.text);
    textCentered(words, 0, 0);
  }
  pop();
  return w;
}

// ---------- police officer ----------

// The cartoon police officer: chalk doodle lines, a cap (no real badge
// or logo), a moustache, a megaphone held to the left. While 'talking',
// sound waves come out of the megaphone.
// (x, feetY) = between his feet. Every part is a shape made once.
// facing: 'left' (default, megaphone to the left) or 'right' (the same
// drawing, mirrored).
// size (optional): smaller or bigger, e.g. 0.6 in the corner of scene 02b.
function PoliceOfficer(x, feetY, talking, facing, size) {
  const t = CONFIG.ui.tokens.officer;
  const c = CONFIG.ui.colors;
  const k = t.scale * (size ?? 1);
  const style = { stroke: t.stroke, wobble: t.wobble };

  push();
  if (facing === 'right') {
    // Mirror left-right around the officer's own position
    translate(x, 0);
    scale(-1, 1);
    translate(-x, 0);
  }

  // The lines (points in "officer space": 0,0 between the feet, up = negative)
  for (const part of OFFICER_PARTS) {
    const pts = part.points.map((p) => ({ x: p[0] * k, y: p[1] * k }));
    drawShape(lineShape('officer-' + part.name, pts, style), x, feetY, c.chalk);
  }
  // The round parts: head and the plain emblem on the cap
  drawShape(circleShape('officer-head', 104 * k, t), x, feetY - 392 * k, c.chalk);
  drawShape(circleShape('officer-emblem', 20 * k, t), x, feetY - 468 * k, c.chalk);
  // Eyes: two flat dots
  push();
  noStroke();
  fill(c.chalk);
  circle(x - 34 * k, feetY - 398 * k, 10 * k);
  circle(x - 8 * k, feetY - 398 * k, 10 * k);
  pop();

  // Sound waves: three arcs in front of the megaphone, appearing one by one
  if (talking) {
    const shown = floor(millis() / t.waveMs) % 4; // 0 – 3 arcs
    for (let i = 0; i < shown; i++) {
      const r = (28 + i * 24) * k;
      const arc = [];
      for (let a = 150; a <= 210; a += 10) arc.push({ x: cos(radians(a)) * r, y: sin(radians(a)) * r });
      drawShape(lineShape('officer-wave-' + i, arc, style), x - 196 * k, feetY - 374 * k, c.chalk);
    }
  }
  if (uiDebug) debugRect(x - 52 * k, feetY - 250 * k, 300 * k, 500 * k, 0);
  pop();
}

// The officer's lines, in "officer space" (0,0 between the feet; up = negative).
const OFFICER_PARTS = [
  { name: 'cap', points: [[-52, -436], [-60, -492], [58, -500], [54, -436], [-52, -436]] },
  { name: 'brim', points: [[-52, -436], [-96, -428]] },
  { name: 'moustache', points: [[-56, -366], [-40, -374], [-24, -366], [-8, -374], [4, -366]] },
  { name: 'body', points: [[-64, -336], [64, -336], [56, -196], [-56, -196], [-64, -336]] },
  { name: 'belt', points: [[-58, -216], [58, -216]] },
  { name: 'leg-left', points: [[-30, -196], [-38, -24], [-72, -4], [-30, 0]] },
  { name: 'leg-right', points: [[30, -196], [38, -24], [72, -4], [30, 0]] },
  { name: 'arm-megaphone', points: [[-58, -326], [-96, -290], [-116, -330]] },
  { name: 'arm-hip', points: [[60, -326], [104, -268], [56, -224]] },
  { name: 'megaphone', points: [[-62, -386], [-62, -362], [-196, -318], [-196, -430], [-62, -386]] },
  { name: 'handle', points: [[-116, -352], [-116, -322]] },
];

// ---------- speech bubble ----------

// A doodle speech bubble that fits its words: the box ends where the
// words end. Its size comes from the FULL sentence (not the letters
// typed so far), so the box doesn't grow while the words are typed.
// Lines longer than tokens.bubble.maxW wrap, and the box gets taller.
// chars = how many letters to show (the typewriter effect).
// x  = the box edge on the officer's side (the tail side) — it stays
//      put, so the tail keeps pointing at the megaphone, whatever the length:
//        tail 'right' (default, bottom right) or 'side' (out of the right edge): x = the RIGHT edge
//        tail 'left'  (bottom left):                                           x = the LEFT edge
// cy = the middle of a ONE-line bubble. A bubble with a tail at the
//      bottom grows UPWARDS (its bottom and tail stay put); a 'side'
//      bubble grows equally up and down.
function SpeechBubble(words, chars, x, cy, tail) {
  const t = CONFIG.ui.tokens.bubble;
  const c = CONFIG.ui.colors;
  const style = { stroke: t.stroke, wobble: t.wobble, ends: t.ends };
  const lineH = CONFIG.ui.tokens.type[t.text].line;

  push();
  setType(t.text);
  const size = bubbleSize(words);
  const w = size.w;
  const h = size.h;

  // Where the box goes (see x and cy above)
  const cx = tail === 'left' ? x + w / 2 : x - w / 2;
  const oneLineH = lineH + 2 * t.padY;
  const boxY = tail === 'side' ? cy : cy + oneLineH / 2 - h / 2; // bottom tails: same bottom edge

  noStroke();
  fill(c.stage); // covers anything behind it
  rectMode(CENTER);
  rect(cx, boxY, w, h);
  // The outline: one shape per box size (made once, then reused)
  drawShape(rectShape('bubble', w, h, style), cx, boxY, c.chalk);

  // The tail, always at the same distance from the officer's side
  let tailPoints;
  if (tail === 'side') {
    // Out of the right edge, a little below the middle
    tailPoints = [{ x: w / 2, y: -8 }, { x: w / 2 + 64, y: 16 }, { x: w / 2, y: 32 }];
  } else {
    const side = tail === 'left' ? -1 : 1; // -1 mirrors the tail to the left
    tailPoints = [
      { x: side * (w / 2 - 120), y: h / 2 },
      { x: side * (w / 2 - 24), y: h / 2 + 64 },
      { x: side * (w / 2 - 64), y: h / 2 },
    ];
  }
  drawShape(lineShape('bubble-tail-' + (tail || 'right'), tailPoints, style), cx, boxY, c.chalk);

  // The text: the lines were wrapped from the FULL sentence, then typed
  // letter by letter, so words don't jump to the next line while typing
  noStroke();
  fill(c.text);
  textAlign(LEFT, BASELINE);
  const cap = drawingContext.measureText('H').actualBoundingBoxAscent;
  const firstBaseline = boxY - ((size.lines.length - 1) * lineH) / 2 + cap / 2;
  let left = chars;
  size.lines.forEach(function (line, i) {
    if (left <= 0) return;
    text(line.substring(0, left), cx - w / 2 + t.padX, firstBaseline + i * lineH);
    left -= line.length + 1; // +1 for the space between the lines
  });
  pop();
  if (uiDebug) debugRect(cx, boxY, w, h, 0);
}

// The size of the bubble for a sentence: { w, h, lines }.
//   w = the widest line + padding left and right (at least minW, so the tail fits)
//   h = the lines + padding top and bottom
// Rounded up to the 8 px grid, so nearly-equal sentences share one outline.
// Remembered per sentence, but only once the font has loaded: measured
// with the fallback font, the width would be wrong.
// (Call with the bubble's text style already set.)
const bubbleSizes = new Map(); // sentence -> { w, h, lines }
function bubbleSize(words) {
  if (bubbleSizes.has(words)) return bubbleSizes.get(words);
  const t = CONFIG.ui.tokens.bubble;
  const lines = wrapWords(words, t.maxW - 2 * t.padX);
  let widest = 0;
  for (const line of lines) widest = max(widest, textWidth(line));
  const lineH = CONFIG.ui.tokens.type[t.text].line;
  const size = {
    w: max(t.minW, snap8(widest + 2 * t.padX)),
    h: snap8(lines.length * lineH + 2 * t.padY),
    lines: lines,
  };
  if (fontLoaded(t.text)) bubbleSizes.set(words, size);
  return size;
}

// Has the font of this type style really finished loading?
// (We look for the loaded font itself. The browser's quick check says
// "yes" too early: before the Google Fonts list has even arrived.)
function fontLoaded(styleName) {
  const family = CONFIG.ui.fonts[CONFIG.ui.tokens.type[styleName].font];
  for (const face of document.fonts) {
    if (face.family.replace(/["']/g, '') === family && face.status === 'loaded') return true;
  }
  return false;
}

// Split words into lines no wider than maxW (with the current text style)
function wrapWords(words, maxW) {
  const lines = [];
  let line = '';
  for (const word of words.split(' ')) {
    const tryLine = line ? line + ' ' + word : word;
    if (textWidth(tryLine) > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = tryLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ---------- status label ----------

// HANDS UP 0/2 → 1/2 → 2/2 under each poster. Always the same size.
//   0/2: chalk outline at 50%, grey text
//   1/2: outline in the person's colour, white text
//   2/2: filled with the person's colour, ink text
//   latched (optional, true): locked as surrendered -> "2/2 ✓"
function StatusLabel(slot, handsUp, cx, cy, latched) {
  const t = CONFIG.ui.tokens.statusLabel;
  const c = CONFIG.ui.colors;
  const colour = CONFIG.colors.people[slot];
  const shape = rectShape('statuslabel', t.w, t.h, t);
  push();
  if (handsUp >= 2) {
    noStroke();
    fill(colour);
    rectMode(CENTER);
    rect(cx, cy, t.w, t.h);
  }
  drawShape(shape, cx, cy, handsUp === 0 ? c.chalk : colour, { alpha: handsUp === 0 ? 0.5 : 1 });
  noStroke();
  fill(handsUp >= 2 ? c.ink : handsUp === 1 ? c.text : c.muted);
  setType(t.label);
  textCentered('HANDS UP ' + min(handsUp, 2) + '/2' + (latched ? ' ✓' : ''), cx, cy);
  pop();
  if (uiDebug) debugRect(cx, cy, t.w, t.h, 0);
}

// ---------- hand marker ----------

// A doodle circle around a raised hand on the live camera (scene 02b),
// in the person's colour. slot 0/1/2 = person 01/02/03.
//   palm false: the arm is up -> outline only
//   palm true:  up AND an open palm (this hand counts) -> filled, see-through
// Every hand marker is the same shape (one made, printed everywhere).
function HandMarker(slot, cx, cy, palm) {
  const t = CONFIG.ui.tokens.handMarker;
  const colour = CONFIG.colors.people[slot];
  let inside = null;
  if (palm) {
    inside = color(colour);
    inside.setAlpha(255 * t.fillAlpha);
  }
  drawShape(circleShape('handmarker', t.diameter, t), cx, cy, colour, { fill: inside });
  if (uiDebug) debugCircle(cx, cy, t.diameter);
}

// ---------- print status (screen 06) ----------

// Where the printing stands, on the case file. (x, y) = top-left.
//   'printing': a doodle printer with a sheet sliding out (looping) +
//               "PRINTING YOUR CASE FILE…"
//   'done':     a check mark in a circle + "Collect your case file from the printer"
//   'off':      the printer, no sheet + "PRINT OFF" (CONFIG.print.auto = false)
// ms: time, for the sliding sheet. width (optional): the words wrap to fit
// (x + width = the right edge). All sizes in tokens.printStatus.
function PrintStatus(state, x, y, ms, width) {
  const t = CONFIG.ui.tokens.printStatus;
  const c = CONFIG.ui.colors;
  const pr = t.printer;
  const iconW = max(pr.w, t.check);
  const cx = x + iconW / 2; // the middle of the icon
  const bodyY = y + pr.feedH + pr.h / 2; // the middle of the printer body

  if (state === 'done') {
    // A check mark in a circle
    const cy = y + t.check / 2;
    drawShape(circleShape('print-check-circle', t.check, t), cx, cy, c.chalk);
    const k = t.check / 72; // the tick is drawn for a 72 px circle
    const tick = [{ x: -18 * k, y: 0 }, { x: -4 * k, y: 14 * k }, { x: 20 * k, y: -14 * k }];
    drawShape(lineShape('print-check', tick, { stroke: 'emphasis', wobble: t.wobble }), cx, cy, c.chalk);
  } else {
    // The sheet, sliding down out of the printer (drawn FIRST: the printer
    // body is filled black and hides the part that's still inside)
    if (state === 'printing') {
      const k = (ms % t.sheet.loopMs) / t.sheet.loopMs; // 0 -> 1, again and again
      const sheetY = bodyY + k * t.sheet.h; // its middle, moving down
      const fade = 1 - max(0, (k - 0.8) / 0.2); // fades away at the end of each loop
      drawShape(rectShape('print-sheet', t.sheet.w, t.sheet.h, t), cx, sheetY, c.chalk, { alpha: fade, fill: c.stage });
    }
    // The printer: the paper feed on top, the body, the slot
    drawShape(rectShape('print-feed', pr.feedW, pr.feedH, t), cx, y + pr.feedH / 2, c.chalk, { fill: c.stage });
    drawShape(rectShape('print-body', pr.w, pr.h, t), cx, bodyY, c.chalk, { fill: c.stage });
    drawShape(lineShape('print-slot', [{ x: -pr.w / 3, y: 0 }, { x: pr.w / 3, y: 0 }], t), cx, bodyY + pr.h / 4, c.chalk);
  }

  // The words, next to the icon
  const words = {
    printing: 'PRINTING YOUR CASE FILE…',
    done: 'Collect your case file from the printer',
    off: 'PRINT OFF',
  }[state];
  push();
  noStroke();
  fill(state === 'off' ? c.muted : c.text);
  setType(t.text);
  textAlign(LEFT, CENTER);
  const textX = x + iconW + t.textGap;
  const lines = width ? wrapWords(words, x + width - textX) : [words];
  const lineH = CONFIG.ui.tokens.type[t.text].line;
  const midY = y + (pr.feedH + pr.h) / 2; // the lines are centred on the icon
  lines.forEach((line, i) => text(line, textX, midY + (i - (lines.length - 1) / 2) * lineH));
  pop();
  if (uiDebug) debugRect(cx, y + (pr.feedH + pr.h) / 2, iconW, pr.feedH + pr.h, 0);
}

// ---------- camera view ----------

// The part of the camera picture we show in 'view' ({ x, y, w, h }).
// If the camera's shape differs from the view's, we cut a bit off the
// sides (or top and bottom) so it fills the view without stretching.
function viewCrop(source, view) {
  const srcW = source.width;
  const srcH = source.height;
  const viewShape = view.w / view.h;
  if (srcW / srcH > viewShape) {
    const sw = srcH * viewShape; // the camera is wider: cut the sides
    return { sx: (srcW - sw) / 2, sy: 0, sw: sw, sh: srcH };
  }
  const sh = srcW / viewShape; // the camera is taller: cut top and bottom
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh: sh };
}

// The live camera (or a frozen photo) in a doodle frame, mirrored like
// the rest of the app. source = video or snap; view = { x, y, w, h }.
// Without a camera: a grey panel.
function CameraView(source, view) {
  const c = CONFIG.ui.colors;
  push();
  if (source && source.width > 0) {
    const crop = viewCrop(source, view);
    if (CONFIG.camera.mirror) {
      translate(view.x + view.w, view.y);
      scale(-1, 1);
      image(source, 0, 0, view.w, view.h, crop.sx, crop.sy, crop.sw, crop.sh);
    } else {
      image(source, view.x, view.y, view.w, view.h, crop.sx, crop.sy, crop.sw, crop.sh);
    }
  } else {
    noStroke();
    fill(c.panel);
    rect(view.x, view.y, view.w, view.h);
  }
  pop();
  DoodleFrame(view.x, view.y, view.w, view.h, c.chalk);
}

// Where a point of the camera picture (camera pixels) shows up on the view
function viewPoint(camX, camY, source, view) {
  const crop = viewCrop(source, view);
  let x = ((camX - crop.sx) / crop.sw) * view.w;
  if (CONFIG.camera.mirror) x = view.w - x;
  const y = ((camY - crop.sy) / crop.sh) * view.h;
  return { x: view.x + x, y: view.y + y };
}

// ---------- height chart ----------

// Horizontal height lines over the picture, like the wall behind a
// mugshot, with numbers (cm) on the left. Purely decorative.
// Every line is the SAME shape (one made, printed five times).
function HeightChart(view) {
  const t = CONFIG.ui.tokens.mugshot.heightChart;
  const c = CONFIG.ui.colors;
  const lineShapeOnce = lineShape('heightline', [{ x: 0, y: 0 }, { x: view.w, y: 0 }], t);
  t.labels.forEach(function (label, i) {
    const y = view.y + view.h * (t.top + i * t.step);
    drawShape(lineShapeOnce, view.x, y, c.chalk, { alpha: t.alpha });
    push();
    noStroke();
    const ink = color(c.chalk);
    ink.setAlpha(255 * t.alpha);
    fill(ink);
    setType('caption');
    textAlign(LEFT, BASELINE);
    text(String(label), view.x + CONFIG.ui.tokens.space.m, y - CONFIG.ui.tokens.space.s);
    pop();
  });
}

// ---------- countdown ----------

// A big number in a thick doodle circle, on a dark disc so it reads
// over the camera picture.
function Countdown(n, cx, cy) {
  const t = CONFIG.ui.tokens.countdown;
  const c = CONFIG.ui.colors;
  push();
  noStroke();
  const disc = color(c.stage);
  disc.setAlpha(255 * t.backdrop);
  fill(disc);
  circle(cx, cy, t.diameter);
  pop();
  drawShape(circleShape('countdown', t.diameter, t), cx, cy, c.chalk);
  push();
  noStroke();
  fill(c.text);
  setType(t.digit);
  textCentered(String(n), cx, cy);
  pop();
  if (uiDebug) debugCircle(cx, cy, t.diameter);
}

// ---------- camera flash ----------

// The white flash when the photo is taken: full white, fading out over
// tokens.mugshot.flashMs. ms = time since the photo. Draw it LAST.
function CameraFlash(ms) {
  const fade = CONFIG.ui.tokens.mugshot.flashMs;
  if (ms < 0 || ms >= fade) return;
  push();
  noStroke();
  const white = color(CONFIG.ui.colors.text);
  white.setAlpha(255 * (1 - ms / fade));
  fill(white);
  rect(0, 0, CONFIG.stage.width, CONFIG.stage.height);
  pop();
}

// ---------- police car ----------

// The police car, side view, facing right, in chalk doodle lines:
// a boxy body (filled black so things behind it are hidden), two
// windows, a door (POLICE on it if CONFIG.police.car.showText), a headlight, a light bar on the
// roof, and two wheels with spokes. No real logos or badges.
//
// (x, groundY) = the middle of the car, where the wheels touch the ground.
// state (all optional):
//   wheelAngle  how far the wheels have turned (radians) -> the spokes turn
//   lift        how far the body is lifted (px): the bounce while driving
//   tilt        the body's tilt (degrees, + = nose down): the jolt when it stops
//   ms          time, for the light bar (red / blue swap)
//   speed       0 – 1: speed lines behind the car (0 = none)
// Every part is a shape made once (stable seed from its name), so the car
// looks exactly the same every frame and in the style guide.
function PoliceCar(x, groundY, state) {
  const t = CONFIG.ui.tokens.car;
  const c = CONFIG.ui.colors;
  const st = state || {};
  const k = t.scale;
  const r = t.wheelRadius * k;
  const style = { stroke: t.stroke, wobble: t.wobble };
  const pts = (list) => list.map((p) => ({ x: p[0] * k, y: p[1] * k }));

  push();
  translate(x, groundY);

  // ---- Speed lines behind the car (only while driving) ----
  if (st.speed > 0) {
    const sl = t.speedLines;
    sl.y.forEach(function (y, i) {
      const len = sl.length[i];
      const shape = lineShape('car-speedline-' + i, [{ x: 0, y: 0 }, { x: len, y: 0 }], sl);
      drawShape(shape, (-300 - sl.gap - len) * k, y * k, c.chalk, { alpha: st.speed });
    });
  }

  // ---- The body: lifted (bounce) and tilted (jolt) around the axles ----
  push();
  translate(0, -r - (st.lift || 0));
  rotate(radians(st.tilt || 0));
  translate(0, r);
  drawShape(lineShape('car-body', pts(CAR_BODY), style), 0, 0, c.chalk, { fill: c.stage });
  drawShape(lineShape('car-window-rear', pts(CAR_WINDOW_REAR), style), 0, 0, c.chalk);
  drawShape(lineShape('car-window-front', pts(CAR_WINDOW_FRONT), style), 0, 0, c.chalk);
  drawShape(lineShape('car-door', pts([[-14, -140], [-14, -66]]), style), 0, 0, c.chalk);
  drawShape(lineShape('car-handle', pts([[100, -128], [124, -128]]), style), 0, 0, c.chalk);
  drawShape(circleShape('car-headlight', 20 * k, t), 236 * k, -116 * k, c.chalk);

  // The word on the door, in the display font (off by default:
  // CONFIG.police.car.showText)
  if (CONFIG.police.car.showText) {
    noStroke();
    fill(c.chalk);
    setType('title');
    textCentered('POLICE', 64 * k, -96 * k);
  }

  // The light bar: two lights that swap red / blue
  const barW = 100 * k;
  const barH = 22 * k;
  const barX = -40 * k;
  const barY = -220 * k;
  const swap = floor((st.ms || 0) / CONFIG.ui.tokens.arrival.lightMs) % 2 === 0;
  noStroke();
  fill(swap ? c.sirenRed : c.sirenBlue);
  rect(barX - barW / 2, barY - barH / 2, barW / 2, barH);
  fill(swap ? c.sirenBlue : c.sirenRed);
  rect(barX, barY - barH / 2, barW / 2, barH);
  drawShape(rectShape('car-lightbar', barW, barH, style), barX, barY, c.chalk);
  pop();

  // ---- The wheels: they stay on the ground; the spokes turn ----
  for (const wx of [-160 * k, 160 * k]) {
    drawShape(circleShape('car-wheel', 2 * r, t), wx, -r, c.chalk, { angle: degrees(st.wheelAngle || 0) });
    // Three spokes = the same line, turned 0°, 60° and 120°
    const spoke = lineShape('car-spoke', [{ x: -(r - 8), y: 0 }, { x: r - 8, y: 0 }], style);
    for (let s = 0; s < 3; s++) {
      drawShape(spoke, wx, -r, c.chalk, { angle: degrees(st.wheelAngle || 0) + s * 60 });
    }
  }
  pop();

  if (uiDebug) debugRect(x, groundY - 116 * k, 528 * k, 232 * k, 0);
}

// The car's lines, in "car space": 0,0 = the middle, on the ground; up = negative.
// The body: front bumper -> along the bottom (over both wheel arches)
// -> up the back -> roof -> windscreen -> bonnet -> back to the bumper.
const CAR_BODY = (function () {
  const arch = function (cx, fromDeg, toDeg) {
    const out = [];
    for (let a = fromDeg; a >= toDeg; a -= 20) out.push([cx + 56 * Math.cos((a * Math.PI) / 180), -60 + 56 * Math.sin((a * Math.PI) / 180)]);
    return out;
  };
  return [[264, -60]]
    .concat(arch(160, 0, -180)) // over the front wheel
    .concat(arch(-160, 0, -180)) // over the back wheel
    .concat([[-262, -60], [-262, -128], [-210, -140], [-160, -208], [84, -208], [146, -140], [248, -130], [264, -104], [264, -60]]);
})();
const CAR_WINDOW_REAR = [[-150, -148], [-118, -194], [-24, -194], [-24, -148], [-150, -148]];
const CAR_WINDOW_FRONT = [[-4, -148], [-4, -194], [76, -194], [122, -148], [-4, -148]];

// ---------- siren glow ----------

// A soft red or blue glow on the background (swapping with the light bar),
// gently pulsing. strength 0 – 1 (to fade it in). Draw it FIRST (behind).
function SirenGlow(cx, cy, ms, strength) {
  const g = CONFIG.ui.tokens.arrival.glow;
  const c = CONFIG.ui.colors;
  const swap = floor(ms / CONFIG.ui.tokens.arrival.lightMs) % 2 === 0;
  const colour = color(swap ? c.sirenRed : c.sirenBlue);
  const pulse = 0.6 + 0.4 * sin((ms / g.pulseMs) * TWO_PI);
  const a = g.alpha * pulse * constrain(strength, 0, 1);

  // A radial gradient: the colour in the middle, see-through at the edge
  const ctx = drawingContext;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, g.radius);
  grad.addColorStop(0, 'rgba(' + red(colour) + ',' + green(colour) + ',' + blue(colour) + ',' + a + ')');
  grad.addColorStop(1, 'rgba(' + red(colour) + ',' + green(colour) + ',' + blue(colour) + ',0)');
  push();
  ctx.fillStyle = grad;
  ctx.fillRect(cx - g.radius, cy - g.radius, 2 * g.radius, 2 * g.radius);
  pop();
}

// ---------- ground line ----------

// A faint doodle line across the stage, for the car to stand on
function GroundLine(y) {
  const t = CONFIG.ui.tokens.ground;
  const shape = lineShape('ground', [{ x: 0, y: 0 }, { x: CONFIG.stage.width, y: 0 }], t);
  drawShape(shape, 0, y, CONFIG.ui.colors.chalk, { alpha: t.alpha });
}

// "Ease out back": goes a little past 1, then settles at 1 (a pop)
function easeOutBack(k) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * pow(k - 1, 3) + c1 * pow(k - 1, 2);
}

// ---------- bandit (scene 05, forgery) ----------

// A cartoon burglar in the chalk doodle style: flat cap, eye mask,
// striped shirt, sneaky tiptoe. Our own drawing (like the officer).
//   slot 0/1/2: the shirt stripes in person 01 / 02 / 03's colour, and
//               the tool from CONFIG.forgery.tools[slot]
//   pose: 'tiptoeA', 'tiptoeB' (the two steps of the sneaky walk),
//         'working' or 'running' (see BANDIT_POSES)
//   (x, feetY) = between the feet
//   options (all optional):
//     facing     'left' (default: walks to the left) or 'right' (mirrored)
//     toolAngle  extra turn of the tool, degrees (for the action)
//     snip       scissors: 0 = closed … 1 = wide open
//     size       smaller or bigger (1 = normal)
//     lean       extra lean forwards, degrees (e.g. a nod)
// Every part is a doodle shape made once (cached) with a stable seed from
// its name ('bandit-torso', 'bandit-tiptoeA-leg-front', …), so a bandit
// looks the same every frame. Parts shared by all poses (head, cap, mask,
// shirt) have ONE name, so they look the same in every pose too.
function Bandit(slot, pose, x, feetY, options) {
  const o = options || {};
  const t = CONFIG.ui.tokens.bandit;
  const c = CONFIG.ui.colors;
  const k = t.scale * (o.size ?? 1);
  const P = BANDIT_POSES[pose];
  const tool = CONFIG.forgery.tools[slot];

  push();
  translate(x, feetY);
  if (o.facing === 'right') scale(-1, 1); // mirror around the bandit's own position

  // Legs (they don't lean)
  drawShape(banditPart(pose + '-leg-back', P.legBack, k), 0, 0, c.chalk, banditInk());
  drawShape(banditPart(pose + '-leg-front', P.legFront, k), 0, 0, c.chalk, banditInk());

  // The upper body leans forward, turning around the hips
  translate(0, BANDIT_HIP * k);
  rotate(radians(-(P.lean + (o.lean ?? 0)))); // negative = the top goes left (forwards)
  drawShape(banditPart(pose + '-arm-back', P.armBack, k), 0, 0, c.chalk, banditInk());
  banditShirt(CONFIG.colors.people[slot], k);
  banditHead(k, tool === 'both');
  drawShape(banditPart(pose + '-arm-front', P.armFront, k), 0, 0, c.chalk, banditInk());

  // The tool, in the front hand (the last point of the front arm)
  const hand = P.armFront[P.armFront.length - 1];
  push();
  translate(hand[0] * k, hand[1] * k);
  rotate(radians(P.toolAngle + (o.toolAngle ?? 0)));
  if (tool === 'pencil') Pencil(0, 0, 0, k * t.toolSize);
  else Scissors(0, 0, 0, o.snip ?? 0, k * t.toolSize);
  pop();

  pop();
  if (uiDebug) debugRect(x, feetY - 215 * k, 300 * k, 430 * k, 0);
}

// The drawing options for every bandit line: a thin black edge under the
// chalk line, so a bandit stays visible in front of the white paper
// (tokens.bandit.edge px). 'more' adds other options (fill, alpha).
function banditInk(more) {
  return Object.assign({ edge: CONFIG.ui.colors.stage, edgeWidth: CONFIG.ui.tokens.bandit.edge }, more || {});
}

// One line of the bandit, scaled, as a cached doodle shape
function banditPart(name, points, k) {
  const t = CONFIG.ui.tokens.bandit;
  const pts = points.map((p) => ({ x: p[0] * k, y: p[1] * k }));
  return lineShape('bandit-' + name, pts, { stroke: t.stroke, wobble: t.wobble });
}

// The striped shirt: filled black (so nothing shows through), stripes in
// the person's colour, then the chalk outline on top
function banditShirt(colour, k) {
  const t = CONFIG.ui.tokens.bandit;
  const c = CONFIG.ui.colors;
  const shape = banditPart('torso', BANDIT_TORSO, k);
  drawShape(shape, 0, 0, c.chalk, banditInk({ fill: c.stage }));

  // The shirt is a little wider at the top: find its left / right edge at height y
  const [tl, tr, br, bl] = BANDIT_TORSO; // top-left, top-right, bottom-right, bottom-left
  const edgeL = (y) => lerp(tl[0], bl[0], (y - tl[1]) / (bl[1] - tl[1])) + t.stripe.inset;
  const edgeR = (y) => lerp(tr[0], br[0], (y - tr[1]) / (br[1] - tr[1])) - t.stripe.inset;
  push();
  noStroke();
  fill(colour);
  for (let i = 0; i < t.stripe.count; i++) {
    const y0 = t.stripe.first + i * t.stripe.step;
    const y1 = y0 + t.stripe.h;
    quad(edgeL(y0) * k, y0 * k, edgeR(y0) * k, y0 * k, edgeR(y1) * k, y1 * k, edgeL(y1) * k, y1 * k);
  }
  pop();
  drawShape(shape, 0, 0, c.chalk, banditInk()); // the outline again, over the stripes
}

// Head, flat cap, eye mask (with its two ties at the back), a sly smile.
// earPencil: bandit 03 keeps a pencil behind the ear.
function banditHead(k, earPencil) {
  const t = CONFIG.ui.tokens.bandit;
  const c = CONFIG.ui.colors;
  drawShape(circleShape('bandit-head', 96 * k, t), -8 * k, -180 * k, c.chalk, banditInk({ fill: c.stage }));
  drawShape(banditPart('cap', BANDIT_CAP, k), 0, 0, c.chalk, banditInk({ fill: c.stage }));
  drawShape(banditPart('cap-brim', [[-58, -198], [-96, -190]], k), 0, 0, c.chalk, banditInk());
  drawShape(banditPart('mask', BANDIT_MASK, k), 0, 0, c.chalk, banditInk({ fill: c.chalk }));
  drawShape(banditPart('mask-tie-1', [[40, -184], [72, -198]], k), 0, 0, c.chalk, banditInk());
  drawShape(banditPart('mask-tie-2', [[40, -172], [76, -164]], k), 0, 0, c.chalk, banditInk());
  drawShape(banditPart('smile', [[-46, -150], [-32, -144], [-18, -150]], k), 0, 0, c.chalk, banditInk());
  // Tucked behind the ear (drawn last, on top): eraser low at the back of
  // the head, tip slanting up past the back of the cap
  if (earPencil) Pencil(62 * k, -170 * k, -110, k * t.earPencil);
  // The eye holes in the mask: two black dots
  push();
  noStroke();
  fill(c.stage);
  circle(-40 * k, -177 * k, t.eyeHole * k);
  circle(-16 * k, -177 * k, t.eyeHole * k);
  pop();
}

// A big pencil. (x, y) = where it's held; it points along 'angle'
// (degrees, 0 = to the right). The tip is PENCIL_TIP from the grip.
function Pencil(x, y, angle, size) {
  const k = size ?? 1;
  const t = CONFIG.ui.tokens.bandit;
  const c = CONFIG.ui.colors;
  const style = { stroke: t.stroke, wobble: t.wobble };
  const sc = (pts) => pts.map((p) => ({ x: p[0] * k, y: p[1] * k }));
  push();
  translate(x, y);
  rotate(radians(angle));
  drawShape(lineShape('pencil-body', sc(PENCIL_BODY), style), 0, 0, c.chalk, banditInk({ fill: c.stage }));
  drawShape(lineShape('pencil-collar', sc([[78, -11], [78, 11]]), style), 0, 0, c.chalk, banditInk()); // where the sharpened wood starts
  drawShape(lineShape('pencil-eraser', sc([[-24, -11], [-24, 11]]), style), 0, 0, c.chalk, banditInk());
  drawShape(lineShape('pencil-lead', sc([[100, -4], [PENCIL_TIP.x, 0], [100, 4], [100, -4]]), style), 0, 0, c.chalk, banditInk({ fill: c.chalk }));
  pop();
}

// Scissors. (x, y) = the pivot screw; the blades point along 'angle'.
// open: 0 = closed … 1 = wide open (tokens.bandit.scissorsOpen degrees).
// One half is drawn, then the same half mirrored: both halves match.
function Scissors(x, y, angle, open, size) {
  const k = size ?? 1;
  const t = CONFIG.ui.tokens.bandit;
  const c = CONFIG.ui.colors;
  const style = { stroke: t.stroke, wobble: t.wobble };
  const sc = (pts) => pts.map((p) => ({ x: p[0] * k, y: p[1] * k }));
  const half = (t.scissorsOpen * constrain(open, 0, 1)) / 2;
  push();
  translate(x, y);
  rotate(radians(angle));
  for (const side of [-1, 1]) {
    push();
    scale(1, side); // the second half is the first one, mirrored
    rotate(radians(-half));
    drawShape(lineShape('scissors-blade', sc(SCISSORS_BLADE), style), 0, 0, c.chalk, banditInk({ fill: c.stage }));
    drawShape(lineShape('scissors-handle', sc([[-4, 2], [-26, 10]]), style), 0, 0, c.chalk, banditInk());
    drawShape(circleShape('scissors-loop', 26 * k, { stroke: t.stroke, wobble: t.wobble, ends: t.ends }), -38 * k, 14 * k, c.chalk, banditInk());
    pop();
  }
  pop();
}

// Speed lines behind something that moves fast (the running bandits).
// (x, y) = where the lines start; they trail to the right (direction 1)
// or the left (-1). strength 0–1 fades them. Same lines as the car's.
function SpeedLines(x, y, direction, strength, size) {
  const sl = CONFIG.ui.tokens.car.speedLines;
  const k = size ?? 1;
  sl.y.forEach(function (dy, i) {
    const len = sl.length[i] * k;
    const shape = lineShape('speedline-' + i + '-' + round(len), [{ x: 0, y: 0 }, { x: len, y: 0 }], sl);
    const start = direction > 0 ? x + sl.gap * k : x - sl.gap * k - len;
    drawShape(shape, start, y + dy * k, CONFIG.ui.colors.chalk, banditInk({ alpha: strength })); // a line starts at its first point
  });
}

// ---------- sound (sound.js) ----------

// "CLICK TO START", over everything, while the browser blocks sound
// (shown once at launch; sketch.js decides when).
function StartOverlay() {
  const t = CONFIG.ui.tokens.startOverlay;
  const c = CONFIG.ui.colors;
  const cx = CONFIG.stage.width / 2;
  const cy = CONFIG.stage.height / 2;
  push();
  noStroke();
  const back = color(c.stage);
  back.setAlpha(255 * t.backdrop);
  fill(back);
  rect(0, 0, CONFIG.stage.width, CONFIG.stage.height);
  pop();
  drawShape(rectShape('start-overlay', t.w, t.h, t), cx, cy, c.chalk, { fill: c.stage });
  push();
  noStroke();
  fill(c.text);
  setType('hero');
  textCentered('CLICK TO START', cx, cy - CONFIG.ui.tokens.space.xl);
  fill(c.muted);
  setType('body');
  textCentered('(the browser needs one click before it may play sound)', cx, cy + t.h / 2 - CONFIG.ui.tokens.space.xxxl);
  pop();
}

// "SOUND OFF", top right under the top bar, while muted (key U)
function SoundOffLabel() {
  const t = CONFIG.ui.tokens;
  push();
  noStroke();
  fill(CONFIG.ui.colors.sirenRed);
  setType('label');
  textAlign(RIGHT, BASELINE);
  text('SOUND OFF  (U)', CONFIG.stage.width - t.layout.margin, t.soundOff.y);
  pop();
}

// The sound log (Shift+L, for testing): the last sounds played, one per
// line: screen, seconds since that screen started, name, file / synth.
// (x, bottom) = its bottom-left corner. entries: sfxLog (sound.js), newest last.
function SoundLog(entries, x, bottom) {
  const t = CONFIG.ui.tokens.soundLog;
  const c = CONFIG.ui.colors;
  const h = soundLogHeight();
  const y = bottom - h;
  push();
  noStroke();
  fill(0, 255 * t.backdrop);
  rect(x, y, t.w, h);
  drawShape(rectShape('soundlog', t.w, h, t), x + t.w / 2, y + h / 2, c.muted);
  setType(t.text);
  textAlign(LEFT, BASELINE);
  fill(c.muted);
  text('SOUND LOG  (Shift+L)', x + t.padX, y + t.padY + t.lineH * 0.75);
  entries.forEach(function (e, i) {
    fill(e.kind === 'file' ? c.text : c.muted); // files white, synths grey
    text(sfxLogLine(e), x + t.padX, y + t.padY + (i + 1.75) * t.lineH);
  });
  pop();
  if (uiDebug) debugRect(x + t.w / 2, y + h / 2, t.w, h, 0);
}

// The sound log's height: a title line + tokens.soundLog.lines lines
function soundLogHeight() {
  const t = CONFIG.ui.tokens.soundLog;
  return 2 * t.padY + (t.lines + 1) * t.lineH;
}

// One button of the sound test: the sound's name, and below it what's
// playing ("file: …" or "synth"). (x, y) = top-left. playing = highlighted.
function SoundButton(label, sub, x, y, playing) {
  const t = CONFIG.ui.tokens.soundButton;
  const c = CONFIG.ui.colors;
  const s = CONFIG.ui.tokens.space;
  drawShape(rectShape('sound-button', t.w, t.h, t), x + t.w / 2, y + t.h / 2, playing ? CONFIG.colors.people[0] : c.chalk, { fill: playing ? c.panel : c.stage });
  push();
  noStroke();
  fill(c.text);
  setType('label');
  textAlign(LEFT, BASELINE);
  text(label, x + s.m, y + s.xl);
  fill(c.muted);
  setType('caption');
  // Too long for the button? Shorten it with "…"
  let line = sub;
  while (line.length > 1 && textWidth(line) > t.w - 2 * s.m) line = line.slice(0, -2) + '…';
  text(line, x + s.m, y + t.h - s.m);
  pop();
  if (uiDebug) debugRect(x + t.w / 2, y + t.h / 2, t.w, t.h, 0);
}

// Is the point p inside the button at (x, y)?
function overSoundButton(p, x, y) {
  const t = CONFIG.ui.tokens.soundButton;
  return p.x >= x && p.x <= x + t.w && p.y >= y && p.y <= y + t.h;
}

// ---------- case file (screen 06) ----------

// The big torn WANTED poster on the case file: paper colour, "WANTED" on
// top, and the composite (the collage, 4:5) in an ink doodle frame.
// Size L (tokens.poster.L), its own fixed tear ('poster-casefile').
// picture: the collage, or the reveal's current frame; null = blank paper
// (before the reveal starts). (cx, cy) = the middle; angle in degrees.
function CaseFilePoster(picture, cx, cy, angle) {
  const t = CONFIG.ui.tokens;
  const c = CONFIG.ui.colors;
  const w = t.poster.L[0];
  const h = t.poster.L[1];
  // White paper fibres under the tear, then the paper
  drawTorn(tornShape('poster-casefile-fibre', w + 2 * t.poster.fibre, h + 2 * t.poster.fibre), cx, cy, c.paper, angle);
  drawTorn(tornShape('poster-casefile', w, h), cx, cy, c.paper, angle);

  push();
  translate(cx, cy);
  rotate(radians(angle));
  const pad = t.space.xl;
  // WANTED, on the top padding (the same style as the WANTED posters, size L)
  noStroke();
  fill(c.ink);
  setType(t.wantedPoster.headline.L);
  textAlign(CENTER, BASELINE);
  const cap = drawingContext.measureText('H').actualBoundingBoxAscent;
  const headlineBase = -h / 2 + pad + cap;
  text('WANTED', 0, headlineBase);
  // The composite, as wide as the poster minus the padding (4:5)
  const pw = w - 2 * pad;
  const ph = (pw * CONFIG.output.height) / CONFIG.output.width;
  const px = -pw / 2;
  const py = headlineBase + t.space.l;
  if (picture) {
    image(picture, px, py, pw, ph);
  } else {
    fill(CONFIG.doodle.paper); // blank, waiting for the reveal
    rect(px, py, pw, ph);
  }
  DoodleFrame(px, py, pw, ph, c.ink);
  pop();
  if (uiDebug) debugRect(cx, cy, w, h, angle);
}

// A forensic evidence marker: a little doodle tent with a number on it.
// (cx, cy) = its middle; size: tokens.casefile.marker.
function EvidenceMarker(number, cx, cy) {
  const t = CONFIG.ui.tokens;
  const m = t.casefile.marker;
  const c = CONFIG.ui.colors;
  // The tent from the front: narrow at the top, wide at the bottom, a fold line
  const tent = [
    { x: -m.w / 2, y: m.h / 2 },
    { x: -m.w / 4, y: -m.h / 2 },
    { x: m.w / 4, y: -m.h / 2 },
    { x: m.w / 2, y: m.h / 2 },
    { x: -m.w / 2, y: m.h / 2 },
  ];
  drawShape(lineShape('evidence-marker', tent, t.evidenceMarker), cx, cy, c.chalk);
  drawShape(lineShape('evidence-marker-fold', [{ x: -m.w / 4, y: -m.h / 2 + t.space.m }, { x: m.w / 4, y: -m.h / 2 + t.space.m }], t.evidenceMarker), cx, cy, c.chalk);
  push();
  noStroke();
  fill(c.text);
  setType(t.evidenceMarker.number);
  textCentered(String(number), cx, cy + t.space.m / 2);
  pop();
  if (uiDebug) debugRect(cx, cy, m.w, m.h, 0);
}

// One row of the recipe list: "base face" on the left, "person/ 03" on the
// right in that person's colour, and a doodle rule in that colour under it.
// (x, baseline) = the left end; w = the row's width. Every rule is ONE shape.
function RecipeRow(label, slot, x, baseline, w) {
  const t = CONFIG.ui.tokens;
  const colour = CONFIG.colors.people[slot];
  push();
  noStroke();
  setType('body');
  fill(CONFIG.ui.colors.text);
  textAlign(LEFT, BASELINE);
  text(label, x, baseline);
  fill(colour);
  textAlign(RIGHT, BASELINE);
  text('person/ ' + nf(slot + 1, 2), x + w, baseline);
  pop();
  const rule = lineShape('recipe-rule', [{ x: 0, y: 0 }, { x: w, y: 0 }], { stroke: 'hairline', wobble: 'subtle' });
  drawShape(rule, x, baseline + t.casefile.recipe.rule, colour);
}

// ----- the bandit's drawing, in "bandit space" -----
// (0, 0) = between the feet, up = negative. Everything above the hips is
// measured from the HIPS (BANDIT_HIP) and leans with the pose.
const BANDIT_HIP = -190;
const BANDIT_TORSO = [[-54, -130], [50, -130], [44, 0], [-46, 0], [-54, -130]]; // the shirt (hip space)
const BANDIT_CAP = [[-60, -196], [-56, -226], [-24, -242], [24, -238], [50, -218], [52, -200], [-60, -196]];
const BANDIT_MASK = [[-60, -190], [38, -192], [40, -164], [-58, -162], [-60, -190]];
// The pencil: eraser end at x -40, the wood narrows from 78 to the lead at 100
const PENCIL_BODY = [[-40, -11], [78, -11], [100, -4], [100, 4], [78, 11], [-40, 11], [-40, -11]];
const PENCIL_TIP = { x: 110, y: 0 }; // the point of the lead, from where the pencil is held
const SCISSORS_BLADE = [[-4, -6], [76, -1], [-4, 4], [-4, -6]];

// The poses. legFront / legBack: from the hips to the toes (bandit space).
// armFront / armBack: from the shoulder to the hand (hip space; they lean
// with the body). The tool is held at the last point of armFront, turned
// by toolAngle (degrees: 0 = right, 90 = down, 180 = left, -90 = up).
// lean: how far the upper body tips forward (degrees).
const BANDIT_POSES = {
  // The sneaky walk, step 1: front knee high, tiptoeing on the back foot
  tiptoeA: {
    lean: 16,
    legFront: [[-16, -190], [-64, -132], [-52, -64], [-78, -56]],
    legBack: [[16, -190], [30, -96], [14, -14], [-6, 0]],
    armFront: [[-46, -118], [-92, -96], [-112, -128]],
    armBack: [[34, -116], [-24, -84], [-52, -112]],
    toolAngle: -130,
  },
  // Step 2: the other knee high
  tiptoeB: {
    lean: 18,
    legFront: [[-16, -190], [-34, -98], [-28, -14], [-48, 0]],
    legBack: [[16, -190], [56, -124], [72, -62], [48, -52]],
    armFront: [[-46, -118], [-96, -104], [-118, -138]],
    armBack: [[34, -116], [-20, -90], [-46, -120]],
    toolAngle: -124,
  },
  // At the poster: both feet down, the tool held out, forwards and down
  working: {
    lean: 8,
    legFront: [[-16, -190], [-26, -96], [-30, 0], [-62, 0]],
    legBack: [[16, -190], [24, -96], [26, 0], [-4, 0]],
    armFront: [[-46, -118], [-96, -84], [-130, -72]],
    armBack: [[36, -116], [54, -64], [30, -34]],
    toolAngle: 150,
  },
  // Getting away: a big stride, leaning far forward, arms swinging
  running: {
    lean: 24,
    legFront: [[-16, -190], [-80, -150], [-104, -90], [-132, -96]],
    legBack: [[16, -190], [44, -108], [104, -74], [112, -42]],
    armFront: [[-46, -118], [-76, -158], [-108, -152]],
    armBack: [[38, -116], [84, -86], [104, -114]],
    toolAngle: -160,
  },
};
const BANDIT_POSE_NAMES = ['tiptoeA', 'tiptoeB', 'working', 'running'];
