// Moderation by hand, on the server:
//   node admin.mjs top <level> <diff> [n]   list the table
//   node admin.mjs remove <id>              delete one entry
//   node admin.mjs remove-nick <nick>       delete every entry of a name
//   node admin.mjs backup <file>            a consistent copy of the database (the file must not exist yet)
// Uses the same database as the service (DB_PATH, or $STATE_DIRECTORY/highscores.db).
import { join } from "node:path";
import { openDb } from "./db";

const env = process.env;
const db = openDb(env.DB_PATH ?? join(env.STATE_DIRECTORY ?? ".", "highscores.db"));
const [cmd, a, b, c] = process.argv.slice(2);

if (cmd === "top" && a && b) {
  for (const r of db.top(a, b, Number(c ?? 20)))
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
  console.error("usage: admin.mjs top <level> <diff> [n] | remove <id> | remove-nick <nick> | backup <file>");
  process.exitCode = 1;
}
db.close();
