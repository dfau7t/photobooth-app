// =============================================================
// owners.js — Experiment B: show who gave which piece, plus the caption.
//
//   drawOwnerMarks(g, plans)   -> a coloured dot or strip of tape on each sticker
//   drawCaption(g, recipe)     -> "mesh no. 0042 — 02 · 01 · 03", handwritten
//
// The stickers are in natural colour (no colour blocks like Experiment A),
// so the person colours (red, yellow, blue) only appear in these marks.
//
// Each plan (from collageDoodle.js) has:
//   plan.outline -> the sticker's corners on the page
//   plan.pos     -> its centre on the page
//   plan.keys    -> its key spots (pupil, lip line, nostrils) as circles
// =============================================================

// ---------- owner marks: dot or tape ----------

function drawOwnerMarks(g, plans) {
  const cfg = CONFIG.doodle.owners;
  if (cfg.mark === 'none') return;

  const keys = allKeys(plans);
  for (const plan of plans) {
    // Dots need a little room, tape needs room for half its length
    const room = cfg.mark === 'tape' ? cfg.tapeLength / 2 : cfg.dotSize;
    const corner = pickCorner(plan, keys, room);
    if (cfg.mark === 'tape') drawTape(g, corner, plan.person);
    else drawDot(g, corner, plan.person);
  }
}

// A small filled circle, stuck just inside a corner of the sticker
function drawDot(g, corner, person) {
  const size = CONFIG.doodle.owners.dotSize;
  g.push();
  setMarkColours(g, person, 1);
  g.circle(corner.x, corner.y, size);
  g.pop();
}

// A short strip of coloured tape across a corner of the sticker,
// as if it was taped onto the page
function drawTape(g, corner, person) {
  const cfg = CONFIG.doodle.owners;
  g.push();
  g.translate(corner.x, corner.y);
  // Across the corner: at right angles to the line from the centre to the corner,
  // with a little randomness so it looks stuck on by hand
  g.rotate(corner.angle + HALF_PI + random(-0.25, 0.25));
  g.rectMode(CENTER);
  setMarkColours(g, person, 0.85); // 85% opacity: you can just see through tape
  g.rect(0, 0, cfg.tapeLength, cfg.tapeWidth);
  g.pop();
}

// Fill in the person's colour. Yellow is hard to see on white,
// so light colours get a thin ink outline.
function setMarkColours(g, person, opacity) {
  const c = color(CONFIG.colors.people[person]);
  c.setAlpha(opacity * 255);
  g.fill(c);
  if (isLightColour(CONFIG.colors.people[person])) {
    g.stroke(CONFIG.colors.ink);
    g.strokeWeight(1.5);
  } else {
    g.noStroke();
  }
}

// Pick a corner of the sticker for the mark. It must be far enough from
// every key spot (pupil, lip line, nostrils), so the mark never hides one.
// Returns { x, y, angle }: the point, and the direction from the centre to it.
function pickCorner(plan, keys, room) {
  const inset = CONFIG.doodle.owners.dotSize; // move a bit inwards, onto the sticker
  const options = plan.outline.map(function (v) {
    const angle = atan2(v.y - plan.pos.y, v.x - plan.pos.x);
    const p = { x: v.x - cos(angle) * inset, y: v.y - sin(angle) * inset, angle: angle };
    p.clearance = distanceToKeys(p, keys); // how far to the nearest key spot
    return p;
  });

  // Any corner with enough room will do: pick one at random, so the marks
  // don't all sit in the same place. If none has room, take the roomiest.
  const roomy = options.filter(function (p) { return p.clearance > room; });
  if (roomy.length > 0) return random(roomy);
  return options.reduce(function (a, b) { return b.clearance > a.clearance ? b : a; });
}

// ---------- caption ----------

// Bottom-right, handwritten: "mesh no. 0042 — 02 · 01 · 03"
// The base person first, then the other two.
function drawCaption(g, recipe) {
  const cfg = CONFIG.doodle.caption;
  if (!cfg.show) return;

  const order = [recipe.base].concat([0, 1, 2].filter(function (n) { return n !== recipe.base; }));
  const people = order.map(function (n) { return nf(n + 1, 2); }).join(' · ');
  const words = 'mesh no. ' + nf(recipe.number || 0, 4) + ' — ' + people;

  g.push();
  g.noStroke();
  g.fill(CONFIG.doodle.line.color);
  g.textFont(cfg.font);
  g.textSize(cfg.size);
  g.textAlign(RIGHT, BOTTOM);
  g.text(words, 0.96 * CONFIG.output.width, 0.96 * CONFIG.output.height);
  g.pop();
}

// ---------- helpers ----------

// Every key spot of every sticker, in one list
function allKeys(plans) {
  let keys = [];
  for (const plan of plans) keys = keys.concat(plan.keys);
  return keys;
}

// How far point p is from the nearest key spot's edge
function distanceToKeys(p, keys) {
  let best = Infinity;
  for (const c of keys) best = min(best, dist(p.x, p.y, c.x, c.y) - c.r);
  return best;
}

// Is a colour light (like our yellow)? Uses how bright it looks to our eyes.
function isLightColour(hex) {
  const c = color(hex);
  return 0.299 * red(c) + 0.587 * green(c) + 0.114 * blue(c) > 180;
}
