// A player's name in the highscore table. The server cleans every name with this, the client uses it to show what
// will be saved. Names are shown with textContent only, so this is about what a table should look like, not
// about HTML.

export const NICK_MAX = 16;
export const ANONYMOUS = "Anonymous";

/** A starting point, not a moderation system: names are removed by hand with the script on the server. */
const BLOCKED = /fuck|shit|nigg|fagg|hitler|хуй|хуе|пизд|ебан|ебат|блядь|сука|пидор|нігер/iu;

/**
 * Cleans a name: composes it (NFC), drops everything but letters, digits, spaces and _ . ' -, collapses spaces,
 * cuts it to NICK_MAX characters. A name that is empty afterwards, or blocked, becomes "Anonymous".
 */
export function sanitizeNick(raw: unknown): string {
  if (typeof raw !== "string") return ANONYMOUS;
  const text = raw.normalize("NFC").slice(0, 200);
  const kept = text
    .replace(/[^\p{L}\p{M}\p{N} _.'-]/gu, "") // controls, bidi marks, emoji, markup: gone
    .replace(/\p{M}{3,}/gu, "") // stacks of combining marks ("zalgo"); one or two (accents, Indic vowel signs) stay
    .replace(/\s+/gu, " ")
    .trim();
  const cut = Array.from(kept).slice(0, NICK_MAX).join("").trim();
  if (!cut || BLOCKED.test(cut.replaceAll(/[ _.'-]/g, ""))) return ANONYMOUS;
  return cut;
}

/** The key two names are the same by: "Ann" and "ann " are one player. */
export const nickKey = (nick: string): string => nick.toLowerCase();
