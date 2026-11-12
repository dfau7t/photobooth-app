// =============================================================
// screens/welcome.js — screen 00: the crime scene.
//
// In the story: three chalk body outlines on a torn red band, three
// marks on the floor. "Step onto the three marks."
// Goes to: wanted, as soon as at least one face is found.
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

  enter() {
    this.enteredAt = millis();
    startNewRound(); // back at the start = a new group of suspects (sketch.js)
  },

  update() {
    // Someone stepped in: on to the WANTED posters
    if (autoAdvance && liveFaces.length > 0) goTo('wanted');
  },

  draw() {
    const t = CONFIG.ui.tokens;
    const c = CONFIG.ui.colors;
    const ms = millis() - this.enteredAt;

    // ---- Title, with a blinking cursor: WELCOME TO / MUGSHOT(3)_ ----
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
    NumberBadge(String(CONFIG.faces.required), 'PEOPLE PER ROUND', gridX(9), t.screen.welcomeTitle[0] - t.space.xxl);

    // ---- The crime scene: a torn red band with three chalk outlines ----
    const bandY = t.screen.welcomeBandY;
    TornBand(CONFIG.stage.width + 2 * t.space.huge, CONFIG.stage.width / 2, bandY, c.sirenRed);
    for (let i = 0; i < 3; i++) {
      const figureMs = ms - i * t.chalkFigure.staggerMs; // each one starts a bit later
      ChalkFigure(i, t.screen.slotX[i], bandY, t.chalkFigure.angles[i], figureMs);
    }

    // ---- The three marks on the floor ----
    for (let i = 0; i < 3; i++) FloorMark(i, t.screen.slotX[i], t.screen.floorMarkY);

    // ---- Instruction ----
    push();
    noStroke();
    fill(c.text);
    setType('lead');
    textAlign(CENTER, BASELINE);
    text('Step onto the three marks on the floor to begin', CONFIG.stage.width / 2, t.screen.instructionBaseline);
    pop();
  },

  exit() {},
};
