# Xeno-Tactics

A browser tower defence game: 8 tower types, up to 200 waves, 4 difficulties, 4 maps, player abilities, and music and
sound effects synthesised on the fly. Built with Vite; the source is TypeScript modules in `src/`. It installs as a PWA.

## Quick start

Needs Node.js 22+ and Yarn 1.

```sh
yarn install
yarn start                 # Vite dev server: http://localhost:3000
yarn build                 # production build into dist/
yarn preview               # look at dist/ locally
yarn typecheck             # three tsc checks: src (strict), tests and configs, the service worker
```

External resources at runtime are Google Fonts and howler.js from a CDN (see `index.html`; howler is a classic
`<script>` and must load before the module). Offline the game still runs, but without sound and with system fonts.

For working on the game together with other Claude Code sessions see `CLAUDE.md` and `COORDINATION.md`.

## Structure

| Path           | Role                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `src/game/`    | the **simulation**: pure TypeScript, no DOM, sound, colours or texts (see below)                 |
| `src/i18n/`    | **languages**: `texts.<code>.json` (en, ru, de, ua, sv), language detection, the translator      |
| `src/render/`  | **rendering**: layers, sprite painters, effects, the floor (see "Rendering")                     |
| `src/audio/`   | **sound**: music, effects, mixer, player (see "Sound")                                           |
| `src/ui/`      | **interface**: screens, HUD, palette, input, settings, the main loop (see "Interface")           |
| `src/core.ts`  | the game as the rest of the app sees it: the simulation plus "live" texts over the data tables   |
| `src/app.ts`   | assembles the services (translator, game, renderer factory, sound); tests assemble the same ones |
| `src/main.ts`  | composition root: `createApp` → `createUi`; `window.XT` is only a handle for debugging           |
| `src/sw.ts`    | the service worker (built to `sw.js` by a plugin in `vite.config.ts`)                            |
| `sim/`         | the balance simulator: a bot plays the game (see "Balance simulator")                            |
| `tests/`       | unit and characterisation tests (Vitest)                                                         |
| `e2e/`         | browser tests (Playwright): screenshots and interface behaviour                                  |
| `maintenance/` | a one-page "back soon" site, put on the server in place of the game with `yarn maintenance`      |

Everything is TypeScript with explicit imports: the parts receive each other as arguments (`createUi(deps)`,
`createRenderer(canvas, deps)`, `createApp(hooks)`). Three "browser" files — `render/browser.ts`, `audio/browser.ts`,
`i18n/browser.ts` — connect canvas, howler and localStorage; the rest of the code knows nothing about the browser.

### Simulation (`src/game/`)

All state lives in one `State` object and the logic is in functions `(g: Game, …)`; there are no singletons, and
`createGame({ rng })` creates an independent game.

| Module              | What is in it                                                                       |
| ------------------- | ----------------------------------------------------------------------------------- |
| `types.ts`          | all the types: `State`, `Tower`, `Creep`, `Projectile` (union), `GameEvent` (union) |
| `data/balance.yaml` | **every number of the game**, in one commented YAML file (see "Balance" below)      |
| `balance.ts`        | typing and validation of `balance.yaml`; `BALANCE` holds the defaults               |
| `rules.ts`          | formulas: tower stats by level, upgrade price, the health curve                     |
| `grid.ts`           | path finding (BFS), `placeCheck`, enemies walking the field                         |
| `waves.ts`          | wave composition, spawning, the wave timer                                          |
| `movement.ts`       | enemy movement, burning, healing, jumping                                           |
| `targeting.ts`      | choosing a target and aiming                                                        |
| `towers.ts`         | the **registry of tower behaviours** (shooting and continuous)                      |
| `projectiles.ts`    | the **registry of projectiles**: how each flies and what it does on a hit           |
| `combat.ts`         | damage, armour, statuses, kills and leaks, the end of the game                      |
| `abilities.ts`      | the player's abilities                                                              |
| `game.ts`           | `createGame`: the state, the event bus, commands, the `step` tick                   |

To **add a tower**: an entry in `balance.yaml` (`towers`), a behaviour in `towers.ts` (a shooter or a continuous one),
texts in **all five** `src/i18n/texts.*.json`, then a colour in the renderer and a sound in the audio. The types and the
validator point out what is missing (`yarn typecheck`, `yarn test`).

### Balance (`src/game/data/balance.yaml`)

All the parameters of the game and of its balance live in one file, and every one of them can carry a comment. The
simulation code has no numeric parameters of its own (only mathematical constants such as "the centre of a cell is
0.5"). The game reads the file as `g.B` (`Balance` in `types.ts`). The YAML is turned into data by the plugin in
`scripts/yamlPlugin.ts`, for the build, the dev server and the tests alike.

| Section       | What is in it                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| `board`       | the radius around a walking enemy where building is blocked (shared by all levels)                            |
| `levels`      | the **levels**: the field, routes, walls and length of each map (see below)                                   |
| `economy`     | sell refund, ultimate price, overclock, bonuses for a wave and for calling one early, score, cheat codes      |
| `scaling`     | growth of enemy health and rewards over the waves (quadratic, faster after wave 100, a smoothed "rise")       |
| `combat`      | armour, blast radius and fall-off, burning, stun, plague, healers, jumpers, spawn spread                      |
| `shooting`    | most shots per tick, aiming speed, the cryo pulse, laser overheating                                          |
| `projectiles` | speed, muzzle offset and hit radius of each kind of projectile, cluster-bomb and rocket parameters            |
| `waves`       | route order, enemy cycles, formulas for counts and their limits, bosses, the final wave, mixed waves, the gap |
| `towers`      | cost, damage, fire rate and range for 4 levels, and the **ultimates as data**                                 |
| `enemies`     | health, speed, reward, armour, size, spawn interval                                                           |
| `difficulty`  | multipliers and starting values of the four difficulties                                                      |
| `abilities`   | price, cooldown, aiming and the parameters of every ability                                                   |

**Ultimates** are described as operations on the level-4 stats and applied in the order `set` → `mul` → `div`:

```yaml
ults:
  sniper:
    mul: { range: 1.7, dmg: 6, rate: 2 }
    set: { prio: strong }
```

A stat may appear in one operation only.

**Validation.** `balance.ts` checks the file at startup and in the tests: every tower, enemy, difficulty and ability is
there; arrays per level have 4 numbers; numbers are finite and in range; hotkeys are unique; enemies in the wave
cycles are known and have a count formula; routes lie on the field. An error names the path to the culprit, for example
`towers.gun.ults.mini.div.rate: must be >= 5e-324`.

**Replacing it in tests.** `createGame({ balance })` accepts any set of numbers, so a test can make a tower cheaper,
change the size of the field or a wave formula without touching the code (`tests/balance.test.ts`). The names and
descriptions are not part of this file: they are in `src/i18n/texts.*.json`.

#### Levels (`levels`)

Each level is a separate map; the first in the file is played by default. The map is chosen in the settings ("Map");
records are kept per map and difficulty (`xt-best-<map>-<difficulty>`; the first map keeps the old keys). The maps are
`crossroads`, `switchback`, `fronts` and `corner`.

```yaml
switchback:
  finalWave: 100
  map:
    width: 24
    height: 15
    routes:
      main:
        spawn: [[0, 1], [0, 2], [0, 3]]
        exit: [[23, 11], [23, 12], [23, 13]]
        dir: [1, 0]
    walls:
      - { x: 0, y: 4, w: 20, h: 1 }
      - { x: 4, y: 8, w: 20, h: 1 }
```

- **Routes** — as many as you like, with any names. `spawn` is the entrance cells (on the edge of the field, next to
  each other), `exit` the exit cells, `dir` the step an enemy enters with (off the edge of the field, through the
  entrance cells), `exitDir` the step it leaves with through the exit (equal to `dir` by default; on `corner` the
  entrance is on the left and the exit at the bottom).
- **Waves** take the routes in turn: an odd wave the first, an even one the second and so on, and once in a few waves
  (`waves.bothEvery`) all of them at once. On a map with one route there is nothing to alternate.
- **Walls** are blocks of cells `{ x, y, w, h }`: no building on them and no walking through them; towers still cannot
  block the road completely.
- **Entrances and exits are drawn from these cells**: the cave with veins at the middle of the entrance cells (a wider
  entrance, a bigger cave), the gate with zebra stripes along the frame of the exit cells, the air lane as a straight
  line between the edges at the entrance and at the exit. Labels like "left → right" are computed from the geometry and
  turn with the field, so nothing is written per map.
- **Checks at startup:** the gates are on the field, on its edge and do not overlap; `dir`/`exitDir` are unit steps;
  walls do not cover the gates; **every entrance cell can reach an exit** (the error names the cell).
- **Texts** of a map are `game.levels.<id>.name` and `.desc` in every `texts.*.json` (without words like "left" or
  "top": the field rotates); a test reminds you if you forget. The id is lower-case letters, digits, `-` and `_`.
- **Balance.** The numbers of enemies and towers depend only on the wave number, so the `finalWave` of a new map is best
  found by playing: a short map with one road is harder (every wave comes along it). The balance simulator below helps.

#### Balance simulator (`sim/`)

`yarn sim` has a bot play every map × difficulty and prints how far it got (`SIM_LEVELS`, `SIM_DIFFS`,
`SIM_STRATEGIES` and `SIM_SEEDS` narrow the run; `yarn sim sim/trace.sim.ts` shows the course of one game and
`yarn sim sim/towers.sim.ts` the efficiency of each tower). `yarn sim sim/bake.sim.ts` searches the longest maze of every map
(simulated annealing over the turret cells, money ignored) and bakes it into `sim/mazes.json`, which the `maze-*`
strategies of the bot build along; `yarn sim sim/mazecurve.sim.ts` prints how the walk grows with the towers built.
Rebake after changing a map (a stale maze is refused). It is not part of `yarn test`.

### Interface (`src/ui/`)

The interface receives the game, translator, sound, renderer and storage from outside (`createUi(deps)`) and does not
know about `window.XT`. The logic, texts and markup of the panels are pure functions; only the modules that need it
touch the DOM.

| Module                           | What is in it                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `index.ts`                       | assembles the shared context and the parts, starts the loop                            |
| `context.ts`, `types.ts`         | what each part receives; what the interface knows about the game, sound and translator |
| `state.ts`                       | what the player "holds": the selected tower, build mode, aim, speed, field orientation |
| `keys.ts`                        | **pure** keys: layouts, typing a cheat code, what Esc and space do                     |
| `cards.ts`, `view.ts`            | **pure** panels (tower card, hints) and "what to show the renderer"                    |
| `commands.ts`                    | build, upgrade, sell, use an ability, call a wave; error messages and sounds           |
| `input.ts`                       | the pointer on the field, the keyboard, the buttons of the main screens                |
| `hud.ts`, `palette.ts`           | numbers and panels that touch the DOM only on change; tower and ability buttons        |
| `session.ts`, `settings.ts`      | a game, the win/loss screen, the intro; language, difficulty with confirmation         |
| `layout.ts`                      | fitting the field to the window, rotating on desktop                                   |
| `appMode.ts`, `soundControls.ts` | full screen and installing the app; the sound button and sliders                       |
| `progress.ts`, `loop.ts`         | saved difficulty and records; the game loop                                            |
| `routes.ts`, `mapThumb.ts`       | route labels computed from the geometry; the map thumbnails in the settings            |

### Rendering (`src/render/`)

Calculation is separated from drawing, the "frills" (looks) from the calculations, and the picture is assembled from
layers that can be changed one by one.

| Module                             | What is in it                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `renderer.ts`                      | assembles the parts and runs the layers every frame; draws nothing itself                            |
| `pipeline.ts`                      | `DEFAULT_LAYERS` (the order), `withLayers(base, {replace, remove, before, after})`, `runLayers`      |
| `layers/*.ts`                      | the **layers**: floor, gates, lanes, towers, enemies, beams, projectiles, particles, aim, vignettes… |
| `fx.ts`, `director.ts`             | **effect calculation**: particles, texts, shake, flashes; game events → effects. They draw nothing   |
| `towers.ts`, `aliens.ts`           | **sprite painters**: towers and aliens in a unit cell, stateless                                     |
| `theme.ts`, `color.ts`, `tiers.ts` | the palette, colour arithmetic, level and ultimate colours                                           |
| `projection.ts`                    | field → screen, the 90° rotation in portrait: the only place that knows about it                     |
| `sprites.ts`, `glow.ts`            | the sprite cache (drawn once), glows with a per-frame budget                                         |
| `floor.ts`, `quality.ts`           | the floor and the marks on it; a quality governor driven by the real frame time                      |

A layer is `{ id, draw(frame) }`. Before a layer the field matrix is set, and the canvas state is saved and restored
around it, so a layer cannot "leak" a dash or a blend mode into its neighbour. To change the composition without
touching anything else:

```ts
import { DEFAULT_LAYERS, withLayers } from "./render/pipeline";
renderer.setLayers(withLayers(DEFAULT_LAYERS, { replace: { beams: myBeams }, remove: ["flicker"] }));
```

An unknown id is an error, not a silent "nothing happened". The renderer knows nothing about `document`, `window`, time
or `Math.random`: all of that is passed in (`RendererDeps`), so it can run on a stub context; the hygiene test watches
this, and that the layers do not import each other.

### Sound (`src/audio/`)

Composition, the music itself, synthesis and playback are separate; the system has no access to the DOM or the game
state, and howler.js is known to one file only.

| Module                        | What is in it                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `music/composer.ts`           | the **composer**: turns a song (tracks of notes on a grid, like a piano roll) into a score               |
| `music/songs/sinister.ts`     | **the game's song** as data (`sinister.json`): bass, arpeggio, drone, kick, snare, hat and lead tracks   |
| `music/songs/demos.ts`        | two example songs in the other sound modes (`chip-demo.json`, `clean-demo.json`)                         |
| `music/score.ts`              | the score: notes (beat, length, pitch, instrument, loudness), no sound in it                             |
| `music/instruments.ts`        | the instruments (~40): voices (wave, plucked string, FM, chip noise, drums) with a role and a mode each  |
| `music/modes.ts`              | the **sound modes**: `lofi` (default), `chip` (8-bit), `clean`: sample rate, rounding, one-note channels |
| `music/render.ts`             | synthesis: a score → one seamless loop of samples                                                        |
| `music/songSpec.ts`           | checks a song file (`validateSongSpec` / `parseSongSpec`) and prints it neatly (`formatSongSpec`)        |
| `music/player.ts`             | the loop player: builds once, never starts a second copy, pauses at volume 0                             |
| `sfx/recipes.ts`              | effect recipes: a duration and a sample function; noise from an injected generator                       |
| `sfx/mixRules.ts`             | mix rules: volume, shortest interval, number of voices, priority                                         |
| `sfx/mixer.ts`                | the **mixer** (pure logic): merging, intervals, a budget per 100 ms, ducking in a crowd                  |
| `sfx/cues.ts`                 | game event → sound name (a pure function)                                                                |
| `sfx/laser.ts`, `sfx/bank.ts` | the laser hum; the bank of effects, created on first use and in the background                           |
| `out.ts`, `howlerOut.ts`      | the `AudioOut` backend interface and its only implementation, on howler.js                               |
| `system.ts`                   | assembly: events → sounds → mixer → bank → backend, plus the music and the settings                      |

**The song is data**: `music/songs/sinister.json` (`SongSpec`) is a tempo, beats per bar, the number of bars, an
optional `sound` mode and the **tracks**. A track is a name, an instrument, a volume, a `gate` (how much of its length a
note sounds), an optional `echo`, and a list of notes `[beat, MIDI pitch, length in beats, velocity 0..1]` (the velocity
can be left out: it is 1). For drums the pitch and length do not matter (`0` and `0.25` are written). The notes are laid
out by bar, a line per bar. `music/songSpec.ts` checks the file (errors come with paths such as
`tracks[2].notes[5][2]: must be between 0.0625 and Infinity`) and prints it neatly.

**Sound modes.** A song may name a `"sound"`; each mode has its own set of instruments and its own rendering:

| Mode    | Sound                                                             | Rendering                                                                                                                   | Instruments                                                                                                                                                                                                                                                                           |
| ------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lofi`  | console sound (how the game sounds; the default)                  | 16 kHz, loudness in 40 steps                                                                                                | `bass`, `arp`, `drone`, `lead`, `kick`, `snare`, `hat`                                                                                                                                                                                                                                |
| `chip`  | 8-bit, like an NES: 16 loudness steps, 4-bit triangle, LFSR noise | 22 kHz, 16 steps; **a channel plays one note at a time** (of a chord the highest stays, a note stops where the next starts) | `chipLead`, `chipLeadSoft`, `chipHarmony`, `chipArp`, `chipBass`, `chipKick`, `chipSnare`, `chipHat`, `chipOpenHat`, `chipTom`, `chipCrash`                                                                                                                                           |
| `clean` | guitars, keys, strings, pads, a drum kit                          | 32 kHz, no rounding                                                                                                         | `guitar`, `nylon`, `guitarMuted`, `guitarElectric`, `bassPluck`, `bassSub`, `bassSynth`, `piano`, `epiano`, `bell`, `marimba`, `brass`, `flute`, `organ`, `synthLead`, `pad`, `strings`, `cleanKick`, `cleanSnare`, `cleanClap`, `cleanHat`, `cleanOpenHat`, `cleanTom`, `cleanCrash` |

The validator rejects an instrument of another mode (`the clean sound has …`). The voices are `tone` (a wave with an
envelope, chorus layers, a filter, overdrive, a stepped envelope), `pluck` (a Karplus-Strong string: guitars and the
plucked bass), `fm` (a pair of sines: piano, bell, brass) and `noise` (the shift register of a chip: 8-bit drums). Every
instrument has a role (`bass`, `lead`, `kick`, …), so when a song is moved to another mode in the editor, each
instrument is swapped for one that plays the same part.

To **add a song**: put `<name>.json` next to `sinister.json`, read it with `parseSongSpec` and give it to `composeSong`

- `renderScore` in the player. You do not have to write the JSON by hand: next to this project there is the **music
  editor Tonegrid** (`../tonegrid`, a separate repository with its own copy of the sound engine, taken from here with
  `yarn sync-engine` there). It is a piano roll on a canvas: a note is put with a click, moved and stretched with the
  mouse, there are rectangle selection, copy and paste, the velocity of every note, tracks with mute/solo, playback with
  the same composer and renderer, checking with the same validator, and saving in this same format.

To **add an effect**: a recipe in `recipes.ts`, a rule in `mixRules.ts`, event → name in `cues.ts`. To **change the
backend** (to WebAudio, say): implement `AudioOut` and leave the rest alone.

### Languages (`src/i18n/`)

English is the default language and the reference; Russian (`ru`), German (`de`), Ukrainian (`ua`) and Swedish (`sv`)
are supported. All text for the player is one file per language: `texts.en.json`, `texts.ru.json`, `texts.de.json`,
`texts.ua.json`, `texts.sv.json`. Each has two sections:

- `ui` — interface strings with `{placeholders}` and HTML tags (`<b>`, `<kbd>`, …); `credits` — the credit lines;
- `game` — names and descriptions of the game's data by their ids from `balance.yaml`: `towers` (with `ults`),
  `enemies`, `difficulties`, `abilities`, `levels`.

The name of the game, **Xeno-Tactics**, is not translated.

**Choosing a language.** In the settings there is an ordinary drop-down list (`<select id="langSel">`) in which each
language is named in itself (English, Русский, Deutsch, Українська, Svenska). The choice is saved in localStorage
(`xt-lang`) and applied at once, without a reload and without losing the current game. With no choice made, the first
known language in the browser's list is taken (`uk-UA` → `ua`), otherwise English. `<html lang>` gets the right tag
(`uk` for Ukrainian).

**Fallback.** If a language lacks a string, the English one is shown, and if that is missing too, the key itself. So an
unfinished translation does not break the game, but the tests do not allow one (see below).

**Adding a language:**

1. Copy `texts.en.json` to `texts.<code>.json` and translate the values (keys, `{placeholders}` and tags stay as they are).
2. Add the language to `LANGUAGES` (`languages.ts`: the code, its name in itself, the tag for `<html lang>`) and to `texts.ts`.
3. Add the code to the `CODES` list in `tests/i18n.test.ts` and in `e2e/language.spec.ts`.

The tests check every language: the same keys as English; no empty string; the same `{placeholders}` and HTML tags in
every string; the same credit lines; texts for every tower, ultimate, enemy, difficulty, ability and level from the
balance; a translation that is not a copy of the English one and is written in its own alphabet. The browser tests
(`e2e/language.spec.ts`) check the selector, remembering the choice, detecting the language from the browser, and that no
name or button is cut off, on desktop or on a phone, in any language.

**Texts that depend on the rotation of the field.** In portrait the field is rotated by 90°: the x axis of the board runs
top to bottom on the screen and the y axis right to left. So "left to right" becomes "top to bottom", and "along the
chosen row" becomes "along the chosen column". Such texts sit next to the ordinary ones as a field with the suffix
`Rotated` (today only `abilities.carpet.descRotated`; the test fixes that there are no others). The UI reads texts with
`L(object, field)`: on a rotated field it takes `<field>Rotated` if there is one, and rebuilds the hints on every turn of
the device. If you add a text with a direction ("left", "top", "row", "column"), add a `...Rotated` for it in all five
languages. The names of routes are not texts: they are computed from the geometry of the map (`ui/routes.ts`).

Texts over the data of the core (`core.TT.gun.name` and the like) are "live" properties: they read the current language on
every access, so changing the language needs no rebuild.

### Random numbers

Each subsystem has its own stream: `rng.core`, `rng.fx` (rendering), `rng.audio` (passed to `createApp(hooks)`). When
no stream is given, `Math.random` is used (for the simulation it is `createGame({ rng })`). This keeps cosmetics
(particles, shake) from shifting the simulation, and tests reproducible. In new code use the module's `rand()`, not
`Math.random()`.

## Tests

```sh
yarn test            # Vitest: ~470 tests, a few seconds (effects are synthesised lazily)
yarn test:watch      # the same in watch mode
yarn test:coverage   # Vitest + coverage: a table in the console and an HTML report in coverage/index.html
yarn sim             # the balance simulator (sim/): see "Balance simulator"
yarn test:visual     # Playwright: canvas screenshots and interface behaviour (~140 tests)
yarn test:all        # both suites in a row
```

### Vitest (`tests/`)

Modules are imported directly, without a browser (`tests/helpers/load.ts`):

- `loadXT([], { seed, globals })` assembles **fresh** services through `createApp` on every call (no state leaks
  between tests), puts stubs of the browser globals (`Howl`, `localStorage`, `document`, …) on `globalThis` and returns
  `{core, i18n, audio, createRenderer, rng, env}`. Globals the test did not pass are removed;
- every `rng.*` stream gets a seed; `setTimeout` and the clock go through `hooks.env`, so a test controls time;
- `tests/hygiene.test.ts` makes sure `Math.random` stays only as the default in three modules;
- `run(core, seconds)` runs the simulation in steps of 25 ms, like the game loop.

| File                    | What it checks                                                                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/core.test.ts`    | the data tables, stats, upgrade prices, pathfinding, `placeCheck`, the economy, 200 waves, abilities                                                                                                                                |
| `tests/audio/*.test.ts` | music (composer, rendering with a sample fingerprint, sound modes, instruments' pitch, song validator, player), effects (recipes, mixer, events → sounds, laser, bank), the system on a fake output, the Howler adapter, the facade |
| `tests/balance.test.ts` | the `balance.yaml` validator (errors with a path), replacing numbers changes the game                                                                                                                                               |
| `tests/levels.test.ts`  | the maps: gates, walls, reachability, texts of every level                                                                                                                                                                          |
| `tests/hygiene.test.ts` | `Math.random` only as the default of the streams, no IIFE leftovers and no `window.XT` outside `main.ts`, the composer knows no sound and the renderer no songs                                                                     |
| `tests/i18n.test.ts`    | completeness of all five languages (keys, placeholders, HTML tags, credits, coverage of the ids in the balance), language detection, the translator with English fallback, live texts over core data                                |
| `tests/render/`         | the parts of rendering: projection, the quality governor, effects, the sprite cache, colours, the layer composition                                                                                                                 |
| `tests/render.test.ts`  | 45 waves on a stub 2D context: it does not crash, leaves no mess in the ctx state; rendering does not influence the simulation                                                                                                      |
| `tests/ui/`             | the pure logic of the interface: commands, keys, panels, routes, sessions                                                                                                                                                           |

The golden test of core is kept in `tests/__snapshots__/`. If you changed the balance **on purpose**, update it:
`yarn vitest run -u`. If you did not and the snapshot differs, that is a regression.

Coverage is counted only over `src/` and only for Vitest (screenshot tests are not in it). The interface (`src/ui`) is
covered by unit tests of the logic and the text panels, and the DOM drawing by the browser tests in `e2e/ui.spec.ts`.
The HTML report: open `coverage/index.html`, where the uncovered lines are highlighted.

### Screenshot tests (`e2e/`)

Only `#field` (the canvas) is shot, to be independent of the HUD fonts. Time, `requestAnimationFrame` and random
numbers are replaced (`e2e/harness.ts`), so the frames are reproducible byte for byte: the game does not run by itself,
the test advances it by N frames of 1/60 s (`tick(page, n)`).

The first run on a machine:

```sh
npx playwright install chromium
yarn test:visual
```

The server (`vite dev` on `127.0.0.1:4173`) starts automatically, so the tests run on the sources in `src/`, not on the
built `dist/`.

- Scenes (an arrangement of towers, waves) are in `e2e/scenes.ts`, the checks themselves in `e2e/visual.spec.ts`. A scene
  is a function of `XT.core`; it is serialised into the page, so it must not close over module variables.
- **The reference screenshots depend on the platform** (`*-win32.png` and so on). References for another OS or for CI
  have to be generated there: `yarn test:visual:update`.
- If the picture changed on purpose: `yarn test:visual:update`, then **look through** the changed PNGs in
  `e2e/visual.spec.ts-snapshots/` before committing.
- When a test fails, the details and diff images are in `test-results/` and `playwright-report/` (not in git;
  `npx playwright show-report`).

### Adding a scene

1. Describe the arrangement in `SCENES` (`e2e/scenes.ts`).
2. Add a `test(...)` to `e2e/visual.spec.ts`: `scene(page, "name", frames)`, then `shot(page, "shot-name")`.
3. `yarn test:visual:update`, and check the PNG with your eyes.

### Regression: "the music doubles"

`e2e/music-autoplay.spec.ts` and `e2e/music-blocked.spec.ts` check on the **real howler.js** (taken from `node_modules`,
the same version 2.2.4 as on the CDN) that under any changes of the music volume exactly one copy of the loop plays:
wiggling the slider, crossing 0 and back, a change during synthesis and decoding, a saved volume of 0, the real
settings dialog, a blocked autoplay (before the first click). The fake Howl in vitest does not catch this, because it
loads instantly while the real one loads asynchronously and with a queue for unlocking the sound.

## Playwright MCP for Claude Code

`.mcp.json` in the root connects `@playwright/mcp`: Claude Code in this folder can open the game in a browser itself,
click and take screenshots. Nothing needs installing: the server starts through `npx`; on the first start Claude Code
asks for permission to use it.

## Workflow

- Formatting: Prettier (`printWidth: 120`, `trailingComma: all`) — `npx prettier --write <files>`.
- Before a commit: `yarn test:all`. A refactoring must not change the behaviour (the golden test) or the picture (the
  screenshots); if it does, that must be a conscious decision with the references updated.
- All code is TypeScript: `src/`, tests (`tests/`), browser tests (`e2e/`), configs (`*.config.ts`), scripts
  (`scripts/`, run with `tsx`) and the service worker (`src/sw.ts`, which a plugin in `vite.config.ts` builds into
  `sw.js`; it is not part of the app bundle). `src/` is checked strictly; tests may have an implicit `any` (stubs and
  `page.evaluate` functions have no use for written-out types), the other checks are the same. The package is
  `"type": "module"`, and the configs import their plugins with the `.ts` extension.
- Comments and names in the code are in English, like the existing code.
- Several Claude Code sessions may work in the same copy at once: see `CLAUDE.md` (the rules) and `COORDINATION.md`
  (the board).

## Installing on a phone (PWA)

The game can be installed as an app: `public/manifest.json` (name, icons, the `standalone` display mode — not
`fullscreen`, or the system menu at the bottom glitches on Android; in the installed app the game does not offer full
screen), `src/sw.ts` (built into `sw.js`; the cache makes the game start without a network), `src/pwa.ts` (the logic of
the "Install" button in the settings).

- Android/Chrome: the "Install the app" button in the settings brings up the system dialog.
- iPhone/iPad: Safari gives no dialog, so the button suggests "Share → Add to Home Screen".
- Installing works only over HTTPS (or localhost). The service worker is on in the built version; in dev only with
  `?sw`, so the cache does not show old code.
- The icons are drawn from `public/icon.svg`: after changing the SVG run `yarn icons`.
- To force a new version of the cache, change `CACHE` in `src/sw.ts` (built into `sw.js`).

## Deploy

```sh
yarn deploy      # yarn build, then scp dist/ to the server (see package.json); the site is https://xeno.kovalev.app/
yarn maintenance # put the maintenance page `maintenance/index.html` on the site in place of the game (during work)
```

The maintenance page is a separate one-page file, `maintenance/index.html` (no scripts, no build, `noindex`).
`yarn maintenance` copies it by scp to `index.html` on the server; the game stays next to it (`assets/`, `sw.js`), so to
**bring the game back** just run `yarn deploy`. The installed app (PWA) serves pages "network first", so during the work
users will see the maintenance page too, and the game again after a deploy.
