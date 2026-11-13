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
//   5. The case file PRINTS by itself, once per photo (print.js). The
//      console logs the time from the photo to the print.
//   THE PRINT WAIT (printing takes ~30 s; the browser can't know when the
//   printer is really done, so it's an ESTIMATE: CONFIG.print.printMs, or
//   print.previewMs when printing is off, CONFIG.print.auto = false):
//      0–2 s: the poster shrinks into the left third, the case file column
//      fades away, "PRINTING YOUR CASE FILE…" types in at the top, and a
//      doodle printer rises into the middle.
//      Then, for the rest of the time: the REAL printed page (a small copy)
//      slides up out of the printer, top first, so it works as a progress
//      bar; a doodle progress bar + "~XX s left" under it; the printer
//      shakes gently and the page jiggles like paper being fed.
//   DONE! (timing.printWait.doneMs, ~1.5 s): a stamp on the finished page, with a ding.
//   THE FINAL CASE FILE: back to the full case file, exactly as after the
//      reveal (the SAME drawLayout): the poster grows back from the left
//      (growMs), the column fades back in, AT LARGE slams again (a quieter
//      thud), and "Collect your case file →" points to the printer's side of
//      the booth (CONFIG.print.printerSide). It stays print.collectMs (15 s).
//   GOODBYE: the officer peeks in: "You're free to go… for now." -> welcome.
//   MUSIC (CONFIG.music): low (0.2) during the reveal, a swell to 0.9 at the
//   flash, 0.7 while printing, back up to 0.9 for the final case file.
//
// Like the evidence screen, the sound moments are a "cue sheet" (cues):
// written down when we arrive, played when their time comes. SPACE skips
// the cues it jumps over (no pile of sounds at once).
//
// Keys: SPACE = skip to the next part (reveal -> case file -> DONE! ->
//       final case file -> goodbye -> back to the start); it still prints,
//       once. S = save the composite as a PNG. Shift+P (any screen) = print
//       it again by hand.
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
    t.print = t.stamp + R.printDelayMs; // printing starts: the PRINT WAIT begins
    t.pageFrom = t.print + CONFIG.ui.timing.printWait.shrinkMs; // the page starts coming out
    t.printDone = t.print + (CONFIG.print.auto ? CONFIG.print.printMs : CONFIG.print.previewMs); // (estimated) done: DONE!
    const W = CONFIG.ui.timing.printWait;
    t.final = t.printDone + W.doneMs; // the full case file grows back...
    t.restamp = t.final + W.growMs; // ...and AT LARGE slams on again
    t.goodbye = t.final + CONFIG.print.collectMs; // after collectMs: the goodbye officer
    this.times = t;
    this.pieces = features.map((feature, i) => ({ feature: feature, at: t.drops + i * R.dropGapMs }));

    this.cues = [{ at: t.line, what: 'line' }, { at: t.drops, what: 'lineEnd' }];
    this.pieces.forEach((p, i) => {
      this.cues.push({ at: p.at, what: 'drop', i: i });
      this.cues.push({ at: p.at + R.dropMs, what: 'land', i: i });
    });
    this.cues.push({ at: t.flash, what: 'flash' }, { at: t.stamp, what: 'stamp' }, { at: t.print, what: 'print' });
    this.cues.push({ at: t.printDone, what: 'done' }, { at: t.final, what: 'final' }, { at: t.restamp, what: 'restamp' });
    this.cues.sort((a, b) => a.at - b.at);
  },

  // When we go back to the start: after the final case file has stayed
  // collectMs (people are collecting their print) and the goodbye has
  // played; never sooner than casefileMs
  leaveAt() {
    const g = CONFIG.ui.tokens.casefile.goodbye;
    return this.enteredAt + max(CONFIG.ui.timing.casefileMs, this.times.goodbye + g.showMs);
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
    if (cue.what === 'line' && late < R.lineMs) { // (already over: nothing to draw or hear)
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
      setMusicLevel(CONFIG.music.casefile.flash, CONFIG.music.casefile.swellMs); // the music swells (music.js)
    } else if (cue.what === 'stamp') {
      const at = this.stampPosition();
      this.stamp = makeStamp('AT LARGE', { x: at.x, y: at.y, size: 'M', color: CONFIG.ui.colors.sirenRed });
      showStamp(this.stamp);
      playSfx('stamp');
    } else if (cue.what === 'done') {
      // DONE!: a stamp on the page (now fully out of the printer), with a ding
      const pw = CONFIG.ui.tokens.printWait;
      const pageH = this.pageImg ? (pw.page.w * this.pageImg.height) / this.pageImg.width : 0;
      this.doneStamp = makeStamp('DONE!', { x: pw.printer.cx, y: pw.printer.slotY - pageH / 2, size: 'L', color: CONFIG.ui.colors.sirenRed });
      showStamp(this.doneStamp);
      playSfx('ding');
      playSfx('stamp');
    } else if (cue.what === 'final') {
      // Back to the full case file: the music swells again, and the AT
      // LARGE stamp waits (hidden) until the poster has grown back
      setMusicLevel(CONFIG.music.casefile.final, CONFIG.music.casefile.swellMs);
      if (this.stamp) this.stamp.shownAt = -1;
    } else if (cue.what === 'restamp') {
      if (this.stamp) showStamp(this.stamp);
      playSfx('stamp', { volume: CONFIG.sound.restampVolume }); // quieter than the first time
    } else if (cue.what === 'print') {
      setMusicLevel(CONFIG.music.casefile.printing, CONFIG.music.casefile.printingFadeMs); // and settles while it prints
      // A small copy of the printed page, for the page coming out of the
      // doodle printer (made whether printing is on or off)
      if (!this.pageImg) this.pageImg = makePrintImage(collage.parts, recipe.number, CONFIG.ui.tokens.printWait.page.dpi);
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

  draw() {
    // No photo yet this round: the placeholder
    if (!collage) {
      drawScreenPlaceholder(this);
      return;
    }
    const ms = this.ms();
    if (ms < this.times.layout) this.drawReveal(ms);
    else if (ms < this.times.print) this.drawLayout(ms, 0);
    else if (ms < this.times.final) this.drawPrintWait(ms);
    else this.drawFinal(ms);
    this.drawGoodbye();

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
  // away: 0 = all there, 1 = shrunk away (the print wait's first 2 s):
  // the poster moves + shrinks into the left third, the column fades out.
  drawLayout(ms, away) {
    const t = CONFIG.ui.tokens;
    const cf = t.casefile;
    const c = CONFIG.ui.colors;
    const pw = t.printWait.poster;

    // LEFT: the poster with the finished composite
    push();
    translate(lerp(cf.poster.cx, pw.cx, away), lerp(cf.poster.cy, pw.cy, away));
    scale(lerp(1, pw.scale, away));
    CaseFilePoster(collage, 0, 0, cf.poster.angle);
    pop();
    if (away >= 1) return; // the column has gone

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

    // Fading away: a see-through black layer over the column
    if (away > 0) {
      push();
      noStroke();
      fill(0, 255 * away);
      rect(x - t.space.l, t.topBar.height, CONFIG.stage.width - x + t.space.l, CONFIG.stage.height - t.topBar.height);
      pop();
    }
  },

  // ---- THE PRINT WAIT: the printer, the page coming out, the progress ----
  drawPrintWait(ms) {
    const t = CONFIG.ui.tokens;
    const pw = t.printWait;
    const c = CONFIG.ui.colors;
    const T = this.times;
    const since = ms - T.print; // ms since printing started

    // 0–2 s: the case file shrinks away to the left (fast, then slower)
    const s = constrain(since / CONFIG.ui.timing.printWait.shrinkMs, 0, 1);
    const ease = 1 - pow(1 - s, 3);
    this.drawLayout(ms, ease);

    // "PRINTING YOUR CASE FILE…", typed in at the top
    push();
    noStroke();
    fill(c.text);
    setType('title');
    textAlign(CENTER, BASELINE);
    text('PRINTING YOUR CASE FILE…'.substring(0, max(0, floor(since / CONFIG.ui.timing.typewriterMs))), CONFIG.stage.width / 2, pw.titleBaseline);
    pop();

    // How far the printing is: 0 -> 1 (the page comes out after the first 2 s)
    const k = constrain((ms - T.pageFrom) / (T.printDone - T.pageFrom), 0, 1);
    const printing = k > 0 && k < 1;
    const secs = since / 1000;

    // The printer rises into the middle during the first 2 s
    const rise = (1 - ease) * (CONFIG.stage.height - pw.printer.slotY);
    const slotY = pw.printer.slotY + rise;
    const shake = printing ? pw.shake.px * sin(secs * pw.shake.hz * TWO_PI) : 0;
    const jiggle = printing ? pw.feed.px * sin(secs * pw.feed.hz * TWO_PI) : 0;

    // The printer, with the page coming out of it (in front of its paper
    // tray, behind its black body, which hides the part still inside)
    DoodlePrinter(pw.printer.cx, slotY, shake, () => {
      if (this.pageImg) EmergingPage(this.pageImg, pw.printer.cx, slotY, pw.page.w, k, jiggle);
    });

    // The progress bar and the time left (once the printer is in place)
    if (s >= 1) {
      PrintProgress(pw.printer.cx, pw.progress.y, k);
      const left = ceil((T.printDone - ms) / 1000);
      push();
      noStroke();
      fill(c.muted);
      setType('label');
      textAlign(CENTER, BASELINE);
      text(left > 0 ? '~' + left + ' s left' : 'done', pw.printer.cx, pw.leftBaseline);
      pop();
    }

    // DONE!: the stamp on the finished page, on top of everything
    if (this.doneStamp && ms >= T.printDone) drawStamp(this.doneStamp);
  },

  // ---- THE FINAL CASE FILE (after printing): the SAME layout as after the
  // reveal (drawLayout), growing back from the left, + "Collect your case file" ----
  drawFinal(ms) {
    const t = CONFIG.ui.tokens;
    const k = constrain((ms - this.times.final) / CONFIG.ui.timing.printWait.growMs, 0, 1);
    this.drawLayout(ms, pow(1 - k, 3)); // away: 1 -> 0, fast, then slowing down (ease-out)
    if (k < 1) return;
    // "Collect your case file / from the printer" + a big doodle arrow
    // towards the real printer's side of the booth (CONFIG.print.printerSide)
    const col = t.casefile.collect;
    const toLeft = CONFIG.print.printerSide === 'left';
    const lines = ['Collect your case file', 'from the printer'];
    push();
    noStroke();
    fill(CONFIG.ui.colors.text);
    setType(col.text);
    // Printer on the right: from the column's left edge. On the left:
    // right-aligned to the margin, so the arrow (before the text) stays clear of the poster.
    const edge = toLeft ? CONFIG.stage.width - t.layout.margin : gridX(t.casefile.columnX);
    textAlign(toLeft ? RIGHT : LEFT, BASELINE);
    lines.forEach((line, i) => text(line, edge, col.baselines[i]));
    const lastW = textWidth(lines[1]);
    const capH = drawingContext.measureText('H').actualBoundingBoxAscent;
    pop();
    // The arrow's tail sits next to the end of "from the printer", pointing outwards
    const A = t.arrow;
    const since = ms - (this.times.final + CONFIG.ui.timing.printWait.growMs); // ms since it appeared
    const tailX = toLeft ? edge - lastW - col.arrowGap : edge + lastW + col.arrowGap;
    DoodleArrow(tailX, col.baselines[1] - capH / 2, toLeft ? 'left' : 'right', {
      progress: since / A.drawMs, // draws on once...
      nudge: since > A.drawMs ? arrowNudge(since - A.drawMs) : 0, // ...then nudges towards the printer
    });
  },

  // ---- GOODBYE: the officer peeks in, just before we go back to the start ----
  drawGoodbye() {
    const g = CONFIG.ui.tokens.casefile.goodbye;
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
      // SPACE skips to the next part:
      //   the reveal       -> the finished case file (AT LARGE slams on)
      //   printing         -> DONE! (it still prints, once)
      //   DONE!            -> the final case file
      //   final case file  -> the goodbye;  the goodbye -> back to the start
      const ms = this.ms();
      const T = this.times;
      const jumpTo = (at) => (this.enteredAt = millis() - at); // the screen's clock now says 'at'
      if (!collage) {
        goTo('welcome');
      } else if (ms < T.stamp) {
        stopDoodleAnimation();
        stopSfx('pencil', 0);
        setMusicLevel(CONFIG.music.casefile.flash, CONFIG.music.casefile.swellMs); // the swell we skipped to
        jumpTo(T.stamp);
        // The cues we jumped over: done, silently (the stamp cue is next)
        for (const cue of this.cues) if (cue.at < T.stamp) cue.done = true;
      } else if (ms < T.printDone) {
        jumpTo(T.printDone); // (the 'print' cue still runs: it prints, once)
      } else if (ms < T.final) {
        jumpTo(T.final);
      } else if (ms < T.goodbye) {
        jumpTo(T.goodbye);
      } else {
        goTo('welcome');
      }
      return false;
    }
    if (key === 's' || key === 'S') {
      saveCollage(); // sketch.js: the composite as a PNG
    }
  },

  exit() {
    stopDoodleAnimation();
    if (this.pageImg) this.pageImg.remove(); // the small page copy
    this.pageImg = null;
  },
};
