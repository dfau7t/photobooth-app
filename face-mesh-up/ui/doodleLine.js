// =============================================================
// ui/doodleLine.js — the hand-drawn line of the interface.
//
// THE RULE: same element = same look, everywhere, every frame.
// The hand-drawn feel comes ONLY from a small, controlled wobble of
// the line around a FIXED shape. Randomness never changes an
// element's size, position, spacing or overall shape.
//
// THE "STAMP" APPROACH
// Like a rubber stamp: we carve each shape ONCE and then print it
// wherever we need it.
//   1. Make the outline once, centred on (0, 0), at the size from the
//      tokens, with a fixed seed taken from the component's NAME
//      ("pagedot" -> always the same number). Keep it in a cache.
//   2. To draw: move to the element's position and print the kept
//      outline. Only colour and opacity change, never the line.
// Six page dots = one outline, printed six times.
//
//   circleShape(name, diameter, style)    -> a shape (made once, then reused)
//   rectShape(name, w, h, style)          -> a shape
//   lineShape(name, points, style)        -> an open line through points
//   drawShape(shape, x, y, colour, options)
//
// style (from the component's tokens):
//   stroke  a stroke level name ('hairline', 'ui', ...) or a number of px
//   wobble  a wobble level name ('none', 'subtle', 'ui', 'expressive') or px
//   ends    where the pen starts and stops (always the same for a component):
//           circle:    { gap: 12, at: 30 }   a 12° gap centred at 30° (≈ 4 o'clock)
//           rectangle: { overshoot: 8 }       starts at the top-left corner and
//                      { gap: 8 }             runs 8 px past it / stops 8 px short
//
// THE GEOMETRY RULES (in makeWobble below)
//   - the wobble is CENTRED: the average push is exactly 0, so a doodle
//     circle of radius r has an average radius of exactly r
//   - the wobble is CLAMPED: no point moves more than the wobble level
//   - the wobble follows the distance ALONG the line, never the screen
//     position, so the same shape looks the same wherever it's drawn
// =============================================================

const shapeCache = new Map(); // "pagedot|circle|40|..." -> the finished shape

// ---------- making shapes (once) ----------

function circleShape(name, diameter, style) {
  const s = resolveStyle(style);
  const ends = s.ends || {};
  const gap = ends.gap ?? 0; // degrees left open
  const at = ends.at ?? 30; // where the gap is, in degrees (0 = 3 o'clock, clockwise)
  const r = diameter / 2;

  return cachedShape(['circle', name, diameter, s.stroke, s.wobble, gap, at], function (seed) {
    // Walk clockwise round the circle, from just after the gap to just before it
    const startDeg = at + gap / 2;
    const sweepDeg = 360 - gap;
    const length = (TWO_PI * r * sweepDeg) / 360;
    const n = max(8, ceil(length / 3)); // a point every ~3 px
    const base = []; // points on the perfect circle
    const normals = []; // "outwards" at each point
    for (let i = 0; i <= n; i++) {
      const a = radians(startDeg + (sweepDeg * i) / n);
      base.push({ x: cos(a) * r, y: sin(a) * r });
      normals.push({ x: cos(a), y: sin(a) });
    }
    return {
      points: applyWobble(base, normals, s.wobble, seed),
      reference: { kind: 'circle', d: diameter },
    };
  }, name, s);
}

function rectShape(name, w, h, style) {
  const s = resolveStyle(style);
  const ends = s.ends || {};
  const overshoot = ends.overshoot ?? 0;
  const gap = ends.gap ?? 0;

  return cachedShape(['rect', name, w, h, s.stroke, s.wobble, overshoot, gap], function (seed) {
    // The corners, centred on (0, 0), clockwise from the top-left.
    // Then back to the top-left, and 'overshoot' px further along the top
    // (or stop 'gap' px before reaching the top-left again).
    const L = -w / 2;
    const R = w / 2;
    const T = -h / 2;
    const B = h / 2;
    const corners = [
      { x: L, y: T }, { x: R, y: T }, { x: R, y: B }, { x: L, y: B },
      { x: L, y: T + gap }, // back up the left side (stop 'gap' short)
    ];
    if (overshoot > 0) corners.push({ x: L + overshoot, y: T }); // a little past the start

    const base = [];
    const normals = [];
    for (let c = 0; c < corners.length - 1; c++) {
      const a = corners[c];
      const b = corners[c + 1];
      const len = dist(a.x, a.y, b.x, b.y);
      const n = max(1, ceil(len / 3));
      const out = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len }; // at right angles to this side
      for (let i = 0; i < n; i++) {
        base.push({ x: lerp(a.x, b.x, i / n), y: lerp(a.y, b.y, i / n) });
        normals.push(out);
      }
    }
    base.push(corners[corners.length - 1]);
    normals.push(normals[normals.length - 1]);
    return {
      points: applyWobble(base, normals, s.wobble, seed),
      reference: { kind: 'rect', w: w, h: h },
    };
  }, name, s);
}

// An open line through some points (already in local coordinates)
function lineShape(name, points, style) {
  const s = resolveStyle(style);
  const key = points.map((p) => round(p.x) + ',' + round(p.y)).join(' ');
  return cachedShape(['line', name, key, s.stroke, s.wobble], function (seed) {
    const base = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const n = max(1, ceil(dist(a.x, a.y, b.x, b.y) / 3));
      for (let k = 0; k < n; k++) base.push({ x: lerp(a.x, b.x, k / n), y: lerp(a.y, b.y, k / n) });
    }
    base.push(points[points.length - 1]);
    // "Outwards" for an open line: at right angles to the line at each point
    const normals = base.map(function (p, i) {
      const before = base[max(0, i - 1)];
      const after = base[min(base.length - 1, i + 1)];
      const len = dist(before.x, before.y, after.x, after.y) || 1;
      return { x: (after.y - before.y) / len, y: -(after.x - before.x) / len };
    });
    return { points: applyWobble(base, normals, s.wobble, seed), reference: null };
  }, name, s);
}

// ---------- drawing (every frame) ----------

// Print a kept shape at (x, y).
// options: alpha (0–1), progress (0–1, how much of the line), angle (degrees),
//          fill (a colour: fill the inside first, e.g. the car body in black,
//          so what's behind it doesn't show through),
//          edge (a colour: a dark edge around the line, edgeWidth px; the bandits)
function drawShape(shape, x, y, colour, options) {
  const o = options || {};
  const c = color(colour);
  c.setAlpha(255 * (o.alpha ?? 1));
  const count = round(shape.points.length * constrain(o.progress ?? 1, 0, 1));
  if (count < 2) return;

  push();
  translate(x, y);
  if (o.angle) rotate(radians(o.angle));
  if (o.fill) {
    // The inside, as a closed flat shape (the outline is drawn on top)
    noStroke();
    fill(o.fill);
    beginShape();
    for (const p of shape.points) vertex(p.x, p.y);
    endShape(CLOSE);
  }
  noFill();
  strokeCap(ROUND);
  strokeJoin(ROUND);
  if (o.edge) {
    // A dark edge: the same line, a little thicker, underneath. On the black
    // stage you can't see it; on white paper it keeps the chalk line visible.
    const e = color(o.edge);
    e.setAlpha(255 * (o.alpha ?? 1));
    stroke(e);
    strokeWeight(shape.stroke + 2 * (o.edgeWidth ?? 3));
    beginShape();
    for (let i = 0; i < count; i++) vertex(shape.points[i].x, shape.points[i].y);
    endShape();
  }
  stroke(c);
  strokeWeight(shape.stroke);
  beginShape();
  for (let i = 0; i < count; i++) vertex(shape.points[i].x, shape.points[i].y);
  endShape();
  pop();
}

// ---------- the geometry rules ----------

// Push every point 'outwards' (or inwards) by a small smooth amount.
//   1. take a smooth noise value per point, from the distance ALONG the line
//   2. CENTRE it: subtract the average, so on average nothing moves
//   3. CLAMP it: scale so the biggest push is exactly the wobble level
function applyWobble(base, normals, level, seed) {
  if (level <= 0) return base.map((p) => ({ x: p.x, y: p.y }));

  const pushes = withSeed(seed, function () {
    const start = random(1000); // where in the noise this shape reads (fixed by the seed)
    let along = 0; // distance along the line so far
    return base.map(function (p, i) {
      if (i > 0) along += dist(p.x, p.y, base[i - 1].x, base[i - 1].y);
      const n = noise(start + along * CONFIG.ui.tokens.wobbleFreq); // 0 .. 1
      return constrain(map(n, 0.25, 0.75, -1, 1), -1, 1);
    });
  });

  // 2. centre
  const average = pushes.reduce((a, b) => a + b, 0) / pushes.length;
  const centred = pushes.map((v) => v - average);
  // 3. clamp: the biggest push becomes exactly 'level'
  const biggest = max(centred.map(abs)) || 1;

  return base.map(function (p, i) {
    const d = (centred[i] / biggest) * level;
    return { x: p.x + normals[i].x * d, y: p.y + normals[i].y * d };
  });
}

// ---------- helpers ----------

// Turn level names into px: 'ui' -> 4 (stroke) / 3 (wobble)
function resolveStyle(style) {
  const t = CONFIG.ui.tokens;
  const st = style || {};
  return {
    stroke: typeof st.stroke === 'number' ? st.stroke : t.stroke[st.stroke ?? 'ui'],
    wobble: typeof st.wobble === 'number' ? st.wobble : t.wobble[st.wobble ?? 'ui'],
    ends: st.ends,
  };
}

// Make a shape once; afterwards, return the kept one.
// The optional "line boil" (tokens.boil, off by default) cycles through a
// few kept versions of the same shape, the same for every element.
function cachedShape(keyParts, make, name, s) {
  const boil = CONFIG.ui.tokens.boil;
  const frame = boil.on ? floor((millis() * boil.fps) / 1000) % boil.frames : 0;
  const key = keyParts.join('|') + '|boil' + frame;
  if (!shapeCache.has(key)) {
    // The seed comes from the NAME. Boil frames add a little, so each
    // boil frame wobbles differently (frame 0 = the normal shape).
    const seed = seedFrom(name) + frame * 7919;
    const made = make(seed);
    made.name = name;
    made.stroke = s.stroke;
    made.wobble = s.wobble;
    made.seed = seed;
    made.key = key;
    shapeCache.set(key, made);
  }
  return shapeCache.get(key);
}

// A fixed number from a name: "pagedot" always gives the same number.
// (Adds up the letter codes in a mixing way; the details don't matter.)
function seedFrom(name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = (h * 33 + name.charCodeAt(i)) % 2147483647;
  return h;
}

// Run 'work' with random() and noise() fixed to a seed, so it gives the
// same result every time. Afterwards, random() and noise() go back to
// being unpredictable. Otherwise everything after it would be "fixed"
// too, e.g. the recipe would come out the same every round.
// (Math.random() is the browser's own random, which randomSeed doesn't touch.)
function withSeed(seed, work) {
  randomSeed(seed);
  noiseSeed(seed);
  const result = work();
  randomSeed(floor(Math.random() * 1e9));
  noiseSeed(floor(Math.random() * 1e9));
  return result;
}
