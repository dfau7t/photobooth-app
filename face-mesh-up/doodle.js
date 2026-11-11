// =============================================================
// doodle.js — turn the BASE person's face into a line drawing.
//
//   makeDoodlePaths(face, toPage) -> { head, neckLeft, neckRight, nose }
//   drawPath(g, points, closed)    -> draws one smooth line
//
// Every "path" is just a list of points { x, y } on the output page,
// in the order a pen would visit them.
//
// 'toPage' is a function that moves a CAMERA point onto the page
// (made in collageDoodle.js). We give it to this file, so the doodle
// code doesn't need to know where the head sits on the page.
//
// These are the CLEAN paths. pen.js makes them look hand-drawn,
// and hair.js adds the hair on top of the head.
// =============================================================

// Landmark numbers (indexes into face.keypoints)
const NECK_POINTS = [172, 397]; // left and right of the jaw, where the neck starts
// The nose line: from between the eyes, down the bridge, to the tip.
// (168 is fine HERE: this is a drawn line, not a photo piece.)
const NOSE_BRIDGE = [168, 6, 197, 195, 5, 4, 1];
const NOSE_UNDER = 2; // just below the tip
const NOSE_WINGS = [98, 327]; // left and right nostril wing, for the little hook

// Build all the paths for one face
function makeDoodlePaths(face, toPage) {
  const cfg = CONFIG.doodle;
  const head = headPath(face, toPage, cfg.head.topStretch);

  // The middle of the head on the page: the neck leans towards it
  const middle = averagePoint(head);

  return {
    head: head,
    neckLeft: neckPath(face.keypoints[NECK_POINTS[0]], toPage, middle),
    neckRight: neckPath(face.keypoints[NECK_POINTS[1]], toPage, middle),
    nose: nosePath(face, toPage),
  };
}

// ---------- the head outline ----------

// The faceOval points, in order around the face, with the top
// stretched up a little so the head looks round (the face oval itself
// stops at the forehead, but a drawn head goes up to the top of the skull).
function headPath(face, toPage, topStretch) {
  const points = face.faceOval.keypoints.map(toPage);
  const middle = averagePoint(points);

  // 1. Put the points in order around the middle, like the numbers
  //    on a clock. We don't trust the order ml5 gives us.
  points.sort(function (a, b) {
    return atan2(a.y - middle.y, a.x - middle.x) - atan2(b.y - middle.y, b.x - middle.x);
  });

  // 2. Stretch the top upwards. The highest point moves up the most,
  //    points at the height of the middle don't move at all.
  const ys = points.map(function (p) { return p.y; });
  const top = min(ys);
  const faceHeight = max(ys) - top;
  return points.map(function (p) {
    if (p.y >= middle.y) return p; // lower half: unchanged
    const howHigh = (middle.y - p.y) / (middle.y - top); // 0 at the middle, 1 at the top
    return { x: p.x, y: p.y - topStretch * faceHeight * howHigh };
  });
}

// ---------- the neck ----------

// One straight line from a jaw point down to the bottom of the page,
// leaning in a little towards the middle (necks are narrower than jaws).
// The two lines are a bit different, as if drawn by hand:
// each leans a different amount, and one may stop just short of the edge.
function neckPath(jawPoint, toPage, headMiddle) {
  const start = toPage(jawPoint);
  // 0 = straight down, 0.2 = leans 20% of the way to the middle
  const lean = CONFIG.doodle.neck.lean * random(0.6, 1.4);
  const end = {
    x: start.x + (headMiddle.x - start.x) * lean,
    y: CONFIG.output.height * (1 - random(0, 0.03)),
  };
  return [start, end];
}

// ---------- the nose ----------

// Down the bridge to the tip, then a small hook under the nose,
// towards the left or right nostril wing (picked at random).
function nosePath(face, toPage) {
  const path = pickPoints(face, NOSE_BRIDGE).map(toPage);
  const under = toPage(face.keypoints[NOSE_UNDER]);
  const wing = toPage(face.keypoints[random(NOSE_WINGS)]);

  path.push(under);
  // The hook ends halfway to the nostril wing, so it stays small
  path.push({ x: (under.x + wing.x) / 2, y: (under.y + wing.y) / 2 });
  return path;
}

// ---------- drawing ----------

// Draw a list of points as one smooth line.
// curveVertex() draws a smooth curve THROUGH the points, but it needs
// one extra point at each end to know which way the curve is heading.
function drawPath(g, points, closed) {
  if (points.length < 2) return;
  const n = points.length;

  g.beginShape();
  if (closed) {
    // Loop: start with the last point and end with the first two,
    // so the curve joins up smoothly where it started.
    g.curveVertex(points[n - 1].x, points[n - 1].y);
    for (const p of points) g.curveVertex(p.x, p.y);
    g.curveVertex(points[0].x, points[0].y);
    g.curveVertex(points[1].x, points[1].y);
  } else {
    // Open line: repeat the first and last point
    g.curveVertex(points[0].x, points[0].y);
    for (const p of points) g.curveVertex(p.x, p.y);
    g.curveVertex(points[n - 1].x, points[n - 1].y);
  }
  g.endShape();
}
