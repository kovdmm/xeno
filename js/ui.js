/* Xeno-Tactic — interface: screens (title, pause, game over), HUD, control tray,
   input, settings, records and the main loop.
   Talks to the game only through XT.core (commands, queries, events),
   draws only through XT.createRenderer and plays sound only through XT.audio. */
(function (XT) {
  "use strict";
  const C = XT.core,
    I = XT.i18n,
    { TT, TKEYS, AB, AKEYS, DIFF, DKEYS, ROUTES, FINAL, W, H } = C;
  const t = (k, v) => I.t(k, v),
    L = (o, f) => I.L(o, f);
  const $ = (id) => document.getElementById(id);
  const cv = $("field");
  const R = XT.createRenderer(cv);
  // Sound is optional: without howler.js the game runs silently.
  const A = XT.audio || {
    ok: false,
    play() {},
    update() {},
    setMuted() {},
    setVolume() {},
    setMusicVolume() {},
    muted: true,
    volume: 0,
    musicVolume: 0,
  };

  /* difficulty look (UI only) */
  const DIFF_LOOK = {
    easy: { icon: 1, col: "#4fd27a" },
    normal: { icon: 2, col: "#ffad33" },
    hard: { icon: 3, col: "#ff3b3b" },
    insane: { icon: "x", col: "#4a0b16", edge: "#c0283c" },
  };
  const dcol = (k) => DIFF_LOOK[k].edge || DIFF_LOOK[k].col;

  /* persistent settings & records */
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch (e) {}
    },
  };
  let diff = DIFF[store.get("xt-diff")] ? store.get("xt-diff") : "easy";
  const bestOf = (k) => Math.min(FINAL, +store.get("xt-best-" + k) || (k === "easy" ? +store.get("xt-best") || 0 : 0));
  let best = bestOf(diff);

  /* view state */
  let sel = null,
    build = null,
    aim = null,
    hover = null;
  const SPEEDS = [1, 2, 3, 5];
  let speedIdx = 0,
    paused = true; // the title screen starts paused
  const S = () => C.S;
  const speed = () => (paused ? 0 : SPEEDS[speedIdx]);

  /* ---------- core events ---------- */
  C.on((e) => {
    if (e.type === "toast") toast(t(e.key, e.vars));
    else if (e.type === "wave") $("banner").hidden = true;
    else if (e.type === "end") {
      if (S().wave > best && !S().cheated) {
        best = S().wave;
        store.set("xt-best-" + diff, best);
      }
      $("over").classList.toggle("won", e.won);
      renderOver();
      show("over");
      if (e.won) setTimeout(openCredits, 1800); // victory: the credits roll over the win screen
    } else if (e.type === "sold" && sel === e.tower) sel = null;
    else if (e.type === "cheat") {
      toast(t("cheatOk", { l: S().lives }));
      A.play("ult");
      refreshUI();
    }
  });

  function newGame() {
    best = bestOf(diff);
    C.newGame(diff);
    sel = null;
    build = null;
    aim = null;
    $("banner").hidden = false;
    $("banner").textContent = t("banner", { d: L(DIFF[diff]) });
    hide("over");
  }
  function renderOver() {
    const s = S();
    if (!s.over) return;
    $("overTtl").textContent = s.won ? t("won") : t("lost");
    $("overTxt").innerHTML = s.won
      ? t("wonTxt", { d: L(DIFF[diff]), s: s.score, l: s.lives })
      : t("lostTxt", { w: s.wave, s: s.score, d: L(DIFF[diff]), b: best });
  }

  /* ---------- screens ---------- */
  const SCREENS = ["menu", "pause", "over", "help", "settings", "credits"];
  function show(id) {
    $(id).hidden = false;
    syncPause();
  }
  function hide(id) {
    $(id).hidden = true;
    syncPause();
  }
  // The game runs only when no screen covers it.
  function syncPause() {
    paused = SCREENS.some((id) => !$(id).hidden);
    drawSpeed();
  }
  function openMenu() {
    const s = S(),
      inGame = s.started && !s.over;
    $("mPlay").textContent = inGame ? t("contWave", { w: s.wave }) : t("play");
    $("mNew").hidden = !inGame;
    $("mDiff").innerHTML = skullIcon(diff, "bigsk") + `<span>${t("diffIs", { d: L(DIFF[diff]) })}</span>`;
    const b = Math.max(best, 0);
    $("mBest").textContent = b ? t("menuBest", { d: L(DIFF[diff]), b, f: FINAL }) : "";
    hide("pause");
    hide("over");
    show("menu");
  }
  $("mPlay").addEventListener("click", () => {
    if (S().over) newGame();
    hide("menu");
    refreshUI();
  });
  $("mNew").addEventListener("click", () => {
    newGame();
    hide("menu");
    refreshUI();
  });
  $("mDiff").addEventListener("click", openSettings);
  $("mSettings").addEventListener("click", openSettings);
  $("mHelp").addEventListener("click", openHelp);
  $("pauseBtn").addEventListener("click", () => show("pause"));
  $("pResume").addEventListener("click", () => hide("pause"));
  $("pRestart").addEventListener("click", () => {
    newGame();
    hide("pause");
    refreshUI();
  });
  $("pSettings").addEventListener("click", openSettings);
  $("pHelp").addEventListener("click", openHelp);
  $("pMenu").addEventListener("click", openMenu);
  $("restart").addEventListener("click", () => {
    newGame();
    refreshUI();
  });
  $("overMenu").addEventListener("click", () => {
    hide("over");
    openMenu();
  });

  /* ---------- commands with feedback ---------- */
  function say(code) {
    if (code && code !== "busy" && code !== "out" && code !== "over") {
      toast(t(code));
      A.play("error");
    }
  }
  function placeAt(pt) {
    const [x, y] = C.buildOrigin(build, pt);
    const r = C.place(build, x, y);
    if (!r.ok) say(r.code);
  }
  function upgrade(u) {
    if (!sel) return;
    const r = C.upgrade(sel, u);
    if (!r.ok) return say(r.code);
    if (r.ult) toast(L(TT[sel.type]) + ": " + L(TT[sel.type].ults[r.ult]) + "!");
  }
  function sell() {
    if (sel) {
      C.sell(sel);
      sel = null;
    }
  }
  function cast(k, pt) {
    const r = C.cast(k, pt);
    if (!r.ok) {
      if (r.code === "cd") toast(t("cdToast", { a: L(AB[k]), s: r.s }));
      else say(r.code);
    }
    return r.ok;
  }

  /* ---------- input ---------- */
  // screen point → board cells; in portrait the board is turned 90° clockwise
  let rotated = false;
  function ptAt(e) {
    const r = cv.getBoundingClientRect(),
      u = (e.clientX - r.left) / r.width,
      v = (e.clientY - r.top) / r.height;
    return rotated ? [v * W, H - u * H] : [u * W, v * H];
  }
  const routeLabel = (r) => (rotated ? t(r === "h" ? "rTB" : "rRL") : L(ROUTES[r], "label"));
  cv.addEventListener("pointermove", (e) => {
    hover = ptAt(e);
  });
  cv.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") hover = null;
  });
  cv.addEventListener("click", (e) => {
    if (S().over || paused) return;
    const pt = ptAt(e),
      x = Math.floor(pt[0]),
      y = Math.floor(pt[1]);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    hover = pt;
    if (aim) {
      if (cast(aim, pt)) aim = null;
      refreshUI();
      return;
    }
    const tw = C.towerAt(x, y);
    if (tw) {
      sel = sel === tw ? null : tw;
      build = null;
    } else if (build) placeAt(pt);
    else sel = null;
    refreshUI();
  });
  cv.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    build = null;
    sel = null;
    aim = null;
    refreshUI();
  });
  const RU = {
    й: "q",
    ц: "w",
    у: "e",
    к: "r",
    е: "t",
    г: "u",
    ы: "s",
    т: "n",
    а: "f",
    ь: "m",
  };
  /* cheat codes typed on the keyboard: physical keys, so any layout works; while a code is being typed
   its letters do not trigger hotkeys */
  const CHEATS = ["hesoyam"];
  let cheatBuf = "";
  function cheatKey(ch) {
    const nb = cheatBuf + ch;
    if (CHEATS.some((c) => c.startsWith(nb))) {
      cheatBuf = nb;
      if (CHEATS.includes(nb)) {
        cheatBuf = "";
        if (!C.cheat(nb)) toast(t("cheatBad"));
      }
      return true;
    }
    cheatBuf = CHEATS.some((c) => c.startsWith(ch)) ? ch : "";
    return !!cheatBuf;
  }
  document.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input,textarea")) return;
    if (!$("credits").hidden) {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        closeCredits();
      }
      return;
    }
    const kc = e.code && e.code.startsWith("Key") ? e.code.slice(3).toLowerCase() : "";
    if (kc && !e.ctrlKey && !e.metaKey && !e.altKey && cheatKey(kc)) {
      e.preventDefault();
      return;
    }
    let k = e.key.toLowerCase();
    k = RU[k] || k;
    if (k === "m") {
      toggleSound();
      return;
    }
    // screens: Esc closes the top one
    if (k === "escape") {
      for (const id of ["settings", "help"])
        if (!$(id).hidden) {
          closeModal(id);
          return;
        }
      if (!$("pause").hidden) {
        hide("pause");
        return;
      }
      if (!$("menu").hidden || !$("over").hidden) return;
      if (build || sel || aim) {
        build = null;
        sel = null;
        aim = null;
        refreshUI();
        return;
      }
      show("pause");
      return;
    }
    if (paused && k !== " ") return;
    const tk = TKEYS.find((n) => TT[n].key === k);
    if (tk) {
      selectBuild(tk);
      return;
    }
    const ak = AKEYS.find((n) => AB[n].key === k);
    if (ak) {
      selectAbility(ak);
      return;
    }
    if (k === "u") {
      if (sel && sel.lvl !== 3) upgrade();
      else if (sel) toast(t("pickUltPanel"));
    } else if (k === "s") sell();
    else if (k === "n") goBtn();
    else if (k === "f") cycleSpeed();
    else if (k === " ") {
      e.preventDefault();
      if (!$("pause").hidden) hide("pause");
      else if ($("menu").hidden && $("over").hidden) show("pause");
    } else return;
    refreshUI();
  });
  function selectBuild(n) {
    build = build === n ? null : n;
    sel = null;
    aim = null;
    refreshUI();
  }
  function selectAbility(k) {
    if (S().over) return;
    if (!AB[k].aim) {
      cast(k);
      aim = null;
    } else {
      aim = aim === k ? null : k;
      build = null;
      sel = null;
      if (aim) toast(t("pickTarget", { a: L(AB[k]) }));
    }
    refreshUI();
  }
  function drawSpeed() {
    const b = $("speedBtn");
    b.textContent = paused ? "❚❚" : "×" + SPEEDS[speedIdx];
    b.classList.toggle("paused", paused);
  }
  function cycleSpeed() {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    drawSpeed();
  }
  $("speedBtn").addEventListener("click", cycleSpeed);
  function goBtn() {
    const s = S();
    if (s.over || s.wave >= FINAL) return;
    C.sendWave(s.started);
    refreshUI();
  }
  $("go").addEventListener("click", goBtn);
  $("info").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = b.dataset.act;
    if (a === "up") upgrade(b.dataset.u);
    else if (a === "sell") sell();
    else if (a === "cancel") {
      build = null;
      sel = null;
      aim = null;
    }
    refreshUI();
  });

  /* ---------- sound controls ---------- */
  const SPK =
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>';
  function drawSound() {
    const on = A.ok && !A.muted;

    const v = A.ok ? (on ? t("soundOn") : t("soundOff")) : t("noAudio");
    $("sndToggle").textContent = A.ok ? (on ? t("soundOn") : t("soundOff")) : t("noAudio");
    $("sndToggle").classList.toggle("on", on);
    $("sndToggle").disabled = !A.ok;
    $("sndVol").value = Math.round(A.volume * 100);
    $("sndVol").disabled = !A.ok;
    $("musVol").value = Math.round(A.musicVolume * 100);
    $("musVol").disabled = !A.ok;
  }
  function toggleSound() {
    if (!A.ok) {
      toast(t("noAudio"));
      return;
    }
    A.setMuted(!A.muted);
    drawSound();
    toast(A.muted ? t("soundOff") : t("soundOn"));
  }
  $("sndToggle").addEventListener("click", toggleSound);
  $("sndVol").addEventListener("input", (e) => {
    A.setVolume(e.target.value / 100);
    if (A.muted && e.target.value > 0) A.setMuted(false);
    drawSound();
  });
  $("musVol").addEventListener("input", (e) => {
    A.setMusicVolume(e.target.value / 100);
    if (A.muted && e.target.value > 0) A.setMuted(false);
    drawSound();
  });

  /* ---------- fullscreen ----------
   Shown only where the browser offers it (not on iPhone Safari, for example). */
  const root = document.documentElement;
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const fsOK =
    !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) &&
    !!(root.requestFullscreen || root.webkitRequestFullscreen);
  function drawFs() {
    // lives in the settings; unsupported browsers (iPhone Safari) see a disabled button with an explanation
    const b = $("fsBtn"),
      on = fsOK && !!fsEl();
    b.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;vertical-align:-3px;margin-right:6px">' +
      (on
        ? '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'
        : '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>') +
      "</svg>" +
      (fsOK ? (on ? t("fsOff") : t("fsOn")) : t("fsNo"));
    b.disabled = !fsOK;
    b.classList.toggle("on", on);
  }
  async function toggleFs() {
    try {
      if (fsEl()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else {
        await (root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: "hide" });
        // on phones, keep the orientation the player is holding
        try {
          await screen.orientation?.lock?.(screen.orientation.type);
        } catch (e) {}
      }
    } catch (e) {
      toast(t("fsFail"));
    }
  }
  $("fsBtn").addEventListener("click", toggleFs);
  // phones and tablets: offer fullscreen on every visit (the tap itself is the gesture the browser needs)
  $("fsYes").addEventListener("click", () => {
    hide("fsAsk");
    if (!fsEl()) toggleFs();
  });
  $("fsNo").addEventListener("click", () => hide("fsAsk"));
  /* easter egg: ten quick clicks on a logo roll the credits */
  let logoClicks = 0,
    logoT = 0;
  function logoClick() {
    const now = performance.now();
    logoClicks = now - logoT < 1500 ? logoClicks + 1 : 1;
    logoT = now;
    if (logoClicks >= 10) {
      logoClicks = 0;
      openCredits();
    }
  }
  document.querySelectorAll(".dlogo,.menu .logo").forEach((el) => el.addEventListener("click", logoClick));
  function openCredits() {
    const c = $("croll");
    c.innerHTML = I.t("credits")
      .map(([r, n], i) =>
        r ? `<div class="cr"><i>${r}</i><b>${n}</b></div>` : `<div class="cr ${i ? "end" : "top"}"><b>${n}</b></div>`,
      )
      .join("");
    c.style.animation = "none";
    void c.offsetWidth;
    c.style.animation = "";
    show("credits");
    A.play("wave");
  }
  function closeCredits() {
    if (!$("credits").hidden) hide("credits");
  }
  $("credits").addEventListener("click", closeCredits);
  $("croll").addEventListener("animationend", closeCredits);
  function askFs() {
    if (fsOK && !fsEl() && matchMedia("(pointer:coarse)").matches && !isDesk()) show("fsAsk");
  }
  for (const ev of ["fullscreenchange", "webkitfullscreenchange"])
    document.addEventListener(ev, () => {
      drawFs();
      requestAnimationFrame(fitField);
    });

  /* ---------- ability icons ---------- */
  const ABI = {
    stasis:
      '<svg viewBox="0 0 24 24" fill="none" stroke="#bfefff" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5M3 10l3.4 1-1 3.4M21 14l-3.4-1 1-3.4M3 14l3.4-1-1-3.4M21 10l-3.4 1 1 3.4"/></svg>',
    meteor:
      '<svg viewBox="0 0 24 24"><path d="M3 3l9 6M6 2l8 7M2 7l9 4" stroke="#ff9a3a" stroke-width="2" stroke-linecap="round" fill="none" opacity=".8"/><circle cx="15" cy="15" r="6" fill="#ff6a1a" stroke="#000" stroke-width="1.5"/><circle cx="13" cy="13" r="1.6" fill="#3a1606"/><circle cx="17" cy="17" r="1.2" fill="#3a1606"/></svg>',
    napalm:
      '<svg viewBox="0 0 24 24"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z" fill="#ff5a14" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 13c1.5 1.5 3 2.8 3 4.5a3 3 0 0 1-6 0c0-1.3.8-2.2 1.5-2.8.3 1 .8 1.3 1.5 1.3-.4-1-.4-2 0-3z" fill="#ffd23a"/></svg>',
    carpet:
      '<svg viewBox="0 0 24 24"><path d="M12 1.5l1.6 5 8 4.5v2.2l-8-2.2-.6 6 3 2.2v1.8L12 20l-4 1v-1.8l3-2.2-.6-6-8 2.2V11l8-4.5z" fill="#9aa3a8" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/><circle cx="7" cy="16.5" r="1.3" fill="#ff3a3a"/><circle cx="17" cy="16.5" r="1.3" fill="#ff3a3a"/></svg>',
    nuke: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#e3b81a" stroke="#000" stroke-width="1.5"/><circle cx="12" cy="12" r="1.9" fill="#111"/><path d="M12 12L8.6 6.1A6.8 6.8 0 0 1 15.4 6.1zM12 12l6.8 0a6.8 6.8 0 0 1-3.4 5.9zM12 12l-3.4 5.9A6.8 6.8 0 0 1 5.2 12z" fill="#111"/></svg>',
  };

  /* ---------- palette ---------- */
  const twEl = $("towers"),
    abEl = $("abil");
  function buildPalette() {
    twEl.innerHTML = "";
    abEl.innerHTML = "";
    for (const n of TKEYS) {
      const d = TT[n],
        b = document.createElement("button");
      b.className = "tb";
      b.dataset.t = n;
      b.innerHTML = `<canvas width="80" height="80"></canvas><span class="nm">${L(d)}</span><span class="meta"><span class="ky">${d.key}</span><span class="cs">${d.cost[0]}</span></span>`;
      b.title = `${L(d)} (${d.key})${d.size ? ", 2×2" : ""}: ${L(d, "desc")}`;
      b.setAttribute("aria-label", L(d));
      b.addEventListener("click", () => selectBuild(n));
      twEl.appendChild(b);
      const c = b.querySelector("canvas").getContext("2d");
      c.setTransform(80, 0, 0, 80, 0, 0);
      R.towerIcon(c, n);
    }
    for (const k of AKEYS) {
      const A_ = AB[k],
        b = document.createElement("button");
      b.className = "ab";
      b.dataset.a = k;
      b.title = `${L(A_)} (${A_.key.toUpperCase()}): ${L(A_, "desc")}`;
      b.setAttribute("aria-label", L(A_));
      b.innerHTML = `<span class="aico">${ABI[k]}</span><b class="sn">${L(A_)}</b><span class="meta"><span class="c"></span><span class="ky">${A_.key.toUpperCase()}</span></span><div class="cdbar"></div>`;
      b.addEventListener("click", () => selectAbility(k));
      abEl.appendChild(b);
    }
  }

  /* ---------- language ---------- */
  function applyLang() {
    document.documentElement.lang = I.lang;
    document.title = t("title");
    document.querySelectorAll("[data-i]").forEach((e) => {
      e.innerHTML = t(e.dataset.i);
    });
    document.querySelectorAll("[data-i-label]").forEach((e) => {
      const v = t(e.dataset.iLabel);
      e.setAttribute("aria-label", v);
      e.title = v;
    });
    cv.setAttribute("aria-label", t("field"));
    buildPalette();
    drawSound();
    drawFs();
    drawSpeed();
    renderOver();
    if (!S().started) $("banner").textContent = t("banner", { d: L(DIFF[diff]) });
    if (!$("menu").hidden) openMenu();
    lastInfo = "\u0000";
    lastNext = "";
    refreshUI();
  }
  function renderLangs() {
    $("langs").innerHTML = I.LANGS.map(
      (k) =>
        `<button class="lcard${k === I.lang ? " on" : ""}" data-l="${k}">${k === "ru" ? "Русский" : "English"}</button>`,
    ).join("");
  }

  /* ---------- difficulty & modals ---------- */
  const SKULL =
    '<path d="M12 2.6c-4.6 0-8.1 3.3-8.1 7.8 0 2.6 1.2 4.5 2.9 5.6v2.7c0 .7.5 1.2 1.2 1.2h8c.7 0 1.2-.5 1.2-1.2V16c1.7-1.1 2.9-3 2.9-5.6 0-4.5-3.5-7.8-8.1-7.8z"/><circle cx="8.7" cy="10.6" r="2.1" fill="#0a0d18"/><circle cx="15.3" cy="10.6" r="2.1" fill="#0a0d18"/><path d="M12 13.1l-1.2 2.2h2.4z" fill="#0a0d18"/><path d="M10.2 17.4v2.4M12 17.4v2.4M13.8 17.4v2.4" stroke="#0a0d18" stroke-width=".9"/>';
  function skullIcon(k, cls = "") {
    const d = DIFF_LOOK[k];
    if (d.icon === "x") {
      return (
        `<svg class="big ${cls}" viewBox="0 0 32 32" aria-hidden="true"><g stroke="${d.edge}" stroke-width="4.4" stroke-linecap="round"><line x1="5" y1="29" x2="27" y2="17"/><line x1="5" y1="17" x2="27" y2="29"/></g>` +
        `<g stroke="${d.col}" stroke-width="2.8" stroke-linecap="round"><line x1="5" y1="29" x2="27" y2="17"/><line x1="5" y1="17" x2="27" y2="29"/></g>` +
        `<g transform="translate(4 0)" fill="${d.col}" stroke="${d.edge}" stroke-width=".8">${SKULL}</g></svg>`
      );
    }
    let o = "";
    for (let i = 0; i < d.icon; i++)
      o += `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="${d.col}">${SKULL}</g></svg>`;
    return o;
  }
  let pendingDiff = null;
  function closeModal(id) {
    hide(id);
  }
  function renderDiffs() {
    $("diffs").innerHTML = DKEYS.map((k) => {
      const d = DIFF[k],
        b = bestOf(k);
      return `<button class="dcard${k === diff ? " on" : ""}" data-d="${k}"><span class="ic">${skullIcon(k)}</span><b style="color:${dcol(k)}">${L(d)}</b><small>${L(d, "desc")}${b ? t("bestShort", { b }) : ""}</small></button>`;
    }).join("");
  }
  function applyDiff(k) {
    diff = k;
    store.set("xt-diff", k);
    newGame();
    hide("settings");
    if (!$("menu").hidden) openMenu();
    refreshUI();
    toast(t("diffIs", { d: L(DIFF[diff]) }));
  }
  function openSettings() {
    drawFs();
    renderLangs();
    renderDiffs();
    drawSound();
    $("confirm").hidden = true;
    show("settings");
  }
  function openHelp() {
    $("bestLine").innerHTML = t("bestLine", {
      d: L(DIFF[diff]),
      b: Math.max(best, S().wave),
      f: FINAL,
    });
    show("help");
  }
  $("overDiff").addEventListener("click", openSettings);
  $("langs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-l]");
    if (!b) return;
    I.setLang(b.dataset.l);
    applyLang();
    renderLangs();
    renderDiffs();
  });
  $("setClose").addEventListener("click", () => closeModal("settings"));
  $("diffs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-d]");
    if (!b) return;
    const k = b.dataset.d,
      s = S();
    if (s.started && !s.over && s.wave > 0) {
      pendingDiff = k;
      $("confirmTxt").textContent = t("confirm", { w: s.wave, d: L(DIFF[k]) });
      $("confirm").hidden = false;
    } else applyDiff(k);
  });
  $("confirmYes").addEventListener("click", () => {
    if (pendingDiff) applyDiff(pendingDiff);
    pendingDiff = null;
  });
  $("confirmNo").addEventListener("click", () => {
    $("confirm").hidden = true;
    pendingDiff = null;
  });
  $("helpClose").addEventListener("click", () => closeModal("help"));
  for (const id of ["help", "settings"])
    $(id).addEventListener("click", (e) => {
      if (e.target.id === id) closeModal(id);
    });

  /* ---------- panels ---------- */
  let toastT = 0;
  function toast(m) {
    const el = $("toast");
    el.textContent = m;
    el.style.opacity = 1;
    clearTimeout(toastT);
    toastT = setTimeout(() => (el.style.opacity = 0), 1800);
  }
  function fmt(v) {
    if (v >= 1e12) return (v / 1e12).toFixed(1) + "T";
    if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e4) return Math.round(v / 1e3) + "k";
    return v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  }
  let lastInfo = "",
    lastNext = "";
  function towerCard() {
    const s = S(),
      d = TT[sel.type],
      Lv = sel.lvl,
      cur = C.stats(sel);
    const nxs = Lv < 3 ? C.st(sel.type, Lv + 1) : Lv >= 4 ? C.st(sel.type, Lv, sel.ult, sel.oc + 1) : null;
    const r2 = (v) => Math.round(v * 100) / 100;
    const row = (k, a, b) => `<span>${k}</span><span>${a}${b != null && nxs && b !== a ? ` <i>→ ${b}</i>` : ""}</span>`;
    const sx = " " + t("s");
    let rows =
      row(sel.type === "laser" ? t("dps") : t("dmg"), fmt(cur.dmg), nxs && fmt(nxs.dmg)) +
      row(t("range"), r2(cur.range), nxs && r2(nxs.range));
    if (cur.rate) rows += row(t("reload"), r2(cur.rate) + sx, nxs && r2(nxs.rate) + sx);
    if (cur.splash) rows += row(t("blast"), r2(cur.splash), nxs && r2(nxs.splash));
    if (cur.slow) rows += row(t("slow"), Math.round(cur.slow * 100) + "%", nxs && Math.round(nxs.slow * 100) + "%");
    if (cur.burn) rows += row(t("burn"), fmt(cur.burn), nxs && fmt(nxs.burn));
    if (cur.minR) rows += row(t("dead"), cur.minR);
    rows += `<span class="ext">${t("targets")}</span><span class="ext">${cur.air && cur.ground ? t("tBoth") : cur.air ? t("tAir") : t("tGround")}${cur.prio === "strong" ? t("tough") : ""}</span>`;
    rows += `<span class="ext">${t("armor")}</span><span class="ext">${cur.pierce ? t("pierces") : t("reduces")}</span>`;
    const uc = C.upCost(sel),
      poor = s.credits < uc ? "disabled" : "";
    let up, lv;
    if (Lv < 3) {
      lv = t("lvl", { l: Lv + 1 });
      up = `<div class="btnrow"><button class="go" data-act="up" ${poor}>${t("upTo", { l: Lv + 2, c: fmt(uc) })}</button></div>`;
    } else if (Lv === 3) {
      lv = t("lvl", { l: 4 });
      up =
        `<div class="ultHead">${t("ultHead", { c: fmt(uc) })} · ${t("piercesArmor").toLowerCase()}</div><div class="ults">` +
        Object.entries(d.ults)
          .map(
            ([k, u]) =>
              `<button data-act="up" data-u="${k}" ${poor}><b>${L(u)}</b><small>${L(u, "desc")}</small></button>`,
          )
          .join("") +
        `</div>`;
    } else {
      const u = d.ults[sel.ult];
      lv = t("lvl5") + (sel.oc ? t("oc", { n: sel.oc }) : "");
      up = `<div class="ultHead"><b>${L(u)}:</b> ${L(u, "desc")}</div><div class="btnrow"><button class="go" data-act="up" ${poor}>${t("ocBtn", { n: sel.oc + 1, c: fmt(uc) })}</button></div>`;
    }
    return `<div class="top"><div class="ttl">${L(d)} · ${lv}</div><button class="sellb" data-act="sell">${t("sell", { v: fmt(Math.floor(sel.inv * 0.7)) })}</button><button class="x" data-act="cancel" aria-label="${t("close")}">✕</button></div>
    ${up}<div class="kv">${rows}</div>`;
  }
  // desktop: the card area explains what is being built or aimed when no tower is selected
  function idleCard() {
    if (build) {
      const d = TT[build];
      return `<div class="top"><div class="ttl">${L(d)}</div><button class="x" data-act="cancel" aria-label="${t("close")}">✕</button></div><p>${L(d, "desc")}</p>
      <div class="kv"><span>${build === "laser" ? t("dps") : t("dmg")}</span><span>${d.dmg[0]}</span><span>${t("range")}</span><span>${d.range[0]}</span>${d.size ? `<span>${t("size")}</span><span>${t("size22")}</span>` : ""}<span>${t("price")}</span><span>${d.cost[0]}</span></div>
      <p>${t("ultsList", {
        l: Object.values(d.ults)
          .map((u) => L(u))
          .join(" / "),
      })}</p><p class="hintp">${t("clickBuild")}</p>`;
    }
    if (aim) {
      const A_ = AB[aim];
      return `<div class="top"><div class="ttl">${L(A_)}</div><button class="x" data-act="cancel" aria-label="${t("close")}">✕</button></div><p>${L(A_, "desc")}.</p>
      <div class="kv"><span>${t("price")}</span><span>${fmt(C.abCost(aim))}</span><span>${t("cooldown")}</span><span>${A_.cd} ${t("s")}</span></div><p class="hintp">${t("clickCast")}</p>`;
    }
    return `<div class="top"><div class="ttl">${t("cmdTtl")}</div></div><p>${t("cmdTxt", { d: `<b style="color:${dcol(diff)}">${L(DIFF[diff])}</b>` })}</p>`;
  }
  function refreshUI() {
    const s = S();
    if (sel && !s.towers.includes(sel)) sel = null;
    $("sCred").textContent = fmt(Math.floor(s.credits));
    $("sLives").textContent = s.lives;
    $("sWave").textContent = s.wave + "/" + FINAL;
    $("sScore").textContent = fmt(s.score);
    $("progBar").style.width = (s.wave / FINAL) * 100 + "%";
    let nx;
    if (build) {
      const d = TT[build];
      nx = `<span class="hint"><b>${L(d)}</b>${d.size ? " 2×2" : ""} · ${d.cost[0]} ${t("cr")}</span> ${L(d, "desc")} ${t("tap")}`;
    } else if (aim) {
      const A_ = AB[aim];
      nx = `<span class="hint"><b>${L(A_)}</b> · ${fmt(C.abCost(aim))} ${t("cr")}</span> ${L(A_, "desc")}. ${t("tap")}`;
    } else if (s.wave >= FINAL) nx = t("finalWave");
    else {
      const w = C.makeWave(s.wave + 1),
        rl = w.route === "both" ? t("both") : routeLabel(w.route);
      const nm = w.type === "queen" ? L(C.ET.queen) : w.type === "boss" ? t("bossWave") : L(C.ET[w.type]);
      nx = s.started
        ? t("nextWave", { n: s.wave + 1, nm, r: rl, t: Math.ceil(s.timer) })
        : t("firstWave", { nm, r: rl });
      if (w.list.some((e) => C.ET[e.type].fly)) nx += t("airHint");
    }
    if (nx !== lastNext) {
      $("next").innerHTML = nx;
      lastNext = nx;
    }
    const g = $("go");
    g.textContent = !s.started
      ? t("start")
      : s.wave >= FINAL
        ? t("noMore")
        : `${t("call")} +${Math.max(0, Math.floor(s.timer))}`;
    g.disabled = s.over || s.wave >= FINAL;
    twEl.querySelectorAll(".tb").forEach((b) => {
      const n = b.dataset.t;
      b.classList.toggle("on", build === n);
      b.classList.toggle("poor", s.credits < TT[n].cost[0]);
    });
    abEl.querySelectorAll(".ab").forEach((b) => {
      const k = b.dataset.a,
        c = C.abCost(k),
        cd = s.cd[k];
      b.querySelector(".c").textContent = cd > 0 ? Math.ceil(cd) + " " + t("s") : fmt(c);
      b.querySelector(".cdbar").style.width = (cd / AB[k].cd) * 100 + "%";
      b.classList.toggle("on", aim === k);
      b.classList.toggle("poor", s.credits < c);
      b.disabled = s.over;
    });
    // The selected-tower card takes the palette's place so the tray never grows past the screen.
    let h;
    if (isDesk()) {
      $("pal").hidden = false;
      $("info").hidden = false;
      waveEl.hidden = ctrlEl.hidden = false;
      h = sel ? towerCard() : idleCard();
    } else {
      // phones: the tower card takes the whole tray (wave line, buttons and palette) so it never needs scrolling
      const card = !!sel;
      $("pal").hidden = waveEl.hidden = ctrlEl.hidden = card;
      $("info").hidden = !card;
      h = card ? towerCard() : "";
    }
    if (h !== lastInfo) {
      $("info").innerHTML = h;
      lastInfo = h;
      $("info").classList.toggle("ultmode", !!sel && sel.lvl === 3);
    }
  }

  /* ---------- what the renderer should show on top of the game state ---------- */
  function view(clock) {
    const s = S(),
      v = { t: clock, sel, preview: null, aim: null, building: !!build };
    if (hover && build && !s.over) {
      const d = TT[build],
        z = d.size || 1,
        [x, y] = C.buildOrigin(build, hover),
        why = C.placeCheck(x, y, z);
      if (why !== "busy" && why !== "out")
        v.preview = {
          type: build,
          x,
          y,
          size: z,
          ok: !why && s.credits >= d.cost[0],
          range: d.range[0],
          minR: d.minR || 0,
        };
    }
    if (hover && aim && !s.over) {
      const A_ = AB[aim];
      v.aim = { shape: A_.aim, x: hover[0], y: hover[1], r: A_.r };
    }
    return v;
  }

  /* ---------- one-screen fit ---------- */
  const app = $("app"),
    stage = $("stage"),
    fw = $("fw"),
    hdr = $("hdr"),
    dock = $("dock"),
    waveEl = dock.querySelector(".wave"),
    ctrlEl = dock.querySelector(".ctrl");
  // desktop layout: a mouse and a big enough window, whatever the window shape
  const deskMQ = matchMedia("(min-width:980px) and (min-height:560px) and (hover:hover) and (pointer:fine)");
  const isDesk = () => deskMQ.matches;
  function applyDesk() {
    document.body.classList.toggle("desk", isDesk());
    lastInfo = "\u0000";
    refreshUI();
    requestAnimationFrame(fitField);
  }
  deskMQ.addEventListener?.("change", applyDesk);
  const portrait = matchMedia("(orientation:portrait)");
  let palH = 0;
  function fitField() {
    let w, h;
    const pad = 10; // room for the frame around the field
    let rot = portrait.matches;
    if (isDesk()) {
      // turn the board only if that makes it noticeably bigger in this window
      const sw = stage.clientWidth - pad,
        sh = stage.clientHeight - pad;
      rot = Math.min(sw / H, sh / W) > Math.min(sw / W, sh / H) * 1.08;
    }
    if (rot !== rotated) {
      rotated = rot;
      R.setRotated(rot);
      lastNext = "";
    }
    const ar = rot ? H / W : W / H; // width / height of the field on screen
    if (isDesk()) {
      const sw = stage.clientWidth - pad,
        sh = stage.clientHeight - pad;
      w = sw;
      h = w / ar;
      if (h > sh) {
        h = sh;
        w = h * ar;
      }
    } else if (rot) {
      const pal = $("pal");
      if (!pal.hidden && pal.offsetHeight)
        palH = dock.children[0].offsetHeight + dock.children[1].offsetHeight + pal.offsetHeight + 12;
      const need = Math.max(palH || 0, 170);
      const gap = 8,
        avail = app.clientHeight - hdr.offsetHeight - need - gap * 2 - pad;
      w = stage.clientWidth - pad;
      h = w / ar;
      if (h > avail) {
        h = Math.max(160, avail);
        w = h * ar;
      }
    } else {
      w = stage.clientWidth - pad;
      h = w / ar;
      if (h > stage.clientHeight - pad) {
        h = stage.clientHeight - pad;
        w = h * ar;
      }
    }
    fw.style.width = Math.floor(w) + "px";
    fw.style.height = Math.floor(h) + "px";
  }
  new ResizeObserver(fitField).observe(app);
  portrait.addEventListener?.("change", () => requestAnimationFrame(fitField));

  /* ---------- loop ---------- */
  let last = performance.now(),
    uiAcc = 0,
    clock = 0;
  function frame(now) {
    const rdt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const sp = speed(),
      dt = rdt * sp;
    if (!S().over && dt > 0) {
      let rem = dt;
      while (rem > 0) {
        const st = Math.min(0.025, rem);
        C.step(st);
        rem -= st;
      }
    }
    clock += rdt;
    R.draw(view(clock), sp ? rdt * Math.min(2, Math.max(1, sp * 0.7)) : rdt * 0.3);
    A.update(rdt, sp === 0 || S().over);
    uiAcc += rdt;
    if (uiAcc > 0.1) {
      uiAcc = 0;
      refreshUI();
    }
    requestAnimationFrame(frame);
  }
  new ResizeObserver(() => R.resize()).observe(cv);
  document.body.classList.toggle("desk", isDesk());
  newGame();
  applyLang();
  openMenu();
  askFs();
  fitField();
  R.resize();
  requestAnimationFrame(frame);
  XT.ui = { newGame, refreshUI, openMenu };
})((window.XT = window.XT || {}));
