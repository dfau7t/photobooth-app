// =============================================================
// screens/evidence.js — screen 04: forensic analysis (~15 s).
//
// In the story: the forensic lab works out who gave which feature.
// A grid: one ROW per feature (eyes, nose, ears, lips), one COLUMN per
// suspect (01, 02, 03). Each cell shows that suspect's feature, cut from
// the mugshot photo. The recipe (made when the photo was taken) already
// decided who gives what: this screen only REVEALS it, slowly.
//
// What happens, in order (every time is in CONFIG.ui.timing.evidence):
//   PHASE 0  collecting evidence: "ANALYZING EVIDENCE…_" types, the grid
//            draws on cell by cell, the photos fade in PIXELATED.
//   PHASE 1  one row at a time (eyes -> nose -> ears -> lips):
//            - SPOTLIGHT: that row is bright, the others dim.
//            - the highlight jumps between the 3 cells, fast, then slower...
//            - sometimes a NEAR-MISS (see below).
//            - LOCK: the match sharpens, MATCH slams on, the screen shakes;
//              the other two fade and get "CLEARED".
//            Each lock holds a little longer and shakes a little harder.
//   PHASE 2  base face: the SUSPECT 01/02/03 headers spin the same way,
//            lock on one, BASE stamp, "BASE FACE: SUSPECT 0X" types in.
//   PHASE 3  all rows bright again, the white line joins the matches,
//            "EVIDENCE COMPLETE." -> 05 forgery.
//
// THE NEAR-MISS
// A normal spin slows down and stops ON the match. A near-miss slows down
// and stops one cell TOO EARLY: it hesitates there (hesitateMs, the sound
// goes quiet)... then nudges one more step onto the real match and locks.
// Which rows get one is "random", but from the round's seed (the recipe),
// so the same photo always plays the same way. The last row always has one.
//
// THE CUE SHEET AND THE AUDIO CLOCK
// When we arrive, we write down every sound moment of the screen in a
// list, the "cue sheet": "at 1500 ms: start spinning row 0", "at 3000 ms:
// lock row 0", ... Every frame, update() plays the cues whose time has
// come. The screen's clock is the SOUND ENGINE's clock (audioClockMs, in
// sound.js), not millis(), so pictures and sounds can't drift apart.
// The sounds are SEGMENTS of evidence_beeps_success.mp3
// (CONFIG.sound.evidenceSegments): segment A loops while something spins
// (a little faster and higher on every row), D at each lock, E at the end.
//
// Without a photo (opening this screen directly): if the camera sees
// faces, it takes a quick TEST photo (just for this screen); otherwise
// the cells show "?". A made-up recipe is used, so everything still plays.
// Keys: SPACE = skip to the end (the finished grid), SPACE again = move on.
// Testing: ?screen=evidence&t=9000 freezes the screen at 9 s.
//
// (enter / update / draw / exit: see screens/welcome.js)
// =============================================================

const evidenceScreen = {
  number: '04',
  name: 'evidence',

  frozenAt: parseInt(new URLSearchParams(window.location.search).get('t')), // ?t=9000 (NaN = not frozen)
  useAudioClock: false, // true = the screen's clock is the sound engine's
  startedAt: 0, // the clock's time when we arrived
  photo: null, // { img, faces, test }: the mugshot photo (or a test photo)
  picks: null, // the recipe: who gives which feature (+ base)
  cells: [], // cells[row][person] = { sharp, blocks: [pixelated copies] }, or null ("?")
  spins: [], // the 4 rows + the base face: when each starts, locks and ends
  cues: [], // the cue sheet: [{ at, what, i, done }]
  stamps: [], // one MATCH stamp per row, then the BASE stamp
  loop: null, // the spin sound that's playing (segment A, looped)
  lastCol: -1, // the last highlighted cell (for the ticks without the sound file)
  total: 0, // the whole screen, in ms

  // ---------- the clock ----------

  // The screen's own clock, in ms: the sound engine's when sound is on
  // (if sound is blocked, that clock stands still, so: millis())
  clockNow() {
    return this.useAudioClock ? audioClockMs() : millis();
  },

  // ms since we arrived (or the frozen moment, when testing with ?t=)
  sceneMs() {
    return isNaN(this.frozenAt) ? this.clockNow() - this.startedAt : this.frozenAt;
  },

  // ---------- arriving: the photo, the plan, the cue sheet ----------

  enter() {
    this.useAudioClock = audioClockMs() !== null;
    this.startedAt = this.clockNow();
    // The recipe of this round, or a made-up one when there's no photo yet
    this.picks = recipe || makeRecipe(7); // (the same made-up recipe every time: seed 7)
    this.photo = snap ? { img: snap, faces: frozenFaces, test: false } : null;
    this.cutCells();
    this.makePlan();
    this.loop = null;
    this.lastCol = -1;
    if (!this.photo) console.log('Evidence: no mugshot photo yet (opened directly). Cells show "?" until the camera sees a face (then a test photo is used).');
  },

  // No mugshot yet: the camera's faces are tracked on this screen, so we
  // can take a test photo (see update)
  get usesFaces() {
    return !snap;
  },

  // Cut every cell's photo (sharp + pixelated copies) from this.photo
  cutCells() {
    const e = CONFIG.ui.tokens.evidence;
    this.freeCells();
    this.cells = e.rows.map((feature) => [0, 1, 2].map((p) => this.cutCell(feature, p)));
  },

  // Person p's feature from the photo, sized to fit a cell, plus its
  // pixelated copies (biggest blocks first). null = no photo ("?").
  cutCell(feature, p) {
    if (!this.photo || !this.photo.faces[p]) return null;
    const g = CONFIG.ui.tokens.gridCell;
    const e = CONFIG.ui.tokens.evidence;
    const part = featureParts(this.photo.faces[p], feature)[0]; // ears: the first ear
    if (!part) return null;
    const zoom = min((g.w - 2 * e.cellPad) / part.w, (g.h - 2 * e.cellPad) / part.h);
    const sharp = cutPhoto(this.photo.img, part, zoom); // pieces.js
    return { sharp: sharp, blocks: e.pixelBlocks.map((b) => pixelate(sharp, b)) };
  },

  freeCells() {
    for (const row of this.cells) {
      for (const cell of row) {
        if (!cell) continue;
        cell.sharp.remove();
        cell.blocks.forEach((b) => b.remove());
      }
    }
    this.cells = [];
  },

  // A number 0–1 that's always the same for the same seed and n
  // (so the near-misses are "random", but the same for the same round)
  seeded(n) {
    const x = Math.sin((this.picks.seed || 1) * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  },

  // Work out WHEN everything happens, and write the cue sheet
  makePlan() {
    const T = CONFIG.ui.timing.evidence;
    const e = CONFIG.ui.tokens.evidence;
    const n = e.rows.length;

    // The 4 rows, one after the other, then the base face (spin number 4)
    this.spins = [];
    let at = T.collectMs;
    for (let r = 0; r < n; r++) {
      this.spins.push({
        start: at,
        lockAt: at + T.rowMs[r] - T.lockHoldMs[r],
        end: at + T.rowMs[r],
        steps: T.spinSteps[r],
        target: this.picks[e.rows[r]],
        nearMiss: r === n - 1 || this.seeded(r) < T.nearMissChance, // the last row always
      });
      at += T.rowMs[r];
    }
    this.spins.push({
      start: at,
      lockAt: at + T.baseSpinMs,
      end: at + T.baseMs,
      steps: T.baseSteps,
      target: this.picks.base,
      nearMiss: this.seeded(n) < T.nearMissChance,
    });
    this.completeAt = at + T.baseMs;
    this.total = this.completeAt + T.completeMs;

    // The stamps: MATCH in each row's matched cell, BASE on the column header
    const g = CONFIG.ui.tokens.gridCell;
    this.stamps = e.rows.map((feature, r) => {
      const cell = this.cellBox(r, this.picks[feature]);
      return makeStamp('MATCH', { x: cell.x + g.w - e.stampInset.x, y: cell.y + g.h - e.stampInset.y, size: 'S', color: CONFIG.colors.people[this.picks[feature]] });
    });
    const header = this.headerPoint(this.picks.base);
    this.stamps.push(makeStamp('BASE', { x: header.x, y: header.y + e.headerStampY, size: 'S', color: CONFIG.colors.people[this.picks.base] }));

    // The cue sheet: every sound moment, in time order
    this.cues = [];
    this.spins.forEach((s, i) => {
      this.cues.push({ at: s.start, what: 'spin', i: i });
      if (s.nearMiss) {
        const stopAt = this.easeEnd(s);
        this.cues.push({ at: stopAt, what: 'hesitate', i: i });
        this.cues.push({ at: stopAt + T.hesitateMs, what: 'nudge', i: i });
      }
      this.cues.push({ at: s.lockAt, what: 'lock', i: i });
    });
    this.cues.push({ at: this.completeAt, what: 'complete' });
    this.cues.sort((a, b) => a.at - b.at);
  },

  // When a spin's slowing-down part ends: at the lock, or (near-miss)
  // earlier, leaving time to hesitate and nudge
  easeEnd(s) {
    const T = CONFIG.ui.timing.evidence;
    return s.nearMiss ? s.lockAt - T.nudgeMs - T.hesitateMs : s.lockAt;
  },

  // Spin s at time ms: { col: the highlighted suspect (-1 = none), status }
  // status: 'waiting', 'spinning', 'hesitating' (near-miss) or 'locked'.
  // Like slot.js: count the jumps BACKWARDS from where it must stop, so
  // the last jump lands exactly there.
  spinState(s, ms) {
    const T = CONFIG.ui.timing.evidence;
    if (ms < s.start) return { col: -1, status: 'waiting' };
    if (ms >= s.lockAt) return { col: s.target, status: 'locked' };
    const stopAt = this.easeEnd(s);
    // Near-miss: it stops one cell BEFORE the match (the cell that comes
    // just before it in the jumping order)...
    const stopOn = s.nearMiss ? (s.target + 2) % 3 : s.target;
    if (ms >= stopAt + T.hesitateMs) return { col: s.target, status: 'spinning' }; // ...then nudges on
    if (ms >= stopAt) return { col: stopOn, status: 'hesitating' }; // ...hesitates there...
    const k = (ms - s.start) / (stopAt - s.start); // 0 -> 1
    const progress = 1 - pow(1 - k, T.easePower); // fast, then slower and slower
    const jumped = floor(progress * s.steps);
    return { col: (stopOn - s.steps + jumped + 3 * s.steps) % 3, status: 'spinning' };
  },

  // ---------- every frame: test photo, cues, moving on ----------

  update() {
    const ms = this.sceneMs();
    const frozen = !isNaN(this.frozenAt);

    // No mugshot: as soon as the camera sees faces, take a test photo
    if (!this.photo && cameraReady && liveFaces.length > 0) {
      const faces = [0, 1, 2].map((i) => liveFaces[i % liveFaces.length]); // fewer than 3: copies
      this.photo = { img: video.get(), faces: copyFaces(faces), test: true };
      this.cutCells();
      console.log('Evidence: using a test photo from the camera (' + liveFaces.length + ' face(s))');
    }

    // Play the cues whose time has come. A cue that's long past (after
    // SPACE, or frozen with ?t=) still happens, but SILENTLY: no pile of
    // sounds at once.
    for (const cue of this.cues) {
      if (cue.done || ms < cue.at) continue;
      cue.done = true;
      this.playCue(cue, !frozen && ms - cue.at < 250);
    }

    // No evidence sound file: a tick on every jump of the highlight instead
    if (!frozen && !sfxHasFile('evidence')) {
      const active = this.spins.find((s) => ms >= s.start && ms < s.lockAt);
      const col = active ? this.spinState(active, ms).col : -1;
      if (col >= 0 && col !== this.lastCol) playSfx('tick');
      this.lastCol = col;
    }

    if (frozen) return; // frozen for testing: don't move on
    if (ms >= this.total) goTo(this.returnTo || 'forgery'); // (the sound test comes back to itself)
  },

  // One cue from the cue sheet. sound = false: only the picture changes.
  playCue(cue, sound) {
    const seg = CONFIG.sound.evidenceSegments;
    if (cue.what === 'spin' || cue.what === 'nudge') {
      // Segment A, looped; a little faster (and higher) row by row
      this.stopLoop();
      const rate = lerp(seg.rateFrom, seg.rateTo, min(cue.i, 3) / 3);
      if (sound) this.loop = playSfx('evidence', { start: seg.spin.start, end: seg.spin.end, loop: true, rate: rate, segment: 'spin' });
    } else if (cue.what === 'hesitate') {
      this.stopLoop(); // near-miss: a short silence
    } else if (cue.what === 'lock') {
      this.stopLoop();
      showStamp(this.stamps[cue.i]); // MATCH (or BASE)
      if (sound) {
        playSfx('evidence', { start: seg.lock.start, end: seg.lock.end, volume: seg.lockVolumes[cue.i], segment: 'lock' });
        playSfx('stamp');
      }
    } else if (cue.what === 'complete') {
      if (sound) playSfx('evidence', { start: seg.final.start, end: seg.final.end, segment: 'final' });
    }
  },

  stopLoop() {
    if (this.loop && !this.loop.stopped) stopPlay(this.loop, 40); // sound.js
    this.loop = null;
  },

  // ---------- drawing ----------

  // The top-left corner of cell (row r, person p) on the stage
  cellBox(r, p) {
    const e = CONFIG.ui.tokens.evidence;
    const g = CONFIG.ui.tokens.gridCell;
    return { x: e.grid.x + p * (g.w + g.gap), y: e.grid.y + r * (g.h + g.gap) };
  },

  // The middle of column p's header ("SUSPECT 0X"), above the grid
  headerPoint(p) {
    const t = CONFIG.ui.tokens;
    return { x: this.cellBox(0, p).x + t.gridCell.w / 2, y: t.evidence.grid.y - t.space.l - t.type.label.size / 3 };
  },

  // How bright row r is (spotlightDim – 1): bright in phase 0, only the
  // row being analysed in phase 1, all dim in phase 2, all bright in phase 3.
  // Changes fade over spotlightFadeMs.
  rowBrightness(r, ms) {
    const T = CONFIG.ui.timing.evidence;
    const dim = CONFIG.ui.tokens.evidence.spotlightDim;
    const fade = T.spotlightFadeMs;
    const s = this.spins[r];
    const outside = max(s.start - ms, ms - s.end, 0); // ms outside this row's turn
    let k = 1 - outside / fade; // 1 during its turn, fading out around it
    k = max(k, 1 - (ms - T.collectMs) / fade); // phase 0: all bright
    k = max(k, (ms - this.completeAt) / fade); // phase 3: all bright again
    return lerp(dim, 1, constrain(k, 0, 1));
  },

  // Type 'words' letter by letter from 'fromMs'
  typed(words, fromMs, ms) {
    return words.substring(0, max(0, floor((ms - fromMs) / CONFIG.ui.timing.typewriterMs)));
  },

  draw() {
    const t = CONFIG.ui.tokens;
    const e = t.evidence;
    const T = CONFIG.ui.timing.evidence;
    const c = CONFIG.ui.colors;
    const ms = this.sceneMs();
    const n = e.rows.length;
    const base = this.spins[n];

    // ---- The lock shake: each row's lock shakes a little harder ----
    let shake = 0;
    for (let r = 0; r < n; r++) {
      const since = ms - this.spins[r].lockAt;
      if (since >= 0 && since < T.shakeMs) {
        const k = since / T.shakeMs;
        shake = e.lockShake[r] * (1 - k) * sin(k * PI * 6);
      }
    }
    push();
    translate(shake, 0);

    // ---- The title, typed, with a blinking cursor ----
    push();
    noStroke();
    fill(c.text);
    setType('hero');
    textAlign(LEFT, BASELINE);
    const line1 = this.typed('ANALYZING', 0, ms);
    const line2 = this.typed('EVIDENCE…', 'ANALYZING'.length * CONFIG.ui.timing.typewriterMs, ms);
    text(line1, t.layout.margin, e.titleBaselines[0]);
    text(line2, t.layout.margin, e.titleBaselines[1]);
    if (line2.length > 0 && floor(ms / t.timing.cursorBlinkMs) % 2 === 0) text('_', t.layout.margin + textWidth(line2) + t.space.s, e.titleBaselines[1]);
    pop();

    // ---- The caption under the title: what the lab is doing right now ----
    let caption = '';
    let captionFrom = 0;
    const row = this.spins.findIndex((s, i) => i < n && ms >= s.start && ms < s.end);
    if (row >= 0) {
      caption = 'COMPARING ' + e.rows[row].toUpperCase() + '…';
      captionFrom = this.spins[row].start;
    } else if (ms >= this.completeAt) {
      caption = 'EVIDENCE COMPLETE.';
      captionFrom = this.completeAt;
    } else if (ms >= base.start) {
      caption = 'IDENTIFYING BASE FACE…';
      captionFrom = base.start;
    }
    push();
    noStroke();
    setType('lead');
    textAlign(LEFT, BASELINE);
    fill(c.text);
    text(this.typed(caption, captionFrom, ms), t.layout.margin, e.captionBaseline);
    // Phase 2: once the base face has locked, its name types in, in that suspect's colour
    if (ms >= base.lockAt) {
      fill(CONFIG.colors.people[this.picks.base]);
      text(this.typed('BASE FACE: SUSPECT ' + nf(this.picks.base + 1, 2), base.lockAt, ms), t.layout.margin, e.baseBaseline);
    }
    pop();

    // ---- The column headers (they spin in phase 2) ----
    const baseState = this.spinState(base, ms);
    push();
    noStroke();
    setType('label');
    for (let p = 0; p < 3; p++) {
      // Before phase 2: every header in its colour. From phase 2: only the highlighted one.
      const lit = baseState.status === 'waiting' || baseState.col === p;
      fill(lit ? CONFIG.colors.people[p] : c.muted);
      const h = this.headerPoint(p);
      textCentered('SUSPECT ' + nf(p + 1, 2), h.x, h.y);
    }
    pop();

    // ---- The rows: labels, cells, stamps; then dimmed if not in the spotlight ----
    for (let r = 0; r < n; r++) {
      const state = this.spinState(this.spins[r], ms);
      const box = this.cellBox(r, 0);
      push();
      noStroke();
      fill(c.muted);
      setType('label');
      textAlign(RIGHT, CENTER);
      text(e.rows[r].toUpperCase(), e.grid.x - t.space.l, box.y + t.gridCell.h / 2);
      pop();
      for (let p = 0; p < 3; p++) this.drawCell(r, p, state, ms);
      drawStamp(this.stamps[r]);
      // The spotlight: a see-through black layer over the dim rows
      const dark = 1 - this.rowBrightness(r, ms);
      if (dark > 0) {
        push();
        noStroke();
        fill(0, 255 * dark);
        rect(e.grid.x - e.spotlightLeft, box.y - t.gridCell.gap / 2, e.spotlightLeft + 3 * (t.gridCell.w + t.gridCell.gap), t.gridCell.h + t.gridCell.gap);
        pop();
      }
    }
    drawStamp(this.stamps[n]); // BASE, on the header

    // ---- Phase 3: the line joining the matches ----
    const k = constrain((ms - this.completeAt) / T.lineMs, 0, 1);
    if (k > 0) {
      const points = e.rows.map((feature, r) => {
        const box = this.cellBox(r, this.picks[feature]);
        return { x: box.x + t.gridCell.w / 2, y: box.y + t.gridCell.h / 2 };
      });
      drawShape(lineShape('evidence-line', points, { stroke: 'emphasis', wobble: 'ui' }), 0, 0, c.chalk, { progress: k });
    }
    pop(); // the shake
  },

  // One cell (row r, person p). state = the row's spinState.
  drawCell(r, p, state, ms) {
    const t = CONFIG.ui.tokens;
    const e = t.evidence;
    const T = CONFIG.ui.timing.evidence;
    const g = t.gridCell;
    const box = this.cellBox(r, p);
    const cell = this.cells[r] ? this.cells[r][p] : null;
    const colour = CONFIG.colors.people[p];

    // Phase 0: the frame draws on, then the photo fades in (cell by cell)
    const drawFrom = (r * 3 + p) * T.cellGapMs;
    const progress = constrain((ms - drawFrom) / T.cellDrawMs, 0, 1);
    const appear = constrain((ms - drawFrom - T.cellDrawMs / 2) / T.cropFadeMs, 0, 1);

    // How this cell looks now
    const locked = state.status === 'locked';
    const sinceLock = ms - this.spins[r].lockAt;
    let look = 'idle';
    let photoAlpha = e.idle;
    if (state.col === p) {
      look = locked ? 'locked' : 'active';
      photoAlpha = 1;
    } else if (locked) {
      // Not the match: fades out to 'cleared'
      look = 'cleared';
      photoAlpha = lerp(e.idle, e.cleared, constrain(sinceLock / T.clearFadeMs, 0, 1));
    }

    // Which picture: pixelated (biggest blocks) until it's the match,
    // then sharper and sharper over sharpenMs
    push();
    if (cell) {
      let img = cell.blocks[0];
      if (look === 'locked') {
        const steps = cell.blocks.concat([cell.sharp]);
        img = steps[min(steps.length - 1, floor((sinceLock / T.sharpenMs) * steps.length))];
      }
      tint(255, 255 * photoAlpha * appear);
      imageMode(CENTER);
      image(img, box.x + g.w / 2, box.y + g.h / 2);
    } else {
      // No photo: a question mark
      noStroke();
      fill(look === 'idle' || look === 'cleared' ? CONFIG.ui.colors.muted : CONFIG.ui.colors.text);
      setType('title');
      textCentered('?', box.x + g.w / 2, box.y + g.h / 2);
    }
    pop();
    GridCell(box.x, box.y, look, colour, { progress: progress });

    // "CLEARED" on the two that didn't match
    if (look === 'cleared') {
      push();
      noStroke();
      fill(CONFIG.ui.colors.muted);
      setType('label');
      const a = constrain(sinceLock / T.clearFadeMs, 0, 1);
      drawingContext.globalAlpha = a;
      textCentered('CLEARED', box.x + g.w / 2, box.y + g.h / 2);
      pop();
    }
  },

  keyPressed() {
    if (key === ' ') {
      // SPACE: jump to the end (everything locked, the line drawn).
      // Already there: move on.
      const end = this.completeAt + CONFIG.ui.timing.evidence.lineMs;
      if (this.sceneMs() >= end) goTo(this.returnTo || 'forgery');
      else this.startedAt = this.clockNow() - end;
      return false;
    }
  },

  exit() {
    this.stopLoop();
    this.returnTo = null;
    this.freeCells(); // free the cut photos
  },
};
