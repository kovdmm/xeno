# Xeno-Tactics

A browser tower defence game: 8 tower types, up to 240 waves, 4 difficulties, 4 maps, player abilities, and music and
sound effects synthesised on the fly. Built with Vite; the source is TypeScript modules in `src/`. It installs as a PWA.

## Quick start

Needs Node.js 22+ and Yarn 1.

```sh
yarn install
yarn start                 # Vite dev server: http://localhost:3000
yarn build                 # production build into dist/
yarn preview               # look at dist/ locally
yarn typecheck             # four tsc checks: src (strict), tests and configs, the service worker, the highscore service
yarn build:server          # the highscore service into dist-server/ (see "Highscores")
```

External resources at runtime are Google Fonts and howler.js from a CDN (see `index.html`; howler is a classic
`<script>` and must load before the module). Offline the game still runs, but without sound and with system fonts.

For working on the game together with other Claude Code sessions see `CLAUDE.md` (the rules; the shared board is the gitignored folder `.claude/board/` of the main checkout).

## Structure

| Path             | Role                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `src/game/`      | the **simulation**: pure TypeScript, no DOM, sound, colours or texts (see below)                          |
| `src/i18n/`      | **languages**: `texts.<code>.json` (en, ru, de, ua, sv), language detection, the translator               |
| `src/render/`    | **rendering**: layers, sprite painters, effects, the floor (see "Rendering")                              |
| `src/audio/`     | **sound**: music, effects, mixer, player (see "Sound")                                                    |
| `src/ui/`        | **interface**: screens, HUD, palette, input, settings, the main loop (see "Interface")                    |
| `src/tutorial/`  | the **tutorial**: the script (`tutorial.yaml`), its pure engine and checks (see "Tutorial and Xenopedia") |
| `src/xenopedia/` | the reference pages as data, computed from the balance and the texts (see "Tutorial and Xenopedia")       |
| `src/core.ts`    | the game as the rest of the app sees it: the simulation plus "live" texts over the data tables            |
| `src/app.ts`     | assembles the services (translator, game, renderer factory, sound); tests assemble the same ones          |
| `src/main.ts`    | composition root: `createApp` → `createUi`; `window.XT` is only a handle for debugging                    |
| `src/sw.ts`      | the service worker (built to `sw.js` by a plugin in `vite.config.ts`)                                     |
| `sim/`           | the balance simulator: a bot plays the game (see "Balance simulator")                                     |
| `server/`        | the **highscore service** (node, sqlite) and its deploy files (see "Highscores")                          |
| `scripts/`       | build helpers: icons, the YAML plugin, the build fingerprint, the service bundle, the smoke test          |
| `tests/`         | unit and characterisation tests (Vitest)                                                                  |
| `e2e/`           | browser tests (Playwright): screenshots and interface behaviour                                           |
| `maintenance/`   | a one-page "back soon" site, put on the server in place of the game with `yarn maintenance`               |

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

| Section       | What is in it                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `board`       | the radius around a walking enemy where building is blocked (shared by all levels)                                                                   |
| `levels`      | the **levels**: the field, routes, walls and length of each map (see below)                                                                          |
| `economy`     | sell refund, ultimate price, overclock, bonuses for a wave and for calling one early, score, cheat codes                                             |
| `scaling`     | growth of enemy health and rewards over the waves (quadratic, faster after wave 100, a smoothed "rise")                                              |
| `combat`      | armour, blast radius and fall-off, burning, stun, plague, healers, jumpers, spawn spread                                                             |
| `shooting`    | most shots per tick, aiming speed, the cryo pulse, laser overheating                                                                                 |
| `projectiles` | speed, muzzle offset and hit radius of each kind of projectile, cluster-bomb and rocket parameters                                                   |
| `waves`       | route order, enemy cycles, formulas for counts and their limits, bosses, the final wave, mixed waves, the gap, the cap on waves on the board at once |
| `towers`      | cost, damage, fire rate and range for 4 levels, and the **ultimates as data**                                                                        |
| `enemies`     | health, speed, reward, armour, size, spawn interval                                                                                                  |
| `difficulty`  | multipliers and starting values of the four difficulties                                                                                             |
| `abilities`   | price, cooldown, aiming and the parameters of every ability                                                                                          |

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

Each level is a separate map; the first in the file is the one a new player starts on, and the file lists the maps in
the order of the campaign: `switchback`, `corner`, `crossroads`, `fronts`. Map and difficulty are chosen together in the
settings, in a grid of the maps (rows) by the difficulties (columns): a cell shows the best wave and, after a victory,
a star; a closed cell shows a lock and, in words, the rule that opens it. Records are kept per map and difficulty
(`xt-best-<map>-<difficulty>`, wins in `xt-won-<map>-<difficulty>`; records of older versions are not read). The tests
and the screenshot scenes play `crossroads` (the unit-test helper and the e2e harness pin it and open every map).

```yaml
switchback:
  finalWave: { easy: 100, normal: 110, hard: 120, insane: 130 } # the length grows with the difficulty
  hp: 1 # multiplies the HP of every enemy on this map
  unlock: # the campaign locks, see below
    difficulty: 21
    nextMap: 25
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

- **Length** (`finalWave`) — one number per difficulty, growing with the difficulty and along the campaign:
  switchback 100 / 110 / 120 / 130, corner 120 / 140 / 160 / 180, crossroads 160 / 180 / 200 / 220, fronts 180 / 200 /
  220 / 240 (easy / normal / hard / insane). The game picks it when a game starts. The bot of the simulator stops far
  before any of them (wave 12-33), so these are for a human; the longest game must replay on the server within its
  limit (see the replay section).
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
- **Checks at startup:** `finalWave` has all four difficulties and never gets shorter on a harder one; the gates are on the field, on its edge and do not overlap; `dir`/`exitDir` are unit steps;
  walls do not cover the gates; **every entrance cell can reach an exit** (the error names the cell).
- **Campaign locks** (`unlock`, rules in `src/game/campaign.ts`): `difficulty` is the best wave on one difficulty of the
  map that opens the next difficulty on it, `nextMap` the best wave on easy that opens the next map of the list (the last
  map has none). Now: `difficulty` 21 / 18 / 19 / 18 and `nextMap` 25 / 22 / 25 for switchback / corner / crossroads /
  fronts, about 80 % of what the simulator's maze bot reaches; the first map and easy are always open. The interface
  reads the rule through `core.lockOf`; the best wave of a cell is saved when a game ends, a victory is saved too (a
  cheated game is neither), a saved choice that is still closed falls back to the first map on easy, and the
  `bagowpw` cheat opens every cell.
- **Texts** of a map are `game.levels.<id>.name` and `.desc` in every `texts.*.json` (without words like "left" or
  "top": the field rotates); a test reminds you if you forget. The id is lower-case letters, digits, `-` and `_`.
- **Balance.** The numbers of enemies and towers depend on the wave number and on the map's `hp` coefficient (fronts
  0.85, the rest 1), so the `finalWave` numbers and the `hp` of a new map are best found by playing: a short map with one road
  is harder (every wave comes along it). The balance simulator below helps.

#### Balance simulator (`sim/`)

A bot plays the real game without an interface (`createGame`, seeded, 0.05 s steps) and shows how far a simple player
gets. It is a floor, not an average player: it never uses the abilities (a last resort for the player too) and
builds greedily next to the roads or along a baked maze. Use it to compare (before and after a change, one map with
another), not to read absolute waves. It is not part of `yarn test`.

- `yarn sim` plays every map × difficulty × strategy and prints the waves reached per seed, wins, minutes, lives,
  the share of waves called early and the enemies' final walk. `SIM_LEVELS`, `SIM_DIFFS`, `SIM_STRATEGIES` and
  `SIM_SEEDS` narrow the run.
- `SIM_PATCH='{"towers.gun.dmg":[5,10,19,34]}'` applies dotted-path changes to a copy of the balance, so a change
  can be tried without editing `balance.yaml`.
- Strategies (`sim/bot.ts`): `patient` waits for the timer; `rush` and `greedy` call waves early (at most 4 / 12
  enemies on the board); `gun-*` and `no-gun` compare tower compositions; `star-*` pump one gun to level 5 once there
  are N guns (the intended play against armour); `maze-*` and `star-maze*` build along the baked maze, and
  `star-maze10` is the reference bot for the campaign thresholds; `wavesPerTower` and `airEvery` vary the split between
  new turrets and upgrades and the share of turrets on the flyers' straight lane.
- `yarn sim sim/trace.sim.ts` shows one game wave by wave; `yarn sim sim/towers.sim.ts` the damage per credit of each
  tower and ultimate.
- The longest maze: `yarn sim sim/bake.sim.ts` searches it (simulated annealing over the turret cells, money ignored,
  the enemies' walk summed over all roads) and bakes it into `sim/mazes.json` with a fingerprint of the map: rebake
  after changing a map, a stale maze is refused. `yarn sim sim/mazecurve.sim.ts` prints how the walk grows with the
  number of towers.
- What it has shown so far: the armoured waves are the wall for a bot (armour is intended: one gun has to be pumped
  to level 5), so the maps differ for it mostly through the maze.

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
| `session.ts`, `settings.ts`      | a game, the win/loss screen, the intro; language, the campaign grid with confirmation  |
| `layout.ts`                      | fitting the field to the window, rotating on desktop                                   |
| `appMode.ts`, `soundControls.ts` | full screen and installing the app; the sound button and sliders                       |
| `progress.ts`, `loop.ts`         | saved choice, records, wins and what the campaign has opened; the game loop            |
| `routes.ts`, `mapThumb.ts`       | route labels computed from the geometry; the map thumbnails in the campaign grid       |
| `cheats.ts`                      | the toast texts of the extra cheat codes and the grumbles of the enemies               |

#### Cheat codes

Cheat codes are typed on the keyboard during a game (physical letters, so any layout works; the letters of a code in
progress do not trigger hotkeys). Typing a code flags the game as cheated (`State.cheated`): the best wave is not saved
and the game stays out of any records. A code works until the next new game; typing it again does nothing more.
The codes are the ones of GTA San Andreas. `hesoyam` is the only code with numbers (`economy.cheats` in the balance data); the others are switches in `State`.
No code may start with a hotkey letter (`q w e r t u s n f m`), because a letter that begins a code is swallowed: so the free-guns code is `lxgiwyl`, not `fullclip`.

| Code        | Effect                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `hesoyam`   | lives up to 100 and +250,000 credits                                                                             |
| `bagowpw`   | every map is open (remembered in the browser as `xt-allmaps`, `progress.mapsOpen()`; for the campaign locks)     |
| `aspirine`  | an immortal base: enemies that get through take no lives (for testing)                                           |
| `lxgiwyl`   | building and upgrading towers cost nothing (and sell for nothing)                                                |
| `crazytown` | a joke: speech bubbles ("oo, it tickles", "warm", "ouch, unpleasant"...) appear over the enemies, in 5 languages |

The bubbles are cosmetic and live in the renderer (`Fx.bubbles`, the `bubbles` layer, the fx random stream); the
simulation does not know about them.

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
| `marks.ts`                         | the turret marks: the specialisation letter and the overclock count (see below)                      |
| `theme.ts`, `color.ts`, `tiers.ts` | the palette, colour arithmetic, level and ultimate colours                                           |
| `projection.ts`                    | field → screen, the 90° rotation in portrait: the only place that knows about it                     |
| `sprites.ts`, `glow.ts`            | the sprite cache (drawn once), glows with a per-frame budget                                         |
| `floor.ts`, `quality.ts`           | the floor and the marks on it; a quality governor driven by the real frame time                      |

**Turret marks** (`marks.ts`, drawn over the turrets by the towers layer): a turret already differs by colour and shows
its level by size and tint, so the marks say other things. On the left, from level 5, the specialisation: the first
letter of its translated name (it follows the language); when the two specialisations of a tower would give the same
letter in a language (Cluster/Concussion, Призма/Перегрев) both get as many letters as it takes (`Cl`/`Co`). On the
right the number of overclocks, `+n`. The marks stay upright in portrait and are cached as sprites by their text.

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

- `ui` — interface strings with `{placeholders}` and HTML tags (`<b>`, `<kbd>`, …);
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

### Tutorial and Xenopedia (`src/tutorial/`, `src/xenopedia/`)

- **The script** is `src/tutorial/tutorial.yaml` (not in `src/game/`: changing it does not change the build id of the
  simulation). The first game of a new player is played on `switchback` easy with a coach layer; the steps are _goal, build,
  maze, call a wave early (twice), upgrade, level 5 and overclocking, abilities_. A step ends when the player does the thing
  (`until: { towers: 4 }`, `{ earlyCalls: 2 }` …) or presses Next (`until: next`); counters in `fresh` start from 0 at their step.
  A `target` says what to highlight: a selector, cells or the gates. The **tips** (`hints`) appear by themselves: the first time an
  enemy type shows up (armored, flyer, swarm, healer, blinker, boss), and "the field is almost clear, call the next wave" in
  any game until the player calls waves early.
- **The engine** (`src/tutorial/engine.ts`) is pure: the interface feeds it events and a snapshot of facts
  (`src/tutorial/types.ts` is the contract) and draws what `view()` returns; it also keeps the clock, the buttons and the saved
  flags. The text of a step `build-gun` is `tutBuildGun`, of a tip `armored` `tutHintArmored` (`ui` of every `texts.*.json`).
  `validateScript` checks the file against the game's data at startup and in the tests.
- **The Xenopedia** (`src/xenopedia/model.ts`) gives the pages as data: every tower (levels 1–4, the ultimates at level 5,
  overclocking), enemy (health, armour, reward on each difficulty at waves 1–100) and ability (price by wave and difficulty).
  The numbers come from the same functions the game uses (`towerStats`, `upCost`, `enemyAt`, `abilityCost` in
  `src/game/rules.ts`), the words from `texts.*.json`, so a page cannot go stale; a test compares every row with a real tower,
  creep and cast, and one fails when something in the data has no page or no text.
  The screen is `src/ui/xenopedia.ts` (markup `#pedia`): four tabs (towers, ultimates, enemies, abilities), a difficulty
  choice for the enemies and the prices, opened from the title (`#mPedia`) and from the `i` button on the card of a tower
  that is selected or being built; on a phone it is a full-screen page like the settings. `core.pedia()` gives the pages in
  the current language.

### Random numbers

Each subsystem has its own stream: `rng.core`, `rng.fx` (rendering), `rng.audio` (passed to `createApp(hooks)`). When
no stream is given, `Math.random` is used (for the simulation it is `createGame({ rng })`). This keeps cosmetics
(particles, shake) from shifting the simulation, and tests reproducible. In new code use the module's `rand()`, not
`Math.random()`.

The simulation's own stream is **seeded per game**: `newGame(difficulty, level, seed)` starts `mulberry32(seed)` and the ids
over, so a game is a function of its seed and the player's commands (this is what the highscore table replays, see
"Highscores"). The simulation must not read the clock, must not use `Math.random` itself, and must not use the engine's
own `Math.sin/cos/atan2/hypot/pow/exp/log` or `**` (they differ in the last bit between Chrome, Firefox and Safari):
use `src/game/dmath.ts`. A hygiene test fails on the forbidden ones.

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

| File                      | What it checks                                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/core.test.ts`      | the data tables, stats, upgrade prices, pathfinding, `placeCheck`, the economy, 200 waves, abilities                                                                                                                                |
| `tests/audio/*.test.ts`   | music (composer, rendering with a sample fingerprint, sound modes, instruments' pitch, song validator, player), effects (recipes, mixer, events → sounds, laser, bank), the system on a fake output, the Howler adapter, the facade |
| `tests/balance.test.ts`   | the `balance.yaml` validator (errors with a path), replacing numbers changes the game                                                                                                                                               |
| `tests/campaign.test.ts`  | the campaign data and rule: what is open from the best waves, validation of the thresholds                                                                                                                                          |
| `tests/levels.test.ts`    | the maps: gates, walls, reachability, texts of every level                                                                                                                                                                          |
| `tests/hygiene.test.ts`   | `Math.random` only as the default of the streams, no IIFE leftovers and no `window.XT` outside `main.ts`, the composer knows no sound and the renderer no songs                                                                     |
| `tests/tutorial.test.ts`  | the tutorial script against the game's data, a text for every step and tip in every language, the engine's steps and tips                                                                                                           |
| `tests/xenopedia.test.ts` | a page for everything in the data, words in every language, every number equal to the game's own                                                                                                                                    |
| `tests/i18n.test.ts`      | completeness of all five languages (keys, placeholders, HTML tags, coverage of the ids in the balance), language detection, the translator with English fallback, live texts over core data                                         |
| `tests/render/`           | the parts of rendering: projection, the quality governor, effects, the sprite cache, colours, the layer composition                                                                                                                 |
| `tests/render.test.ts`    | 45 waves on a stub 2D context: it does not crash, leaves no mess in the ctx state; rendering does not influence the simulation                                                                                                      |
| `tests/ui/`               | the pure logic of the interface: commands, keys, panels, routes, sessions                                                                                                                                                           |

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

The server (`vite dev` on `127.0.0.1`) starts automatically, so the tests run on the sources in `src/`, not on the
built `dist/`. Every working copy has its own port, `4200 + (hash(absolute path of the repo folder) % 700)` (see
`playwright.config.ts`); override it with the env var `PW_PORT`. An already running server is never reused: if the port
is taken, the run fails, so a server from another worktree can never be tested by mistake. Playwright uses at most 2
workers (`workers` in the config): the suites of several sessions run in parallel, and more workers overload the machine
and cause timeouts.

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
- Several Claude Code sessions may work in the same copy at once: see `CLAUDE.md` (the rules) and the board in
  `.claude/board/` of the main checkout (gitignored: every session has its own worktree, so the board must exist once).

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

## Highscores

A record is a **game**, not a number: the browser records the game, the server plays it again and takes the result from
its own game. Nothing the client says about its score is used, so a score cannot be typed in or edited.

### How a record is made

1. **A seed from the server.** In the background (never waited for) the page asks `GET /api/run?level=&diff=` for the next
   game on the chosen map and difficulty: a random 32-bit seed and a signed token (HMAC, valid six hours, used once). A game
   made without one (no connection, an old page) plays exactly as always, it just cannot be entered. A game made before the
   seed arrived and still untouched (no wave, no tower, no cheat) is silently started over on it (`session.reseed`).
2. **Recording.** The game starts with `newGame(difficulty, level, seed)`. `src/game/recorder.ts` wraps the commands (place,
   upgrade, sell, call a wave, cast) and counts ticks; the interface steps the game in whole ticks of `TICK = 1/60` s
   (`src/ui/loop.ts`), so speed ×2/×3/×5 is just more ticks per frame. A cheat, or a step that is not a whole tick, makes the
   game unrecordable (`core.run()` is `null`). A run is `{v, build, level, diff, seed, ticks, actions}` (`src/game/run.ts`);
   a 100-wave game of a bot had about 300 commands, so a run is a few kilobytes.
3. **Saving.** The end screen of an enterable game has "Save to the table": `POST /api/run {run, nick, token}`. The name is
   asked **once** (a field on the end screen the first time, then kept in `xt-nick` and used silently; it is changed in the
   settings). Only a player's **best** result is entered: the page remembers what it has had entered (`xt-saved-best`) and
   does not offer a game that cannot beat it, and the service keeps the better one anyway. Leaving a finished, unsaved game
   (new game, menu, another map) asks "Save to the records table?" once per game.
4. **Replay.** The service checks the token (ours, not expired, not used, made for this very seed, map and difficulty), the
   build (see below), that the same game was not entered before (a hash of the canonical text of the run), then replays the
   run in a worker thread, one at a time, with a hard time limit. A run is refused when a command does not fit the game, the
   game is not over at the recorded end, the recorded end is later than the game's, commands are left over or come after the
   end, it has any field but the seven, or it takes more than 90 s of CPU: a game has exactly one valid text.
5. **Entry.** The table gets the **replayed** result. Refusals are 422 (`rejected`), 409 (`build`, `used`, `duplicate`), 410
   (token expired), 429 (too many), 503 (busy: the token is given back and the player may try again).

### Rules

- **Ranking** (per map and difficulty): a win first, then the waves **cleared** (all of waves 1..n fully killed or through),
  then the score, then the shorter game. It is not the wave _called_: calling waves early stacks them, and "wave 40" with only
  5 cleared must not beat a game that cleared 8. A name keeps its best result per map and difficulty.
- **The table** is `GET /api/scores?level=&diff=&limit=`; without `level` and/or `diff` it is the table of all maps and/or
  difficulties, ranked the same way (a row says its map and difficulty). It is never cached: the service answers
  `cache-control: no-store`, the page asks with `cache: "no-store"`, the service worker (`src/sw.ts`) does not touch `/api/`
  at all, and the records screen reads it again every time it opens, so a player sees their place at once.
- **Names** (`src/nick.ts`, used by the server and the page): letters of any script, digits, space and `_ . ' -`, at most 16
  characters, accents composed, stacks of combining marks and everything else removed (markup, controls, bidi marks, emoji);
  nothing left, or a name from a short block list, becomes "Anonymous". Names are shown with `textContent` only.
- **Limits**: a request body of 256 KB; the service allows twenty submissions and 120 seeds an hour per address (a hash of it,
  the address itself is never stored); nginx adds 60 reads, 20 submissions and 90 result polls a minute; a replay may take 90 s of CPU and
  three wait or run at most (then the answer is 503 `busy`; `server/limits.ts`). A 100-wave game (192 000 ticks) replays in
  about 7 s on the server, but a late game with 70 upgraded towers took 56 s at the natural pace up to the 90-minute limit and
  77 s with the waves called at once: the cost per tick grows with towers x enemies, which is why the limit is 90 s and the
  page waits up to 120 s for the answer.
- A recording proves that a game was **legal**, not that a human played it: a bot that plays well can enter. That is accepted.

### Rules for the simulation (what keeps replays equal)

The server must compute exactly what the browser did, in Chrome, Firefox and Safari alike. So `src/game/` uses `dmath.ts` for
sin/cos/atan2/hypot/pow/exp/log, no clock, no `Math.random` (the seeded stream only), no `**` (a hygiene test checks
this). Two fingerprints guard it: `src/game/digests.ts` holds what node computes for `mathDigest()` (dmath over fixed inputs),
`gameDigest()` (a scripted game with every tower and ability) and `runDigest()` (a whole recorded game);
`e2e/determinism.spec.ts` computes the same in Chromium, Firefox and WebKit (install them once with
`yarn playwright install firefox webkit`) and replays a run recorded in one engine in another. After a change that
deliberately alters the game's numbers the digests change: run the tests, check that the new values are the intended ones,
and copy them from the failure message into `digests.ts`.

### The build must match

Every run carries `SIM_BUILD`, a hash of every file of `src/game/` (including `balance.yaml`, comments too) except the three
determinism-check files (`scripts/simBuild.ts`). The service accepts only runs of its own build (409 `build`; the page says
"out of date, reload"). So **a change of `src/game/` or of the balance needs both sides rebuilt from the same commit**, in
this order:

1. merge it and run `yarn build:server`;
2. `server/deploy/install.sh` on the server (upload as in `server/deploy/README.md`): the service now has the new build;
3. `yarn deploy` the site.

Between 2 and 3 a page that is still open on the old version gets "out of date" when it tries to save. Entries made on an
earlier build stay in the table (their runs are kept compressed in the database, so they can be checked again; there is no
tool for that yet).

### Where the code is

| What                                    | Where                                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| the run format, `replay()`, `SIM_BUILD` | `src/game/run.ts`                                                                                                                       |
| recording, `core.run()`                 | `src/game/recorder.ts`, `src/core.ts`                                                                                                   |
| engine-independent math, seeded rng     | `src/game/dmath.ts`, `src/game/rng.ts`                                                                                                  |
| the page: seed, save box, records       | `src/scores.ts` (client of the service), `src/ui/records.ts`, `src/ui/session.ts`                                                       |
| the service                             | `server/api.ts` (HTTP), `server/db.ts` (sqlite), `server/verifier.ts` + `server/replayWorker.ts`                                        |
| the server's files and the runbook      | `server/deploy/` (README.md: install, smoke test, rollback), `yarn build:server`                                                        |
| tests                                   | `tests/replay*.test.ts`, `tests/seed.test.ts`, `tests/dmath.test.ts`, `tests/server/`, `e2e/records.spec.ts`, `e2e/determinism.spec.ts` |

### Operating it

Install, update, the smoke test (`node dist-server/smoke.mjs https://xeno.kovalev.app`, five submissions, run it once an hour at
most, then remove its entry) and the rollback are in `server/deploy/README.md`. Moderation, on the server, as the service's user:

```sh
runuser -u xeno -- env DB_PATH=/var/lib/xeno/highscores.db /usr/local/bin/node --disable-warning=ExperimentalWarning \
  /opt/xeno-scores/admin.mjs top crossroads easy 20        # also: remove <id> | remove-nick <nick> | backup <file>
journalctl -u xeno-scores -f                               # JSON lines; addresses appear only as hashes
```

The table is in `/var/lib/xeno/highscores.db`; a copy is made every night at 03:17 (kept two weeks) in `/var/lib/xeno/backup/`.

## Deploy

The highscore service is deployed separately (see "Highscores"); the site is:

```sh
yarn deploy      # yarn build, then scp dist/ to the server (see package.json); the site is https://xeno.kovalev.app/
yarn maintenance # put the maintenance page `maintenance/index.html` on the site in place of the game (during work)
```

The maintenance page is a separate one-page file, `maintenance/index.html` (no scripts, no build, `noindex`).
`yarn maintenance` copies it by scp to `index.html` on the server; the game stays next to it (`assets/`, `sw.js`), so to
**bring the game back** just run `yarn deploy`. The installed app (PWA) serves pages "network first", so during the work
users will see the maintenance page too, and the game again after a deploy.
