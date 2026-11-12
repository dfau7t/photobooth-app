// =============================================================
// screens/handsup.js — scene 02b: hands up! (page dot 02)
//
// In the story: the police car has arrived (scene 02a, arrival.js).
// Now the suspects see themselves on the live camera and must raise
// BOTH hands, open palms.
//
// What's on screen:
//   - the live camera in a white doodle frame, exactly where the
//     mugshot camera is (so 02b -> 03 looks like one continuous shot)
//   - "HANDS / UP!" stacked in the top-left margin
//   - for each person, following their face:
//       * a status pill above the head: HANDS UP 0/2 -> 1/2 -> 2/2
//       * a doodle circle around each raised hand
//         (outline = arm up, filled = arm up with an open palm: counts)
//       * at 2/2 a SURRENDERED stamp on the chest (never on the face)
//   - the officer, small, peeking up from the bottom-right corner, with
//     his speech bubble; his lines get stricter over time
//   - "x / 3 ready" under the camera
//
// Against flicker (gesture.js, "DEBOUNCE AND LATCH"): a hand only counts
// as up / down once the models have been sure for a moment, and someone
// who has held 2/2 is LOCKED as surrendered for the rest of the round
// (pill "2/2 ✓", the stamp stays), even if detection drops.
// Debug overlay (D): per person, the RAW detection, the DEBOUNCED count
// and the LATCH, side by side, with a short history strip, so you can
// see the flicker in RAW and that it's gone in DEBOUNCED.
//
// Goes to:
//   mugshot, when all 3 are locked as surrendered ("FREEZE! Don't move.")
//   wanted, when there were fewer than 3 faces for 2 s
// Keys: SPACE / ENTER = skip to the mugshot (ENTER = an arcade button),
//       H = pretend everyone has their hands up (for testing alone).
// SOUNDS (sound.js; CONFIG.sound):
//   - the police radio from 02a plays on quietly (CONFIG.sound.radio) and
//     fades out after ~8 s. (Skipped 02a before it started? It starts here.)
//   - a walkie-talkie static burst before each new officer line; the
//     line types once the burst is over
//   - a stamp thud when someone gets SURRENDERED (once per person per visit)
//   - FREEZE!: a blip instead of the static, and the radio stops
//   Leaving this screen stops the radio too.
// All positions and timings: tokens.handsupLive in config.js.
//
// (enter / update / draw / exit: see screens/welcome.js)
// =============================================================

const handsupScreen = {
  number: '02', // same page dot as the arrival scene
  name: 'handsup',
  usesFaces: true,

  enteredAt: 0,
  gesture: null, // the latest result of updateGesture()
  stamps: [], // one SURRENDERED stamp per person
  pills: [null, null, null], // where each status pill is (follows its face smoothly)
  torsos: [null, null, null], // where each stamp goes (the chest)
  hands: [[null, null], [null, null], [null, null]], // per person: [left hand, right hand] circles
  history: [[], [], []], // per person, for the debug view: recent { raw, debounced } counts
  bubble: null, // what the officer is saying: { words, startedAt }
  scheduleKey: '', // which scheduled line we're on (see scheduledLine)
  prevAnyOneHand: false,
  lastOneHandAt: -Infinity,
  lowSince: 0, // when we first had fewer than 3 faces (0 = we have 3)
  freezeAt: 0, // when "FREEZE!" was said (0 = not yet)
  stampSounded: [false, false, false], // the stamp thud has played for this person
  radioFaded: false, // the radio has started fading out

  enter() {
    this.enteredAt = millis();
    this.gesture = null;
    // Stamps in the person's colour: it shows WHO surrendered
    this.stamps = [0, 1, 2].map((i) => makeStamp('SURRENDERED', { size: 'M', color: CONFIG.colors.people[i] }));
    this.pills = [null, null, null];
    this.torsos = [null, null, null];
    this.hands = [[null, null], [null, null], [null, null]];
    this.history = [[], [], []];
    // He JUST said "Hands where I can see them!" in scene 02a: keep it in
    // the bubble, already fully typed (startedAt far in the past)
    this.bubble = { words: CONFIG.police.lines.start, startedAt: -Infinity };
    this.scheduleKey = 'start';
    this.prevAnyOneHand = false;
    this.lastOneHandAt = -Infinity;
    this.lowSince = 0;
    this.freezeAt = 0;
    this.stampSounded = [false, false, false];
    this.radioFaded = false;
    stopGesture(); // a new round: fresh hand memory, nobody locked yet

    // The radio from 02a: quieter here. (If 02a was skipped before it was
    // booked, start it now, once per round.)
    const R = CONFIG.sound.radio;
    if (!sfxPending('radio') && !storyRound.radioStarted) {
      playSfx('radio', { keep: true });
      storyRound.radioStarted = true;
    }
    duck('radio', R.quietIn02b, R.duckMs);
  },

  update() {
    const h = CONFIG.ui.tokens.handsupLive;
    const now = millis();
    if (cameraReady) setupGesture(video); // load the hand models (if 02a didn't already)

    // ---- The radio fades out after a while ----
    const R = CONFIG.sound.radio;
    if (!this.radioFaded && now - this.enteredAt >= R.fadeAfterMs) {
      this.radioFaded = true;
      stopSfx('radio', R.fadeMs);
    }

    // ---- "FREEZE!" was said: wait a moment, then the mugshot ----
    if (this.freezeAt > 0) {
      if (now - this.freezeAt >= h.freezeMs) goTo('mugshot');
      return;
    }

    // ---- Someone left? (not while testing alone with H) ----
    if (liveFaces.length < CONFIG.faces.required && !gestureDemo) {
      if (this.lowSince === 0) this.lowSince = now;
      if (autoAdvance && now - this.lowSince >= h.faceLossMs) {
        goTo('wanted');
        return;
      }
    } else {
      this.lowSince = 0;
    }

    // ---- Hands (gesture.js) ----
    const g = updateGesture(liveFaces);
    this.gesture = g;
    this.followPeople(g);
    for (let i = 0; i < 3; i++) {
      // ready = locked as surrendered (latch on), or 2/2 right now (latch off)
      if (g.slots[i].ready) {
        showStamp(this.stamps[i]);
        // The thud, only the FIRST time this person surrenders
        if (!this.stampSounded[i]) {
          this.stampSounded[i] = true;
          playSfx('stamp');
        }
      } else {
        hideStamp(this.stamps[i]);
      }
      // For the debug view: remember the last few counts
      const h = this.history[i];
      h.push({ raw: g.slots[i].present ? g.slots[i].raw : -1, debounced: g.slots[i].handsUp });
      if (h.length > DEBUG_HISTORY) h.shift();
    }

    // ---- What the officer says ----
    // Someone has ONE hand up: an extra line, straight away (not too often)
    const anyOneHand = g.slots.some((p) => p.present && p.handsUp === 1);
    if (anyOneHand && !this.prevAnyOneHand && now - this.lastOneHandAt > h.oneHandCooldownMs) {
      this.say(CONFIG.police.lines.oneHand);
      this.lastOneHandAt = now;
    }
    this.prevAnyOneHand = anyOneHand;

    // The lines that come with time (they get stricter)
    const line = scheduledLine(now - this.enteredAt);
    if (line.key !== this.scheduleKey) {
      this.scheduleKey = line.key;
      const words = this.lineWords(line.name, g);
      if (words) this.say(words);
    }

    // ---- Everyone held both hands up long enough ----
    if (g.triggered) {
      this.say(CONFIG.police.lines.freeze, 'blip'); // a blip instead of the static
      this.freezeAt = now;
      stopGesture();
      stopSfx('radio', 300);
    }
  },

  // Move the pills, stamps and hand circles to where each person is now.
  // Person i = the face in the i-th third of the screen (same as gesture.js).
  // Camera pixels -> stage with viewPoint(), then smoothed (like the
  // mugshot placards), so nothing jitters.
  followPeople(g) {
    const h = CONFIG.ui.tokens.handsupLive;
    const label = CONFIG.ui.tokens.statusLabel;
    const k = CONFIG.ui.tokens.faceCrop.smoothing;
    const view = mugshotView();
    const bySlot = facesBySlot(liveFaces); // wanted.js

    for (let i = 0; i < 3; i++) {
      const face = bySlot[i];
      const st = g.slots[i];
      if (!face || !cameraReady) {
        // Face lost for a moment: a locked person keeps their pill and
        // stamp where they were; anyone else's disappear
        if (!st.latched) {
          this.pills[i] = null;
          this.torsos[i] = null;
        }
        this.hands[i] = [null, null];
        continue;
      }
      // The top of the head and the chin, on the stage
      const cx = face.box.xMin + face.box.width / 2;
      const top = viewPoint(cx, face.box.yMin, video, view);
      const chin = viewPoint(cx, face.box.yMax, video, view);
      const faceH = chin.y - top.y;

      // The pill just above the head; the stamp on the chest
      this.pills[i] = smoothPoint(this.pills[i], { x: top.x, y: top.y - h.pillAbove - label.h / 2 }, k);
      this.torsos[i] = smoothPoint(this.torsos[i], { x: chin.x, y: chin.y + faceH * h.torsoBelow }, k);

      // A circle around each raised hand:
      //   outline = the arm is up right now (raw), filled = the hand COUNTS (debounced)
      for (let arm = 0; arm < 2; arm++) {
        const a = st.arms ? st.arms[arm] : null; // where it is (this frame), if seen
        const counts = st.armsUp[arm];
        const old = this.hands[i][arm];
        if (!counts && !(a && a.up)) {
          this.hands[i][arm] = null; // down
        } else if (a) {
          const p = smoothPoint(old, viewPoint(a.x, a.y, video, view), k);
          this.hands[i][arm] = { x: p.x, y: p.y, palm: counts };
        } else if (old) {
          old.palm = counts; // not seen this frame but still counts: stay where it was
        }
      }
    }
  },

  // Start a new line in the speech bubble (one at a time).
  // First a short walkie-talkie burst (or another sound), THEN it types.
  say(words, burst) {
    const ms = CONFIG.sound.staticBeforeLineMs;
    playSfx(burst || 'static', { length: ms }); // (the synth static needs to know how long)
    this.bubble = { words: words, startedAt: millis() + ms };
  },

  // The words for a line name from CONFIG.police.lines.
  // "Both hands, suspect {n}!" gets the number of the first person who isn't ready.
  lineWords(name, g) {
    let words = CONFIG.police.lines[name];
    if (name === 'nameOne') {
      const i = g.slots.findIndex((p) => !p.ready);
      if (i < 0) return null; // everyone is ready: no need to name anyone
      words = words.replace('{n}', nf(i + 1, 2));
    }
    return words;
  },

  draw() {
    const t = CONFIG.ui.tokens;
    const h = t.handsupLive;
    const c = CONFIG.ui.colors;
    const view = mugshotView();

    // ---- The live camera (same place and frame as the mugshot) ----
    CameraView(cameraReady ? video : null, view);

    // ---- Per person: hand circles, stamp, status pill ----
    for (let i = 0; i < 3; i++) {
      for (const hand of this.hands[i]) {
        if (hand) HandMarker(i, hand.x, hand.y, hand.palm);
      }
      // The stamp on the chest, kept inside the picture
      const torso = this.torsos[i];
      if (torso) {
        this.stamps[i].x = constrain(torso.x, view.x + h.stampInset, view.x + view.w - h.stampInset);
        this.stamps[i].y = min(torso.y, view.y + view.h - t.space.xl);
      }
      drawStamp(this.stamps[i]);
      // The pill above the head, kept inside the picture
      const pill = this.pills[i];
      if (pill) {
        const half = t.statusLabel.w / 2 + t.space.m;
        const x = constrain(pill.x, view.x + half, view.x + view.w - half);
        const y = max(pill.y, view.y + t.statusLabel.h / 2 + t.space.m);
        const st = this.gesture && this.gesture.slots[i];
        StatusLabel(i, st ? st.handsUp : 0, x, y, st && st.latched);
      }
    }

    // ---- HANDS / UP! in the top-left margin ----
    SlamWord('HANDS', t.layout.margin, h.headlineBaselines[0], this.enteredAt, 'headline', t.handsup.wordFrom);
    SlamWord('UP!', t.layout.margin, h.headlineBaselines[1], this.enteredAt + h.wordGapMs, 'headline', t.handsup.wordFrom);

    // ---- The officer in the corner, and his bubble ----
    const b = this.bubble;
    const typed = b ? max(0, floor((millis() - b.startedAt) / CONFIG.ui.timing.typewriterMs)) : 0;
    const talking = b && typed < b.words.length + 20; // a little longer than typing
    PoliceOfficer(h.officerX, h.officerFeetY, talking, 'left', h.officerScale);
    if (b) SpeechBubble(b.words, typed, h.bubbleRight, h.bubbleY, 'side');

    // ---- x / 3 ready (or: still loading) ----
    let status;
    if (this.gesture && this.gesture.loading) status = 'loading hand detector…';
    else status = (this.gesture ? this.gesture.readyCount : 0) + ' / ' + CONFIG.faces.required + ' ready';
    if (gestureDemo) status += '  ·  DEMO (H)';
    push();
    noStroke();
    fill(c.text);
    setType('lead');
    textAlign(LEFT, BASELINE);
    text(status, view.x, h.readyBaseline);
    pop();

    if (uiDebug) this.drawDebug();
  },

  // Debug overlay (D), in the left margin: per person
  //   01  LOCK ✓              the latch
  //   RAW 1/2  DEB 2/2        this frame: straight from the models / debounced
  //   R ▮▮▯▮▮▮▯▮…             the last few seconds of RAW (flickers)
  //   D ▮▮▮▮▮▮▮▮…             ...and of DEBOUNCED (steady)
  // Strip colours: dark = 0 hands, half = 1, full = 2, red = no face.
  drawDebug() {
    const t = CONFIG.ui.tokens;
    const c = CONFIG.ui.colors;
    const d = t.handsupLive.debug;
    push();
    noStroke();
    textAlign(LEFT, BASELINE);
    for (let i = 0; i < 3; i++) {
      const st = this.gesture ? this.gesture.slots[i] : null;
      const y = d.y + i * d.blockH;
      const colour = CONFIG.colors.people[i];
      setType('caption');
      fill(colour);
      text(nf(i + 1, 2) + '  LOCK ' + (st && st.latched ? '✓' : '–'), t.layout.margin, y);
      fill(c.text);
      const raw = st && st.present ? st.raw + '/2' : '--';
      text('RAW ' + raw + '  DEB ' + (st ? st.handsUp : 0) + '/2', t.layout.margin, y + d.lineH);
      // The two history strips
      const strips = [['R', 'raw'], ['D', 'debounced']];
      strips.forEach((strip, row) => {
        const sy = y + d.lineH + t.space.s + row * (d.stripH + t.space.xs);
        fill(c.muted);
        text(strip[0], t.layout.margin, sy + d.stripH);
        this.history[i].forEach(function (sample, n) {
          const v = sample[strip[1]];
          const col = color(v < 0 ? c.debug : v === 0 ? c.panel : colour);
          if (v === 1) col.setAlpha(128);
          fill(col);
          rect(t.layout.margin + t.space.l + n * d.sampleW, sy, d.sampleW, d.stripH);
        });
      });
    }
    pop();
  },

  keyPressed() {
    if (key === ' ' || keyCode === ENTER) {
      goTo('mugshot'); // skip (SPACE), or the staff arcade button (ENTER)
      return false;
    }
    if (key === 'h' || key === 'H') {
      showMessage('Demo hands up: ' + (toggleGestureDemo() ? 'on' : 'off'));
    }
  },

  exit() {
    stopGesture(); // the hand models stop running (they only run on this screen)
    stopSfx('radio', 150); // (goTo() stops the rest: the radio was "keep", from 02a)
  },
};

// How many frames of history the debug view shows
const DEBUG_HISTORY = 88;

// Move smoothly towards 'target' (k = how much of the way per frame).
// No old point yet: jump straight there.
function smoothPoint(old, target, k) {
  if (!old) return { x: target.x, y: target.y };
  return { x: lerp(old.x, target.x, k), y: lerp(old.y, target.y, k) };
}

// Which line the officer should be on, 'ms' after he started talking.
// The times are CONFIG.police.escalateAtMs: [0, 4000, 8000, 12000, 20000]:
//   0 s start · 4 s nameOne · 8 s t8 · 12 s t12 · 20 s t20,
//   then every 4 s: nameOne, t8, t12, nameOne, t8, t12, ...
// 'key' is different for every new line (also for repeats), so the
// screen knows when to start a new bubble.
function scheduledLine(ms) {
  const at = CONFIG.police.escalateAtMs;
  const names = ['start', 'nameOne', 't8', 't12', 't20'];
  const last = at.length - 1; // the last warning ("t20")

  // Before the last warning: find the step we're in
  for (let i = 0; i < last; i++) {
    if (ms < at[i + 1]) return { name: names[i], key: names[i] };
  }

  // After the last warning: repeat nameOne, t8, t12, each 4 s (the 4 s → 12 s steps)
  const step = at[2] - at[1]; // 4 s
  const afterLast = ms - at[last];
  const n = floor(afterLast / step); // 0 = still "t20", 1, 2, 3... = repeats
  if (n === 0) return { name: 't20', key: 't20' };
  const repeat = ['nameOne', 't8', 't12'][(n - 1) % 3];
  return { name: repeat, key: repeat + '#' + n };
}
