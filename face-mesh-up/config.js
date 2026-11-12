// =============================================================
// config.js — every value you might want to tweak lives here.
// Change a number, save, refresh the browser. That's it.
// =============================================================

const CONFIG = {
  colors: {
    paper: "#F2EEE6", // background
    ink: "#141414", // dots and text
    // MUGSHOT(3): person01 yellow, person02 blue, person03 red (Figma order, left -> right).
    // Used everywhere: face tags, collage, slot machine, screens.
    // (Before MUGSHOT(3) it was red, yellow, blue: ["#DE3127", "#F2F26B", "#4AA6DE"])
    people: ["#EEF24A", "#00A3E0", "#E60023"],
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
    // How people are numbered:
    //   "screen": person01 = leftmost ON SCREEN = the visitors' own left
    //             (matches the floor marks 01 02 03 and the Figma poster order)
    //   "camera": person01 = leftmost in the camera image (before MUGSHOT(3);
    //             with a mirrored preview, person01 then shows on the RIGHT)
    numbering: "screen",
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
    memoryMs: 500, // (only used when latch is false)

    // Against flicker, the new way (see gesture.js, "DEBOUNCE AND LATCH"):
    latch: true, // true = once someone is 2/2 for holdMs they stay SURRENDERED; false = the old behaviour
    upConfirmMs: 250, // a hand counts as UP only after it's been seen up this long in a row
    downGraceMs: 600, // a hand counts as DOWN only after it's been missing / down this long in a row
    lostFaceMs: 2000, // a surrendered person is unlocked when their face is gone this long (they left)
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

  // ---------------------------------------------------------------
  // MUGSHOT(3): the interface and the story (mugshot-ui-brief.md)
  // ---------------------------------------------------------------
  ui: {
    design: { width: 1920, height: 1080 }, // same as 'stage' above
    startScreen: "welcome", // the screen the app opens on (handy for testing one screen)
    // true = the story moves on by itself (faces found -> next screen).
    // Key A switches it off, so you can look at one screen without being moved on.
    autoAdvance: true,
    colors: {
      stage: "#000000", // the black background
      panel: "#3A3A3A", // grey panels, torn shapes, the current page dot
      text: "#FFFFFF", // UI text
      paper: "#F2EEE6", // poster paper
      chalk: "#F4F1EA", // doodle lines on black
      sirenRed: "#FF1E2D",
      sirenBlue: "#1E5BFF",
      ink: "#141414", // dark text and lines on paper / on colour
      muted: "#808080", // secondary text on black (captions, hints)
      dotFill: "#555555", // the current page dot
      debug: "#FF0000", // red reference shapes of the debug overlay (D)
    },

    // -------------------------------------------------------------
    // DESIGN TOKENS: every size on screen comes from here.
    // A token is a named value ("pageDot.diameter") instead of a number
    // typed into a screen file. Change it here = it changes everywhere.
    // -------------------------------------------------------------
    tokens: {
      // Designed at 1920 x 1080: 12 columns of 122 px, 24 px gutters,
      // 96 px outer margin. Vertical positions on multiples of 8.
      layout: { margin: 96, columns: 12, column: 122, gutter: 24, baseline: 8 },
      space: { xs: 4, s: 8, m: 16, l: 24, xl: 32, xxl: 48, xxxl: 64, huge: 96 },

      // Text styles: size, line height, letter-spacing (in em), which font
      type: {
        caption: { size: 14, line: 16, track: 0.06, font: "mono" },
        label: { size: 18, line: 24, track: 0.04, font: "mono" },
        body: { size: 24, line: 32, track: 0, font: "code" }, // Fira Code
        lead: { size: 32, line: 40, track: 0, font: "code" }, // Fira Code
        title: { size: 48, line: 56, track: 0.01, font: "display" },
        headline: { size: 72, line: 80, track: 0.01, font: "display" },
        hero: { size: 120, line: 128, track: 0.01, font: "display" },
        shout: { size: 200, line: 208, track: 0, font: "display" },
        numeral: { size: 32, line: 40, track: 0.02, font: "mono" }, // big numbers: floor marks, badges
      },

      stroke: { hairline: 2, ui: 4, emphasis: 6, collage: 10 }, // line thickness, px
      wobble: { none: 0, subtle: 1.5, ui: 3, expressive: 6 }, // the MOST any point may move, px
      wobbleFreq: 0.03, // how quickly the wobble changes along the line (per px)
      boil: { on: false, frames: 3, fps: 8 }, // optional "line boil" animation: off

      // Components. stroke / wobble name a level from above.
      // ends: where the pen starts and stops.
      //   circles: gap centred at 'at' degrees (0 = 3 o'clock, 90 = 6 o'clock), 'size' degrees wide
      //   rectangles: starts at the top-left corner; 'overshoot' px past it (or 'gap' px short)
      topBar: { height: 112 },
      pageDot: { diameter: 40, gap: 24, stroke: "hairline", wobble: "subtle", label: "label", ends: { gap: 12, at: 30 } },
      keyHint: { height: 40, padX: 16, stroke: "hairline", wobble: "subtle", label: "label" },
      frame: { stroke: "ui", wobble: "ui", ends: { overshoot: 8 } },
      poster: { S: [240, 336], M: [400, 560], L: [640, 896], roughness: 6, fibre: 4, angles: [-3, 2, -2] },
      stamp: { S: 32, M: 48, L: 72, stroke: "emphasis", wobble: "ui", angle: -6, padX: 24, padY: 8, ends: { overshoot: 8 } },
      placard: { w: 320, h: 96, stroke: "hairline", wobble: "subtle", ends: { gap: 8 } },
      gridCell: { w: 320, h: 176, gap: 16, stroke: "ui", lockedStroke: "emphasis", wobble: "ui", ends: { overshoot: 8 }, idleAlpha: 0.5, clearedAlpha: 0.25 },
      toast: { w: 960, h: 96, stroke: "ui", wobble: "ui", ends: { overshoot: 8 } }, // short messages ("Saved ...")

      // Screen layout shared by several screens
      screen: {
        slotX: [480, 960, 1440], // the centre of person 01 / 02 / 03's column (marks, figures, posters)
        instructionBaseline: 1000, // the instruction line at the bottom ("Step onto ...")
        welcomeTitle: [256, 384], // baselines of "WELCOME TO" and "MUGSHOT(3)_"
        welcomeBandY: 600, // the middle of the torn red band
        floorMarkY: 856, // the middle of the floor marks
        posterY: 520, // the middle of the WANTED posters
      },
      floorMark: { diameter: 96, stroke: "ui", wobble: "ui", label: "numeral", ends: { gap: 16, at: 30 } },
      badge: { diameter: 56, stroke: "ui", wobble: "subtle", label: "numeral", ends: { gap: 12, at: 30 } },
      band: { h: 320, angle: -2 }, // the torn red band on the welcome screen
      // Chalk body outlines: drawn on, held, faded out, again (a loop)
      chalkFigure: { scale: 0.7, stroke: "ui", wobble: "ui", angles: [-84, 96, -92], drawMs: 4000, holdMs: 3000, fadeMs: 1000, staggerMs: 600 },
      // What's ON a poster: the headline style per poster size, the face photo
      wantedPoster: { headline: { S: "title", M: "headline", L: "hero" }, photoInset: 8 },
      faceCrop: { margin: 0.35, smoothing: 0.25 }, // photo = face box + 35% each side; follows the face smoothly

      // Screen 02, Hands Up: layout and timing
      handsup: {
        headlineBaseline: 304, // "POLICE! HANDS UP!"
        posterX: [216, 520, 824], // the three small posters, in a row at the bottom left
        posterY: 712,
        statusY: 920, // the status label under each poster
        officerX: 1560, // the officer's feet
        officerFeetY: 1000,
        bubbleRight: 1376, // the speech bubble: its right edge and middle
        bubbleY: 424,
        flashes: 3, // red + blue, this many times (each flash: timing.sirenFlashMs)
        wordFrom: 1.6, // "POLICE!" and "HANDS UP!" slam in from 1.6x
        wordGapMs: 250, // "HANDS UP!" comes this long after "POLICE!"
        entranceMs: 1200, // after this, the officer slides in and the hands count
        slideMs: 400, // how long the officer takes to slide in
        slideFrom: 720, // from this far to the right
        freezeMs: 1500, // "FREEZE!" stays this long, then the mugshot
        faceLossMs: 1000, // fewer than 3 faces this long -> back to the posters
        oneHandCooldownMs: 4000, // "Nice try. BOTH hands." at most this often
      },
      // Scene 02a, the police car arriving (all positions on the stage)
      arrival: {
        groundY: 760, // where the wheels touch the ground
        startX: -420, // the car starts here (off screen, left)...
        stopX: 560, // ...and stops here (the left third)
        driveMs: 1400, // how long the drive takes (= its speed: shorter = faster)
        bounce: 6, // how far the body bobs up and down while driving (px)
        bounceWave: 90, // one bob every this many px driven
        joltAngle: 3, // the forward jolt when it stops (degrees, nose down)
        joltMs: 320,
        lightMs: 250, // the light bar swaps red / blue this often
        glow: { radius: 560, alpha: 0.35, pulseMs: 800, fadeInMs: 300 }, // the soft siren glow behind the car
        screechAt: 1000, // the tyre screech starts (before the stop)
        popAt: 1700, // the officer comes out from behind the car (door thud)
        popMs: 400,
        officerX: 940, // where the officer ends up (right of the car)
        headlineAt: 2000, // "POLICE!" slams in
        lineAt: 2300, // the bubble starts typing (and the radio starts)
        bubbleRight: 1824, // (old: the bubble's right edge when it had a fixed size)
        bubbleLeft: 1104, // the speech bubble: its LEFT edge (the tail side, near the officer)...
        bubbleY: 248, // ...and the middle of a one-line bubble
        exitFlashes: 2, // the quick red / blue flash at the end
      },
      car: {
        scale: 1,
        stroke: "ui",
        wobble: "ui",
        wheelRadius: 44,
        ends: { gap: 12, at: 30 }, // for the round parts (wheels, headlight)
        speedLines: { y: [-170, -110, -60], length: [140, 100, 160], gap: 40, stroke: "hairline", wobble: "subtle" },
      },
      ground: { alpha: 0.35, stroke: "hairline", wobble: "subtle" },
      // Scene 05, forgery: the three bandits (see Bandit() in ui/components.js)
      bandit: {
        scale: 1,
        stroke: "ui",
        wobble: "ui",
        ends: { gap: 16, at: 120 }, // for the round parts (head, scissor loops)
        stripe: { first: -118, h: 14, step: 28, count: 4, inset: 4 }, // shirt stripes (hip space, px)
        eyeHole: 12, // the eye holes in the mask
        toolSize: 1.4, // the pencil / scissors in the hand: this size (big, cartoon tools)
        earPencil: 0.6, // bandit 03's pencil behind the ear: this size
        scissorsOpen: 40, // scissors fully open: the angle between the blades (degrees)
        edge: 3, // a thin black edge around every line (px), so they show on white paper
      },
      // Scene 02b, hands up on the live camera. The camera sits exactly where
      // the mugshot's does (tokens.mugshot.view), so 02b -> 03 is seamless.
      handsupLive: {
        headlineBaselines: [272, 352], // "HANDS" / "UP!", stacked in the left margin
        wordGapMs: 250, // "UP!" slams in this long after "HANDS"
        pillAbove: 24, // the status pill sits this far above the top of the head
        torsoBelow: 1.1, // the SURRENDERED stamp: this many face heights below the chin
        stampInset: 192, // keep the stamp's middle this far inside the camera picture
        officerX: 1768, // the officer peeks up from the bottom-right corner
        officerFeetY: 1208, // (his feet are below the screen edge)
        officerScale: 0.6,
        bubbleRight: 1560, // the speech bubble, left of his megaphone
        bubbleY: 984,
        readyBaseline: 1000, // "x / 3 ready", under the camera (left)
        freezeMs: 1500, // "FREEZE!" stays this long, then the mugshot
        faceLossMs: 2000, // fewer than 3 faces this long -> back to the WANTED posters
        oneHandCooldownMs: 4000, // "Nice try. BOTH hands." at most this often
        // The debug view (D) in the left margin: raw / debounced / latched per person
        debug: { y: 456, blockH: 112, lineH: 20, stripH: 12, sampleW: 2 },
      },
      // Screen 04, evidence: the features x people grid (LAYOUT only; all the
      // times are in CONFIG.ui.timing.evidence)
      evidence: {
        titleBaselines: [296, 416], // "ANALYZING" / "EVIDENCE…_" (hero), in the left margin
        captionBaseline: 528, // "COMPARING EYES…", "IDENTIFYING BASE FACE…", "EVIDENCE COMPLETE." (lead)
        baseBaseline: 600, // "BASE FACE: SUSPECT 0X" (lead, in that suspect's colour), phase 2
        grid: { x: 800, y: 216 }, // the top-left of the first cell (cells: tokens.gridCell)
        rows: ["eyes", "nose", "ears", "lips"], // top to bottom, in spinning order (the line joins them in this order)
        cellPad: 16, // room around the feature photo inside a cell
        stampInset: { x: 96, y: 40 }, // the MATCH stamp's middle: this far in from the cell's bottom-right corner
        pixelBlocks: [24, 12, 6, 3], // pixelated photo: block sizes in px, from "can only guess" to almost sharp
        idle: 0.6, // photos that aren't highlighted: this see-through
        cleared: 0.25, // the two cells that DIDN'T match, after the lock: this see-through + "CLEARED"
        spotlightDim: 0.25, // the rows that aren't being analysed: this bright
        lockShake: [0, 4, 8, 14], // px: each row's lock shakes the screen a little harder than the one before
        headerStampY: -48, // the BASE stamp: this far above the column header's middle
        spotlightLeft: 128, // the dimming also covers this much left of the grid (the row labels), not the title
      },
      // Sound: the "CLICK TO START" overlay, the SOUND OFF label, the sound test buttons
      startOverlay: { w: 960, h: 320, backdrop: 0.85, stroke: "emphasis", wobble: "ui", ends: { overshoot: 8 } },
      soundOff: { y: 144 }, // the SOUND OFF label (right-aligned to the margin), under the top bar
      soundButton: { w: 288, h: 80, gap: 24, stroke: "hairline", wobble: "subtle", ends: { gap: 8 } },
      // Screen 06: the print status in the right column of the case file
      printStatus: {
        y: 800, // its top on the stage (x: the case file's column; the words wrap to the column)
        printer: { w: 112, h: 56, feedW: 72, feedH: 20 }, // the doodle printer icon
        sheet: { w: 64, h: 80, loopMs: 1400 }, // the sheet sliding out (looping)
        check: 72, // the circle around the check mark
        textGap: 32, // between the icon and the words
        text: "lead",
        stroke: "ui",
        wobble: "ui",
        ends: { overshoot: 8 },
      },
      // Scene 05, forgery: a short comic interlude with the three bandits
      // (ms from the start of the scene; the total is timing.forgeryMs)
      forgery: {
        captionBaseline: 200, // "Meanwhile, in the back room…" (mono, typed)
        floorY: 820, // the ground line they all stand on
        size: 0.8, // all three the same size
        spots: [600, 960, 1320], // where bandit 01 / 02 / 03 stop: a row across the middle, evenly spaced
        enterAt: 400, // they tiptoe in from the right, in single file...
        enterGapMs: 180, // ...one behind the other (01 first)...
        walkMs: 1000, // ...each walk takes this long
        startX: 2120, // (off screen, right)
        stepMs: 150, // one tiptoe step (the two tiptoe poses swap)
        stepOffsets: [0, 0.45, 0.8], // each bandit a little out of step (fraction of a step)
        bob: 10, // how far they bob up and down while tiptoeing (px)
        actionAt: 1800, // each does their thing in place...
        actionGapMs: 150, // ...starting a little after the one before...
        actionMs: 1500, // ...for this long
        scribble: { angle: 18, perSecond: 6, soundMs: 700 }, // bandit 01: the pencil scribbles in the air
        snips: 4, // bandit 02: this many snips
        look: { turnMs: 350, nodAngle: 10, nods: 2 }, // bandit 03: looks left, right, left, then nods
        runAt: 3600, // they turn and run off to the left, in single file...
        runGapMs: 80, // ...01 first
        runMs: 500,
        runToX: -400,
      },
      // Screen 06, case file: the poster on the left (the result draws on
      // here); the case details go in the right column (milestone 7)
      casefile: {
        // THE REVEAL (before the layout; times in CONFIG.ui.timing.reveal), on black:
        //   "CASE NO. 0002" (headline) types in the middle, then moves up to caseNoTop;
        //   the composite draws on in 'picture' (centre x, top, height; 4:5);
        //   "EARS — SUSPECT 02" (lead, person colour) under it, one per piece
        reveal: { caseNoMiddle: 560, caseNoTop: 184, picture: { cx: 960, top: 224, h: 624 }, captionBaseline: 928 },
        // Left: the big torn WANTED poster (size L, tokens.poster.L) with the composite in it
        poster: { cx: 560, cy: 592, angle: -2 },
        // Right column (starts at grid column 7)
        columnX: 7,
        titleBaseline: 224, // "MUGSHOT(3)" (headline)
        numberBaseline: 280, // "NO. 0002" (numeral, mono)
        marker: { cx: 1760, cy: 220, w: 104, h: 120 }, // the evidence marker "3"
        recipe: { y: 376, step: 64, rule: 16 }, // "base face   person/ 03" rows: first baseline, row step, rule under the text
        statusBaseline: 728, // "Status:" + the AT LARGE stamp
        stampGap: 56, // between "Status:" and the stamp (room for its tilt and slam)
        // The goodbye: the officer peeks in from the corner (like in 02b), then -> welcome
        goodbye: { showMs: 3000, slideMs: 400, slideFrom: 360, officerX: 1768, officerFeetY: 1208, scale: 0.6, bubbleRight: 1560, bubbleY: 984 },
      },
      evidenceMarker: { stroke: "ui", wobble: "ui", number: "title" }, // the forensic tent marker (case file)
      // The doodle circle around a raised hand (02b): outline = raised, filled = open palm
      handMarker: { diameter: 128, stroke: "ui", wobble: "ui", ends: { gap: 16, at: 30 }, fillAlpha: 0.35 },
      officer: { scale: 1, stroke: "ui", wobble: "ui", ends: { gap: 16, at: 120 }, waveMs: 150 },
      // The speech bubble fits its words: widest line + padX each side, lines + padY top and bottom.
      // Longer than maxW: the words wrap and the box gets taller. minW: room for the tail.
      bubble: { maxW: 720, minW: 256, padX: 32, padY: 24, stroke: "ui", wobble: "ui", ends: { overshoot: 8 }, text: "lead" },
      statusLabel: { w: 240, h: 40, stroke: "hairline", wobble: "subtle", label: "label" },

      // Screen 03, Mugshot: layout and timing
      mugshot: {
        view: { w: 1280, h: 720, y: 176 }, // the camera picture (16:9), centred left-right
        lookMs: 1500, // "Look at the camera." before the countdown
        countdownMs: 3000, // 3 - 2 - 1
        captureGraceMs: 1500, // after 1: keep trying this long to see exactly 3 faces
        flashMs: 400, // the white flash fades out in this time
        afterMs: 900, // after the flash, then on to the evidence
        // Height chart lines over the picture (decorative, like a police lineup wall)
        heightChart: { labels: [190, 180, 170, 160, 150], top: 0.12, step: 0.17, alpha: 0.35, stroke: "hairline", wobble: "subtle" },
      },
      countdown: { diameter: 320, stroke: "emphasis", wobble: "ui", ends: { gap: 16, at: 30 }, digit: "shout", backdrop: 0.6 },
      timing: { stampSlamMs: 120, stampFadeMs: 200, cursorBlinkMs: 530, pulseMs: 2000 },
    },
    // Google Fonts, loaded in index.html. Swap for the exact Figma fonts later.
    fonts: { display: "Anton", mono: "JetBrains Mono", body: "Inter", code: "Fira Code" }, // body + lead type styles use "code"
    doodle: { weight: 6, wobble: 3 }, // UI line, thinner than the collage line
    torn: { roughness: 6 }, // how ragged the torn paper edges are
    timing: {
      stableMs: 1000, // 3 faces must be steady this long before the police come
      noFaceResetMs: 5000, // no faces this long -> back to the welcome screen
      sirenFlashMs: 150, // one red / blue siren flash
      typewriterMs: 30, // speech bubble: time per letter
      // Screen 04, evidence (~15 s). All in ms. Layout: tokens.evidence.
      evidence: {
        // Phase 0: collecting evidence. The title types, the grid draws on cell
        // by cell, the photos fade in PIXELATED.
        collectMs: 1500,
        cellDrawMs: 280, // one cell's frame draws on in this time...
        cellGapMs: 80, // ...the next cell starts this much later
        cropFadeMs: 300, // a cell's pixelated photo fades in
        // Phase 1: one row at a time (eyes, nose, ears, lips). Each row lasts
        // rowMs: the highlight spins, LOCKS, then holds (lockHoldMs) before the
        // next row. The holds get longer: each lock more dramatic.
        rowMs: [2100, 2200, 2300, 3200],
        lockHoldMs: [600, 700, 800, 1200],
        spinSteps: [10, 11, 12, 14], // how many times the highlight jumps per row
        easePower: 3, // how much the spin slows down at the end
        nearMissChance: 0.5, // share of rows with a near-miss (from the round's seed); the last row always has one
        hesitateMs: 300, // near-miss: stops on the wrong cell this long...
        nudgeMs: 180, // ...then nudges one step to the real one, and locks this much later
        sharpenMs: 400, // the matched photo: pixelated -> sharp
        clearFadeMs: 300, // the other two fade out and get "CLEARED"
        spotlightFadeMs: 250, // rows dimming / brightening
        shakeMs: 250, // the lock shake (sizes: tokens.evidence.lockShake)
        // Phase 2: base face. The column headers spin like a row, then lock.
        baseMs: 2500,
        baseSpinMs: 1500, // the header lock comes this long after phase 2 starts
        baseSteps: 9,
        // Phase 3: evidence complete. All rows bright, the line draws on.
        completeMs: 1500,
        lineMs: 600,
      },
      // Screen 06: the case file reveal (~9 s before printing), all in ms
      reveal: {
        darkMs: 300, // black, then "CASE NO. 0002" types in the middle...
        caseNoMs: 1000, // ...and stays this long...
        moveMs: 300, // ...then moves up while the drawing starts
        lineMs: 3000, // the doodle head draws on, slowly (with the pencil sound)
        dropGapMs: 800, // the pieces drop on one by one (ears, lips, nose, eyes), this far apart
        dropMs: 250, // one piece landing
        fadeMs: 300, // the owner marks + caption fade in
        pauseMs: 600, // a short pause...
        flashMs: 400, // ...a camera flash (white-out, fading), and the full case file + AT LARGE
        printDelayMs: 800, // then printing starts
      },
      casefileMs: 20000, // the case file stays this long, then back to the start (longer after printing: print.collectMs)
      arrivalMs: 5000, // scene 02a: the police car arrives, then the live camera (02b)
      forgeryMs: 4300, // scene 05: the bandits' comic interlude, then the case file
    },
  },

  // The cartoon police officer on the Hands Up screen
  // ---------------------------------------------------------------
  // SOUND (sound.js). Every sound has a file in assets/sfx/. If the file is
  // missing (or can't be decoded), its synthFallback plays instead: a
  // sound made from scratch in sound.js (SYNTHS). So nothing ever breaks.
  // To use a real recording: put it in assets/sfx/ with the name below
  // (or change 'file'), reload. That's all.
  sound: {
    master: 0.8, // overall volume, 0 – 1 (U = mute / unmute)
    startOverlay: true, // "CLICK TO START" when the browser blocks sound (not shown when Chrome allows autoplay)
    sounds: {
      // name:     { file (in assets/sfx/),            volume, synthFallback (a SYNTHS name) }
      ambience: { file: "assets/sfx/ambience.mp3", volume: 0.15, synthFallback: "ambience" }, // 00, very quiet city (off: see ambienceOn)
      click: { file: "assets/sfx/click.mp3", volume: 0.5, synthFallback: "click" }, // 01, a poster fills with a face
      siren: { file: "assets/sfx/siren.mp3", volume: 0.35, synthFallback: "siren" }, // 02a, the car drives in
      screech: { file: "assets/sfx/screech.mp3", volume: 0.5, synthFallback: "screech" }, // 02a, the car stops
      handsup: { file: "assets/sfx/handsup.mp3", volume: 0.9, synthFallback: "megaphone" }, // 02a, "POLICE! hands up"
      thud: { file: "assets/sfx/thud.mp3", volume: 0.8, synthFallback: "thud" }, // 02a, the car door
      radio: { file: "assets/sfx/police_radio_lost_patrol.mp3", volume: 0.6, synthFallback: "static" }, // 02a -> 02b, the police radio voice
      static: { file: "assets/sfx/static.mp3", volume: 0.4, synthFallback: "static" }, // 02b, a walkie-talkie burst before each line
      stamp: { file: "assets/sfx/stamp.mp3", volume: 0.8, synthFallback: "thud" }, // 02b SURRENDERED, 06 AT LARGE
      blip: { file: "assets/sfx/blip.mp3", volume: 0.5, synthFallback: "blip" }, // 02b FREEZE!, 06 goodbye
      beep: { file: "assets/sfx/beep.mp3", volume: 0.5, synthFallback: "beep" }, // 03, countdown 3 and 2
      beepHigh: { file: "assets/sfx/beep_high.mp3", volume: 0.5, synthFallback: "beepHigh" }, // 03, countdown 1
      shutter: { file: "assets/sfx/shutter.mp3", volume: 0.7, synthFallback: "shutter" }, // 03, the photo + flash
      evidence: { file: "assets/sfx/evidence_beeps_success.mp3", volume: 0.8, synthFallback: "evidenceTicks" }, // 04, played in segments (evidenceSegments)
      tick: { file: "assets/sfx/tick.mp3", volume: 0.5, synthFallback: "tick" }, // 04: one per highlight jump, only when the evidence file is missing
      tiptoe: { file: "assets/sfx/tiptoe.mp3", volume: 0.5, synthFallback: "pluck" }, // 05, one per step
      pencil: { file: "assets/sfx/pencil.mp3", volume: 0.5, synthFallback: "scratch" }, // 05, bandit 01 scribbles
      scissors: { file: "assets/sfx/scissors.mp3", volume: 0.5, synthFallback: "snip" }, // 05, a double snip
      paste: { file: "assets/sfx/paste.mp3", volume: 0.6, synthFallback: "pat" }, // 06 reveal, a piece lands
      whoosh: { file: "assets/sfx/whoosh.mp3", volume: 0.5, synthFallback: "whoosh" }, // 05, the bandits run off
    },
    ambienceOn: false, // 00: play the quiet city ambience on the welcome screen
    // 02a: which part of handsup.mp3 to play (seconds; end: null = to the end), with a short fade-out
    handsupClip: { start: 0, end: null, fadeMs: 150 },
    // 02a -> 02b: the police radio (sounds.radio). Its volume there (0.6) = "60%".
    radio: {
      afterHandsupMs: 300, // starts this long after handsup.mp3 ends
      duckTo: 0.5, // while a speech bubble types: half its volume (0.6 x 0.5 = 30%)...
      duckMs: 200, // ...turning down / up again over this long
      quietIn02b: 0.5, // in 02b it stays quiet (the same 30%)...
      fadeAfterMs: 8000, // ...and fades out this long after 02b starts...
      fadeMs: 1500, // ...over this long. FREEZE! stops it (if still playing).
    },
    staticBeforeLineMs: 250, // 02b: a walkie-talkie burst this long, then the new line types
    // 04: evidence_beeps_success.mp3 is cut into SEGMENTS (in seconds)
    // and played in pieces, cued by the screen (screens/evidence.js).
    evidenceSegments: {
      spin: { start: 0.0, end: 2.2 }, // A: LOOPED while a row (or the base face) spins
      lock: { start: 4.9, end: 5.3 }, // D: at every lock (with the stamp thud)
      final: { start: 5.5, end: 6.0 }, // E: "EVIDENCE COMPLETE."
      rateFrom: 1.0, // the spin loop's speed (and pitch) on the first row...
      rateTo: 1.15, // ...rising row by row to this on the last row and the base face
      lockVolumes: [0.7, 0.8, 0.9, 1.0, 1.0], // each lock a little louder (eyes, nose, ears, lips, base)
    },
  },

  // The printed case file (screen 06), on US Letter paper. It prints by
  // itself once the reveal has finished, once per photo. See print.js, and
  // the README for how to print without a dialog (Chrome --kiosk --kiosk-printing).
  // The layout matches assets/reference/print_layout.png.
  print: {
    auto: true, // false = never print (testing without a printer): the status shows "PRINT OFF"
    // 'server' = print with NO dialog on the Mac's default printer, through server.py,
    // with the paper / colour settings in CONFIG.printer (it also keeps a copy in
    // the prints/ folder). 'browser' = window.print() (the dialog).
    method: "server",
    printingMs: 4000, // "PRINTING YOUR CASE FILE…" shows this long, then "Collect your case file…"
    collectMs: 15000, // after printing, the screen waits at least this long before going back to the start
    paper: "Letter", // US Letter portrait, 8.5 x 11 in (sizes: PAPER_SIZES in print.js)
    dpi: 300, // 8.5 x 11 in at 300 dpi = 2550 x 3300 px
    fillNumber: true, // true = this round's case number on the "MUGSHOT N0." line; false = blank, to write by hand
    archive: true, // 'browser' method only: also save a PNG copy (to the download folder). ('server' always keeps one in prints/)
    filePrefix: "mugshot3_case_", // e.g. mugshot3_case_0002_2026-11-12_14-03-22.png
    paperColor: "#FFFFFF", // white paper
    inkColor: "#000000", // black text and rules (the doodle line keeps its warm grey: CONFIG.doodle.line.color)
    // THE LAYOUT, in POINTS on a 612 x 792 page (1 pt = 1/72 in, the size of
    // the reference image). print.js multiplies everything by dpi / 72.
    layout: {
      left: 24, // the left edge of everything
      right: 588, // the right edge of the rules and right-aligned text
      // Header (top left, JetBrains Mono)
      course: { text: "intro_to_programming", size: 9, baseline: 35 }, // bold
      tag: { text: "{IDP2026}", size: 9, baseline: 47 }, // regular
      number: { text: "MUGSHOT N0.", size: 8, baseline: 72, lineLength: 48, lineWeight: 0.75, gap: 2 }, // + a line to write on
      // Header (top right, display font)
      title: { text: "/ MUGSHOT(3) /", size: 20, baseline: 45 },
      topRule: { y: 90, weight: 3 },
      // The height chart: "200" rule at the top, "100" rule at the bottom, numbers in between
      chart: {
        top: 117, // the "200" rule
        bottom: 697, // the "100" rule (the neck lines stand on it)
        ruleEnd: 550, // the rules run from 'left' to here
        ruleWeight: 1.5,
        labels: [200, 190, 180, 170, 160, 150, 140, 130, 120, 110, 100], // evenly spaced, top to bottom
        majorSize: 11, // "200" and "100", bold
        minorSize: 9, // the others, regular
      },
      // The composite: centred between 'left' and chart.ruleEnd, hair top
      // at about 'top', the neck lines ending exactly on the "100" rule
      composite: { top: 150 },
      bottomRule: { y: 720, weight: 3 },
      // Footer: three "(1) NAME : ____" blocks, bold mono, lines to write on
      names: { baseline: 758, size: 8, x: [47, 228, 410], lineLength: 95, lineWeight: 0.75 },
    },
  },

  // Scene 05, forgery: which bandit holds what (slot 0/1/2 = person 01/02/03)
  //   "pencil"   draws the head            "scissors" cuts out the pieces
  //   "both"     scissors in hand, a pencil behind the ear, and does the pasting
  forgery: {
    tools: ["pencil", "scissors", "both"],
  },

  police: {
    car: { showText: false }, // true = "POLICE" on the car door (scene 02a)
    voice: "text", // 'text' (speech bubbles only) | 'speech' (read aloud) | 'files' (recorded mp3s)
    lines: {
      start: "Hands where I can see them!",
      oneHand: "Nice try. BOTH hands.",
      nameOne: "Both hands, suspect {n}!", // {n} becomes the person number, e.g. 02
      t8: "Don't make me ask twice.",
      t12: "We have you surrounded… by a camera.",
      t20: "Last warning!",
      freeze: "FREEZE! Don't move.",
      goodbye: "You're free to go… for now.",
    },
    escalateAtMs: [0, 4000, 8000, 12000, 20000], // when the next line comes
  },

  // Printing (run `python3 server.py` instead of `python3 -m http.server 8000`).
  // Uses your printer's defaults except bordered Postcard size and black & white in `lp`.
  // Used for BOTH prints: the story's case file (print.js, CONFIG.print) and the
  // classic booth's collage (printer.js, key P).
  printer: {
    autoPrint: false, // false = print only when you press P (true = auto-print when collage is ready)
    name: "", // macOS printer name (empty = default printer)
    media: "Postcard", // bordered 100x148 mm postcard (e.g. 'Postcard', 'Postcard.Fullbleed', 'A4')
    mediaType: "", // empty = printer default
    duplex: "", // empty = printer default (or 'None' for 1-sided)
    quality: "", // empty = printer default
    colorMode: "Gray", // 'Gray' = black & white in macOS lp (PNG stays in colour), '' = printer default
    fitToPage: true, // scale the 1600x2000 collage to fit inside the postcard without cropping
    saveCopy: true, // also save each printed PNG into face-mesh-up/prints/ (saved in colour)
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
