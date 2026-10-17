/* Xeno-Tactic — canvas renderer, "derelict colony" look in the spirit of old Flash games:
   grimy metal deck, organic hive breaches, glossy outlined aliens, gore decals, additive glow.
   It reads XT.core.S (never writes it) and turns core events into effects.
   API: XT.createRenderer(canvas) → {resize, draw(view,dt), towerIcon(ctx,type), theme}.
   Performance: the floor, tower parts, alien frames and glows are rendered once into
   offscreen canvases and blitted each frame; only cheap shapes are drawn live. */
import { THEME, TAU } from "./render/theme";
import { alpha, shade } from "./render/color";
import { outline, gloss } from "./render/primitives";
import { tierColor } from "./render/tiers";
import { towerBase, towerTurret, towerVector, lvK } from "./render/towers";
import { alienVector } from "./render/aliens";

export function installRender(XT) {
  // Randomness comes from XT.rng.fx when set (tests seed it); each module has its own stream so that
  // cosmetic randomness never shifts the game simulation.
  const rand = (XT.rng && XT.rng.fx) || Math.random;
  const clock = (XT.env && XT.env.now) || (() => performance.now());
  function rng(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const specOf = (type, ult) => Object.keys(XT.core.TT[type].ults).indexOf(ult);

  XT.createRenderer = function (canvas) {
    const ctx = canvas.getContext("2d");
    const C = XT.core;
    let towersDirty = true,
      cs = 1,
      fx = [],
      texts = [],
      flash = 0,
      redFlash = 0,
      shake = 0,
      ground = null,
      decals = null,
      dctx = null,
      floor = null,
      fctx = null,
      floorDirty = true,
      floorT = 0,
      decalFade = 0;
    const cache = new Map();
    const kick = new WeakMap();
    const phase = (id) => (id * 2.399) % TAU;

    /* ---------- sprite cache ---------- */
    function sprite(key, size, fn) {
      let s = cache.get(key);
      if (s) return s;
      const px = Math.max(4, Math.ceil(size * cs));
      const cv = document.createElement("canvas");
      cv.width = cv.height = px;
      const c = cv.getContext("2d");
      c.setTransform(px / size, 0, 0, px / size, px / 2, px / 2);
      fn(c);
      s = { cv, size };
      cache.set(key, s);
      return s;
    }
    // Blits use explicit matrices instead of save/restore: much cheaper with hundreds of sprites.
    let ox = 0,
      oy = 0;
    /* Board → screen matrix. In portrait the board is turned 90° clockwise
     (board x runs down the screen, board y runs right-to-left) so it fills a tall screen. */
    let rot = false;
    function M(c2, dx = 0, dy = 0) {
      if (rot) c2.setTransform(0, cs, -cs, 0, C.H * cs + dx, dy);
      else c2.setTransform(cs, 0, 0, cs, dx, dy);
    }
    // text stays upright whatever the board rotation
    function blitUp(s, x, y, c2 = ctx, dx = ox, dy = oy) {
      if (!rot) return blit(s, x, y, 0, 1, c2);
      const d = s.size;
      c2.setTransform(cs, 0, 0, cs, (C.H - y) * cs + dx, x * cs + dy);
      c2.drawImage(s.cv, -d / 2, -d / 2, d, d);
      M(c2, dx, dy);
    }
    function blit(s, x, y, ang, scale = 1, c2 = ctx) {
      const d = s.size * scale;
      c2.drawImage(s.cv, x - d / 2, y - d / 2, d, d);
    }
    /* Rotated sprite: the angle is snapped to 32 steps and each step is rendered once (lazily),
     so every frame is a plain unrotated copy. */
    const STEPS = 32;
    function rsprite(key, size, ang, fn) {
      const st = ((Math.round((ang / TAU) * STEPS) % STEPS) + STEPS) % STEPS;
      return sprite(key + "@" + st, size * 1.42, (c) => {
        c.rotate((st * TAU) / STEPS);
        fn(c);
      });
    }
    // soft radial glow, cached per colour at a fixed resolution
    const glows = new Map();
    function glow(col) {
      let g = glows.get(col);
      if (g) return g;
      const cv = document.createElement("canvas");
      cv.width = cv.height = 64;
      const c = cv.getContext("2d");
      const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.18, alpha(col, 0.95));
      gr.addColorStop(0.5, alpha(col, 0.35));
      gr.addColorStop(1, alpha(col, 0));
      c.fillStyle = gr;
      c.fillRect(0, 0, 64, 64);
      glows.set(col, cv);
      return cv;
    }
    // additive glows are the main fill-rate cost: capped per frame, oversized ones shrink
    let glowBudget = 0;
    let smokeCv = null;
    function smokeSprite() {
      if (smokeCv) return smokeCv;
      smokeCv = document.createElement("canvas");
      smokeCv.width = smokeCv.height = 32;
      const c = smokeCv.getContext("2d");
      const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, "rgba(18,16,14,.9)");
      g.addColorStop(1, "rgba(18,16,14,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 32, 32);
      return smokeCv;
    }
    function addGlow(col, x, y, r, a = 1, force) {
      if (!force && --glowBudget < 0) return;
      r = Math.min(r, 2.6);
      ctx.globalAlpha = a;
      ctx.drawImage(glow(col), x - r, y - r, r * 2, r * 2);
    }

    /* ---------- floor ---------- */
    function buildGround() {
      const W = C.W,
        H = C.H;
      ground = document.createElement("canvas");
      ground.width = canvas.width;
      ground.height = canvas.height;
      const g = ground.getContext("2d");
      M(g);
      const R = rng(1337);
      g.fillStyle = THEME.seam;
      g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const v = R() * 0.07 - 0.035,
            base = shade(THEME.deck, v),
            dark = shade(THEME.deck2, v);
          // tiles touch; seams are drawn afterwards on whole device pixels so they never shimmer
          g.fillStyle = gloss(g, x, y, x + 1, y + 1, base, dark);
          g.fillRect(x - 0.01, y - 0.01, 1.02, 1.02);
          if (R() < 0.35)
            for (const [dx, dy] of [
              [0.12, 0.12],
              [0.88, 0.12],
              [0.12, 0.88],
              [0.88, 0.88],
            ]) {
              g.beginPath();
              g.arc(x + dx, y + dy, 0.025, 0, TAU);
              g.fillStyle = "rgba(0,0,0,.6)";
              g.fill();
              g.beginPath();
              g.arc(x + dx - 0.006, y + dy - 0.006, 0.012, 0, TAU);
              g.fillStyle = "rgba(160,150,135,.35)";
              g.fill();
            }
          if (R() < 0.12) {
            g.strokeStyle = "rgba(0,0,0,.45)";
            g.lineWidth = 0.015;
            g.beginPath();
            let px = x + R(),
              py = y + R();
            g.moveTo(px, py);
            for (let k = 0; k < 4; k++) {
              px += R() * 0.3 - 0.15;
              py += R() * 0.3 - 0.15;
              g.lineTo(px, py);
            }
            g.stroke();
          }
        }
      pixelGrid(g, "rgba(0,0,0,.8)", Math.max(1, Math.round(cs * 0.045)), "rgba(255,255,255,.08)");
      M(g);
      // rust and grime
      for (let i = 0; i < 70; i++) {
        const x = R() * W,
          y = R() * H,
          r = 0.4 + R() * 2.2,
          col = R() < 0.5 ? THEME.rust : THEME.grime;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, alpha(col, 0.35 + R() * 0.2));
        gr.addColorStop(1, alpha(col, 0));
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // dried ichor stains
      for (let i = 0; i < 14; i++) {
        const x = R() * W,
          y = R() * H;
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          g.arc(x + R() * 0.8 - 0.4, y + R() * 0.8 - 0.4, 0.05 + R() * 0.2, 0, TAU);
          g.fillStyle = alpha(R() < 0.6 ? "#2a0710" : "#16300a", 0.35);
          g.fill();
        }
      }
      // hive veins creeping out of the breaches
      for (const r of Object.values(C.ROUTES)) {
        for (let v = 0; v < 16; v++) {
          let x = r.spawn[1][0] + 0.5,
            y = r.spawn[1][1] + 0.5,
            a = Math.atan2(r.dir[1], r.dir[0]) + (R() - 0.5) * 2.4;
          g.beginPath();
          g.moveTo(x, y);
          const len = 2 + R() * 5;
          for (let s = 0; s < len * 4; s++) {
            a += (R() - 0.5) * 0.8;
            x += Math.cos(a) * 0.25;
            y += Math.sin(a) * 0.25;
            g.lineTo(x, y);
          }
          g.strokeStyle = alpha(THEME.vein, 0.55);
          g.lineWidth = 0.04 + R() * 0.07;
          g.lineCap = "round";
          g.stroke();
        }
        const [sx, sy] = r.spawn[1],
          gr = g.createRadialGradient(sx + 0.5, sy + 0.5, 0, sx + 0.5, sy + 0.5, 2.2);
        gr.addColorStop(0, "rgba(20,0,6,.95)");
        gr.addColorStop(0.45, alpha(THEME.hive, 0.55));
        gr.addColorStop(1, "rgba(60,0,20,0)");
        g.fillStyle = gr;
        g.fillRect(sx - 2, sy - 2, 5, 5);
        // exit: bunker gate with hazard stripes
        const ex = r.exit,
          minx = Math.min(...ex.map((e) => e[0])),
          miny = Math.min(...ex.map((e) => e[1])),
          maxx = Math.max(...ex.map((e) => e[0])) + 1,
          maxy = Math.max(...ex.map((e) => e[1])) + 1;
        g.fillStyle = THEME.gate;
        g.fillRect(minx, miny, maxx - minx, maxy - miny);
        g.save();
        g.beginPath();
        g.rect(minx, miny, maxx - minx, maxy - miny);
        g.clip();
        for (let k = -6; k < 8; k++) {
          g.beginPath();
          g.moveTo(minx + k * 0.35, miny);
          g.lineTo(minx + k * 0.35 + 0.17, miny);
          g.lineTo(minx + k * 0.35 + 0.17 - (maxy - miny), maxy);
          g.lineTo(minx + k * 0.35 - (maxy - miny), maxy);
          g.closePath();
          g.fillStyle = k % 2 ? "rgba(214,164,25,.55)" : "rgba(10,10,10,.6)";
          g.fill();
        }
        g.restore();
        g.strokeStyle = "#000";
        g.lineWidth = 0.06;
        g.strokeRect(minx, miny, maxx - minx, maxy - miny);
      }
      // floor = ground + gore decals, recomposited only when decals change (vignette and scanlines are CSS)
      floor = document.createElement("canvas");
      floor.width = canvas.width;
      floor.height = canvas.height;
      fctx = floor.getContext("2d");
      floorDirty = true;
      // decals persist across resizes when possible
      const old = decals;
      decals = document.createElement("canvas");
      decals.width = canvas.width;
      decals.height = canvas.height;
      dctx = decals.getContext("2d");
      if (old) dctx.drawImage(old, 0, 0, decals.width, decals.height);
      M(dctx);
    }
    /* Grid lines snapped to whole device pixels (screen space, so it works for both board orientations). */
    function pixelGrid(c2, col, w, hi, dx = 0, dy = 0) {
      c2.setTransform(1, 0, 0, 1, 0, 0);
      const nx = rot ? C.H : C.W,
        ny = rot ? C.W : C.H,
        cw = canvas.width,
        ch = canvas.height;
      c2.fillStyle = col;
      for (let i = 0; i <= nx; i++) {
        const p = Math.round(i * cs + dx - w / 2);
        c2.fillRect(p, 0, w, ch);
      }
      for (let j = 0; j <= ny; j++) {
        const p = Math.round(j * cs + dy - w / 2);
        c2.fillRect(0, p, cw, w);
      }
      if (hi) {
        c2.fillStyle = hi;
        for (let i = 0; i <= nx; i++) {
          const p = Math.round(i * cs + dx - w / 2) + w;
          c2.fillRect(p, 0, 1, ch);
        }
        for (let j = 0; j <= ny; j++) {
          const p = Math.round(j * cs + dy - w / 2) + w;
          c2.fillRect(0, p, cw, 1);
        }
      }
    }
    function splat(x, y, col, size) {
      if (!dctx) return;
      floorDirty = true;
      for (let i = 0; i < 5 + size * 6; i++) {
        const a = rand() * TAU,
          d = rand() * size * 0.8,
          r = 0.04 + rand() * size * 0.25;
        dctx.beginPath();
        dctx.arc(x + 0.5 + Math.cos(a) * d, y + 0.5 + Math.sin(a) * d, r, 0, TAU);
        dctx.fillStyle = alpha(col, 0.55 + rand() * 0.3);
        dctx.fill();
      }
    }
    function scorch(x, y, r) {
      if (!dctx) return;
      floorDirty = true;
      const gr = dctx.createRadialGradient(x + 0.5, y + 0.5, 0, x + 0.5, y + 0.5, r);
      gr.addColorStop(0, "rgba(0,0,0,.55)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      dctx.fillStyle = gr;
      dctx.fillRect(x + 0.5 - r, y + 0.5 - r, r * 2, r * 2);
    }

    /* ---------- effects ---------- */
    // particle budget: cosmetic sparks and smoke are dropped first when the field is busy
    /* Quality governor: measures real frame time and steps between three levels
     (backing-store size, glow and particle budgets) so weak phones stay smooth. */
    const Q = [
      { px: 1.0e6, glow: 35, fx: 140, cos: 60 },
      { px: 1.4e6, glow: 80, fx: 260, cos: 160 },
      { px: 1.8e6, glow: 150, fx: 380, cos: 240 },
    ];
    let quality = 2,
      qAcc = 0,
      qN = 0,
      good = 0,
      lastNow = 0;
    function governor() {
      const now = clock();
      if (lastNow) {
        const d = now - lastNow;
        if (d < 250) {
          qAcc += d;
          qN++;
        }
      }
      lastNow = now;
      if (qN < 90) return;
      const avg = qAcc / qN;
      qAcc = qN = 0;
      if (avg > 24 && quality > 0) {
        quality--;
        good = 0;
        ground = null;
      } else if (avg < 13 && quality < 2) {
        if (++good >= 4) {
          quality++;
          good = 0;
          ground = null;
        }
      } else good = 0;
    }
    const P = (o) => {
      const q = Q[quality];
      if (fx.length < q.fx && ((o.k !== "spark" && o.k !== "smoke") || fx.length < q.cos)) fx.push(o);
    };
    function sparks(x, y, n, col, v0, v1, life, s = 0.05) {
      for (let i = 0; i < n; i++) {
        const a = rand() * TAU,
          v = v0 + rand() * (v1 - v0);
        P({
          k: "spark",
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: life * (0.5 + rand() * 0.5),
          max: life,
          col,
          s,
        });
      }
    }
    function smoke(x, y, n, r) {
      for (let i = 0; i < n; i++)
        P({
          k: "smoke",
          x: x + (rand() - 0.5) * r,
          y: y + (rand() - 0.5) * r,
          vx: (rand() - 0.5) * 0.4,
          vy: -0.3 - rand() * 0.4,
          life: 0.8 + rand() * 0.6,
          max: 1.4,
          r: 0.2 + rand() * r * 0.4,
        });
    }
    function blast(x, y, r, col, life, flashA = 0) {
      P({ k: "blast", x, y, r, col, life, max: life });
      smoke(x, y, Math.min(6, (2 + r * 2) | 0), r);
      if (flashA) flash = Math.max(flash, flashA);
    }
    const addShake = (a) => {
      if (!reduceMotion) shake = Math.min(0.6, shake + a);
    };

    C.on((e) => {
      switch (e.type) {
        case "built":
        case "upgraded":
        case "sold":
          towersDirty = true;
          break;
        case "reset":
          towersDirty = true;
          fx = [];
          texts = [];
          flash = redFlash = shake = 0;
          if (dctx) {
            dctx.save();
            dctx.setTransform(1, 0, 0, 1, 0, 0);
            dctx.clearRect(0, 0, decals.width, decals.height);
            dctx.restore();
            floorDirty = true;
          }
          break;
        case "shot": {
          kick.set(e.tower, 1);
          const t = e.tower;
          if (t.type !== "frost" && t.type !== "laser") {
            const L = t.size > 1 ? 0.95 : 0.45;
            P({
              k: "muzzle",
              x: t.x + Math.cos(t.ang) * L,
              y: t.y + Math.sin(t.ang) * L,
              col: THEME.tower[t.type],
              life: 0.08,
              max: 0.08,
              r: t.size > 1 ? 0.6 : 0.32,
            });
          }
          break;
        }
        case "kill": {
          const c = e.creep,
            b = c.boss;
          splat(e.x, e.y, THEME.blood[c.type], b ? 1.4 : c.r * 1.6);
          sparks(e.x, e.y, b ? 26 : 6, THEME.enemy[c.type], 1, b ? 5 : 3, 0.5, b ? 0.09 : 0.06);
          if (b) {
            blast(e.x, e.y, 1.4, THEME.enemy[c.type], 0.6);
            addShake(0.25);
          }
          if (texts.length < 26) texts.push({ x: e.x, y: e.y, v: "+" + c.rw, life: 0.9, max: 0.9 });
          break;
        }
        case "leak":
          redFlash = Math.min(1, redFlash + (e.creep.boss ? 0.9 : 0.35));
          addShake(e.creep.boss ? 0.3 : 0.08);
          break;
        case "pulse":
          P({
            k: "ring",
            x: e.tower.x,
            y: e.tower.y,
            r: e.r,
            life: 0.5,
            max: 0.5,
            col: e.freeze ? THEME.white : THEME.ice,
            w: e.freeze ? 0.08 : 0.04,
          });
          break;
        case "heal":
          P({
            k: "ring",
            x: e.x,
            y: e.y,
            r: e.r,
            life: 0.4,
            max: 0.4,
            col: THEME.enemy.healer,
            w: 0.03,
          });
          break;
        case "blink":
          P({
            k: "zap",
            x: e.x,
            y: e.y,
            x2: e.x2,
            y2: e.y2,
            life: 0.2,
            max: 0.2,
            col: THEME.enemy.blinker,
          });
          break;
        case "rail":
          P({
            k: "rail",
            x: e.x,
            y: e.y,
            x2: e.x2,
            y2: e.y2,
            life: 0.3,
            max: 0.3,
            col: THEME.tower.rail,
            w: e.width * (e.big ? 1.4 : 1),
          });
          break;
        case "muzzle":
          kick.set(e.tower, 1);
          P({
            k: "muzzle",
            x: e.x,
            y: e.y,
            col: THEME.accent,
            life: 0.12,
            max: 0.12,
            r: 0.7,
          });
          smoke(e.x, e.y, 2, 0.4);
          break;
        case "cast":
          if (e.ability === "stasis") flash = Math.max(flash, 0.25);
          break;
        case "explode": {
          const K = e.kind,
            x = e.x,
            y = e.y;
          if (K === "shell" || K === "bomblet") {
            blast(x, y, e.r, THEME.tower.cannon, 0.3);
            if (K === "shell") scorch(x, y, e.r * 0.5);
          } else if (K === "missile") blast(x, y, e.r, THEME.fire, 0.3);
          else if (K === "plasma") {
            P({
              k: "blast",
              x,
              y,
              r: e.r + 0.2,
              col: THEME.tower.plasma,
              life: 0.3,
              max: 0.3,
            });
            sparks(x, y, 4, THEME.tower.plasma, 1, 2.5, 0.3);
          } else if (K === "artillery") {
            blast(x, y, e.r, THEME.fire, 0.5);
            scorch(x, y, e.r * 0.7);
            addShake(0.06);
          } else if (K === "nukeShell") {
            blast(x, y, e.r, THEME.fire, 0.9, 0.3);
            scorch(x, y, e.r);
            addShake(0.25);
            sparks(x, y, 20, THEME.accent, 2, 6, 0.7, 0.08);
          } else if (K === "meteor") {
            blast(x, y, e.r, THEME.fire, 0.45);
            scorch(x, y, e.r * 0.6);
            sparks(x, y, 6, THEME.accent, 1, 3, 0.4);
            addShake(0.05);
          } else if (K === "bomb") {
            blast(x, y, e.r, THEME.accent, 0.4);
            scorch(x, y, e.r * 0.5);
            addShake(0.03);
          } else if (K === "nuke") {
            flash = 1;
            addShake(0.6);
            scorch(x, y, e.r * 1.1);
            P({
              k: "blast",
              x,
              y,
              r: e.r * 1.2,
              col: THEME.fire,
              life: 1.4,
              max: 1.4,
            });
            P({
              k: "ring",
              x,
              y,
              r: e.r * 1.8,
              life: 1,
              max: 1,
              col: THEME.white,
              w: 0.12,
            });
            sparks(x, y, 50, THEME.accent, 1, 7, 1, 0.1);
            smoke(x, y, 14, e.r);
          }
          break;
        }
      }
    });

    function ambient(dt) {
      const S = C.S;
      for (const t of S.towers)
        if (t.beam)
          for (const c of t.beam)
            if (rand() < dt * 12) {
              const [x, y] = C.pos(c);
              sparks(x, y, 1, THEME.tower.laser, 0.5, 2, 0.25, 0.04);
            }
      for (const p of S.proj)
        if (p.k === "m" && rand() < dt * 25)
          P({
            k: "smoke",
            x: p.x,
            y: p.y,
            vx: 0,
            vy: 0,
            life: 0.5,
            max: 0.5,
            r: 0.08,
          });
      for (const c of S.creeps)
        if (c.burnT > 0 && rand() < dt * 6) {
          const [x, y] = C.pos(c);
          P({
            k: "flame",
            x: x + (rand() - 0.5) * c.r,
            y,
            vx: 0,
            vy: -0.9,
            life: 0.45,
            max: 0.45,
            col: c.plague ? THEME.plague : THEME.fire,
            r: 0.18,
          });
        }
      for (const z of S.zones)
        if (rand() < dt * 14) {
          const a = rand() * TAU,
            r = Math.sqrt(rand()) * z.r;
          P({
            k: "flame",
            x: z.x + Math.cos(a) * r,
            y: z.y + Math.sin(a) * r,
            vx: 0,
            vy: -0.7,
            life: 0.6,
            max: 0.6,
            col: THEME.fire,
            r: 0.3,
          });
        }
      for (const f of fx) {
        f.life -= dt;
        if (f.vx !== undefined) {
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          if (f.k === "spark") {
            f.vx *= 0.9;
            f.vy *= 0.9;
          }
        }
      }
      fx = fx.filter((f) => f.life > 0);
      for (const t of texts) {
        t.life -= dt;
        if (rot) t.x -= dt * 0.9;
        else t.y -= dt * 0.9;
      }
      texts = texts.filter((t) => t.life > 0);
      flash = Math.max(0, flash - dt * 1.4);
      redFlash = Math.max(0, redFlash - dt * 1.2);
      shake = Math.max(0, shake - dt * 1.6);
      for (const t of S.towers) {
        const k = kick.get(t);
        if (k > 0) kick.set(t, Math.max(0, k - dt * 7));
      }
      decalFade += dt;
      if (decalFade > 0.5 && dctx) {
        decalFade = 0;
        dctx.save();
        dctx.setTransform(1, 0, 0, 1, 0, 0);
        dctx.globalCompositeOperation = "destination-out";
        dctx.fillStyle = "rgba(0,0,0,.035)";
        dctx.fillRect(0, 0, decals.width, decals.height);
        dctx.restore();
        floorDirty = true;
      }
    }

    function resize() {
      const r = canvas.getBoundingClientRect(),
        dpr = Math.min(2, window.devicePixelRatio || 1);
      let w = Math.max(1, Math.round(r.width * dpr)),
        h = Math.max(1, Math.round(r.height * dpr));
      // keep phones fast: cap the backing store at ~2.4 Mpx
      const k = Math.min(1, Math.sqrt(Q[quality].px / (w * h)));
      w = Math.round(w * k);
      h = Math.round(h * k);
      if (w === canvas.width && h === canvas.height && ground) return;
      canvas.width = w;
      canvas.height = h;
      cs = w / (rot ? C.H : C.W);
      cache.clear();
      buildGround();
    }

    function drawPath(r, t) {
      const p = C.routePath(r);
      ctx.beginPath();
      p.forEach(([x, y], i) => ctx[i ? "lineTo" : "moveTo"](x + 0.5, y + 0.5));
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = alpha(THEME.path, 0.14);
      ctx.lineWidth = 0.32;
      ctx.stroke();
      ctx.setLineDash([0.12, 0.38]);
      ctx.lineDashOffset = -t * 1.2;
      ctx.strokeStyle = alpha(THEME.path, 0.8);
      ctx.lineWidth = 0.1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    function drawAirLanes(t) {
      const S = C.S,
        lanes = new Set();
      for (const c of S.creeps) if (c.fly && !c.dead) lanes.add(c.route);
      for (const sp of S.spawners) for (const e of sp.list) if (C.ET[e.type].fly) lanes.add(e.route);
      if (!lanes.size) return;
      const a = 0.06 + 0.03 * Math.sin(t * 4);
      ctx.save();
      ctx.setLineDash([0.3, 0.2]);
      ctx.lineDashOffset = -t;
      ctx.lineWidth = 0.04;
      for (const r of lanes) {
        const R = C.ROUTES[r],
          m = R.spawn[1];
        const rect = R.dir[0] ? [0, m[1] + 0.5 - 1.2, C.W, 2.4] : [m[0] + 0.5 - 1.2, 0, 2.4, C.H];
        ctx.fillStyle = alpha(THEME.enemy.flyer, a);
        ctx.fillRect(...rect);
        ctx.strokeStyle = alpha(THEME.enemy.flyer, 0.4);
        ctx.strokeRect(...rect);
      }
      ctx.restore();
    }
    // static part of a tower (plate, diodes, overclock label) goes into the floor layer
    function drawBase(tw, c2) {
      const ult = tw.lvl >= 4 ? tw.ult : "",
        z = tw.size || 1,
        cx = tw.x + 0.5,
        cy = tw.y + 0.5;
      const spec = ult ? specOf(tw.type, ult) : -1;
      const base = sprite("b|" + tw.type + "|" + Math.min(tw.lvl, 4) + "|" + ult + "|" + z, z * 1.35, (c) => {
        if (z > 1) c.scale(z, z);
        c.fillStyle = "rgba(0,0,0,.45)";
        c.beginPath();
        c.ellipse(0.06, 0.1, 0.46, 0.42, 0, 0, TAU);
        c.fill();
        towerBase(c, tw.type, tw.lvl, spec);
      });
      blit(base, cx, cy, 0, 1, c2);
      if (tw.oc) {
        const lab = sprite("oc|" + tw.oc + "|" + z, 0.5 * z, (c) => {
          c.font = `${0.24 * z}px "Russo One",sans-serif`;
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.lineWidth = 0.06 * z;
          c.strokeStyle = "#000";
          c.lineJoin = "round";
          c.strokeText("+" + tw.oc, 0, 0);
          c.fillStyle = THEME.accent;
          c.fillText("+" + tw.oc, 0, 0);
        });
        blitUp(lab, cx + 0.3 * z, cy + 0.32 * z, c2, 0, 0);
      }
    }
    function drawTower(tw) {
      const z = tw.size || 1,
        cx = tw.x + 0.5,
        cy = tw.y + 0.5;
      const a = tw.type === "frost" ? 0 : tw.ang;
      const L = Math.min(tw.lvl, 4),
        tur = rsprite("t|" + tw.type + "|" + z + "|" + L, z * 1.1, a, (c) => {
          if (z > 1) c.scale(z, z);
          towerTurret(c, tw.type, L);
        });
      const k = (kick.get(tw) || 0) * 0.08 * z;
      blit(tur, cx - Math.cos(a) * k, cy - Math.sin(a) * k, 0);
    }
    function drawCreep(c, t) {
      const [px, py] = C.pos(c),
        x = px + 0.5,
        y = py + 0.5,
        r = c.r,
        ph = phase(c.id);
      const fr = ((t * 8 + ph) | 0) % 4;
      const size = r * (c.boss ? 3.4 : c.fly ? 3.6 : 3);
      const ang = c.fly ? Math.atan2(c.gy - c.y, c.gx - c.x) : c.ang;
      const s = rsprite("e|" + c.type + "|" + fr + "|" + r, size, ang, (cc) => alienVector(cc, c.type, r, fr));
      if (!c.fly)
        blit(
          sprite("sh|" + r, r * 2.4, (cc) => {
            cc.fillStyle = "rgba(0,0,0,.38)";
            cc.beginPath();
            cc.ellipse(0, 0, r * 1.05, r * 0.8, 0, 0, TAU);
            cc.fill();
          }),
          x - 0.03,
          y + 0.06,
          0,
        );
      if (c.fly) {
        ctx.fillStyle = "rgba(0,0,0,.4)";
        ctx.beginPath();
        ctx.ellipse(x + 0.18, y + 0.3, r * 0.9, r * 0.45, 0, 0, TAU);
        ctx.fill();
      }
      if (c.type === "healer" || c.boss) {
        ctx.globalCompositeOperation = "lighter";
        addGlow(c.boss ? THEME.hiveGlow : THEME.enemy.healer, x, y, r * 2.2, 0.25 + 0.1 * Math.sin(t * 5 + ph));
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      blit(s, x, y, 0);
      if (c.stunT > 0) {
        ctx.strokeStyle = alpha(THEME.white, 0.9);
        ctx.lineWidth = 0.04;
        for (let i = 0; i < 3; i++) {
          const a = t * 6 + (i * TAU) / 3;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * r * 0.9, y - r * 0.9 + Math.sin(a) * r * 0.25, 0.05, 0, TAU);
          ctx.stroke();
        }
      } else if (c.slowT > 0) {
        ctx.fillStyle = alpha(THEME.ice, 0.22);
        ctx.beginPath();
        ctx.arc(x, y, r * 1.05, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = alpha(THEME.ice, 0.7);
        ctx.lineWidth = 0.025;
        ctx.stroke();
      }
      if (c.vulnT > 0) {
        ctx.strokeStyle = alpha(THEME.bad, 0.8);
        ctx.lineWidth = 0.03;
        ctx.setLineDash([0.06, 0.06]);
        ctx.beginPath();
        ctx.arc(x, y, r + 0.13, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (c.hp < c.max) {
        const bw = Math.max(0.42, r * 2),
          by = y - r - 0.2,
          p = Math.max(0, c.hp / c.max);
        ctx.fillStyle = "#000";
        ctx.fillRect(x - bw / 2 - 0.02, by - 0.02, bw + 0.04, 0.11);
        ctx.fillStyle = "#3a0606";
        ctx.fillRect(x - bw / 2, by, bw, 0.07);
        ctx.fillStyle = p > 0.5 ? "#5ee04a" : p > 0.25 ? THEME.accent : THEME.bad;
        ctx.fillRect(x - bw / 2, by, bw * p, 0.07);
        ctx.fillStyle = "rgba(255,255,255,.3)";
        ctx.fillRect(x - bw / 2, by, bw * p, 0.02);
      }
    }

    /* view: {t, sel, preview:{type,x,y,size,ok,range,minR}, aim:{shape,x,y,r}} */
    function draw(view, dt) {
      const S = C.S,
        W = C.W,
        H = C.H,
        t = view.t;
      if (!ground) resize();
      governor();
      if (!ground) resize();
      ambient(dt);
      glowBudget = Q[quality].glow;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      floorT += dt;
      if (towersDirty || (floorDirty && floorT > 0.2)) {
        floorT = 0;
        floorDirty = towersDirty = false;
        fctx.setTransform(1, 0, 0, 1, 0, 0);
        fctx.drawImage(ground, 0, 0);
        fctx.drawImage(decals, 0, 0);
        M(fctx);
        for (const tw of S.towers) drawBase(tw, fctx);
      }
      ox = oy = 0;
      if (shake > 0) {
        ox = Math.round((rand() - 0.5) * shake * 0.5 * cs);
        oy = Math.round((rand() - 0.5) * shake * 0.5 * cs);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(floor, ox, oy);
      M(ctx, ox, oy);
      // hive breaches breathe, gate lights blink
      ctx.globalCompositeOperation = "lighter";
      for (const r of Object.values(C.ROUTES)) {
        const [x, y] = r.spawn[1];
        addGlow(THEME.hiveGlow, x + 0.5, y + 0.5, 1.8 + 0.2 * Math.sin(t * 2.2), 0.35 + 0.15 * Math.sin(t * 2.2));
        const ex = r.exit[1];
        if (Math.sin(t * 4) > 0.2)
          addGlow(THEME.bad, ex[0] + 0.5 + r.dir[1] * 1.6, ex[1] + 0.5 + r.dir[0] * 1.6, 0.45, 0.8);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      for (const z of S.zones) {
        const a = Math.min(1, z.t / 1.5);
        ctx.fillStyle = alpha("#2a0800", 0.45 * a);
        ctx.beginPath();
        ctx.arc(z.x + 0.5, z.y + 0.5, z.r, 0, TAU);
        ctx.fill();
      }
      drawPath("h", t);
      drawPath("v", t);
      drawAirLanes(t);
      const sel = view.sel;
      if (sel) {
        const s = C.stats(sel);
        ctx.fillStyle = alpha(THEME.range, 0.07);
        ctx.beginPath();
        ctx.arc(sel.x + 0.5, sel.y + 0.5, s.range, 0, TAU);
        ctx.fill();
        ctx.save();
        ctx.setLineDash([0.25, 0.15]);
        ctx.lineDashOffset = t * 0.5;
        ctx.strokeStyle = alpha(THEME.range, 0.8);
        ctx.lineWidth = 0.045;
        ctx.stroke();
        ctx.restore();
        if (s.minR) {
          ctx.setLineDash([0.15, 0.15]);
          ctx.strokeStyle = alpha(THEME.bad, 0.7);
          ctx.beginPath();
          ctx.arc(sel.x + 0.5, sel.y + 0.5, s.minR, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      for (const tw of S.towers) drawTower(tw);
      // selected tower: pulsing green glow and a glowing ring around it
      if (sel) {
        const z = sel.size || 1,
          cx = sel.x + 0.5,
          cy = sel.y + 0.5,
          p = 0.5 + 0.5 * Math.sin(t * 5);
        ctx.globalCompositeOperation = "lighter";
        addGlow(THEME.range, cx, cy, 0.95 * z + 0.1 * p, 0.12 + 0.1 * p, true);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = alpha(THEME.range, 0.6 + 0.4 * p);
        ctx.lineWidth = 0.07;
        ctx.beginPath();
        ctx.arc(cx, cy, 0.6 * z + 0.04 * p, 0, TAU);
        ctx.stroke();
      }
      for (const c of S.creeps) if (!c.fly) drawCreep(c, t);
      // beams and bolts glow additively
      ctx.globalCompositeOperation = "lighter";
      for (const tw of S.towers)
        if (tw.beam)
          for (const c of tw.beam) {
            const w = Math.min(3, tw.heatM || 1) * (tw.lvl >= 4 ? 1.3 : 1),
              [cx, cy] = C.pos(c),
              col = tw.heatM > 3 ? THEME.fire : THEME.tower.laser;
            ctx.globalAlpha = 1;
            ctx.strokeStyle = alpha(col, 0.35);
            ctx.lineCap = "round";
            ctx.lineWidth = (0.22 + 0.06 * Math.sin(t * 40)) * w;
            ctx.beginPath();
            ctx.moveTo(tw.x + 0.5, tw.y + 0.5);
            ctx.lineTo(cx + 0.5, cy + 0.5);
            ctx.stroke();
            ctx.strokeStyle = THEME.laserCore;
            ctx.lineWidth = 0.05 * w;
            ctx.stroke();
            addGlow(col, cx + 0.5, cy + 0.5, 0.35 * w, 0.9);
          }
      ctx.globalAlpha = 1;
      for (const p of S.proj) {
        const x = p.x + 0.5,
          y = p.y + 0.5;
        if (p.k === "b") {
          addGlow(THEME.accent, x, y, p.big ? 0.2 : 0.14, 1);
        } else if (p.k === "s") {
          addGlow(THEME.fire, x, y, p.big ? 0.35 : 0.22, 0.8);
        } else if (p.k === "pl") {
          addGlow(THEME.tower.plasma, x, y, p.big ? 0.45 : 0.32, 1);
        } else if (p.k === "m") {
          addGlow(THEME.fire, x - Math.cos(p.ang) * 0.12, y - Math.sin(p.ang) * 0.12, 0.18, 1);
        } else if (p.k === "a" && p.f >= 0) {
          addGlow(p.nuke ? THEME.fire : THEME.accent, x, y - p.h, p.nuke ? 0.5 : 0.3, 0.9);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      for (const p of S.proj) {
        const x = p.x + 0.5,
          y = p.y + 0.5;
        if (p.k === "s") {
          ctx.fillStyle = "#1a1410";
          ctx.beginPath();
          ctx.arc(x, y, p.big ? 0.12 : 0.07, 0, TAU);
          ctx.fill();
        } else if (p.k === "m") {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.ang);
          ctx.fillStyle = "#d8d8d8";
          ctx.fillRect(-0.12, -0.035, 0.22, 0.07);
          ctx.fillStyle = "#ff3b3b";
          ctx.fillRect(0.08, -0.035, 0.05, 0.07);
          ctx.restore();
        } else if (p.k === "a" && p.f >= 0) {
          ctx.fillStyle = "rgba(0,0,0,.4)";
          ctx.beginPath();
          ctx.ellipse(x, y, 0.15, 0.08, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#2a241c";
          ctx.beginPath();
          ctx.arc(x, y - p.h, (p.nuke ? 0.17 : 0.11) + p.h * 0.04, 0, TAU);
          ctx.fill();
          outline(ctx, 0.025);
        }
      }
      for (const c of S.creeps) if (c.fly) drawCreep(c, t);
      // abilities in flight
      for (const m of S.meteors) {
        if (m.t > 0) continue;
        const f = Math.min(1, -m.t / m.fall),
          big = m.kind === "meteor",
          q = 1 - f,
          mx = m.x + 0.5 - (rot ? q * 4 : q * 2),
          my = m.y + 0.5 + (rot ? q * 2 : -q * 4);
        ctx.fillStyle = "rgba(0,0,0,.35)";
        ctx.beginPath();
        ctx.ellipse(m.x + 0.5, m.y + 0.5, 0.28 * f, 0.15 * f, 0, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = alpha(big ? THEME.fire : THEME.accent, 0.5);
        ctx.lineWidth = big ? 0.18 : 0.08;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(rot ? mx - 1.2 : mx - 0.6, rot ? my + 0.6 : my - 1.2);
        ctx.lineTo(mx, my);
        ctx.stroke();
        addGlow(big ? THEME.fire : THEME.accent, mx, my, big ? 0.5 : 0.25, 1);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#2a1a10";
        ctx.beginPath();
        ctx.arc(mx, my, big ? 0.13 : 0.07, 0, TAU);
        ctx.fill();
      }
      for (const b of S.bombers) {
        const x = b.x + 0.5,
          y = b.y + 0.5;
        ctx.fillStyle = "rgba(0,0,0,.35)";
        ctx.beginPath();
        ctx.ellipse(x + 0.4, y + 0.55, 0.75, 0.22, 0, 0, TAU);
        ctx.fill();
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        ctx.moveTo(0.7, 0);
        ctx.lineTo(-0.1, -0.85);
        ctx.lineTo(-0.3, -0.85);
        ctx.lineTo(-0.15, -0.1);
        ctx.lineTo(-0.6, -0.1);
        ctx.lineTo(-0.75, -0.35);
        ctx.lineTo(-0.82, -0.35);
        ctx.lineTo(-0.75, 0);
        ctx.lineTo(-0.82, 0.35);
        ctx.lineTo(-0.75, 0.35);
        ctx.lineTo(-0.6, 0.1);
        ctx.lineTo(-0.15, 0.1);
        ctx.lineTo(-0.3, 0.85);
        ctx.lineTo(-0.1, 0.85);
        ctx.closePath();
        ctx.fillStyle = gloss(ctx, 0, -0.8, 0, 0.8, "#5a5f62", "#1c1f21");
        ctx.fill();
        outline(ctx, 0.04);
        ctx.restore();
        if (Math.sin(t * 14) > 0) {
          ctx.globalCompositeOperation = "lighter";
          addGlow(THEME.bad, x - 0.15, y - 0.82, 0.2, 1);
          addGlow(THEME.ok, x - 0.15, y + 0.82, 0.2, 1);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
        }
      }
      for (const n of S.nukes) {
        const x = n.x + 0.5,
          y = n.y + 0.5,
          bl = Math.sin(t * 16) > 0;
        ctx.fillStyle = alpha(THEME.bad, bl ? 0.12 : 0.05);
        ctx.beginPath();
        ctx.arc(x, y, n.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = alpha(THEME.bad, bl ? 0.95 : 0.5);
        ctx.lineWidth = 0.07;
        ctx.stroke();
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t);
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = (i * TAU) / 3;
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, 0.6, a, a + 0.6);
          ctx.closePath();
        }
        ctx.fillStyle = alpha(THEME.hazard, 0.85);
        ctx.fill();
        ctx.restore();
      }
      // particles
      for (const f of fx) {
        const a = f.life / f.max;
        if (f.k === "smoke") {
          ctx.globalAlpha = 0.55 * a;
          const rr = f.r * (1.6 - a * 0.6);
          ctx.drawImage(smokeSprite(), f.x + 0.5 - rr, f.y + 0.5 - rr, rr * 2, rr * 2);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "lighter";
      for (const f of fx) {
        const a = f.life / f.max;
        if (f.k === "spark") {
          ctx.globalAlpha = a;
          ctx.fillStyle = f.col;
          ctx.fillRect(f.x + 0.5 - f.s / 2, f.y + 0.5 - f.s / 2, f.s, f.s);
        } else if (f.k === "flame") addGlow(f.col, f.x + 0.5, f.y + 0.5, f.r * (0.6 + a * 0.6), a);
        else if (f.k === "blast") {
          addGlow(f.col, f.x + 0.5, f.y + 0.5, f.r * (1.25 - a * 0.4), a, f.r > 2);
          if (f.r > 0.6) addGlow(THEME.white, f.x + 0.5, f.y + 0.5, f.r * 0.45 * a, a * a);
        } else if (f.k === "muzzle") addGlow(f.col, f.x + 0.5, f.y + 0.5, f.r, a);
        else if (f.k === "ring") {
          ctx.globalAlpha = a * 0.8;
          ctx.strokeStyle = f.col;
          ctx.lineWidth = f.w;
          ctx.beginPath();
          ctx.arc(f.x + 0.5, f.y + 0.5, f.r * (1 - a * 0.7), 0, TAU);
          ctx.stroke();
        } else if (f.k === "rail") {
          ctx.globalAlpha = a;
          ctx.strokeStyle = alpha(f.col, 0.6);
          ctx.lineCap = "round";
          ctx.lineWidth = 0.3 * a * f.w;
          ctx.beginPath();
          ctx.moveTo(f.x + 0.5, f.y + 0.5);
          ctx.lineTo(f.x2 + 0.5, f.y2 + 0.5);
          ctx.stroke();
          ctx.strokeStyle = THEME.white;
          ctx.lineWidth = 0.06 * f.w;
          ctx.stroke();
        } else if (f.k === "zap") {
          ctx.globalAlpha = a;
          ctx.strokeStyle = f.col;
          ctx.lineWidth = 0.05;
          ctx.beginPath();
          ctx.moveTo(f.x + 0.5, f.y + 0.5);
          for (let i = 1; i < 5; i++) {
            const k = i / 5;
            ctx.lineTo(
              f.x + (f.x2 - f.x) * k + 0.5 + (rand() - 0.5) * 0.3,
              f.y + (f.y2 - f.y) * k + 0.5 + (rand() - 0.5) * 0.3,
            );
          }
          ctx.lineTo(f.x2 + 0.5, f.y2 + 0.5);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      // floating rewards
      for (const tx of texts) {
        const lab = sprite("tx|" + tx.v, 0.5 + 0.17 * tx.v.length, (c) => {
          c.font = '.3px "Russo One",sans-serif';
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.lineWidth = 0.07;
          c.strokeStyle = "#000";
          c.lineJoin = "round";
          c.strokeText(tx.v, 0, 0);
          c.fillStyle = THEME.accent;
          c.fillText(tx.v, 0, 0);
        });
        ctx.globalAlpha = Math.min(1, (tx.life / tx.max) * 1.6);
        blitUp(lab, tx.x + 0.5, tx.y + 0.2);
      }
      ctx.globalAlpha = 1;
      // placement preview and ability aim
      const pv = view.preview;
      if (pv) {
        const z = pv.size,
          ccx = pv.x + (z - 1) / 2 + 0.5,
          ccy = pv.y + (z - 1) / 2 + 0.5,
          col = pv.ok ? THEME.ok : THEME.bad;
        ctx.fillStyle = alpha(col, 0.07);
        ctx.beginPath();
        ctx.arc(ccx, ccy, pv.range, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = alpha(col, 0.7);
        ctx.lineWidth = 0.04;
        ctx.stroke();
        if (pv.minR) {
          ctx.setLineDash([0.15, 0.15]);
          ctx.beginPath();
          ctx.arc(ccx, ccy, pv.minR, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.globalAlpha = 0.6;
        ctx.save();
        ctx.translate(ccx, ccy);
        if (z > 1) ctx.scale(z, z);
        towerVector(ctx, pv.type, 0, -Math.PI / 2, -1);
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = col;
        ctx.lineWidth = 0.07;
        ctx.strokeRect(pv.x + 0.04, pv.y + 0.04, z - 0.08, z - 0.08);
      }
      const am = view.aim;
      if (am) {
        ctx.strokeStyle = alpha(THEME.fire, 0.95);
        ctx.fillStyle = alpha(THEME.fire, 0.12);
        ctx.lineWidth = 0.06;
        ctx.setLineDash([0.3, 0.15]);
        ctx.lineDashOffset = -t;
        if (am.shape === "row") {
          const y = Math.round(am.y - 0.5);
          ctx.fillRect(0, y - 0.5, W, 2);
          ctx.strokeRect(0, y - 0.5, W, 2);
        } else {
          ctx.beginPath();
          ctx.arc(am.x, am.y, am.r, 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(am.x - 0.4, am.y);
          ctx.lineTo(am.x + 0.4, am.y);
          ctx.moveTo(am.x, am.y - 0.4);
          ctx.lineTo(am.x, am.y + 0.4);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      // screen overlays
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (S.stasisT > 0) {
        ctx.fillStyle = alpha(THEME.ice, 0.1 * Math.min(1, S.stasisT));
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      const flick = 0.025 * (Math.sin(t * 23) * Math.sin(t * 7.3) > 0.6 ? 1 : 0);
      if (flick) {
        ctx.fillStyle = `rgba(0,0,0,${flick})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (redFlash > 0) {
        const g = ctx.createRadialGradient(
          canvas.width / 2,
          canvas.height / 2,
          canvas.height * 0.3,
          canvas.width / 2,
          canvas.height / 2,
          canvas.width * 0.7,
        );
        g.addColorStop(0, "rgba(255,0,0,0)");
        g.addColorStop(1, `rgba(200,0,0,${0.55 * redFlash})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,240,220,${flash * 0.55})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    const towerIcon = (c, type) => {
      c.save();
      c.translate(0.5, 0.5);
      c.scale(0.98 / lvK(1), 0.98 / lvK(1));
      towerVector(c, type, 1, -Math.PI / 4, -1);
      c.restore();
    };
    // turning the board drops the gore layer (it was painted in the old orientation)
    function setRotated(v) {
      if (v === rot) return;
      rot = v;
      ground = null;
      decals = null;
    }
    return {
      resize,
      draw,
      towerIcon,
      setRotated,
      theme: THEME,
      tierColor: (l, type, ult) => tierColor(l, type, ult ? specOf(type, ult) : -1),
      quality: () => quality,
    };
  };
  XT.THEME = THEME;
}
