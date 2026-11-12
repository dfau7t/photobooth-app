// =============================================================
// screens/wanted.js — screen 01: the WANTED posters.
//
// In the story: the suspects are identified. Three torn WANTED posters
// (01 yellow, 02 blue, 03 red) fill with the live faces as people step
// onto the marks. Each poster gets a booking number for the whole round.
// Goes to:
//   arrival (02a), when exactly 3 faces have been there for 1 s (stableMs)
//   welcome, when no face has been seen for 5 s (noFaceResetMs)
//
// (enter / update / draw / exit: see screens/welcome.js)
// =============================================================

const wantedScreen = {
  number: '01',
  name: 'wanted',
  usesFaces: true,

  enteredAt: 0,
  threeSince: 0, // when exactly 3 faces were first seen (0 = not now)
  lastFaceAt: 0, // when we last saw any face
  crops: [null, null, null], // the photo crop of each poster (follows its face smoothly)

  enter() {
    this.enteredAt = millis();
    this.threeSince = 0;
    this.lastFaceAt = millis(); // the 5 s countdown to "back to welcome" starts now
    this.crops = [null, null, null];
  },

  update() {
    const now = millis();
    const timing = CONFIG.ui.timing;

    // Which face is in front of which poster (by where it is on screen)
    const bySlot = facesBySlot(liveFaces);

    // Each poster's photo follows its face smoothly (no jumping around)
    for (let i = 0; i < 3; i++) this.crops[i] = smoothCrop(this.crops[i], bySlot[i]);

    // Timers
    if (liveFaces.length > 0) this.lastFaceAt = now;
    if (liveFaces.length === CONFIG.faces.required) {
      if (this.threeSince === 0) this.threeSince = now;
    } else {
      this.threeSince = 0;
    }

    if (!autoAdvance) return;
    if (this.threeSince > 0 && now - this.threeSince >= timing.stableMs) goTo('arrival');
    else if (now - this.lastFaceAt >= timing.noFaceResetMs) goTo('welcome');
  },

  draw() {
    const t = CONFIG.ui.tokens;
    const c = CONFIG.ui.colors;

    // ---- The three posters ----
    for (let i = 0; i < 3; i++) {
      const number = this.crops[i] ? storyRound.bookingNumbers[i] : null;
      WantedPoster(i, 'M', t.screen.slotX[i], t.screen.posterY, this.crops[i], number);
    }

    // ---- Status line ----
    let status = liveFaces.length + ' of ' + CONFIG.faces.required + ' faces found';
    if (this.threeSince > 0) status += '  ·  hold still…';
    push();
    noStroke();
    fill(c.text);
    setType('lead');
    textAlign(CENTER, BASELINE);
    text(status, CONFIG.stage.width / 2, t.screen.instructionBaseline);
    pop();
  },

  exit() {},
};

// Put each face in front of its poster: slot 0 / 1 / 2 = the left /
// middle / right third of the SCREEN (the preview is a mirror).
// If two faces are in the same third, the first one keeps it.
function facesBySlot(faces) {
  const slots = [null, null, null];
  for (const face of faces) {
    let x = (face.box.xMin + face.box.width / 2) / video.width; // 0 – 1 in the camera
    if (CONFIG.camera.mirror) x = 1 - x; // 0 – 1 on screen
    const slot = constrain(floor(x * 3), 0, 2);
    if (!slots[slot]) slots[slot] = face;
  }
  return slots;
}
