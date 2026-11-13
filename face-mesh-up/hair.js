// =============================================================
// hair.js — doodled hairstyles around the head outline.
//
//   pickHairStyle(recipe)        -> the style name for this recipe (see SELECTION)
//   hairHead(outline, marks)     -> a "head" description the styles work from
//   hairHeadFromFace(outline, face, toPage) -> the same, from the base face's landmarks
//   hairPaths(style, head)       -> [{ points, sharp, closed, layer }] (empty for 'none')
//
// THE LOOK (after assets/reference/hair_ref.png, the hand-drawn sketch):
//   1. Hair = loose OPEN strokes: each strand a separate line with free
//      ends. No neat circles, scallops or outlines.
//   2. ASYMMETRY: the parting / crown point is off-centre (10–30% of the
//      head width, a random side), the hair sweeps or falls more to one
//      side, and the two sides get different strand counts, lengths and
//      angles. Never mirrored.
//   3. The hair REPLACES the top of the head: the head line is opened at
//      the hairline (openHeadLine: temple -> jaw -> temple), and the hair
//      strokes form the top edge. (Styles not redrawn yet keep the full oval.)
//   4. Uneven strokes: lengths vary ±40% (vary()), some overshoot, some are
//      short flicks; they start at the crown or the hairline and curve outwards.
//   5. The whole hair mass is tilted a little (±4°) per round.
//   6. Never over the eyes: fringes stop above the brow line.
//
// THE STYLES (HAIR_STYLES). Each one is a small function hair_<name>(head, H):
// 'head' = the head (outline, size, eye / brow lines, ears, chin), 'H' = this
// round's random "handwriting" (hairFrame: the sweep side, the crown, the
// temples, the skull line, the tilt). Everything is relative to the head:
// no fixed pixel positions, so it fits every head shape and size.
//
//   spikes    messy spiky clumps swept to one side, a few long points
//   curly     a tangled scribble of loops on top, a few loose tails
//   fringe    a heavy fringe of long jagged strands, stopping above the brows
//   ponytail  strands pulled back from an off-centre parting, a loose tail, a scribbled tie
//   topBun    a messy scribbled bun, off-centre, stray hairs escaping
//   pigtails  two tails, one each side                  (old drawing: redrawn next)
//   afro      a big cloud around the head               (old drawing: redrawn next)
//   bob       straight sides down to the jaw            (old drawing: redrawn next)
//   long      (next step)
//   quiff     (next step)
//   extras (off by default, CONFIG.doodle.hairExtras)
//   none      no hair
//
// EARS: small open loops at the sides of the head (doodleEars,
// CONFIG.doodle.drawEars). The die-cut ear photo pieces go on top.
//
// The paths are CLEAN: pen.js makes them hand-drawn, like the head line.
// =============================================================

const HAIR_STYLES = ['spikes', 'curly', 'fringe', 'ponytail', 'topBun', 'pigtails', 'afro', 'bob', 'long', 'quiff'];
const HAIR_EXTRAS = ['mohawk', 'threeHairs']; // only with CONFIG.doodle.hairExtras: true
const HAIR_OLD_NAMES = { loops: 'curly', flat: 'fringe' }; // the earlier names still work

// Every style you can choose (T cycles through these)
function hairStyleList() {
  return HAIR_STYLES.concat(CONFIG.doodle.hairExtras ? HAIR_EXTRAS : []);
}

// ---------- SELECTION ----------

let lastHairPick = null; // the last random pick (never the same twice in a row)

// The style for this recipe:
//   CONFIG.doodle.hairStyle = a name -> that style
//   'random' -> a weighted random pick (CONFIG.doodle.hairWeights), made
//   ONCE per recipe and kept in recipe.hairPick, so rebuilding the same
//   photo keeps its hair. Never the same style as the round before.
function pickHairStyle(recipe) {
  const chosen = HAIR_OLD_NAMES[CONFIG.doodle.hairStyle] || CONFIG.doodle.hairStyle;
  if (chosen !== 'random') return chosen;
  if (!recipe.hairPick) {
    const names = hairStyleList().filter((n) => n !== lastHairPick && HAIR_MAKERS[n]); // (only styles that are built)
    const weights = names.map((n) => CONFIG.doodle.hairWeights[n] ?? 1);
    let r = random(weights.reduce((a, b) => a + b, 0));
    recipe.hairPick = names[names.length - 1];
    for (let i = 0; i < names.length; i++) {
      r -= weights[i];
      if (r < 0) {
        recipe.hairPick = names[i];
        break;
      }
    }
    lastHairPick = recipe.hairPick;
  }
  return recipe.hairPick;
}

// ---------- THE HEAD the styles work from ----------

// outline: the clean head outline on the page (doodle.js headPath).
// marks (all optional, page y / points): eyeY, browY, earL, earR, chinY.
// Missing marks are guessed from the outline's shape.
function hairHead(outline, marks) {
  const m = marks || {};
  const pts = smoothPoints(outline, true);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const left = min(xs);
  const right = max(xs);
  const top = min(ys);
  const bottom = max(ys);
  const w = right - left;
  const h = bottom - top;
  const head = {
    outline: pts,
    middle: averagePoint(pts),
    cx: (left + right) / 2,
    left: left,
    right: right,
    top: top,
    bottom: bottom,
    w: w,
    h: h,
    eyeY: m.eyeY ?? top + 0.55 * h,
    browY: m.browY ?? top + 0.47 * h,
    chinY: m.chinY ?? bottom,
  };
  head.earL = m.earL ?? { x: left, y: head.eyeY + 0.05 * h };
  head.earR = m.earR ?? { x: right, y: head.eyeY + 0.05 * h };
  // Front hair may come down to here, inside the head (above the brows)
  head.fringeLimit = head.browY - CONFIG.doodle.hairRules.browMargin * h;
  // The open head line stops at the temples, at this height (the hairline)
  head.templeY = head.fringeLimit - CONFIG.doodle.hairRules.templeAbove * h;
  return head;
}

// The same, with the marks taken from the base face's landmarks
function hairHeadFromFace(outline, face, toPage) {
  const eyes = eyeCenters(face).map(toPage); // features.js
  const brows = face.leftEyebrow.keypoints.concat(face.rightEyebrow.keypoints).map(toPage);
  const ears = EAR_EDGE_POINTS.map((i) => toPage(face.keypoints[i])).sort((a, b) => a.x - b.x); // faces.js
  return hairHead(outline, {
    eyeY: (eyes[0].y + eyes[1].y) / 2,
    browY: min(brows.map((p) => p.y)),
    earL: ears[0],
    earR: ears[1],
    chinY: toPage(face.keypoints[152]).y, // 152 = the chin
  });
}

// ---------- the paths of a style ----------

function hairPaths(style, head) {
  style = HAIR_OLD_NAMES[style] || style;
  const make = HAIR_MAKERS[style];
  if (!make) return []; // 'none' (or an unknown name)
  const H = hairFrame(head); // this round's random "handwriting"
  const paths = make(head, H);
  for (const p of paths) {
    // The slight tilt of the whole hair mass, around the crown
    p.points = p.points.map((q) => rotateAround(q, H.crown, H.tilt));
    // The two readability rules (see LAYERS above)
    p.points = p.layer === 'behind' ? pushOutside(p.points, head) : keepAboveBrow(p.points, head);
  }
  return paths;
}

// The styles that are redrawn in the open-stroke look: for these the head
// line is opened at the hairline (the hair forms the top of the head)
const HAIR_OPEN_TOP = ['spikes', 'curly', 'fringe', 'ponytail', 'topBun'];
function hairOpensHead(style) {
  return HAIR_OPEN_TOP.includes(HAIR_OLD_NAMES[style] || style);
}

// ---------- the HAIR FRAME: one round's random "handwriting" ----------

// Made once per hairPaths() call (so per round, from the recipe's seed):
//   side    -1 / 1: the side the hair sweeps / falls to
//   crown   the off-centre parting / crown point, on the skull (on the
//           OTHER side: the hair falls away from the parting)
//   TL, TR  the temples: where the head line stops (left / right)
//   skull   the top of the head, TL -> over the top -> TR (where the head
//           line would have been): the line the hair sits on
//   tilt    the whole hair mass turns this much (radians, ±4°)
function hairFrame(head) {
  const side = random() < 0.5 ? -1 : 1;
  const lower = openHeadLine(head);
  const TR = lower[0];
  const TL = lower[lower.length - 1];
  const skull = [TL].concat(topArc(head.outline, head.middle, -PI, 0).filter((p) => p.y < head.templeY), [TR]);
  const off = random(0.1, 0.3) * head.w; // how far off-centre the crown is
  const crownX = head.cx - side * off;
  const crown = skull.reduce((best, p) => (abs(p.x - crownX) < abs(best.x - crownX) ? p : best), skull[0]);
  return { side: side, TL: TL, TR: TR, skull: skull, crown: { x: crown.x, y: crown.y }, tilt: radians(random(-4, 4)) };
}

// The head line, OPEN at the hairline: from the right temple, down around
// the jaw, up to the left temple (only the outline below head.templeY)
function openHeadLine(head) {
  // Angles from the head's middle; the top-left quarter gets +2 PI, so
  // sorting goes right temple -> bottom -> left -> left temple
  const pts = head.outline
    .filter((p) => p.y >= head.templeY)
    .map((p) => {
      let a = atan2(p.y - head.middle.y, p.x - head.middle.x);
      if (a < -HALF_PI) a += TWO_PI;
      return { x: p.x, y: p.y, a: a };
    });
  pts.sort((a, b) => a.a - b.a);
  return pts.map((p) => ({ x: p.x, y: p.y }));
}

// The ears: a small open loop on each side (like a "C" opening towards the
// head), around the ear points from the face. Returns two point lists.
function doodleEars(head) {
  const rx = 0.055 * head.w;
  const ry = 0.09 * head.h;
  return [head.earL, head.earR].map((ear, i) => {
    const s = i === 0 ? -1 : 1; // -1 = left ear (opens to the right), 1 = right ear
    const c = { x: ear.x + s * rx * 0.6, y: ear.y };
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const a = lerp(-0.62 * PI, 0.62 * PI, k / 16); // round the OUTSIDE, open towards the head
      pts.push({ x: c.x + s * cos(a) * rx, y: c.y + sin(a) * ry });
    }
    return pts;
  });
}

// ---------- small helpers for strands ----------

// A random length: 'v' ± 40% (uneven strokes)
function vary(v) {
  return v * random(0.6, 1.4);
}

// One strand: from p, heading at 'angle' (radians), 'len' long, curving by
// 'bend' radians over its length. An open line (free ends).
function strand(p, angle, len, bend) {
  const pts = [{ x: p.x, y: p.y }];
  let a = angle;
  let q = { x: p.x, y: p.y };
  const n = 6;
  for (let i = 0; i < n; i++) {
    a += (bend || 0) / n;
    q = { x: q.x + (cos(a) * len) / n, y: q.y + (sin(a) * len) / n };
    pts.push(q);
  }
  return pts;
}

// The direction straight out of the head at p (an angle)
function outAngle(p, head) {
  return atan2(p.y - head.middle.y, p.x - head.middle.x);
}

// p turned by 'angle' around c
function rotateAround(p, c, angle) {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos(angle) - dy * sin(angle), y: c.y + dx * sin(angle) + dy * cos(angle) };
}

// The part of the skull line between two x positions (in order from x1 to x2)
function skullBetween(H, x1, x2) {
  const lo = min(x1, x2);
  const hi = max(x1, x2);
  const part = H.skull.filter((p) => p.x >= lo && p.x <= hi);
  return x1 <= x2 ? part : part.reverse();
}

// A scribbled loop: 'turns' times round c, radius r, a bit uneven (open: it
// doesn't close on itself). start: the angle it starts at.
function scribbleLoop(c, r, turns, start) {
  const pts = [];
  const n = floor(turns * 14);
  for (let i = 0; i <= n; i++) {
    const a = start + (i / 14) * TWO_PI;
    const rr = r * random(0.8, 1.15);
    pts.push({ x: c.x + cos(a) * rr, y: c.y + sin(a) * rr * random(0.85, 1.1) });
  }
  return pts;
}

// One path: its points, and how pen.js should treat it
function hairLine(points, layer, options) {
  const o = options || {};
  return { points: points, layer: layer, sharp: !!o.sharp, closed: !!o.closed };
}

const HAIR_MAKERS = {
  // ---- 1. spikes: messy spiky clumps along the skull, swept to one side,
  // a few long points; on the sweep side one long point hangs down ----
  spikes(head, H) {
    const pts = [H.TL];
    const n = floor(random(7, 12)); // how many spikes
    for (let i = 1; i < n; i++) {
      const t = constrain((i + random(-0.3, 0.3)) / n, 0.02, 0.98); // uneven spacing
      const base = pointAlong(H.skull, t);
      const out = outAngle(base, head);
      pts.push(strand(base, out + PI, 0.02 * head.h, 0)[6]); // the valley: just inside the skull
      // The peak: outwards, swept towards the sweep side; now and then a long one
      const len = random() < 0.2 ? random(0.22, 0.35) * head.h : vary(0.1 * head.h);
      pts.push(strand(base, out + H.side * radians(random(15, 45)), len, 0)[6]);
    }
    pts.push(H.TR);
    // The long point hanging down on the sweep side
    const T = H.side > 0 ? H.TR : H.TL;
    const hang = H.side > 0 ? [T, { x: T.x + 0.1 * head.w, y: T.y + vary(0.28 * head.h) }, { x: T.x + 0.02 * head.w, y: T.y + 0.1 * head.h }] : [{ x: T.x - 0.02 * head.w, y: T.y + 0.1 * head.h }, { x: T.x - 0.1 * head.w, y: T.y + vary(0.28 * head.h) }, T];
    const line = H.side > 0 ? pts.concat(hang.slice(1)) : hang.slice(0, 2).concat(pts);
    return [hairLine(line, 'front', { sharp: true })];
  },

  // ---- 2. curly: a tangled scribble of loops of different sizes along the
  // top of the head (one continuous line), and a few loose tails ----
  curly(head, H) {
    const n = floor(random(14, 22)); // how many loops
    const scribble = [H.TL];
    for (let i = 0; i < n; i++) {
      // Spread along the whole skull (each loop in its own stretch, a bit
      // random inside it), piled up to ~0.2 x the head height above it
      const t = (i + random()) / n;
      const base = pointAlong(H.skull, t);
      const c = strand(base, outAngle(base, head) + random(-0.3, 0.3), random(0, 0.16) * head.h, 0)[6];
      scribble.push(...scribbleLoop(c, random(0.04, 0.09) * head.w, random(1.1, 1.8), random(TWO_PI)));
    }
    scribble.push(H.TR);
    const paths = [hairLine(scribble, 'front', { sharp: true })];
    // Loose tails: short wavy flicks out of the tangle
    const tails = floor(random(2, 5));
    for (let i = 0; i < tails; i++) {
      const base = pointAlong(H.skull, random(0.1, 0.9));
      paths.push(hairLine(strand(base, outAngle(base, head) + random(-0.6, 0.6), vary(0.1 * head.h), random(-1.2, 1.2)), 'front'));
    }
    return paths;
  },

  // ---- 3. fringe: the skull line (fuller on the sweep side), and a heavy
  // fringe of long jagged strands hanging down, uneven, above the brows ----
  fringe(head, H) {
    // The hair's outer edge: the skull, pushed out a little, more on the sweep side
    const edge = H.skull.map((p, i) => {
      const t = i / (H.skull.length - 1);
      const fuller = H.side > 0 ? t : 1 - t;
      return strand(p, outAngle(p, head), (0.015 + 0.04 * fuller) * head.h, 0)[6];
    });
    edge[0] = H.TL;
    edge[edge.length - 1] = H.TR;
    const paths = [hairLine(edge, 'front')];
    // The strands: long thin "V"s from the skull down towards the brows
    const n = floor(random(7, 11));
    for (let i = 0; i < n; i++) {
      const t = constrain((i + 0.5 + random(-0.35, 0.35)) / n, 0.05, 0.95);
      const top = pointAlong(edge, t);
      const bottomY = head.fringeLimit - random(0, 0.14) * head.h; // uneven lengths, never below the brows
      const lean = H.side * random(0.01, 0.05) * head.w; // swept a little to one side
      const width = random(0.015, 0.035) * head.w;
      const tip = { x: top.x + lean, y: bottomY };
      const back = { x: top.x + width, y: lerp(bottomY, top.y, random(0.55, 0.9)) }; // back up, not all the way
      paths.push(hairLine([top, tip, back], 'front', { sharp: true }));
    }
    return paths;
  },

  // ---- 4. ponytail: strands pulled back from an off-centre parting to the
  // temples, a loose tail out of the sweep side, a scribbled hair tie ----
  ponytail(head, H) {
    const P = H.crown;
    const paths = [];
    // The two edge strands (the top of the head): parting -> temple, along the skull
    paths.push(hairLine([P].concat(skullBetween(H, P.x, H.TL.x)), 'front'));
    paths.push(hairLine([P].concat(skullBetween(H, P.x, H.TR.x)), 'front'));
    // More strands from the parting, a bit inside the skull, different on each side
    for (const s of [-1, 1]) {
      const count = s === H.side ? floor(random(3, 6)) : floor(random(1, 4));
      const T = s < 0 ? H.TL : H.TR;
      for (let k = 0; k < count; k++) {
        const along = skullBetween(H, P.x, T.x);
        if (along.length < 2) continue;
        const end = pointAlong(along, constrain(vary(0.75), 0.3, 1));
        const mid = pointAlong(along, 0.45);
        const inward = random(0.02, 0.07) * head.h;
        const midIn = strand(mid, outAngle(mid, head) + PI, inward, 0)[6];
        paths.push(hairLine([P, midIn, end], 'front'));
      }
    }
    // The tail: from the tie, high on the back of the sweep side, a loose bunch of strands
    const tie = strand(outlinePointAt(head, H.side > 0 ? -0.2 * PI : -0.8 * PI), H.side > 0 ? -0.2 * PI : -0.8 * PI, 0.04 * head.w, 0)[6];
    const down = H.side > 0 ? 0.3 * PI : 0.7 * PI; // out and down
    const strands = floor(random(4, 7));
    for (let k = 0; k < strands; k++) {
      paths.push(hairLine(strand(tie, down + random(-0.35, 0.35), vary(0.45 * head.h), H.side * random(0.3, 0.9)), 'behind'));
    }
    for (let k = 0; k < 2; k++) paths.push(hairLine(strand(tie, random(TWO_PI), vary(0.1 * head.h), random(-1, 1)), 'behind')); // strays
    // The tie: a quick zig-zag scribble across the tail
    const tieLine = [];
    for (let k = 0; k <= 5; k++) tieLine.push({ x: tie.x + (k % 2 ? 1 : -1) * 0.03 * head.w, y: tie.y - 0.03 * head.w + k * 0.012 * head.w });
    paths.push(hairLine(tieLine, 'front', { sharp: true }));
    return paths;
  },

  // ---- 5. topBun: a messy scribbled bun, off-centre, strands running up
  // into it from both sides, stray hairs escaping ----
  topBun(head, H) {
    const r = random(0.14, 0.19) * head.w;
    const B = { x: head.cx + H.side * random(0.08, 0.22) * head.w, y: head.top - random(0.06, 0.12) * head.h };
    const base = { x: B.x, y: B.y + r * 0.7 }; // where the strands meet the bun
    // The bun: a few scribbled loops round B, each a bit off-centre (messy)
    const bun = [];
    const loops = floor(random(3, 5));
    for (let k = 0; k < loops; k++) {
      const c = { x: B.x + random(-0.25, 0.25) * r, y: B.y + random(-0.2, 0.2) * r };
      bun.push(...scribbleLoop(c, r * random(0.55, 1), 1, random(TWO_PI)));
    }
    const paths = [hairLine(bun, 'front', { sharp: true })];
    // The edge strands: temple -> along the skull -> up into the bun
    paths.push(hairLine(skullBetween(H, H.TL.x, base.x - 0.3 * r).concat([base]), 'front'));
    paths.push(hairLine(skullBetween(H, H.TR.x, base.x + 0.3 * r).concat([base]), 'front'));
    // More strands, pulled up into the bun, a different number each side
    for (const s of [-1, 1]) {
      const count = floor(random(1, 4));
      for (let k = 0; k < count; k++) {
        const from = pointAlong(H.skull, s < 0 ? random(0.05, 0.4) : random(0.6, 0.95));
        const inside = strand(from, outAngle(from, head) + PI, random(0.02, 0.06) * head.h, 0)[6];
        const to = { x: base.x + random(-0.5, 0.5) * r, y: base.y };
        paths.push(hairLine([inside, { x: lerp(inside.x, to.x, 0.5), y: lerp(inside.y, to.y, 0.6) - 0.02 * head.h }, to], 'front'));
      }
    }
    // Stray hairs escaping the bun
    const strays = floor(random(2, 5));
    for (let k = 0; k < strays; k++) {
      const a = random(-PI, 0); // out of the top half of the bun
      const from = { x: B.x + cos(a) * r, y: B.y + sin(a) * r };
      paths.push(hairLine(strand(from, a + random(-0.4, 0.4), vary(0.08 * head.h), random(-1.2, 1.2)), 'front'));
    }
    return paths;
  },

  // ---- 6. pigtails: two tails, one on each side, each with a tie band ----
  pigtails(head) {
    const paths = [hairCap(head), hairParting(head)];
    for (const side of [-1, 1]) {
      const anchor = outlinePointAt(head, side < 0 ? -0.9 * PI : -0.1 * PI);
      paths.push(...hairTail(anchor, side, random(0.45, 0.6) * head.h, head.w * 0.13, head));
    }
    return paths;
  },

  // ---- 7. afro: a big cloud around the head, with a scalloped edge ----
  afro(head) {
    const c = { x: head.cx, y: head.middle.y - 0.08 * head.h };
    const rx = head.w * random(0.78, 0.88);
    const ry = head.h * random(0.68, 0.76);
    const bumps = floor(random(11, 16)); // scallops around the cloud
    // From low on the right (0.2 PI), over the top (-0.5 PI), to low on the left (-1.2 PI)
    const from = 0.2 * PI;
    const to = -1.2 * PI;
    const points = [];
    const steps = bumps * 16;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const a = lerp(from, to, t);
      // abs(sin) = round bumps that meet in sharp dips: a scalloped edge
      const bump = 1 + 0.07 * abs(sin(t * bumps * PI));
      points.push({ x: c.x + cos(a) * rx * bump, y: c.y + sin(a) * ry * bump });
    }
    return [hairLine(points, 'behind', { sharp: true })];
  },

  // ---- 8. bob: straight sides down to the jaw, a straight fringe ----
  bob(head) {
    const jawY = lerp(head.eyeY, head.chinY, random(0.6, 0.75));
    const pad = 0.07 * head.w; // how far the hair stands off the head
    return [
      hairLine(hairCurtain(head, jawY, pad, 0), 'behind'),
      // The straight fringe, just above the brows, from side to side
      hairLine(straightAcross(head, head.fringeLimit), 'front'),
    ];
  },
};

// ---------- building blocks shared by the styles ----------

// A hairline cap: the top of the head outline, a little inside it
// (where the hair starts on the forehead). For the pulled-back styles.
function hairCap(head) {
  const arc = topArc(head.outline, head.middle, -0.9 * PI, -0.1 * PI);
  const inside = arc.map((p) => {
    const out = outwards(p, head.middle);
    return { x: p.x - out.x * 0.06 * head.h, y: p.y - out.y * 0.06 * head.h };
  });
  return hairLine(inside, 'front');
}

// A middle parting: a short line down from the top of the head
function hairParting(head) {
  const top = outlinePointAt(head, -0.5 * PI);
  return hairLine([top, { x: top.x + 0.01 * head.w, y: top.y + 0.1 * head.h }], 'front');
}

// A tail (ponytail / pigtail) hanging from 'anchor', swinging out to 'side'
// (-1 left, 1 right), 'length' long, 'thick' at its widest; plus its tie band.
// Returns two paths: the tail (closed, behind the head) and the band.
function hairTail(anchor, side, length, thick, head) {
  const swing = random(0.25, 0.45) * length; // how far out it swings
  const tip = { x: anchor.x + side * swing, y: anchor.y + length };
  const steps = 24;
  const outer = [];
  const inner = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    // The middle of the tail bends out, then down (a quarter-curve)
    const mid = { x: anchor.x + side * swing * sin(t * HALF_PI) * 1.1, y: anchor.y + length * t };
    const half = thick * sin(t * PI) * (1 - 0.3 * t) + thick * 0.3 * (1 - t); // thin at the tie, fat, then a point
    outer.push({ x: mid.x + side * half, y: mid.y });
    inner.push({ x: mid.x - side * half, y: mid.y });
  }
  outer[steps] = tip;
  inner[steps] = tip;
  // The band: a short line across the tail, just below where it starts
  const band = [outer[2], inner[2]];
  // The tail's outline: down the outer edge, back up the inner edge
  const tail = outer.concat(inner.slice().reverse());
  return [hairLine(tail, 'behind', { closed: true }), hairLine(band, 'front', { sharp: true })];
}

// Straight hair falling down both sides: from the bottom-left end (at
// endY), up around the top of the head (standing 'pad' off it), down to
// the bottom-right end. flare: how much wider the ends get (px).
function hairCurtain(head, endY, pad, flare) {
  const arc = topArc(head.outline, head.middle, -PI, 0); // the whole top half
  const around = arc.map((p) => {
    const out = outwards(p, head.middle);
    return { x: p.x + out.x * pad, y: p.y + out.y * pad };
  });
  const l = around[0];
  const r = around[around.length - 1];
  // Straight down from the sides, to endY, flaring out a little
  const leftSide = [{ x: l.x - flare, y: endY }, { x: l.x - flare * 0.4, y: lerp(l.y, endY, 0.5) }];
  const rightSide = [{ x: r.x + flare * 0.4, y: lerp(r.y, endY, 0.5) }, { x: r.x + flare, y: endY }];
  // A short hook inwards at each end (the cut edge of the hair)
  const hookL = { x: leftSide[0].x + pad * 1.2, y: endY + pad * 0.15 };
  const hookR = { x: rightSide[1].x - pad * 1.2, y: endY + pad * 0.15 };
  return [hookL].concat(leftSide, around, rightSide, [hookR]);
}

// A straight line across the head at height y, from one side of the
// outline to the other (a little inside it)
function straightAcross(head, y) {
  const inside = head.outline.filter((p) => abs(p.y - y) < head.h * 0.03);
  const xs = inside.length ? inside.map((p) => p.x) : [head.left, head.right];
  const l = min(xs) + 0.03 * head.w;
  const r = max(xs) - 0.03 * head.w;
  return [{ x: l, y: y }, { x: lerp(l, r, 0.5), y: y + 0.004 * head.h }, { x: r, y: y }];
}

// A line from a to b with 'bumps' bumps hanging down, 'depth' deep
function bumpyLine(a, b, bumps, depth) {
  const len = dist(a.x, a.y, b.x, b.y) || 1;
  const down = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const points = [];
  const steps = bumps * 12;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const bump = abs(sin(t * bumps * PI)) * depth;
    points.push({ x: lerp(a.x, b.x, t) + down.x * bump, y: lerp(a.y, b.y, t) + down.y * bump });
  }
  return points;
}

// The point of the head outline in the direction 'angle' from its middle
// (p5 angles: 0 = right, -PI/2 = straight up)
function outlinePointAt(head, angle) {
  let best = head.outline[0];
  let bestDiff = Infinity;
  for (const p of head.outline) {
    let diff = abs(atan2(p.y - head.middle.y, p.x - head.middle.x) - angle);
    diff = min(diff, TWO_PI - diff);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }
  return { x: best.x, y: best.y };
}

// An oval of n points around c
function circlePoints(c, rx, ry, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    pts.push({ x: c.x + cos(a) * rx, y: c.y + sin(a) * ry });
  }
  return pts;
}

// The point part of the way (t) from a to b, pushed sideways by 'bend' px
function lerpPoint(a, b, t, bend) {
  const len = dist(a.x, a.y, b.x, b.y) || 1;
  return { x: lerp(a.x, b.x, t) - ((b.y - a.y) / len) * bend, y: lerp(a.y, b.y, t) + ((b.x - a.x) / len) * bend };
}

// ---------- the style guide's hair sheet (page 12) ----------

// Two sample heads (in collage-page pixels, like a real head on the page):
// a normal one, and a wider, shorter one. An egg shape: wider at the top.
function sampleHead(wide) {
  const w = wide ? 760 : 600;
  const h = wide ? 700 : 800;
  const outline = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TWO_PI;
    const egg = 1 - 0.12 * sin(a); // sin > 0 = the bottom half: narrower (the jaw)
    outline.push({ x: cos(a) * (w / 2) * egg, y: sin(a) * (h / 2) });
  }
  return hairHead(outline, {});
}

// Where cell (row r, column col) is: one row per style; columns 0–2 = the
// normal head with seeds[0..2], columns 3–5 = the wider head, same seeds
function hairSheetCell(r, col) {
  const H = CONFIG.ui.tokens.hairSheet;
  return { x: gridX(0) + col * H.cellW, y: H.top + r * H.cellH };
}

// Draw the given styles (one per row) into one picture (the stage size),
// once: 3 seeds on the normal head + the same 3 on the wider head
function makeHairSheet(styles) {
  const S = CONFIG.ui.tokens.hairSheet;
  const g = createGraphics(CONFIG.stage.width, CONFIG.stage.height);
  g.pixelDensity(1);
  const chalk = color(CONFIG.ui.colors.chalk);
  const weight = CONFIG.ui.tokens.stroke[S.stroke] / S.scale; // the token stroke, after scaling down
  styles.forEach(function (style, r) {
    for (let col = 0; col < 6; col++) {
      const wide = col >= 3;
      randomSeed(S.seeds[col % 3]); // a stable seed: the same drawing every time
      const head = sampleHead(wide);
      const lines = [];
      const pen = (pts, opts) => lines.push(penStrokes(handDrawn(pts, opts), weight));
      const paths = hairPaths(style, head);
      // Same order as the collage: hair behind, head (open or whole), ears, neck, hair in front
      paths.filter((p) => p.layer === 'behind').forEach((p) => pen(p.points, { sharp: p.sharp, closed: p.closed }));
      if (hairOpensHead(style)) pen(openHeadLine(head), { sharp: true });
      else pen(head.outline, { closed: true });
      if (CONFIG.doodle.drawEars) doodleEars(head).forEach((e) => pen(e, {}));
      for (const angle of [0.7 * PI, 0.3 * PI]) {
        // The neck, made like the real one (doodle.js neckPath): from the jaw
        // corners straight down, leaning in towards the middle (neck.lean)
        const jaw = outlinePointAt(head, angle);
        pen([jaw, { x: jaw.x + (head.middle.x - jaw.x) * CONFIG.doodle.neck.lean, y: head.chinY + S.neckLength * head.h }], {});
      }
      paths.filter((p) => p.layer === 'front').forEach((p) => pen(p.points, { sharp: p.sharp, closed: p.closed }));
      const cell = hairSheetCell(r, col);
      g.push();
      g.translate(cell.x + S.cellW / 2, cell.y + S.cellH * 0.55);
      g.scale(S.scale);
      for (const strokes of lines) drawStrokes(g, strokes, chalk);
      // The eyes, as dots: front hair must stay above them
      g.noStroke();
      g.fill(CONFIG.ui.colors.debug);
      for (const sx of [-0.2, 0.2]) g.circle(sx * head.w, head.eyeY, 40);
      g.pop();
    }
  });
  randomSeed(); // back to unseeded random for everything else
  return g;
}

// ---------- the two readability rules ----------

// 'behind' hair: any point inside the head outline is moved out onto it
function pushOutside(points, head) {
  return points.map((p) => (insideOutline(p, head.outline) ? nearestOnOutline(p, head) : p));
}

// 'front' hair: inside the head, nothing comes below the brow line (minus a margin)
function keepAboveBrow(points, head) {
  return points.map((p) => (p.y > head.fringeLimit && insideOutline(p, head.outline) ? { x: p.x, y: head.fringeLimit } : p));
}

// Is p inside the closed outline? (Count how many edges a line from p to
// the right crosses: odd = inside.)
function insideOutline(p, outline) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function nearestOnOutline(p, head) {
  let best = head.outline[0];
  let bestD = Infinity;
  for (const q of head.outline) {
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return { x: best.x, y: best.y };
}

// ---------- helpers (also used above) ----------

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
  const f = where - i;
  return { x: lerp(points[i].x, points[j].x, f), y: lerp(points[i].y, points[j].y, f) };
}

// The direction from the middle of the head out through p (length 1)
function outwards(p, middle) {
  const dx = p.x - middle.x;
  const dy = p.y - middle.y;
  const len = sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / len, y: dy / len };
}
