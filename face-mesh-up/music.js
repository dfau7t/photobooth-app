// =============================================================
// music.js — the background music (assets/music/game_over.mp3).
//
//   preloadMusic()              in preload(): fetch + decode the track (in the background)
//   updateMusic()               every frame (sketch.js draw): start, loop, ducking
//   setMusicLevel(level, ms)    fade the music to level (0–1 x the base volume)
//   musicLevelForScreen(name)   goTo() calls this: the level of that screen
//   musicDuck(from, to)         turn the music down between two sound-engine times
//   toggleMusic()               Shift+M: music on / off
//   setMusicVolume(v)           the base volume (CONFIG.music.volume)
//   jumpToMusicLoop()           sound test: play the last seconds before the loop point
//   applyMusicVolume()          mute (U) / music off: sound.js calls this
//
// HOW THE MUSIC IS WIRED (the same mixing-desk idea as sound.js):
//
//   [track] -> [crossfade knob] -> [LEVEL knob] -> [DUCK knob] -> [VOLUME knob] -> speakers
//              (one per copy)      (per screen)    (important     (CONFIG.music.volume,
//                                                   sounds)         0 = muted / music off)
//
// It does NOT go through the sound effects' master knob: the music has its
// own base volume (it's much louder than the effects). Mute (U) still
// silences it.
//
// THE LOOP CROSSFADE
// The track ends with a fade-out, so we loop back BEFORE it (loopEnd).
// A sudden jump would click, so for a short moment two copies of the track
// play at the same time:
//
//   copy 1:  ……… end of the loop ███████▓▓▓▒▒▒░░░  (fading out)
//   copy 2:                          ░░░▒▒▒▓▓▓███████ start ………  (fading in)
//                                   |<-crossfade->|
//
// Copy 2 starts at loopStart exactly when copy 1 reaches loopEnd - crossfade.
// The crossfade is 2 beats long (88 BPM), so the beat carries on without a
// stumble. The fades are "equal power" curves (not straight lines), so the
// music doesn't get quieter in the middle of the crossfade.
//
// DUCKING
// While an important sound plays (handsup.mp3, the radio, stamps, the
// camera snap, the officer's voice), the DUCK knob turns the music down to
// CONFIG.music.duck.to (quickly: attackMs), and back up afterwards
// (slowly: releaseMs). playSfx() tells us when such a sound starts and ends
// (musicDuck); every frame, updateMusic() checks "is one playing now?".
// =============================================================

const music = {
  buffer: null, // the decoded track (null = not loaded / missing)
  started: false, // has it started playing (after the sound unlock)?
  current: null, // the copy playing now: { source, fade, startedAt, offset }
  next: null, // the copy booked for the next loop (during a crossfade)
  level: null, // LEVEL knob (per screen)
  duckGain: null, // DUCK knob
  volume: null, // VOLUME knob
  levelNow: 1, // the level we last asked for (for the sound test)
  windows: [], // when important sounds play: [{ start, end }] (sound-engine seconds)
  ducked: false,
};

// ---------- loading and starting ----------

function preloadMusic() {
  const ctx = soundEngine(); // sound.js
  if (!ctx) return;
  fetch(CONFIG.music.file)
    .then((response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.arrayBuffer();
    })
    .then((bytes) => ctx.decodeAudioData(bytes))
    .then((buffer) => {
      music.buffer = buffer;
      console.log('Music: ' + CONFIG.music.file + ', ' + nf(buffer.duration, 0, 1) + ' s');
    })
    .catch((e) => console.warn('Music: ' + CONFIG.music.file + ' could not be loaded (' + e.message + '): no music.'));
}

// Make the knobs once
function musicKnobs() {
  if (music.volume) return true;
  const ctx = soundEngine();
  if (!ctx) return false;
  music.level = ctx.createGain();
  music.duckGain = ctx.createGain();
  music.volume = ctx.createGain();
  music.level.connect(music.duckGain).connect(music.volume).connect(ctx.destination);
  applyMusicVolume();
  return true;
}

// Every frame: start the music once sound is allowed, book the next loop, duck
function updateMusic() {
  if (!music.buffer || !soundUnlocked() || !musicKnobs()) return;
  const ctx = audioCtx;
  const M = CONFIG.music;

  // 1. Start once ("CLICK TO START" has unlocked the sound), then keep going
  if (!music.started) {
    music.started = true;
    startMusicAt(M.loopStart);
  }

  // 2. The loop: when copy 1 nears the crossfade point, book copy 2
  const xfade = M.crossfadeMs / 1000;
  const c = music.current;
  if (c && !music.next) {
    const switchAt = c.startedAt + (M.loopEnd - xfade - c.offset); // when copy 1 reaches loopEnd - crossfade
    // Book it a second ahead. (Missed it, e.g. the tab was asleep? Now, then.)
    if (ctx.currentTime > switchAt - 1) bookLoop(max(switchAt, ctx.currentTime + 0.05), xfade);
  }
  if (music.next && ctx.currentTime >= music.next.startedAt + xfade) {
    music.current = music.next; // the crossfade is over: copy 2 is now "the" copy
    music.next = null;
  }

  // 3. Ducking: is an important sound playing right now?
  const now = ctx.currentTime;
  music.windows = music.windows.filter((w) => w.end > now); // forget the finished ones
  const duckNow = music.windows.some((w) => w.start <= now);
  if (duckNow !== music.ducked) {
    music.ducked = duckNow;
    const D = M.duck;
    rampTo(music.duckGain.gain, duckNow ? D.to : 1, duckNow ? D.attackMs : D.releaseMs);
  }
}

// One copy of the track: plays from 'offset' (seconds into the file),
// starting at sound-engine time 'when'. fadeInSeconds: 0 = a tiny
// anti-click fade, otherwise an equal-power fade-in that long.
function playMusicCopy(offset, when, fadeInSeconds) {
  const ctx = audioCtx;
  const source = ctx.createBufferSource();
  source.buffer = music.buffer;
  const fade = ctx.createGain();
  if (fadeInSeconds > 0) {
    fade.gain.setValueAtTime(0, when);
    fade.gain.setValueCurveAtTime(equalPowerCurve(true), when, fadeInSeconds);
  } else {
    fade.gain.setValueAtTime(0, when);
    fade.gain.linearRampToValueAtTime(1, when + 0.05);
  }
  source.connect(fade).connect(music.level);
  source.start(when, offset);
  return { source: source, fade: fade, startedAt: when, offset: offset };
}

// Book the loop: copy 2 starts at loopStart at time 'at', while copy 1 fades out
function bookLoop(at, xfade) {
  const old = music.current;
  music.next = playMusicCopy(CONFIG.music.loopStart, at, xfade);
  old.fade.gain.cancelScheduledValues(at);
  old.fade.gain.setValueCurveAtTime(equalPowerCurve(false), at, xfade);
  old.source.stop(at + xfade + 0.05);
}

// Stop whatever plays, and play from 'offset' (seconds into the file) now
function startMusicAt(offset) {
  if (!music.buffer || !musicKnobs()) return;
  const now = audioCtx.currentTime;
  for (const copy of [music.current, music.next]) {
    if (!copy) continue;
    copy.fade.gain.cancelScheduledValues(now);
    copy.fade.gain.setValueAtTime(copy.fade.gain.value, now);
    copy.fade.gain.linearRampToValueAtTime(0, now + 0.05); // a tiny fade, no click
    copy.source.stop(now + 0.06);
  }
  music.next = null;
  music.current = playMusicCopy(offset, now, 0);
  music.started = true;
}

// An equal-power fade curve: in = 0 -> 1, out = 1 -> 0. (sin / cos of a
// quarter circle: the two copies together always have the same loudness.)
function equalPowerCurve(fadeIn) {
  const n = 64;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    curve[i] = fadeIn ? Math.sin((k * Math.PI) / 2) : Math.cos((k * Math.PI) / 2);
  }
  return curve;
}

// Slide a knob from where it is now to 'value' over 'ms'
function rampTo(param, value, ms) {
  const now = audioCtx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + ms / 1000);
}

// ---------- levels, ducking, volume ----------

// Fade the music to 'level' (0–1 x the base volume) over ms (default: levelFadeMs)
function setMusicLevel(level, ms) {
  music.levelNow = level;
  if (!musicKnobs()) return;
  rampTo(music.level.gain, level, ms ?? CONFIG.music.levelFadeMs);
}

// The level of a screen (CONFIG.music.levels). goTo() calls this.
function musicLevelForScreen(name) {
  const level = CONFIG.music.levels[name];
  if (level !== undefined) setMusicLevel(level);
}

// An important sound plays from 'start' to 'end' (sound-engine seconds;
// end = Infinity: until musicDuckEnd). Returns the window, so it can be ended.
function musicDuck(start, end) {
  const w = { start: start, end: end };
  music.windows.push(w);
  return w;
}

// End a duck window now (e.g. the officer stopped talking)
function musicDuckEnd(w) {
  if (w && audioCtx) w.end = audioCtx.currentTime;
}

// The VOLUME knob: the base volume, or 0 when muted (U) or the music is off (Shift+M)
function applyMusicVolume() {
  if (!music.volume) return;
  const on = CONFIG.music.on && !sfxMuted;
  rampTo(music.volume.gain, on ? CONFIG.music.volume : 0, 150);
}

// Shift+M: music on / off. Returns true when it's on.
function toggleMusic() {
  CONFIG.music.on = !CONFIG.music.on;
  applyMusicVolume();
  return CONFIG.music.on;
}

function setMusicVolume(v) {
  CONFIG.music.volume = round(constrain(v, 0, 1) * 100) / 100;
  applyMusicVolume();
}

// Sound test: play from a few seconds before the crossfade, to hear the loop point
function jumpToMusicLoop() {
  const M = CONFIG.music;
  startMusicAt(M.loopEnd - M.crossfadeMs / 1000 - M.jumpBeforeLoop);
}

// Where the music is now (seconds into the track), for the sound test
function musicPosition() {
  const c = music.current;
  if (!c || !audioCtx) return 0;
  return c.offset + max(0, audioCtx.currentTime - c.startedAt);
}
