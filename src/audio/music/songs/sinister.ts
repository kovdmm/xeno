// "Sinister": the game's loop. D minor with Phrygian turns (Eb) and the harmonic-minor A major, 96 BPM,
// 16 bars ≈ 40 s. Triangle bass, thin pulse arpeggio, square lead, noise drums. It builds up: bass and drone
// from bar 1, arpeggio from bar 3, drums and lead from bar 5, hi-hats from bar 9, a fill in bar 16.
// The tune itself is data: sinister.json (edit it by hand or with the music editor next to this project).
import type { SongSpec } from "../composer";
import { parseSongSpec } from "../songSpec";
import raw from "./sinister.json";

export const SINISTER: SongSpec = parseSongSpec(raw);
