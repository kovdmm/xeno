// The floor: the static ground, the gore decals painted on it, and the two composed into one image that the
// floor layer blits every frame. Also builds the sprite-sized ground when the size or orientation changes.
import { gateGeometry } from "./gates";
import { alpha, shade } from "./color";
import { gloss } from "./primitives";
import { TAU, THEME } from "./theme";
import type { Projection } from "./projection";
import type { Ctx, World } from "./types";

/** Small deterministic generator: the ground looks the same every time it is built. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Floor {
  ground: HTMLCanvasElement | null = null;
  decals: HTMLCanvasElement | null = null;
  dctx: Ctx | null = null;
  floor: HTMLCanvasElement | null = null;
  fctx: Ctx | null = null;
  /** the towers' base plates changed: recompose at once */
  towersDirty = true;
  /** the decals changed: recompose soon */
  floorDirty = true;
  private floorT = 0;
  private decalFade = 0;

  constructor(
    private world: World,
    private proj: Projection,
    private canvas: HTMLCanvasElement,
    private createCanvas: () => HTMLCanvasElement,
    private rand: () => number,
  ) {}

  get ready() {
    return !!this.ground;
  }

  /** The ground has to be built again (size, orientation or quality changed). */
  invalidate() {
    this.ground = null;
  }

  /** Turning the board drops the gore too: it was painted in the old orientation. */
  invalidateAll() {
    this.ground = null;
    this.decals = null;
  }

  build() {
    const canvas = this.canvas,
      proj = this.proj;
    const W = this.world.W,
      H = this.world.H;
    const ground = (this.ground = this.createCanvas());
    ground.width = canvas.width;
    ground.height = canvas.height;
    const g = ground.getContext("2d")!;
    proj.apply(g);
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
    this.pixelGrid(g, "rgba(0,0,0,.8)", Math.max(1, Math.round(proj.cs * 0.045)), "rgba(255,255,255,.08)");
    proj.apply(g);
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
    for (const r of Object.values(this.world.ROUTES)) {
      const gate = gateGeometry(r);
      for (let v = 0, n = Math.round(16 * gate.span); v < n; v++) {
        let x = gate.spawn[0],
          y = gate.spawn[1],
          a = Math.atan2(gate.dir[1], gate.dir[0]) + (R() - 0.5) * 2.4;
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
      const [sx, sy] = gate.spawn,
        pit = 2.2 * gate.span,
        gr = g.createRadialGradient(sx, sy, 0, sx, sy, pit);
      gr.addColorStop(0, "rgba(20,0,6,.95)");
      gr.addColorStop(0.45, alpha(THEME.hive, 0.55));
      gr.addColorStop(1, "rgba(60,0,20,0)");
      g.fillStyle = gr;
      g.fillRect(sx - pit - 0.3, sy - pit - 0.3, 2 * pit + 0.6, 2 * pit + 0.6);
      // exit: bunker gate with hazard stripes
      const [minx, miny, bw, bh] = gate.exitBox,
        maxx = minx + bw,
        maxy = miny + bh;
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
    // walls: slabs of stone, one tile per cell, so they read as part of the same deck
    for (const [wx, wy] of this.world.WALLS) {
      g.fillStyle = "rgba(0,0,0,.38)"; // the shadow it throws
      g.fillRect(wx + 0.08, wy + 0.12, 1, 1);
      g.fillStyle = gloss(g, wx, wy, wx + 1, wy + 1, "#57524a", "#1e1c18");
      g.fillRect(wx, wy, 1, 1);
      g.fillStyle = "rgba(255,255,255,.13)"; // lit edges, top and left
      g.fillRect(wx, wy, 1, 0.07);
      g.fillRect(wx, wy, 0.07, 1);
      g.fillStyle = "rgba(0,0,0,.5)"; // shaded edges, bottom and right
      g.fillRect(wx, wy + 0.93, 1, 0.07);
      g.fillRect(wx + 0.93, wy, 0.07, 1);
      if (R() < 0.4) {
        g.strokeStyle = "rgba(0,0,0,.5)";
        g.lineWidth = 0.025;
        g.beginPath();
        let cx = wx + 0.2 + R() * 0.6,
          cy = wy + 0.2 + R() * 0.6;
        g.moveTo(cx, cy);
        for (let k = 0; k < 3; k++) g.lineTo((cx += R() * 0.3 - 0.15), (cy += R() * 0.3 - 0.15));
        g.stroke();
      }
      g.strokeStyle = "#000";
      g.lineWidth = 0.04;
      g.strokeRect(wx, wy, 1, 1);
    }
    // floor = ground + gore decals, recomposited only when decals change (vignette and scanlines are CSS)
    const floor = (this.floor = this.createCanvas());
    floor.width = canvas.width;
    floor.height = canvas.height;
    this.fctx = floor.getContext("2d")!;
    this.floorDirty = true;
    this.towersDirty = true; // the new floor image is blank: compose it at once, not after the usual pause
    // decals persist across resizes when possible
    const old = this.decals;
    const decals = (this.decals = this.createCanvas());
    decals.width = canvas.width;
    decals.height = canvas.height;
    this.dctx = decals.getContext("2d")!;
    if (old) this.dctx.drawImage(old, 0, 0, decals.width, decals.height);
    proj.apply(this.dctx);
  }

  /** Grid lines snapped to whole device pixels (screen space, so it works for both board orientations). */
  private pixelGrid(c2: Ctx, col: string, w: number, hi?: string, dx = 0, dy = 0) {
    const canvas = this.canvas,
      proj = this.proj,
      cs = proj.cs;
    c2.setTransform(1, 0, 0, 1, 0, 0);
    const nx = proj.cols,
      ny = proj.rows,
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

  splat(x: number, y: number, col: string, size: number) {
    const dctx = this.dctx,
      rand = this.rand;
    if (!dctx) return;
    this.floorDirty = true;
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

  scorch(x: number, y: number, r: number) {
    const dctx = this.dctx;
    if (!dctx) return;
    this.floorDirty = true;
    const gr = dctx.createRadialGradient(x + 0.5, y + 0.5, 0, x + 0.5, y + 0.5, r);
    gr.addColorStop(0, "rgba(0,0,0,.55)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = gr;
    dctx.fillRect(x + 0.5 - r, y + 0.5 - r, r * 2, r * 2);
  }

  clearDecals() {
    const dctx = this.dctx;
    if (dctx && this.decals) {
      dctx.save();
      dctx.setTransform(1, 0, 0, 1, 0, 0);
      dctx.clearRect(0, 0, this.decals.width, this.decals.height);
      dctx.restore();
      this.floorDirty = true;
    }
  }

  /** Decals fade slowly so the field never ends up a solid red mess. */
  step(dt: number) {
    this.floorT += dt;
    this.decalFade += dt;
    const dctx = this.dctx;
    if (this.decalFade > 0.5 && dctx) {
      this.decalFade = 0;
      dctx.save();
      dctx.setTransform(1, 0, 0, 1, 0, 0);
      dctx.globalCompositeOperation = "destination-out";
      dctx.fillStyle = "rgba(0,0,0,.035)";
      dctx.fillRect(0, 0, this.decals!.width, this.decals!.height);
      dctx.restore();
      this.floorDirty = true;
    }
  }

  /** Recomposes ground + decals + tower plates when something changed (at most every 0.2 s for decals). */
  compose(drawPlates: (c: Ctx) => void) {
    if (!(this.towersDirty || (this.floorDirty && this.floorT > 0.2))) return;
    const fctx = this.fctx!;
    this.floorT = 0;
    this.floorDirty = this.towersDirty = false;
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.drawImage(this.ground!, 0, 0);
    fctx.drawImage(this.decals!, 0, 0);
    this.proj.apply(fctx);
    drawPlates(fctx);
  }
}
