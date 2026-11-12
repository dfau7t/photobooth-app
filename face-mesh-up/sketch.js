// =============================================================
// sketch.js — the main program
//
// TWO MODES (TAB switches):
//
// 1. MUGSHOT(3) — the story, one screen at a time (the default).
//    A small "state machine": only ONE screen is active. The screens
//    live in screens/*.js; this file only switches between them with
//    goTo('handsup'). ← → or the ">>>" button move to the screen
//    before / after (for testing).
//
// 2. CLASSIC BOOTH — the booth as it was before MUGSHOT(3).
//    It keeps working until the new screens take over its jobs.
//
// What the classic booth does:
//   - shows the camera full screen (mirrored, like a mirror)
//   - finds up to 3 faces, sorts them left -> right, labels them 01 02 03
//   - all 3 people raise both hands (open palms) -> 3-2-1 -> photo (gesture.js)
//   - SPACE takes the photo straight away (only with exactly 3 faces) and builds the collage
//   - H (live) demo: pretend everyone has their hands up
//   - after the photo, a slot machine reveals the recipe (slot.js), then the collage
//   - SPACE again goes back to the live camera
//   - R remix, P print, S save PNG, V show the photo instead of the collage
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

// ---------- MUGSHOT(3): the screens ----------

// Every screen, by name. (The screen objects are made in screens/*.js,
// which index.html loads before this file.)
const SCREENS = {
  welcome: welcomeScreen,
  wanted: wantedScreen,
  arrival: arrivalScreen, // scene 02a: the police car
  handsup: handsupScreen, // scene 02b: hands up (live camera)
  mugshot: mugshotScreen,
  evidence: evidenceScreen,
  forgery: forgeryScreen, // scene 05: the bandits forge the composite
  casefile: casefileScreen,
  styleguide: styleguideScreen, // not part of the story: the style guide (key G)
};

// The order of the story: 00 -> 05 (also the order of the page dots)
// 02 has two scenes (arrival, handsup), so there are 8 screens but 7 page dots.
const SCREEN_ORDER = ['welcome', 'wanted', 'arrival', 'handsup', 'mugshot', 'evidence', 'forgery', 'casefile'];
const PAGE_DOTS = 7; // 00 – 06: each screen's 'number' says which dot is lit

let currentScreenName = null; // e.g. 'handsup'
let screenEnteredAt = 0; // millis() when we arrived on the current screen (for the sound log)
let soundLogShown = false; // Shift+L: the sound log overlay (testing)
let currentScreen = null; // the screen object itself, e.g. handsupScreen

let classicMode = false; // TAB: true = show the classic booth instead

// The faces found right now, sorted: liveFaces[0] = person01.
// Kept up to date on every screen that says usesFaces: true.
let liveFaces = [];

// A: should the story move on by itself? (off = stay on this screen, for testing)
let autoAdvance = CONFIG.ui.autoAdvance && new URLSearchParams(window.location.search).get('auto') !== '0';

// One round = one group of three suspects, from the welcome screen to
// the case file. Things that must stay the same for the whole round live here.
// (Not called 'round': that would replace p5's round() function!)
let storyRound = { bookingNumbers: ['00000000', '00000000', '00000000'] };

// Start a new round (called when we arrive on the welcome screen)
function startNewRound() {
  if (snap) unfreeze(); // forget the last group's photo and collage
  storyRound = {
    // A random 8-digit booking number per person, e.g. "48213907"
    bookingNumbers: [0, 1, 2].map(() => nf(floor(Math.random() * 1e8), 8)),
    radioStarted: false, // the police radio has been played this round (02a / 02b)
  };
}

// ---------- p5 setup ----------

function preload() {
  // ml5 needs the model to be loaded here, before setup()
  loadFaceModels(); // one face detector per zone (see faces.js)
  preloadSfx(); // sound.js: fetch the sound files (missing ones: the synth plays)
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Start loading the handwriting font now, so it's ready by the
  // time the first collage is drawn (otherwise the caption falls back
  // to a plain font)
  document.fonts.load(CONFIG.doodle.caption.size + 'px ' + CONFIG.doodle.caption.font);
  // Same for the MUGSHOT(3) fonts
  const fonts = CONFIG.ui.fonts;
  for (const name of [fonts.display, fonts.mono, fonts.body]) {
    document.fonts.load('40px "' + name + '"');
  }
  pixelDensity(1); // keeps things fast on big / retina screens
  updateStageFit();
  checkPrintServer(); // see if server.py and a macOS printer are ready (printer.js)

  // The first MUGSHOT(3) screen. For testing, the web address can choose
  // another one: http://localhost:8000/?screen=handsup
  const fromAddress = new URLSearchParams(window.location.search).get('screen');
  setupSfx(); // sound.js: the sound engine, and the files decoded into sound
  goTo(SCREENS[fromAddress] ? fromAddress : CONFIG.ui.startScreen);
  if (uiDebug) showMessage('Debug overlay: on'); // ?debug=1 in the address

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
  // (The hands-up models load later: in scene 02a, or when the classic booth opens.)
  cameraReady = true;
}

// ---------- the main loop ----------

function draw() {
  if (classicMode) {
    drawClassic(); // the booth as it was before MUGSHOT(3)
    return;
  }

  background(CONFIG.ui.colors.stage); // also the colour of the bars around the stage

  // Everything inside push/pop is drawn on our 1920x1080 stage
  push();
  translate(stageX, stageY);
  scale(stageScale);

  // Faces: only on the screens that need them (this also feeds the face detectors)
  if (cameraReady && currentScreen.usesFaces) {
    updateZoneTiles(video);
    liveFaces = sortFacesLeftToRight(getLiveFaces());
  } else {
    liveFaces = [];
  }

  // The current screen: first its logic, then its drawing
  currentScreen.update();
  currentScreen.draw();

  // On top of every screen
  // The lit page dot = the screen's number ('02' -> dot 2; '--' -> none)
  const dot = /^[0-9]+$/.test(currentScreen.number) ? int(currentScreen.number) : -1;
  if (!currentScreen.hideTopBar) TopBar(dot, PAGE_DOTS); // (the case file reveal hides it)
  Toast(message); // short messages (the classic booth keeps its own drawMessage)
  if (sfxMuted) SoundOffLabel(); // U
  if (soundLogShown) SoundLog(sfxLog, CONFIG.ui.tokens.layout.margin, CONFIG.stage.height - CONFIG.ui.tokens.layout.margin); // Shift+L
  if (startOverlayShown()) StartOverlay(); // "CLICK TO START" (sound needs one click)

  pop();
}

// ---------- switching screens ----------

// Go to a screen by its name, e.g. goTo('handsup').
// The old screen cleans up (exit), the new one starts (enter).
function goTo(name) {
  if (!SCREENS[name]) {
    console.warn('There is no screen called', name);
    return;
  }
  if (currentScreen) {
    currentScreen.exit();
    stopScreenSfx(currentScreenName); // sound.js: its sounds stop (except 'keep' ones, e.g. the radio)
  }
  currentScreenName = name;
  screenEnteredAt = millis();
  currentScreen = SCREENS[name];
  currentScreen.enter();
}

// The next / previous screen in the story. After the last screen we
// go back to the first one (and the other way round).
function nextScreen() {
  const i = SCREEN_ORDER.indexOf(currentScreenName);
  goTo(SCREEN_ORDER[(i + 1) % SCREEN_ORDER.length]);
}

function previousScreen() {
  const i = SCREEN_ORDER.indexOf(currentScreenName);
  goTo(SCREEN_ORDER[(i - 1 + SCREEN_ORDER.length) % SCREEN_ORDER.length]);
}

// TAB: switch between MUGSHOT(3) and the classic booth
function toggleClassicMode() {
  classicMode = !classicMode;
  if (classicMode && cameraReady) setupGesture(video); // the classic booth needs the hand models
  cursor(ARROW); // the top bar may have left a pointing hand
  showMessage(classicMode ? 'Classic booth  ·  TAB back to MUGSHOT(3)' : 'MUGSHOT(3)');
}

// The mouse position on the STAGE (1920x1080), not in the window
function stageMouse() {
  return { x: (mouseX - stageX) / stageScale, y: (mouseY - stageY) / stageScale };
}

// ---------- the classic booth ----------

function drawClassic() {
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
    drawBanner('M mode  ·  R remix  ·  P print  ·  S save PNG  ·  V photo  ·  SPACE back to live');
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

  // Take the photo and build the collage (without its animation). The
  // slot machine plays first; finishSlot() then shows the collage.
  takePhoto(people);
  startSlot(snap, frozenFaces, recipe);
}

// Take the photo: copy the camera frame and these faces at the SAME
// moment, pick a recipe, and build the collage (no animation yet).
// Used by the classic booth (SPACE) and by the MUGSHOT(3) mugshot screen.
function takePhoto(people) {
  snap = video.get(); // <- THE MOMENT THE PICTURE IS TAKEN
  playCameraSnap(); // ...and its "snap", at exactly that moment (the screen starts the white flash now too)
  frozenFaces = copyFaces(people);
  console.log('Snapshot taken', snap.width + 'x' + snap.height, frozenFaces);
  recipe = makeRecipe();
  recipe.number = nextMeshNumber();
  recipe.capturedAt = millis(); // for the "capture -> print" time in the console (casefile.js)
  // The story always uses the doodle collage: the forgery scene (05) draws
  // it on, piece by piece. The classic booth keeps its own style (M).
  rebuildCollage(false, classicMode ? renderMode : 'doodle');
}

// The camera "snap": the shutter sound, with every other sound turned
// down for a moment so nothing covers it (CONFIG.sound.shutter).
// Only takePhoto() calls this: once per photo (remix, R, takes no new photo).
function playCameraSnap() {
  const s = CONFIG.sound.shutter;
  duckOthers('shutter', s.duckTo, s.duckMs);
  playSfx('shutter');
}

// The slot machine is over (or skipped with SPACE): show the collage.
// In doodle mode, the drawing animation starts now, so you see it play.
function finishSlot() {
  stopSlot();
  if (renderMode === 'doodle') startDoodleAnimation(collage);
  if (CONFIG.printer.autoPrint) printCollage();
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
function rebuildCollage(animate, mode) {
  if (!snap) return;
  mode = mode ?? renderMode; // 'doodle' or 'halftone' (default: the classic booth's M setting)
  freeCollage();
  const startTime = millis();
  // Same photo, same recipe: only the drawing style is different
  if (mode === 'doodle') {
    collage = composeDoodle(snap, frozenFaces, recipe);
    if (animate) startDoodleAnimation(collage);
  } else {
    collage = composeCollage(snap, frozenFaces, recipe);
  }
  console.log(mode + ' collage built in ' + round(millis() - startTime) + ' ms', recipe);
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
  fill(CONFIG.colors.people[0]);
  text('P', x, y);
  fill(CONFIG.colors.ink);
  text('print          ' + printStatusText(), x + 90, y);
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
    'printer:  ' + printStatusText(),
    '',
    'SPACE capture / back to live',
    'H     demo hands up (live)',
    'G     gestures: ' + (gestureEnabled ? 'on' : 'off'),
    'R     remix    S  save PNG',
    'P     print collage',
    'V     photo / collage',
    'D     debug overlay',
    'M     mode: ' + renderMode,
    'F     full screen',
    'TAB   back to MUGSHOT(3)',
  ];

  noStroke();
  fill(20, 20, 20, 200);
  rect(20, 20, 500, lines.length * 30 + 24);
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

// ---------- keyboard and mouse ----------

function keyPressed() {
  unlockSound(); // browsers only allow sound after a key or click (sound.js)
  // The first key just closes "CLICK TO START" (and switches sound on)
  if (startOverlayShown()) {
    startOverlayDone = true;
    return false;
  }
  // Shift+T works everywhere: the recipe self-test (collage.js, results in the console)
  if (key === 'T') {
    testRecipes();
    return false;
  }
  // Shift+L works everywhere: the sound log (the last sounds played, for testing)
  if (key === 'L') {
    soundLogShown = !soundLogShown;
    showMessage('Sound log: ' + (soundLogShown ? 'on' : 'off'));
    return false;
  }
  // U works everywhere: sound off / on
  if (key === 'u' || key === 'U') {
    showMessage(toggleMute() ? 'Sound off (U)' : 'Sound on');
    return false;
  }
  // TAB works everywhere: MUGSHOT(3) <-> classic booth
  if (keyCode === TAB) {
    toggleClassicMode();
    return false; // stop the browser from moving the focus
  }

  if (classicMode) return keyPressedClassic();

  // MUGSHOT(3) keys
  if (keyCode === RIGHT_ARROW) nextScreen();
  else if (keyCode === LEFT_ARROW) previousScreen();
  else if (key === 'f' || key === 'F') fullscreen(!fullscreen());
  else if (key === 'P') {
    // Shift+P: print the case file again by hand (for testing).
    // This doesn't count as "printed": the case file still prints by itself.
    if (collage && recipe) printCaseFile();
    else showMessage('Nothing to print yet: take a mugshot first');
  }
  else if (key === 'g' || key === 'G') {
    // The style guide; G again goes to its next page
    if (currentScreenName === 'styleguide') styleguideScreen.page = (styleguideScreen.page + 1) % STYLEGUIDE_PAGES;
    else goTo('styleguide');
  } else if (key === 'a' || key === 'A') {
    autoAdvance = !autoAdvance; // stay on one screen while testing
    showMessage('Auto-advance: ' + (autoAdvance ? 'on' : 'off'));
  }
  else if (key === 'd' || key === 'D') {
    uiDebug = !uiDebug; // red reference shapes + measurements (ui/debug.js)
    uiDebugLogged = false; // print the measurements again
    showMessage('Debug overlay: ' + (uiDebug ? 'on' : 'off'));
  }
  // Any other key: the screen can handle it, if it wants to
  // (e.g. SPACE or H on the Hands Up screen, in later milestones)
  else if (currentScreen.keyPressed) return currentScreen.keyPressed();
}

function mousePressed() {
  unlockSound();
  // The first click just closes "CLICK TO START" (and switches sound on)
  if (startOverlayShown()) {
    startOverlayDone = true;
    return;
  }
  if (classicMode) return;
  if (isOverNextButton(stageMouse())) nextScreen(); // the ">>>" button
  else if (currentScreen.mousePressed) currentScreen.mousePressed(stageMouse()); // e.g. the sound test buttons
}

// "CLICK TO START": shown once, at launch, while the browser blocks sound.
// (Chrome started with --autoplay-policy=no-user-gesture-required allows
// sound straight away, so it never shows: see the README.)
let startOverlayDone = false;
function startOverlayShown() {
  if (startOverlayDone || !CONFIG.sound.startOverlay) return false;
  if (soundUnlocked()) {
    startOverlayDone = true; // sound is allowed already: never show it
    return false;
  }
  return true;
}

// The keys of the classic booth
function keyPressedClassic() {
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
    recipe.number = nextMeshNumber();
  recipe.capturedAt = millis(); // for the "capture -> print" time in the console (casefile.js) // a new mix is a new mesh
    rebuildCollage(false);
    startSlot(snap, frozenFaces, recipe); // spin again for the new recipe
  }
  // A: play the doodle animation again
  if (k === 'a' && renderMode === 'doodle') startDoodleAnimation(collage);
  if (k === 'p') printCollage();
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
