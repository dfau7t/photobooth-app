// =============================================================
// collageDoodle.js — Experiment B: "Doodle + Die-cut".
//
//   composeDoodle(snap, people, recipe) -> p5.Graphics (1600 x 2000)
//
// The base person's photo is never shown. Only the SHAPE of their
// face is used: it's traced as a line drawing on white paper.
// The features are cut from the three people's photos as stickers
// (see diecut.js) and stuck on top.
//
// Layers, bottom -> top:
//   1. white paper
//   2. the second, lighter pen pass (optional)
//   3. the doodle line: head, neck, nose (optional), hair
//   4. the stickers, in the order ears -> lips -> nose -> eyes
//      (the line is drawn FIRST, so it disappears under the stickers,
//       like a drawing with pieces glued on top)
//   5. owner marks: a coloured dot or tape on each sticker (owners.js)
//   6. the handwritten caption
// =============================================================

function composeDoodle(snap, people, recipe) {
  // Same seed = same random choices (e.g. which way the nose hooks),
  // so a recipe always draws the same picture.
  randomSeed(recipe.seed);
  noiseSeed(recipe.seed);

  const cfg = CONFIG.doodle;
  const W = CONFIG.output.width;
  const H = CONFIG.output.height;
  const base = people[recipe.base];

  const g = createGraphics(W, H);
  g.pixelDensity(1);

  // ---- Layer 1: white paper ----
  g.background(cfg.paper);

  // ---- The clean paths, from the base face's landmarks ----
  const page = doodlePageMapping(base);
  const toPage = page.toPage;
  const paths = makeDoodlePaths(base, toPage);

  // Hair (hair.js): the style for this recipe (kept in it, so the panel and
  // the debug overlay can show it), placed around THIS head
  recipe.hair = pickHairStyle(recipe);
  const hairHead = hairHeadFromFace(paths.head, base, toPage);
  const hair = hairPaths(recipe.hair, hairHead);
  // The head line: OPEN at the hairline when the hair forms the top of the
  // head (the redrawn styles), otherwise the whole oval
  const headLine = hairOpensHead(recipe.hair) ? handDrawn(openHeadLine(hairHead), { sharp: true }) : handDrawn(paths.head, { closed: true });
  const hairLines = (layer) => hair.filter((h) => h.layer === layer).map((h) => ({ points: handDrawn(h.points, { sharp: h.sharp, closed: h.closed }), role: 'hair' }));

  // ---- Make every path hand-drawn (see pen.js) ----
  // In drawing order: hair BEHIND the head (long hair, tails, afro), the
  // head, the ears, the neck, the nose, then hair IN FRONT (fringes, curls).
  // Each line has a role ('hair', 'head', 'neck', 'nose'): print.js finds
  // the neck lines by it. noseMode: 'piece' = photo nose only, 'line' = drawn nose only, 'both'
  const entries = hairLines('behind').concat([{ points: headLine, role: 'head' }]);
  // The ears: small open loops at the sides (the photo ear pieces go on top)
  if (cfg.drawEars) for (const ear of doodleEars(hairHead)) entries.push({ points: handDrawn(ear, {}), role: 'ear' });
  entries.push(
    { points: handDrawn(paths.neckLeft, {}), role: 'neck' },
    { points: handDrawn(paths.neckRight, {}), role: 'neck' }
  );
  if (cfg.noseMode !== 'piece') entries.push({ points: handDrawn(paths.nose, {}), role: 'nose' });
  entries.push(...hairLines('front'));
  const lines = entries.map((e) => e.points);

  // ---- Cut every line into pen strokes (see pen.js) ----
  // Second pen pass: like a marker going over the same line twice. The same
  // lines again, shifted 2–3 px, in a lighter colour (40% of the way from
  // paper to line). It's drawn UNDER the main line, so only a thin edge shows.
  const lineColour = color(cfg.line.color);
  const lightColour = lerpColor(color(cfg.paper), lineColour, 0.4);
  const strokeLines = entries.map(function (e) {
    return { light: null, main: null, role: e.role };
  });
  if (cfg.line.doublePass) {
    const shift = p5.Vector.fromAngle(random(TWO_PI), random(2, 3));
    lines.forEach(function (line, i) {
      const moved = line.map(function (p) {
        return { x: p.x + shift.x, y: p.y + shift.y };
      });
      strokeLines[i].light = penStrokes(moved, cfg.line.weight);
    });
  }
  lines.forEach(function (line, i) {
    strokeLines[i].main = penStrokes(line, cfg.line.weight);
  });

  // ---- Layers 2 + 3: the lighter pass, then the main line ----
  for (const sl of strokeLines) if (sl.light) drawStrokes(g, sl.light, lightColour);
  for (const sl of strokeLines) drawStrokes(g, sl.main, lineColour);

  // ---- Layer 4: the stickers ----
  const plans = planStickers(people, recipe, page, paths);
  const stickers = []; // kept for the animation (doodleAnim.js)
  for (const feature of DRAW_ORDER) { // ears -> lips -> nose -> eyes (from collage.js)
    for (const plan of plans) {
      if (plan.feature !== feature) continue;
      const made = makeSticker(snap, plan);
      const sticker = { img: made.img, shadow: made.shadow, pos: plan.pos, angle: plan.angle };
      drawSticker(g, sticker, 1, 1); // normal size, full shadow
      stickers.push(sticker);
    }
  }

  // ---- Layers 5–6: who gave what, and the caption (owners.js) ----
  // Drawn after ALL stickers, so no sticker can cover a mark.
  // They go on their own see-through layer, so the animation can fade them in.
  const overlay = createGraphics(W, H);
  overlay.pixelDensity(1);
  drawOwnerMarks(overlay, plans);
  drawCaption(overlay, recipe);
  g.image(overlay, 0, 0);

  // Keep the separate layers with the finished picture, so the result
  // screen can replay them as an animation. (The saved PNG is 'g' itself:
  // always the finished picture.)
  g.parts = {
    lines: strokeLines,
    lineColour: lineColour,
    lightColour: lightColour,
    stickers: stickers,
    overlay: overlay,
    // For the print (print.js): the pieces' plans, so they can be cut again
    // at print resolution. Same order as 'stickers'. (The two lines with role 'neck'
    // are the neck lines: the print stands them on its "100" rule.)
    plans: DRAW_ORDER.flatMap((feature) => plans.filter((p) => p.feature === feature)),
  };
  return g;
}

// Free the memory of the layers kept for the animation
function freeDoodleParts(parts) {
  for (const s of parts.stickers) {
    s.img.remove();
    if (s.shadow) s.shadow.remove();
  }
  parts.overlay.remove();
}

// Work out every sticker: which person's photo it's cut from, and where
// it goes on the page. Each sticker starts on the same feature of the
// BASE face (its "anchor"), then gets a playful push, turn and size
// change (see layout.js and CONFIG.doodle.placement).
//
// We plan them in drawing order (ears -> lips -> nose -> eyes), so each
// new sticker knows the key spots of the stickers UNDER it, and can
// stay off them.
function planStickers(people, recipe, page, paths) {
  const W = CONFIG.output.width;
  const H = CONFIG.output.height;
  const base = people[recipe.base];
  const options = {
    splitEyes: true, // two separate eyes, each with its brow
    padding: CONFIG.doodle.pieces.padding,
  };

  // Things every sticker needs to know about the page
  const edges = pickPoints(base, EAR_EDGE_POINTS).map(page.toPage);
  const outline = smoothPoints(paths.head, true); // the clean head line, detailed
  const neckBottom = min(paths.neckLeft[1].y, paths.neckRight[1].y);
  const pageInfo = {
    fw: dist(edges[0].x, edges[0].y, edges[1].x, edges[1].y), // base face width on the page
    outline: outline,
    headMiddle: averagePoint(outline),
    // Stay 4% away from every edge of the page
    box: { left: 0.04 * W, right: 0.96 * W, top: 0.04 * H, bottom: 0.96 * H },
    neckBottom: neckBottom,
  };

  const plans = [];
  const keysUnder = []; // key spots of the stickers placed so far
  for (const feature of DRAW_ORDER) {
    if (feature === 'nose' && CONFIG.doodle.noseMode === 'line') continue; // nose is only a line

    const personIndex = recipe[feature];
    const source = people[personIndex];

    // Scale: make the source face the same size as the base face
    const s = constrain(eyeDistance(base) / eyeDistance(source), 0.5, 2);

    const sourceParts = featureParts(source, feature, options);
    const baseParts = featureParts(base, feature, options);
    const sourceKeys = keyAreas(source, feature, options);

    let partner = null; // the first eye (or ear) of a pair
    for (let i = 0; i < sourceParts.length; i++) {
      const plan = {
        feature: feature,
        person: personIndex,
        part: sourceParts[i], // where to cut on the source face
        baseZoom: s * page.scale, // source camera pixels -> page pixels, before the size change
        anchor: page.toPage(baseParts[i].center), // the same feature on the base face
        baseAngle: baseParts[i].angle,
        side: baseParts[i].side, // ears only: -1 = left, +1 = right
        sourceKeys: sourceKeys[i],
      };
      placeSticker(plan, pageInfo, keysUnder, partner);
      plans.push(plan);
      for (const k of plan.keys) keysUnder.push(k);
      if (i === 0) partner = plan.variation;
    }
  }
  return plans;
}

// Try up to 10 random placements for one sticker. Keep the first one
// that (a) doesn't look like a mirror image of its partner and
// (b) doesn't cover a key spot of a sticker underneath.
// If none works, put it exactly on its anchor.
function placeSticker(plan, pageInfo, keysUnder, partner) {
  const cfg = CONFIG.doodle.pieces;
  const row = CONFIG.doodle.placement[plan.feature];

  for (let attempt = 0; attempt <= 10; attempt++) {
    const lastChance = attempt === 10;
    const v = lastChance ? NO_VARIATION : rollVariation(row, pageInfo.fw, cfg.looseness, cfg.exaggeration);

    if (!lastChance && partner && pairLooksNeat(partner, v, pageInfo.fw, cfg.looseness, cfg.exaggeration)) {
      continue; // too much like its partner: roll again
    }

    applyVariation(plan, v, pageInfo);
    if (lastChance || !coversAny(plan.outline, keysUnder, cfg.border)) return;
  }
}

// Put one sticker on the page with a given variation. Fills in:
//   plan.zoom, plan.angle, plan.shape, plan.pos, plan.outline, plan.keys
function applyVariation(plan, v, pageInfo) {
  plan.variation = v;
  plan.zoom = plan.baseZoom * v.size; // bigger or smaller
  plan.angle = plan.baseAngle + radians(v.rot); // turned a bit more
  plan.shape = cutShape(plan.part, plan.zoom); // the scissor cut (diecut.js)

  // Pushed away from the anchor
  plan.pos = { x: plan.anchor.x + v.dx, y: plan.anchor.y + v.dy };

  // Ears: stuck on the head line, 30–50% of the ear outside the head
  if (plan.feature === 'ears') plan.pos.x = earX(plan, pageInfo);

  // Keep it on the page. Lips also stay above the end of the neck lines.
  const box = Object.assign({}, pageInfo.box);
  if (plan.feature === 'lips') box.bottom = min(box.bottom, pageInfo.neckBottom);
  const shift = shiftInside(outlineOnPage(plan), box, CONFIG.doodle.pieces.border);
  plan.pos.x += shift.x;
  plan.pos.y += shift.y;

  plan.outline = outlineOnPage(plan);
  plan.keys = plan.sourceKeys.map(function (c) {
    return keyOnPage(c, plan);
  });
}

// Where an ear goes left-right: find the head line at the ear's height,
// then place the ear so a random 30–50% of it sticks out past the line.
function earX(plan, pageInfo) {
  const earWidth = plan.part.w * plan.zoom;
  const lineX = outlineXAt(pageInfo.outline, plan.pos.y, plan.side, pageInfo.headMiddle.x);
  const outside = random(0.3, 0.5); // how much of the ear is outside the head
  // side = -1 (left): the outside is to the left, so we move left
  return lineX + plan.side * (outside - 0.5) * earWidth;
}

// The x of the head line at height y, on one side of the head
function outlineXAt(outline, y, side, middleX) {
  let best = null;
  for (const p of outline) {
    if ((p.x - middleX) * side <= 0) continue; // wrong side
    if (!best || abs(p.y - y) < abs(best.y - y)) best = p;
  }
  return best ? best.x : middleX;
}

// The sticker's outline, moved and turned to where it sits on the page
function outlineOnPage(plan) {
  return plan.shape.map(function (p) {
    return fromLevel(p, plan.pos, plan.angle);
  });
}

// A key spot (camera pixels on the source face) -> the page
function keyOnPage(c, plan) {
  const level = toLevel(c, plan.part.center, plan.part.angle); // relative to the part, levelled
  const scaled = { x: level.x * plan.zoom, y: level.y * plan.zoom };
  const p = fromLevel(scaled, plan.pos, plan.angle);
  return { x: p.x, y: p.y, r: c.r * plan.zoom };
}

// Work out how the base face is placed on the PAGE. Returns:
//   toPage -> a function that moves a CAMERA point onto the page
//   scale  -> how much bigger things are on the page than in the camera
// The base head is centred left-right, its top sits at 'head.top'
// of the page, and it takes up 'head.height' of the page.
function doodlePageMapping(face) {
  const cfg = CONFIG.doodle.head;
  const W = CONFIG.output.width;
  const H = CONFIG.output.height;

  // Size of the face oval in the camera picture
  const oval = face.faceOval.keypoints;
  const xs = oval.map(function (p) { return p.x; });
  const ys = oval.map(function (p) { return p.y; });
  const ovalW = max(xs) - min(xs);
  const ovalH = max(ys) - min(ys);
  const middleX = averagePoint(oval).x;

  // The drawn head is taller than the oval (its top is stretched up)
  const headH = ovalH * (1 + cfg.topStretch);
  const headTop = min(ys) - ovalH * cfg.topStretch; // in camera pixels

  // Scale: make the head 'height' of the page tall,
  // but never wider than 80% of the page.
  const k = min((cfg.height * H) / headH, (0.8 * W) / ovalW);

  return {
    scale: k,
    toPage: function (p) {
      return {
        x: W / 2 + (p.x - middleX) * k,
        y: cfg.top * H + (p.y - headTop) * k,
      };
    },
  };
}
