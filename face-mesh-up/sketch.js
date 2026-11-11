// =============================================================
// sketch.js — the main program
//
// What this does:
//   - shows the camera full screen (mirrored, like a mirror)
//   - finds up to 3 faces, sorts them left -> right, labels them 01 02 03
//   - all 3 people raise both hands (open palms) -> 3-2-1 -> photo (gesture.js)
//   - SPACE takes the photo straight away (only with exactly 3 faces) and builds the collage
//   - H (live) demo: pretend everyone has their hands up
//   - after the photo, a slot machine reveals the recipe (slot.js), then the collage
//   - SPACE again goes back to the live camera
//   - R remix, S save PNG, V show the photo instead of the collage
//   - [ ] cell size, - = dot size, C cut style, H halftone pieces
//   - D debug overlay, F full screen
// =============================================================

let video; // the live camera
let cameraReady = false;

// The frozen snapshot (filled in when you press SPACE)
let snap = null; // a p5.Image of the camera frame
let frozenFaces = []; // the 3 sorted faces at that same moment

// The collage made from the snapshot
let recipe = null; // who gives which feature
let collage = null; // the finished picture (p5.Graphics, 1600 x 2000)
let showSnapshot = false; // V: look at the photo instead of the collage

// Which experiment draws the collage (M switches):
//   'halftone' = Experiment A (collage.js)
//   'doodle'   = Experiment B (collageDoodle.js)
let renderMode = 'halftone';

// The 3-2-1 countdown after everyone raised their hands.
// 0 = no countdown; otherwise the millis() time when the photo is taken.
let countdownEnd = 0;

// G: switch the hands-up detection on / off (for debugging).
// When off, the pose + gesture models don't run at all.
let gestureEnabled = CONFIG.gesture.enabled;

let showDebug = CONFIG.debug;
let message = { text: '', until: 0 }; // a short message shown on screen

// How the stage (1920x1080) fits into the real window
let stageScale = 1;
let stageX = 0;
let stageY = 0;

// ---------- p5 setup ----------

function preload() {
  // ml5 needs the model to be loaded here, before setup()
  loadFaceModels(); // one face detector per zone (see faces.js)
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Start loading the handwriting font now, so it's ready by the
  // time the first collage is drawn (otherwise the caption falls back
  // to a plain font)
  document.fonts.load(CONFIG.doodle.caption.size + 'px ' + CONFIG.doodle.caption.font);
  pixelDensity(1); // keeps things fast on big / retina screens
  updateStageFit();

  // Ask for the camera at a high resolution
  const constraints = {
    video: {
      width: { ideal: CONFIG.camera.width },
      height: { ideal: CONFIG.camera.height },
    },
    audio: false,
  };
  video = createCapture(constraints, onCameraReady);
  video.hide(); // we draw it ourselves on the canvas
}

// Called once the camera is running and we know its real size
function onCameraReady() {
  video.size(video.elt.videoWidth, video.elt.videoHeight);
  startFaceDetection(video);
  setupGesture(video); // loads the hands-up models in the background (gesture.js)
  cameraReady = true;
}

// ---------- the main loop ----------

function draw() {
  background(CONFIG.colors.ink); // colour for the bars around the stage

  // Everything inside push/pop is drawn on our 1920x1080 stage
  push();
  translate(stageX, stageY);
  scale(stageScale);

  // Stage background
  noStroke();
  fill(CONFIG.colors.paper);
  rect(0, 0, CONFIG.stage.width, CONFIG.stage.height);

  if (!cameraReady) {
    drawCenteredText('Starting camera…');
  } else if (snap && isSlotPlaying()) {
    // FROZEN, slot machine: revealing the recipe (slot.js)
    const done = drawSlot();
    drawBanner('mixing your faces…  ·  SPACE skip');
    if (done) finishSlot();
  } else if (snap && showSnapshot) {
    // FROZEN, photo view: the snapshot with the faces from that moment
    drawCameraImage(snap);
    drawFaces(frozenFaces);
    drawBanner('PHOTO  ·  V back to collage  ·  SPACE back to live');
  } else if (snap) {
    // FROZEN, collage view
    drawCollageView();
    drawBanner('M mode  ·  R remix  ·  S save PNG  ·  V photo  ·  SPACE back to live');
  } else {
    // LIVE: show the camera with the faces found right now
    updateZoneTiles(video); // give each zone's detector the newest frame
    drawCameraImage(video);
    if (showDebug) drawZones();
    const people = sortFacesLeftToRight(getLiveFaces());
    drawFaces(people);

    if (countdownEnd > 0) {
      // Countdown running: it always finishes, even if hands go down
      drawCountdown();
      drawBanner('Smile!');
      if (millis() >= countdownEnd) {
        countdownEnd = 0;
        freezeSnapshot();
      }
    } else if (!gestureEnabled) {
      // Hands-up detection switched off with G: only SPACE takes the photo
      drawBanner(people.length + ' of ' + CONFIG.faces.required + ' faces  ·  gestures OFF (G)  ·  SPACE to freeze');
    } else {
      // Waiting for everyone to raise both hands (gesture.js)
      const gesture = updateGesture(people);
      drawGestureStatus(people, gesture);
      drawBanner(
        people.length + ' of ' + CONFIG.faces.required + ' faces  ·  ' + gestureBannerText(gesture) + '  ·  SPACE manual'
      );
      if (gesture.triggered) startCountdown();
    }
  }

  // The debug panel would cover the collage, so it's hidden there
  const inCollageView = snap && !showSnapshot;
  if (showDebug && !inCollageView) drawDebugPanel();
  drawMessage();

  pop();
}

// ---------- capture ----------

function freezeSnapshot() {
  const people = sortFacesLeftToRight(getLiveFaces());

  // Edge case: only capture with exactly 3 faces
  if (people.length !== CONFIG.faces.required) {
    let reason = 'Need exactly ' + CONFIG.faces.required + ' faces, found ' + people.length;
    if (people.length > CONFIG.faces.required) reason += ' (too many people)';
    showMessage(reason);
    return;
  }

  stopGesture(); // leaving the live screen: pause the hands-up models

  // Copy the frame and the faces at the SAME moment
  snap = video.get();
  frozenFaces = copyFaces(people);
  console.log('Snapshot taken', snap.width + 'x' + snap.height, frozenFaces);

  // Mix! The collage is built now (without its animation), and the
  // slot machine plays first. finishSlot() then shows the collage.
  recipe = makeRecipe();
  recipe.number = nextMeshNumber();
  rebuildCollage(false);
  startSlot(snap, frozenFaces, recipe);
}

// The slot machine is over (or skipped with SPACE): show the collage.
// In doodle mode, the drawing animation starts now, so you see it play.
function finishSlot() {
  stopSlot();
  if (renderMode === 'doodle') startDoodleAnimation(collage);
}

// Everyone held their hands up: start the 3-2-1
function startCountdown() {
  countdownEnd = millis() + CONFIG.gesture.countdownMs;
  stopGesture(); // no need to check hands during the countdown
}

// A big number in the middle of the screen: 3, 2, 1
function drawCountdown() {
  const secondsLeft = ceil((countdownEnd - millis()) / 1000);
  const cx = CONFIG.stage.width / 2;
  const cy = CONFIG.stage.height / 2;
  noStroke();
  fill(CONFIG.colors.paper);
  circle(cx, cy, 280);
  fill(CONFIG.colors.ink);
  textFont('monospace');
  textSize(200);
  textAlign(CENTER, CENTER);
  text(max(1, secondsLeft), cx, cy);
}

// Build the collage again from the same photo + recipe
// (after a remix or after changing a setting).
// animate = true: in doodle mode, play the drawing animation.
// (Settings tweaks pass nothing, so you see the result straight away.)
function rebuildCollage(animate) {
  if (!snap) return;
  freeCollage();
  const startTime = millis();
  // Same photo, same recipe: only the drawing style is different
  if (renderMode === 'doodle') {
    collage = composeDoodle(snap, frozenFaces, recipe);
    if (animate) startDoodleAnimation(collage);
  } else {
    collage = composeCollage(snap, frozenFaces, recipe);
  }
  console.log(renderMode + ' collage built in ' + round(millis() - startTime) + ' ms', recipe);
}

// Free the memory of the old collage (and its animation layers)
function freeCollage() {
  stopDoodleAnimation();
  if (!collage) return;
  if (collage.parts) freeDoodleParts(collage.parts);
  collage.remove();
  collage = null;
}

function unfreeze() {
  stopSlot();
  snap = null;
  frozenFaces = [];
  recipe = null;
  freeCollage();
  showSnapshot = false;
}

function saveCollage() {
  if (!collage) return;
  // e.g. facemeshup_20261111_142305.png
  const stamp = year() + nf(month(), 2) + nf(day(), 2) + '_' + nf(hour(), 2) + nf(minute(), 2) + nf(second(), 2);
  saveCanvas(collage, 'facemeshup_' + stamp, 'png');
  showMessage('Saved facemeshup_' + stamp + '.png');
}

// ---------- the collage view ----------

function drawCollageView() {
  // The collage on the left, as tall as fits above the banner
  const h = 940;
  const w = h * (collage.width / collage.height);
  if (isDoodleAnimating()) {
    drawDoodleAnimation(80, 30, w, h); // still playing (doodleAnim.js)
  } else {
    image(collage, 80, 30, w, h);
  }

  // Right column: recipe + settings
  const x = 80 + w + 100;
  let y = 60;
  textFont('monospace');
  textAlign(LEFT, TOP);
  noStroke();

  fill(CONFIG.colors.ink);
  textSize(40);
  text('RECIPE', x, y);
  y += 70;

  textSize(32);
  const rows = ['base'].concat(FEATURES);
  for (const name of rows) {
    const person = recipe[name];
    fill(CONFIG.colors.people[person]);
    rect(x, y + 2, 32, 32); // colour swatch
    fill(CONFIG.colors.ink);
    text(name.padEnd(6) + ' · ' + nf(person + 1, 2), x + 50, y);
    y += 48;
  }

  y += 50;
  textSize(40);
  text('SETTINGS', x, y);
  y += 70;
  textSize(26);
  let settings = [['M', 'mode           ' + renderMode]];
  // These keys only change the doodle
  if (renderMode === 'doodle') {
    let hair = CONFIG.doodle.hairStyle;
    if (hair === 'random') hair += ' (' + recipe.hair + ')'; // show which one it picked
    settings.push(['T', 'hair           ' + hair]);
    settings.push(['N', 'nose           ' + CONFIG.doodle.noseMode]);
    settings.push(['C', 'cut style      ' + CONFIG.doodle.pieces.cutStyle]);
    settings.push(['L K', 'looseness      ' + nf(CONFIG.doodle.pieces.looseness, 1, 2)]);
    settings.push(['X Z', 'exaggeration   ' + nf(CONFIG.doodle.pieces.exaggeration, 1, 2)]);
    settings.push(['O', 'owner mark     ' + CONFIG.doodle.owners.mark]);
    settings.push(['B', 'border         ' + (CONFIG.doodle.pieces.border > 0 ? 'on' : 'off')]);
    settings.push(['A', 'replay drawing']);
  }
  // These keys only change the halftone collage
  if (renderMode === 'halftone') {
    settings = settings.concat([
      ['[ ]', 'cell size      ' + CONFIG.halftone.cellSize],
      ['- =', 'dot scale      ' + nf(CONFIG.halftone.dotScale, 1, 2)],
      ['C', 'cut style      ' + CONFIG.pieces.cutStyle],
      ['H', 'halftone parts ' + (CONFIG.pieces.halftonePieces ? 'on' : 'off')],
    ]);
  }
  for (const s of settings) {
    fill(CONFIG.colors.people[0]);
    text(s[0], x, y);
    fill(CONFIG.colors.ink);
    text(s[1], x + 90, y);
    y += 42;
  }
}

// ---------- drawing helpers ----------

// Where the camera image sits on the stage. We fit the whole camera
// frame inside the stage without cropping it ("contain").
function cameraRect() {
  const camW = video.width;
  const camH = video.height;
  const s = min(CONFIG.stage.width / camW, CONFIG.stage.height / camH);
  const w = camW * s;
  const h = camH * s;
  return { x: (CONFIG.stage.width - w) / 2, y: (CONFIG.stage.height - h) / 2, w: w, h: h };
}

// Turn a point in CAMERA pixels into a point on the STAGE.
// This is the ONLY place where mirroring happens for points.
function toStage(camX, camY) {
  const r = cameraRect();
  let x = (camX / video.width) * r.w;
  if (CONFIG.camera.mirror) x = r.w - x; // flip left/right
  const y = (camY / video.height) * r.h;
  return { x: r.x + x, y: r.y + y };
}

// Draw the camera image (live video or snapshot), mirrored if needed
function drawCameraImage(img) {
  const r = cameraRect();
  push();
  if (CONFIG.camera.mirror) {
    translate(r.x + r.w, r.y);
    scale(-1, 1);
    image(img, 0, 0, r.w, r.h);
  } else {
    image(img, r.x, r.y, r.w, r.h);
  }
  pop();
}

// Draw a box + number label for each person (always),
// and their landmarks (only in debug mode).
function drawFaces(people) {
  for (let i = 0; i < people.length; i++) {
    const face = people[i];
    // Person colour. A 4th face (too many) is drawn in ink.
    const col = i < CONFIG.colors.people.length ? CONFIG.colors.people[i] : CONFIG.colors.ink;

    if (showDebug) drawLandmarks(face, col);
    drawFaceBox(face, col, i);
  }
}

function drawFaceBox(face, col, index) {
  // Convert two corners of the box. After mirroring, left and right
  // may swap, so we use min() / max() to get the real corners.
  const a = toStage(face.box.xMin, face.box.yMin);
  const b = toStage(face.box.xMax, face.box.yMax);
  const left = min(a.x, b.x);
  const top = min(a.y, b.y);
  const w = abs(b.x - a.x);
  const h = abs(b.y - a.y);

  noFill();
  stroke(col);
  strokeWeight(5);
  rect(left, top, w, h);

  // Label tag above the box, e.g. "01"
  const label = nf(index + 1, 2); // nf() pads the number: 1 -> "01"
  noStroke();
  fill(col);
  rect(left, top - 52, 76, 52);
  fill(CONFIG.colors.ink);
  textFont('monospace');
  textSize(36);
  textAlign(LEFT, CENTER);
  text(label, left + 12, top - 24);
}

function drawLandmarks(face, col) {
  // 1. All ~468 points, small
  noStroke();
  fill(col);
  for (const p of face.keypoints) {
    const s = toStage(p.x, p.y);
    circle(s.x, s.y, 3);
  }

  // 2. Feature groups we'll cut out later, bigger and in ink
  fill(CONFIG.colors.ink);
  const groups = [face.leftEye, face.rightEye, face.leftEyebrow, face.rightEyebrow, face.lips];
  for (const group of groups) {
    if (!group) continue; // in case a group is missing
    for (const p of group.keypoints) {
      const s = toStage(p.x, p.y);
      circle(s.x, s.y, 5);
    }
  }

  // 3. Nose points and ear edge points as rings
  noFill();
  stroke(CONFIG.colors.ink);
  strokeWeight(2);
  for (const idx of NOSE_POINTS.concat(EAR_EDGE_POINTS)) {
    const p = face.keypoints[idx];
    if (!p) continue;
    const s = toStage(p.x, p.y);
    circle(s.x, s.y, 14);
  }
}

// Debug: draw the outline of each detection zone, so you can see
// where people need to stand (and tune CONFIG.zones).
function drawZones() {
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!z.tile) continue;
    const a = toStage(z.sx, z.sy);
    const b = toStage(z.sx + z.size, z.sy + z.size);
    noFill();
    stroke(CONFIG.colors.paper);
    strokeWeight(2);
    drawingContext.setLineDash([12, 10]); // dashed line
    rect(min(a.x, b.x), min(a.y, b.y), abs(b.x - a.x), abs(b.y - a.y));
    drawingContext.setLineDash([]); // back to solid lines
  }
}

// A strip along the bottom of the stage
function drawBanner(txt) {
  noStroke();
  fill(CONFIG.colors.ink);
  rect(0, CONFIG.stage.height - 70, CONFIG.stage.width, 70);
  fill(CONFIG.colors.paper);
  textFont('monospace');
  textSize(28);
  textAlign(CENTER, CENTER);
  text(txt, CONFIG.stage.width / 2, CONFIG.stage.height - 35);
}

function drawDebugPanel() {
  const people = snap ? frozenFaces : sortFacesLeftToRight(getLiveFaces());

  // How many faces each zone sees, e.g. "1 1 0"
  const perZone = zones.map(function (z) {
    return z.faces.length;
  });

  const lines = [
    'DEBUG (D to hide)',
    'fps:      ' + nf(frameRate(), 0, 0),
    'camera:   ' + (cameraReady ? video.width + ' x ' + video.height : '…'),
    'mirror:   ' + CONFIG.camera.mirror,
    'faces:    ' + people.length,
    'per zone: ' + perZone.join('  '),
    'state:    ' + (snap ? 'frozen' : 'live'),
    '',
    'SPACE capture / back to live',
    'H     demo hands up (live)',
    'G     gestures: ' + (gestureEnabled ? 'on' : 'off'),
    'R     remix    S  save PNG',
    'V     photo / collage',
    'D     debug overlay',
    'M     mode: ' + renderMode,
    'F     full screen',
  ];

  noStroke();
  fill(20, 20, 20, 200);
  rect(20, 20, 440, lines.length * 30 + 24);
  fill(CONFIG.colors.paper);
  textFont('monospace');
  textSize(22);
  textAlign(LEFT, TOP);
  for (let i = 0; i < lines.length; i++) {
    text(lines[i], 36, 32 + i * 30);
  }
}

function showMessage(txt) {
  message.text = txt;
  message.until = millis() + 2500; // show for 2.5 seconds
}

function drawMessage() {
  if (millis() > message.until) return;
  const cx = CONFIG.stage.width / 2;
  const cy = CONFIG.stage.height / 2;
  noStroke();
  fill(CONFIG.colors.people[0]);
  rectMode(CENTER);
  rect(cx, cy, 1100, 110);
  rectMode(CORNER);
  fill(CONFIG.colors.ink);
  textFont('monospace');
  textSize(34);
  textAlign(CENTER, CENTER);
  text(message.text, cx, cy);
}

function drawCenteredText(txt) {
  fill(CONFIG.colors.ink);
  textFont('monospace');
  textSize(40);
  textAlign(CENTER, CENTER);
  text(txt, CONFIG.stage.width / 2, CONFIG.stage.height / 2);
}

// ---------- fitting the stage to the window ----------

// Work out how big the 1920x1080 stage should be in this window,
// and where to put it so it's centred (with bars if the shape differs).
function updateStageFit() {
  stageScale = min(width / CONFIG.stage.width, height / CONFIG.stage.height);
  stageX = (width - CONFIG.stage.width * stageScale) / 2;
  stageY = (height - CONFIG.stage.height * stageScale) / 2;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateStageFit();
}

// ---------- keyboard ----------

function keyPressed() {
  // During the slot machine, SPACE skips straight to the collage
  if (isSlotPlaying() && key === ' ') {
    finishSlot();
    return false;
  }

  if (key === ' ') {
    if (snap) {
      unfreeze(); // back to live
    } else if (cameraReady) {
      countdownEnd = 0; // SPACE skips the countdown
      freezeSnapshot();
    }
    return false; // stop the browser from scrolling the page
  }

  const k = key.toLowerCase();
  if (k === 'd') showDebug = !showDebug;
  if (k === 'f') fullscreen(!fullscreen());

  // While the slot machine plays, the other keys wait
  if (isSlotPlaying()) return;

  // M: switch between Experiment A and B. Works live too, so you can
  // choose the mode before taking the photo.
  if (k === 'm') {
    renderMode = renderMode === 'halftone' ? 'doodle' : 'halftone';
    showMessage('Mode: ' + renderMode);
    rebuildCollage(true); // does nothing if there's no photo yet
    return;
  }

  // G: hands-up detection on / off (debug). Works on every screen.
  if (k === 'g') {
    gestureEnabled = !gestureEnabled;
    if (!gestureEnabled) {
      stopGesture(); // forget old results and the hold timer
      countdownEnd = 0; // and cancel a countdown that's already running
    }
    showMessage('Gesture detection: ' + (gestureEnabled ? 'on' : 'off'));
    return;
  }

  // H on the live screen: demo "everyone has their hands up" (gesture.js).
  // (On the collage screen, H still switches halftone pieces, below.)
  if (k === 'h' && !snap) {
    showMessage('Demo hands up: ' + (toggleGestureDemo() ? 'on' : 'off'));
    return;
  }

  // The keys below only do something when there is a photo
  if (!snap) return;

  if (k === 'r') {
    recipe = makeRecipe(); // same photo, new mix
    recipe.number = nextMeshNumber(); // a new mix is a new mesh
    rebuildCollage(false);
    startSlot(snap, frozenFaces, recipe); // spin again for the new recipe
  }
  // A: play the doodle animation again
  if (k === 'a' && renderMode === 'doodle') startDoodleAnimation(collage);
  if (k === 's') saveCollage();
  if (k === 'v') showSnapshot = !showSnapshot;

  // Live tweaks: change a setting, then rebuild with the same recipe
  let changed = true;
  if (key === '[') CONFIG.halftone.cellSize = max(4, CONFIG.halftone.cellSize - 1);
  else if (key === ']') CONFIG.halftone.cellSize += 1;
  else if (key === '-') CONFIG.halftone.dotScale = max(0.5, CONFIG.halftone.dotScale - 0.05);
  else if (key === '=') CONFIG.halftone.dotScale += 0.05;
  else if (k === 'c' && renderMode === 'doodle') {
    const d = CONFIG.doodle.pieces;
    d.cutStyle = nextInList(['scissor', 'smooth', 'rect'], d.cutStyle);
  } else if (k === 'c') CONFIG.pieces.cutStyle = CONFIG.pieces.cutStyle === 'rect' ? 'shape' : 'rect';
  else if (k === 'h') CONFIG.pieces.halftonePieces = !CONFIG.pieces.halftonePieces;
  else if (k === 't') CONFIG.doodle.hairStyle = nextInList(['random'].concat(HAIR_STYLES), CONFIG.doodle.hairStyle);
  else if (k === 'n') CONFIG.doodle.noseMode = nextInList(['piece', 'line', 'both'], CONFIG.doodle.noseMode);
  else if (k === 'o') CONFIG.doodle.owners.mark = nextInList(['none', 'dot', 'tape'], CONFIG.doodle.owners.mark);
  // B: sticker border on / off. (Doodle mode only: in halftone mode, B is
  // kept free for cycling blend modes, Experiment A milestone 6.)
  else if (k === 'b' && renderMode === 'doodle') {
    const p = CONFIG.doodle.pieces;
    p.border = p.border > 0 ? 0 : p.borderWhenOn;
  }
  // Looseness and exaggeration: steps of 0.25, between 0 and 1.5 (doodle mode only for now)
  else if (k === 'l' && renderMode === 'doodle') changeDoodleSetting('looseness', 0.25);
  else if (k === 'k' && renderMode === 'doodle') changeDoodleSetting('looseness', -0.25);
  else if (k === 'x' && renderMode === 'doodle') changeDoodleSetting('exaggeration', 0.25);
  else if (k === 'z' && renderMode === 'doodle') changeDoodleSetting('exaggeration', -0.25);
  else changed = false;
  if (changed) rebuildCollage();
}

// Every new mix gets the next number: "mesh no. 0042".
// The browser remembers the last number, so it keeps counting after a
// refresh. (If the browser won't let us store it, we just count from 1.)
let meshCounter = 0;
function nextMeshNumber() {
  try {
    meshCounter = max(meshCounter, int(localStorage.getItem('facemeshup.meshNumber')) || 0);
  } catch (e) {
    // storage blocked: keep counting in memory
  }
  meshCounter += 1;
  try {
    localStorage.setItem('facemeshup.meshNumber', meshCounter);
  } catch (e) {
    // storage blocked: that's fine
  }
  return meshCounter;
}

// Make a doodle sticker setting bigger or smaller, kept between 0 and 1.5
function changeDoodleSetting(name, step) {
  const pieces = CONFIG.doodle.pieces;
  pieces[name] = constrain(pieces[name] + step, 0, 1.5);
}

// The item after 'current' in a list, going back to the start after the last.
// Used by the keys that cycle through settings (T, N, C).
function nextInList(list, current) {
  return list[(list.indexOf(current) + 1) % list.length];
}
