// =============================================================
// diecut.js — Experiment B: photo pieces cut out like stickers.
//
//   makeSticker(snap, plan) -> { img, shadow } (two p5.Graphics)
//   drawSticker(g, sticker, size, shadowOpacity)
//
// A sticker, bottom -> top:
//   1. a soft shadow
//   2. a white border (the die-cut sticker edge)
//   3. the photo of the feature, in NATURAL colour, cut to a shape
//
// The shape (CONFIG.doodle.pieces.cutStyle):
//   'scissor' -> an uneven polygon with 5–8 straight edges, like scissors
//   'smooth'  -> follows the feature's outline with a smooth curve
//   'rect'    -> a slightly crooked rectangle
//
// The "plan" (made in collageDoodle.js) says what to cut:
//   plan.part   -> the feature on the source face (see features.js)
//   plan.zoom   -> source camera pixels -> output pixels
// =============================================================

const STICKER_SHADOW_ROOM = 12; // room around the sticker for its shadow, in pixels

function makeSticker(snap, plan) {
  const cfg = CONFIG.doodle.pieces;

  // ---- 1. The shape, in output pixels, around the piece's centre ----
  // (The placement may have cut it already, to check for overlaps)
  const shape = plan.shape || cutShape(plan.part, plan.zoom);

  // ---- 2. The photo, big enough to fill the whole shape ----
  // (A scissor corner can stick out past the feature's rectangle,
  //  so we measure the shape and cut a rectangle that fits around it.)
  let halfW = 0;
  let halfH = 0;
  for (const p of shape) {
    halfW = max(halfW, abs(p.x));
    halfH = max(halfH, abs(p.y));
  }
  const box = {
    center: plan.part.center,
    angle: plan.part.angle,
    w: (2 * halfW) / plan.zoom, // back to source camera pixels
    h: (2 * halfH) / plan.zoom,
  };
  const photo = cutPhoto(snap, box, plan.zoom);
  evenOutColours(photo);

  // Keep only what's inside the shape: draw the shape in white on a
  // "mask" picture, and use it as a stencil
  const pw = photo.width;
  const ph = photo.height;
  const photoImg = photo.get();
  photo.remove();
  const mask = createGraphics(pw, ph);
  mask.pixelDensity(1);
  mask.noStroke();
  mask.fill(255);
  drawCutShape(mask, shape, pw / 2, ph / 2);
  photoImg.mask(mask.get());
  mask.remove();

  // ---- 3. The sticker: white border + photo ----
  const border = cfg.border;
  const outW = pw + 2 * (border + STICKER_SHADOW_ROOM);
  const outH = ph + 2 * (border + STICKER_SHADOW_ROOM);
  const g = createGraphics(outW, outH); // starts fully transparent
  g.pixelDensity(1);

  // The white sticker edge: the shape with a thick white outline.
  // Half of the outline sits outside the shape, so the edge is 'border' wide.
  g.fill(255);
  stickerEdgeStroke(g, 255, border);
  drawCutShape(g, shape, outW / 2, outH / 2);

  // The photo on top
  g.imageMode(CENTER);
  g.image(photoImg, outW / 2, outH / 2);

  // ---- 4. The shadow: a separate picture, so the animation can fade it in ----
  let shadow = null;
  if (cfg.shadow) {
    shadow = createGraphics(outW, outH);
    shadow.pixelDensity(1);
    const ink = color(CONFIG.colors.ink);
    ink.setAlpha(0.15 * 255); // 15% ink
    shadow.drawingContext.filter = 'blur(3px)'; // soft edges
    shadow.fill(ink);
    stickerEdgeStroke(shadow, ink, border);
    drawCutShape(shadow, shape, outW / 2, outH / 2);
    shadow.drawingContext.filter = 'none';
  }

  return { img: g, shadow: shadow };
}

// Draw a sticker (from makeSticker) at its place: the shadow 3 px
// down-right, then the sticker on top.
//   size:          1 = normal, 1.08 = a bit bigger (still in the air)
//   shadowOpacity: 0 = no shadow yet, 1 = full shadow (landed)
function drawSticker(g, s, size, shadowOpacity) {
  if (s.shadow && shadowOpacity > 0) {
    g.push();
    g.translate(s.pos.x + 3, s.pos.y + 3);
    g.rotate(s.angle);
    g.imageMode(CENTER);
    g.drawingContext.globalAlpha = shadowOpacity; // see-through
    g.image(s.shadow, 0, 0);
    g.drawingContext.globalAlpha = 1;
    g.pop();
  }
  g.push();
  g.translate(s.pos.x, s.pos.y);
  g.rotate(s.angle); // tilt like the base face
  g.scale(size);
  g.imageMode(CENTER);
  g.image(s.img, 0, 0);
  g.pop();
}

// The thick outline that makes the sticker's border (or no outline for border 0)
function stickerEdgeStroke(g, colour, border) {
  if (border > 0) {
    g.stroke(colour);
    g.strokeWeight(border * 2);
    g.strokeJoin(ROUND); // die-cut stickers have slightly rounded corners
  } else {
    g.noStroke();
  }
}

// ---------- the shape ----------

// Returns a list of corner points, in output pixels, around (0, 0)
function cutShape(part, zoom) {
  const style = CONFIG.doodle.pieces.cutStyle;
  const w = part.w * zoom; // the padded rectangle around the feature
  const h = part.h * zoom;

  let shape;
  if (style === 'smooth') shape = smoothShape(part, zoom);
  else if (style === 'rect') shape = rectShape(w, h);
  else shape = scissorShape(w, h);

  // "Never cut into the feature itself": if any point of the feature
  // is outside the shape, make the shape 4% bigger and check again
  const core = corePoints(part, zoom);
  for (let tries = 0; tries < 10 && !allInside(core, shape); tries++) {
    shape = shape.map(function (p) {
      return { x: p.x * 1.04, y: p.y * 1.04 };
    });
  }
  return shape;
}

// Scissor cut: 5–8 corners around an oval that fits the rectangle.
//
// How: imagine a regular polygon (like a pentagon) drawn AROUND a circle,
// so the circle just touches each edge. Now squash the whole drawing into
// the oval's shape. The squashed polygon still wraps neatly around the
// squashed circle (= our oval), even for long, flat pieces like lips.
// Then every corner is shifted and nudged a little, so no two cuts look the same.
function scissorShape(w, h) {
  const range = CONFIG.doodle.pieces.corners; // e.g. [5, 8]
  const count = floor(random(range[0], range[1] + 1));
  const a = w / 2; // the oval's half width
  const b = h / 2; // the oval's half height
  const step = TWO_PI / count;
  const start = random(TWO_PI); // so the first corner isn't always in the same place

  // How far out the corners must be so the edges just touch the circle
  const reach = 1 / cos(PI / count);

  const corners = [];
  for (let i = 0; i < count; i++) {
    // Where around the circle this corner is: evenly spread, a little random
    const t = start + i * step + random(-0.2, 0.2) * step;
    // Nudge in or out by up to 6%
    const nudge = 1 + random(-0.06, 0.06);
    // Squash the circle into the oval: x by the half width, y by the half height
    corners.push({ x: cos(t) * a * reach * nudge, y: sin(t) * b * reach * nudge });
  }
  return corners;
}

// Smooth cut: follow the padded outline of the feature (ears: an oval)
function smoothShape(part, zoom) {
  if (part.outline) {
    const scaled = part.outline.map(function (p) {
      return { x: p.x * zoom, y: p.y * zoom };
    });
    return smoothPoints(scaled, true); // from pen.js
  }
  return ovalPoints((part.w * zoom) / 2, (part.h * zoom) / 2, 40);
}

// Rect cut: the rectangle, turned a few degrees, like a quick scissor cut
function rectShape(w, h) {
  const turn = radians(random(-4, 4));
  const corners = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ];
  return corners.map(function (p) {
    return { x: p.x * cos(turn) - p.y * sin(turn), y: p.x * sin(turn) + p.y * cos(turn) };
  });
}

// The points of the feature itself, which the cut must keep inside.
// Ears have no landmark points, so we use an oval at 80% of the ear box.
function corePoints(part, zoom) {
  if (part.core) {
    return part.core.map(function (p) {
      return { x: p.x * zoom, y: p.y * zoom };
    });
  }
  return ovalPoints((part.w * zoom * 0.8) / 2, (part.h * zoom * 0.8) / 2, 24);
}

// ---------- helpers ----------

// Points around an oval with half-width a and half-height b
function ovalPoints(a, b, count) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TWO_PI;
    pts.push({ x: cos(angle) * a, y: sin(angle) * b });
  }
  return pts;
}

// Draw a cut shape (list of corners around 0,0) centred on (cx, cy).
// (Not called drawShape: ui/doodleLine.js has a drawShape of its own.)
function drawCutShape(g, shape, cx, cy) {
  g.beginShape();
  for (const p of shape) g.vertex(cx + p.x, cy + p.y);
  g.endShape(CLOSE);
}

// Are all the points inside the shape? (insideShape() is in layout.js)
function allInside(points, shape) {
  return points.every(function (p) {
    return insideShape(p, shape);
  });
}

// ---------- colour ----------

// Gently even out brightness and contrast, so the pieces from three
// different people (and different light) look like they belong together.
// Red, green and blue all get the SAME change, so skin colour stays the same.
function evenOutColours(g) {
  const targetBrightness = 140; // 0 = black, 255 = white
  const targetContrast = 55; // how spread out the brightness should be
  const strength = 0.5; // 0 = no change, 1 = fully even. 0.5 = "lightly"

  g.loadPixels();
  const px = g.pixels;
  const count = px.length / 4;

  // 1. Measure: the average brightness, and how spread out it is
  let total = 0;
  for (let i = 0; i < px.length; i += 4) total += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const mean = total / count;
  let spread = 0;
  for (let i = 0; i < px.length; i += 4) {
    const b = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    spread += sq(b - mean);
  }
  const contrast = sqrt(spread / count) || 1;

  // 2. Work out the change, only part of the way towards the target
  const gain = lerp(1, constrain(targetContrast / contrast, 0.7, 1.4), strength);
  const shift = lerp(0, targetBrightness - mean, strength);

  // 3. Apply it to every pixel
  for (let i = 0; i < px.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      px[i + c] = constrain((px[i + c] - mean) * gain + mean + shift, 0, 255);
    }
  }
  g.updatePixels();
}
