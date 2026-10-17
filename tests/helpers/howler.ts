// A stand-in for howler.js: records what the game asks for and models Howl's play-by-id behaviour.
// Shared by the tests of the howler backend and of the audio wiring.

/** The options the game passes to `new Howl(...)`. */
export interface HowlOptions {
  src: string[];
  format: string[];
  volume: number;
  pool?: number;
  loop?: boolean;
  [key: string]: unknown;
}

export class FakeHowl {
  /** what `play`, `volume`, `rate`, `stop` and `pause` were called with, in order */
  calls: unknown[][] = [];
  private n = 0;
  /** id → { _paused, _ended }, like Howler's own sound pool */
  readonly map = new Map<number, { _paused: boolean; _ended: boolean }>();

  constructor(
    readonly o: HowlOptions,
    registry: FakeHowl[],
  ) {
    registry.push(this);
  }

  get _sounds() {
    return [...this.map.values()];
  }
  play(id?: number): number {
    id = id ?? ++this.n;
    const s = this.map.get(id) ?? { _paused: false, _ended: false };
    s._paused = false;
    this.map.set(id, s);
    this.calls.push(["play", id]);
    return id;
  }
  volume(v: number, id?: number) {
    this.calls.push(["volume", v, id]);
  }
  rate(r: number, id?: number) {
    this.calls.push(["rate", r, id]);
  }
  playing(id?: number): boolean {
    const live = (s: { _paused: boolean; _ended: boolean }) => !s._paused && !s._ended;
    return id === undefined ? [...this.map.values()].some(live) : !!this.map.get(id) && live(this.map.get(id)!);
  }
  stop(id?: number) {
    if (id !== undefined) this.map.delete(id);
    this.calls.push(["stop", id]);
  }
  pause() {
    for (const s of this.map.values()) s._paused = true;
    this.calls.push(["pause"]);
  }
}

export interface FakeHowlerGlobal {
  muted: boolean | null;
  vol: number | null;
  ctx: { state: string; resume(): void } | null;
  volume(v: number): void;
  mute(m: boolean): void;
}

/** What the backend needs from the page: the two howler globals and `addEventListener`. */
export function fakeHowler() {
  const howls: FakeHowl[] = [];
  const Howl = class extends FakeHowl {
    constructor(o: HowlOptions) {
      super(o, howls);
    }
  };
  const Howler: FakeHowlerGlobal = {
    muted: null,
    vol: null,
    ctx: {
      state: "suspended",
      resume() {
        this.state = "running";
      },
    },
    volume(v) {
      Howler.vol = v;
    },
    mute(m) {
      Howler.muted = m;
    },
  };
  const listeners: Record<string, (() => void)[]> = {};
  return {
    Howl,
    Howler,
    howls,
    listeners,
    addEventListener: (t: string, f: () => void) => void (listeners[t] ||= []).push(f),
  };
}

/** The globals the audio wiring finds on the page: Howl, a minimal Howler, localStorage. */
export function fakeGlobals() {
  const howls: FakeHowl[] = [];
  const store: Record<string, string> = {};
  const Howl = class extends FakeHowl {
    constructor(o: HowlOptions) {
      super(o, howls);
    }
  };
  const Howler = { volume() {}, mute() {}, ctx: null };
  const localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => void (store[k] = String(v)),
  };
  return { Howl, Howler, localStorage, howls, store };
}
