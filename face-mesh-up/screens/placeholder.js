// =============================================================
// screens/placeholder.js — a temporary "this screen is empty" page.
//
//   drawScreenPlaceholder(screen)
//
// Every screen that isn't built yet shows its number, name and what
// will go there. Each later milestone replaces one screen's placeholder
// with the real thing. When all screens are built, delete this file.
//
// Graphic system: sizes from the tokens, text styles from the type
// scale, colours from the palette, left edge on the grid margin,
// vertical positions on the 8 px baseline. No numbers typed in here
// except the baselines (multiples of 8).
// =============================================================

// Where each line sits: its baseline, from the top of the stage (all multiples of 8)
const PLACEHOLDER_BASELINES = { tag: 256, heading: 400, story: 480, plan: 520, milestone: 648 };

function drawScreenPlaceholder(screen) {
  const c = CONFIG.ui.colors;
  const t = CONFIG.ui.tokens;
  const b = PLACEHOLDER_BASELINES;
  const x = t.layout.margin; // the left edge of grid column 1
  const width8 = 8 * t.layout.column + 7 * t.layout.gutter; // 8 grid columns wide

  push();
  noStroke();

  // "SCREEN 02 · HANDSUP"
  fill(c.muted);
  placeholderLine('label', 'SCREEN ' + screen.number + '  ·  ' + screen.name.toUpperCase(), x, b.tag);

  // The big headline
  fill(c.text);
  placeholderLine('hero', screen.heading, x, b.heading);

  // What it is in the story
  placeholderLine('lead', screen.story, x, b.story);

  // What will happen here (wraps inside 8 columns), and when it gets built
  fill(c.muted);
  setType('body');
  textAlign(LEFT, TOP);
  text(screen.plan, x, b.plan, width8);
  placeholderLine('body', 'Coming in milestone ' + screen.milestone + '.', x, b.milestone);
  pop();

  // How to move around (for testing), on the bottom margin
  KeyHintRow(
    [
      { keys: ['←', '→'], text: 'screens' },
      { keys: ['G'], text: 'style guide' },
      { keys: ['D'], text: 'debug' },
      { keys: ['TAB'], text: 'classic booth' },
      { keys: ['F'], text: 'full screen' },
    ],
    x,
    CONFIG.stage.height - t.layout.margin
  );
}

// One line of text in a type style, sitting on a baseline
function placeholderLine(style, words, x, baseline) {
  setType(style);
  textAlign(LEFT, BASELINE);
  text(words, x, baseline);
}
