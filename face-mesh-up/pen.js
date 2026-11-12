// =============================================================
// pen.js — make a line look drawn by hand with a felt-tip pen.
//
//   handDrawn(points, options) -> a new, wobbly list of points
//   penStrokes(points, weight) -> the line cut into strokes of different thickness
//   drawStrokes(g, strokes, colour)
//
// Used by the doodle collage AND by the interface (via ui/doodleLine.js).
//
// The steps, for every line:
//   1. SMOOTH:   turn the few landmark points into a smooth curve
//   2. RESAMPLE: put points evenly along it, every ~6 px
//   3. START/END (loops only): a real pen doesn't close a loop exactly,
//      it stops a bit short (gap) or goes a bit too far (overshoot)
//   4. WOBBLE:   push each point a little sideways, using noise(),
//      so the line slowly drifts like a hand
//   5. DRAW:     in short pieces, each with a slightly different thickness
// =============================================================

// SHARED: the collage uses these functions, and so does the interface
// (ui/doodleLine.js), so the UI and the final poster have the same line.
// Every setting is optional: anything left out comes from
// CONFIG.doodle.line (the collage's pen). The UI passes its own, thinner values.

// Turn a list of points into a hand-drawn version of it.
// options.closed:  true = the line is a loop (the head)
// options.sharp:   true = keep the corners (hair spikes), don't round them
// options.wobble:  how far the line drifts sideways (px)
// options.spacing: a point every this many px
function handDrawn(points, options) {
  const cfg = CONFIG.doodle.line;
  // 'a ?? b' means: use a, but if a wasn't given, use b
  const spacing = options.spacing ?? cfg.spacing;
  const wobbleAmount = options.wobble ?? cfg.wobble;

  let pts = options.sharp ? points.slice() : smoothPoints(points, options.closed);
  if (options.closed) pts.push(pts[0]); // walk all the way round, back to the start
  pts = resample(pts, spacing);
  if (options.closed) pts = penStartAndEnd(pts);
  return wobble(pts, wobbleAmount);
}

// ---------- 1. smooth ----------

// Put extra points between the given points, along a smooth curve.
// curvePoint() is p5's maths behind curveVertex(): it finds a point on
// the curve between b and c, using a and d to know how the curve bends.
function smoothPoints(points, closed) {
  const n = points.length;
  const out = [];
  const steps = 8; // new points per gap

  // The neighbour of point i. At the ends of an open line, use the end
  // point itself. For a loop, go round to the other side.
  function at(i) {
    if (closed) return points[(i + n) % n];
    return points[constrain(i, 0, n - 1)];
  }

  const gaps = closed ? n : n - 1;
  for (let i = 0; i < gaps; i++) {
    const a = at(i - 1);
    const b = at(i);
    const c = at(i + 1);
    const d = at(i + 2);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({
        x: curvePoint(a.x, b.x, c.x, d.x, t),
        y: curvePoint(a.y, b.y, c.y, d.y, t),
      });
    }
  }
  if (!closed) out.push(points[n - 1]); // the very last point
  return out;
}

// ---------- 2. resample ----------

// Walk along the line and drop a point every 'spacing' pixels,
// so the points are evenly spread.
function resample(points, spacing) {
  const out = [points[0]];
  let need = spacing; // how far until the next point

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = dist(a.x, a.y, b.x, b.y);
    let pos = 0; // how far along this little segment we are
    while (len - pos >= need) {
      pos += need;
      out.push({ x: lerp(a.x, b.x, pos / len), y: lerp(a.y, b.y, pos / len) });
      need = spacing;
    }
    need -= len - pos; // the rest carries over to the next segment
  }

  // Keep the real end point too (unless we're right on top of it)
  const last = points[points.length - 1];
  const end = out[out.length - 1];
  if (dist(last.x, last.y, end.x, end.y) > spacing * 0.3) out.push(last);
  return out;
}

// The total length of a line
function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += dist(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
  }
  return total;
}

// ---------- 3. start and end of a loop ----------

// Start the loop at a random place, and end it with a small gap
// or a small overshoot (0–4% of the loop's length), like a real pen.
function penStartAndEnd(points) {
  const loop = points.slice(0, points.length - 1); // drop the copy of the start point
  const n = loop.length;

  // Start somewhere random
  const start = floor(random(n));
  const turned = loop.slice(start).concat(loop.slice(0, start));

  // How many points the gap or overshoot is (points are evenly spaced)
  const extra = floor(random(0, 0.04) * n);
  if (random() < 0.5) {
    // Gap: stop before reaching the start again
    return turned.slice(0, n - extra);
  }
  // Overshoot: go round to the start, then a bit further.
  // The wobble (next step) makes the second time round drift apart.
  return turned.concat(turned.slice(0, extra + 1));
}

// ---------- 4. wobble ----------

// Push every point a little to the side (at right angles to the line).
// noise() gives SMOOTH random values: neighbours get similar values,
// so the line drifts slowly instead of shaking.
function wobble(points, amount) {
  const speed = CONFIG.doodle.line.wobbleSpeed; // how fast the drift changes
  const noiseStart = random(1000); // each line gets its own stretch of noise
  const n = points.length;

  return points.map(function (p, i) {
    // The direction of the line here, from the point before to the point after
    const before = points[max(0, i - 1)];
    const after = points[min(n - 1, i + 1)];
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const len = sqrt(dx * dx + dy * dy) || 1;

    // Turn that direction 90°: that's "sideways"
    const sideX = -dy / len;
    const sideY = dx / len;

    // noise() mostly gives values between 0.25 and 0.75,
    // so we stretch that range to -amount .. +amount
    const push = map(noise(noiseStart + i * speed), 0.25, 0.75, -amount, amount);
    return { x: p.x + sideX * push, y: p.y + sideY * push };
  });
}

// ---------- 5. draw ----------

// Cut the line into short, overlapping "strokes". Each stroke gets a
// slightly different thickness, so the line swells and thins like a felt-tip.
// (One p5 shape can only have one thickness, that's why we cut it up.)
// Returns a list of { points, weight }. We work this out ONCE, so the
// animation can draw the strokes one by one and look exactly like the
// finished picture.
// 'variation' is optional: how much thicker / thinner (0.15 = ±15%).
function penStrokes(points, weight, variation) {
  variation = variation ?? CONFIG.doodle.line.weightVariation;
  const pieceLength = 6; // points per stroke
  const noiseStart = random(1000);

  const strokes = [];
  for (let i = 0; i < points.length - 1; i += pieceLength) {
    // Each stroke shares its first point with the end of the previous one
    const piece = points.slice(i, min(points.length, i + pieceLength + 1));
    const change = map(noise(noiseStart + i * 0.05), 0.25, 0.75, -variation, variation);
    strokes.push({ points: piece, weight: weight * (1 + change) });
  }
  return strokes;
}

// Draw one stroke
function drawStroke(g, stroke, colour) {
  g.noFill();
  g.stroke(colour);
  g.strokeCap(ROUND); // round ends hide the joins between the strokes
  g.strokeJoin(ROUND);
  g.strokeWeight(stroke.weight);
  drawPath(g, stroke.points, false);
}

// Draw a whole list of strokes.
// 'count' is optional: only draw the first 'count' strokes
// (used to make a line "draw itself on", bit by bit).
function drawStrokes(g, strokes, colour, count) {
  const n = count ?? strokes.length;
  for (let i = 0; i < n && i < strokes.length; i++) drawStroke(g, strokes[i], colour);
}
