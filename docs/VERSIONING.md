# Versions, changelog and release notes

Decided by the owner and the orchestrator on 2026-10-22; implementation is the lowest priority (FEEDBACK #23, #24).

## Four counters, four jobs

The game has four different compatibility counters. They are not the same thing and do not replace each other.

| Counter                             | Who reads it          | Where it lives                                             | Changes when                                                     | By   |
| ----------------------------------- | --------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- | ---- |
| **App version** `MAJOR.MINOR.PATCH` | players, the team     | `package.json` `version`, shown in Settings, `/api/health` | every release                                                    | hand |
| **Simulation build** (`SIM_BUILD`)  | the highscore service | fingerprint of `src/game` and the balance data             | any change of the simulation or the balance data                 | auto |
| **Save version** (`SAVE_VERSION`)   | the browser           | `src/saveVersion.ts`, key `xt-schema`                      | the browser saves must be reset or migrated                      | hand |
| **Season** (`SEASON`)               | the highscore table   | `server/limits.ts`                                         | the balance changed so that old records are no longer comparable | hand |

## The app version

`MAJOR.MINOR.PATCH`, in the spirit of SemVer, but defined by what the player experiences:

- **MAJOR**: something is reset or incompatible for the player: `SAVE_VERSION` or `SEASON` goes up. (1.0.0 is the release
  of 2026-10-22: reset of saves, season 2, the tutorial.)
- **MINOR**: new content or a new screen or feature that players notice: a map, a language, a tower, the tutorial steps.
- **PATCH**: fixes, small balance edges inside a season, texts, performance. Nothing is reset, nothing needs explaining.

Rule of thumb: if `SAVE_VERSION` or `SEASON` changes in the diff, the release is a MAJOR one; if `SIM_BUILD` changes but
neither does, it is at least a MINOR and the service must be installed again before the site.

Single source of truth: `package.json`. The build injects `__APP_VERSION__`, `__BUILD_SHA__` and `__BUILD_DATE__` (as
`__SIM_BUILD__` is injected now). The game shows `v1.2.3` small in Settings (and in the About line), the service returns
`{version, build, season}` in `/api/health`, and the site carries `version.json` (`{version, sha, date, sim}`) so that
anyone can see what is deployed. The version is also a property of future analytics events.

**Dev builds** (`dev.xeno.kovalev.app`, FEEDBACK #23) carry a pre-release suffix: `1.3.0-dev.7+abc1234` (the next planned
version, a counter, the commit). They never write into the live table: the dev site talks to its own service instance and
database; its `SEASON` and `SAVE_VERSION` may run ahead of the live ones.

**Git**: every production deploy is tagged on `main`: `v1.2.3` (annotated, created by the orchestrator at deploy time).
History is not rewritten after a tag without the owner's explicit order; if it is, the tags are moved with it.

## The changelog

`CHANGELOG.md` in the repository root, in the _Keep a Changelog_ shape: a version, a date, and the groups **Added**,
**Changed**, **Fixed**, **Removed** (and **Reset** when saves or records were reset). It is written for players and for the
owner, not for developers: "Maps and difficulties have their own screen", not "Extract campaign.ts".

- Sessions do not edit `CHANGELOG.md` (it would conflict between worktrees). Their commit subjects are the raw material
  (one finished change per commit, imperative, meaningful: the rules in `CLAUDE.md` already ask for that).
- The orchestrator writes the entry at release time from `git log vPREV..main`, merges the small fixes into one line each,
  and commits it together with the version bump as `Release 1.2.3`.
- Entries are short: at most one line per change; a patch release can be two lines.

## Release notes for players

- **PATCH**: none shown in the game; the changelog is enough.
- **MINOR**: a one-time "What's new" window after the update (up to 5 lines, texts in all five languages in the texts files
  under `releaseNotes`, keyed by version), remembered in `xt-seen-version` (kept by "progress" resets, it is not progress).
- **MAJOR**: the existing reset notice and, in the same window, the "What's new" lines. The window offers "Replay the
  tutorial" when the tutorial changed.
- The note is shown only when the player updates from an older version, never to a brand-new player.

## Release procedure (the checklist of the orchestrator)

1. `main` has everything that goes into the release; the sessions are told not to merge while the release runs.
2. Choose the version by the rules above; bump `package.json`; write the `CHANGELOG.md` entry and the release notes; if
   a reset is needed, bump `SAVE_VERSION` and/or `SEASON` (with the policy file and the notice texts).
3. Commit "Release X.Y.Z"; run typecheck, `yarn test` and the **whole** Playwright suite on its own port.
4. Back up: the highscore table (`admin.mjs backup`), and `/etc/nginx` is backed up by `install.sh` itself.
5. Deploy order: **dev first** (once it exists), then production: `yarn build:server` and `install.sh` when `SIM_BUILD`,
   `SEASON` or `server/` changed (the service first, so that an old page gets "update the game" for seconds only), then
   `yarn deploy` (the site), then `node dist-server/smoke.mjs https://xeno.kovalev.app` and remove its entry with
   `admin.mjs remove-nick "smoke test"`. The smoke test uses the hourly submission limit of the address: once per hour.
6. Look at the live page in a browser (menu, a campaign cell, the records table) and at `/api/health`.
7. Tag `vX.Y.Z` on the released commit; note the release on the board and in `FEEDBACK.md` statuses.
8. A bad release is rolled back by deploying the previous tag's build (`git checkout vPREV`, `yarn deploy`); the service by
   `rollback.sh` or by installing the previous bundle. A season or a save reset cannot be undone for players; the
   archived season stays in the database.

## To build (lowest priority, in this order)

1. The version define in `vite.config.ts`, `version.json` in `dist`, the version in Settings and in `/api/health`.
2. `CHANGELOG.md` starting with 1.0.0 (the release of 2026-10-22) and the entries since.
3. The "What's new" window and its texts (needs the MINOR rule above to be used once).
4. `yarn release` helper: bump, changelog stub from `git log`, tag. Only if the manual steps prove error prone.
5. Dev subdomain and `yarn deploy:dev` (FEEDBACK #23; needs a DNS record from the owner).
