// The highscore table and the used seed tokens, in one SQLite file (node:sqlite, no npm packages on the server).
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { nickKey } from "../src/nick";
import { better, type Result } from "../src/ranking";
import { SEASON } from "./limits";

export { better };

export interface ScoreInput {
  level: string;
  diff: string;
  nick: string;
  won: boolean;
  /** the last wave called: what the end screen says, shown beside the table */
  wave: number;
  /** the waves really dealt with: what ranks (calling waves early must not buy a place) */
  cleared: number;
  score: number;
  /** game time of the run, seconds */
  seconds: number;
  build: string;
  /** unix seconds */
  created: number;
  ipHash: string;
  /** the run as it was replayed: kept so an entry can be checked again after a change */
  run: unknown;
  /** a hash of the run's canonical text: the same game is entered once */
  runHash: string;
}

export interface ScoreRow {
  id: number;
  level: string;
  diff: string;
  rank: number;
  nick: string;
  won: boolean;
  wave: number;
  cleared: number;
  score: number;
  seconds: number;
  created: number;
}

interface Existing {
  id: number;
  won: number;
  wave: number;
  cleared: number;
  score: number;
  seconds: number;
}

/** `season`: the one this service shows and enters (server/limits.ts); tests may give another. */
export function openDb(path: string, season: number = SEASON) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY,
      season INTEGER NOT NULL DEFAULT 1,
      level TEXT NOT NULL,
      diff TEXT NOT NULL,
      nick TEXT NOT NULL,
      nick_key TEXT NOT NULL,
      won INTEGER NOT NULL,
      wave INTEGER NOT NULL,
      cleared INTEGER NOT NULL,
      score INTEGER NOT NULL,
      seconds REAL NOT NULL,
      build TEXT NOT NULL,
      created INTEGER NOT NULL,
      ip_hash TEXT NOT NULL,
      run BLOB NOT NULL,
      run_hash TEXT NOT NULL UNIQUE,
      UNIQUE (season, level, diff, nick_key)
    );
    CREATE TABLE IF NOT EXISTS used_tokens (id TEXT PRIMARY KEY, exp INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS seen_runs (hash TEXT PRIMARY KEY, created INTEGER NOT NULL);
  `);
  migrateSeasons(db);
  db.exec(
    "CREATE INDEX IF NOT EXISTS scores_rank ON scores (season, level, diff, won DESC, cleared DESC, score DESC, seconds ASC)",
  );

  const q = {
    existing: db.prepare(
      "SELECT id, won, wave, cleared, score, seconds FROM scores WHERE season = ? AND level = ? AND diff = ? AND nick_key = ?",
    ),
    insert: db.prepare(
      `INSERT INTO scores (season, level, diff, nick, nick_key, won, wave, cleared, score, seconds, build, created, ip_hash, run, run_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    update: db.prepare(
      `UPDATE scores SET nick = ?, won = ?, wave = ?, cleared = ?, score = ?, seconds = ?, build = ?, created = ?,
         ip_hash = ?, run = ?, run_hash = ? WHERE id = ?`,
    ),
    // the place in the list: strictly better results first, then equal ones that were saved earlier
    rank: db.prepare(
      `SELECT COUNT(*) + 1 AS rank FROM scores WHERE season = ? AND level = ? AND diff = ? AND (
         won > ? OR (won = ? AND (cleared > ? OR (cleared = ? AND (score > ? OR (score = ? AND (seconds < ?
           OR (seconds = ? AND id < ?))))))))`,
    ),
    top: db.prepare(
      `SELECT id, level, diff, nick, won, wave, cleared, score, seconds, created FROM scores
       WHERE season = ? AND (? IS NULL OR level = ?) AND (? IS NULL OR diff = ?)
       ORDER BY won DESC, cleared DESC, score DESC, seconds ASC, id ASC LIMIT ?`,
    ),
    seen: db.prepare("INSERT OR IGNORE INTO seen_runs (hash, created) VALUES (?, ?)"),
    wasSeen: db.prepare("SELECT 1 AS yes FROM seen_runs WHERE hash = ?"),
    token: db.prepare("INSERT OR IGNORE INTO used_tokens (id, exp) VALUES (?, ?)"),
    untoken: db.prepare("DELETE FROM used_tokens WHERE id = ?"),
    purge: db.prepare("DELETE FROM used_tokens WHERE exp < ?"),
    remove: db.prepare("DELETE FROM scores WHERE id = ?"),
    removeNick: db.prepare("DELETE FROM scores WHERE nick_key = ?"),
    count: db.prepare("SELECT COUNT(*) AS n FROM scores"),
    seasons: db.prepare("SELECT season, COUNT(*) AS n FROM scores GROUP BY season ORDER BY season"),
  };
  const rankOf = (level: string, diff: string, r: Result, id: number) => {
    const w = r.won ? 1 : 0;
    const row = q.rank.get(season, level, diff, w, w, r.cleared, r.cleared, r.score, r.score, r.seconds, r.seconds, id);
    return (row as { rank: number }).rank;
  };

  return {
    /** Saves a result; a player (a name) keeps only the best result per map and difficulty. */
    saveScore(s: ScoreInput): { id: number; rank: number; improved: boolean } {
      db.exec("BEGIN IMMEDIATE");
      try {
        const old = q.existing.get(season, s.level, s.diff, nickKey(s.nick)) as Existing | undefined;
        let id: number;
        let improved = true;
        const blob = gzipSync(JSON.stringify(s.run));
        // the game is remembered even when it does not improve the name's place: it cannot be sent again
        q.seen.run(s.runHash, s.created);
        if (!old) {
          const r = q.insert.run(
            season,
            s.level,
            s.diff,
            s.nick,
            nickKey(s.nick),
            +s.won,
            s.wave,
            s.cleared,
            s.score,
            s.seconds,
            s.build,
            s.created,
            s.ipHash,
            blob,
            s.runHash,
          );
          id = Number(r.lastInsertRowid);
        } else if (better(s, { won: !!old.won, cleared: old.cleared, score: old.score, seconds: old.seconds })) {
          id = old.id;
          q.update.run(
            s.nick,
            +s.won,
            s.wave,
            s.cleared,
            s.score,
            s.seconds,
            s.build,
            s.created,
            s.ipHash,
            blob,
            s.runHash,
            id,
          );
        } else {
          id = old.id;
          improved = false;
          s = { ...s, won: !!old.won, cleared: old.cleared, score: old.score, seconds: old.seconds };
        }
        const rank = rankOf(s.level, s.diff, s, id);
        db.exec("COMMIT");
        return { id, rank, improved };
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },

    /** Has this very game (its canonical run text) been entered already? */
    hasRun: (hash: string): boolean => q.wasSeen.get(hash) !== undefined,

    /** The best entries, of one map and difficulty or (with null) of all of them: one ranking for all. */
    top(level: string | null, diff: string | null, limit: number, which: number = season): ScoreRow[] {
      const rows = q.top.all(which, level, level, diff, diff, limit) as {
        id: number;
        level: string;
        diff: string;
        nick: string;
        won: number;
        wave: number;
        cleared: number;
        score: number;
        seconds: number;
        created: number;
      }[];
      // ties share the order of the query; the rank is the place in the list
      return rows.map((r, i) => ({ ...r, won: !!r.won, rank: i + 1 }));
    },

    /** Marks a seed token as used; false when it already was. */
    useToken: (id: string, exp: number): boolean => Number(q.token.run(id, exp).changes) === 1,
    /** The run could not be checked for a reason that is not the player's: the token may be used again. */
    releaseToken: (id: string): void => void q.untoken.run(id),
    purgeTokens: (now: number): void => void q.purge.run(now),

    // for the administrator (server/admin.ts)
    removeScore: (id: number): number => Number(q.remove.run(id).changes),
    removeNick: (nick: string): number => Number(q.removeNick.run(nickKey(nick)).changes),
    /** the season this database shows and enters, and every season that has rows (with how many) */
    season,
    seasons: (): { season: number; n: number }[] => q.seasons.all() as { season: number; n: number }[],
    count: (): number => (q.count.get() as { n: number }).n,
    /** a consistent copy of the whole database, made while the service runs (the file must not exist yet) */
    backup: (to: string): void => void db.prepare("VACUUM INTO ?").run(to),
    close: () => db.close(),
  };
}

/**
 * A database made before seasons has no `season` column, and its uniqueness is per (map, difficulty, name), which would
 * stop a name from entering the next season. The table is rebuilt once: every old row becomes season 1, nothing is lost.
 * Safe to run again (it does nothing when the column is there) and all or nothing (one transaction).
 */
export function migrateSeasons(db: DatabaseSync): boolean {
  const cols = db.prepare("PRAGMA table_info(scores)").all() as { name: string }[];
  if (cols.some((c) => c.name === "season")) return false;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DROP INDEX IF EXISTS scores_rank");
    db.exec("ALTER TABLE scores RENAME TO scores_before_seasons");
    db.exec(`CREATE TABLE scores (
      id INTEGER PRIMARY KEY,
      season INTEGER NOT NULL DEFAULT 1,
      level TEXT NOT NULL,
      diff TEXT NOT NULL,
      nick TEXT NOT NULL,
      nick_key TEXT NOT NULL,
      won INTEGER NOT NULL,
      wave INTEGER NOT NULL,
      cleared INTEGER NOT NULL,
      score INTEGER NOT NULL,
      seconds REAL NOT NULL,
      build TEXT NOT NULL,
      created INTEGER NOT NULL,
      ip_hash TEXT NOT NULL,
      run BLOB NOT NULL,
      run_hash TEXT NOT NULL UNIQUE,
      UNIQUE (season, level, diff, nick_key)
    )`);
    db.exec(`INSERT INTO scores (id, season, level, diff, nick, nick_key, won, wave, cleared, score, seconds, build, created, ip_hash, run, run_hash)
      SELECT id, 1, level, diff, nick, nick_key, won, wave, cleared, score, seconds, build, created, ip_hash, run, run_hash FROM scores_before_seasons`);
    db.exec("DROP TABLE scores_before_seasons");
    db.exec("COMMIT");
    return true;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export type Db = ReturnType<typeof openDb>;
