# MUGSHOT(3) — Face Mesh-up Booth (p5.js + ml5.js)

A browser photo booth for three people that mixes their faces into one halftone collage.

## How to run

The camera only works when the page is served from a web address, not opened as a file.

```bash
cd face-mesh-up
python3 server.py
```

Then open **http://localhost:8000** in Chrome and allow the camera.

`server.py` serves the page like `python3 -m http.server 8000`, but it stops the browser from keeping old copies of the files (with the plain server, after a change the browser can mix old and new `.js` files, and a screen breaks), and it receives the pictures to print, so it can print silently to your macOS printer without a dialog.

You can also paste the files into the p5.js web editor (https://editor.p5js.org): copy each `.js` file into a file with the same name and use this `index.html` (silent printing needs `server.py`).

### Setting up your EPSON ET-4850 Series printer (100×148 mm postcard paper)

1. Connect the printer to your Mac and add it in **System Settings → Printers & Scanners**, then set it as your **Default printer** (`EPSON_ET_4850_Series`).
2. Even though macOS System Settings doesn't let you set Postcard as the system default, `config.js` leaves all other printer settings at your printer's defaults and only sets:
   - `media: 'Postcard'` (bordered 100×148 mm postcard)
   - `colorMode: 'Gray'` (prints in black & white via macOS `lp`, while saving the PNG in `prints/` in full colour)
3. Press `P` on the collage screen to print (keeps a copy in `face-mesh-up/prints/`). Set `CONFIG.printer.autoPrint: true` in `config.js` if you want it to print automatically right after the slot machine finishes.

## Printing the case file (the installation)

At the end of every round the case file prints by itself, in **black and white on a 100 × 148 mm postcard** (the page is drawn in the US Letter layout, 8.5 x 11 in, and scaled down to fit; `print.js`, layout in `CONFIG.print.layout`, matching `assets/reference/print_layout.png`). The page: a header, a height chart with this round's composite standing in it (neck lines on the "100" rule), and three lines for the visitors to write their names on. It prints just after the AT LARGE stamp on the case-file screen, once per photo. `CONFIG.print.auto = false` switches printing off for testing (the screen shows "PRINT OFF"). `Shift+P` prints the case file again by hand.

**No dialog, no clicks.** A web page can't print by itself without the print dialog, so the page sends the finished picture to the local server (`server.py`, address `/print`). The server saves it in the **`prints/` folder** (the archive, e.g. `prints/mugshot3_case_0002_2026-11-12_14-03-22.png`) and prints it with macOS's own print command (`lp`) on the **default printer**, with the settings in **`CONFIG.printer`** (the same ones the classic booth's `P` key uses, see "Setting up your EPSON" above): Postcard paper, black and white, scaled to fit. So: **always start the app with `python3 server.py`** (with another web server it falls back to the browser's print dialog). The terminal shows a line for every print.

**Set up the printer once (macOS):** see "Setting up your EPSON ET-4850 Series printer" above. To test without printing, set `CONFIG.print.auto = false` (the case file then doesn't print; the screen shows "PRINT OFF").

The `prints/` folder holds visitors' faces: it's left out of git (`.gitignore`).

**Chrome for the installation** (full screen, sound without a click; Terminal, one line):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --user-data-dir="$HOME/mugshot3-chrome" --kiosk --autoplay-policy=no-user-gesture-required http://localhost:8000/
```

- `--kiosk`: full screen, no browser bars (quit with Cmd+Q).
- `--autoplay-policy=no-user-gesture-required`: sounds play without anyone pressing a key first.
- `--user-data-dir=…`: a separate Chrome profile just for the booth, so these flags always apply (even if your normal Chrome is open) and its settings (camera permission) are kept between runs.
- (`CONFIG.print.method = "browser"` switches back to the old way, `window.print()`; then add `--kiosk-printing` to skip its dialog.)

## Sound

All sounds go through one sound manager (`sound.js`), set up in `CONFIG.sound`: the master volume, and for every sound its file (in `assets/sfx/`), its volume, and a synthesised fallback. **If a file is missing, the synth version plays**, so nothing breaks. Right now the real recordings are `police_radio_lost_patrol.mp3` and `evidence_beeps_success.mp3`; everything else (including `handsup.mp3`, until you add it) is synthesised.

- **Replace a synth sound with a recording:** put the file in `assets/sfx/` under the name in `CONFIG.sound.sounds` (e.g. `shutter.mp3`), reload. The browser console lists which sounds are files and which are synth.
- **Test every sound:** style guide (`G`) page 10, "SOUND TEST": a button per sound (it says whether the file or the synth plays), master volume, mute, and "evidence + grid".
- `U` = mute / unmute (a small "SOUND OFF" label shows while muted).
- Browsers block sound until the first click or key press. The app then shows **"CLICK TO START"** once. With the Chrome command below (`--autoplay-policy=no-user-gesture-required`) sound is allowed straight away, and the overlay never shows.

## MUGSHOT(3) screens

The app opens on the MUGSHOT(3) story: seven screens, `00 welcome` → `01 wanted` → `02 arrival + handsup` → `03 mugshot` → `04 evidence` → `05 forgery` → `06 casefile` (see `mugshot-ui-brief.md`). They are being built one milestone at a time; empty screens show a placeholder.

- **00 welcome**: the crime scene (title, torn red band with chalk outlines, floor marks 01–03). Moves on to `wanted` as soon as a face is found.
- **01 wanted**: three WANTED posters (01 yellow, 02 blue, 03 red) fill with the live faces of whoever stands on each mark, each with a booking number for the round. Moves on to `arrival` (02a) when exactly 3 faces are steady for 1 s; back to `welcome` after 5 s without faces.
- **02a arrival** (page dot 02): no camera. A doodle police car drives in from the left (wheels turning, bouncing, speed lines), stops with a jolt, the light bar flashes red / blue with a glow behind it, the officer pops out from behind the car, "POLICE!" slams in and he says "Hands where I can see them!". Sounds: siren, tyre screech, door thud, then the police radio (`assets/sounds/police_radio_lost_patrol.mp3`; synthesised static if it's missing). The hand models start loading here. After 5 s (`ui.timing.arrivalMs`) → 02b. `SPACE` = skip. **Testing:** `?screen=arrival&t=700` freezes the scene at 700 ms, to look at one moment of the animation.
- **02b handsup** (page dot 02): the live camera in a white doodle frame (exactly where the mugshot camera is, so 02b → 03 is one continuous shot), "HANDS / UP!" in the top-left margin. For each person, following their face: a status pill above the head (`HANDS UP 0/2 · 1/2 · 2/2`, in their colour), a doodle circle around each raised hand (outline = arm up, filled = open palm), and at 2/2 a SURRENDERED stamp on their chest. The officer peeks up from the bottom-right corner and talks in a speech bubble (stricter every few seconds); `x / 3 ready` under the camera. Against flicker, each hand is debounced (`CONFIG.gesture.upConfirmMs` / `downGraceMs`), and someone who holds 2/2 for 0.4 s is locked as surrendered for the round (`2/2 ✓`; `CONFIG.gesture.latch`). All 3 locked → "FREEZE! Don't move." → mugshot. Fewer than 3 faces for 2 s → back to `wanted`. With `D`: raw / debounced / locked per person in the left margin. On this screen: `SPACE` / `ENTER` = skip to the mugshot, `H` = pretend everyone has their hands up. Layout and timings: `ui.tokens.handsupLive`.
- **03 mugshot**: the live camera in a doodle frame with height lines, and a black placard (booking number + today's date, in the person's colour) under each face. "Look at the camera." → 3-2-1 → white flash → the photo is taken (the same capture as the classic booth: frame + faces + recipe + doodle collage) → `evidence`. If there aren't exactly 3 faces when the countdown ends, it keeps trying for 1.5 s, then goes back to `wanted`. `SPACE` = take the photo now. **Testing alone:** with `H` (demo hands up) on, missing people are filled with copies of the faces it sees.
- **04 evidence** (~15 s, built for suspense; times in `ui.timing.evidence`): "ANALYZING EVIDENCE…" types in, the grid (rows eyes / nose / ears / lips, columns suspect 01 / 02 / 03) draws on, and every cell gets that suspect's feature from the mugshot photo, **pixelated**. Then one row at a time, in a spotlight: the highlight spins, slows down (sometimes a **near-miss**: it stops one cell too early, hesitates, then nudges on) and locks: the match sharpens, MATCH slams on, the other two are CLEARED. Then the column headers spin the same way to pick the **base face**, and finally a white line joins the matches: "EVIDENCE COMPLETE." → `forgery`. Sound: segments of `evidence_beeps_success.mp3` (`sound.evidenceSegments`), on the sound engine's clock. `SPACE` = jump to the end (again = move on). **Testing:** `?screen=evidence&t=9000` freezes it; opened without a mugshot it takes a test photo from the camera (no camera: "?").
- **05 forgery**: a short comic interlude, "Meanwhile, in the back room…": three cartoon bandits (stripes in the person colours) tiptoe in from the right in single file, stop in a row, each does their thing (01 scribbles with a pencil, 02 snips scissors, 03 looks around and nods), and run off to the left → `casefile`. ~4.3 s (`ui.timing.forgeryMs`, steps in `ui.tokens.forgery`). `SPACE` = skip. Sounds are synthesised; real files can go in `assets/sounds/` (names in `ui.sound.files`). **Testing:** `?screen=forgery&t=2400` freezes the scene.
- **06 casefile**: first **the reveal** (~8 s, on black; times in `ui.timing.reveal`): "CASE NO. 0002" types in, the doodle head draws on slowly (pencil sound), the cut-out pieces drop on one by one, 0.8 s apart (snip + pat), each with a caption like "EARS — SUSPECT 02" in that suspect's colour; then a camera flash and the full case file: the big torn WANTED poster with the composite on the left; on the right "MUGSHOT(3)" + case number, an evidence marker "3", who gave what (a rule in each person's colour), and "Status:" with an AT LARGE stamp. Then the case file **prints by itself** (once per photo; the console logs the time from the photo to the print): "PRINTING YOUR CASE FILE…", then "Collect your case file from the printer" ✓. After 20 s (never sooner than 15 s after printing) the officer peeks in: "You're free to go… for now." → `welcome`. `SPACE` = skip the reveal (again = back to the start), `S` = save the composite as a PNG.

| Key | What it does |
|---|---|
| `→` / `>>>` (top right) | Next screen |
| `←` | Previous screen |
| `G` | **Style guide**: page 1 = every token (colours, type, strokes, wobble, spacing) and the basic components; `G` again = page 2, the screen components (posters, floor marks, chalk figures); page 3 = the Hands Up components (officer, speech bubble, status labels); page 4 = the Mugshot components (camera view, height chart, placards, countdown); page 5 = the Arrival components (police car, glow); page 6 = scene 02b (hand markers, pills, stamps, the small officer); page 7 = the forgery bandits (every bandit in every pose, pencil, scissors); page 8 = the print status and a preview of the Letter print (`O` lays the reference layout over it at 50%, or `?overlay=1`); page 9 = the case-file components (torn poster, evidence marker, recipe rows, AT LARGE stamp). `?screen=styleguide&page=3` opens a page directly |
| `A` | Auto-advance on / off. Off = the story stays on the current screen even when faces come and go (for testing one screen). `?auto=0` starts with it off |
| `D` | Debug overlay: a thin red perfect shape at the exact token size over every component; page-dot measurements in the browser console |
| `TAB` | Switch to the **classic booth** (the booth as it was before MUGSHOT(3), keys below) and back |
| `F` | Full screen |

To open one screen directly, add it to the address: `http://localhost:8000/?screen=handsup`. The default first screen is `ui.startScreen` in `config.js`.

## Keys in the classic booth

| Key | What it does |
|---|---|
| *Raise both hands* | When all 3 people hold up both hands with open palms for 0.4 s, a 3-2-1 countdown starts and then the photo is taken. |
| `SPACE` | During the slot machine: skip to the collage. Otherwise: take the photo straight away and build the collage (only works with exactly 3 faces). Press again to go back to live. |
| `M` | Mode: switch between `halftone` (Experiment A) and `doodle` (Experiment B). Works on the same photo, so you can compare. |
| `T` | Doodle mode: hair style (`random` → `spikes` → `loops` → `flat` → `none`) |
| `R` | Remix: same photo, new recipe (the slot machine spins again) |
| `P` | Print the collage to the macOS printer |
| `S` | Save the collage as a PNG (1600×2000) |
| `V` | Switch between the collage and the photo it was made from |
| `[` `]` | Halftone cell size smaller / bigger |
| `-` `=` | Halftone dot size smaller / bigger |
| `C` | Cut style. Halftone mode: `rect` (paper strip) or `shape` (cut along the feature). Doodle mode: `scissor` → `smooth` → `rect` |
| `L` `K` | Doodle mode: looseness up / down (how far stickers move and turn, 0 – 1.5) |
| `X` `Z` | Doodle mode: exaggeration up / down (how big or small stickers get, 0 – 1.5) |
| `A` | Doodle mode: play the drawing animation again |
| `O` | Doodle mode: owner mark: `none` (the default), coloured `dot`, or `tape` |
| `B` | Doodle mode: white sticker border on / off (off by default: plain scissor-cut paper) |
| `N` | Doodle mode: nose as a photo `piece`, a drawn `line`, or `both` |
| `H` | Live screen: demo "everyone has their hands up" on / off (to test alone). Collage screen: halftone pieces on / off |
| `G` | Hands-up gesture detection on / off (debug). When off, the pose and gesture models don't run and only `SPACE` takes the photo. Also cancels a running countdown. |
| `D` | Show or hide the debug overlay (landmarks and info panel) |
| `F` | Full screen on or off |

Tweaks made with the keys are lost on refresh. When you like a value, copy it into `config.js`.

## Files

| File | What's in it |
|---|---|
| `index.html` | Loads the libraries and our scripts |
| `config.js` | Colours, sizes and timings you can tweak |
| `faces.js` | Face detection in 3 zones (one per floor mark), sorting faces left to right, copying face data |
| `features.js` | Where each feature (eyes, nose, ears, lips) is on a face, its key spots that must stay visible, and the tilt / size maths |
| `halftone.js` | `makeHalftone()`: turns a picture into dots. Also the grayscale filter for the pieces |
| `pieces.js` | `cutPhoto()` (used by both experiments) and `makePiece()`: builds one finished piece in its own canvas (grayscale photo, colour block, paper border, shadow) |
| `collage.js` | `makeRecipe()` and `composeCollage()`: plans the pieces, keeps the nose below the eyes, pastes the pieces (ears → lips → nose → eyes) |
| `doodle.js` | Experiment B: turns the base face's landmarks into lines (head, neck, nose) and draws them |
| `pen.js` | Experiment B: makes any line look hand-drawn (smooth, resample, gap / overshoot, wobble, uneven thickness) |
| `hair.js` | Experiment B: the hair styles drawn on top of the head |
| `layout.js` | Loose placement helpers (shared): random push / turn / size from a table, the "no mirrored pairs" check, the "don't cover a pupil, lip line or nostrils" check, keeping pieces on the page |
| `diecut.js` | Experiment B: `makeSticker()`: cuts a feature from the photo in natural colour, as a scissor / smooth / rect shape, with a white sticker edge and a shadow |
| `owners.js` | Experiment B: who gave what: owner dots / tape that stay off key spots, and the handwritten caption |
| `doodleAnim.js` | Experiment B: plays the doodle as an animation: the line is traced, the stickers drop on, then the marks and caption fade in |
| `collageDoodle.js` | Experiment B: `composeDoodle()`: places the base head on a white page and draws the doodle |
| `slot.js` | The slot machine after the photo: a grid of everyone's features (rows) per person (columns); each row spins and stops on the person in the recipe, then all the picks blink together like a jackpot |
| `gesture.js` | The hands-up shutter: MediaPipe PoseLandmarker (arms raised?) + GestureRecognizer (open palm?), matched to person 01/02/03 by position |
| `ui/doodleLine.js` | The interface's hand-drawn line. Each shape is made ONCE (centred on 0,0, size from the tokens, seed from its name) and reused: same element = same look. The wobble is centred and clamped, so it never changes an element's size |
| `ui/torn.js` | Torn paper outlines, same rules (made once, exact size, fixed tears per name) |
| `ui/components.js` | The building blocks every screen uses: TopBar, PageDots, KeyHint(Row), Toast, DoodleFrame, GridCell, Placard, TornPoster, stamps, FloorMark, NumberBadge, TornBand, ChalkFigure, FacePhoto, WantedPoster, SirenFlash, SlamWord, PoliceOfficer, SpeechBubble, StatusLabel, CameraView, HeightChart, Countdown, CameraFlash. They only read the design tokens (`ui.tokens` in `config.js`) |
| `ui/debug.js` | The debug overlay (D) |
| `print.js` | The printed case file: draws the US Letter page (300 dpi, positions in points scaled by dpi / 72; the composite is redrawn at print resolution), saves a PNG copy of the same page, and sends it to `server.py`, which saves it in `prints/` and prints it on the default printer with no dialog (settings: `CONFIG.printer`) (or, with `print.method = "browser"`, `window.print()` through the hidden `<img id="print-image">` and the print-only CSS in `index.html`) |
| `sound.js` | All sounds with Web Audio: siren, screech, thud and radio static are synthesised; files (`ui.sound.files`) fall back to a synthesised sound if missing. Browsers only allow sound after a key press or click: for the installation start Chrome with `--autoplay-policy=no-user-gesture-required` |
| `screens/*.js` | One file per MUGSHOT(3) screen, each with `enter()`, `update()`, `draw()`, `exit()`. `placeholder.js` draws the not-yet-built screens; `styleguide.js` is the style guide (G) |
| `printer.js` | Sends the finished collage PNG to `server.py` for silent printing |
| `server.py` | Local web + print server: serves the app and sends printed PNGs to macOS `lp` |
| `sketch.js` | `setup()`, `draw()`, the camera and collage views, keys |

## Notes

- **Low light:** faceMesh gets much worse in dim light, and faces flicker in and out. Light the faces evenly from the front.
- **Detection zones:** faceMesh is made for selfies and misses faces that are far from the camera. So the picture is split into 3 zones, one per floor mark, and each zone gets its own detector. Press `D` to see the zones as dashed squares. Move them with `zones.centerY` and resize them with `zones.size` in `config.js`. Each person's face needs to be inside a zone.
- **Mesh number:** every capture and every remix gets the next number in the doodle caption ("mesh no. 0042"). The browser remembers the count. To start again from 1, run `localStorage.removeItem('facemeshup.meshNumber')` in the browser console.
- **Person numbering:** by default (`faces.numbering: "screen"`) person 01 is the leftmost face **on screen**, which is the visitors' own left (floor mark 01, the yellow poster). Set it to `"camera"` to number left to right in the camera image instead (with a mirrored preview, person 01 then shows on the right).
