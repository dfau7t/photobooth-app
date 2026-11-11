// =============================================================
// halftone.js — turn a picture into a halftone print (dots).
//
//   makeHalftone(img, options) -> p5.Graphics
//
// options:
//   width, height  size of the result
//   cellSize       size of one grid cell in pixels
//   dotScale       1 = dots just touch, more = dark areas merge into solid ink
//   angle          rotation of the dot grid, in degrees (45 like real print)
//   contrast       1 = unchanged, more = punchier
//   paper, ink     colours
// =============================================================

function makeHalftone(img, options) {
  const w = round(options.width);
  const h = round(options.height);

  // ---- 1. Read the brightness of every pixel once, into a list ----
  // (Reading pixels[] directly is MUCH faster than calling get() per cell.)
  const src = createGraphics(w, h);
  src.pixelDensity(1);
  src.background(options.paper);
  src.image(img, 0, 0, w, h);
  src.loadPixels();

  const brightness = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = src.pixels[i * 4];
    const g = src.pixels[i * 4 + 1];
    const b = src.pixels[i * 4 + 2];
    let gray = 0.299 * r + 0.587 * g + 0.114 * b; // how bright this pixel looks to our eyes
    gray = (gray - 128) * options.contrast + 128; // push away from middle grey = more contrast
    brightness[i] = constrain(gray, 0, 255);
  }
  src.remove(); // free the memory

  // ---- 2. Paper background ----
  const out = createGraphics(w, h);
  out.pixelDensity(1);
  out.background(options.paper);
  out.noStroke();
  out.fill(options.ink);

  // ---- 3. Walk over a rotated grid and draw one dot per cell ----
  // Instead of rotating the canvas, we rotate the GRID POSITIONS.
  // The grid must be big enough to cover the corners after rotating,
  // so we make it as big as the diagonal of the picture.
  const cell = options.cellSize;
  const a = radians(options.angle);
  const cosA = cos(a);
  const sinA = sin(a);
  const half = sqrt(w * w + h * h) / 2;
  const maxRadius = cell * 0.5 * options.dotScale;

  for (let gy = -half; gy <= half; gy += cell) {
    for (let gx = -half; gx <= half; gx += cell) {
      // Rotate this grid position around the centre of the picture
      const x = w / 2 + gx * cosA - gy * sinA;
      const y = h / 2 + gx * sinA + gy * cosA;
      if (x < -cell || x > w + cell || y < -cell || y > h + cell) continue; // outside

      const b = averageBrightness(brightness, w, h, x, y, cell);
      // Dark = big dot, light = small dot
      const radius = map(1 - b / 255, 0, 1, 0, maxRadius);
      if (radius > 0.3) out.circle(x, y, radius * 2);
    }
  }
  return out;
}

// Average brightness of the square cell around (x, y).
// We check a 4 x 4 grid of points inside the cell. That's close
// enough to a real average, and much faster than every pixel.
function averageBrightness(brightness, w, h, x, y, cell) {
  const steps = 4;
  let total = 0;
  for (let j = 0; j < steps; j++) {
    for (let i = 0; i < steps; i++) {
      const sx = constrain(floor(x - cell / 2 + ((i + 0.5) * cell) / steps), 0, w - 1);
      const sy = constrain(floor(y - cell / 2 + ((j + 0.5) * cell) / steps), 0, h - 1);
      total += brightness[sy * w + sx];
    }
  }
  return total / (steps * steps);
}

// Make a picture grayscale with extra contrast (used for the photo pieces).
// Changes the graphics directly.
function makeGrayscale(g, contrast) {
  g.loadPixels();
  for (let i = 0; i < g.pixels.length; i += 4) {
    let gray = 0.299 * g.pixels[i] + 0.587 * g.pixels[i + 1] + 0.114 * g.pixels[i + 2];
    gray = constrain((gray - 128) * contrast + 128, 0, 255);
    g.pixels[i] = gray;
    g.pixels[i + 1] = gray;
    g.pixels[i + 2] = gray;
  }
  g.updatePixels();
}
