# Face Mesh-up Booth — Build Brief for Claude Code

## 0. Who you're working with

I'm Nicha, an industrial / interaction design student at CIID. I'm **new to coding** (started with Processing, now using p5.js).

- Write clear, well-commented code that a beginner can read.
- Keep each file focused and short. Avoid clever tricks.
- After each change, explain in plain language what you did and why.
- Build in the milestones below, one at a time. Stop after each one so I can test it.

---

## 1. Concept

A big-screen photo booth for **exactly three people at a time**. It takes one photo of all three and turns it into a single new face.

- One person's face is picked at random as the **base**.
- Each feature (**eyes, nose, ears, lips**) is replaced with the same feature from a **randomly chosen person**.
- The result is a face that belongs to none of them and all of them at once: a portrait of the group, not of one person.

The visual language is a **printed collage**: the base face is turned into a **halftone** print, and each borrowed feature is pasted on top as a photo cut-out with a **colour block blended over it**. Each person has their own colour (**red, yellow, blue**), so the colours show who gave which part. The pieces are placed **loosely and asymmetrically**, like hand-made collage, and each feature gets its **own blend mode** so it stands out.

The seams are meant to be visible. They are part of the meaning.

### ⭐ The most important rule: readability

Every visitor must be able to **recognise their own face, and see clearly which feature is theirs**. Whenever a visual effect conflicts with readability, **readability wins**. Section 5.0 turns this into concrete rules.

Visual references: mixed-media / risograph portrait collages, i.e. halftone black-and-white portraits with flat colour blocks over the eyes or across slices of the face.

---

## 2. Tech stack

- **p5.js 1.11.x** (not 2.x: ml5 needs `preload()`)
- **ml5.js v1**:
  - `ml5.faceMesh({ maxFaces: 3 })` for the face landmarks (~468 points per face, with named groups `lips`, `leftEye`, `rightEye`, `leftEyebrow`, `rightEyebrow`, `faceOval`)
  - `ml5.bodyPose()` for the "raise both arms" start gesture (milestone 6)
- Runs in the browser (Chrome), full screen, 16:9, designed for 1920×1080 and scaled to the window.
- No build tools. Plain `index.html` + JS files, so it also runs in the p5.js web editor.
- Use the default 2D renderer (not WEBGL): it supports all the blend modes in section 5.3.

Load from CDN:
```html
<script src="https://cdn.jsdelivr.net/npm/p5@1.11.1/lib/p5.min.js"></script>
<script src="https://unpkg.com/ml5@1/dist/ml5.min.js"></script>
```

Please check the current ml5 v1 docs for exact property names before relying on them.

---

## 3. Physical setup (context)

- A large screen on a wall. Three marks on the floor in front of it, labelled **01, 02, 03**, left to right.
- One camera (ideally 4K) on a table in front of the screen, at face height.
- People are identified by position: faces sorted **left → right in the camera image** = person01, person02, person03.
  - Note: if the preview is mirrored for the users, the order on screen flips. Keep the logic in camera space and handle mirroring only when drawing.

---

## 4. Core pipeline (what happens on capture)

1. **Freeze**: copy the current camera frame into a `p5.Image` (`snap`) and deep-copy the 3 face results at the same moment.
2. **Identify**: sort the faces by `box.xMin` → `people[0..2]`.
3. **Recipe**: pick random integers 0–2:
   ```js
   recipe = { base, eyes, nose, ears, lips }
   ```
   A feature may come from the base person itself. Keep this as a config option `allowSelfFeature` (default `true`).
4. **Layout**: for every piece, pick a random placement (offset, rotation, scale) inside that feature's zone (section 5.2). Store it in `recipe.layout`, so the same recipe always draws the same way.
5. **Render the base**: crop around the base face, then convert it to **halftone** (section 5.1).
6. **Render each piece separately**: cut it from the source person, then convert it to grayscale, apply its colour block and blend mode **inside its own `p5.Graphics`**, and add a paper border (sections 5.2–5.3).
7. **Compose**: halftone base, then the finished pieces pasted in **normal (BLEND) mode** in a fixed order, then labels. Everything goes into one `p5.Graphics` (`result`).
8. **Show** on screen. Pressing `S` saves a PNG.

Do all heavy work **once per capture or remix**, not every frame. Pressing `R` re-mixes the same photo with a new recipe **and a new layout**.

---

## 5. Visual style: the detail

### 5.0 Readability rules (apply to everything below)

1. **Colours never stack across pieces.** Each piece is fully coloured inside its own graphics buffer, then pasted in normal mode. Two overlapping pieces must never produce a third, muddy colour (e.g. yellow over blue = green). This was a real problem in the first build.
2. **Limit overlap.** Pieces may touch or overlap slightly at the edges (≤ 15% of the smaller piece), but must never cover each other's key area: the eyes, the nostrils or the lip line.
3. **Draw order** (bottom → top): ears → lips → nose → eyes. The eyes are the strongest identity cue, so they go on top.
4. **Paper border**: every piece gets a thin border in paper colour (default 5 px at output resolution) plus a very soft shadow (2 px offset, 15% ink). This separates it from the halftone base, like real cut paper.
5. **Keep facial detail visible**: after blending, measure the contrast of the piece (standard deviation of its brightness). If it drops below `minContrast`, redo that piece with the fallback blend mode (section 5.3).
6. **Labels must be readable**: monospace, at least 22 px at output resolution, ink text on a small paper-coloured tag, placed next to the piece (not over the eyes or lips).
7. **Base face stays recognisable**: the halftone must keep the face outline and the eye/mouth positions readable. If `cellSize` gets so large that they disappear, clamp it.

### 5.1 Base photo → halftone

- **Input**: the base face crop. Crop = face box plus 45% margin on each side, so the head, hair and ears fit. Keep the crop at a **4:5 portrait** ratio.
- **Output resolution**: draw at a high resolution (e.g. 1600×2000) so it holds up on a big screen and when saved.
- **Steps**:
  1. Convert to grayscale. Optionally raise the contrast first (`contrast` config, default 1.3).
  2. Fill the background with **paper** colour.
  3. Lay a grid of cells, `cellSize` px each (default 10 px at output resolution).
  4. For each cell, sample the **average brightness** of that area in the source.
  5. Draw one circle at the centre of the cell, in **ink** colour:
     `radius = map(1 - brightness/255, 0, 1, 0, cellSize * 0.5 * dotScale)`
     `dotScale` defaults to 1.25, so dark areas merge into solid ink.
  6. Optional: rotate the grid by `halftoneAngle` (default 45°), like real print screens. Implementation: rotate the sample coordinates, not the canvas.
- Use `loadPixels()` / `pixels[]` for sampling, not `get()` per cell (too slow).
- Put the halftone in its own function, `makeHalftone(img, options) → p5.Graphics`, so it can be reused for the pieces (see the `halftonePieces` option).

### 5.2 Feature pieces: cutting and loose placement

**A. Find the region on the source face**

- **eyes**: by default **two separate pieces**, left eye and right eye, each from its `eye` + `eyebrow` groups, padded 20%. With `splitEyes: false`, use one strip covering both, as in the first build.
- **nose**: landmark points `[195, 98, 327, 2, 1]` (lower bridge, nostril wings, base, tip), padded 20%. **Don't use point 168** (between the eyes): it made the nose piece reach up over the eyes. Also clip the top of the nose piece so it starts below the bottom edge of the eye pieces.
- **lips**: the `lips` group, padded 30%
- **ears**: faceMesh has no ear points. Estimate from the face-edge points `234` and `454`: a box just outside each one, `width = faceWidth × 0.22`, `height = faceWidth × 0.38`. Two pieces, left and right, **placed independently**.

**B. Align to the base face (the "anchor")**

- **scale** `s = eyeDistance(base) / eyeDistance(source)`, clamped between 0.5 and 2
- **rotation** = the base face's eye-line angle minus the source face's eye-line angle (`atan2`), so tilted heads still line up
- **anchor point** = the centre of the same feature on the base face

**C. Loose, asymmetric placement (new)**

Every piece gets its own random variation **on top of** the anchor. Pieces stay inside their feature's zone, but never land in a perfectly neat or mirrored layout.

Variation per piece, in fractions of the **base face width** (`fw`):

| Feature | Offset x | Offset y | Rotation | Extra scale |
|---|---|---|---|---|
| eyes (each) | ± 0.06 fw | ± 0.03 fw | ± 6° | 0.9 – 1.15 |
| nose | ± 0.04 fw | ± 0.04 fw | ± 8° | 0.9 – 1.15 |
| lips | ± 0.06 fw | ± 0.03 fw | ± 6° | 0.9 – 1.2 |
| ears (each) | ± 0.04 fw | ± 0.08 fw | ± 14° | 0.85 – 1.2 |

Rules:
- Paired pieces (two eyes, two ears) get **independent** random values. Re-roll if the two values are almost the same (difference in offset < 0.02 fw **and** rotation < 3°), so they never look mirrored.
- After placing, check that **at least 60%** of the piece still covers its feature's real area on the base face. If it doesn't, move it back toward the anchor until it does.
- Then check readability rule 2 (overlap). If a piece overlaps a key area, re-roll its placement (up to 10 tries, then fall back to the anchor with no offset).
- Keep all the random values in `recipe.layout`. Use `randomSeed(recipe.seed)` so a recipe can be redrawn exactly the same way.
- Global strength control: `looseness` (0 = neat, as in the first build; 1 = the table above; 1.5 = wilder). It multiplies every value in the table.

**D. Cut style** (config `cutStyle`)
- `"rect"` (default): a rectangular piece, like a strip of paper
- `"shape"`: cut along the feature's landmark outline, using a mask drawn from the points and `p5.Image.mask()`

### 5.3 Colour blocks and blend modes (new)

Each piece is built in its own `p5.Graphics`, in this order:
1. Draw the source photo piece in **grayscale**, with slightly more contrast (or halftoned, if `halftonePieces: true`).
2. Set the piece's **blend mode** and draw a flat rectangle in the **source person's colour**:
   - the block is slightly larger than the piece (`blockBleed`, default 6%)
   - offset by a few pixels (`misregister`, default 4 px, random direction) to fake risograph misregistration
   - block opacity `blockAlpha`, default 0.85
3. Switch back to `blendMode(BLEND)`.
4. Run the readability check (rule 5). If it fails, redo step 2 with the fallback mode.
5. Add the paper border and shadow (rule 4).
6. Return the finished piece. It is pasted onto the base in **normal mode**.

**What each blend mode does (all built into p5):**

| p5 mode | Effect on the photo piece | Good for |
|---|---|---|
| `MULTIPLY` | Darks stay dark, light areas take the colour. Lines stay crisp. | dark lines: eyes, brows |
| `OVERLAY` | Keeps the photo's light and shadow, tints the mid-tones. Very readable. | the nose, and any yellow piece |
| `HARD_LIGHT` | Strong, saturated colour with sharp contrast. | lips |
| `SCREEN` | Lightens: darks take the colour. | dark areas such as hair or shadowed ears |
| `SOFT_LIGHT` | Gentle tint, the most subtle. | fallback when a piece looks too heavy |
| `DIFFERENCE` | Inverted, negative-like colours. Very striking, but the face is harder to read. | experimental only (off by default) |

**Defaults (`blendByFeature`):**
- eyes → `MULTIPLY`
- nose → `OVERLAY`
- lips → `HARD_LIGHT`
- ears → `OVERLAY`
- fallback when the readability check fails → `SOFT_LIGHT` (if that fails too: `OVERLAY` at 0.6 opacity)

**Colour rule: yellow is very light.** In `MULTIPLY` on light skin it almost disappears. If the colour is yellow and the mode is `MULTIPLY`, switch that piece to `OVERLAY` (or `HARD_LIGHT` for small pieces).

**Blend mode setting** (`blendMode` in config, cycled with the `B` key):
- `"byFeature"` (default): use `blendByFeature`
- `"random"`: each piece picks at random from `[MULTIPLY, OVERLAY, HARD_LIGHT, SCREEN]`, still with the yellow rule and the readability check
- `"multiply"`: everything in Multiply, as in the first build, for comparison

Show the blend mode used for each piece in the recipe panel, e.g. `eyes · 02 · multiply`.

### 5.4 Palette

Red, yellow, blue: primary colours, like risograph inks.

| Role | Hex |
|---|---|
| Paper (background, piece borders, label tags) | `#F2EEE6` |
| Ink (halftone dots, text) | `#141414` |
| person01 | `#DE3127` (red) |
| person02 | `#F2F26B` (yellow) |
| person03 | `#4AA6DE` (blue) |

Keep these in the config file so I can change them. If the yellow looks too weak on screen, try a deeper yellow such as `#F5D90A`.

### 5.5 Layer order (bottom → top)

1. Paper background
2. Halftone base face
3. Finished pieces, in this order: ears → lips → nose → eyes. Each piece already contains its photo, colour block, border and shadow, and is pasted in normal mode.
4. Labels (paper tags)
5. Optional: a thin ink outline around the whole head (off by default)

---

## 6. Screen flow (state machine)

The UI was designed separately: 7 screens, 16:9, light grey studio look. Implement this as one variable `screen`:

| # | `screen` | Shows | Goes to next when |
|---|---|---|---|
| 01 | `waiting` | Title, 3 empty face slots, floor marks 01–03 | at least one face found → `joining` |
| 02 | `joining` | Found faces marked; "2 of 3 faces found" | exactly 3 faces, stable for 1 s → `ready` |
| 03 | `ready` | "Everyone raise both arms to start", status per person | all 3 have both wrists above their nose for 1 s → `countdown` |
| 04 | `countdown` | Live camera, big 3-2-1, white flash | after the flash: capture → `mixing` |
| 05 | `mixing` | The features × people grid, with a random line jumping between cells; slows down, then settles on the final recipe (~3 s) | settled → `result` |
| 06 | `result` | Finished collage + recipe list | after 10 s → `takehome` (raise arms again = remix) |
| 07 | `takehome` | QR code + "back to start" timer (placeholder QR for now) | after 20 s → `waiting` |

Rules:
- In `ready` or `countdown`, if the face count drops below 3, go back to `joining`.
- Use the new red / yellow / blue person colours in the screens too (face boxes, status chips, recipe list).
- **Keyboard fallbacks** for testing without people or gestures:
  - `SPACE` = capture now / back to live
  - `R` = remix (new recipe + new layout)
  - `S` = save PNG
  - `D` = debug overlay (landmarks, boxes, recipe)
  - `→` = next screen

---

## 7. Config (one object, in `config.js`)

```js
const CONFIG = {
  colors: {
    paper: '#F2EEE6',
    ink: '#141414',
    people: ['#DE3127', '#F2F26B', '#4AA6DE'],   // red, yellow, blue
  },
  halftone: { cellSize: 10, dotScale: 1.25, angle: 45, contrast: 1.3 },
  pieces: {
    cutStyle: 'rect',          // 'rect' | 'shape'
    halftonePieces: false,
    splitEyes: true,           // two separate eye pieces
    looseness: 1,              // 0 = neat, 1 = default, 1.5 = wild
    minFeatureCover: 0.6,      // a piece must still cover 60% of its real feature
    maxOverlap: 0.15,
    border: 5,                 // paper border, px at output resolution
    blockBleed: 0.06,
    blockAlpha: 0.85,
    misregister: 4,
  },
  blend: {
    mode: 'byFeature',         // 'byFeature' | 'random' | 'multiply'
    byFeature: { eyes: 'MULTIPLY', nose: 'OVERLAY', lips: 'HARD_LIGHT', ears: 'OVERLAY' },
    randomPool: ['MULTIPLY', 'OVERLAY', 'HARD_LIGHT', 'SCREEN'],
    fallback: 'SOFT_LIGHT',
    minContrast: 28,           // std dev of brightness (0–255) after blending
  },
  labels: { size: 22 },
  recipe: { allowSelfFeature: true },
  output: { width: 1600, height: 2000 },
  timing: { stableMs: 1000, mixingMs: 3000, resultMs: 10000, takehomeMs: 20000 },
};
```

Map the blend mode names to p5 constants in one helper (`'MULTIPLY' → MULTIPLY`, …).

---

## 8. Suggested file structure

```
index.html
config.js     – all tweakable values
faces.js      – faceMesh setup, sorting, feature regions, alignment maths
layout.js     – loose placement: random offsets, overlap and coverage checks
halftone.js   – makeHalftone()
pieces.js     – build one finished piece: grayscale, colour block, blend mode, readability check, border
collage.js    – composeCollage(snap, people, recipe) → p5.Graphics
screens.js    – drawing each of the 7 screens
sketch.js     – setup(), draw(), state machine, keys
```

---

## 9. Milestones

**Already done** in the current build: detection of 3 faces, halftone base, rectangular pieces with Multiply colour blocks, recipe panel, settings keys (`[ ]` cell size, `- =` dot scale, `C` cut style, `H` halftone pieces, `V` photo, `R`, `S`, `SPACE`). Keep all of that working.

Next, one at a time:

4. **Readability fixes**: per-piece compositing (no colour stacking), new nose region, draw order, paper border and shadow, readable label tags. Switch the palette to red / yellow / blue. *Check: no muddy mixed colours anywhere; every label is readable.*
5. **Loose placement**: split eyes, per-piece random offset / rotation / scale from the table, independent pairs, coverage and overlap checks, `looseness` setting. New keys: `L` / `K` = looseness up / down. *Check: press `R` 10 times; no layout looks mirrored, and every feature stays in its area.*
6. **Blend modes**: per-feature modes, yellow rule, readability check with fallback, `B` key to cycle `byFeature` / `random` / `multiply`, blend mode shown in the recipe panel. *Check: every piece stands out from the halftone, and the facial detail in each piece is still visible.*
7. **Screens**: the full 7-screen flow, with keyboard fallbacks first and the bodyPose arms-up trigger second.

---

## 10. Edge cases to handle

- Fewer or more than 3 faces at capture → don't capture. Show a message and stay on the screen.
- Feature regions outside the image → clamp to the image bounds.
- Faces overlapping, or people swapping places → rely on sorting at the moment of capture only.
- Very different face sizes → the eye-distance scaling handles this. Clamp `s` between 0.5 and 2.
- Placement can't satisfy the coverage and overlap rules after 10 tries → use the anchor position with no offset.
- Low light → note it in the README. Don't try to fix it in code.

## 11. Done when

- Three people stand on the marks, raise their arms, and within ~5 s see a collage where:
  - **each person can recognise their own feature at a glance**, by its colour, its label, and the facial detail that's still visible inside the piece,
  - the base face is clearly a halftone print and still recognisable,
  - the pieces sit loosely and asymmetrically, but each stays in its feature's area,
  - each feature stands out through its own blend mode, and no muddy mixed colours appear,
  - each piece is labelled with the feature, the person number and the blend mode.
- `R` gives a new mix and a new layout of the same photo. `S` saves a high-resolution PNG.
