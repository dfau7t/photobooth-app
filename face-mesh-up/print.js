// =============================================================
// print.js — the printed case file (US Letter, see
// assets/reference/print_layout.png).
//
//   printCaseFile()                  make the page and print it (no dialog)
//   makePrintImage(parts, number)    the page itself (a p5.Graphics)
//   makeStandInParts()               a made-up composite (no photo yet),
//                                    for the style-guide preview
//
// THE PAGE (top to bottom)
//   header:  intro_to_programming / {IDP2026} / MUGSHOT N0.____ (left)
//            / MUGSHOT(3) / (right), then a thick rule
//   chart:   a height chart: a "200" rule, the numbers 190 … 110 on the
//            right, a "100" rule. The composite stands in it like a person
//            against a height chart: its neck lines end ON the "100" rule.
//   footer:  a thick rule, then (1) NAME : ____ (2) … (3) … to write on
//
// POINTS: every position in CONFIG.print.layout is in points on a
// 612 x 792 page (1 pt = 1/72 inch, the reference image's size). We
// multiply everything by ONE factor, k = dpi / 72, to get print pixels
// (at 300 dpi: k = 4.17, so the page is 2550 x 3300 px).
//
// HOW PRINTING WORKS (CONFIG.print.method)
// A web page can't talk to a printer directly: window.print() always
// opens the print dialog (someone has to click "Print"). So:
//   'server' (the default): no dialog, no clicks.
//      1. We draw the page as a separate high-resolution PICTURE.
//      2. We send that picture to our own little server (serve.py, /print).
//      3. The server saves it in the prints/ folder (the archive) and gives
//         it to macOS's print command, which prints it on the DEFAULT printer.
//   'browser': the old way, window.print() with the picture in a hidden
//      <img id="print-image"> and print-only CSS (index.html). Shows the
//      dialog, unless Chrome runs with --kiosk --kiosk-printing.
//   If the server can't be reached (the page was opened with another web
//   server), it falls back to 'browser'.
// =============================================================

// Paper sizes, in inches (portrait)
const PAPER_SIZES = { Letter: { w: 8.5, h: 11 } };

// Print the case file of this round's photo (collage + recipe, sketch.js).
// The screen decides WHEN (once per photo); this function just prints.
// (The fonts are long loaded by then: the print happens at the end of the story.)
function printCaseFile() {
  if (!collage || !collage.parts || !recipe) return;
  const g = makePrintImage(collage.parts, recipe.number);
  const name = printFileName(recipe);
  if (CONFIG.print.method === 'server') printOnServer(g, name);
  else printInBrowser(g, name);
}

// Send the picture to serve.py, which saves it (prints/) and prints it
function printOnServer(g, name) {
  g.elt.toBlob(function (png) {
    fetch('/print?name=' + name, { method: 'POST', body: png })
      .then(function (response) {
        if (response.status === 404 || response.status === 501) throw new Error('no print server');
        return response.json();
      })
      .then(function (answer) {
        if (answer.ok) console.log('Printing ' + name + '.png: ' + answer.job);
        else {
          console.error('Printing failed: ' + answer.error);
          showMessage('Printing failed: ' + answer.error);
        }
        g.remove();
      })
      .catch(function (e) {
        // Not running on serve.py (e.g. another web server): print the browser way
        console.warn('Print server not reachable (' + e.message + '): using the print dialog instead. Start the app with: python3 serve.py');
        printInBrowser(g, name);
      });
  }, 'image/png');
}

// The browser way: window.print() (a dialog, unless Chrome --kiosk-printing)
function printInBrowser(g, name) {
  // A PNG copy of the same page for the archive (the browser saves it as a download)
  if (CONFIG.print.archive) saveCanvas(g, name, 'png');

  // Into the hidden print-only picture; print as soon as it has loaded
  const img = document.getElementById('print-image');
  img.onload = function () {
    window.print();
  };
  img.src = g.elt.toDataURL('image/png');
  setTimeout(() => g.remove(), 3000); // free the big drawing once the copies are made
}

// e.g. "mugshot3_case_0002_2026-11-12_14-03-22"
function printFileName(r) {
  const date = year() + '-' + nf(month(), 2) + '-' + nf(day(), 2);
  const time = nf(hour(), 2) + '-' + nf(minute(), 2) + '-' + nf(second(), 2);
  return CONFIG.print.filePrefix + nf(r.number || 0, 4) + '_' + date + '_' + time;
}

// ---------- the page ----------

// parts: the collage's parts (lines, stickers, plans); number: the case number
function makePrintImage(parts, number) {
  const P = CONFIG.print;
  const L = P.layout;
  const paper = PAPER_SIZES[P.paper];
  const W = round(paper.w * P.dpi); // 8.5 in x 300 dpi = 2550 px
  const H = round(paper.h * P.dpi); // 11 in x 300 dpi = 3300 px
  const k = P.dpi / 72; // points -> print pixels

  const g = createGraphics(W, H);
  g.pixelDensity(1);
  g.background(P.paperColor);

  // ---- The composite first, so the rules and numbers sit on top ----
  drawPrintComposite(g, parts, k);

  // Two small helpers. Everything is given in POINTS and multiplied by k.
  // words(): returns the text's width, in points.
  const ink = P.inkColor;
  function words(str, x, y, sizePt, font, bold, alignX, alignY) {
    g.noStroke();
    g.fill(ink);
    g.textFont(font);
    g.textStyle(bold ? BOLD : NORMAL);
    g.textSize(sizePt * k);
    g.textAlign(alignX || LEFT, alignY || BASELINE);
    g.text(str, x * k, y * k);
    return g.textWidth(str) / k;
  }
  // rule(): a straight black line from x1 to x2, weightPt thick, centred on y
  function rule(x1, x2, y, weightPt) {
    g.noStroke();
    g.fill(ink);
    g.rect(x1 * k, (y - weightPt / 2) * k, (x2 - x1) * k, weightPt * k);
  }
  const mono = CONFIG.ui.fonts.mono;
  const display = CONFIG.ui.fonts.display;

  // ---- Header ----
  words(L.course.text, L.left, L.course.baseline, L.course.size, mono, true);
  words(L.tag.text, L.left, L.tag.baseline, L.tag.size, mono, false);
  const n = L.number;
  const labelW = words(n.text, L.left, n.baseline, n.size, mono, false);
  const lineX = L.left + labelW + n.gap;
  rule(lineX, lineX + n.lineLength, n.baseline + n.lineWeight, n.lineWeight); // the line to write on
  if (P.fillNumber) words(nf(number || 0, 4), lineX + n.lineLength / 2, n.baseline - n.lineWeight, n.size, mono, false, CENTER);
  words(L.title.text, L.right, L.title.baseline, L.title.size, display, false, RIGHT);
  rule(L.left, L.right, L.topRule.y, L.topRule.weight);

  // ---- Height chart: the "200" and "100" rules, and the numbers ----
  const c = L.chart;
  rule(L.left, c.ruleEnd, c.top, c.ruleWeight);
  rule(L.left, c.ruleEnd, c.bottom, c.ruleWeight);
  const step = (c.bottom - c.top) / (c.labels.length - 1); // 58 pt
  c.labels.forEach(function (label, i) {
    const major = i === 0 || i === c.labels.length - 1; // 200 and 100: bigger and bold
    words(String(label), L.right, c.top + i * step, major ? c.majorSize : c.minorSize, mono, major, RIGHT, CENTER);
  });

  // ---- Footer: the rule, and three name blocks to write on ----
  rule(L.left, L.right, L.bottomRule.y, L.bottomRule.weight);
  const nm = L.names;
  nm.x.forEach(function (x, i) {
    const w = words('(' + (i + 1) + ') NAME : ', x, nm.baseline, nm.size, mono, true);
    rule(x + w, x + w + nm.lineLength, nm.baseline + nm.lineWeight, nm.lineWeight);
  });
  return g;
}

// The composite (doodle line + photo pieces), drawn AT PRINT RESOLUTION:
// the line is redrawn from its points (sharp at any size), and the pieces
// are cut again from the photo at print scale. No owner marks, no caption.
// It stands in the height chart: centred between layout.left and
// chart.ruleEnd, its neck lines ending exactly on the "100" rule.
function drawPrintComposite(g, parts, k) {
  const L = CONFIG.print.layout;

  // ---- 1. How big is the drawing? (in collage pixels) ----
  // The box around every line point and every piece. The neck lines are
  // lines[1] and lines[2] (collageDoodle.js): where they end = the bottom.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let neckEnd = -Infinity;
  parts.lines.forEach(function (line, i) {
    for (const stroke of line.main) {
      for (const p of stroke.points) {
        minX = min(minX, p.x);
        maxX = max(maxX, p.x);
        minY = min(minY, p.y);
        if (i === 1 || i === 2) neckEnd = max(neckEnd, p.y);
      }
    }
  });
  for (const s of parts.stickers) {
    minX = min(minX, s.pos.x - s.img.width / 2);
    maxX = max(maxX, s.pos.x + s.img.width / 2);
    minY = min(minY, s.pos.y - s.img.height / 2);
  }

  // ---- 2. The scale: from the top (hair) to the neck ends = from
  // composite.top to the "100" rule. If it's then too wide, smaller. ----
  const areaLeft = L.left * k;
  const areaRight = L.chart.ruleEnd * k;
  const bottom = L.chart.bottom * k;
  const s = min((bottom - L.composite.top * k) / (neckEnd - minY), (areaRight - areaLeft) / (maxX - minX));
  // Collage pixels -> print pixels: centred left-right, neck ends on the rule
  const ox = (areaLeft + areaRight) / 2 - ((minX + maxX) / 2) * s;
  const oy = bottom - neckEnd * s;
  const toPrint = (p) => ({ x: ox + p.x * s, y: oy + p.y * s });

  // ---- 3. The line: the lighter pass, then the main line, redrawn sharp ----
  g.noFill();
  g.strokeCap(ROUND);
  g.strokeJoin(ROUND);
  for (const pass of ['light', 'main']) {
    g.stroke(pass === 'light' ? parts.lightColour : parts.lineColour);
    for (const line of parts.lines) {
      if (!line[pass]) continue;
      for (const stroke of line[pass]) {
        g.strokeWeight(stroke.weight * s);
        g.beginShape();
        for (const p of stroke.points) {
          const q = toPrint(p);
          g.vertex(q.x, q.y);
        }
        g.endShape();
      }
    }
  }

  // ---- 4. The pieces, ears -> lips -> nose -> eyes, with their soft shadow ----
  parts.stickers.forEach(function (sticker, i) {
    const plan = parts.plans ? parts.plans[i] : null;
    const at = toPrint(sticker.pos);
    if (plan && snap) {
      // Cut again from the photo, at print scale (crisp edges)
      const big = Object.assign({}, plan, {
        zoom: plan.zoom * s,
        shape: plan.shape ? plan.shape.map((p) => ({ x: p.x * s, y: p.y * s })) : null,
      });
      const made = makeSticker(snap, big); // diecut.js
      drawSticker(g, { img: made.img, shadow: made.shadow, pos: at, angle: sticker.angle }, 1, 1);
      made.img.remove();
      if (made.shadow) made.shadow.remove();
    } else {
      // No photo (the stand-in): the piece as it is, scaled
      g.push();
      g.translate(at.x, at.y);
      g.rotate(sticker.angle);
      g.imageMode(CENTER);
      g.image(sticker.img, 0, 0, sticker.img.width * s, sticker.img.height * s);
      g.pop();
    }
  });
}

// ---------- a stand-in (no photo yet) ----------

// A made-up composite with the same parts as a real one (collageDoodle.js):
// a head, two neck lines (lines[1] and [2]), hair, and three plain pieces.
// For checking the print layout in the style guide without a photo.
// (Free it when done: for each sticker, s.img.remove())
function makeStandInParts() {
  const W = CONFIG.output.width;
  const weight = CONFIG.doodle.line.weight;
  const head = [];
  for (let a = 0; a <= TWO_PI + 0.01; a += 0.02) head.push({ x: W / 2 + cos(a) * 480, y: 1000 + sin(a) * 560 });
  const neckL = [{ x: 600, y: 1520 }, { x: 590, y: 1800 }, { x: 585, y: 1950 }];
  const neckR = [{ x: 1000, y: 1520 }, { x: 1010, y: 1800 }, { x: 1015, y: 1950 }];
  const hair = [];
  for (let i = 0; i <= 8; i++) hair.push({ x: 420 + i * 95, y: i % 2 === 0 ? 520 : 300 });
  const line = (pts) => ({ main: penStrokes(resample(pts, 4), weight), light: null });
  const pieces = [
    { w: 140, h: 240, x: 340, y: 980, c: 0 }, // an ear
    { w: 360, h: 140, x: 800, y: 1260, c: 1 }, // lips
    { w: 520, h: 170, x: 800, y: 860, c: 2 }, // eyes
  ];
  const stickers = pieces.map(function (p) {
    const g = createGraphics(p.w, p.h);
    g.pixelDensity(1);
    g.noStroke();
    g.fill(CONFIG.colors.people[p.c]);
    g.rect(0, 0, p.w, p.h);
    return { img: g, shadow: null, pos: { x: p.x, y: p.y }, angle: 0 };
  });
  const lineColour = color(CONFIG.doodle.line.color);
  return {
    lines: [line(head), line(neckL), line(neckR), line(hair)],
    lineColour: lineColour,
    lightColour: lineColour,
    stickers: stickers,
    plans: null,
  };
}
