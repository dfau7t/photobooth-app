// =============================================================
// faces.js — everything to do with finding faces.
//
// WHY ZONES?
// faceMesh is made for selfies. Before it looks for faces, it shrinks
// the whole picture to a tiny 128x128 image. With three people standing
// back from the camera, each face becomes just a few pixels and it finds
// nothing.
//
// So we cut the camera picture into 3 square ZONES (one per floor mark),
// and give each zone its own faceMesh. Inside a zone, a face is much
// bigger compared to the picture, so it's found easily.
// Afterwards we move the points back to full-camera coordinates.
//
// For each face we get (in CAMERA pixels):
//   face.keypoints  -> about 468 points, each { x, y, z }
//   face.box        -> { xMin, yMin, xMax, yMax, width, height }
//   face.lips, face.leftEye, face.rightEye,
//   face.leftEyebrow, face.rightEyebrow, face.faceOval
//                   -> named groups, each with its own .keypoints list
// =============================================================

// Landmark numbers we will use later for the nose and ears.
// (They are indexes into face.keypoints.)
// Nose: lower bridge, nostril wings, base, tip.
// (Not 168, the point between the eyes: it made the nose piece reach up over the eyes.)
const NOSE_POINTS = [195, 98, 327, 2, 1];
const EAR_EDGE_POINTS = [234, 454]; // left and right edge of the face

// The named groups ml5 gives us (we need the list to move their points)
const FACE_GROUPS = ['lips', 'leftEye', 'rightEye', 'leftEyebrow', 'rightEyebrow', 'faceOval', 'leftIris', 'rightIris'];

const TILE_SIZE = 640; // each zone is copied into a 640x640 picture for faceMesh

let zones = []; // one entry per zone: { model, tile, sx, sy, size, faces }

// Load one faceMesh per zone. Must be called from preload().
function loadFaceModels() {
  for (let i = 0; i < CONFIG.zones.count; i++) {
    const model = ml5.faceMesh({
      maxFaces: CONFIG.zones.maxFacesPerZone,
      refineLandmarks: false,
      flipped: false, // keep the maths in camera space; we mirror only when drawing
    });
    zones.push({ model: model, tile: null, sx: 0, sy: 0, size: 0, faces: [] });
  }
}

// Called once the camera is ready: work out where each zone is,
// make its tile picture, and start its faceMesh.
function startFaceDetection(video) {
  const camW = video.width;
  const camH = video.height;

  // Zone size: a fraction of the camera width, but never taller than the camera
  const size = min(camW * CONFIG.zones.size, camH);

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    zone.size = size;

    // Spread the zone centres evenly across the picture
    const centerX = ((i + 0.5) / zones.length) * camW;
    const centerY = CONFIG.zones.centerY * camH;

    // Top-left corner, kept inside the camera image
    zone.sx = constrain(centerX - size / 2, 0, camW - size);
    zone.sy = constrain(centerY - size / 2, 0, camH - size);

    // A small canvas that holds this zone's part of the camera picture.
    // pixelDensity(1) is important: on retina screens it would otherwise
    // be twice as big, and the coordinates would come out wrong.
    zone.tile = createGraphics(TILE_SIZE, TILE_SIZE);
    zone.tile.pixelDensity(1);

    // Start detecting. Every new result is moved back to camera space.
    zone.model.detectStart(zone.tile, function (results) {
      zone.faces = results.map(function (face) {
        return tileFaceToCamera(face, zone);
      });
    });
  }
}

// Copy the current camera frame into every zone's tile.
// Call this once per frame, from draw().
function updateZoneTiles(video) {
  for (const zone of zones) {
    if (!zone.tile) continue;
    // image(source, dx, dy, dWidth, dHeight, sx, sy, sWidth, sHeight)
    zone.tile.image(video, 0, 0, TILE_SIZE, TILE_SIZE, zone.sx, zone.sy, zone.size, zone.size);
  }
}

// Collect the faces from all zones into one list.
function getLiveFaces() {
  let all = [];
  for (const zone of zones) {
    all = all.concat(zone.faces);
  }
  return removeDuplicateFaces(all);
}

// Zones overlap a little, so someone standing on the border can be found
// twice. If two faces are very close together, keep only the first.
function removeDuplicateFaces(faceList) {
  const kept = [];
  for (const face of faceList) {
    const cx = face.box.xMin + face.box.width / 2;
    const cy = face.box.yMin + face.box.height / 2;
    let isDuplicate = false;
    for (const other of kept) {
      const ox = other.box.xMin + other.box.width / 2;
      const oy = other.box.yMin + other.box.height / 2;
      if (dist(cx, cy, ox, oy) < other.box.width * 0.5) isDuplicate = true;
    }
    if (!isDuplicate) kept.push(face);
  }
  return kept;
}

// Move a face found in a zone tile back to full-camera coordinates.
function tileFaceToCamera(face, zone) {
  const f = copyFaces(face); // work on our own copy
  const s = zone.size / TILE_SIZE; // tile pixels -> camera pixels

  // Helper: move one point
  function movePoint(p) {
    p.x = zone.sx + p.x * s;
    p.y = zone.sy + p.y * s;
  }

  // 1. All keypoints
  f.keypoints.forEach(movePoint);

  // 2. The box
  f.box.xMin = zone.sx + f.box.xMin * s;
  f.box.xMax = zone.sx + f.box.xMax * s;
  f.box.yMin = zone.sy + f.box.yMin * s;
  f.box.yMax = zone.sy + f.box.yMax * s;
  f.box.width *= s;
  f.box.height *= s;

  // 3. Each named group (lips, eyes, ...)
  for (const name of FACE_GROUPS) {
    const g = f[name];
    if (!g) continue;
    g.keypoints.forEach(movePoint);
    g.x = zone.sx + g.x * s;
    g.y = zone.sy + g.y * s;
    g.centerX = zone.sx + g.centerX * s;
    g.centerY = zone.sy + g.centerY * s;
    g.width *= s;
    g.height *= s;
  }
  return f;
}

// Return a NEW list of faces sorted left to right.
// faces[0] = person01, faces[1] = person02, faces[2] = person03.
// "Left to right" depends on CONFIG.faces.numbering:
//   "screen": as seen on the (mirrored) screen = the visitors' own left to right
//   "camera": as seen in the camera image
// With a mirrored preview the two are opposite, so we flip the order.
function sortFacesLeftToRight(faceList) {
  const sorted = faceList.slice(); // copy, so we don't change the original
  const flip = CONFIG.faces.numbering === 'screen' && CONFIG.camera.mirror;
  sorted.sort(function (a, b) {
    return flip ? b.box.xMin - a.box.xMin : a.box.xMin - b.box.xMin;
  });
  return sorted;
}

// Make a full, independent copy of face data.
// Without this, the "frozen" faces could keep changing as ml5 updates.
function copyFaces(data) {
  return JSON.parse(JSON.stringify(data));
}
