// =============================================================
// ui/debug.js — the debug overlay (D in MUGSHOT(3), or ?debug=1).
//
// Every component draws a thin RED PERFECT shape at its token size on
// top of itself. If the doodle line follows the red line everywhere,
// the element has the right size and position.
// For the page dots, the measurements are also printed to the
// browser console (once each time you switch the overlay on).
// =============================================================

let uiDebug = new URLSearchParams(window.location.search).get('debug') === '1';
let uiDebugLogged = false;

// A red perfect rectangle, centred on (cx, cy), turned by 'angle' degrees
function debugRect(cx, cy, w, h, angle) {
  push();
  translate(cx, cy);
  rotate(radians(angle || 0));
  noFill();
  stroke(CONFIG.ui.colors.debug);
  strokeWeight(1);
  rectMode(CENTER);
  rect(0, 0, w, h);
  pop();
}

// A red perfect circle of diameter d, centred on (cx, cy)
function debugCircle(cx, cy, d) {
  push();
  noFill();
  stroke(CONFIG.ui.colors.debug);
  strokeWeight(1);
  circle(cx, cy, d);
  pop();
}

// A page dot: the red reference circle, and (once) its measurements
function debugPageDot(i, x, y, shape) {
  const d = CONFIG.ui.tokens.pageDot.diameter;
  push();
  noFill();
  stroke(CONFIG.ui.colors.debug);
  strokeWeight(1);
  circle(x, y, d);
  pop();

  if (uiDebugLogged) return;
  const m = measureLoop(shape.points, 0, 0); // the shape is centred on (0, 0)
  console.log(
    'pagedot ' + nf(i, 2) +
      ' | wanted radius ' + d / 2 +
      ' | avg ' + m.avg.toFixed(2) + '  min ' + m.min.toFixed(2) + '  max ' + m.max.toFixed(2) +
      ' | gap ' + m.gapDeg.toFixed(1) + '° centred at ' + m.gapCentreDeg.toFixed(0) + '°' +
      ' | stroke ' + shape.stroke + ' | wobble ±' + shape.wobble +
      ' | seed ' + shape.seed + ' ("' + shape.name + '")' +
      ' | size from tokens.pageDot.diameter | shape ' + shape.key
  );
  if (i === 5) uiDebugLogged = true;
}

// Measure a drawn loop around the centre (cx, cy):
//   radius: average / smallest / largest distance of the line to the centre
//   gap:    360° minus how far the line goes round (negative = overshoot)
function measureLoop(points, cx, cy) {
  let sum = 0;
  let smallest = Infinity;
  let largest = -Infinity;
  let turned = 0; // how far round the centre the line goes, in radians
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const r = dist(p.x, p.y, cx, cy);
    sum += r;
    smallest = min(smallest, r);
    largest = max(largest, r);
    if (i > 0) {
      const q = points[i - 1];
      let step = atan2(p.y - cy, p.x - cx) - atan2(q.y - cy, q.x - cx);
      if (step > PI) step -= TWO_PI; // keep each step between -180° and 180°
      if (step < -PI) step += TWO_PI;
      turned += step;
    }
  }
  const first = points[0];
  const last = points[points.length - 1];
  const startDeg = (degrees(atan2(first.y - cy, first.x - cx)) + 360) % 360;
  const endDeg = (degrees(atan2(last.y - cy, last.x - cx)) + 360) % 360;
  const gapDeg = 360 - degrees(abs(turned));
  return {
    avg: sum / points.length,
    min: smallest,
    max: largest,
    gapDeg: gapDeg,
    gapCentreDeg: (endDeg + gapDeg / 2 + 360) % 360, // the middle of the opening
  };
}
