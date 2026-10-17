// Test doubles for the audio system: an in-memory backend that models the AudioOut contract, a memory key-value
// store and a controllable scheduler.
import type { AudioOut, KeyValueStore, LoopHandle, SoundHandle } from "../../src/audio/out";

export interface FakeSound extends SoundHandle {
  samples: Float32Array;
  sampleRate: number;
  opts: { volume: number; voices: number };
  plays: { volume: number; rate: number }[];
}

export interface FakeLoop extends LoopHandle {
  samples: Float32Array;
  sampleRate: number;
  opts: { volume: number; fadeEdges?: boolean };
  volume: number;
  playing: boolean;
  /** how many times a copy actually began */
  starts: number;
  pauses: number;
  stops: number;
}

export interface FakeOut extends AudioOut {
  available: boolean;
  muted: boolean | null;
  sounds: FakeSound[];
  loops: FakeLoop[];
  gestures: (() => void)[];
}

/** A backend that records everything and plays nothing. Loops obey the contract: `play` never stacks a copy. */
export function fakeOut({ available = true } = {}): FakeOut {
  const out: FakeOut = {
    available,
    muted: null,
    sounds: [],
    loops: [],
    gestures: [],
    setMuted(m) {
      out.muted = m;
    },
    loadSound(samples, sampleRate, opts) {
      const h: FakeSound = {
        samples,
        sampleRate,
        opts,
        plays: [],
        play: (volume, rate) => void h.plays.push({ volume, rate }),
      };
      out.sounds.push(h);
      return h;
    },
    loadLoop(samples, sampleRate, opts) {
      const h: FakeLoop = {
        samples,
        sampleRate,
        opts,
        volume: opts.volume,
        playing: false,
        starts: 0,
        pauses: 0,
        stops: 0,
        play() {
          if (h.playing) return;
          h.playing = true;
          h.starts++;
        },
        pause() {
          if (h.playing) h.pauses++;
          h.playing = false;
        },
        stop() {
          if (h.playing) h.stops++;
          h.playing = false;
        },
        setVolume(v) {
          h.volume = v;
        },
        isPlaying: () => h.playing,
        copies: () => (h.playing ? 1 : 0),
      };
      out.loops.push(h);
      return h;
    },
    onUserGesture(cb) {
      out.gestures.push(cb);
    },
  };
  return out;
}

export interface MemoryStore extends KeyValueStore {
  data: Record<string, string>;
}

export function memoryStore(initial: Record<string, string> = {}): MemoryStore {
  const data = { ...initial };
  return { data, get: (k) => (k in data ? data[k] : null), set: (k, v) => void (data[k] = String(v)) };
}

/** A scheduler that runs nothing until asked: `run()` executes everything queued, including what that queues. */
export function manualScheduler() {
  const queue: { fn: () => void; ms: number }[] = [];
  return {
    schedule: (fn: () => void, ms: number) => void queue.push({ fn, ms }),
    pending: () => queue.length,
    delays: () => queue.map((q) => q.ms),
    run(limit = 1000) {
      for (let i = 0; queue.length && i < limit; i++) queue.shift()!.fn();
    },
  };
}

/** FNV-1a over the samples scaled to integers: a short fingerprint of a rendered loop. */
export function fingerprint(samples: ArrayLike<number>, scale = 40): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < samples.length; i++) {
    h ^= Math.round(samples[i] * scale) & 0xffff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}
