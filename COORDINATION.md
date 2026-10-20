# Session coordination

A shared board for the Claude Code sessions (and people) working in this project at the same time. The rules are in
`CLAUDE.md`. Read it before you start; add your entry right away and remove it when you are done (moving the result to
"Recently done").

## In progress

| Session | What it is doing | Files it touches | Since |
| ------- | ---------------- | ---------------- | ----- |
|         |                  |                  |       |

## Waiting for a decision or agreement

- (none)

## Agreements

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
