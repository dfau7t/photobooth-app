// =============================================================
// screens/welcome.js — screen 00: the crime scene.
//
// In the story: three chalk body outlines standing on a torn red band,
// their legs on a blue floor (one picture: assets/welcome/figures.png),
// three numbered marks, "3 PEOPLE PER ROUND", and at the bottom, gently
// pulsing: "Step onto the three marks on the floor to begin!".
// Positions: tokens.welcome. Shift+R lays the reference
// (assets/reference/page_00_ref.png) on top at 50%, to check the alignment.
//
// LIVE FEEDBACK: when a face appears in front of a mark (the left / middle
// / right third of the camera, like the WANTED posters), that floor mark
// fills with the person's colour (lightMs) with a soft camera click (once
// per person per round: the WANTED poster then doesn't click again).
// Goes to: wanted, once all 3 people are there (exactly 3 faces) and have
// stayed for goAfterMs. One or two people only light up their marks.
//
// Every screen is an object with the same four functions,
// which sketch.js calls at the right time:
//   enter()   runs ONCE, when we arrive on this screen
//   update()  runs every frame: the logic (timers, "go to the next screen?")
//   draw()    runs every frame, after update(): only drawing
//   exit()    runs ONCE, when we leave this screen (clean up)
// Inside these functions, 'this' means this screen object.
//
// Everything is drawn with components (ui/components.js) and placed
// with tokens (CONFIG.ui.tokens), following the graphic system.
// =============================================================

const welcomeScreen = {
  number: '00',
  name: 'welcome',
  usesFaces: true, // sketch.js keeps liveFaces up to date on this screen

  enteredAt: 0,
  lastAt: 0, // millis() of the last frame (for the light fades)
  present: [false, false, false], // is someone standing on mark 01 / 02 / 03 right now?
  light: [0, 0, 0], // how lit each mark is (0 – 1)
  figures: null, // the figures + floor picture (loaded once)
  showRef: false, // Shift+R: the reference on top
  ref: null, // the reference picture (loaded the first time it's shown)
  threeSince: 0, // since when all 3 faces have been there (0 = not now)

  enter() {
    this.enteredAt = millis();
    this.lastAt = millis();
    this.present = [false, false, false];
    this.light = [0, 0, 0];
    // The figures picture: loaded once, in the background (drawn once it's there)
    if (!this.figures) this.figures = loadImage(CONFIG.ui.tokens.welcome.figures.file, null, () => console.warn('Welcome: ' + CONFIG.ui.tokens.welcome.figures.file + ' is missing'));
    this.threeSince = 0;
    startNewRound(); // back at the start = a new group of suspects (sketch.js)
  },

  update() {
    const w = CONFIG.ui.tokens.welcome;
    const now = millis();
    const dt = now - this.lastAt;
    this.lastAt = now;

    // Who is standing on which mark (wanted.js: by where the face is on screen)
    const bySlot = facesBySlot(liveFaces);
    for (let i = 0; i < 3; i++) {
      const here = !!bySlot[i];
      if (here && !this.present[i]) {
        // Someone just stepped on: (once per round) a click
        if (!storyRound.clicked[i]) {
          storyRound.clicked[i] = true;
          playSfx('click');
        }
      }
      this.present[i] = here;
      // The mark fills (or empties) over lightMs
      this.light[i] = constrain(this.light[i] + ((here ? 1 : -1) * dt) / w.lightMs, 0, 1);
    }

    // All 3 people are there, and stayed a moment: on to the WANTED posters.
    // (Fewer than 3: wait; their marks are lit, showing who's still missing.)
    if (liveFaces.length === CONFIG.faces.required) {
      if (this.threeSince === 0) this.threeSince = now;
    } else {
      this.threeSince = 0; // someone left (or a face flickered): start counting again
    }
    if (autoAdvance && this.threeSince > 0 && now - this.threeSince >= w.goAfterMs) goTo('wanted');
  },

  draw() {
    const t = CONFIG.ui.tokens;
    const w = t.welcome;
    const c = CONFIG.ui.colors;
    const ms = millis() - this.enteredAt;

    // ---- Title, with a blinking cursor: WELCOME TO_ / MUGSHOT(3)_ ----
    // (the cursor sits after the last line, and blinks every cursorBlinkMs)
    push();
    noStroke();
    fill(c.text);
    setType('hero');
    textAlign(LEFT, BASELINE);
    const baselines = t.screen.welcomeTitle;
    text('WELCOME TO', t.layout.margin, baselines[0]);
    const line2 = 'MUGSHOT(3)';
    text(line2, t.layout.margin, baselines[1]);
    const cursorOn = floor(ms / t.timing.cursorBlinkMs) % 2 === 0;
    if (cursorOn) text('_', t.layout.margin + textWidth(line2) + t.space.s, baselines[1]);
    pop();

    // ---- Badge: (3) PEOPLE PER ROUND, on the right half of the grid ----
    NumberBadge(String(CONFIG.faces.required), 'PEOPLE PER ROUND', gridX(9), w.badgeY);

    // ---- The crime scene: the torn red band... ----
    TornBand(CONFIG.stage.width + 2 * t.space.huge, CONFIG.stage.width / 2, w.bandY, c.sirenRed);

    // ---- ...the figures standing on it, their legs on the blue floor (one picture).
    // The top edge of the picture's floor sits on the middle of the band's
    // bottom edge, tilted like the band. ----
    const f = w.figures;
    if (this.figures && this.figures.width > 1) {
      push();
      translate(CONFIG.stage.width / 2, w.bandY + t.band.h / 2);
      rotate(radians(t.band.angle));
      image(this.figures, -f.floorTop.x * f.scale, -f.floorTop.y * f.scale, this.figures.width * f.scale, this.figures.height * f.scale);
      pop();
    }

    // ---- The three numbered marks (one under each figure) ----
    for (let i = 0; i < 3; i++) FloorMark(i, t.screen.slotX[i], w.markY, this.light[i]); // lit = someone's on it

    // ---- Instruction: big, centred at the bottom, gently pulsing ----
    const pulse = lerp(w.pulseMin, 1, 0.5 + 0.5 * cos((ms / w.pulseMs) * TWO_PI)); // 100% -> 60% -> 100%
    push();
    noStroke();
    const ink = color(c.text);
    ink.setAlpha(255 * pulse);
    fill(ink);
    setType('body'); // 24 px mono (Fira Code)
    textAlign(CENTER, BASELINE);
    text('Step onto the three marks on the floor to begin!', CONFIG.stage.width / 2, w.instructionBaseline);
    pop();

    if (this.showRef) this.drawRef(); // Shift+R
  },

  // Shift+R: the reference on / off
  keyPressed() {
    if (key === 'R') {
      this.showRef = !this.showRef;
      showMessage('Reference: ' + (this.showRef ? 'on (50%)' : 'off'));
      return false;
    }
  },

  // The reference on top, at 50% (drawn after everything, see sketch.js draw)
  drawRef() {
    const r = CONFIG.ui.tokens.welcome.ref;
    if (!this.ref) this.ref = loadImage(r.file);
    if (this.ref.width <= 1) return; // still loading
    push();
    tint(255, 255 * r.alpha);
    image(this.ref, r.x, r.y, this.ref.width * r.scale, this.ref.height * r.scale);
    pop();
  },

  exit() {},
};
