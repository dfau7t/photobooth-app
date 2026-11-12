// =============================================================
// pieces.js — build ONE finished collage piece.
//
//   makePiece(snap, plan) -> p5.Graphics
//
// A finished piece is like a real bit of cut paper. It contains,
// bottom -> top:
//   1. a soft shadow
//   2. a paper-coloured border
//   3. the grayscale photo of the feature
//   4. the person's colour block, blended over the photo
//
// WHY A SEPARATE BUFFER PER PIECE?
// In the first build, all the colour blocks were blended straight
// onto the collage. Where two pieces overlapped, their colours mixed
// (yellow over blue = green), and nobody could tell whose feature it was.
// Now every piece is coloured inside its OWN little canvas first. That
// canvas is then pasted onto the collage in normal mode, like gluing
// paper on paper, so colours can never mix between pieces.
//
// The "plan" (made in collage.js) says what to cut and how big:
//   plan.part    -> the feature on the source face (see features.js)
//   plan.zoom    -> source camera pixels -> output pixels
//   plan.person  -> 0, 1 or 2: whose colour to use
// =============================================================

// Room left around the piece for the soft shadow, in pixels
const SHADOW_ROOM = 10;

function makePiece(snap, plan) {
  const cfg = CONFIG.pieces;
  const isShape = cfg.cutStyle === 'shape';

  // ---- 1. The grayscale photo of the feature ----
  const photo = cutPiece(snap, plan.part, plan.zoom);

  // ---- 2. The artwork: photo + colour block, in its own canvas ----
  // The colour block is a bit bigger than the photo (bleed), and shifted
  // a few pixels in a random direction (misregister), like a riso print.
  const bleed = 1 + cfg.blockBleed;
  const blockW = photo.width * bleed;
  const blockH = photo.height * bleed;
  const mis = cfg.misregister;

  // Big enough for the block, wherever the misregister shifts it
  const artW = ceil(blockW + 2 * mis);
  const artH = ceil(blockH + 2 * mis);

  const art = createGraphics(artW, artH);
  art.pixelDensity(1);
  art.background(CONFIG.colors.paper);
  art.imageMode(CENTER);
  art.image(photo, artW / 2, artH / 2);

  // The colour block. For now always Multiply (milestone 6 adds the others).
  // Multiply: dark stays dark, light takes on the colour.
  const offset = p5.Vector.fromAngle(random(TWO_PI), mis);
  const blockColor = color(CONFIG.colors.people[plan.person]);
  blockColor.setAlpha(cfg.blockAlpha * 255);
  art.blendMode(MULTIPLY);
  art.noStroke();
  art.fill(blockColor);
  art.rectMode(CENTER);
  art.rect(artW / 2 + offset.x, artH / 2 + offset.y, blockW, blockH);
  art.blendMode(BLEND); // ALWAYS switch back

  // Shape cut: trim the artwork to the feature's outline
  // (made a bit bigger by the bleed, so a rim of colour shows around it)
  let artImg = art.get();
  art.remove();
  if (isShape) {
    const m = createGraphics(artW, artH);
    m.pixelDensity(1);
    m.noStroke();
    m.fill(255);
    drawCutShape(m, plan, artW / 2, artH / 2, bleed);
    artImg.mask(m.get());
    m.remove();
  }

  // ---- 3. The finished piece: shadow + paper border + artwork ----
  const border = cfg.border;
  const outW = artW + 2 * (border + SHADOW_ROOM);
  const outH = artH + 2 * (border + SHADOW_ROOM);
  const g = createGraphics(outW, outH); // starts fully transparent
  g.pixelDensity(1);

  // The browser can draw soft shadows for us. Everything drawn
  // while these are set gets a shadow, so we switch it off again after.
  const shadow = color(CONFIG.colors.ink);
  shadow.setAlpha(0.15 * 255); // 15% ink
  g.drawingContext.shadowColor = shadow.toString();
  g.drawingContext.shadowOffsetX = 2;
  g.drawingContext.shadowOffsetY = 2;
  g.drawingContext.shadowBlur = 4;

  // The paper backing, 'border' pixels bigger than the artwork on every side
  g.fill(CONFIG.colors.paper);
  if (isShape) {
    // A thick paper-coloured outline around the shape = the border.
    // (With border 0: no outline at all. The browser ignores a line
    //  width of 0 and would draw a thin 1 px line instead.)
    if (border > 0) {
      g.stroke(CONFIG.colors.paper);
      g.strokeWeight(border * 2);
      g.strokeJoin(ROUND);
    } else {
      g.noStroke();
    }
    drawCutShape(g, plan, outW / 2, outH / 2, bleed);
  } else {
    g.noStroke();
    g.rectMode(CENTER);
    g.rect(outW / 2, outH / 2, artW + 2 * border, artH + 2 * border);
  }

  g.drawingContext.shadowColor = 'rgba(0, 0, 0, 0)'; // shadow off

  // The artwork on top of its paper
  g.imageMode(CENTER);
  g.image(artImg, outW / 2, outH / 2);
  return g;
}

// Draw the outline of a piece (for cutStyle "shape"), centred on (cx, cy).
// 'grow' makes it bigger: 1 = exact size, 1.06 = 6% bigger.
function drawCutShape(g, plan, cx, cy, grow) {
  const part = plan.part;
  const k = plan.zoom * grow; // source pixels -> output pixels, then grow
  g.push();
  g.translate(cx, cy);
  if (part.outline) {
    g.beginShape();
    for (const p of part.outline) g.vertex(p.x * k, p.y * k);
    g.endShape(CLOSE);
  } else {
    g.ellipse(0, 0, part.w * k, part.h * k); // ears: an oval
  }
  g.pop();
}

// Cut a part's rectangle out of the photo, in full colour:
// levelled (eye line horizontal) and scaled to output size.
// Returns a p5.Graphics. Used by both experiments.
function cutPhoto(snap, part, zoom) {
  const pw = max(1, round(part.w * zoom));
  const ph = max(1, round(part.h * zoom));

  // Draw the photo so the part's centre lands in the middle,
  // with the head tilt undone.
  // (Read these steps from the bottom up: that's the order they
  //  happen to each point of the photo.)
  const g = createGraphics(pw, ph);
  g.pixelDensity(1);
  g.background(CONFIG.colors.paper);
  g.translate(pw / 2, ph / 2); // 4. move into the middle of the piece
  g.scale(zoom); // 3. scale to output size
  g.rotate(-part.angle); // 2. undo the head tilt
  g.translate(-part.center.x, -part.center.y); // 1. part centre to 0,0
  g.image(snap, 0, 0);
  g.resetMatrix(); // so later drawing on g isn't moved around
  return g;
}

// A PIXELATED copy of a picture: big square blocks, so you can guess what
// it is but not see it clearly (the evidence screen). How: shrink the
// picture so each block becomes ONE pixel, then blow it up again with
// smoothing OFF, so each pixel becomes a hard-edged square.
// block = the block size in px. Returns a new p5.Graphics (free it with .remove()).
function pixelate(img, block) {
  const w = img.width;
  const h = img.height;
  const small = createGraphics(max(1, ceil(w / block)), max(1, ceil(h / block)));
  small.pixelDensity(1);
  small.image(img, 0, 0, small.width, small.height);
  const big = createGraphics(w, h);
  big.pixelDensity(1);
  big.noSmooth(); // hard-edged blocks, not a blur
  big.image(small, 0, 0, w, h);
  small.remove();
  return big;
}

// Cut one part out of the photo, levelled (eye line horizontal),
// scaled to output size, made grayscale (or halftone), and shaped.
// Returns a p5.Image.
function cutPiece(snap, part, zoom) {
  const g = cutPhoto(snap, part, zoom);
  const pw = g.width;
  const ph = g.height;

  // Treat it: smooth grayscale photo, or halftone
  let img;
  if (CONFIG.pieces.halftonePieces) {
    const ht = makeHalftone(g, halftoneOptions(pw, ph));
    img = ht.get();
    ht.remove();
  } else {
    makeGrayscale(g, CONFIG.pieces.contrast);
    img = g.get();
  }
  g.remove();

  // Shape cut: keep only what's inside the feature's outline
  if (CONFIG.pieces.cutStyle === 'shape') {
    const m = createGraphics(pw, ph);
    m.pixelDensity(1);
    m.noStroke();
    m.fill(255);
    drawCutShape(m, { part: part, zoom: zoom }, pw / 2, ph / 2, 1);
    img.mask(m.get());
    m.remove();
  }
  return img;
}
