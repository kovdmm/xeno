// Ability icons (inline SVG), by ability key.
import type { AbilityKey } from "../game/types";

export const ABILITY_ICONS: Record<AbilityKey, string> = {
  stasis:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#bfefff" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5M3 10l3.4 1-1 3.4M21 14l-3.4-1 1-3.4M3 14l3.4-1-1-3.4M21 10l-3.4 1 1 3.4"/></svg>',
  meteor:
    '<svg viewBox="0 0 24 24"><path d="M3 3l9 6M6 2l8 7M2 7l9 4" stroke="#ff9a3a" stroke-width="2" stroke-linecap="round" fill="none" opacity=".8"/><circle cx="15" cy="15" r="6" fill="#ff6a1a" stroke="#000" stroke-width="1.5"/><circle cx="13" cy="13" r="1.6" fill="#3a1606"/><circle cx="17" cy="17" r="1.2" fill="#3a1606"/></svg>',
  napalm:
    '<svg viewBox="0 0 24 24"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z" fill="#ff5a14" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 13c1.5 1.5 3 2.8 3 4.5a3 3 0 0 1-6 0c0-1.3.8-2.2 1.5-2.8.3 1 .8 1.3 1.5 1.3-.4-1-.4-2 0-3z" fill="#ffd23a"/></svg>',
  carpet:
    '<svg viewBox="0 0 24 24"><path d="M12 1.5l1.6 5 8 4.5v2.2l-8-2.2-.6 6 3 2.2v1.8L12 20l-4 1v-1.8l3-2.2-.6-6-8 2.2V11l8-4.5z" fill="#9aa3a8" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/><circle cx="7" cy="16.5" r="1.3" fill="#ff3a3a"/><circle cx="17" cy="16.5" r="1.3" fill="#ff3a3a"/></svg>',
  nuke: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#e3b81a" stroke="#000" stroke-width="1.5"/><circle cx="12" cy="12" r="1.9" fill="#111"/><path d="M12 12L8.6 6.1A6.8 6.8 0 0 1 15.4 6.1zM12 12l6.8 0a6.8 6.8 0 0 1-3.4 5.9zM12 12l-3.4 5.9A6.8 6.8 0 0 1 5.2 12z" fill="#111"/></svg>',
};
