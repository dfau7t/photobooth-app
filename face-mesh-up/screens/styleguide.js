// =============================================================
// screens/styleguide.js — the STYLE GUIDE (key G, or ?screen=styleguide).
//
// Every token and every component on one page, so you can check at a
// glance that the graphic system is consistent. D adds the red debug
// reference shapes. Not part of the story.
//
// Page 1 (G): top half the TOKENS (colours, spacing, type, strokes,
//             wobble), bottom half the basic COMPONENTS in all their states.
// Page 2 (G again): the SCREEN COMPONENTS (posters, floor marks, badge,
//             torn band, chalk figures). One page wasn't big enough.
// Page 3 (G again): the HANDS UP components (slam word, officer, speech
//             bubble, status labels, small posters with a stamp).
// Page 4 (G again): the MUGSHOT components (camera view, height chart,
//             placards, countdown).
// Page 5 (G again): the ARRIVAL components (police car, siren glow,
//             ground line, the officer facing right, bubble with left tail).
// Page 6 (G again): scene 02b, HANDS UP LIVE, without a camera: hand
//             markers (outline / filled), status pills, stamps in the
//             person colours, the small officer with a side-tail bubble.
// Page 7 (G again): the FORGERY bandits: each bandit (rows) in each pose
//             (columns), plus the pencil and the scissors.
// Page 10 (G again): the SOUND TEST: a button for every sound (file or
//             synth), the master volume, mute, and "play evidence with cues".
// Page 9 (G again): the CASE FILE screen components: the torn WANTED
//             poster (blank), evidence marker, recipe rows, AT LARGE stamp.
// Page 8 (G again): the CASE FILE print: the print status in its three states,
//             and a preview of the printed Letter page (O = the reference
//             layout on top at 50%, to check the alignment).
// Positions here come from the 12-column grid (gridX) and the 8 px
// baseline, so this page also shows the layout rules.
// =============================================================

const styleguideScreen = {
  number: '--',
  name: 'styleguide',
  page: 0, // 0 = page 1 … 9 = page 10 (G goes to the next)
  showReference: new URLSearchParams(window.location.search).get('overlay') === '1', // page 8: O toggles
  reference: null, // the reference print layout (loaded when first shown)
  stamps: [],

  enter() {
    this.enteredAt = millis();
    // ?page=2 in the address opens page 2 directly
    const p = int(new URLSearchParams(window.location.search).get('page'));
    if (p >= 1 && p <= STYLEGUIDE_PAGES) this.page = p - 1;
    // Page 3: one SURRENDERED stamp, on the third small poster
    const h = CONFIG.ui.tokens.handsup;
    this.page3Stamp = makeStamp('SURRENDERED', { x: h.posterX[2], y: h.posterY, size: 'M', color: CONFIG.ui.colors.ink });
    showStamp(this.page3Stamp);
    // Page 6: person 03's stamp (2/2 = surrendered), in their colour
    this.page6Stamp = makeStamp('SURRENDERED', { size: 'M', color: CONFIG.colors.people[2] });
    showStamp(this.page6Stamp);
    // Stamps slam on once when you open the page
    this.stamps = [
      makeStamp('SURRENDERED', { x: 1360, y: 696, size: 'M' }),
      makeStamp('MATCH', { x: 1184, y: 888, size: 'S', color: CONFIG.colors.people[1] }),
      makeStamp('AT LARGE', { x: 1408, y: 888, size: 'L', color: CONFIG.ui.colors.paper }),
    ];
    for (const s of this.stamps) showStamp(s);
  },

  update() {},

  draw() {
    if (this.page === 0) this.drawTokensPage();
    else if (this.page === 1) this.drawScreenComponentsPage();
    else if (this.page === 2) this.drawHandsUpPage();
    else if (this.page === 3) this.drawMugshotPage();
    else if (this.page === 4) this.drawArrivalPage();
    else if (this.page === 5) this.drawHandsUpLivePage();
    else if (this.page === 6) this.drawForgeryPage();
    else if (this.page === 7) this.drawCaseFilePage();
    else if (this.page === 8) this.drawCaseFileScreenPage();
    else this.drawSoundTestPage();
  },

  // ---------- page 1: tokens + basic components ----------
  drawTokensPage() {
    const c = CONFIG.ui.colors;
    const t = CONFIG.ui.tokens;

    // ================= TOKENS =================

    // ---- Colours (columns 1–4) ----
    sectionTitle('COLOURS', gridX(0), 144);
    const swatches = [
      ['stage', c.stage], ['panel', c.panel], ['dotFill', c.dotFill], ['muted', c.muted], ['text', c.text],
      ['chalk', c.chalk], ['paper', c.paper], ['ink', c.ink], ['sirenRed', c.sirenRed], ['sirenBlue', c.sirenBlue],
      ['person01', CONFIG.colors.people[0]], ['person02', CONFIG.colors.people[1]], ['person03', CONFIG.colors.people[2]],
    ];
    swatches.forEach(function (sw, i) {
      const x = gridX(0) + (i % 5) * 112;
      const y = 168 + floor(i / 5) * 88;
      stroke(c.panel); // so the black swatch is visible on the black page
      strokeWeight(1);
      fill(sw[1]);
      rect(x, y, 48, 48);
      caption(sw[0], x, y + 64, c.text);
      caption(sw[1].toUpperCase(), x, y + 80, c.muted);
    });

    // ---- Spacing (columns 1–4, below) ----
    sectionTitle('SPACING', gridX(0), 456);
    let sx = gridX(0);
    for (const name in t.space) {
      const v = t.space[name];
      noStroke();
      fill(c.chalk);
      rect(sx, 576 - v, v, v); // squares standing on one line
      caption(String(v), sx, 592, c.muted);
      sx += v + 16;
    }

    // ---- Type scale (columns 5–8) ----
    sectionTitle('TYPE', gridX(4), 144);
    const samples = {
      caption: 'NO. 48213907', label: '2 / 3 READY', body: 'Step onto the marks',
      lead: 'Hands up!', numeral: '01 02 03', title: 'MUGSHOT(3)', headline: 'WANTED', hero: 'POLICE!',
    };
    let ty = 168;
    for (const name in samples) {
      const st = t.type[name];
      push();
      noStroke();
      fill(c.text);
      setType(name);
      textAlign(LEFT, BASELINE);
      const cap = drawingContext.measureText('H').actualBoundingBoxAscent;
      const baseline = ty + st.line / 2 + cap / 2;
      text(samples[name], gridX(5), baseline);
      pop();
      caption(name + ' ' + st.size, gridX(4), baseline, c.muted); // same baseline as the sample
      ty += st.line; // the line heights are already on the 8 px grid
    }

    // ---- Strokes (columns 9–12) ----
    sectionTitle('STROKES', gridX(8), 144);
    let ly = 184;
    for (const name in t.stroke) {
      caption(name + ' ' + t.stroke[name], gridX(8), ly - 6, c.muted);
      stroke(c.chalk);
      strokeWeight(t.stroke[name]);
      strokeCap(ROUND);
      line(gridX(9) + 24, ly, gridX(9) + 304, ly);
      ly += 32;
    }

    // ---- Wobble levels: the same line, each level (columns 9–12) ----
    sectionTitle('WOBBLE  (max px)', gridX(8), 320);
    let wy = 360;
    for (const name in t.wobble) {
      caption(name + ' ' + t.wobble[name], gridX(8), wy - 6, c.muted);
      const shape = lineShape('wobble-sample', [{ x: 0, y: 0 }, { x: 280, y: 0 }], { stroke: 'ui', wobble: name });
      drawShape(shape, gridX(9) + 24, wy, c.chalk);
      wy += 40;
    }
    caption('line boil: ' + (t.boil.on ? 'on' : 'off'), gridX(8), 528, c.muted);

    // ---- Shout (the countdown size) ----
    push();
    noStroke();
    fill(c.text);
    setType('shout');
    textCentered('3', gridX(11) + 96, 448);
    pop();
    caption('shout ' + t.type.shout.size, gridX(11) + 64, 576, c.muted);

    // ================= COMPONENTS =================
    sectionTitle('COMPONENTS', gridX(0), 624);

    // Row 1: page dots in their 3 states, key hints, placard, stamp M
    PageDots(2, 6, gridX(0) + 180, 696);
    caption('PageDots  done / current / upcoming', gridX(0), 744, c.muted);

    let kx = 488;
    for (const label of ['>>>', 'SPACE', 'H']) {
      const box = KeyHint(label, kx, 696, 'left');
      kx += box.w + t.space.m;
    }
    caption('KeyHint', 488, 744, c.muted);

    Placard(gridX(5), 648, 'No. 48213907', '12.11.2026', CONFIG.colors.people[2]);
    caption('Placard', gridX(5), 768, c.muted);

    // Row 2: grid cells in their states ('locked' has the same frame as
    // 'active': the MATCH stamp is what's different)
    const states = ['idle', 'active', 'cleared'];
    states.forEach(function (state, i) {
      const x = gridX(0) + i * (t.gridCell.w + t.gridCell.gap);
      GridCell(x, 800, state, CONFIG.colors.people[1]);
      caption('GridCell ' + (state === 'active' ? 'active / locked' : state), x, 1008, c.muted);
    });

    // Stamps S / M / L
    for (const s of this.stamps) drawStamp(s);
    caption('Stamp  S / M / L', 1120, 1008, c.muted);

    // A torn poster (size S) with a doodle frame inside
    TornPoster(0, 'S', CONFIG.colors.people[0], gridX(10) + 136, 800, function (w, h) {
      noStroke();
      fill(c.ink);
      setType('title');
      textCentered('WANTED', 0, -h / 2 + t.space.xxl);
      DoodleFrame(-w / 2 + t.space.xl, -h / 2 + 88, w - 2 * t.space.xl, 168, c.ink);
      setType('caption');
      fill(c.ink);
      textCentered('NO. 48213907', 0, h / 2 - t.space.xl);
    });
    caption('TornPoster S + DoodleFrame', gridX(10) + 16, 1008, c.muted);

    caption('STYLE GUIDE 1/10  ·  G next page  ·  D debug overlay (red = exact token size)  ·  ←  →  back to the story', gridX(0), 1048, c.muted);
  },

  // ---------- page 2: screen components ----------
  drawScreenComponentsPage() {
    const c = CONFIG.ui.colors;
    const t = CONFIG.ui.tokens;
    sectionTitle('SCREEN COMPONENTS', gridX(0), 144);

    // WANTED posters: empty, and with a face. Without people in front
    // of the camera, the "face" is simply the middle of the camera picture.
    const posterY = 448;
    WantedPoster(0, 'M', gridX(0) + 200, posterY, null, null);
    const demoCrop = cameraReady ? { cx: video.width / 2, cy: video.height / 2, side: video.height / 2 } : null;
    WantedPoster(1, 'M', gridX(0) + 648, posterY, demoCrop, '48213907');
    caption('WantedPoster M  empty (frame pulses)', gridX(0), 776, c.muted);
    caption('WantedPoster M  with a face', gridX(0) + 448, 776, c.muted);

    // Floor marks 01 – 03, and the badge
    for (let i = 0; i < 3; i++) FloorMark(i, gridX(7) + 48 + i * 144, 216);
    caption('FloorMark  01 / 02 / 03', gridX(7), 296, c.muted);
    NumberBadge('3', 'PEOPLE PER ROUND', gridX(7), 360);
    caption('NumberBadge', gridX(7), 416, c.muted);

    // A piece of torn band with the three chalk poses on it (upright here, so
    // you can see the poses; on the welcome screen they lie down)
    const bandX = 1408;
    const bandY = 640;
    TornBand(832, bandX, bandY, c.sirenRed);
    const ms = millis() - this.enteredAt;
    for (let i = 0; i < 3; i++) {
      ChalkFigure(i, bandX + (i - 1) * 277, bandY, 0, ms - i * t.chalkFigure.staggerMs);
    }
    caption('TornBand  +  ChalkFigure 0 / 1 / 2 (draws on, holds, fades, loops)', gridX(6) + 16, 848, c.muted);

    caption('STYLE GUIDE 2/10  ·  G next page  ·  D debug overlay  ·  ←  →  back to the story', gridX(0), 1048, c.muted);
  },

  // ---------- page 3: Hands Up components ----------
  // Laid out with the same tokens as the Hands Up screen itself.
  drawHandsUpPage() {
    const c = CONFIG.ui.colors;
    const t = CONFIG.ui.tokens;
    const h = t.handsup;
    // A slam word (already landed). On screen it's only used for "HANDS" /
    // "UP!" in 02b (page 6); 02a has NO headline.
    SlamWord('FREEZE!', t.layout.margin, h.headlineBaseline, 0, 'shout', h.wordFrom);
    caption('SlamWord  shout', gridX(5), h.headlineBaseline, c.muted);
    caption('SirenFlash: red / blue x ' + h.flashes + ', ' + CONFIG.ui.timing.sirenFlashMs + ' ms each (plays on screen 02)', gridX(0), 352, c.muted);

    // Small posters with the three status labels; a stamp on the third
    const demoCrop = cameraReady ? { cx: video.width / 2, cy: video.height / 2, side: video.height / 2 } : null;
    for (let i = 0; i < 3; i++) {
      WantedPoster(i, 'S', h.posterX[i], h.posterY, i === 0 ? null : demoCrop, i === 0 ? null : '48213907');
      StatusLabel(i, i, h.posterX[i], h.statusY);
    }
    drawStamp(this.page3Stamp);
    caption('WantedPoster S  ·  StatusLabel 0/2 · 1/2 · 2/2  ·  Stamp M', gridX(0), 984, c.muted);

    // The officer and his speech bubble (always talking here)
    PoliceOfficer(h.officerX, h.officerFeetY, true);
    // The bubble fits its words: a short line, and a long one that wraps
    // (both with their right edge at the same place, so the tail stays put)
    SpeechBubble(CONFIG.police.lines.t20, 999, h.bubbleRight, h.bubbleY - 224);
    SpeechBubble(CONFIG.police.lines.t12 + ' ' + CONFIG.police.lines.t8, 999, h.bubbleRight, h.bubbleY);
    caption('PoliceOfficer  +  SpeechBubble (fits its words)', gridX(8), 1048, c.muted);

    caption('STYLE GUIDE 3/10  HANDS UP  ·  G next page  ·  D debug overlay  ·  ←  →  back to the story', gridX(0), 1048, c.muted);
  },

  // ---------- page 4: Mugshot components ----------
  // Laid out with the same tokens as the Mugshot screen itself.
  drawMugshotPage() {
    const c = CONFIG.ui.colors;
    const t = CONFIG.ui.tokens;
    const view = mugshotView();
    CameraView(cameraReady ? video : null, view);
    HeightChart(view);
    // Three placards where faces might be
    const date = nf(day(), 2) + '.' + nf(month(), 2) + '.' + year();
    for (let i = 0; i < 3; i++) {
      const x = view.x + (i + 0.5) * (view.w / 3) - t.placard.w / 2;
      Placard(x, view.y + view.h - t.placard.h - t.space.xl, 'No. 48213907', date, CONFIG.colors.people[i]);
    }
    Countdown(3, view.x + view.w / 2, view.y + view.h / 2);
    caption('CameraView + DoodleFrame  ·  HeightChart  ·  Placard x3  ·  Countdown  ·  CameraFlash: white, fades in ' + t.mugshot.flashMs + ' ms', view.x, 952, c.muted);
    caption('STYLE GUIDE 4/10  MUGSHOT  ·  G next page  ·  D debug overlay  ·  ←  →  back to the story', gridX(0), 1048, c.muted);
  },

  // ---------- page 5: Arrival components ----------
  // The end of scene 02a, standing still, laid out with its own tokens.
  drawArrivalPage() {
    const c = CONFIG.ui.colors;
    const t = CONFIG.ui.tokens;
    const a = t.arrival;
    const ms = millis();
    SirenGlow(a.stopX - 40, a.groundY - 220, ms, 1);
    GroundLine(a.groundY);
    PoliceOfficer(a.officerX, a.groundY, true, 'right');
    // speed: 1 shows the speed lines (on screen they only appear while driving)
    PoliceCar(a.stopX, a.groundY, { wheelAngle: 0, ms: ms, speed: 1 });
    SpeechBubble(CONFIG.police.lines.start, 999, a.bubbleLeft, a.bubbleY, 'left');
    caption('PoliceCar (+ speed lines, light bar swaps red / blue)  ·  SirenGlow  ·  GroundLine', gridX(0), 856, c.muted);
    caption('PoliceOfficer facing right  ·  SpeechBubble tail left', gridX(6), 856, c.muted);
    caption('STYLE GUIDE 5/10  ARRIVAL  ·  G next page  ·  D debug overlay  ·  ←  →  back to the story', gridX(0), 1048, c.muted);
  },

  // ---------- page 6: Hands Up live (scene 02b) ----------
  // Scene 02b without a camera: the three states of a person, side by side.
  //   01: arms down (0/2)   02: one arm up without / one with open palm (1/2)
  //   03: both open palms up (2/2) + SURRENDERED
  drawHandsUpLivePage() {
    const c = CONFIG.ui.colors;
    const t = CONFIG.ui.tokens;
    const h = t.handsupLive;
    const view = mugshotView();
    CameraView(null, view); // no camera here: the grey panel
    const states = [
      { handsUp: 0, hands: [] },
      { handsUp: 1, hands: [[-120, false], [120, true]] }, // [x from the face, palm?]
      { handsUp: 2, hands: [[-120, true], [120, true]] },
    ];
    states.forEach(function (st, i) {
      const x = view.x + (view.w * (2 * i + 1)) / 6; // the middle of each third
      StatusLabel(i, st.handsUp, x, 320, i === 2); // person 03: locked (2/2 ✓)
      for (const hand of st.hands) HandMarker(i, x + hand[0], 400, hand[1]);
    });
    this.page6Stamp.x = view.x + (view.w * 5) / 6;
    this.page6Stamp.y = 640;
    drawStamp(this.page6Stamp);
    caption('StatusLabel 0/2 · 1/2 · 2/2 ✓  ·  HandMarker: outline = arm up, filled = open palm  ·  Stamp M in the person colour', view.x + t.space.l, view.y + view.h - t.space.l, c.muted);
    SlamWord('HANDS', t.layout.margin, h.headlineBaselines[0], 0, 'headline', 1);
    SlamWord('UP!', t.layout.margin, h.headlineBaselines[1], 0, 'headline', 1);
    PoliceOfficer(h.officerX, h.officerFeetY, true, 'left', h.officerScale);
    SpeechBubble(CONFIG.police.lines.t8, 999, h.bubbleRight, h.bubbleY, 'side');
    caption('STYLE GUIDE 6/10  HANDS UP LIVE  ·  G next page  ·  D debug overlay', gridX(0), 1048, c.muted);
  },

  // ---------- page 7: Forgery (the bandits) ----------
  // Rows: bandit 01 / 02 / 03 (stripes + tool from CONFIG.forgery.tools).
  // Columns: the four poses. Right: the tools on their own.
  drawForgeryPage() {
    const c = CONFIG.ui.colors;
    const size = 0.5; // half size, so all twelve fit
    const columnX = [gridX(2) + 61, gridX(4) + 61, gridX(6) + 61, gridX(8) + 61];
    const rowFeetY = [408, 656, 904];
    BANDIT_POSE_NAMES.forEach(function (pose, col) {
      caption(pose, columnX[col] - 40, 160, c.muted);
    });
    for (let slot = 0; slot < 3; slot++) {
      caption(nf(slot + 1, 2) + '  ' + CONFIG.forgery.tools[slot], gridX(0), rowFeetY[slot] - 96, CONFIG.colors.people[slot]);
      BANDIT_POSE_NAMES.forEach(function (pose, col) {
        // Scissors open and close here, so you can see the snip
        const snip = (sin(millis() / 150) + 1) / 2;
        Bandit(slot, pose, columnX[col], rowFeetY[slot], { size: size, snip: snip });
      });
    }
    // The tools, full size
    Pencil(gridX(10), 296, 0);
    caption('Pencil (tip = PENCIL_TIP)', gridX(10), 352, c.muted);
    Scissors(gridX(10) + 48, 520, 0, 0);
    caption('Scissors closed', gridX(10), 592, c.muted);
    Scissors(gridX(10) + 48, 728, 0, 1);
    caption('Scissors open', gridX(10), 816, c.muted);
    caption('STYLE GUIDE 7/10  FORGERY  ·  G next page  ·  D debug overlay  ·  ←  →  back to the story', gridX(0), 1048, c.muted);
  },

  // ---------- page 8: Case file (print status + the printed page) ----------
  drawCaseFilePage() {
    const c = CONFIG.ui.colors;
    const t = CONFIG.ui.tokens;
    const ms = millis() - this.enteredAt;
    // The three states of the print status
    sectionTitle('PrintStatus', gridX(0), 200);
    PrintStatus('printing', gridX(0), 256, ms);
    PrintStatus('done', gridX(0), 480, ms);
    PrintStatus('off', gridX(0), 640, ms);
    caption('printing (the sheet slides out, looping)  ·  done  ·  off (CONFIG.print.auto = false)', gridX(0), 784, c.muted);

    // The printed Letter page, made once, shown small: this round's real
    // composite if there's a photo, otherwise a stand-in. Made only once the
    // fonts have loaded, or it would use a fallback font.
    if (!this.printPreview && fontLoaded('hero') && fontLoaded('label')) {
      if (collage && collage.parts) {
        this.printPreview = makePrintImage(collage.parts, recipe ? recipe.number : 0);
      } else {
        const stand = makeStandInParts(); // print.js
        this.printPreview = makePrintImage(stand, 2);
        for (const s of stand.stickers) s.img.remove();
      }
    }
    if (!this.printPreview) return;
    const h = 840;
    const w = (h * this.printPreview.width) / this.printPreview.height;
    const x = CONFIG.stage.width - t.layout.margin - w; // right-aligned to the margin
    const y = 176;
    image(this.printPreview, x, y, w, h);
    // O: the reference layout on top, at 50%, to check the alignment
    if (this.showReference) {
      if (!this.reference) this.reference = loadImage('assets/reference/print_layout.png');
      if (this.reference.width > 1) {
        tint(255, 128);
        image(this.reference, x, y, w, h);
        noTint();
      }
    }
    noFill();
    stroke(c.muted);
    strokeWeight(1);
    rect(x, y, w, h);
    noStroke();
    caption('Print: US Letter, 300 dpi  ·  O = reference ' + (this.showReference ? 'on' : 'off'), x, 1048, c.muted);
    caption('STYLE GUIDE 8/10  CASE FILE PRINT  ·  G next page  ·  D debug overlay', gridX(0), 1048, c.muted);
  },

  // ---------- page 9: Case file screen components ----------
  // Laid out with the case file's own tokens (the poster is blank here).
  drawCaseFileScreenPage() {
    const c = CONFIG.ui.colors;
    const t = CONFIG.ui.tokens;
    const cf = t.casefile;
    CaseFilePoster(null, cf.poster.cx, cf.poster.cy, cf.poster.angle);
    const x = gridX(cf.columnX);
    const w = CONFIG.stage.width - t.layout.margin - x;
    EvidenceMarker(3, cf.marker.cx, cf.marker.cy);
    caption('EvidenceMarker', cf.marker.cx - cf.marker.w / 2, cf.marker.cy + cf.marker.h / 2 + t.space.xl, c.muted);
    ['base face', 'eyes', 'nose', 'ears', 'lips'].forEach((label, i) => RecipeRow(label, i % 3, x, cf.recipe.y + i * cf.recipe.step, w));
    caption('RecipeRow (one rule shape, in the person colour)', x, cf.recipe.y + 5 * cf.recipe.step, c.muted);
    if (!this.page9Stamp) {
      this.page9Stamp = makeStamp('AT LARGE', { x: x + 200, y: cf.statusBaseline - 10, size: 'M', color: c.sirenRed });
      showStamp(this.page9Stamp);
    }
    drawStamp(this.page9Stamp);
    caption('CaseFilePoster (torn paper, size L, blank before the reveal)  ·  Stamp M', gridX(0), 1068, c.muted);
    caption('STYLE GUIDE 9/10  CASE FILE  ·  G next page', x, 1048, c.muted);
  },

  // ---------- page 10: Sound test ----------
  // Every sound in CONFIG.sound.sounds as a button. Under its name: what
  // plays ("file: …" = the recording, "synth" = made in sound.js).
  // Click = play (click again while it plays = stop).
  soundTestButtons() {
    const t = CONFIG.ui.tokens.soundButton;
    const buttons = [];
    const names = Object.keys(CONFIG.sound.sounds);
    names.forEach(function (name, i) {
      buttons.push({ name: name, x: gridX(0) + (i % 5) * (t.w + t.gap), y: 216 + floor(i / 5) * (t.h + t.gap) });
    });
    const y = 216 + ceil(names.length / 5) * (t.h + t.gap) + t.gap * 2;
    // The actions, 5 per row: the countdown (03) in its three modes on the second row
    const actions = ['volume-', 'volume+', 'mute', 'stop all', 'evidence + grid', 'countdown: beep', 'countdown: voice', 'countdown: both'];
    actions.forEach(function (action, i) {
      buttons.push({ action: action, x: gridX(0) + (i % 5) * (t.w + t.gap), y: y + floor(i / 5) * (t.h + t.gap) });
    });
    return buttons;
  },

  drawSoundTestPage() {
    const c = CONFIG.ui.colors;
    sectionTitle('SOUND TEST  ·  click a sound to play it (again = stop)', gridX(0), 176);
    for (const b of this.soundTestButtons()) {
      if (b.name) {
        const def = CONFIG.sound.sounds[b.name];
        const sub = sfxHasFile(b.name) ? 'file: ' + def.file.split('/').pop() : 'synth: ' + def.synthFallback + ' (no file)';
        SoundButton(b.name, sub, b.x, b.y, isPlaying(b.name));
      } else {
        const subs = {
          'volume-': 'master ' + round(CONFIG.sound.master * 100) + '%',
          'volume+': 'master ' + round(CONFIG.sound.master * 100) + '%',
          mute: sfxMuted ? 'muted' : 'on',
          'stop all': 'every sound',
          'evidence + grid': 'the 04 screen, with its audio',
          'countdown: beep': '3 · 2 · 1 (higher) · shutter',
          'countdown: voice': 'the officer: "Three… two… one…"',
          'countdown: both': 'beeps + voice',
        };
        SoundButton(b.action.toUpperCase(), subs[b.action], b.x, b.y, b.action === 'mute' && sfxMuted);
      }
    }
    // The sound log (Shift+L on any screen), with what has played so far:
    // next to the second row of actions (which has 3 buttons)
    const st = CONFIG.ui.tokens.soundButton;
    const last = this.soundTestButtons().pop(); // 'countdown: both', the third button of that row
    SoundLog(sfxLog, last.x + st.w + st.gap, last.y + soundLogHeight());
    caption(soundUnlocked() ? 'Sound engine: on' : 'Sound engine: waiting for a click (the browser blocks sound until then)', gridX(0), 1000, c.muted);
    caption('STYLE GUIDE 10/10  SOUND TEST  ·  G first page  ·  U mute', gridX(0), 1048, c.muted);
  },

  // Clicks (only the sound test page has buttons)
  mousePressed(p) {
    if (this.page !== 9) return;
    for (const b of this.soundTestButtons()) {
      if (!overSoundButton(p, b.x, b.y)) continue;
      if (b.name) {
        if (isPlaying(b.name)) stopSfx(b.name, 100);
        else if (b.name === 'handsup') playSfx('handsup', { start: CONFIG.sound.handsupClip.start, end: CONFIG.sound.handsupClip.end });
        else playSfx(b.name);
      } else if (b.action === 'volume-') setMasterVolume(CONFIG.sound.master - 0.1);
      else if (b.action === 'volume+') setMasterVolume(CONFIG.sound.master + 0.1);
      else if (b.action === 'mute') toggleMute();
      else if (b.action === 'stop all') stopAllSfx(100);
      else if (b.action.startsWith('countdown: ')) this.playCountdownTest(b.action.split(': ')[1]);
      else if (b.action === 'evidence + grid') {
        evidenceScreen.returnTo = 'styleguide'; // come back here afterwards
        goTo('evidence');
      }
      return;
    }
  },

  // The 03 countdown as it plays on the mugshot screen: 3, 2, 1 one
  // second apart (the mode: 'beep', 'voice' or 'both'), then the shutter
  playCountdownTest(mode) {
    [3, 2, 1].forEach((n) => playCountdownStep(n, mode, (3 - n) * 1000));
    playSfx('shutter', { delay: 3000 });
  },

  // O: the print reference on / off (page 8)
  keyPressed() {
    if (key === 'o' || key === 'O') this.showReference = !this.showReference;
  },

  exit() {
    this.page9Stamp = null;
    if (this.printPreview) this.printPreview.remove(); // the big print picture
    this.printPreview = null;
  },
};

// ---------- small helpers for this page ----------

const STYLEGUIDE_PAGES = 10;

function sectionTitle(words, x, y) {
  push();
  noStroke();
  fill(CONFIG.ui.colors.text);
  setType('label');
  textAlign(LEFT, BASELINE);
  text(words, x, y);
  pop();
}

function caption(words, x, y, colour) {
  push();
  noStroke();
  fill(colour);
  setType('caption');
  textAlign(LEFT, BASELINE);
  text(words, x, y);
  pop();
}
