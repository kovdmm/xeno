# Session coordination

A shared board for the Claude Code sessions (and people) working in this project at the same time. The rules are in
`CLAUDE.md`. Read it before you start; add your entry right away and remove it when you are done (moving the result to
"Recently done").

## In progress

| Session | What it is doing | Files it touches | Since |
| ------- | ---------------- | ---------------- | ----- |
| xeno-5c | orchestrator: keeps this board, hands out tasks the user gives, checks the other sessions, tidies the history when the user asks | COORDINATION.md, CLAUDE.md (not the code) | 2026-10-20 |
| xeno-92 (balance) | FEEDBACK #5 balance (gun/ultimates, hard passable), #16 cap on simultaneous waves, then the data side of #2 (progression) | `sim/*`, `src/game/data/balance.yaml`, `src/game/waves.ts`, `tests/__snapshots__/core.test.ts.snap` | 2026-10-20 |
| xeno-1a (mobile) | FEEDBACK #12 keep the screen awake (done, branch `worktree-mobile`), #14 install screen, then #17 wall message (`pcWall`), then #13 mobile UX (dialogs); works in its own worktree `mobile` | `src/pwa.ts`, `src/ui/appMode.ts`, `src/ui/settings.ts`, `index.html`, `style.css`, `e2e/pwa.spec.ts`, mobile e2e; for #17 `src/game/grid.ts` (placeCheck), `src/game/types.ts` (PlaceCode), `src/ui/view.ts`, texts (new key, five languages) | 2026-10-20 |
| agent: cheats | FEEDBACK #4 more cheat codes (all maps, immortal base, free turrets, enemies' speech bubbles); own worktree `cheats` | `src/game/game.ts` (cheat()), `src/ui/commands.ts`, `src/i18n/texts.*.json` (new keys only), `tests/` for cheats; `economy.cheats` in `balance.yaml` only after agreeing with xeno-92 | 2026-10-20 |
| agent: marks | FEEDBACK #7 letter marks on turrets (specialisation letter left, +n right); own worktree `marks` | `src/render/*`, `tests/render/*`, `e2e/visual.spec.ts` and its snapshots | 2026-10-20 |

## Waiting for a decision or agreement

- **Not yet started, waiting for the user:** #6 highscore table (needs the decision on hosting the node + sqlite
  server and on keeping cheated games out), #15 deploying Tonegrid to a subdomain (server access).
- **Later, after the balance and the level order are fixed:** #2 campaign, #8 map and difficulty screens, #9 map order
  (switchback first), #11 saves. **Last:** #1 analytics, #3 tutorial and Xenopedia (see `FEEDBACK.md`).

## Agreements

- Parallel streams work in their own git worktree and branch (`claude --worktree <name>`), so shared files such as
  `src/i18n/texts.*.json` do not collide; the orchestrator merges the branches one by one into `main`.

- Shared working copy: commit only your own files, by name; no `git add -A` and no `git commit -a`.
- History: one commit per finished change, no small follow-up commits (amend or squash them); the details are in
  `CLAUDE.md`, "Commits and history".
- Changing a data format, a config or a public function that others rely on: write it here first and message the
  affected session.
- Refer to finished work by what it was, not by a commit hash: the history may be tidied.

## Recently done

- 2026-10-20: the balance moved to YAML (`src/game/data/balance.yaml`) and the balance simulator `sim/` was added.
- 2026-10-20: the music editor became a separate repository, Tonegrid (`../tonegrid`), with its own copy of the sound
  engine; `yarn sync-engine` there takes the changes over from the game's `src/audio`.
