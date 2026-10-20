import { describe, it, expect } from "vitest";
import { createHowlerOut } from "../../src/audio/howlerOut";
import { encodeWav, wavDataUri } from "../../src/audio/wav";
import { fakeHowler } from "../helpers/howler";

const samples = new Float32Array(100).fill(0.2);

describe("howler backend", () => {
  it("is unavailable without howler.js", () => {
    const out = createHowlerOut({});
    expect(out.available).toBe(false);
    expect(() => out.setMuted(true)).not.toThrow();
  });

  it("sets the master volume to 1 and passes mute through", () => {
    const h = fakeHowler();
    const out = createHowlerOut(h);
    expect(out.available).toBe(true);
    expect(h.Howler.vol).toBe(1);
    out.setMuted(true);
    expect(h.Howler.muted).toBe(true);
  });

  it("a sound is a WAV data URI with a voice pool; play sets volume and rate on the new id", () => {
    const h = fakeHowler();
    const s = createHowlerOut(h).loadSound(samples, 22050, { volume: 0.3, voices: 4 });
    const howl = h.howls[0];
    expect(howl.o).toMatchObject({ format: ["wav"], volume: 0.3, pool: 4 });
    expect(howl.o.src[0]).toMatch(/^data:audio\/wav;base64,/);
    s.play(0.5, 1.05);
    expect(howl.calls).toEqual([
      ["play", 1],
      ["volume", 0.5, 1],
      ["rate", 1.05, 1],
    ]);
  });

  describe("loops", () => {
    const loop = (opts: { volume: number; fadeEdges?: boolean } = { volume: 0.2 }) => {
      const h = fakeHowler();
      const l = createHowlerOut(h).loadLoop(samples, 16000, opts);
      return { h, l, howl: h.howls[0] };
    };

    it("is a looping howl at the given volume", () => {
      const { howl } = loop();
      expect(howl.o).toMatchObject({ loop: true, volume: 0.2, format: ["wav"] });
    });

    it("plays after the first tap even when pauses were queued behind the blocked start (volume swept through 0)", () => {
      const { l, howl } = loop();
      howl.locked = true; // the browser still blocks audio: howler queues every pause behind the pending play
      l.play();
      l.pause(); // the slider went to 0
      l.play(); // and back up
      l.pause();
      l.play(); // the last request is "play"
      howl.unlock(); // the first tap: the queued pauses run
      expect(l.isPlaying()).toBe(true);
      expect(l.copies()).toBe(1);
      expect(howl._sounds).toHaveLength(1); // the same sound, not a second copy
    });

    it("a pause that is really the last request stays a pause, even when it was queued", () => {
      const { l, howl } = loop();
      howl.locked = true;
      l.play();
      l.pause();
      howl.unlock();
      expect(l.isPlaying()).toBe(false);
    });

    it("play never stacks: while playing it does nothing, after a pause it resumes the same sound by id", () => {
      const { l, howl } = loop();
      l.play();
      l.play();
      l.play();
      expect(howl.calls.filter((c) => c[0] === "play")).toEqual([["play", 1]]);
      expect(l.copies()).toBe(1);
      l.pause();
      expect(l.isPlaying()).toBe(false);
      l.play();
      expect(howl.calls.filter((c) => c[0] === "play")).toEqual([
        ["play", 1],
        ["play", 1],
      ]); // the same id
      expect(howl._sounds).toHaveLength(1); // resumed, not a second sound
    });

    it("stop forgets the sound: the next play starts a fresh one", () => {
      const { l, howl } = loop();
      l.play();
      l.stop();
      l.play();
      expect(howl.calls.filter((c) => c[0] === "play")).toEqual(
        [
          ["play", 1],
          ["play", undefined],
        ]
          .slice(0, 1)
          .concat([["play", 2]]),
      );
      expect(howl.calls).toContainEqual(["stop", 1]);
    });

    it("volume applies to the whole howl, not one id", () => {
      const { l, howl } = loop();
      l.setVolume(0.4);
      expect(howl.calls).toContainEqual(["volume", 0.4, undefined]);
    });

    it("fadeEdges decides whether the WAV gets edge fades", () => {
      const seamless = loop({ volume: 0.1 }).howl.o.src[0];
      const faded = loop({ volume: 0.1, fadeEdges: true }).howl.o.src[0];
      expect(seamless).not.toBe(faded);
    });
  });

  it("a user gesture resumes a suspended audio context, then calls back (clicks and key presses)", () => {
    const h = fakeHowler();
    let calls = 0;
    createHowlerOut(h).onUserGesture(() => calls++);
    expect(Object.keys(h.listeners).sort()).toEqual(["keydown", "pointerdown"]);
    h.listeners.pointerdown[0]();
    expect(h.Howler.ctx!.state).toBe("running");
    h.listeners.keydown[0]();
    expect(calls).toBe(2);
  });
});

describe("WAV encoding", () => {
  it("writes a valid 16-bit mono header", () => {
    const b = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 22050);
    const s = (o, n) => String.fromCharCode(...b.slice(o, o + n));
    expect([s(0, 4), s(8, 4), s(12, 4), s(36, 4)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    const v = new DataView(b.buffer);
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8);
    expect(b.length).toBe(44 + 8);
  });

  it("soft-limits loud samples below full scale", () => {
    const b = encodeWav(new Float32Array(2000).fill(9), 22050, true);
    const v = new DataView(b.buffer);
    expect(v.getInt16(44 + 1000 * 2, true)).toBeLessThanOrEqual(32000);
    expect(v.getInt16(44 + 1000 * 2, true)).toBeGreaterThan(30000);
  });

  it("fades the edges of non-looping sounds against clicks, but not loops", () => {
    const flat = new Float32Array(2000).fill(0.5);
    const first = (loop) => new DataView(encodeWav(flat, 22050, loop).buffer).getInt16(44, true);
    expect(first(false)).toBe(0);
    expect(Math.abs(first(true))).toBeGreaterThan(1000);
  });

  it("the data URI decodes back to the same bytes", () => {
    const a = new Float32Array([0.1, -0.2, 0.3]);
    const uri = wavDataUri(a, 22050);
    expect(uri.startsWith("data:audio/wav;base64,")).toBe(true);
    const bytes = Uint8Array.from(Buffer.from(uri.split(",")[1], "base64"));
    expect(bytes).toEqual(encodeWav(a, 22050));
  });
});
