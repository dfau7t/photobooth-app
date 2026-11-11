// =============================================================
// hair.js — a doodled hairstyle on top of the head outline.
//
//   pickHairStyle()         -> 'spikes' | 'loops' | 'flat' | 'none'
//   hairPath(style, head)   -> { points, sharp } or null for 'none'
//
// 'head' is the clean head outline on the page (from doodle.js),
// before it gets wobbly. The hair follows the TOP of it.
//
//   spikes -> a zig-zag crown of 3–6 sharp peaks
//   loops  -> a scribble of small curls along the top of the head
//   flat   -> one bumpy fringe line across the forehead
//   none   -> no hair
// =============================================================

const HAIR_STYLES = ['spikes', 'loops', 'flat', 'none'];

// The style from the config, or a random one ('random')
function pickHairStyle() {
  const style = CONFIG.doodle.hairStyle;
  return style === 'random' ? random(HAIR_STYLES) : style;
}

function hairPath(style, head) {
  if (style === 'none') return null;

  // Make the outline smooth and detailed first, so we can pick
  // points anywhere along it
  const outline = smoothPoints(head, true);
  const middle = averagePoint(outline);
  const ys = outline.map(function (p) { return p.y; });
  const headHeight = max(ys) - min(ys);

  if (style === 'spikes') return spikesHair(outline, middle, headHeight);
  if (style === 'loops') return loopsHair(outline, middle);
  if (style === 'flat') return flatHair(outline, middle, headHeight);
  return null;
}

// ---------- the three styles ----------

// Zig-zag: valleys sit ON the head line, peaks stick out above it
function spikesHair(outline, middle, headHeight) {
  const arc = topArc(outline, middle, -0.75 * PI, -0.25 * PI);
  const peaks = floor(random(3, 7)); // 3, 4, 5 or 6
  const points = [];
  for (let j = 0; j <= peaks * 2; j++) {
    const p = pointAlong(arc, j / (peaks * 2));
    if (j % 2 === 1) {
      // Odd steps are peaks, each one a different height. They point
      // halfway between "away from the head" and "straight up", so the
      // ones at the sides still look like a crown, not like ears.
      const out = outwards(p, middle);
      const dir = { x: out.x * 0.5, y: out.y * 0.5 - 0.5 };
      const h = random(0.06, 0.13) * headHeight;
      points.push({ x: p.x + dir.x * h * 1.4, y: p.y + dir.y * h * 1.4 });
    } else {
      points.push(p); // even steps are valleys, on the head line
    }
  }
  return { points: points, sharp: true }; // sharp: keep the pointy peaks
}

// Curls: a point travels along the top of the head while spinning in
// small circles. Because it spins faster than it travels, it draws loops.
function loopsHair(outline, middle) {
  const arc = topArc(outline, middle, -0.85 * PI, -0.15 * PI);
  const count = floor(random(7, 12)); // how many curls
  const r = (pathLength(arc) / count) * 0.4; // size of one curl
  const steps = count * 24; // points per curl x curls

  const points = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const p = pointAlong(arc, t);
    const out = outwards(p, middle);
    const along = { x: -out.y, y: out.x }; // the direction along the head line
    const turn = t * count * TWO_PI; // how far round the current curl
    points.push({
      x: p.x + out.x * r * (1 - cos(turn)) + along.x * r * sin(turn),
      y: p.y + out.y * r * (1 - cos(turn)) + along.y * r * sin(turn),
    });
  }
  return { points: points, sharp: true }; // already smooth and detailed
}

// Fringe: a line across the forehead, from one side of the head to the
// other, with bumps hanging down like a row of bangs
function flatHair(outline, middle, headHeight) {
  const arc = topArc(outline, middle, -0.82 * PI, -0.18 * PI);
  const left = arc[0];
  const right = arc[arc.length - 1];
  const bumps = floor(random(4, 8));
  const depth = 0.03 * headHeight;

  // "down" = at right angles to the left -> right line
  const len = dist(left.x, left.y, right.x, right.y);
  const down = { x: -(right.y - left.y) / len, y: (right.x - left.x) / len };

  const points = [];
  const steps = bumps * 12;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const bump = abs(sin(t * bumps * PI)) * depth; // 0 between bumps, 'depth' in the middle of one
    points.push({
      x: lerp(left.x, right.x, t) + down.x * bump,
      y: lerp(left.y, right.y, t) + down.y * bump,
    });
  }
  return { points: points, sharp: true };
}

// ---------- helpers ----------

// The part of the outline between two angles, measured around the middle
// of the head. Angles in p5 go clockwise from "3 o'clock", and up is
// negative, so -0.8 PI .. -0.2 PI is the top of the head, left to right.
function topArc(outline, middle, fromAngle, toAngle) {
  const withAngles = outline.map(function (p) {
    return { x: p.x, y: p.y, angle: atan2(p.y - middle.y, p.x - middle.x) };
  });
  const arc = withAngles.filter(function (p) {
    return p.angle >= fromAngle && p.angle <= toAngle;
  });
  arc.sort(function (a, b) {
    return a.angle - b.angle;
  });
  return arc;
}

// A point part of the way along a list of points (t: 0 = start, 1 = end)
function pointAlong(points, t) {
  const where = t * (points.length - 1);
  const i = floor(where);
  const j = min(i + 1, points.length - 1);
  const f = where - i; // how far between point i and point j
  return { x: lerp(points[i].x, points[j].x, f), y: lerp(points[i].y, points[j].y, f) };
}

// The direction from the middle of the head out through p (length 1)
function outwards(p, middle) {
  const dx = p.x - middle.x;
  const dy = p.y - middle.y;
  const len = sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / len, y: dy / len };
}
