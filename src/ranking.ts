// How results are ranked, for the server's table and for the page (which must know whether a game could improve on the
// player's best before it offers it for the table): a win beats a loss, then more waves cleared, the higher score, the
// shorter game.
export interface Result {
  won: boolean;
  cleared: number;
  score: number;
  seconds: number;
}

/** Is `a` a better result than `b`? Equal results are not better. */
export function better(a: Result, b: Result): boolean {
  if (a.won !== b.won) return a.won;
  if (a.cleared !== b.cleared) return a.cleared > b.cleared;
  if (a.score !== b.score) return a.score > b.score;
  return a.seconds < b.seconds;
}
