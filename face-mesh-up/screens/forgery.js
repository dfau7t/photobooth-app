// =============================================================
// screens/forgery.js — scene 05: the forgery (page dot 05).
//
// A short comic interlude: "Meanwhile, in the back room…" the three
// bandits sneak in, each does their thing, and they're off again.
// (The result itself is revealed on the case file, 06.)
//
// What happens, in order (all times in tokens.forgery, total
// CONFIG.ui.timing.forgeryMs):
//   0.0 s  the caption types "Meanwhile, in the back room…"
//   0.4 s  the bandits tiptoe in from the right in single file (01 first),
//          bobbing, each a little out of step, and stop in a row
//   1.8 s  each does their action in place (a little after the one before):
//            01 scribbles in the air with the pencil
//            02 snips the scissors a few times
//            03 looks left, right, left… then nods
//   3.6 s  they turn and run off to the left, in single file
//   4.3 s  -> 06 casefile
//
// HOW IT'S ANIMATED
// Everything is worked out from ONE number: ms, the time since the scene
// started (like the police car in arrival.js). For each bandit we ask
// "at this moment, where are you and what are you doing?" (banditAt).
//
// Keys: SPACE = skip to the case file.
// Testing: ?screen=forgery&t=2400 freezes the scene at 2.4 s.
//
// (enter / update / draw / exit: see screens/welcome.js)
// =============================================================

const forgeryScreen = {
  number: '05',
  name: 'forgery',

  enteredAt: 0,
  played: {}, // which sounds have already played (each one only once)
  lastStep: -1, // the last tiptoe step that made a sound
  frozenAt: parseInt(new URLSearchParams(window.location.search).get('t')), // ?t=2400 (NaN = not frozen)

  // The scene time in ms (or the frozen moment, when testing with ?t=)
  sceneMs() {
    return isNaN(this.frozenAt) ? millis() - this.enteredAt : this.frozenAt;
  },

  enter() {
    this.enteredAt = millis();
    this.played = {};
    this.lastStep = -1;
  },

  update() {
    const f = CONFIG.ui.tokens.forgery;
    const ms = this.sceneMs();
    if (!isNaN(this.frozenAt)) return; // frozen for testing: no sounds, no moving on

    // ---- Sounds ----
    // Tiptoe: one plucked note per step, while anyone is still walking
    const walkEnds = f.enterAt + 2 * f.enterGapMs + f.walkMs;
    if (ms >= f.enterAt && ms < walkEnds) {
      const step = floor((ms - f.enterAt) / f.stepMs);
      if (step > this.lastStep) {
        this.lastStep = step;
        playFile('tiptoe', () => playPluck(step));
      }
    }
    // Bandit 01's scribble, bandit 02's snips (one each time the blades close)
    this.once('pencil', this.actionStart(0), () => playFile('pencil', () => playScratch(f.scribble.soundMs)));
    for (let n = 1; n <= f.snips; n++) {
      this.once('snip' + n, this.actionStart(1) + (n / f.snips) * f.actionMs - 60, () => playFile('scissors', playSnip));
    }
    this.once('whoosh', f.runAt, () => playFile('whoosh', playWhoosh));

    if (ms >= CONFIG.ui.timing.forgeryMs) goTo('casefile');
  },

  // Play a sound once, as soon as the scene time passes 'atMs'
  once(name, atMs, play) {
    if (this.played[name] || this.sceneMs() < atMs) return;
    this.played[name] = true;
    play();
  },

  // When bandit i starts their action (each a little after the one before)
  actionStart(i) {
    const f = CONFIG.ui.tokens.forgery;
    return f.actionAt + i * f.actionGapMs;
  },

  draw() {
    const t = CONFIG.ui.tokens;
    const f = t.forgery;
    const ms = this.sceneMs();

    // ---- The caption, typed ----
    const words = 'Meanwhile, in the back room…';
    const typed = max(0, floor(ms / CONFIG.ui.timing.typewriterMs));
    push();
    noStroke();
    fill(CONFIG.ui.colors.text);
    setType('numeral'); // mono
    textAlign(LEFT, BASELINE);
    text(words.substring(0, typed), t.layout.margin, f.captionBaseline);
    pop();

    // ---- The ground, and the three bandits on it ----
    GroundLine(f.floorY);
    for (let i = 0; i < 3; i++) {
      const b = this.banditAt(i, ms);
      if (!b) continue;
      if (b.speed > 0) SpeedLines(b.x + 60 * f.size, f.floorY - 260 * f.size, 1, b.speed, f.size);
      Bandit(i, b.pose, b.x, f.floorY - b.lift, { facing: b.facing, size: f.size, snip: b.snip, toolAngle: b.toolAngle, lean: b.lean });
    }
  },

  // Bandit i at time ms: { x, lift, pose, facing, snip, toolAngle, lean, speed },
  // or null when off screen (not in yet, or already gone)
  banditAt(i, ms) {
    const f = CONFIG.ui.tokens.forgery;
    const b = { x: f.spots[i], lift: 0, pose: 'working', facing: 'left', snip: 0, toolAngle: 0, lean: 0, speed: 0 };

    // ---- 1. Tiptoeing in, in single file (01 first) ----
    const startT = f.enterAt + i * f.enterGapMs;
    if (ms < startT) return null; // not here yet
    const walk = (ms - startT) / f.walkMs; // 0 -> 1
    if (walk < 1) {
      const steps = (ms - startT) / f.stepMs + f.stepOffsets[i]; // a little out of step with the others
      b.x = lerp(f.startX, f.spots[i], 1 - pow(1 - walk, 2)); // slowing down a little at the end
      b.pose = floor(steps) % 2 === 0 ? 'tiptoeA' : 'tiptoeB';
      b.lift = f.bob * abs(sin(steps * PI)); // up and down with every step
      return b;
    }

    // ---- 3. Running off to the left, in single file (01 first) ----
    const runT = f.runAt + i * f.runGapMs;
    if (ms >= runT) {
      const r = (ms - runT) / f.runMs; // 0 -> 1
      if (r >= 1) return null; // gone
      b.x = lerp(f.spots[i], f.runToX, r * r); // speeding up
      b.pose = 'running';
      b.speed = 1 - r * 0.5;
      return b;
    }

    // ---- 2. Their action, in place ----
    const a = ms - this.actionStart(i); // ms since this bandit's action started
    if (a >= 0 && a < f.actionMs) {
      const k = a / f.actionMs; // 0 -> 1
      const tool = CONFIG.forgery.tools[i];
      if (tool === 'pencil') {
        // Scribbling in the air: the pencil swings quickly back and forth
        b.toolAngle = f.scribble.angle * sin((a / 1000) * f.scribble.perSecond * TWO_PI);
      } else if (tool === 'scissors') {
        // Snip, snip: open and closed again, f.snips times
        b.snip = abs(sin(k * f.snips * PI));
      } else {
        // Sneaky: look left, right, left (turn around), then nod
        const turn = f.look.turnMs;
        if (a < 3 * turn) {
          b.facing = floor(a / turn) % 2 === 0 ? 'left' : 'right';
        } else {
          const nod = (a - 3 * turn) / (f.actionMs - 3 * turn); // 0 -> 1
          b.lean = f.look.nodAngle * abs(sin(nod * f.look.nods * PI));
        }
      }
    }
    return b;
  },

  keyPressed() {
    if (key === ' ') {
      goTo('casefile'); // skip
      return false;
    }
  },

  exit() {
    stopSounds(); // e.g. the pencil scribble
  },
};
