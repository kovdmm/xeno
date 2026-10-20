// The howler.js backend: the only file that knows about Howl and Howler. Sounds are handed over as WAV
// data URIs, so no audio files are shipped.
import type { AudioOut, LoopHandle, SoundHandle } from "./out";
import { wavDataUri } from "./wav";

/** The pieces of the browser/howler environment the backend uses (all optional: without Howl it is unavailable). */
export interface HowlerEnv {
  Howl?: any;
  Howler?: any;
  addEventListener?: (type: string, fn: () => void) => void;
}

export function createHowlerOut(env: HowlerEnv): AudioOut {
  const { Howl, Howler } = env;
  const available = typeof Howl !== "undefined";
  if (available) Howler.volume(1);

  return {
    available,

    setMuted(muted) {
      if (available) Howler.mute(muted);
    },

    loadSound(samples, sampleRate, { volume, voices }): SoundHandle {
      const howl = new Howl({ src: [wavDataUri(samples, sampleRate)], format: ["wav"], volume, pool: voices });
      return {
        play(vol, rate) {
          const id = howl.play();
          howl.volume(vol, id);
          howl.rate(rate, id);
        },
      };
    },

    loadLoop(samples, sampleRate, { volume, fadeEdges }): LoopHandle {
      const howl = new Howl({
        src: [wavDataUri(samples, sampleRate, !fadeEdges)],
        format: ["wav"],
        loop: true,
        volume,
      });
      let id: number | null = null;
      // What the player last asked for. While the browser still blocks audio (before the first tap) howler holds
      // the play and queues every pause behind it; when the context resumes the sound starts and the queued pauses
      // run right after, so the loop would end up paused although the last request was "play".
      let wanted = false;
      const play = () => {
        if (howl.playing()) return;
        id = id === null ? howl.play() : howl.play(id);
      };
      howl.on("pause", () => {
        if (wanted) play();
      });
      return {
        // one instance only: resume the same sound instead of stacking new copies
        play() {
          wanted = true;
          play();
        },
        pause() {
          wanted = false;
          howl.pause();
        },
        stop() {
          wanted = false;
          if (id !== null) howl.stop(id);
          id = null;
        },
        setVolume(v) {
          howl.volume(v); // the whole howl, not one id
        },
        isPlaying: () => howl.playing(),
        copies: () => howl._sounds.filter((s: any) => !s._paused && !s._ended).length,
      };
    },

    onUserGesture(cb) {
      const kick = () => {
        Howler.ctx && Howler.ctx.state === "suspended" && Howler.ctx.resume();
        cb();
      };
      env.addEventListener?.("pointerdown", kick);
      env.addEventListener?.("keydown", kick);
    },
  };
}
