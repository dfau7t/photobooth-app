// =============================================================
// features.js — WHERE each feature is on a face, and the maths
// to line a feature from one face up with another face.
//
// The idea of a "part":
//   Every piece we cut out is described as a "part":
//     center  -> where it sits on the face (camera pixels)
//     angle   -> how tilted the face is (the eye line), in radians
//     w, h    -> size of the rectangle, measured ALONG the eye line
//                (so the rectangle tilts with the head)
//     outline -> points around the feature, for cutStyle "shape"
//                (relative to the center, also measured along the eye line)
//     core    -> the same outline WITHOUT padding: the feature itself
//                (null for ears)
//   Eyes, nose and lips are 1 part each. Ears are 2 parts (left + right).
// =============================================================

const FEATURES = ['eyes', 'nose', 'ears', 'lips'];

// Landmark numbers for the eye corners (used for eye line + eye distance)
const RIGHT_EYE_CORNERS = [33, 133];
const LEFT_EYE_CORNERS = [362, 263];

// Padding around each feature, as a fraction of its size, on each side
const PADDING = { eyes: 0.15, nose: 0.2, lips: 0.3 };

// Ear size, as a fraction of the face width (faceMesh has no ear points)
const EAR_WIDTH = 0.22;
const EAR_HEIGHT = 0.38;

// ---------- small maths helpers ----------

// The average (middle) of a list of points
function averagePoint(points) {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

// Pick some keypoints by their numbers
function pickPoints(face, indexes) {
  return indexes.map(function (i) {
    return face.keypoints[i];
  });
}

// Centres of both eyes, sorted left -> right in the camera image
function eyeCenters(face) {
  const a = averagePoint(pickPoints(face, RIGHT_EYE_CORNERS));
  const b = averagePoint(pickPoints(face, LEFT_EYE_CORNERS));
  return a.x < b.x ? [a, b] : [b, a];
}

// Distance between the eyes: we use this to compare face sizes
function eyeDistance(face) {
  const e = eyeCenters(face);
  return dist(e[0].x, e[0].y, e[1].x, e[1].y);
}

// The tilt of the head: the angle of the line from one eye to the other.
// 0 = perfectly level.
function eyeAngle(face) {
  const e = eyeCenters(face);
  return atan2(e[1].y - e[0].y, e[1].x - e[0].x);
}

// "Level" a point: move it so `center` is at 0,0, then rotate it so
// the eye line is horizontal. This makes tilted faces easy to measure.
function toLevel(p, center, angle) {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: dx * cos(-angle) - dy * sin(-angle),
    y: dx * sin(-angle) + dy * cos(-angle),
  };
}

// The opposite of toLevel(): back to camera pixels
function fromLevel(p, center, angle) {
  return {
    x: center.x + p.x * cos(angle) - p.y * sin(angle),
    y: center.y + p.x * sin(angle) + p.y * cos(angle),
  };
}

// The smallest shape that wraps around all the points,
// like a rubber band stretched around pins. (Called a "convex hull".)
function convexHull(points) {
  const pts = points.map(function (p) {
    return { x: p.x, y: p.y };
  });
  pts.sort(function (a, b) {
    return a.x - b.x || a.y - b.y;
  });
  if (pts.length < 3) return pts;

  // Is the turn o -> a -> b a left turn (> 0) or a right turn (< 0)?
  function turn(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  // Walk along the bottom, then along the top, and drop any
  // point that would make the band bend inwards.
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// ---------- finding the parts ----------

// Which landmark points make up each feature
function featurePoints(face, feature) {
  if (feature === 'eyes') {
    return face.leftEye.keypoints
      .concat(face.rightEye.keypoints)
      .concat(face.leftEyebrow.keypoints)
      .concat(face.rightEyebrow.keypoints);
  }
  if (feature === 'nose') return pickPoints(face, NOSE_POINTS);
  if (feature === 'lips') return face.lips.keypoints;
  return [];
}

// Return the list of parts for one feature of one face.
//
// 'options' is optional (Experiment A leaves it out):
//   options.splitEyes -> true = two separate eye parts (eye + brow each)
//                        instead of one strip across both eyes
//   options.padding   -> { eyes, nose, lips } to use instead of PADDING
function featureParts(face, feature, options) {
  const opts = options || {};
  const padding = opts.padding || PADDING;
  const angle = eyeAngle(face);
  if (feature === 'ears') return earParts(face, angle);

  if (feature === 'eyes' && opts.splitEyes) {
    const parts = [
      partFromPoints(face.rightEye.keypoints.concat(face.rightEyebrow.keypoints), angle, padding.eyes),
      partFromPoints(face.leftEye.keypoints.concat(face.leftEyebrow.keypoints), angle, padding.eyes),
    ];
    // Always the left eye (in the camera image) first, so eye 1 of one
    // face matches eye 1 of another, just like the ears
    parts.sort(function (a, b) {
      return a.center.x - b.center.x;
    });
    return parts;
  }

  return [partFromPoints(featurePoints(face, feature), angle, padding[feature])];
}

// One part: the tilted rectangle around some points, plus padding
function partFromPoints(points, angle, pad) {
  // 1. Level the points around their middle
  const middle = averagePoint(points);
  const level = points.map(function (p) {
    return toLevel(p, middle, angle);
  });

  // 2. Find the rectangle around the levelled points
  const xs = level.map(function (p) { return p.x; });
  const ys = level.map(function (p) { return p.y; });
  const left = min(xs);
  const right = max(xs);
  const top = min(ys);
  const bottom = max(ys);
  const boxCenter = { x: (left + right) / 2, y: (top + bottom) / 2 };

  // 3. Add padding on each side
  const w = (right - left) * (1 + 2 * pad);
  const h = (bottom - top) * (1 + 2 * pad);

  // 4. The feature's own outline (no padding), centred on the box.
  //    A cut must never go inside this line.
  const core = convexHull(level).map(function (p) {
    return { x: p.x - boxCenter.x, y: p.y - boxCenter.y };
  });

  // 5. Outline for the "shape" cut: the same, made bigger by the padding
  const outline = core.map(function (p) {
    return { x: p.x * (1 + pad), y: p.y * (1 + pad) };
  });

  return {
    center: fromLevel(boxCenter, middle, angle),
    angle: angle,
    w: w,
    h: h,
    outline: outline,
    core: core,
  };
}

// Ears: guessed from the two edge points of the face (234 and 454).
// Each ear is a box just outside the edge point.
function earParts(face, angle) {
  const edges = pickPoints(face, EAR_EDGE_POINTS);
  const middle = averagePoint(edges);
  const faceWidth = dist(edges[0].x, edges[0].y, edges[1].x, edges[1].y);
  const w = faceWidth * EAR_WIDTH;
  const h = faceWidth * EAR_HEIGHT;

  const parts = [];
  for (const edge of edges) {
    const e = toLevel(edge, middle, angle);
    const side = e.x < 0 ? -1 : 1; // -1 = left side of the face, +1 = right side
    const earCenter = { x: e.x + side * w * 0.5, y: e.y };
    parts.push({
      side: side,
      center: fromLevel(earCenter, middle, angle),
      angle: angle,
      w: w,
      h: h,
      outline: null, // no ear points, so "shape" uses an oval instead
      core: null, // we don't know exactly where the ear is
    });
  }
  // Always left ear first, so ear 1 of one face matches ear 1 of another
  parts.sort(function (a, b) {
    return a.side - b.side;
  });
  return parts;
}

// ---------- key areas: what must never be covered ----------

// The most important spots of each part: if another piece covers one
// of these, you can't recognise the feature any more.
//   eyes -> the eye itself (where the pupil is)
//   nose -> the nostrils
//   lips -> the line where the lips meet
//   ears -> nothing (they're our best guess anyway)
// Each spot is a circle { x, y, r } in camera pixels.
// Returns one list of circles per part, in the same order as featureParts().
function keyAreas(face, feature, options) {
  const opts = options || {};

  if (feature === 'ears') return [[], []];

  if (feature === 'eyes') {
    const eyes = [eyeKey(face.rightEye.keypoints), eyeKey(face.leftEye.keypoints)];
    eyes.sort(function (a, b) {
      return a.x - b.x; // left first, like featureParts()
    });
    return opts.splitEyes ? [[eyes[0]], [eyes[1]]] : [eyes];
  }

  if (feature === 'nose') {
    const wings = pickPoints(face, [98, 327]);
    const middle = averagePoint(pickPoints(face, [98, 327, 2]));
    const r = 0.4 * dist(wings[0].x, wings[0].y, wings[1].x, wings[1].y);
    return [[{ x: middle.x, y: middle.y, r: r }]];
  }

  // Lips: three circles along the line from one mouth corner to the other
  const pts = face.lips.keypoints;
  const xs = pts.map(function (p) { return p.x; });
  const ys = pts.map(function (p) { return p.y; });
  const leftCorner = pts[xs.indexOf(min(xs))];
  const rightCorner = pts[xs.indexOf(max(xs))];
  const r = 0.3 * (max(ys) - min(ys)); // a bit less than the lips are tall
  const circles = [0.25, 0.5, 0.75].map(function (t) {
    return {
      x: lerp(leftCorner.x, rightCorner.x, t),
      y: lerp(leftCorner.y, rightCorner.y, t),
      r: r,
    };
  });
  return [circles];
}

// One eye's key spot: its middle, about as big as the iris
function eyeKey(points) {
  const middle = averagePoint(points);
  const xs = points.map(function (p) { return p.x; });
  return { x: middle.x, y: middle.y, r: 0.3 * (max(xs) - min(xs)) };
}
