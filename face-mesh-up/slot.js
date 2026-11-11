// =============================================================
// slot.js — the slot machine that "picks" who gives which feature.
//
// Shown right after the photo, before the collage.
//
//   startSlot(snap, faces, recipe)  build the grid and start spinning
//   drawSlot()                      draw this moment; returns true when it's over
//   isSlotPlaying()                 is it on screen?
//   stopSlot()                      stop + forget
//
// THE GRID
//   one ROW per feature (base, eyes, nose, ears, lips)
//   one COLUMN per person (01, 02, 03)
//   each cell shows that person's feature, cut from the photo
//
// THE ANIMATION (timings copied from the friend's Python version)
//   1. The rows spin one after another. In a spinning row, a highlight
//      jumps from person to person, slowing down, and stops on the
//      person in the recipe. The recipe was already decided in
//      makeRecipe(): the slot machine only REVEALS it.
//   2. When all rows have stopped: JACKPOT. All the picked cells
//      blink off and on together a few times, then stay lit.
//   3. A short pause, then the collage is shown.
// =============================================================

let slot = null; // null = not playing

// ---------- 1. start ----------

function startSlot(snap, faces, recipe) {
  stopSlot();
  const rows = CONFIG.slot.rows;
  const geo = slotGeometry(rows.length);

  // Cut every cell's picture ONCE now, not on every frame.
  // Each cell gets two versions:
  //   gray    -> the normal look
  //   colored -> with the person's colour block on top (the chosen one)
  const cells = [];
  for (const name of rows) {
    const row = [];
    for (let p = 0; p < faces.length; p++) {
      row.push(makeSlotCell(snap, faces[p], name, p, geo));
    }
    cells.push(row);
  }

  slot = {
    start: millis(),
    recipe: recipe,
    rows: rows,
    cells: cells,
    geo: geo,
  };
}

function stopSlot() {
  slot = null; // the cell pictures are p5.Images: the browser frees them by itself
}

function isSlotPlaying() {
  return slot !== null;
}

// ---------- 2. timing ----------

// How long row r spins. Each row is a bit slower than the one before:
// row 0 = spinMs, row 1 = spinMs x 1.12, row 2 = spinMs x 1.12 x 1.12...
function spinDuration(r) {
  return CONFIG.slot.spinMs * pow(CONFIG.slot.rowSlowdown, r);
}

// When does row r start and stop spinning? (ms after the start)
// A row starts after all the rows above it have spun, plus a gap each.
function rowTiming(r) {
  let start = 0;
  for (let i = 0; i < r; i++) start += spinDuration(i) + CONFIG.slot.gapMs;
  return { start: start, end: start + spinDuration(r) };
}

// Which person is highlighted in row r at time t?
// Returns { col, status } with status 'waiting', 'spinning' or 'locked'.
function rowState(r, t) {
  const target = slot.recipe[slot.rows[r]]; // the person the recipe picked
  const time = rowTiming(r);
  const people = slot.cells[r].length;

  if (t < time.start) return { col: -1, status: 'waiting' };
  if (t >= time.end) return { col: target, status: 'locked' };

  // Spinning. 'progress' goes 0 -> 1 fast at first, then slower and
  // slower ("ease out"), like a reel that's running out of speed.
  // A bigger easePower = a longer, more dramatic stop.
  const tau = (t - time.start) / (time.end - time.start);
  const progress = 1 - pow(1 - tau, CONFIG.slot.easePower);
  const steps = CONFIG.slot.spinSteps; // how many jumps in total
  const jumped = floor(progress * steps);
  // Count backwards from the target, so the last jump lands exactly on it.
  // (The "+ people * steps" keeps the number positive before the %.)
  const col = (target - steps + jumped + people * steps) % people;
  return { col: col, status: 'spinning' };
}

// ---------- 3. drawing ----------

// Draw the slot machine as it is now. Returns true when it's finished.
function drawSlot() {
  const cfg = CONFIG.slot;
  const t = millis() - slot.start;
  const n = slot.rows.length;

  // When the jackpot blinking starts and ends, and when everything is over
  const allLocked = rowTiming(n - 1).end;
  const blinkStart = allLocked + cfg.blinkDelayMs;
  const blinkEnd = blinkStart + cfg.blinkCount * cfg.blinkMs;

  // ---- Jackpot: are the picks "off" right now? ----
  // Each blink is first half OFF, second half ON, so the last blink
  // ends ON and the picks stay lit afterwards.
  let blinkOff = false;
  if (t >= blinkStart && t < blinkEnd) {
    const intoBlink = (t - blinkStart) % cfg.blinkMs; // ms into the current blink
    blinkOff = intoBlink < cfg.blinkMs / 2;
  }

  drawSlotHeaders();

  // ---- The cells ----
  for (let r = 0; r < n; r++) {
    const state = rowState(r, t);
    for (let c = 0; c < slot.cells[r].length; c++) {
      drawSlotCell(r, c, state, blinkOff);
    }
  }

  return t >= blinkEnd + cfg.holdMs;
}

// The person tags above the columns ("01" "02" "03", like on the live
// screen) and the feature names left of the rows.
function drawSlotHeaders() {
  const g = slot.geo;
  textFont('monospace');
  noStroke();

  textSize(36);
  textAlign(CENTER, CENTER);
  for (let c = 0; c < slot.cells[0].length; c++) {
    const x = g.x + c * (g.cellW + g.gap) + g.cellW / 2;
    fill(CONFIG.colors.people[c]);
    rect(x - 38, g.y - 72, 76, 52);
    fill(CONFIG.colors.ink);
    text(nf(c + 1, 2), x, g.y - 46);
  }

  textSize(32);
  textAlign(RIGHT, CENTER);
  fill(CONFIG.colors.ink);
  for (let r = 0; r < slot.rows.length; r++) {
    text(slot.rows[r], g.x - 30, g.y + r * (g.cellH + g.gap) + g.cellH / 2);
  }
}

// One cell. How it looks depends on its row's state:
//   waiting  -> plain gray photo
//   spinning -> the highlighted cell is coloured, with a thick ink frame
//   locked   -> the chosen cell is coloured, the other two fade back
//
// blinkOff = true during the "off" half of a jackpot blink: the picked
// cell then looks like the faded ones, so it seems to switch off.
function drawSlotCell(r, c, state, blinkOff) {
  const g = slot.geo;
  const cell = slot.cells[r][c];
  const x = g.x + c * (g.cellW + g.gap);
  const y = g.y + r * (g.cellH + g.gap);
  const isPicked = state.col === c && !blinkOff;

  // Paper background
  noStroke();
  fill(CONFIG.colors.paper);
  rect(x, y, g.cellW, g.cellH);

  // The picture
  imageMode(CENTER);
  if (isPicked) {
    image(cell.colored, x + g.cellW / 2, y + g.cellH / 2);
  } else {
    if (state.status === 'locked') tint(255, 70); // fade the ones not picked
    image(cell.gray, x + g.cellW / 2, y + g.cellH / 2);
    noTint();
  }
  imageMode(CORNER);

  // The frame
  noFill();
  if (isPicked) {
    stroke(state.status === 'locked' ? CONFIG.colors.people[c] : CONFIG.colors.ink);
    strokeWeight(8);
  } else {
    stroke(CONFIG.colors.ink);
    strokeWeight(2);
  }
  rect(x, y, g.cellW, g.cellH);
  noStroke();
}

// ---------- 4. building the grid ----------

// Where the grid sits on the 1920x1080 stage. The rows share the
// height between the column tags and the bottom banner.
function slotGeometry(rowCount) {
  const gap = 14;
  const labelW = 200; // room for the row names on the left
  const cellW = 380;
  const top = 130;
  const bottom = CONFIG.stage.height - 70 - 30; // above the banner
  const cellH = (bottom - top - (rowCount - 1) * gap) / rowCount;
  const gridW = 3 * cellW + 2 * gap;
  const x = (CONFIG.stage.width - (labelW + gridW)) / 2 + labelW;
  return { x: x, y: top, cellW: cellW, cellH: cellH, gap: gap };
}

// Cut one person's feature out of the photo, sized to fit in a cell.
function makeSlotCell(snap, face, name, person, geo) {
  // Which part of the face to show
  let part;
  if (name === 'base') {
    // The whole face: its box, a bit bigger, straightened like the others
    const b = face.box;
    part = {
      center: { x: b.xMin + b.width / 2, y: b.yMin + b.height / 2 },
      angle: eyeAngle(face),
      w: b.width * 1.15,
      h: b.height * 1.15,
    };
  } else {
    // eyes / nose / ears / lips (ears: just the first ear)
    part = featureParts(face, name)[0];
  }

  // Scale it so it fits inside the cell, with some paper around it
  const pad = 12;
  const zoom = min((geo.cellW - 2 * pad) / part.w, (geo.cellH - 2 * pad) / part.h);

  // Gray version (cutPhoto from pieces.js, makeGrayscale from halftone.js)
  const g = cutPhoto(snap, part, zoom);
  makeGrayscale(g, CONFIG.pieces.contrast);
  const gray = g.get();

  // Coloured version: the person's colour block multiplied on top,
  // the same look as the pieces in the halftone collage
  const block = color(CONFIG.colors.people[person]);
  block.setAlpha(CONFIG.pieces.blockAlpha * 255);
  g.blendMode(MULTIPLY);
  g.noStroke();
  g.fill(block);
  g.rect(0, 0, g.width, g.height);
  g.blendMode(BLEND); // ALWAYS switch back
  const colored = g.get();

  g.remove(); // free the memory
  return { gray: gray, colored: colored };
}
