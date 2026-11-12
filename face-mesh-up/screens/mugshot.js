// =============================================================
// screens/mugshot.js — screen 03: the booking photo.
//
// In the story: the suspects are photographed for their mugshot.
// The live camera in a doodle frame, height lines behind them, and a
// small black placard under each face (booking number + today's date).
//
// What happens, in order (timings in tokens.mugshot):
//   1. "Look at the camera."                     (lookMs)
//   2. 3 – 2 – 1, big, in the middle             (countdownMs)
//      Once it starts, it always finishes, even if a face is lost.
//   3. CAPTURE: the photo is taken with exactly 3 faces. If a face is
//      missing at that moment, we keep trying for a short while
//      (captureGraceMs). Still not 3? Back to the WANTED posters.
//   4. A white flash; the picture freezes on the photo (flashMs).
//   5. On to the evidence screen                 (afterMs)
//
// Testing alone: with H (demo hands up) still on, fewer than 3 faces
// are filled up with copies of the faces we have, so the whole story
// can be tested by one person.
// SOUND (CONFIG.sound.countdown):
//   - one beep the moment each number appears: "3" and "2" a mid beep,
//     "1" a higher one (or the officer counts aloud: mode 'voice' / 'both')
//   - the camera "snap" at the photo: played by takePhoto() (sketch.js),
//     right where the frame is grabbed; the white flash starts that same frame.
//     After "1" it comes after the same 1 s gap as between the numbers.
//   HOW THE BEEPS STAY IN SYNC: there's ONE clock. Every frame, update()
//   works out which number is showing (countdownNumber) and keeps it in
//   this.number; draw() shows exactly that number. When it CHANGES to a
//   lower number, update() plays its sound, in that same frame. So the
//   picture and the sound always change together, and never twice: a
//   number only sounds if it's LOWER than the last one that sounded.
//
// Keys: SPACE = take the photo now, H = demo on / off.
//
// (enter / update / draw / exit: see screens/welcome.js)
// =============================================================

const mugshotScreen = {
  number: '03',
  name: 'mugshot',
  usesFaces: true,

  enteredAt: 0,
  countdownEndsAt: 0, // when 3-2-1 reaches the photo
  capturedAt: 0, // when the photo was taken (0 = not yet)
  placards: [null, null, null], // where each placard is (follows its face smoothly)
  number: 0, // the countdown number showing now (3, 2, 1), 0 = none
  lastSounded: 4, // the last countdown number that made its sound (4 = none yet)

  enter() {
    const t = CONFIG.ui.tokens.mugshot;
    this.enteredAt = millis();
    this.countdownEndsAt = this.enteredAt + t.lookMs + t.countdownMs;
    this.capturedAt = 0;
    this.placards = [null, null, null];
    this.number = 0;
    this.lastSounded = 4;
    // The radio from 02b must be silent, so the beeps are clear (it's
    // normally long gone: 02b stops it at FREEZE! and when it's left)
    stopSfx('radio', 150);
  },

  // The countdown number at time 'now' (3, 2, 1), or 0 (before it starts / after it ends)
  countdownNumber(now) {
    if (now < this.enteredAt + CONFIG.ui.tokens.mugshot.lookMs) return 0;
    return max(0, ceil((this.countdownEndsAt - now) / 1000));
  },

  update() {
    const t = CONFIG.ui.tokens.mugshot;
    const now = millis();

    // After the photo: wait for the flash, then the evidence
    if (this.capturedAt > 0) {
      if (now - this.capturedAt >= t.flashMs + t.afterMs) goTo('evidence');
      return;
    }

    // The placards follow the faces smoothly
    const view = mugshotView();
    const k = CONFIG.ui.tokens.faceCrop.smoothing;
    for (let i = 0; i < 3; i++) {
      const face = liveFaces[i];
      if (!face || !cameraReady) {
        this.placards[i] = null;
        continue;
      }
      // Just under the chin, centred on the face
      const p = viewPoint(face.box.xMin + face.box.width / 2, face.box.yMax, video, view);
      const old = this.placards[i];
      this.placards[i] = old ? { x: lerp(old.x, p.x, k), y: lerp(old.y, p.y, k) } : p;
    }

    // ---- The countdown: the number, and its sound when it changes ----
    // (It only depends on the clock, not on the faces: once started, it
    // always runs to the end, sounds included.)
    this.number = this.countdownNumber(now);
    if (this.number >= 1 && this.number < this.lastSounded) {
      this.lastSounded = this.number;
      playCountdownStep(this.number); // sound.js: beep / voice / both
    }

    // The countdown has finished: try to take the photo
    if (now >= this.countdownEndsAt) {
      const people = this.peopleForPhoto();
      if (people) {
        takePhoto(people); // sketch.js: freeze frame + faces, recipe, collage, AND the snap sound
        this.capturedAt = now; // the white flash starts now (same frame as the snap)
        this.number = 0;
      } else if (now - this.countdownEndsAt >= t.captureGraceMs) {
        showMessage('Need exactly ' + CONFIG.faces.required + ' faces, found ' + liveFaces.length);
        goTo('wanted');
      }
    }
  },

  // The 3 faces for the photo, or null if we can't take it right now.
  // Testing alone (demo hands up on): missing people are copies of the
  // faces we have, so the rest of the story still works.
  peopleForPhoto() {
    const need = CONFIG.faces.required;
    if (!cameraReady) return null;
    if (liveFaces.length === need) return liveFaces;
    if (gestureDemo && liveFaces.length > 0 && liveFaces.length < need) {
      const filled = [];
      for (let i = 0; i < need; i++) filled.push(liveFaces[i % liveFaces.length]);
      return filled;
    }
    return null;
  },

  draw() {
    const t = CONFIG.ui.tokens;
    const c = CONFIG.ui.colors;
    const now = millis();
    const view = mugshotView();

    // ---- The camera (frozen on the photo once it's taken) ----
    const source = this.capturedAt > 0 ? snap : cameraReady ? video : null;
    CameraView(source, view);
    HeightChart(view);

    // ---- The placards under the faces (only while live) ----
    if (this.capturedAt === 0) {
      const date = nf(day(), 2) + '.' + nf(month(), 2) + '.' + year();
      for (let i = 0; i < 3; i++) {
        const p = this.placards[i];
        if (!p) continue;
        const w = t.placard.w;
        const h = t.placard.h;
        // Centred under the chin, kept inside the picture
        const x = constrain(p.x - w / 2, view.x + t.space.m, view.x + view.w - w - t.space.m);
        const y = constrain(p.y + t.space.m, view.y + t.space.m, view.y + view.h - h - t.space.m);
        Placard(x, y, 'No. ' + storyRound.bookingNumbers[i], date, CONFIG.colors.people[i]);
      }
    }

    // ---- What to do, and the countdown ----
    const lookEnds = this.enteredAt + t.mugshot.lookMs;
    let line = 'Look at the camera.';
    if (now >= lookEnds && this.capturedAt === 0) {
      // The number update() worked out this frame (the same one its beep is for)
      if (this.number >= 1) Countdown(this.number, view.x + view.w / 2, view.y + view.h / 2);
      line = this.number >= 1 ? 'Don\'t move…' : 'Hold still…';
    }
    if (this.capturedAt > 0) line = 'Booked.';
    push();
    noStroke();
    fill(c.text);
    setType('lead');
    textAlign(CENTER, BASELINE);
    text(line, CONFIG.stage.width / 2, t.screen.instructionBaseline);
    pop();

    // ---- The flash, over everything ----
    if (this.capturedAt > 0) CameraFlash(now - this.capturedAt);
  },

  keyPressed() {
    if (key === ' ') {
      // Take the photo now. The numbers not reached yet are skipped,
      // silently (a number only sounds when it's lower than the last one).
      this.countdownEndsAt = millis();
      return false;
    }
    if (key === 'h' || key === 'H') {
      showMessage('Demo hands up: ' + (toggleGestureDemo() ? 'on' : 'off'));
    }
  },

  exit() {
    stopSpeech(); // a voice count still talking (goTo() stops the beeps / shutter)
  },
};

// Where the camera picture sits on the stage (tokens.mugshot.view, centred)
function mugshotView() {
  const v = CONFIG.ui.tokens.mugshot.view;
  return { x: (CONFIG.stage.width - v.w) / 2, y: v.y, w: v.w, h: v.h };
}
