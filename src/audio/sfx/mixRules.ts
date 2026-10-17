// How each sound takes part in the mix.
//   volume    base loudness 0..1
//   gap       shortest time between two plays of this sound, s (0 = none)
//   voices    how many copies may overlap
//   priority  0 low: combat chatter that is thinned out when busy · 1 · 2 · 3 important: never dropped ·
//             4 end-of-game jingles
export interface MixRule {
  volume: number;
  gap: number;
  voices: number;
  priority: number;
}

export const MIX_RULES: Record<string, MixRule> = {
  gun: { volume: 0.16, gap: 0.12, voices: 3, priority: 0 },
  cannon: { volume: 0.3, gap: 0.2, voices: 3, priority: 0 },
  missile: { volume: 0.25, gap: 0.2, voices: 3, priority: 0 },
  plasma: { volume: 0.22, gap: 0.18, voices: 3, priority: 0 },
  rail: { volume: 0.3, gap: 0.25, voices: 2, priority: 1 },
  arty: { volume: 0.4, gap: 0.35, voices: 2, priority: 1 },
  frost: { volume: 0.16, gap: 0.6, voices: 2, priority: 0 },
  freeze: { volume: 0.28, gap: 1, voices: 1, priority: 1 },
  boom: { volume: 0.26, gap: 0.15, voices: 4, priority: 0 },
  bigboom: { volume: 0.45, gap: 0.3, voices: 3, priority: 1 },
  nuke: { volume: 0.9, gap: 0, voices: 2, priority: 3 },
  pop: { volume: 0.2, gap: 0.12, voices: 4, priority: 0 },
  bosskill: { volume: 0.6, gap: 0, voices: 2, priority: 2 },
  leak: { volume: 0.5, gap: 0.25, voices: 2, priority: 3 },
  wave: { volume: 0.4, gap: 0, voices: 1, priority: 2 },
  cleared: { volume: 0.4, gap: 0, voices: 1, priority: 2 },
  build: { volume: 0.35, gap: 0.05, voices: 2, priority: 2 },
  upgrade: { volume: 0.35, gap: 0.05, voices: 2, priority: 2 },
  ult: { volume: 0.5, gap: 0, voices: 1, priority: 3 },
  sell: { volume: 0.35, gap: 0.05, voices: 1, priority: 2 },
  error: { volume: 0.3, gap: 0.2, voices: 1, priority: 2 },
  stasis: { volume: 0.55, gap: 0, voices: 1, priority: 3 },
  meteorcast: { volume: 0.5, gap: 0, voices: 1, priority: 3 },
  fire: { volume: 0.45, gap: 0, voices: 1, priority: 3 },
  plane: { volume: 0.5, gap: 0, voices: 1, priority: 3 },
  siren: { volume: 0.45, gap: 0, voices: 1, priority: 3 },
  heal: { volume: 0.1, gap: 0.6, voices: 1, priority: 0 },
  blink: { volume: 0.18, gap: 0.3, voices: 1, priority: 0 },
  victory: { volume: 0.7, gap: 0, voices: 1, priority: 4 },
  defeat: { volume: 0.7, gap: 0, voices: 1, priority: 4 },
};

/** Low-priority plays allowed per 100 ms window (≤ 20 per second). */
export const LOW_BUDGET = 2;
