// =============================================================
// sound.js — the sound manager. Every sound in the app goes through here.
//
//   preloadSfx()                    in preload(): fetch + decode the sound files (in the background)
//   setupSfx()                      in setup(): make sure the sound engine is there
//   playSfx(name, { volume, delay, start, end, keep, ... })
//                                   play a sound (by its name in CONFIG.sound.sounds)
//   stopSfx(name, fadeMs)           stop it (fading out over fadeMs)
//   duck(name, toVolume, ms)        make it quieter for a while (1 = back to normal)
//   isPlaying(name)                 is it playing right now?
//   sfxPending(name)                playing, OR waiting to start (played with a delay)?
//   currentTime(name)               how far into it we are (seconds), or null
//   audioClockMs()                  the sound engine's own clock, in ms (null while sound is blocked)
//   stopScreenSfx(screenName)       stop everything a screen started (goTo() does this)
//   toggleMute()                    key U
//   unlockSound()                   on the first click / key (see "BROWSERS")
//
// HOW IT WORKS
// The browser's sound engine (Web Audio) is like a little mixing desk:
//
//   [sound] -> [its own volume knob] -> [MASTER volume knob] -> speakers
//
//   - A FILE (e.g. evidence_beeps_success.mp3) is loaded once and decoded
//     into a "buffer" (the sound as numbers in memory). Playing it makes a
//     player for that buffer, which can start at an exact moment and play
//     only a part (start / end). It also knows exactly where it is, which
//     is what keeps the evidence grid in sync with its beeps.
//   - A SYNTH sound (e.g. the siren) is made from scratch: a tone (an
//     "oscillator") or noise, shaped by a volume curve (SYNTHS, below).
//     If a sound's file is missing, its synthFallback plays instead.
//   - Each play gets its own volume knob, so we can fade it out (stopSfx)
//     or turn it down for a while (duck). All knobs go into ONE master
//     knob: the master volume, and mute (U).
//
// WHY WEB AUDIO (not <audio> tags, not p5.sound)?
// <audio> tags can't start at an exact moment or report their position
// precisely enough to sync the evidence grid, and fades would need a
// timer. p5.sound would add a big library with its own sound engine on
// top of the one we already use for the synth sounds. Web Audio is built
// into the browser and does all of it with one engine.
// The files are fetched with the browser's fetch() from preload(), in the
// background (p5's loaders stop the whole page when a file is missing,
// and most files don't exist yet).
//
// TO REPLACE A SYNTH SOUND WITH A REAL RECORDING: put the file in
// assets/sfx/ under the name in CONFIG.sound.sounds (e.g. shutter.mp3),
// and reload. Nothing else changes. (Until then the browser console lists
// the missing files once at startup: that's fine.)
//
// BROWSERS: a page may not play sound until the visitor has clicked or
// pressed a key once. sketch.js shows "CLICK TO START" when that's the
// case. For the installation, Chrome can be started so it allows sound
// straight away (README: --autoplay-policy=no-user-gesture-required).
// =============================================================

let audioCtx = null; // the browser's sound engine (made in setupSfx)
let masterGain = null; // the master volume knob
let sfxMuted = false; // U
const sfxFiles = {}; // name -> { buffer, failed }
const sfxPlays = {}; // name -> the latest play: { nodes, gain, startedAt, offset, duration, screen, keep, stopped }

// ---------- 1. loading ----------

// In preload(): start fetching every file and decode it into sound as
// soon as it arrives. This runs in the background, so a slow or MISSING
// file never holds up the start: until a file is ready (or if it never
// comes), its synth fallback plays. The sound engine can decode files
// before the visitor's first click; it just can't PLAY them yet.
function preloadSfx() {
  const ctx = soundEngine();
  const sounds = CONFIG.sound.sounds;
  const jobs = [];
  for (const name in sounds) {
    const entry = { buffer: null, failed: false };
    sfxFiles[name] = entry;
    const file = sounds[name].file;
    if (!file || !ctx) {
      entry.failed = true;
      continue;
    }
    const job = fetch(file)
      .then((response) => {
        if (!response.ok) throw new Error('missing'); // e.g. 404: no such file (yet)
        return response.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        entry.buffer = buffer;
        console.log('Sound "' + name + '": ' + file + ', ' + buffer.duration.toFixed(2) + ' s');
      })
      .catch(() => {
        entry.failed = true;
        return name; // reported below, all together
      });
    jobs.push(job);
  }
  // Once everything has arrived (or not): one line listing the synth-only sounds
  Promise.all(jobs).then((results) => {
    const synthOnly = results.filter((r) => typeof r === 'string');
    if (synthOnly.length) console.log('Sounds without a file (the synth plays): ' + synthOnly.join(', '));
  });
}

// In setup(): nothing to wait for (the files arrive by themselves); this
// just makes sure the sound engine exists.
function setupSfx() {
  soundEngine();
}

// The sound engine, with its master volume knob (made once)
function soundEngine() {
  if (!audioCtx) {
    const Engine = window.AudioContext || window.webkitAudioContext;
    if (!Engine) return null;
    audioCtx = new Engine();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    applyMaster();
  }
  return audioCtx;
}

// Wake the sound engine up (call on every click / key)
function unlockSound() {
  const ctx = soundEngine();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

// Is sound allowed yet? (false = the browser is still waiting for a click)
function soundUnlocked() {
  const ctx = soundEngine();
  return !!ctx && ctx.state === 'running';
}

// The master knob: CONFIG.sound.master, or 0 when muted
function applyMaster() {
  if (masterGain) masterGain.gain.value = sfxMuted ? 0 : CONFIG.sound.master;
}

function toggleMute() {
  sfxMuted = !sfxMuted;
  applyMaster();
  return sfxMuted;
}

function setMasterVolume(v) {
  CONFIG.sound.master = round(constrain(v, 0, 1) * 10) / 10;
  applyMaster();
}

// Is this sound a real file (true) or the synth (false)?
function sfxHasFile(name) {
  return !!(sfxFiles[name] && sfxFiles[name].buffer);
}

// ---------- 2. playing ----------

// Play a sound. Options (all optional):
//   volume  0 – 1, times the sound's own volume in config (default 1)
//   delay   ms before it starts
//   start   seconds into the file to start from (files only)
//   end     seconds into the file to stop at (files only; null = the end)
//   keep    true = don't stop it when the screen changes (e.g. the radio)
//   loop    true = play the part from start to end over and over, until stopped (files only)
//   rate    playback speed (files only): 1 = normal, 1.15 = 15% faster AND a little higher
//   fadeOut ms: fade to silence over the last fadeOut ms (e.g. a trimmed clip)
//   ...     anything else goes to the synth (e.g. length, step, segment)
// Returns the play (or null without a sound engine).
function playSfx(name, options) {
  const o = options || {};
  const def = CONFIG.sound.sounds[name];
  const ctx = soundEngine();
  if (!def || !ctx) return null;
  const when = ctx.currentTime + (o.delay || 0) / 1000;

  // This play's own volume knob
  const gain = ctx.createGain();
  gain.gain.value = def.volume * (o.volume ?? 1);
  gain.connect(masterGain);

  const play = { name: name, gain: gain, startedAt: when, offset: 0, duration: 0, nodes: [], screen: currentScreenName, keep: !!o.keep, stopped: false };
  const file = sfxFiles[name];
  if (file && file.buffer) {
    // A file: play the part from 'start' to 'end'
    const start = o.start ?? 0;
    const end = min(o.end ?? file.buffer.duration, file.buffer.duration);
    const source = ctx.createBufferSource();
    source.buffer = file.buffer;
    source.playbackRate.value = o.rate ?? 1;
    source.connect(gain);
    if (o.loop) {
      // Loop: when the player reaches 'end', it jumps back to 'start'
      source.loop = true;
      source.loopStart = start;
      source.loopEnd = end;
      source.start(when, start);
      play.duration = Infinity; // until stopSfx / stopPlay
    } else {
      source.start(when, start, max(0, end - start));
      play.duration = max(0, end - start) / (o.rate ?? 1);
    }
    play.nodes = [source];
    play.offset = start;
  } else {
    // The synth fallback
    const made = SYNTHS[def.synthFallback](ctx, gain, when, o);
    play.nodes = made.nodes;
    play.duration = made.duration;
  }
  // A fade-out at the end (not for loops: they have no end)
  if (o.fadeOut && isFinite(play.duration) && play.duration > 0) {
    const end = when + play.duration;
    const fade = min(o.fadeOut / 1000, play.duration);
    gain.gain.setValueAtTime(gain.gain.value, end - fade);
    gain.gain.linearRampToValueAtTime(0, end);
  }
  sfxPlays[name] = play;
  return play;
}

// Stop a sound, fading out over fadeMs (0 = at once)
function stopSfx(name, fadeMs) {
  const play = sfxPlays[name];
  if (!play || play.stopped) return;
  stopPlay(play, fadeMs || 0);
}

function stopPlay(play, fadeMs) {
  const now = audioCtx.currentTime;
  const fade = fadeMs / 1000;
  play.stopped = true;
  play.gain.gain.cancelScheduledValues(now);
  play.gain.gain.setValueAtTime(play.gain.gain.value, now);
  play.gain.gain.linearRampToValueAtTime(0, now + fade + 0.01);
  for (const node of play.nodes) {
    try {
      node.stop(now + fade + 0.02);
    } catch (e) {
      // already stopped: fine
    }
  }
}

// Make a sound quieter (or louder again) over 'ms': toVolume is a share of
// its normal volume (0.5 = half as loud, 1 = back to normal).
function duck(name, toVolume, ms) {
  const play = sfxPlays[name];
  if (!play || play.stopped) return;
  const now = audioCtx.currentTime;
  const target = CONFIG.sound.sounds[name].volume * toVolume;
  play.gain.gain.cancelScheduledValues(now);
  play.gain.gain.setValueAtTime(play.gain.gain.value, now);
  play.gain.gain.linearRampToValueAtTime(target, now + (ms ?? 200) / 1000);
}

function isPlaying(name) {
  const play = sfxPlays[name];
  if (!play || play.stopped || !audioCtx) return false;
  const t = audioCtx.currentTime;
  return t >= play.startedAt && t < play.startedAt + play.duration;
}

// Playing, or still waiting to start (it was played with a delay)?
function sfxPending(name) {
  const play = sfxPlays[name];
  if (!play || play.stopped || !audioCtx) return false;
  return audioCtx.currentTime < play.startedAt + play.duration;
}

// How far into the sound we are, in seconds (counted from the start of
// the FILE, so a play from start = 2 s is at 2.0 when it begins).
// Before it starts (delay): the start. After it ends: the end. Never
// played: null.
function currentTime(name) {
  const play = sfxPlays[name];
  if (!play || !audioCtx) return null;
  const into = constrain(audioCtx.currentTime - play.startedAt, 0, play.duration);
  return play.offset + into;
}

// The sound engine's clock, in ms. It runs smoothly and exactly in step
// with every sound we schedule, so a screen can use it as its timer
// (the evidence screen does). null while the browser still blocks sound.
function audioClockMs() {
  if (!audioCtx || audioCtx.state !== 'running') return null;
  return audioCtx.currentTime * 1000;
}

// Stop everything that screen started (except sounds played with keep: true).
// goTo() in sketch.js calls this when we leave a screen.
function stopScreenSfx(screenName, fadeMs) {
  for (const name in sfxPlays) {
    const play = sfxPlays[name];
    if (play.screen === screenName && !play.keep && !play.stopped) stopPlay(play, fadeMs ?? 150);
  }
}

// Stop everything
function stopAllSfx(fadeMs) {
  for (const name in sfxPlays) if (!sfxPlays[name].stopped) stopPlay(sfxPlays[name], fadeMs || 0);
}

// ---------- 3. the synth sounds ----------
// Each one: (ctx, out, when, options) -> { nodes, duration }
//   out:  where to send the sound (this play's volume knob)
//   when: when to start (the engine's clock, seconds)
//   nodes: what to stop when the sound is stopped; duration: in seconds
// Volumes here are only the SHAPE (1 = full); how loud a sound is comes
// from its volume in CONFIG.sound.sounds.

const SYNTHS = {
  // A "whoop" siren: a pure tone gliding 600 -> 1200 -> 600 Hz, again and again
  siren(ctx, out, when, o) {
    const seconds = (o.length ?? 2200) / 1000;
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    const cycle = 0.6; // one up-and-down, in seconds
    tone.frequency.setValueAtTime(600, when);
    for (let t = 0; t < seconds; t += cycle) {
      tone.frequency.linearRampToValueAtTime(1200, when + t + cycle / 2);
      tone.frequency.linearRampToValueAtTime(600, when + t + cycle);
    }
    const env = envelope(ctx, when, 1, 0.05, seconds, 0.2);
    tone.connect(env).connect(out);
    tone.start(when);
    tone.stop(when + seconds);
    return { nodes: [tone], duration: seconds };
  },

  // A tyre screech: noise through a narrow filter that slides down in pitch
  screech(ctx, out, when) {
    const noise = noiseSource(ctx, 0.6);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 8; // narrow = a squeal, not a hiss
    filter.frequency.setValueAtTime(2600, when);
    filter.frequency.linearRampToValueAtTime(1300, when + 0.5);
    const env = envelope(ctx, when, 1, 0.03, 0.55, 0.5);
    noise.connect(filter).connect(env).connect(out);
    noise.start(when);
    return { nodes: [noise], duration: 0.6 };
  },

  // A thud: a low tone that drops fast, plus a tiny burst of dull noise
  thud(ctx, out, when) {
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(140, when);
    tone.frequency.exponentialRampToValueAtTime(45, when + 0.18);
    const level = ctx.createGain();
    level.gain.setValueAtTime(1, when);
    level.gain.exponentialRampToValueAtTime(0.001, when + 0.25);
    tone.connect(level).connect(out);
    tone.start(when);
    tone.stop(when + 0.3);
    const noise = noiseSource(ctx, 0.06);
    const dull = ctx.createBiquadFilter();
    dull.type = 'lowpass';
    dull.frequency.value = 400;
    const noiseLevel = ctx.createGain();
    noiseLevel.gain.value = 0.45;
    noise.connect(dull).connect(noiseLevel).connect(out);
    noise.start(when);
    return { nodes: [tone, noise], duration: 0.3 };
  },

  // Stand-in for handsup.mp3: two buzzy megaphone blasts ("HANDS — UP!")
  megaphone(ctx, out, when) {
    const nodes = [];
    [[0, 0.35, 220], [0.45, 0.5, 196]].forEach(function ([at, len, hz]) {
      const tone = ctx.createOscillator();
      tone.type = 'sawtooth';
      tone.frequency.setValueAtTime(hz, when + at);
      tone.frequency.linearRampToValueAtTime(hz * 0.92, when + at + len);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200; // the tinny megaphone sound
      filter.Q.value = 2;
      const env = envelope(ctx, when + at, 1, 0.02, len, 0.08);
      tone.connect(filter).connect(env).connect(out);
      tone.start(when + at);
      tone.stop(when + at + len);
      nodes.push(tone);
    });
    return { nodes: nodes, duration: 0.95 };
  },

  // Radio / walkie-talkie static: noise in the "radio" range, crackling
  static(ctx, out, when, o) {
    const seconds = (o.length ?? 300) / 1000;
    const noise = noiseSource(ctx, seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    const level = ctx.createGain();
    for (let t = 0; t < seconds; t += 0.04) level.gain.setValueAtTime(0.3 + Math.random() * 0.7, when + t); // crackle
    level.gain.setValueAtTime(0, when + seconds);
    noise.connect(filter).connect(level).connect(out);
    noise.start(when);
    return { nodes: [noise], duration: seconds };
  },

  // A radio blip: two short beeps, low then high
  blip(ctx, out, when) {
    const a = beepTone(ctx, out, when, 1000, 0.06, 'sine');
    const b = beepTone(ctx, out, when + 0.08, 1500, 0.07, 'sine');
    return { nodes: [a, b], duration: 0.16 };
  },

  // Countdown beeps
  beep(ctx, out, when) {
    return { nodes: [beepTone(ctx, out, when, 880, 0.12, 'sine')], duration: 0.12 };
  },
  beepHigh(ctx, out, when) {
    return { nodes: [beepTone(ctx, out, when, 1320, 0.25, 'sine')], duration: 0.25 };
  },

  // A camera shutter: two clicks (open, close) and a soft flash whine
  shutter(ctx, out, when) {
    const nodes = [clickNoise(ctx, out, when, 0.8), clickNoise(ctx, out, when + 0.07, 0.6)];
    const whine = ctx.createOscillator();
    whine.type = 'sine';
    whine.frequency.setValueAtTime(2000, when);
    whine.frequency.exponentialRampToValueAtTime(6000, when + 0.25);
    const env = envelope(ctx, when, 0.15, 0.01, 0.3, 0.2);
    whine.connect(env).connect(out);
    whine.start(when);
    whine.stop(when + 0.3);
    nodes.push(whine);
    return { nodes: nodes, duration: 0.3 };
  },

  // A soft camera click
  click(ctx, out, when) {
    return { nodes: [clickNoise(ctx, out, when, 1)], duration: 0.05 };
  },

  // Stand-in for evidence_beeps_success.mp3, one segment at a time
  // (o.segment, see CONFIG.sound.evidenceSegments):
  //   'spin'  nothing: the evidence screen ticks once per highlight jump instead
  //   'lock'  two quick high beeps
  //   'final' a little "success" arpeggio
  //   (none)  the whole thing, for the sound test: 4 ticks, then the arpeggio
  evidenceTicks(ctx, out, when, o) {
    const nodes = [];
    if (o.segment === 'spin') return { nodes: nodes, duration: 0 };
    if (o.segment === 'lock') {
      nodes.push(beepTone(ctx, out, when, 1500, 0.06, 'square'), beepTone(ctx, out, when + 0.09, 2000, 0.1, 'square'));
      return { nodes: nodes, duration: 0.2 };
    }
    const arpeggio = o.segment === 'final' ? 0 : 1.6; // the whole thing: the arpeggio after the ticks
    if (!o.segment) [0, 0.4, 0.8, 1.2].forEach((t) => nodes.push(beepTone(ctx, out, when + t, 1800, 0.05, 'square')));
    [523, 659, 784].forEach((hz, i) => nodes.push(beepTone(ctx, out, when + arpeggio + i * 0.12, hz, 0.14, 'triangle')));
    return { nodes: nodes, duration: arpeggio + 0.5 };
  },

  // A tick: a very short, high tone
  tick(ctx, out, when) {
    return { nodes: [beepTone(ctx, out, when, 1800, 0.04, 'square')], duration: 0.05 };
  },

  // A soft plucked note (tiptoe); o.step = which note of the sneaky tune
  pluck(ctx, out, when, o) {
    const tune = [196, 233, 262, 233, 196, 175]; // G3 Bb3 C4 Bb3 G3 F3 (Hz)
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = tune[(o.step || 0) % tune.length];
    const level = ctx.createGain();
    level.gain.setValueAtTime(1, when);
    level.gain.exponentialRampToValueAtTime(0.001, when + 0.18); // plucked: loud, then gone
    tone.connect(level).connect(out);
    tone.start(when);
    tone.stop(when + 0.2);
    return { nodes: [tone], duration: 0.2 };
  },

  // Pencil on paper: high, thin noise whose loudness jitters (the strokes)
  scratch(ctx, out, when, o) {
    const seconds = (o.length ?? 700) / 1000;
    const noise = noiseSource(ctx, seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3200;
    filter.Q.value = 1.5;
    const level = ctx.createGain();
    for (let t = 0; t < seconds; t += 0.05) level.gain.setValueAtTime(0.3 + Math.random() * 0.7, when + t);
    level.gain.setValueAtTime(0, when + seconds);
    noise.connect(filter).connect(level).connect(out);
    noise.start(when);
    return { nodes: [noise], duration: seconds };
  },

  // Scissors: two short, very high clicks, close together
  snip(ctx, out, when) {
    const nodes = [0, 0.07].map(function (at) {
      const noise = noiseSource(ctx, 0.03);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 4000;
      const level = ctx.createGain();
      level.gain.setValueAtTime(1, when + at);
      level.gain.exponentialRampToValueAtTime(0.001, when + at + 0.03);
      noise.connect(filter).connect(level).connect(out);
      noise.start(when + at);
      return noise;
    });
    return { nodes: nodes, duration: 0.1 };
  },

  // A soft paper pat: a tiny burst of dull (low) noise
  pat(ctx, out, when) {
    const noise = noiseSource(ctx, 0.08);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const level = ctx.createGain();
    level.gain.setValueAtTime(1, when);
    level.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
    noise.connect(filter).connect(level).connect(out);
    noise.start(when);
    return { nodes: [noise], duration: 0.08 };
  },

  // A whoosh: noise through a filter that sweeps up and back down
  whoosh(ctx, out, when) {
    const noise = noiseSource(ctx, 0.45);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(400, when);
    filter.frequency.exponentialRampToValueAtTime(2200, when + 0.2);
    filter.frequency.exponentialRampToValueAtTime(600, when + 0.45);
    const env = envelope(ctx, when, 1, 0.15, 0.45, 0.3);
    noise.connect(filter).connect(env).connect(out);
    noise.start(when);
    return { nodes: [noise], duration: 0.45 };
  },

  // A very quiet city: low rumbling noise, looping (until stopped)
  ambience(ctx, out, when, o) {
    const noise = noiseSource(ctx, 4);
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 350;
    noise.connect(filter).connect(out);
    noise.start(when);
    const seconds = (o.length ?? 600000) / 1000;
    noise.stop(when + seconds);
    return { nodes: [noise], duration: seconds };
  },
};

// ---------- 4. small helpers for the synths ----------

// A volume curve: up to 'level' in 'attack' s, hold, down to 0 over the
// last 'release' s of 'length' s. Returns the gain node to connect through.
function envelope(ctx, when, level, attack, length, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(level, when + attack);
  g.gain.setValueAtTime(level, when + max(attack, length - release));
  g.gain.linearRampToValueAtTime(0, when + length);
  return g;
}

// A short beep: a tone of 'hz' for 'length' s, with a quick fade at the end
function beepTone(ctx, out, when, hz, length, type) {
  const tone = ctx.createOscillator();
  tone.type = type;
  tone.frequency.value = hz;
  const env = envelope(ctx, when, 1, 0.005, length, min(0.03, length / 2));
  tone.connect(env).connect(out);
  tone.start(when);
  tone.stop(when + length + 0.01);
  return tone;
}

// A click: a tiny burst of high noise
function clickNoise(ctx, out, when, level) {
  const noise = noiseSource(ctx, 0.02);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(level, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.02);
  noise.connect(filter).connect(g).connect(out);
  noise.start(when);
  return noise;
}

// White noise (random values), 'seconds' long, ready to play once
function noiseSource(ctx, seconds) {
  const buffer = ctx.createBuffer(1, max(1, floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

// ---------- 5. the old names (the screens still use them until steps b–d) ----------
// These now go through the sound manager too.

function playSiren(ms) {
  playSfx('siren', { length: ms });
}
function playScreech() {
  playSfx('screech');
}
function playThud() {
  playSfx('thud');
}
function playStatic(ms) {
  playSfx('static', { length: ms });
}
function playPluck(step) {
  playSfx('tiptoe', { step: step });
}
function playScratch(ms) {
  playSfx('pencil', { length: ms });
}
function playSnip() {
  playSfx('scissors');
}
function playPat() {
  playSfx('paste');
}
function playWhoosh() {
  playSfx('whoosh');
}
function playTick() {
  playSfx('tick');
}
// playFile(name, fallback): the sound's file, or (no file) the given fallback
function playFile(name, fallback) {
  if (sfxHasFile(name) || !fallback) playSfx(name, name === 'radio' ? { keep: true } : {});
  else fallback();
}
function stopSiren() {
  stopSfx('siren', 0);
}
function stopSounds() {
  stopAllSfx(0);
}
