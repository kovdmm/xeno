// What the highscore service allows. One place, so that the service, the page's patience and the documents agree
// (tests/server/limits.test.ts reads them all).

/** CPU time one replay may take (ms). A late game of 70 upgraded towers took 56 s to replay at the natural pace and 77 s with
 *  the waves called at once; a light game takes a fraction of a second. */
export const REPLAY_TIMEOUT_MS = 90_000;
/** replays waiting or running before new ones are refused (503 busy): 3 x 90 s is the longest a queue can take */
export const MAX_QUEUE = 3;
/** runs one address may enter per hour */
export const SUBMITS_PER_HOUR = 5;
/** how long a POST waits for its replay before it answers 202 and the page polls (ms) */
export const SYNC_WAIT_MS = 8000;
