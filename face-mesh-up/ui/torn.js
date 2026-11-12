// =============================================================
// ui/torn.js — flat paper shapes with torn edges.
//
//   tornShape(name, w, h)                 -> a torn outline (made once, then reused)
//   drawTorn(shape, x, y, colour, angle)  print it, centred on (x, y)
//
// Same rules as the doodle line (ui/doodleLine.js):
//   - made ONCE, centred on (0, 0), at a size from the tokens
//   - the seed comes from a NAME ("poster-01"), never from random()
//   - the tears are CENTRED (on average the edge stays exactly on the
//     w x h rectangle) and CLAMPED (no point moves more than 'roughness')
// So the paper is always exactly the size the tokens say.
//
// HOW THE EDGE IS MADE
// We walk along each side in small steps and push every point a
// little in or out: a slow wave (noise) plus a small jagged jump
// (random), like paper fibres.
// =============================================================

const tornCache = new Map();

function tornShape(name, w, h) {
  const roughness = CONFIG.ui.tokens.poster.roughness;
  const key = [name, w, h, roughness].join('|');
  if (tornCache.has(key)) return tornCache.get(key);

  const corners = [
    { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 },
  ];
  const base = [];
  const normals = [];
  for (let side = 0; side < 4; side++) {
    const a = corners[side];
    const b = corners[(side + 1) % 4];
    const len = dist(a.x, a.y, b.x, b.y);
    const n = max(2, floor(len / 7)); // a point every ~7 px
    const out = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
    for (let i = 0; i < n; i++) {
      base.push({ x: lerp(a.x, b.x, i / n), y: lerp(a.y, b.y, i / n) });
      normals.push(out);
    }
  }

  // One push per point: slow wave + jagged jump, made with the fixed seed
  const pushes = withSeed(seedFrom(name), function () {
    const start = random(1000);
    return base.map(function (p, i) {
      const wave = constrain(map(noise(start + i * 0.08), 0.25, 0.75, -1, 1), -1, 1);
      return wave * 0.7 + random(-0.3, 0.3); // mostly wave, a bit of jag
    });
  });

  // Centre (average push = 0) and clamp (biggest push = roughness)
  const average = pushes.reduce((a, b) => a + b, 0) / pushes.length;
  const centred = pushes.map((v) => v - average);
  const biggest = max(centred.map(abs)) || 1;
  const points = base.map(function (p, i) {
    const d = (centred[i] / biggest) * roughness;
    return { x: p.x + normals[i].x * d, y: p.y + normals[i].y * d };
  });

  const shape = { name: name, w: w, h: h, points: points };
  tornCache.set(key, shape);
  return shape;
}

// Fill the torn outline, centred on (x, y), turned by 'angle' degrees
function drawTorn(shape, x, y, colour, angle) {
  push();
  translate(x, y);
  rotate(radians(angle || 0));
  noStroke();
  fill(colour);
  beginShape();
  for (const p of shape.points) vertex(p.x, p.y);
  endShape(CLOSE);
  pop();
}
