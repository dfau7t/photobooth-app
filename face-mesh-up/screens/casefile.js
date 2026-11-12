// =============================================================
// screens/casefile.js — screen 06: the composite suspect.
//
// In the story: the case file of the composite suspect — made from all
// three of them, but none of them. Status: AT LARGE. It's printed for
// the visitors to take home.
//
// What happens, in order (times in CONFIG.ui.timing.reveal, layout in
// tokens.casefile.reveal):
//   THE REVEAL (~8 s, on black, no top bar)
//   1. Dark. "CASE NO. 0002" types in, in the middle, then moves up.
//   2. The doodle head draws on SLOWLY (~3 s), with the pencil sound.
//   3. The die-cut pieces drop on one by one (ears -> lips -> nose -> eyes),
//      0.8 s apart, each with a snip + pat. Under the picture, a caption
//      per piece: "EARS — SUSPECT 02", in that suspect's colour.
//   4. A short pause, a camera FLASH (white-out)... and under it the full
//      case file appears, with the AT LARGE stamp slamming on:
//        LEFT   the big torn WANTED poster with the composite in it
//        RIGHT  "MUGSHOT(3)" + case number, the evidence marker "3", the
//               recipe (who gave what), "Status:" + AT LARGE, print status
//   THEN
//   5. The case file PRINTS by itself, once per photo (print.js):
//      "PRINTING YOUR CASE FILE…", then "Collect your case file…" ✓.
//      (CONFIG.print.auto = false: no printing, "PRINT OFF".) The console
//      logs the time from the photo to the print.
//   6. GOODBYE: the officer peeks in: "You're free to go… for now."
//      Then -> welcome: after timing.casefileMs, but never sooner than
//      print.collectMs after printing (time to collect it).
//
// Like the evidence screen, the sound moments are a "cue sheet" (cues):
// written down when we arrive, played when their time comes. SPACE skips
// the cues it jumps over (no pile of sounds at once).
//
// Keys: SPACE = skip the reveal (straight to the finished case file,
//       which then prints, still only once); SPACE again = back to the
//       start. S = save the composite as a PNG. Shift+P (any screen) =
//       the print dialog by hand.
//
// (enter / update / draw / exit: see screens/welcome.js)
// =============================================================

const casefileScreen = {
  number: "06",
  name: "casefile",
  // For the placeholder, when there's no photo yet
  heading: "CASE FILE",
  story: "Composite suspect",
  plan: "Take a mugshot first (03): this screen shows that round's composite.",
  milestone: 7,

  enteredAt: 0, // millis() when we arrived on this screen
  times: null, // when each step happens (ms since arriving), see makePlan()
  pieces: [], // the pieces, in drop order: [{ feature, at }]
  cues: [], // the cue sheet: [{ at, what, i, done }]
  stamp: null, // the AT LARGE stamp

  // The reveal hides the top bar (sketch.js asks this every frame)
  get hideTopBar() {
    return !!collage && this.times && this.ms() < this.times.layout;
  },

  enter() {
    this.enteredAt = millis();
    this.stamp = null;
    this.makePlan();
  },

  // ms since entering
  ms() {
    return millis() - this.enteredAt;
  },

  // Work out WHEN everything happens, and write the cue sheet
  makePlan() {
    const R = CONFIG.ui.timing.reveal;
    const features = collage && collage.parts ? pieceGroups(collage.parts).features : []; // doodleAnim.js
    const t = {};
    t.type = R.darkMs; // "CASE NO." starts typing
    t.move = t.type + R.caseNoMs; // it moves up, and...
    t.line = t.move; // ...the head starts drawing on
    t.drops = t.line + R.lineMs; // the first piece drops
    const lastLands = t.drops + max(0, features.length - 1) * R.dropGapMs + R.dropMs;
    t.flash = lastLands + R.fadeMs + R.pauseMs; // the flash...
    t.layout = t.flash; // ...with the full case file under it
    t.stamp = t.flash + R.flashMs; // AT LARGE, once the flash has faded
    t.print = t.stamp + R.printDelayMs;
    this.times = t;
    this.pieces = features.map((feature, i) => ({ feature: feature, at: t.drops + i * R.dropGapMs }));

    this.cues = [{ at: t.line, what: 'line' }, { at: t.drops, what: 'lineEnd' }];
    this.pieces.forEach((p, i) => {
      this.cues.push({ at: p.at, what: 'drop', i: i });
      this.cues.push({ at: p.at + R.dropMs, what: 'land', i: i });
    });
    this.cues.push({ at: t.flash, what: 'flash' }, { at: t.stamp, what: 'stamp' }, { at: t.print, what: 'print' });
    this.cues.sort((a, b) => a.at - b.at);
  },

  // When we go back to the start: after casefileMs, but never sooner
  // than collectMs after printing (people are collecting their print)
  leaveAt() {
    let at = this.enteredAt + CONFIG.ui.timing.casefileMs;
    if (recipe && recipe.printedAt) at = max(at, recipe.printedAt + CONFIG.print.printingMs + CONFIG.print.collectMs);
    return at;
  },

  update() {
    if (!collage) return; // no photo yet: nothing to reveal or print
    const ms = this.ms();
    for (const cue of this.cues) {
      if (cue.done || ms < cue.at) continue;
      cue.done = true;
      this.playCue(cue, ms - cue.at);
    }
    if (autoAdvance && millis() >= this.leaveAt()) goTo('welcome');
  },

  // One cue from the cue sheet. late = how many ms after its time it
  // runs (normally less than one frame).
  playCue(cue, late) {
    const R = CONFIG.ui.timing.reveal;
    if (cue.what === 'line') {
      // The reveal animation (doodleAnim.js), at the reveal's slower pace
      if (collage.parts) {
        startDoodleAnimation(collage, { lineMs: R.lineMs, dropGapMs: R.dropGapMs, dropMs: R.dropMs, fadeMs: R.fadeMs });
        doodleAnim.start -= late; // in step with this screen's clock
      }
      playSfx('pencil', { length: R.lineMs - late }); // the scribble, as long as the drawing
    } else if (cue.what === 'lineEnd') {
      stopSfx('pencil', 150);
    } else if (cue.what === 'drop') {
      playSfx('scissors'); // snip...
    } else if (cue.what === 'land') {
      playSfx('paste'); // ...pat
    } else if (cue.what === 'flash') {
      stopDoodleAnimation(); // (it's finished by now anyway)
      playSfx('shutter');
    } else if (cue.what === 'stamp') {
      const at = this.stampPosition();
      this.stamp = makeStamp('AT LARGE', { x: at.x, y: at.y, size: 'M', color: CONFIG.ui.colors.sirenRed });
      showStamp(this.stamp);
      playSfx('stamp');
    } else if (cue.what === 'print') {
      // The "printed" mark is kept ON the recipe (= this photo), so it
      // survives leaving and re-entering this screen. A new photo prints.
      if (CONFIG.print.auto && !recipe.printedAt) {
        recipe.printedAt = millis();
        printCaseFile(); // print.js
        if (recipe.capturedAt) console.log('Capture -> print: ' + nf((recipe.printedAt - recipe.capturedAt) / 1000, 0, 1) + ' s');
      }
    }
  },

  // Where the AT LARGE stamp goes: after "Status:" in the right column
  stampPosition() {
    const t = CONFIG.ui.tokens;
    const cf = t.casefile;
    push();
    setType('lead');
    const statusW = textWidth('Status:');
    // The stamp's width, measured the same way drawStamp() does
    textFont(CONFIG.ui.fonts.display);
    textSize(t.stamp.M);
    drawingContext.letterSpacing = '0px';
    const stampW = snap8(textWidth('AT LARGE') + 2 * t.stamp.padX);
    pop();
    return { x: gridX(cf.columnX) + statusW + cf.stampGap + stampW / 2, y: cf.statusBaseline - t.type.lead.size / 3 };
  },

  // Where the printing stands: 'waiting' (not time yet), 'printing', 'done' or 'off'
  printState() {
    if (this.ms() < this.times.print) return 'waiting';
    if (!CONFIG.print.auto) return 'off';
    if (!recipe || !recipe.printedAt) return 'waiting';
    return millis() - recipe.printedAt < CONFIG.print.printingMs ? 'printing' : 'done';
  },

  draw() {
    // No photo yet this round: the placeholder
    if (!collage) {
      drawScreenPlaceholder(this);
      return;
    }
    const ms = this.ms();
    if (ms < this.times.layout) this.drawReveal(ms);
    else this.drawLayout(ms);

    // The camera flash: white, fading out
    const k = (ms - this.times.flash) / CONFIG.ui.timing.reveal.flashMs;
    if (k >= 0 && k < 1) {
      push();
      noStroke();
      fill(red(CONFIG.ui.colors.text), green(CONFIG.ui.colors.text), blue(CONFIG.ui.colors.text), 255 * (1 - k));
      rect(0, 0, CONFIG.stage.width, CONFIG.stage.height);
      pop();
    }
  },

  // ---- The reveal: on black, the case number, the drawing, the captions ----
  drawReveal(ms) {
    const t = CONFIG.ui.tokens;
    const rv = t.casefile.reveal;
    const R = CONFIG.ui.timing.reveal;
    const c = CONFIG.ui.colors;
    const typed = (words, from) => words.substring(0, max(0, floor((ms - from) / CONFIG.ui.timing.typewriterMs)));

    // "CASE NO. 0002": types in the middle, then moves up
    const up = constrain((ms - this.times.move) / R.moveMs, 0, 1);
    const y = lerp(rv.caseNoMiddle, rv.caseNoTop, 1 - pow(1 - up, 3)); // fast, then slows down
    push();
    noStroke();
    fill(c.text);
    setType('headline');
    textAlign(CENTER, BASELINE);
    text(typed('CASE NO. ' + nf(recipe.number || 0, 4), this.times.type), CONFIG.stage.width / 2, y);
    pop();

    // The drawing: blank paper, then the animation (finished: the collage)
    if (ms >= this.times.line) {
      const p = rv.picture;
      const w = (p.h * CONFIG.output.width) / CONFIG.output.height; // 4:5
      const picture = doodleAnimationFrame() || collage;
      image(picture, p.cx - w / 2, p.top, w, p.h);
      DoodleFrame(p.cx - w / 2, p.top, w, p.h, c.chalk);
    }

    // The caption of the last piece that dropped: "EARS — SUSPECT 02"
    const piece = this.pieces.filter((p) => ms >= p.at).pop();
    if (piece) {
      const person = recipe[piece.feature];
      push();
      noStroke();
      fill(CONFIG.colors.people[person]);
      setType('lead');
      textAlign(CENTER, BASELINE);
      text(typed(piece.feature.toUpperCase() + ' — SUSPECT ' + nf(person + 1, 2), piece.at), CONFIG.stage.width / 2, rv.captionBaseline);
      pop();
    }
  },

  // ---- The full case file (after the flash) ----
  drawLayout(ms) {
    const t = CONFIG.ui.tokens;
    const cf = t.casefile;
    const c = CONFIG.ui.colors;

    // LEFT: the poster with the finished composite
    CaseFilePoster(collage, cf.poster.cx, cf.poster.cy, cf.poster.angle);

    // RIGHT: the case file
    const x = gridX(cf.columnX);
    const w = CONFIG.stage.width - t.layout.margin - x; // the column's width
    push();
    noStroke();
    fill(c.text);
    setType('headline');
    textAlign(LEFT, BASELINE);
    text('MUGSHOT(3)', x, cf.titleBaseline);
    setType('numeral');
    text('NO. ' + nf(recipe.number || 0, 4), x, cf.numberBaseline);
    pop();
    EvidenceMarker(3, cf.marker.cx, cf.marker.cy);

    // Who gave what
    const rows = [['base face', recipe.base], ['eyes', recipe.eyes], ['nose', recipe.nose], ['ears', recipe.ears], ['lips', recipe.lips]];
    rows.forEach((row, i) => RecipeRow(row[0], row[1], x, cf.recipe.y + i * cf.recipe.step, w));

    // Status: AT LARGE
    push();
    noStroke();
    fill(c.text);
    setType('lead');
    textAlign(LEFT, BASELINE);
    text('Status:', x, cf.statusBaseline);
    pop();
    if (this.stamp) drawStamp(this.stamp);

    // The print status (nothing until printing starts)
    const state = this.printState();
    if (state !== 'waiting') PrintStatus(state, x, t.printStatus.y, ms, w);

    // GOODBYE: the officer peeks in, just before we go back to the start
    const g = cf.goodbye;
    const since = millis() - (this.leaveAt() - g.showMs); // ms since the goodbye started
    if (autoAdvance && since >= 0) {
      const s = constrain(since / g.slideMs, 0, 1);
      const offX = (1 - (1 - pow(1 - s, 3))) * g.slideFrom; // slides in from the right
      const line = CONFIG.police.lines.goodbye;
      const typed = floor(since / CONFIG.ui.timing.typewriterMs);
      PoliceOfficer(g.officerX + offX, g.officerFeetY, typed < line.length + 20, 'left', g.scale);
      if (s >= 1) SpeechBubble(line, typed, g.bubbleRight, g.bubbleY, 'side');
    }
  },

  keyPressed() {
    if (key === ' ') {
      // Skip the reveal: straight to the finished case file (the AT LARGE
      // stamp slams on, then it prints, still only once). Already there: back to the start.
      if (!collage || this.ms() >= this.times.stamp) {
        goTo('welcome');
      } else {
        stopDoodleAnimation();
        stopSfx('pencil', 0);
        this.enteredAt = millis() - this.times.stamp;
        // The cues we jumped over: done, silently (the stamp cue is next)
        for (const cue of this.cues) if (cue.at < this.times.stamp) cue.done = true;
      }
      return false;
    }
    if (key === 's' || key === 'S') {
      saveCollage(); // sketch.js: the composite as a PNG
    }
  },

  exit() {
    stopDoodleAnimation();
  },
};
