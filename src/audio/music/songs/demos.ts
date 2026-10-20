// Two short songs that show the other sound modes: 8 bars in A minor, one in the 8-bit chip sound and one clean
// (a nylon guitar, strings, a plucked bass, a piano and a drum kit). Examples for the music editor; the game plays Sinister.
import { parseSongSpec } from "../songSpec";
import chip from "./chip-demo.json";
import clean from "./clean-demo.json";

export const CHIP_DEMO = parseSongSpec(chip);
export const CLEAN_DEMO = parseSongSpec(clean);
