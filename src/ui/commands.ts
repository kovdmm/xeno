// What the player can do: build, upgrade, sell, cast, call a wave, change speed. Each command asks the game and
// tells the player what happened (a message, a sound). The buttons and keys that trigger them are in input.ts.
import type { AbilityKey, TowerType, Vec } from "../game/types";
import type { UiContext } from "./context";
import { clearPicks, SPEEDS } from "./state";

export function createCommands(ui: UiContext, drawSpeed: () => void) {
  const { core: C, state: st, t, L, toast } = ui;

  /** A refusal of the game becomes a message and an error sound; the quiet ones (busy, out, over, gone) do not. */
  function say(code: string) {
    if (code && code !== "busy" && code !== "out" && code !== "over" && code !== "gone") {
      toast(t(code));
      ui.sound.play("error");
    }
  }

  function placeAt(pt: Vec) {
    if (!st.build) return;
    const [x, y] = C.buildOrigin(st.build, pt);
    const r = C.place(st.build, x, y);
    if (!r.ok) say(r.code);
  }

  /** Upgrades the selected tower; `ult` picks the specialisation at level 4. */
  function upgrade(ult?: string) {
    const sel = st.sel;
    if (!sel) return;
    const r = C.upgrade(sel, ult);
    if (!r.ok) return say(r.code);
    if ("ult" in r && r.ult) toast(L(C.TT[sel.type]) + ": " + L(C.TT[sel.type].ults[r.ult]) + "!");
  }

  function sell() {
    if (st.sel) {
      C.sell(st.sel);
      st.sel = null;
    }
  }

  /** Casts an ability; true if it went off. */
  function cast(k: AbilityKey, pt?: Vec): boolean {
    const r = C.cast(k, pt);
    if (!r.ok) {
      if (r.code === "cd") toast(t("cdToast", { a: L(C.AB[k]), s: r.s ?? 0 }));
      else say(r.code);
    }
    return r.ok;
  }

  /** Picks a tower type from the palette; picking it again drops it. */
  function selectBuild(n: TowerType) {
    st.build = st.build === n ? null : n;
    st.sel = null;
    st.aim = null;
    ui.refresh();
  }

  /** An ability without a target goes off at once; an aimed one waits for a click on the field. */
  function selectAbility(k: AbilityKey) {
    if (C.S.over) return;
    if (!C.AB[k].aim) {
      cast(k);
      st.aim = null;
    } else {
      st.aim = st.aim === k ? null : k;
      st.build = null;
      st.sel = null;
      if (st.aim) toast(t("pickTarget", { a: L(C.AB[k]) }));
    }
    ui.refresh();
  }

  function cycleSpeed() {
    st.speedIdx = (st.speedIdx + 1) % SPEEDS.length;
    drawSpeed();
  }

  /** Calls the next wave (early once the game has started: that pays a bonus). */
  function goBtn() {
    const s = C.S;
    if (s.over || s.wave >= C.FINAL) return;
    C.sendWave(s.started);
    ui.refresh();
  }

  function cancelPicks() {
    clearPicks(st);
  }

  return { say, placeAt, upgrade, sell, cast, selectBuild, selectAbility, cycleSpeed, goBtn, cancelPicks };
}

export type Commands = ReturnType<typeof createCommands>;
