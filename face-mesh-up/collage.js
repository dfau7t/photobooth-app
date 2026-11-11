// =============================================================
// collage.js — build the final mixed face.
//
//   makeRecipe()                          -> { base, eyes, nose, ears, lips, seed }
//   composeCollage(snap, people, recipe)  -> p5.Graphics (1600 x 2000)
//
// Layers, bottom -> top:
//   1. paper + halftone base face
//   2. finished pieces (see pieces.js), pasted in normal mode,
//      in the order ears -> lips -> nose -> eyes
//   3. head outline (optional)
// =============================================================

// Bottom -> top. The eyes are the strongest clue to who someone is,
// so they go on top where nothing can cover them.
const DRAW_ORDER = ['ears', 'lips', 'nose', 'eyes'];

// Pick who gives what. Numbers are 0, 1, 2 = person01, 02, 03.
function makeRecipe() {
  const recipe = { base: floor(random(3)) };
  for (const feature of FEATURES) {
    if (CONFIG.recipe.allowSelfFeature) {
      recipe[feature] = floor(random(3));
    } else {
      // pick one of the two OTHER people
      const others = [0, 1, 2].filter(function (n) {
        return n !== recipe.base;
      });
      recipe[feature] = random(others);
    }
  }
  // The seed makes the random bits (misregistration) repeatable,
  // so tweaking the halftone doesn't also shuffle the offsets.
  recipe.seed = floor(random(1000000));
  return recipe;
}

function composeCollage(snap, people, recipe) {
  randomSeed(recipe.seed);

  const W = CONFIG.output.width;
  const H = CONFIG.output.height;
  const base = people[recipe.base];

  // ---- Where the base face is cut from the photo ----
  const crop = baseCrop(base, snap);
  const k = W / crop.w; // camera pixels -> output pixels

  // Camera point -> point on the output picture
  function toOutput(p) {
    return { x: (p.x - crop.x) * k, y: (p.y - crop.y) * k };
  }

  // ---- Layer 1: paper + halftone base ----
  const cropped = createGraphics(W, H);
  cropped.pixelDensity(1);
  cropped.image(snap, 0, 0, W, H, crop.x, crop.y, crop.w, crop.h);
  const result = makeHalftone(cropped, halftoneOptions(W, H));
  cropped.remove();

  // ---- Plan every piece: what to cut, and where it goes ----
  // (No pixels yet. We first need all the positions, so we can
  //  make sure the nose doesn't reach up over the eyes.)
  const plans = [];
  for (const feature of FEATURES) {
    const personIndex = recipe[feature];
    const source = people[personIndex];

    // Scale: make the source face the same size as the base face
    const s = constrain(eyeDistance(base) / eyeDistance(source), 0.5, 2);
    const zoom = s * k; // source camera pixels -> output pixels

    const sourceParts = featureParts(source, feature);
    const baseParts = featureParts(base, feature);

    for (let i = 0; i < sourceParts.length; i++) {
      const part = sourceParts[i];
      plans.push({
        feature: feature,
        person: personIndex,
        part: part, // where to cut on the source face
        zoom: zoom,
        // Position + tilt come from the SAME feature on the BASE face
        pos: toOutput(baseParts[i].center),
        angle: baseParts[i].angle,
        w: part.w * zoom, // size of the photo piece, in output pixels
        h: part.h * zoom,
      });
    }
  }

  clipNoseBelowEyes(plans);

  // ---- Layer 2: build each piece and paste it in normal mode ----
  for (const feature of DRAW_ORDER) {
    for (const plan of plans) {
      if (plan.feature !== feature) continue;
      const piece = makePiece(snap, plan);
      result.push();
      result.translate(plan.pos.x, plan.pos.y);
      result.rotate(plan.angle); // tilt like the base face
      result.imageMode(CENTER);
      result.image(piece, 0, 0);
      result.pop();
      piece.remove(); // free the memory
    }
  }

  // ---- Layer 3 (optional): thin outline around the head ----
  if (CONFIG.pieces.headOutline) {
    const outline = convexHull(base.faceOval.keypoints.map(toOutput));
    result.noFill();
    result.stroke(CONFIG.colors.ink);
    result.strokeWeight(4);
    result.beginShape();
    for (const p of outline) result.vertex(p.x, p.y);
    result.endShape(CLOSE);
  }

  return result;
}

// Make the nose piece start BELOW the eye piece, so it never covers the eyes.
// If they overlap, we cut a strip off the TOP of the nose piece.
// The bottom of the nose (nostrils, tip) stays where it was.
function clipNoseBelowEyes(plans) {
  const nose = plans.find(function (p) { return p.feature === 'nose'; });
  const eyes = plans.filter(function (p) { return p.feature === 'eyes'; });
  if (!nose || eyes.length === 0) return;

  const bleed = 1 + CONFIG.pieces.blockBleed;

  // Measure along the face (the nose's "level" view):
  // 0 = nose centre, negative y = up towards the eyes.
  let eyeBottom = -Infinity;
  for (const eye of eyes) {
    const c = toLevel(eye.pos, nose.pos, nose.angle);
    eyeBottom = max(eyeBottom, c.y + (eye.h * bleed) / 2);
  }
  const noseTop = -(nose.h * bleed) / 2;

  // How much of the nose is too high (plus a border's width of breathing room)
  const tooHigh = eyeBottom + CONFIG.pieces.border - noseTop;
  if (tooHigh <= 0) return; // already below the eyes

  // Never cut away more than 60%, or there'd be no nose left
  const cut = min(tooHigh, nose.h * 0.6);

  // Smaller piece, centre moved down by half the cut
  nose.h -= cut;
  nose.pos = fromLevel({ x: 0, y: cut / 2 }, nose.pos, nose.angle);
  nose.part = trimPartTop(nose.part, cut / nose.zoom);
}

// A copy of a part with 'amount' (source pixels) trimmed off the top
function trimPartTop(part, amount) {
  const newH = part.h - amount;
  const trimmed = {
    center: fromLevel({ x: 0, y: amount / 2 }, part.center, part.angle),
    angle: part.angle,
    w: part.w,
    h: newH,
    outline: null,
  };
  if (part.outline) {
    // Move the outline with the new centre, and flatten any points
    // that now stick out above the top edge
    trimmed.outline = part.outline.map(function (p) {
      return { x: p.x, y: max(p.y - amount / 2, -newH / 2) };
    });
  }
  return trimmed;
}

// The rectangle (in camera pixels) around the base face:
// face box + margin on every side, at a 4:5 portrait shape,
// kept inside the photo.
function baseCrop(face, snap) {
  const margin = CONFIG.output.cropMargin;
  let w = face.box.width * (1 + 2 * margin);
  let h = face.box.height * (1 + 2 * margin);
  const ratio = CONFIG.output.width / CONFIG.output.height; // 4:5 = 0.8

  // Grow one side so the shape is exactly 4:5
  if (w / h > ratio) h = w / ratio;
  else w = h * ratio;

  // Never bigger than the photo itself
  if (w > snap.width) { w = snap.width; h = w / ratio; }
  if (h > snap.height) { h = snap.height; w = h * ratio; }

  // Centre on the face, then push it back inside the photo if needed
  const cx = face.box.xMin + face.box.width / 2;
  const cy = face.box.yMin + face.box.height / 2;
  const x = constrain(cx - w / 2, 0, snap.width - w);
  const y = constrain(cy - h / 2, 0, snap.height - h);
  return { x: x, y: y, w: w, h: h };
}

// The halftone settings from CONFIG, for a picture of size w x h
function halftoneOptions(w, h) {
  return {
    width: w,
    height: h,
    cellSize: CONFIG.halftone.cellSize,
    dotScale: CONFIG.halftone.dotScale,
    angle: CONFIG.halftone.angle,
    contrast: CONFIG.halftone.contrast,
    paper: CONFIG.colors.paper,
    ink: CONFIG.colors.ink,
  };
}
