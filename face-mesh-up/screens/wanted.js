// =============================================================
// screens/wanted.js — screen 01: the WANTED posters.
//
// In the story: the suspects are identified. Three big torn WANTED
// posters (01 yellow, 02 blue, 03 red; size XL, tokens.wanted) fill with
// the live faces as people step onto the marks. Each poster gets a booking
// number for the whole round. No status text: the posters show who's found.
//
// SOUND: a soft camera "click" the first time each poster fills with a
// face (once per person per round, storyRound.clicked).
//
// "ALL 3 FOUND" (CONFIG.ui.timing.found), once exactly 3 faces have been
// there for stableMs (so a flicker never sets it off):
//   1. ALARM: the posters blink together 3 times (120 ms on / 120 ms off):
//      the WANTED headlines and photo frames flash chalk white, with an
//      alarm double-beep on each blink (sounds.allFound).
//   2. A FOUND stamp slams onto each poster, left -> right, 150 ms apart,
//      each with a stamp thud.
//   3. 0.8 s later -> arrival (02a).
// If a face is lost before then: the blink stops, the stamps go, and it
// can start again when all 3 are back.
// Goes to welcome, when no face has been seen for 5 s (noFaceResetMs).
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
  foundAt: 0, // when "ALL 3 FOUND" started (0 = not now)
  beeps: 0, // how many alarm beeps have played
  stamps: [], // the three FOUND stamps

  enter() {
    this.enteredAt = millis();
    this.threeSince = 0;
    this.lastFaceAt = millis(); // the 5 s countdown to "back to welcome" starts now
    this.crops = [null, null, null];
    this.stopFound();
    const w = CONFIG.ui.tokens.wanted;
    this.stamps = [0, 1, 2].map((i) => makeStamp('FOUND', { x: this.posterX(i), y: w.cy + w.stamp.dy, size: w.stamp.size, color: CONFIG.ui.colors.ink }));
    if (!storyRound.clicked) storyRound.clicked = [false, false, false];
  },

  // The middle of poster i: three posters, 'gap' apart, centred as a group
  posterX(i) {
    const w = CONFIG.ui.tokens.wanted;
    const pw = CONFIG.ui.tokens.poster[w.size][0];
    return CONFIG.stage.width / 2 + (i - 1) * (pw + w.gap);
  },

  // ALL 3 FOUND: off (a face was lost, or we're leaving)
  stopFound() {
    this.foundAt = 0;
    this.beeps = 0;
    for (const s of this.stamps) s.shownAt = -1; // gone
  },

  update() {
    const now = millis();
    const timing = CONFIG.ui.timing;
    const F = timing.found;

    // Which face is in front of which poster (by where it is on screen)
    const bySlot = facesBySlot(liveFaces);

    // Each poster's photo follows its face smoothly (no jumping around).
    // The first time a poster fills this round: a camera click.
    for (let i = 0; i < 3; i++) {
      this.crops[i] = smoothCrop(this.crops[i], bySlot[i]);
      if (this.crops[i] && !storyRound.clicked[i]) {
        storyRound.clicked[i] = true;
        playSfx('click');
      }
    }

    // Timers
    if (liveFaces.length > 0) this.lastFaceAt = now;
    if (liveFaces.length === CONFIG.faces.required) {
      if (this.threeSince === 0) this.threeSince = now;
    } else {
      this.threeSince = 0;
      if (this.foundAt > 0) this.stopFound(); // a face was lost: start again when all 3 are back
    }

    // ALL 3 FOUND: 3 faces, steady for stableMs
    if (this.foundAt === 0 && this.threeSince > 0 && now - this.threeSince >= timing.stableMs) this.foundAt = now;
    if (this.foundAt > 0) {
      const since = now - this.foundAt;
      const blinkMs = F.onMs + F.offMs;
      // An alarm double-beep at the start of each blink
      if (this.beeps < F.blinks && since >= this.beeps * blinkMs) {
        this.beeps++;
        playSfx('allFound');
      }
      // Then the FOUND stamps, left -> right, each with a thud
      const stampsFrom = F.blinks * blinkMs;
      this.stamps.forEach((st, i) => {
        if (st.shownAt < 0 && since >= stampsFrom + i * F.stampGapMs) {
          showStamp(st);
          playSfx('stamp');
        }
      });
      // A moment later: the police are on their way
      const leaveAt = stampsFrom + 2 * F.stampGapMs + F.holdMs;
      if (autoAdvance && since >= leaveAt) goTo('arrival');
    }

    if (autoAdvance && now - this.lastFaceAt >= timing.noFaceResetMs) goTo('welcome');
  },

  // Is the alarm blink lit right now? (the first half of each blink)
  flashOn() {
    if (this.foundAt === 0) return false;
    const F = CONFIG.ui.timing.found;
    const since = millis() - this.foundAt;
    const blinkMs = F.onMs + F.offMs;
    return since < F.blinks * blinkMs && since % blinkMs < F.onMs;
  },

  draw() {
    const w = CONFIG.ui.tokens.wanted;
    const flash = this.flashOn();
    // ---- The three posters, and their FOUND stamps ----
    for (let i = 0; i < 3; i++) {
      const number = this.crops[i] ? storyRound.bookingNumbers[i] : null;
      WantedPoster(i, w.size, this.posterX(i), w.cy, this.crops[i], number, flash);
    }
    for (const st of this.stamps) drawStamp(st);
  },

  exit() {
    this.stopFound();
  },
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
