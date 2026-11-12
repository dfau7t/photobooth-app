# Face Mesh-up Booth (p5.js + ml5.js)

A browser photo booth for three people that mixes their faces into one halftone collage.

## How to run

The camera only works when the page is served from a web address, not opened as a file.

```bash
cd face-mesh-up
python3 server.py
```

Then open **http://localhost:8000** in Chrome and allow the camera.

(`server.py` serves the page just like `python3 -m http.server 8000`, and also receives the finished collage so it can print silently to your macOS printer without a popup dialog.)

You can also paste the files into the p5.js web editor (https://editor.p5js.org): copy each `.js` file into a file with the same name and use this `index.html` (silent printing needs `server.py`).

### Setting up your EPSON ET-4850 Series printer (100×148 mm postcard paper)

1. Connect the printer to your Mac and add it in **System Settings → Printers & Scanners**, then set it as your **Default printer** (`EPSON_ET_4850_Series`).
2. Even though macOS System Settings doesn't let you set Postcard as the system default, `config.js` leaves all other printer settings at your printer's defaults and only sets:
   - `media: 'Postcard'` (bordered 100×148 mm postcard)
   - `colorMode: 'Gray'` (prints in black & white via macOS `lp`, while saving the PNG in `prints/` in full colour)
3. Press `P` on the collage screen to print (keeps a copy in `face-mesh-up/prints/`). Set `CONFIG.printer.autoPrint: true` in `config.js` if you want it to print automatically right after the slot machine finishes.

## Keys (so far)

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
| `printer.js` | Sends the finished collage PNG to `server.py` for silent printing |
| `server.py` | Local web + print server: serves the app and sends printed PNGs to macOS `lp` |
| `sketch.js` | `setup()`, `draw()`, the camera and collage views, keys |

## Notes

- **Low light:** faceMesh gets much worse in dim light, and faces flicker in and out. Light the faces evenly from the front.
- **Detection zones:** faceMesh is made for selfies and misses faces that are far from the camera. So the picture is split into 3 zones, one per floor mark, and each zone gets its own detector. Press `D` to see the zones as dashed squares. Move them with `zones.centerY` and resize them with `zones.size` in `config.js`. Each person's face needs to be inside a zone.
- **Mesh number:** every capture and every remix gets the next number in the doodle caption ("mesh no. 0042"). The browser remembers the count. To start again from 1, run `localStorage.removeItem('facemeshup.meshNumber')` in the browser console.
- **Person numbering:** faces are numbered left to right in the **camera** image. With `mirror: true`, person 01 shows on the **right** of the screen.
