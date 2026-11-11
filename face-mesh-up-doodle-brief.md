# Face Mesh-up Booth — Experiment B: Doodle + Die-cut

Brief for Claude Code. This is a **second visual experiment** for the same booth. Everything not described here (tech stack, physical setup, capture, recipe, screen flow, coding style for a beginner) follows **`face-mesh-up-brief.md`**. Read that file first.

Build this as a **second render mode** in the same app, not a new project. The `M` key switches between:
- `halftone` (Experiment A, the existing collage)
- `doodle` (Experiment B, this file)

---

## 1. Concept

In Experiment A, the base person's photo becomes the background. In Experiment B, **the base person's photo is never shown**. The base person contributes only the **shape** of the face: their face outline, the position of their features, the line of their nose (and from milestone B7, optionally the silhouette of their hair and shoulders). This is traced as a loose, hand-drawn **doodle line** on white paper.

The features (eyes, ears, lips, and optionally the nose) are cut out of the three people's photos like **die-cut stickers or scissor-cut magazine pieces**, and stuck onto the drawing.

- The base person = the **skeleton / the drawing** (who you are shaped like)
- The other people = the **pieces stuck on it** (what you are made of)

The mood is playful and childlike, like a Dada-style kids' collage: a simple felt-tip outline of a head, with real photo eyes, ears and a mouth glued on at slightly wrong sizes and angles. It feels hand-made, funny and a little absurd, but each person can still clearly find their own eye, ear or mouth.

### Visual reference (described)
- White paper, one continuous wobbly line in warm grey felt-tip: an oval head, a long neck, a zig-zag crown of hair, a nose drawn as a single line
- Photo pieces in **full natural colour**, cut with scissors into irregular polygons with straight edges, glued slightly crooked
- Features at different sizes: one eye bigger than the other, a mouth much too big. The ears overlap the outline.
- A handwritten caption in the corner

### Readability rule (still the most important)
Every visitor must recognise **their own feature** at a glance. In this experiment that's easier, because the pieces are in **full colour on white**. Keep it that way: no colour overlays on the pieces, and the line never crosses over a piece.

**Ownership is shown only by the label tags** (`eye · 01`) **and the recipe panel.** There are no coloured marks on the pieces by default (see 4.3). So the labels must always be readable, sit next to their own piece, and never cover a pupil, a lip line or the nostrils.

---

## 2. What changes compared to Experiment A

| | Experiment A (halftone) | Experiment B (doodle) |
|---|---|---|
| Base | halftone print of the base photo | hand-drawn line traced from the base landmarks |
| Background | paper `#F2EEE6` | white paper `#FBFAF7` |
| Pieces | grayscale photo + colour block in a blend mode | **natural colour photo**, plain scissor cut (no border), soft shadow |
| Who gave what | piece colour | label tag per piece (`eye · 01`, with a small square in the person's colour) + recipe panel |
| Placement | loose, inside the feature zone | looser + **exaggerated sizes** (Dada) |
| Nose | photo piece | photo piece **or** just the drawn line (option) |

Reuse from Experiment A: capture, sorting, recipe, feature regions (`faces.js`), alignment maths, the loose-placement code (`layout.js`), labels and the screen flow.

---

## 3. The doodle line (base)

All points come from the **base person's** face landmarks, mapped into the output canvas (e.g. 1600×2000, 4:5, face centred, head taking ~60% of the height).

### 3.1 What gets drawn
1. **Head outline**: from the `faceOval` points.
   - Sort the points by angle around their centre, so they form a continuous loop. Don't assume the order ml5 returns.
   - Stretch the top upward by ~8% of the face height (the face oval stops at the forehead, but a drawn head is rounder).
   - Leave a small **gap or overshoot** where the line starts and ends (random, 0–4% of the outline length), as a real pen would.
2. **Neck**: two lines going down from the jaw (near points `172` and `397`) to the bottom edge of the canvas, slightly uneven in length and angle.
3. **Nose**: one line from between the eyes (point `168`) down the nose bridge to the tip (`1`), then a small hook to the side under the nose (towards `98` or `327`, random side). Drawn when `noseMode` is `'line'` or `'both'`.
4. **Hair**: a random style each round (`hairStyle: 'random'`):
   - `spikes`: a zig-zag crown of 3–6 sharp peaks above the forehead, like the reference
   - `loops`: a scribble of small loops along the top of the head
   - `flat`: a single bumpy line across the forehead
   - `none`
   - `traced` (milestone B7): the real outline of the base person's hair, head and shoulders, from a segmentation model. See 3.4.
5. Not drawn: eyes, mouth and ears. The photo pieces are those.
6. Optional (`extraDoodles: true`): one small random doodle, such as a tiny star, three short "shine" lines, or a curl. Off by default.

### 3.2 Making it look hand-drawn
- **Resample** each path into evenly spaced points (every ~6 px).
- **Wobble**: move each point sideways (perpendicular to the line) using `noise()`, amplitude `wobble` (default 5 px at output resolution), low frequency, so the line drifts like a hand, not jitters like a machine.
- **Smooth** with `curveVertex()`.
- **Stroke**: round caps and joins, colour warm grey `#7A6F66`, weight `lineWeight` (default 10 px), with ±15% weight variation along the line. Draw the line as short overlapping segments with slightly different weights.
- **Double pass** (optional, `doublePass: true`): draw the same path a second time at 40% opacity, offset by 2–3 px, like a marker going over the same line twice.
- Use `randomSeed(recipe.seed)` and `noiseSeed(recipe.seed)`, so the same recipe always draws the same line.

### 3.3 Drawing animation
On the result screen, **draw the line in progressively**, as if someone were tracing it: the head first, then the neck, the nose and the hair, over ~1.5 s (`drawDurationMs`). Then the pieces "drop" on one by one (each with a quick scale from 1.08 → 1.0 and its shadow appearing), ~150 ms apart: ears → lips → nose → eyes. The saved PNG is always the finished state.

---

### 3.4 Traced silhouette (milestone B7)

Until B7, only the face landmarks come from the base photo. The top of the skull is stretched up by a fixed amount, the hair is a random generated style, and the neck lines are generated below the jaw. With `hairStyle: 'traced'`, the real outline of the base person's **hair, head and shoulders** is traced from the photo instead.

**Model**: `ml5.bodySegmentation('SelfieSegmentation')`. It stays inside ml5 (no extra library) and labels each pixel as person or background. Check the current ml5 v1 docs for the exact option names. If a separate hairline is wanted later, MediaPipe's multiclass selfie model (hair / face skin / body skin / clothes, via `@mediapipe/tasks-vision`) is the upgrade path. It is not part of B7.

**Steps** (once per capture, on the frozen photo, **never on the live video**):
1. **Crop** around the base person: face box plus a generous margin, so the hair and shoulders fit. The model shrinks its input to a small square (~256 px), so with three people in the frame, an uncropped person would be tiny. This is the same reason faceMesh uses detection zones.
2. **Segment** the crop: a person / background mask, thresholded at 0.5.
3. **Keep only the base person**: the part of the mask connected to the base face's centre. Neighbours who stand close can enter the crop.
4. **Trace the edge** of that area into a line of points (marching squares).
5. **Simplify** it to doodle detail (e.g. Ramer–Douglas–Peucker, tolerance `simplify` px), so it doesn't follow every strand of hair.
6. **Draw** it with the existing hand-drawn pipeline (3.2), mapped with the same camera → page mapping.

**What it replaces**:
- The silhouette is drawn as one open line: from the bottom edge of the page, up one shoulder, around the hair, and down the other shoulder. It replaces the stretched skull top, the generated hair and the two neck lines.
- The **lower half of the face oval** (ear → chin → ear) is still drawn from the landmarks, because the jaw and chin are inside the silhouette, not on its edge.
- The nose line (3.1) is unchanged.
- **Page fit**: `head.top` and `head.height` now measure from the top of the traced hair, so big hair still fits on the page.
- **Ears** still stick 30–50% out past the **face oval** line (not the silhouette, which may be hair at ear height).

**Fallback**: if the mask is empty, too small, or merged with a neighbour (it touches both sides of the crop), use a random generated style for that capture instead, and note it in the debug panel. The booth must never show a broken outline.

**Performance**: load the model at startup, like faceMesh (a second or two). Run it once per capture, which takes a fraction of a second, and reuse the result for every remix (`R`) of the same photo. Tracing a ~256 px mask is instant. The live view is not slowed down.

**Known risks** (quality, not speed):
- **Background:** a busy background, hair close in colour to the background, or dim light gives ragged edges. A plain backdrop behind the floor marks helps most.
- **People close together:** they can merge into one silhouette. The crop and step 3 reduce this; the fallback covers the rest.
- **Resolution:** the mask is low resolution, so the edge is a bit blocky. The wobble mostly hides it.

## 4. Die-cut pieces

### 4.1 Cutting the shape
For each feature, start from its region on the **source person** (same regions as Experiment A: two separate eyes with brows, nose without point 168, lips, two estimated ears).

Cut style (`cutStyle`):
- `'scissor'` (default): an **irregular polygon with straight edges**, like the reference.
  1. Take the feature's landmark points and pad them outward (eyes 25%, lips 30%, nose 20%; ears use their estimated box).
  2. Compute the convex hull of the padded points.
  3. Simplify it to **5–8 corners**: pick corners spread around the shape and move each one outward or inward by a small random amount (≤ 6% of the piece size). Never cut into the feature itself.
- `'smooth'`: follow the padded outline with a smooth curve (sticker look)
- `'rect'`: a slightly rotated rectangle (for comparison)

Cut the photo with a mask: draw the polygon in white on a `createGraphics` mask, then use `pieceImg.mask(maskImg)`.

### 4.2 Sticker finish
Each finished piece is its own `p5.Graphics`:
1. **Shadow**: the polygon in ink at 15% opacity, offset 3 px down-right, blurred slightly. Always on by default: it separates the pieces from the white paper and from each other.
2. **White border** (optional): the polygon expanded by `border` in white `#FFFFFF`, like a die-cut sticker edge. **Default `border: 0`**, so the pieces look like plain scissor-cut paper. The `B` key switches the border on (6 px) and off, to compare.
3. **Photo**: the masked photo piece in **natural colour**. Lightly normalise brightness and contrast so the pieces from the three people look like they belong together, but don't change their skin colour.

### 4.3 Who gave what
No colour overlays in this experiment. Ownership is shown by the **label tag** next to each piece (`eye · 02`, with a small square in the person's colour) and by the **recipe panel**. These are the only ownership cues by default.

Owner marks on the pieces are optional, for comparison only (`O` key):
- `ownerMark: 'none'` (**default**): labels only, nothing stuck on the pieces
- `ownerMark: 'dot'`: a small filled circle in the person's colour (red / yellow / blue), stuck on a corner of the piece
- `ownerMark: 'tape'`: a short strip of coloured "tape" across one corner of the piece, at 85% opacity

Colours as in Experiment A: person01 `#DE3127`, person02 `#F2F26B`, person03 `#4AA6DE`. On white, yellow is hard to see, so give yellow dots and tape a thin ink outline (1.5 px).

---

## 5. Placement: Dada-style

Anchor every piece to the same feature's position on the **base face** (from the drawn outline), then add variation. This experiment is **looser** than Experiment A, and adds **exaggerated sizes**.

| Feature | Offset x | Offset y | Rotation | Size (× aligned size) |
|---|---|---|---|---|
| eye (each) | ± 0.07 fw | ± 0.05 fw | ± 10° | 0.8 – 1.5 |
| nose | ± 0.04 fw | ± 0.04 fw | ± 10° | 0.9 – 1.3 |
| lips | ± 0.08 fw | ± 0.05 fw | ± 8° | 1.0 – 1.8 |
| ear (each) | ± 0.03 fw | ± 0.10 fw | ± 15° | 0.9 – 1.4 |

(`fw` = the width of the base face in the output.)

Rules:
- The two eyes and the two ears are **independent**: different sizes, heights and angles. Re-roll if a pair looks mirrored.
- **Ears** are pushed outward so that 30–50% of each ear sits outside the head outline and overlaps it, like the reference.
- **Lips** may grow past the jawline, but must stay above the bottom of the neck lines.
- Pieces may overlap each other slightly at the edges, but never over another piece's key area (pupil, lip line, nostrils). Draw order: ears → lips → nose → eyes.
- The **line is drawn first and the pieces go on top**, so the line disappears under a piece, like glue on paper. Never draw the line over a piece.
- Global `looseness` (0–1.5) multiplies the offsets and rotations. Separate `exaggeration` (0–1.5) controls only the size ranges: 0 = everything at aligned size.
- Keep everything inside the canvas with a margin of at least 4% on every side.

---

## 6. Caption

Bottom-right corner, in a handwriting-style Google Font (e.g. *Caveat* or *Reenie Beanie*, loaded in `index.html`), in the line colour:

```
mesh no. 0042 — 01 · 02 · 03
```

The order of the numbers follows the recipe: base first, then the others. Size ~36 px at output resolution. Option `caption: false` hides it.

---

## 7. Config (add to `config.js`)

```js
CONFIG.doodle = {
  paper: '#FBFAF7',
  line: { color: '#7A6F66', weight: 10, weightVariation: 0.15, wobble: 5, doublePass: true },
  hairStyle: 'random',          // 'random' | 'spikes' | 'loops' | 'flat' | 'none' | 'traced' (B7)
  silhouette: {                 // B7, used when hairStyle is 'traced'
    cropMargin: 0.8,            // space around the base face box, on each side, for hair and shoulders
    threshold: 0.5,             // mask: above = person
    simplify: 4,                // outline detail, in output px (higher = simpler line)
  },
  noseMode: 'piece',            // 'piece' | 'line' | 'both'
  extraDoodles: false,
  drawDurationMs: 1500,
  pieces: {
    cutStyle: 'scissor',        // 'scissor' | 'smooth' | 'rect'
    corners: [5, 8],
    border: 0,                  // 0 = plain scissor cut; key B switches to 6 px and back
    shadow: true,
    ownerMark: 'none',          // 'none' (labels only) | 'dot' | 'tape'
    looseness: 1,
    exaggeration: 1,
  },
  caption: true,
};
```

New keys in doodle mode:
- `M` = switch between halftone and doodle mode
- `N` = cycle `noseMode`
- `T` = cycle `hairStyle` (including `traced` from B7)
- `X` / `Z` = exaggeration up / down
- `O` = cycle `ownerMark` (`none` → `dot` → `tape`)
- `B` = white sticker border on / off. Doodle mode only: in halftone mode, `B` stays reserved for cycling blend modes (Experiment A, milestone 6).

All existing keys (`R`, `S`, `SPACE`, `D`, `L` / `K`) keep working.

---

## 8. Files

Add, without changing how Experiment A works:

```
doodle.js          – build the head / neck / nose / hair paths from landmarks, and draw them hand-drawn (+ animation)
diecut.js          – scissor polygon, mask, white border, shadow → finished piece
collageDoodle.js   – composeDoodle(snap, people, recipe) → p5.Graphics
silhouette.js      – B7: run the segmentation on the base crop, keep the base person, trace and simplify the outline
```

Reuse `faces.js` (regions, alignment) and `layout.js` (placement, with the new table and the `exaggeration` setting).

---

## 9. Milestones (one at a time, stop after each)

- **B1 — Line only**: trace the base face's outline, neck and nose as **clean** lines on white. Pressing `M` switches modes. *Check: the outline matches the base person's head shape.*
- **B2 — Hand-drawn**: wobble, weight variation, double pass, gap/overshoot, hair styles. *Check: it looks drawn with a felt-tip, not by a computer, and pressing `R` gives a different but similar line.*
- **B3 — Die-cut pieces**: scissor polygons, mask, white border, shadow, natural colour, placed at the anchors with no variation yet. *Check: every piece looks like a cut-out sticker, and no feature is cut off at the edge.*
- **B4 — Dada placement**: the variation table, independent pairs, ears over the outline, `looseness` and `exaggeration`. *Check: press `R` 10 times; nothing looks mirrored, and every feature is still where you'd expect it.*
- **B5 — Ownership and caption**: owner dots / tape, label tags, handwritten caption. *Check: each person can point to their own piece in under 3 seconds.*
- **B6 — Animation**: line tracing + pieces dropping on, integrated into the `result` screen.

- **B7 — Traced silhouette**: `hairStyle: 'traced'` (section 3.4). Segment the base person once per capture, trace the hair / head / shoulder outline, and draw it hand-drawn instead of the stretched skull, generated hair and neck lines. Keep the jaw and chin from the face oval. Fall back to a generated style when the mask is bad. *Check: with three people on the marks, the doodle's hair and shoulders are recognisably the base person's; press `T` to compare with the generated styles; a busy background or people standing close never gives a broken outline.*

*Revised after B6:* owner marks are off by default (labels + recipe panel are the only ownership cues), and the white sticker border is off by default (plain scissor cut + soft shadow). Both can be switched back on with `O` and `B` to compare.

---

## 10. Done when

- With doodle mode on, a capture produces a white page with a hand-drawn head **shaped like the base person** (from B7 optionally including their real hair and shoulders), with real photo eyes, ears, lips (and nose, if enabled) from the three people stuck on.
- The pieces are plain scissor cuts with a soft shadow, in natural colour, placed loosely, at playful sizes, never mirrored.
- Each piece has a readable label tag showing who it came from, and everyone can find their own feature at a glance, using the labels and the recipe panel.
- `M` switches between Experiment A and B on the **same captured photo**, so the two can be compared directly. `S` saves the current one as a PNG.
