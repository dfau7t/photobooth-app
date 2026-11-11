// =============================================================
// config.js — every value you might want to tweak lives here.
// Change a number, save, refresh the browser. That's it.
// =============================================================

const CONFIG = {
  colors: {
    paper: "#F2EEE6", // background
    ink: "#141414", // dots and text
    // person01 red, person02 yellow, person03 blue (like risograph inks).
    // If the yellow looks too weak on screen, try a deeper one: '#F5D90A'
    people: ["#DE3127", "#F2F26B", "#4AA6DE"],
  },

  // The "virtual" screen we design for. Everything is drawn at this size
  // and then scaled up or down to fit the real window.
  stage: { width: 1920, height: 1080 },

  camera: {
    width: 1920, // the resolution we ASK the camera for (it may give less)
    height: 1080,
    mirror: true, // flip the preview like a mirror (only affects drawing, not the logic)
  },

  faces: {
    required: 3, // exactly this many people per photo
  },

  // The camera picture is split into square zones, one per floor mark.
  // Each zone gets its own face detector, so faces far from the camera
  // are still found. Press D to see the zones on screen.
  zones: {
    count: 3,
    size: 0.36, // zone width as a fraction of the camera width (a bit over 1/3 so zones overlap)
    centerY: 0.45, // height of the zones: 0 = top of picture, 1 = bottom. Put it at face height.
    maxFacesPerZone: 2, // 2, so we can notice when a 4th person squeezes in
  },

  // The base face as a halftone print.  Live keys: [ ] cellSize,  - = dotScale
  halftone: {
    cellSize: 10, // size of one dot cell, in output pixels
    dotScale: 1.25, // 1 = dots just touch; more = dark areas merge into solid ink
    angle: 45, // rotation of the dot grid, in degrees
    contrast: 1.3, // 1 = unchanged
  },

  // The borrowed features pasted on top
  pieces: {
    cutStyle: "rect", // 'rect' = strip of paper, 'shape' = cut along the feature (key C)
    halftonePieces: false, // true = pieces are halftone too (key H)
    contrast: 1.2, // grayscale pieces get a little extra contrast
    blockBleed: 0.06, // colour block is 6% bigger than the piece
    blockAlpha: 0.85, // how strong the colour block is (0 = invisible, 1 = full)
    misregister: 4, // colour block is shifted this many pixels, like a riso print
    border: 0, // paper border around each piece, in output pixels
    headOutline: false, // thin ink line around the base head
  },

  // Experiment B: "Doodle + Die-cut" (press M to switch to it).
  // The base face is drawn as a line on white paper.
  doodle: {
    paper: "#FBFAF7", // white paper
    line: {
      color: "#7A6F66", // warm grey, like a felt-tip pen
      weight: 10, // line thickness, in output pixels
      weightVariation: 0.15, // the line gets up to 15% thicker / thinner along the way
      wobble: 5, // how far the line drifts sideways, in output pixels (0 = perfectly clean)
      wobbleSpeed: 0.02, // how quickly the drift changes: small = slow, hand-like drift
      spacing: 6, // a point every 6 px along each line
      doublePass: true, // go over every line a second time, lighter and slightly shifted
    },
    hairStyle: "random", // 'random' | 'spikes' | 'loops' | 'flat' | 'none'  (key T)
    head: {
      top: 0.12, // where the top of the head sits: 0 = top of page, 1 = bottom
      height: 0.6, // how much of the page height the head takes up
      topStretch: 0.08, // the drawn head goes 8% higher than the face oval
    },
    neck: {
      lean: 0.15, // 0 = neck lines go straight down; more = they lean in towards the middle
    },
    noseMode: "piece", // 'piece' = photo nose, 'line' = drawn nose, 'both'  (key N)

    // The photo stickers stuck on the drawing
    pieces: {
      cutStyle: "scissor", // 'scissor' | 'smooth' | 'rect'  (key C, in doodle mode)
      corners: [5, 8], // a scissor cut has between 5 and 8 corners
      border: 0, // white sticker edge, in output pixels. 0 = plain scissor-cut paper  (key B)
      borderWhenOn: 6, // the edge width that key B switches to
      shadow: true, // soft shadow under each sticker
      padding: { eyes: 0.25, nose: 0.2, lips: 0.3 }, // space around each feature, on each side
      looseness: 1, // pushes and turns: 0 = neat, 1 = the table below, 1.5 = wild  (keys L / K)
      exaggeration: 1, // sizes: 0 = all normal size, 1 = the table below, 1.5 = absurd  (keys X / Z)
    },

    // Who gave which sticker: a coloured mark (dot / tape) on the collage.
    // The recipe panel next to it always shows it.
    owners: {
      mark: "none", // 'none' | 'dot' | 'tape'  (key O)
      // Dot diameter, in output pixels. The brief says 12, but that was
      // barely visible in tests (the collage is shown at about half size).
      dotSize: 28,
      tapeLength: 120, // strip of tape, in output pixels
      tapeWidth: 34,
    },

    // The handwritten caption in the bottom-right corner: "mesh no. 0042 — 02 · 01 · 03"
    caption: {
      show: true,
      font: "Caveat", // a handwriting font from Google Fonts (loaded in index.html)
      size: 36, // in output pixels
    },

    // The animation on the result screen (all in milliseconds)
    animation: {
      lineMs: 1500, // how long tracing the line takes
      dropGapMs: 150, // time between one sticker and the next
      dropMs: 250, // how long one sticker takes to land
      fadeMs: 300, // marks and caption fade in
    },

    // How far each sticker may move away from its anchor (Dada style).
    //   x, y: push, as a fraction of the base face width
    //   rot:  turn, in degrees (either way)
    //   size: smallest and biggest size, compared to normal
    // Ears don't use x: they always stick 30–50% out past the head line.
    placement: {
      eyes: { x: 0.07, y: 0.05, rot: 10, size: [0.8, 1.5] },
      nose: { x: 0.04, y: 0.04, rot: 10, size: [0.9, 1.3] },
      lips: { x: 0.08, y: 0.05, rot: 8, size: [1.0, 1.8] },
      ears: { x: 0.03, y: 0.1, rot: 15, size: [0.9, 1.4] },
    },
  },

  recipe: { allowSelfFeature: true }, // can a feature come from the base person?

  output: {
    width: 1600, // the finished collage (and saved PNG) size: 4:5 portrait
    height: 2000,
    cropMargin: 0.45, // space around the base face box, on each side
  },

  // The "everybody raise both hands" shutter (gesture.js).
  // The numbers marked "friend" are copied from the Python version.
  gesture: {
    enabled: true, // false = start with the hands-up shutter switched off (key G toggles)
    holdMs: 400, // everyone must hold the pose this long (friend: 0.4 s)
    countdownMs: 3000, // then a 3-2-1 countdown before the photo
    minGestureConfidence: 0.45, // how sure the model must be it's an "Open_Palm" (friend)
    maxPoseDistance: 0.25, // a skeleton belongs to a face if its nose is this close (fraction of camera width, friend)
    maxHandDistance: 0.35, // ignore hands further than this from the face (friend)
    maxPoses: 4, // how many bodies to look for (3 people + 1 spare)
    maxHands: 8, // how many hands to look for (friend)
    intervalMs: 100, // run the models every 100 ms (10x per second), not every frame
    // Against flicker: once an arm is seen up, it keeps counting as up for
    // this long, even if the models miss it for a moment.
    // More = steadier but slower to notice hands going down. 0 = no memory.
    memoryMs: 500,
  },

  // The slot machine after the photo (slot.js).
  // Timings copied from the friend's Python version.
  slot: {
    // The rows, top to bottom, in spinning order. Remove 'base' to only spin the features.
    rows: ["base", "eyes", "nose", "ears", "lips"],
    spinMs: 1500, // how long the FIRST row spins (friend: 700)
    rowSlowdown: 1.12, // each next row spins 12% longer, so the machine winds down. 1 = all the same
    easePower: 5, // how much each spin slows down at the end. 1 = steady speed, more = longer stop (friend: 2.5)
    gapMs: 100, // pause before the next row starts
    spinSteps: 32, // how many times the highlight jumps in one spin
    // The "jackpot": when all rows have stopped, the picks blink together
    blinkDelayMs: 150, // pause between the last row stopping and the blinking
    blinkCount: 4, // how many times they blink
    blinkMs: 300, // one blink (off + on). Smaller = faster blinking
    holdMs: 1500, // how long the finished slot machine stays before the collage
  },

  // Not used yet (screen flow comes later)
  timing: {
    stableMs: 1000,
    mixingMs: 3000,
    resultMs: 10000,
    takehomeMs: 20000,
  },

  debug: true, // start with the debug overlay on (press D to toggle)
};
