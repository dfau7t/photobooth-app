// =============================================================
// layout.js — loose, playful placement of pieces.
//
// Shared helpers. Every piece starts at its "anchor" (the same feature
// on the base face) and then gets a little random push, turn and size
// change from a table like this one (fw = width of the base face):
//
//   eyes: { x: 0.07, y: 0.05, rot: 10, size: [0.8, 1.5] }
//          ±7% fw    ±5% fw    ±10°     0.8x – 1.5x
//
//   rollVariation()   -> random push / turn / size for one piece
//   pairLooksNeat()   -> do two eyes (or ears) look too much alike?
//   coversAny()       -> does a piece cover someone's pupil, lip line, nostrils?
//   shiftInside()     -> how far to move a piece to keep it on the page
// =============================================================

// "No variation": the piece sits exactly on its anchor
const NO_VARIATION = { dx: 0, dy: 0, rot: 0, size: 1 };

// Roll the dice for one piece.
//   looseness:    0 = neat, 1 = the table, 1.5 = wilder. Scales push + turn.
//   exaggeration: 0 = every piece at its normal size, 1 = the table's sizes.
function rollVariation(row, fw, looseness, exaggeration) {
  const size = random(row.size[0], row.size[1]);
  return {
    dx: random(-row.x, row.x) * fw * looseness, // in pixels
    dy: random(-row.y, row.y) * fw * looseness,
    rot: random(-row.rot, row.rot) * looseness, // in degrees
    // e.g. size 1.4 with exaggeration 0.5 -> 1.2 (halfway to 1.4)
    size: 1 + (size - 1) * exaggeration,
  };
}

// Do the two pieces of a pair look too neat, like a mirror image?
// We want one eye higher, or tilted differently, and a different size.
function pairLooksNeat(a, b, fw, looseness, exaggeration) {
  const sameHeight = abs(a.dy - b.dy) < 0.02 * fw;
  // Same tilt, or the exact opposite tilt (a mirror image)
  const sameTilt = abs(a.rot - b.rot) < 3 || abs(a.rot + b.rot) < 3;
  const sameSize = abs(a.size - b.size) < 0.08;

  // Only complain about things that CAN change with the current settings
  const tooNeatPlace = looseness > 0 && sameHeight && sameTilt;
  const tooNeatSize = exaggeration > 0 && sameSize;
  return tooNeatPlace || tooNeatSize;
}

// Does a piece (its outline on the page) cover any of the circles?
// 'extra' = the white border around the piece.
function coversAny(outline, circles, extra) {
  return circles.some(function (c) {
    return insideShape(c, outline) || distanceToOutline(c, outline) < c.r + extra;
  });
}

// How far to move a piece so its outline (plus 'extra') stays inside the box.
// box = { left, top, right, bottom }
function shiftInside(outline, box, extra) {
  const xs = outline.map(function (p) { return p.x; });
  const ys = outline.map(function (p) { return p.y; });
  let dx = 0;
  let dy = 0;
  if (min(xs) - extra < box.left) dx = box.left - (min(xs) - extra);
  else if (max(xs) + extra > box.right) dx = box.right - (max(xs) + extra);
  if (min(ys) - extra < box.top) dy = box.top - (min(ys) - extra);
  else if (max(ys) + extra > box.bottom) dy = box.bottom - (max(ys) + extra);
  return { x: dx, y: dy };
}

// ---------- geometry helpers ----------

// Is one point inside a shape (a list of corners)? Imagine a line from
// the point going right forever. Count how many edges of the shape it
// crosses: odd = inside, even = outside.
function insideShape(p, shape) {
  let inside = false;
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
    const a = shape[i];
    const b = shape[j];
    const crosses = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

// The shortest distance from a point to the edge of a shape
function distanceToOutline(p, shape) {
  let best = Infinity;
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
    best = min(best, distanceToSegment(p, shape[j], shape[i]));
  }
  return best;
}

// The shortest distance from point p to the straight line from a to b
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy || 1;
  // How far along a -> b the closest point is (0 = at a, 1 = at b)
  const t = constrain(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  return dist(p.x, p.y, a.x + t * dx, a.y + t * dy);
}
