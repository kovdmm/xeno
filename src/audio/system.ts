// The audio system: wires the parts together. Game events become cues, the mixer decides what plays, the
// bank provides the sounds, the music player keeps the loop going, and the backend (AudioOut) makes noise.
import type { GameEvent, Rng } from "../game/types";
import { composeSong, renderSettings, type SongSpec } from "./music/composer";
import { renderScore } from "./music/render";
import { MusicPlayer } from "./music/player";
import { SINISTER } from "./music/songs/sinister";
import type { AudioOut, KeyValueStore } from "./out";
import { loadSettings, saveSetting } from "./settings";
import { SoundBank } from "./sfx/bank";
import { cueOf } from "./sfx/cues";
import { HUM_AUDIBLE, LaserHum } from "./sfx/laser";
import { MIX_RULES } from "./sfx/mixRules";
import { Mixer } from "./sfx/mixer";
import { SFX_RATE, createRecipes, synth } from "./sfx/recipes";
import type { LoopHandle } from "./out";

export interface AudioDeps {
  out: AudioOut;
  storage: KeyValueStore;
  /** randomness of the sound (noise in effects, playback-rate jitter) */
  rng: Rng;
  /** runs `fn` later (setTimeout); tests pass a controllable one */
  schedule: (fn: () => void, ms: number) => void;
  /** how many laser beams are firing right now */
  beams?: () => number;
  song?: SongSpec;
}

export interface AudioSystem {
  /** false when there is no playback backend: everything below still works, silently */
  readonly ok: boolean;
  readonly muted: boolean;
  readonly volume: number;
  readonly musicVolume: number;
  /** requests a sound this frame (see `update`) */
  play(name: string, n?: number): void;
  /** a game event: plays its cue, if it has one */
  handleEvent(e: GameEvent): void;
  /** once per animation frame with the real elapsed time; `paused` silences everything */
  update(dt: number, paused: boolean): void;
  setMuted(m: boolean): void;
  setVolume(v: number): void;
  setMusicVolume(v: number): void;
  musicPlaying(): boolean;
  musicCopies(): number;
  readonly stats: Record<string, number>;
}

/** wait this long after start before composing the music, so the first frame is not delayed */
const MUSIC_DELAY_MS = 400;

export function createAudioSystem(deps: AudioDeps): AudioSystem {
  const { out, storage, schedule } = deps;
  const ok = out.available;
  const settings = loadSettings(storage);
  const mixer = new Mixer(MIX_RULES, deps.rng);
  const recipes = createRecipes(deps.rng);
  const bank = new SoundBank(out, recipes, MIX_RULES);
  const hum = new LaserHum();
  let humLoop: LoopHandle | null = null;
  let clock = 0;

  const song = deps.song ?? SINISTER;
  const render = renderSettings(song);
  const music = new MusicPlayer(
    out,
    () => renderScore(composeSong(song), render),
    render.sampleRate,
    () => settings.musicVolume,
  );

  if (ok) {
    out.setMuted(settings.muted);
    bank.warmUp(schedule);
    schedule(() => music.build(), MUSIC_DELAY_MS);
    out.onUserGesture(() => music.start()); // browsers start audio only after a gesture
  }

  function updateLaser(dt: number): void {
    const beams = deps.beams ? deps.beams() : 0;
    const v = hum.update(dt, beams);
    if (v > HUM_AUDIBLE) {
      humLoop ??= out.loadLoop(synth(recipes.laser), SFX_RATE, { volume: 0, fadeEdges: true });
      if (!humLoop.isPlaying()) humLoop.play();
      humLoop.setVolume(v * settings.volume);
    } else if (humLoop && humLoop.isPlaying()) humLoop.stop();
  }

  return {
    ok,
    get muted() {
      return settings.muted;
    },
    get volume() {
      return settings.volume;
    },
    get musicVolume() {
      return settings.musicVolume;
    },
    stats: mixer.stats,

    play(name, n = 1) {
      if (ok) mixer.request(name, n);
    },

    handleEvent(e) {
      if (!ok) return;
      if (e.type === "reset") return mixer.clear();
      const cue = cueOf(e);
      if (cue) mixer.request(cue);
    },

    update(dt, paused) {
      if (!ok) return;
      clock += dt;
      if (paused) {
        mixer.clear();
        if (humLoop && humLoop.isPlaying()) humLoop.stop();
        hum.reset();
        return;
      }
      for (const p of mixer.flush(clock)) bank.get(p.name).play(p.volume * settings.volume, p.rate);
      updateLaser(dt);
    },

    setMuted(m) {
      settings.muted = m;
      saveSetting(storage, "muted", m);
      if (ok) out.setMuted(m);
    },

    setVolume(v) {
      settings.volume = v;
      saveSetting(storage, "volume", v);
    },

    setMusicVolume(v) {
      settings.musicVolume = v;
      saveSetting(storage, "musicVolume", v);
      music.volumeChanged();
    },

    musicPlaying: () => music.playing(),
    musicCopies: () => music.copies(),
  };
}
