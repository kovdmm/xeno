// Moderation by hand, on the server:
//   node admin.mjs top <level> <diff> [n] [season]   list the table (of the current season, or of an archived one)
//   node admin.mjs seasons                  the seasons that have entries, with how many; the current one is marked
//   node admin.mjs remove <id>              delete one entry
//   node admin.mjs remove-nick <nick>       delete every entry of a name
//   node admin.mjs backup <file>            a consistent copy of the database (the file must not exist yet)
// Uses the same database as the service (DB_PATH, or $STATE_DIRECTORY/highscores.db).
import { join } from "node:path";
import { openDb } from "./db";

const env = process.env;
const db = openDb(env.DB_PATH ?? join(env.STATE_DIRECTORY ?? ".", "highscores.db"));
const [cmd, a, b, c] = process.argv.slice(2);

if (cmd === "seasons") {
  for (const s of db.seasons())
    console.log(`season ${s.season}${s.season === db.season ? " (current)" : " (archived)"}\t${s.n} entries`);
} else if (cmd === "top" && a && b) {
  const season = process.argv[6] ? Number(process.argv[6]) : db.season;
  for (const r of db.top(a, b, Number(c ?? 20), season))
    console.log(
      `${r.rank}\t#${r.id}\t${r.nick}\t${r.won ? "WON" : "lost"}\twave ${r.wave}\tscore ${r.score}\t${Math.round(r.seconds)} s`,
    );
} else if (cmd === "remove" && a) {
  console.log("removed", db.removeScore(Number(a)));
} else if (cmd === "remove-nick" && a) {
  console.log("removed", db.removeNick(a));
} else if (cmd === "backup" && a) {
  db.backup(a);
  console.log("saved", a);
} else {
  console.error(
    "usage: admin.mjs top <level> <diff> [n] [season] | seasons | remove <id> | remove-nick <nick> | backup <file>",
  );
  process.exitCode = 1;
}
db.close();
