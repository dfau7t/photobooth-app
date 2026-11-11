// =============================================================
// gesture.js — the "everybody raise both hands" shutter.
//
// HOW POSE + GESTURE WORK TOGETHER
// We run two MediaPipe models on the same camera frame:
//
//   1. PoseLandmarker ("the skeleton")
//      Finds each person's body: shoulders, elbows, wrists, nose...
//      We use it to ask: "is this WRIST higher than its SHOULDER?"
//      That tells us the arm is really raised (not just a hand
//      waving at chest height).
//
//   2. GestureRecognizer ("the hand reader")
//      Finds each hand and guesses its gesture: "Open_Palm",
//      "Closed_Fist", "Thumb_Up"...
//      We use it to ask: "is this hand an OPEN PALM?"
//
// Neither model knows who is person 01, 02 or 03. So we match by
// horizontal position (left/right in the camera picture):
//   - each skeleton belongs to the face nearest to its nose
//   - each open palm belongs to the face nearest to it
//   - then each open palm is linked to the nearest wrist of that
//     person's skeleton. If that wrist is above its shoulder,
//     that arm counts as "up".
// So one person can count at most 2 hands (left arm + right arm).
//
// HOW THE SKETCH USES THIS FILE
//   setupGesture(video)    once, when the camera is ready (loads the models)
//   updateGesture(faces)   every frame on the live screen -> a state object
//   stopGesture()          when leaving the live screen (pauses + resets)
//   toggleGestureDemo()    key H: pretend everyone has their hands up
//   drawGestureStatus(faces, state)   draws the labels above each person
//
// All maths is in CAMERA space (not mirrored), as in faces.js.
// MediaPipe gives positions from 0 to 1 (0 = left/top, 1 = right/bottom).
// =============================================================

// Where MediaPipe lives on the internet (pinned version, no build tools needed)
const MEDIAPIPE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

// The same two models as the friend's Python version
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const GESTURE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

// Pose landmark numbers (MediaPipe's fixed list of 33 body points)
const POSE_NOSE = 0;
const POSE_LEFT_SHOULDER = 11;
const POSE_RIGHT_SHOULDER = 12;
const POSE_LEFT_WRIST = 15;
const POSE_RIGHT_WRIST = 16;

let gestureVideo = null; // the p5 camera
let poseModel = null; // PoseLandmarker, once loaded
let gestureModel = null; // GestureRecognizer, once loaded
let gestureLoading = false;

let lastRunTime = 0; // when we last ran the models (ms)
let lastPoses = []; // newest skeletons
let lastHands = []; // newest hands: [{ x, y, wristX, wristY, isOpenPalm }]
let holdStart = 0; // when everyone first became ready (0 = not holding)

// Against flicker: when each arm was LAST seen raised, per person.
// armSeenAt[0] = [left arm time, right arm time] for person01, etc.
// The models sometimes miss a hand for one check. With this memory,
// a short miss doesn't count as "hand down".
let armSeenAt = [];
let gestureDemo = false; // key H

// ---------- 1. setup ----------

// Load both models. This takes a few seconds, so it runs in the
// background; updateGesture() just reports "loading" until it's done.
async function setupGesture(video) {
  gestureVideo = video;
  if (gestureLoading || poseModel) return;
  gestureLoading = true;

  try {
    // MediaPipe is a "module", so we load it with import()
    const vision = await import(MEDIAPIPE_URL + '/vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_URL + '/wasm');

    poseModel = await vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: CONFIG.gesture.maxPoses,
      minPoseDetectionConfidence: 0.4, // same as the friend's version
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });

    const c = CONFIG.gesture.minGestureConfidence;
    gestureModel = await vision.GestureRecognizer.createFromOptions(files, {
      baseOptions: { modelAssetPath: GESTURE_MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: CONFIG.gesture.maxHands,
      minHandDetectionConfidence: c,
      minHandPresenceConfidence: c,
      minTrackingConfidence: c,
    });
    console.log('Gesture models loaded');
  } catch (err) {
    console.error('Could not load the gesture models (SPACE and H still work):', err);
  }
  gestureLoading = false;
}

// ---------- 2. every frame ----------

// faces: the live faces, already sorted left -> right (person01, 02, 03).
// Returns:
//   {
//     loading:    true while the models are still loading
//     people:     [{ handsUp: 0|1|2, ready: true/false }, ...]  one per face
//     readyCount: how many people are ready
//     allReady:   true when exactly 3 people are all ready
//     holdProgress: 0 -> 1 while everyone holds the pose
//     triggered:  true ONCE, when the pose was held long enough
//   }
function updateGesture(faces) {
  const now = millis();

  // Run the (heavy) models only every few frames, not on every frame
  if (poseModel && gestureModel && now - lastRunTime >= CONFIG.gesture.intervalMs) {
    lastRunTime = now;
    runModels();
  }

  // Work out each person's state
  const people = [];
  for (let i = 0; i < faces.length; i++) {
    const handsUp = gestureDemo ? 2 : smoothedHandsUp(faces, i, now);
    people.push({ handsUp: handsUp, ready: handsUp === 2 });
  }
  const readyCount = people.filter((p) => p.ready).length;

  // Everyone must be ready. Normally that means exactly 3 people.
  // In demo mode (H) you're testing alone, so any number of faces is OK.
  const enoughPeople = gestureDemo ? faces.length > 0 : faces.length === CONFIG.faces.required;
  const allReady = enoughPeople && readyCount === faces.length;

  // The hold timer: everyone must stay ready for holdMs
  let holdProgress = 0;
  let triggered = false;
  if (allReady) {
    if (holdStart === 0) holdStart = now;
    holdProgress = min(1, (now - holdStart) / CONFIG.gesture.holdMs);
    if (holdProgress >= 1) {
      triggered = true;
      holdStart = 0; // start fresh next time
    }
  } else {
    holdStart = 0; // someone dropped their hands: start the hold again
  }

  return {
    loading: !poseModel || !gestureModel,
    people: people,
    readyCount: readyCount,
    allReady: allReady,
    holdProgress: holdProgress,
    triggered: triggered,
  };
}

// Run both models on the current camera frame and keep what we need.
function runModels() {
  const frame = gestureVideo.elt; // the real <video> element behind p5's capture
  if (frame.readyState < 2) return; // no picture yet
  const t = performance.now(); // MediaPipe wants a timestamp for video

  try {
    // Skeletons: keep the nose, shoulders and wrists
    const poseResult = poseModel.detectForVideo(frame, t);
    lastPoses = poseResult.landmarks.map(function (p) {
      return {
        noseX: p[POSE_NOSE].x,
        arms: [
          // one arm per side: is the wrist above the shoulder?
          // (smaller y = higher up in the picture)
          { wristX: p[POSE_LEFT_WRIST].x, wristY: p[POSE_LEFT_WRIST].y, up: p[POSE_LEFT_WRIST].y < p[POSE_LEFT_SHOULDER].y },
          { wristX: p[POSE_RIGHT_WRIST].x, wristY: p[POSE_RIGHT_WRIST].y, up: p[POSE_RIGHT_WRIST].y < p[POSE_RIGHT_SHOULDER].y },
        ],
      };
    });

    // Hands: keep the centre, the wrist and "is it an open palm?"
    const handResult = gestureModel.recognizeForVideo(frame, t);
    lastHands = [];
    for (let i = 0; i < handResult.landmarks.length; i++) {
      const points = handResult.landmarks[i]; // 21 points per hand, point 0 = wrist
      const best = handResult.gestures[i][0]; // the most likely gesture
      let sumX = 0;
      let sumY = 0;
      for (const p of points) {
        sumX += p.x;
        sumY += p.y;
      }
      lastHands.push({
        x: sumX / points.length,
        y: sumY / points.length,
        wristX: points[0].x,
        wristY: points[0].y,
        isOpenPalm: best && best.categoryName === 'Open_Palm' && best.score >= CONFIG.gesture.minGestureConfidence,
      });
    }
  } catch (err) {
    console.warn('Gesture detection error:', err);
  }
}

// ---------- 3. matching hands and skeletons to people ----------

// The horizontal centre of a face, from 0 (left) to 1 (right)
function faceCenterX(face) {
  return (face.box.xMin + face.box.width / 2) / gestureVideo.width;
}

// Which face (index) is nearest to this x position?
function nearestFaceIndex(faces, x) {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < faces.length; i++) {
    const d = abs(x - faceCenterX(faces[i]));
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

// How many hands does person number i have up (0, 1 or 2),
// WITH memory: an arm seen up in the last memoryMs still counts.
function smoothedHandsUp(faces, i, now) {
  if (!armSeenAt[i]) armSeenAt[i] = [-Infinity, -Infinity]; // never seen yet

  const armsNow = raisedArms(faces, i); // what the models say right now
  let count = 0;
  for (let arm = 0; arm < 2; arm++) {
    if (armsNow[arm]) armSeenAt[i][arm] = now; // seen up: remember the time
    if (now - armSeenAt[i][arm] < CONFIG.gesture.memoryMs) count++;
  }
  return count;
}

// Which of person i's arms are raised with an open palm, RIGHT NOW?
// Returns [left arm, right arm], e.g. [true, false].
function raisedArms(faces, i) {
  const fx = faceCenterX(faces[i]);

  // 1. Find this person's skeleton: the one whose nose is closest to the face
  let pose = null;
  let poseDist = CONFIG.gesture.maxPoseDistance;
  for (const p of lastPoses) {
    const d = abs(p.noseX - fx);
    if (d < poseDist) {
      poseDist = d;
      pose = p;
    }
  }
  if (!pose) return [false, false]; // no skeleton = we can't check the arms

  // 2. Look at every open palm that belongs to this person
  const armIsUp = [false, false]; // [left arm, right arm]
  for (const hand of lastHands) {
    if (!hand.isOpenPalm) continue;
    if (nearestFaceIndex(faces, hand.x) !== i) continue; // someone else's hand
    if (abs(hand.x - fx) > CONFIG.gesture.maxHandDistance) continue; // too far away (a bystander?)

    // 3. Which of the person's two wrists is this hand attached to?
    const d0 = dist(hand.wristX, hand.wristY, pose.arms[0].wristX, pose.arms[0].wristY);
    const d1 = dist(hand.wristX, hand.wristY, pose.arms[1].wristX, pose.arms[1].wristY);
    const arm = d0 < d1 ? 0 : 1;

    // 4. It only counts if that arm is really raised
    if (pose.arms[arm].up) armIsUp[arm] = true;
  }

  // Each arm counts once, so the same hand can't be counted twice
  return armIsUp;
}

// ---------- 4. stop + demo ----------

// Leaving the live screen: the models stop running (because
// updateGesture() is no longer called) and we forget the old results,
// so we start fresh when we come back. The models stay loaded.
function stopGesture() {
  holdStart = 0;
  lastPoses = [];
  lastHands = [];
  armSeenAt = []; // forget the arm memory too
}

// Key H: pretend everyone has both hands up (for testing alone)
function toggleGestureDemo() {
  gestureDemo = !gestureDemo;
  return gestureDemo;
}

// ---------- 5. drawing ----------

// A small status label above each person's number tag.
// Uses toStage() from sketch.js, so it follows the mirroring.
function drawGestureStatus(faces, state) {
  textFont('monospace');
  textSize(24);
  textAlign(CENTER, CENTER);

  for (let i = 0; i < faces.length && i < state.people.length; i++) {
    const face = faces[i];
    const handsUp = state.people[i].handsUp;
    const col = i < CONFIG.colors.people.length ? CONFIG.colors.people[i] : CONFIG.colors.ink;

    // Same corner maths as drawFaceBox() in sketch.js
    const a = toStage(face.box.xMin, face.box.yMin);
    const b = toStage(face.box.xMax, face.box.yMax);
    const cx = (a.x + b.x) / 2;
    const top = min(a.y, b.y) - 52 - 16; // above the "01" tag

    // Three looks:
    //   READY 2/2         -> filled with the person's colour
    //   RAISE 2ND 1/2     -> paper with a person-colour edge
    //   RAISE BOTH HANDS  -> ink
    let label;
    let bg;
    let fg;
    let edge = null;
    if (handsUp === 2) {
      label = 'READY 2/2';
      bg = col;
      fg = CONFIG.colors.ink;
    } else if (handsUp === 1) {
      label = 'RAISE 2ND 1/2';
      bg = CONFIG.colors.paper;
      fg = CONFIG.colors.ink;
      edge = col;
    } else {
      label = 'RAISE BOTH HANDS';
      bg = CONFIG.colors.ink;
      fg = CONFIG.colors.paper;
    }

    const w = textWidth(label) + 32;
    const h = 40;
    rectMode(CENTER);
    if (edge) {
      stroke(edge);
      strokeWeight(4);
    } else {
      noStroke();
    }
    fill(bg);
    rect(cx, top - h / 2, w, h);
    rectMode(CORNER);
    noStroke();
    fill(fg);
    text(label, cx, top - h / 2);
  }
}

// The text for the bottom banner, e.g. "2 / 3 ready"
function gestureBannerText(state) {
  if (state.loading) return 'loading hand detector…';
  let txt = state.readyCount + ' / ' + CONFIG.faces.required + ' ready';
  if (state.allReady) txt += '  ·  hold it!';
  if (gestureDemo) txt += '  ·  DEMO (H)';
  return txt;
}
