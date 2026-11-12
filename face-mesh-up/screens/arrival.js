// =============================================================
// screens/arrival.js — scene 02a: the police arrive (page dot 02).
//
// In the story: a police car drives in with its siren on, the officer
// jumps out: "Hands where I can see them!" (no headline: the car, the
// officer and his speech bubble tell the story on their own)
// No camera yet. Then a quick red / blue flash -> scene 02b (handsup).
//
// HOW THE CAR ANIMATION WORKS
// Everything is worked out from ONE number: ms, the time since the
// scene started. So every frame we ask "where should everything be
// at this moment?" (we never move things a little bit each frame).
//
//   1. DRIVING (0 -> driveMs): k goes 0 -> 1. The car's x goes from
//      startX to stopX with an "ease out": fast at first, slowing down
//      at the end, like braking.
//        - WHEELS: a wheel that rolls a distance d turns d / radius
//          (radians). So the spokes turn exactly as fast as the car moves.
//        - BOUNCE: the body is lifted by |sin(d / bounceWave * PI)|, a
//          small up-and-down with every bounceWave px driven. The wheels
//          stay on the ground.
//        - SPEED LINES: behind the car, fading out as it slows down.
//   2. THE STOP JOLT (driveMs -> + joltMs): the body tips forward
//      (nose down, joltAngle) and back, following one hump of a sine.
//   3. LIGHTS AND GLOW: the light bar swaps red / blue every lightMs.
//      After the stop, a soft glow in the same colour pulses behind it.
//   4. THE OFFICER (popAt): slides out from behind the car with a
//      little overshoot ("ease out back"). The car's body is filled
//      black, so while he's behind it, it hides him.
//   5. The bubble types his line (lineAt).
//   6. A quick red / blue flash at the end -> scene 02b.
//
// SOUNDS (all through sound.js; volumes and files in CONFIG.sound):
//   0 ms        the siren, while the car drives in...
//   screechAt   ...the tyres screech as it brakes...
//   popAt       ...the car door thuds as the officer pops out...
//   handsupAt   ...the car has stopped: handsup.mp3 (trimmed by
//               CONFIG.sound.handsupClip, with a short fade-out) REPLACES the siren.
//   The police radio is booked to start CONFIG.sound.radio.afterHandsupMs
//   after handsup.mp3 ends. It's played with keep: true, so it carries on
//   into 02b. While the speech bubble types, it's turned down (duck).
//
// All the numbers are in config.js (tokens.arrival and timing.arrivalMs).
// The hand-detection models start loading here, so they're ready when
// the camera appears in 02b.
// Keys: SPACE = skip to 02b.
// Testing: ?screen=arrival&t=700 in the address freezes the scene at
// 700 ms, so you can look at one moment of the animation.
//
// (enter / update / draw / exit: see screens/welcome.js)
// =============================================================

const arrivalScreen = {
  number: '02', // same page dot as the hands-up scene
  name: 'arrival',

  enteredAt: 0,
  played: {}, // which sounds have already played (each one only once)
  // ?t=700 (or NaN = not frozen). parseInt, not p5's int(): p5 isn't ready yet while this file loads
  frozenAt: parseInt(new URLSearchParams(window.location.search).get('t')),

  // The scene time in ms (or the frozen moment, when testing with ?t=)
  sceneMs() {
    return isNaN(this.frozenAt) ? millis() - this.enteredAt : this.frozenAt;
  },

  enter() {
    this.enteredAt = millis();
    this.played = {};
  },

  update() {
    const a = CONFIG.ui.tokens.arrival;
    const ms = this.sceneMs();
    if (!isNaN(this.frozenAt)) return; // frozen for testing: no sounds, no moving on

    // Start loading the hand models now (does nothing if already loaded)
    if (cameraReady) setupGesture(video);

    // ---- Sounds, each at its moment, once ----
    const R = CONFIG.sound.radio;
    this.once('siren', 0, () => playSfx('siren', { length: a.handsupAt })); // (the synth needs to know how long)
    this.once('screech', a.screechAt, () => playSfx('screech'));
    this.once('thud', a.popAt, () => playSfx('thud'));
    this.once('handsup', a.handsupAt, () => this.playHandsup());
    // The radio: turned down while the bubble types, back up after
    this.once('duck', a.lineAt, () => duck('radio', R.duckTo, R.duckMs));
    this.once('unduck', a.lineAt + CONFIG.police.lines.start.length * CONFIG.ui.timing.typewriterMs, () => duck('radio', 1, R.duckMs));

    if (ms >= CONFIG.ui.timing.arrivalMs) goTo('handsup');
  },

  // The car has stopped: handsup.mp3 replaces the siren, and the radio is booked
  // to start a moment after it ends
  playHandsup() {
    const clip = CONFIG.sound.handsupClip;
    stopSfx('siren', 100);
    const play = playSfx('handsup', { start: clip.start, end: clip.end, fadeOut: clip.fadeMs });
    if (!play) return; // no sound engine
    const delay = play.duration * 1000 + CONFIG.sound.radio.afterHandsupMs;
    playSfx('radio', { delay: delay, keep: true });
    storyRound.radioStarted = true; // (02b won't start it again)
  },

  // Play a sound once, as soon as the scene time passes 'atMs'
  once(name, atMs, play) {
    if (this.played[name] || this.sceneMs() < atMs) return;
    this.played[name] = true;
    play();
  },

  draw() {
    const t = CONFIG.ui.tokens;
    const a = t.arrival;
    const ms = this.sceneMs();

    // ---- 1. Driving in ----
    const k = constrain(ms / a.driveMs, 0, 1); // 0 -> 1 while driving
    const eased = 1 - pow(1 - k, 3); // ease out: slows down at the end (braking)
    const carX = a.startX + (a.stopX - a.startX) * eased;
    const driven = carX - a.startX; // how far the car has gone (px)
    const wheelAngle = driven / t.car.wheelRadius; // rolling: distance / radius
    const lift = k < 1 ? a.bounce * abs(sin((driven / a.bounceWave) * PI)) : 0;
    const speed = k < 1 ? 1 - eased : 0; // speed lines fade as it slows

    // ---- 2. The jolt when it stops ----
    const j = (ms - a.driveMs) / a.joltMs; // 0 -> 1 during the jolt
    const tilt = j > 0 && j < 1 ? a.joltAngle * sin(j * PI) : 0;

    // ---- 3. The glow behind the car (after the stop) ----
    const glowStrength = (ms - a.driveMs) / a.glow.fadeInMs;
    if (glowStrength > 0) SirenGlow(carX - 40, a.groundY - 220, ms, glowStrength);

    GroundLine(a.groundY);

    // ---- 4. The officer, sliding out from behind the car ----
    // (drawn BEFORE the car, so the car hides him while he's behind it)
    const p = (ms - a.popAt) / a.popMs;
    if (p > 0) {
      const officerX = a.stopX + (a.officerX - a.stopX) * easeOutBack(constrain(p, 0, 1));
      const typed = this.typedLetters(ms);
      const talking = ms >= a.lineAt && typed < CONFIG.police.lines.start.length + 20;
      PoliceOfficer(officerX, a.groundY, talking, 'right');
    }

    PoliceCar(carX, a.groundY, { wheelAngle: wheelAngle, lift: lift, tilt: tilt, ms: ms, speed: speed });

    // ---- 5. The officer's line ----
    if (ms >= a.lineAt) {
      SpeechBubble(CONFIG.police.lines.start, this.typedLetters(ms), a.bubbleLeft, a.bubbleY, 'left');
    }

    // ---- 6. A quick red / blue flash at the very end ----
    const flashTotal = a.exitFlashes * 2 * CONFIG.ui.timing.sirenFlashMs;
    SirenFlash(ms - (CONFIG.ui.timing.arrivalMs - flashTotal), a.exitFlashes);
  },

  // How many letters of the line are typed so far
  typedLetters(ms) {
    return max(0, floor((ms - CONFIG.ui.tokens.arrival.lineAt) / CONFIG.ui.timing.typewriterMs));
  },

  keyPressed() {
    if (key === ' ') {
      goTo('handsup'); // skip to the live camera
      return false;
    }
  },

  exit() {
    // Nothing to do: goTo() stops this screen's sounds (siren, handsup.mp3,
    // with a short fade). The radio was played with keep: true, so it plays
    // on into 02b.
  },
};
