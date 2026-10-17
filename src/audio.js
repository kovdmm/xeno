/* Xeno-Tactic — sound layer (howler.js).
   Sounds are synthesised at load time into small WAV data URIs, so no audio files are shipped.
   Like the renderer, this module only listens to XT.core events and never touches game state.

   Keeping late waves from turning into noise:
   - events are collected during a frame and flushed once per frame (same-name events merge,
     louder by log of the count instead of stacking);
   - every sound has a minimum interval and a voice limit;
   - low-priority combat sounds (shots, small booms, pops) share a budget per 100 ms
     and get quieter as the field gets busier;
   - important sounds (leaks, bosses, nukes, waves, upgrades) bypass the budget;
   - lasers are one shared looping hum whose volume follows how many beams are firing. */
export function installAudio(XT) {
  // Randomness comes from XT.rng.audio when set (tests seed it); each module has its own stream so that
  // cosmetic randomness never shifts the game simulation.
  const rand = (XT.rng && XT.rng.audio) || Math.random;
  // timers can be replaced through XT.env (tests); the browser default is used otherwise
  const later = (XT.env && XT.env.setTimeout) || ((fn, ms) => setTimeout(fn, ms));
  const SR = 22050;
  const rnd = () => rand() * 2 - 1;
  function synth(dur, fn) {
    const n = Math.floor(SR * dur),
      a = new Float32Array(n),
      st = {};
    for (let i = 0; i < n; i++) a[i] = fn(i / SR, st);
    return a;
  }
  // one-pole low-pass helper kept in per-sound state
  const lp = (st, k, x, key = "y") => (st[key] = (st[key] || 0) + k * (x - (st[key] || 0)));
  const sq = (f) => (Math.sin(f) > 0 ? 1 : -1);
  function toWav(a, sr = SR, loop = false) {
    const n = a.length,
      b = new Uint8Array(44 + n * 2),
      v = new DataView(b.buffer);
    const w = (o, s) => {
      for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i);
    };
    w(0, "RIFF");
    v.setUint32(4, 36 + n * 2, true);
    w(8, "WAVE");
    w(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    w(36, "data");
    v.setUint32(40, n * 2, true);
    // soft limiter, 5 ms fade in/out against clicks
    const fade = loop ? 0 : Math.floor(sr * 0.005);
    for (let i = 0; i < n; i++) {
      let x = Math.tanh(a[i] * 1.2);
      if (i < fade) x *= i / fade;
      if (i > n - fade) x *= (n - i) / fade;
      v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32000, true);
    }
    let s = "";
    for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return "data:audio/wav;base64," + btoa(s);
  }
  const sweep = (t, f0, f1, d) => f0 * Math.pow(f1 / f0, Math.min(1, t / d)); // exponential frequency glide
  // phase accumulator for glides
  const ph = (st, f, key = "p") => (st[key] = (st[key] || 0) + (6.2832 * f) / SR);

  /* ---------- music: a sinister 8-bit loop, composed here and rendered once ----------
   D minor with Phrygian turns (Eb) and the harmonic-minor A major, 96 BPM, 16 bars ≈ 40 s.
   Voices like an old console: triangle bass, thin pulse arpeggio, square lead, noise drums. */
  const MSR = 16000,
    BPM = 96,
    BAR = 4,
    BARS = 16;
  const STEP = 60 / BPM / 4; // one sixteenth note, s
  const LEN = Math.round(BARS * BAR * 4 * STEP * MSR); // samples in the loop
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // chord per bar: [bass root (MIDI), arpeggio root, minor?]
  const CH = {
    D: [38, 62, 1],
    Bb: [34, 58, 0],
    A: [33, 57, 0],
    Eb: [39, 63, 0],
    G: [31, 55, 1],
  };
  const PROG = ["D", "D", "Bb", "A", "D", "D", "Eb", "A", "G", "G", "D", "D", "Bb", "Eb", "A", "A"];
  // lead from bar 5: [midi, beats], one row per bar
  const LEAD = [
    [
      [74, 2],
      [77, 1],
      [76, 1],
    ],
    [
      [74, 3],
      [69, 1],
    ],
    [
      [75, 2],
      [74, 1],
      [72, 1],
    ],
    [[73, 4]],
    [
      [70, 2],
      [69, 1],
      [67, 1],
    ],
    [
      [74, 2],
      [72, 1],
      [70, 1],
    ],
    [
      [69, 3],
      [65, 1],
    ],
    [[69, 4]],
    [
      [77, 2],
      [76, 1],
      [74, 1],
    ],
    [
      [75, 2],
      [74, 1],
      [70, 1],
    ],
    [
      [73, 2],
      [76, 2],
    ],
    [[69, 4]],
  ];
  const tri = (x) => 4 * Math.abs(x - Math.floor(x + 0.5)) - 1; // x in cycles
  const pulse = (x, d) => (x - Math.floor(x) < d ? 1 : -1);
  function composeMusic() {
    const out = new Float32Array(LEN);
    // add a note; samples past the end wrap round so the loop is seamless
    function note(t0, dur, vol, wave, f, opt = {}) {
      const s0 = Math.round(t0 * MSR),
        n = Math.round((dur + (opt.rel || 0.04)) * MSR),
        att = opt.att || 0.004,
        dec = opt.dec || 0,
        sus = opt.sus ?? 1,
        rel = opt.rel || 0.04;
      let phs = 0;
      for (let i = 0; i < n; i++) {
        const t = i / MSR;
        let e = t < att ? t / att : dec ? sus + (1 - sus) * Math.exp(-(t - att) / dec) : 1;
        if (t > dur) e *= Math.max(0, 1 - (t - dur) / rel);
        let fr = typeof f === "function" ? f(t) : f;
        if (opt.vib && t > 0.18) fr *= 1 + opt.vib * Math.sin(6.2832 * 5.5 * t);
        phs += fr / MSR;
        out[(s0 + i) % LEN] += wave(phs, t) * e * vol;
      }
    }
    let seed = 0xace1;
    const noise = () => {
      const b = ((seed >> 0) ^ (seed >> 2) ^ (seed >> 3) ^ (seed >> 5)) & 1;
      seed = (seed >> 1) | (b << 15);
      return seed & 1 ? 1 : -1;
    };
    function drum(t0, kind) {
      const s0 = Math.round(t0 * MSR);
      if (kind === "k") {
        let p = 0;
        for (let i = 0; i < MSR * 0.22; i++) {
          const t = i / MSR;
          p += (45 + 100 * Math.exp(-t * 30)) / MSR;
          out[(s0 + i) % LEN] += tri(p) * Math.exp(-t * 14) * 0.42;
        }
      } else if (kind === "s") {
        let y = 0;
        for (let i = 0; i < MSR * 0.16; i++) {
          const t = i / MSR,
            x = noise();
          y += 0.6 * (x - y);
          out[(s0 + i) % LEN] += (y * 0.2 + Math.sin(6.2832 * 190 * t) * 0.08) * Math.exp(-t * 24);
        }
      } else {
        let y = 0;
        for (let i = 0; i < MSR * 0.045; i++) {
          const t = i / MSR,
            x = noise();
          y += 0.5 * (x - y);
          out[(s0 + i) % LEN] += (x - y) * 0.07 * Math.exp(-t * 70);
        }
      }
    }
    const beat = 4 * STEP,
      barT = BAR * beat;
    PROG.forEach((c, b) => {
      const [br, ar, minor] = CH[c],
        t = b * barT;
      // bass: eighth notes R R R' R R R R5 R
      [0, 0, 12, 0, 0, 0, 7, 0].forEach((iv, k) =>
        note(t + k * 2 * STEP, 2 * STEP * 0.8, 0.3, tri, mtof(br + iv + 12), {
          rel: 0.02,
        }),
      );
      // arpeggio from bar 3: sixteenths up the triad, thin 12.5% pulse
      if (b >= 2) {
        const tri3 = minor ? [0, 3, 7, 12] : [0, 4, 7, 12];
        for (let k = 0; k < 16; k++)
          note(
            t + k * STEP,
            STEP * 0.6,
            b < 4 ? 0.045 : 0.065,
            (x) => pulse(x, 0.125),
            mtof(ar + tri3[k % 4] + (k >= 8 && b % 2 ? 12 : 0)),
            { dec: 0.05, sus: 0.3, rel: 0.02 },
          );
      }
      // a low sustained drone on the root, for dread
      note(t, barT * 0.98, 0.05, (x) => pulse(x, 0.25), mtof(br + 24), {
        att: 0.3,
        rel: 0.3,
      });
      // drums: kick on 1 & 3, snare on 2 & 4 from bar 5, hats from bar 9, a fill in bar 16
      drum(t, "k");
      drum(t + 2 * beat, "k");
      if (b >= 4) {
        drum(t + beat, "s");
        drum(t + 3 * beat, "s");
      }
      if (b >= 8) for (let k = 0; k < 8; k++) drum(t + k * 2 * STEP + STEP, "h");
      if (b === 15) {
        drum(t + 3.5 * beat, "s");
        drum(t + 3.75 * beat, "s");
        drum(t + 2.5 * beat, "k");
      }
      // lead from bar 5: 50% square with delayed vibrato
      if (b >= 4) {
        let o = 0;
        for (const [m, len] of LEAD[b - 4]) {
          note(t + o * beat, len * beat * 0.92, 0.13, (x) => pulse(x, 0.5), mtof(m), {
            att: 0.01,
            dec: 0.25,
            sus: 0.7,
            rel: 0.06,
            vib: 0.008,
          });
          note(t + o * beat + 0.19, len * beat * 0.8, 0.035, (x) => pulse(x, 0.5), mtof(m), { att: 0.01, rel: 0.06 }); // faint echo
          o += len;
        }
      }
    });
    // gentle 6-bit-ish crush for the console grit, then headroom
    let pk = 0;
    for (let i = 0; i < LEN; i++) pk = Math.max(pk, Math.abs(out[i]));
    const g = 0.8 / Math.max(0.8, pk);
    for (let i = 0; i < LEN; i++) out[i] = Math.round(out[i] * g * 40) / 40;
    return out;
  }

  /* ---------- recipes: [duration, generator] ---------- */
  const R = {
    gun: [
      0.07,
      (t, s) => lp(s, 0.5, rnd()) * Math.exp(-t * 70) * 0.7 + Math.sin(ph(s, 1400)) * Math.exp(-t * 90) * 0.25,
    ],
    cannon: [
      0.35,
      (t, s) =>
        Math.sin(ph(s, sweep(t, 130, 45, 0.25))) * Math.exp(-t * 9) * 0.9 +
        lp(s, 0.12, rnd()) * Math.exp(-t * 22) * 1.2,
    ],
    missile: [
      0.45,
      (t, s) =>
        lp(s, 0.25, rnd()) * Math.min(1, t * 20) * Math.exp(-t * 6) * 0.9 +
        Math.sin(ph(s, sweep(t, 300, 700, 0.4))) * Math.exp(-t * 7) * 0.15,
    ],
    plasma: [0.25, (t, s) => (((ph(s, sweep(t, 900, 180, 0.22)) / 6.2832) % 1) * 2 - 1) * Math.exp(-t * 12) * 0.45],
    rail: [
      0.4,
      (t, s) => rnd() * Math.exp(-t * 45) * 0.8 + Math.sin(ph(s, sweep(t, 3200, 400, 0.35))) * Math.exp(-t * 7) * 0.3,
    ],
    arty: [
      0.6,
      (t, s) =>
        Math.sin(ph(s, sweep(t, 95, 30, 0.5))) * Math.exp(-t * 6) * 1 + lp(s, 0.08, rnd()) * Math.exp(-t * 12) * 1.5,
    ],
    frost: [
      0.5,
      (t, s) =>
        (Math.sin(t * 6.2832 * 1800) + Math.sin(t * 6.2832 * 2400) * 0.7 + Math.sin(t * 6.2832 * 3150) * 0.5) *
        Math.exp(-t * 6) *
        (0.7 + 0.3 * Math.sin(t * 60)) *
        0.18,
    ],
    freeze: [
      0.6,
      (t, s) =>
        Math.sin(ph(s, sweep(t, 2600, 700, 0.5))) * Math.exp(-t * 4) * 0.3 +
        (rand() < 0.02 ? rnd() * 0.6 : 0) * Math.exp(-t * 3),
    ],
    boom: [
      0.4,
      (t, s) => lp(s, 0.15, rnd()) * Math.exp(-t * 9) * 1.3 + Math.sin(t * 6.2832 * 70) * Math.exp(-t * 12) * 0.5,
    ],
    bigboom: [
      0.9,
      (t, s) =>
        lp(s, 0.08, rnd()) * Math.exp(-t * 4.5) * 1.8 + Math.sin(ph(s, sweep(t, 60, 35, 0.6))) * Math.exp(-t * 5) * 0.7,
    ],
    nuke: [
      2.4,
      (t, s) => {
        const r = lp(s, 0.04, rnd(), "a");
        return (r * 2.6 + Math.sin(ph(s, sweep(t, 45, 25, 2))) * 0.8) * Math.min(1, t * 15) * Math.exp(-t * 1.5);
      },
    ],
    pop: [
      0.12,
      (t, s) =>
        Math.sin(ph(s, sweep(t, 520, 140, 0.1))) * Math.exp(-t * 30) * 0.5 +
        lp(s, 0.4, rnd()) * Math.exp(-t * 50) * 0.2,
    ],
    bosskill: [
      1,
      (t, s) =>
        sq(ph(s, sweep(t, 320, 50, 0.9))) * Math.exp(-t * 3) * 0.25 + lp(s, 0.1, rnd()) * Math.exp(-t * 4) * 1.2,
    ],
    leak: [
      0.4,
      (t, s) => sq(t * 6.2832 * (t < 0.18 ? 880 : 660)) * (t < 0.16 || t > 0.2 ? 1 : 0) * Math.exp(-t * 2) * 0.22,
    ],
    wave: [
      0.8,
      (t, s) => {
        const v = 1 + 0.01 * Math.sin(t * 35),
          a = Math.min(1, t * 12) * Math.exp(-Math.max(0, t - 0.45) * 8);
        return (
          ((((t * 220 * v) % 1) * 2 - 1) * 0.35 + (((t * 330 * v) % 1) * 2 - 1) * 0.25) * lp(s, 0.3, 1, "e") * a * 0.6
        );
      },
    ],
    cleared: [
      0.55,
      (t, s) => {
        const f = t < 0.12 ? 660 : t < 0.24 ? 880 : 1320;
        return Math.sin(ph(s, f)) * Math.exp(-(t % 0.12 || 0) * 10) * Math.exp(-t * 2) * 0.35;
      },
    ],
    build: [0.1, (t, s) => rnd() * Math.exp(-t * 90) * 0.5 + Math.sin(t * 6.2832 * 1500) * Math.exp(-t * 60) * 0.3],
    upgrade: [0.3, (t, s) => Math.sin(ph(s, sweep(t, 500, 1300, 0.25))) * Math.exp(-t * 7) * 0.35],
    ult: [
      0.9,
      (t, s) => {
        const f = [523, 659, 784, 1047][Math.min(3, Math.floor(t / 0.12))];
        return (
          sq(ph(s, f)) * 0.12 * Math.exp(-(t % 0.12) * 6) * Math.exp(-Math.max(0, t - 0.36) * 3) +
          Math.sin(ph(s, f * 2, "q")) * 0.1 * Math.exp(-t * 2)
        );
      },
    ],
    sell: [0.25, (t, s) => Math.sin(ph(s, t < 0.08 ? 1300 : 1750)) * Math.exp(-(t % 0.08) * 25) * 0.35],
    error: [0.2, (t, s) => sq(t * 6.2832 * 140) * Math.exp(-t * 8) * 0.18],
    stasis: [
      1.1,
      (t, s) =>
        Math.sin(ph(s, sweep(t, 1400, 200, 1))) * Math.exp(-t * 2) * 0.3 +
        Math.sin(t * 6.2832 * 3000) * (0.5 + 0.5 * Math.sin(t * 40)) * Math.exp(-t * 3) * 0.06,
    ],
    meteorcast: [0.7, (t, s) => lp(s, sweep(t, 0.5, 0.05, 0.6), rnd()) * Math.min(1, t * 6) * Math.exp(-t * 3) * 1.2],
    fire: [
      0.9,
      (t, s) => (lp(s, 0.2, rnd()) * 0.6 + (rand() < 0.015 ? rnd() : 0)) * Math.min(1, t * 8) * Math.exp(-t * 2.5),
    ],
    plane: [
      1.8,
      (t, s) => {
        const a = Math.sin((Math.PI * t) / 1.8);
        return (lp(s, 0.1, rnd()) * 0.9 + Math.sin(ph(s, 105 + 15 * a)) * 0.3) * a * a;
      },
    ],
    siren: [
      1.5,
      (t, s) =>
        Math.sin(ph(s, 750 + 150 * Math.sin(t * 6.2832 * 2))) *
        Math.min(1, t * 10) *
        Math.exp(-Math.max(0, t - 1.1) * 8) *
        0.3,
    ],
    heal: [0.3, (t, s) => Math.sin(ph(s, sweep(t, 700, 1050, 0.25))) * Math.min(1, t * 30) * Math.exp(-t * 8) * 0.25],
    blink: [0.18, (t, s) => Math.sin(ph(s, sweep(t, 2200, 400, 0.15))) * Math.exp(-t * 18) * 0.3],
    victory: [
      1.6,
      (t, s) => {
        const f = [523, 659, 784, 1047, 1047][Math.min(4, Math.floor(t / 0.18))];
        return (
          (Math.sin(ph(s, f)) * 0.3 + sq(ph(s, f / 2, "q")) * 0.06) *
          Math.exp(-(t % 0.18) * 3) *
          Math.exp(-Math.max(0, t - 0.9) * 3)
        );
      },
    ],
    defeat: [
      1.6,
      (t, s) => {
        const f = [392, 349, 311, 233][Math.min(3, Math.floor(t / 0.3))];
        return (
          (Math.sin(ph(s, f)) * 0.3 + sq(ph(s, f / 2, "q")) * 0.07) *
          Math.exp(-(t % 0.3) * 2) *
          Math.exp(-Math.max(0, t - 1.2) * 4)
        );
      },
    ],
    laser: [
      1,
      (t, s) =>
        (Math.sin(t * 6.2832 * 220) * 0.4 +
          Math.sin(t * 6.2832 * 440) * 0.2 +
          Math.sin(t * 6.2832 * 110) * 0.25 +
          lp(s, 0.3, rnd()) * 0.08) *
        0.5,
    ],
  };
  /* ---------- mixing rules: base volume, min interval (s), voices, priority ---------- */
  const MIX = {
    gun: [0.16, 0.12, 3, 0],
    cannon: [0.3, 0.2, 3, 0],
    missile: [0.25, 0.2, 3, 0],
    plasma: [0.22, 0.18, 3, 0],
    rail: [0.3, 0.25, 2, 1],
    arty: [0.4, 0.35, 2, 1],
    frost: [0.16, 0.6, 2, 0],
    freeze: [0.28, 1, 1, 1],
    boom: [0.26, 0.15, 4, 0],
    bigboom: [0.45, 0.3, 3, 1],
    nuke: [0.9, 0, 2, 3],
    pop: [0.2, 0.12, 4, 0],
    bosskill: [0.6, 0, 2, 2],
    leak: [0.5, 0.25, 2, 3],
    wave: [0.4, 0, 1, 2],
    cleared: [0.4, 0, 1, 2],
    build: [0.35, 0.05, 2, 2],
    upgrade: [0.35, 0.05, 2, 2],
    ult: [0.5, 0, 1, 3],
    sell: [0.35, 0.05, 1, 2],
    error: [0.3, 0.2, 1, 2],
    stasis: [0.55, 0, 1, 3],
    meteorcast: [0.5, 0, 1, 3],
    fire: [0.45, 0, 1, 3],
    plane: [0.5, 0, 1, 3],
    siren: [0.45, 0, 1, 3],
    heal: [0.1, 0.6, 1, 0],
    blink: [0.18, 0.3, 1, 0],
    victory: [0.7, 0, 1, 4],
    defeat: [0.7, 0, 1, 4],
  };
  const LOW_BUDGET = 2; // low-priority plays per 100 ms (≤20 per second)
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch (e) {}
    },
  };
  const audio = {
    ok: typeof Howl !== "undefined",
    muted: store.get("xt-mute") === "1",
    volume: Math.max(0, Math.min(1, +(store.get("xt-vol") ?? 0.7))),
  };
  if (isNaN(audio.volume)) audio.volume = 0.7;
  audio.musicVolume = Math.max(0, Math.min(1, +(store.get("xt-mvol") ?? 0.5)));
  if (isNaN(audio.musicVolume)) audio.musicVolume = 0.5;
  const MUSIC_GAIN = 0.55;
  let musicHowl = null,
    musicId = null;
  function startMusic() {
    if (!musicHowl || audio.musicVolume <= 0) return;
    musicHowl.volume(audio.musicVolume * MUSIC_GAIN); // whole howl, not one id
    if (musicHowl.playing()) return;
    // one instance only: resume the same sound instead of stacking new copies
    musicId = musicId === null ? musicHowl.play() : musicHowl.play(musicId);
  }
  function buildMusic() {
    if (musicHowl) return;
    musicHowl = new Howl({
      src: [toWav(composeMusic(), MSR, true)],
      format: ["wav"],
      loop: true,
      volume: audio.musicVolume * MUSIC_GAIN,
    });
    startMusic();
  }
  const howls = {},
    last = {},
    pending = new Map();
  let budgetT = 0,
    budget = 0,
    busy = 0,
    laserHowl = null,
    laserId = null,
    laserVol = 0,
    ready = false;

  function init() {
    if (!audio.ok || ready) return;
    ready = true;
    for (const k in MIX) {
      const [dur, fn] = R[k];
      howls[k] = new Howl({
        src: [toWav(synth(dur, fn))],
        format: ["wav"],
        volume: MIX[k][0],
        pool: MIX[k][2],
      });
    }
    laserHowl = new Howl({
      src: [toWav(synth(...R.laser))],
      format: ["wav"],
      loop: true,
      volume: 0,
    });
    Howler.volume(1);
    Howler.mute(audio.muted);
    later(buildMusic, 400); // compose after the first frame is up
    // browsers start audio only after a gesture; make sure the loop is running then
    const kick = () => {
      Howler.ctx && Howler.ctx.state === "suspended" && Howler.ctx.resume();
      startMusic();
    };
    addEventListener("pointerdown", kick);
    addEventListener("keydown", kick);
  }
  // queue a sound for this frame; n merges repeated events
  function play(name, n = 1) {
    if (!audio.ok) return;
    pending.set(name, (pending.get(name) || 0) + n);
  }
  function flush(now) {
    if (now - budgetT > 0.1) {
      budgetT = now;
      budget = 0;
    }
    busy = busy * 0.9;
    const items = [...pending.entries()].sort((a, b) => MIX[b[0]][3] - MIX[a[0]][3]);
    pending.clear();
    for (const [name, n] of items) {
      const [vol, gap, , prio] = MIX[name];
      if (gap && now - (last[name] || -9) < gap) continue; // too soon: merged into the next play
      if (prio === 0) {
        if (budget >= LOW_BUDGET) continue;
        budget++;
        busy += n;
      }
      last[name] = now;
      audio.stats[name] = (audio.stats[name] || 0) + 1;
      const h = howls[name];
      if (!h) continue;
      // louder for merged events, quieter when the field is busy
      const boost = Math.min(1.6, 1 + 0.25 * Math.log2(n));
      const duck = prio === 0 ? 1 / Math.sqrt(1 + busy / 8) : 1;
      const id = h.play();
      h.volume(Math.min(1, vol * boost * duck) * audio.volume, id);
      h.rate(0.92 + rand() * 0.16, id);
    }
  }
  function updateLaser(dt) {
    if (!laserHowl) return;
    const S = XT.core.S;
    let beams = 0;
    if (S && !S.over) for (const t of S.towers) if (t.beam) beams += t.beam.length;
    const target = beams ? Math.min(0.32, 0.12 + 0.05 * Math.sqrt(beams)) : 0;
    laserVol += (target - laserVol) * Math.min(1, dt * 8);
    if (laserVol > 0.005) {
      if (laserId === null || !laserHowl.playing(laserId)) laserId = laserHowl.play();
      laserHowl.volume(laserVol * audio.volume, laserId);
    } else if (laserId !== null) {
      laserHowl.stop(laserId);
      laserId = null;
    }
  }
  let clock = 0;
  // called once per animation frame with real elapsed time
  audio.update = function (dt, paused) {
    if (!audio.ok) return;
    clock += dt;
    if (paused) {
      pending.clear();
      if (laserId !== null) {
        laserHowl.stop(laserId);
        laserId = null;
        laserVol = 0;
      }
      return;
    }
    flush(clock);
    updateLaser(dt);
  };
  audio.play = play;
  audio.stats = {};
  audio._synth = (k) => synth(...R[k]); // for testing
  audio.setMuted = (m) => {
    audio.muted = m;
    store.set("xt-mute", m ? "1" : "0");
    if (audio.ok) Howler.mute(m);
  };
  audio.setVolume = (v) => {
    audio.volume = v;
    store.set("xt-vol", String(v));
  };
  audio.setMusicVolume = (v) => {
    audio.musicVolume = v;
    store.set("xt-mvol", String(v));
    if (!musicHowl) return;
    musicHowl.volume(v * MUSIC_GAIN);
    if (v <= 0) musicHowl.pause();
    else startMusic();
  };
  audio._music = composeMusic; // for testing
  audio.musicPlaying = () => !!(musicHowl && musicHowl.playing());
  audio._musicCount = () => (musicHowl ? musicHowl._sounds.filter((x) => !x._paused && !x._ended).length : 0);

  /* ---------- core events → sounds ---------- */
  const SHOT = {
    gun: "gun",
    cannon: "cannon",
    missile: "missile",
    plasma: "plasma",
    rail: "rail",
    artillery: "arty",
  };
  const SMALL = { shell: 1, bomblet: 1, missile: 1, plasma: 1 },
    BIG = { artillery: 1, meteor: 1, bomb: 1 };
  const CAST = {
    stasis: "stasis",
    meteor: "meteorcast",
    napalm: "fire",
    carpet: "plane",
    nuke: "siren",
  };
  if (audio.ok) {
    init();
    XT.core.on((e) => {
      switch (e.type) {
        case "shot":
          if (SHOT[e.tower.type]) play(SHOT[e.tower.type]);
          break;
        case "pulse":
          play(e.freeze ? "freeze" : "frost");
          break;
        case "explode":
          play(SMALL[e.kind] ? "boom" : BIG[e.kind] ? "bigboom" : "nuke");
          break;
        case "kill":
          play(e.creep.boss ? "bosskill" : "pop");
          break;
        case "leak":
          play("leak");
          break;
        case "wave":
          play("wave");
          break;
        case "toast":
          if (e.key === "cleared") play("cleared");
          break;
        case "built":
          play("build");
          break;
        case "upgraded":
          play(e.tower.lvl === 4 && !e.tower.oc ? "ult" : "upgrade");
          break;
        case "sold":
          play("sell");
          break;
        case "cast":
          play(CAST[e.ability]);
          break;
        case "heal":
          play("heal");
          break;
        case "blink":
          play("blink");
          break;
        case "end":
          play(e.won ? "victory" : "defeat");
          break;
        case "reset":
          pending.clear();
          break;
      }
    });
  }
  XT.audio = audio;
}
