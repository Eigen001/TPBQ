"use strict";
/* ================= UI: screens, input, game loop, settings ================= */
var BUILD = "1.4"; // must match <meta name="tpbq-build"> in index.html
document.body.classList.toggle("poster", POSTER()); // art style first, so nothing below can leave the game in the wrong look
function bind(id, fn) { var el = $(id); if (el) el.onclick = fn; } // a missing button (old index.html) must never stop the game loading
var META = (function () {
  var d = newMeta(), m = loadJSON("tpbq_meta");
  if (m && typeof m === "object") Object.keys(d).forEach(function (k) { if (typeof m[k] === typeof d[k] && m[k] !== null) d[k] = m[k]; });
  if (d.hq.well2) { delete d.hq.well2; d.stock += 10; saveJSON("tpbq_meta", d); } // v1.3 removed the 2-wells unlock: refund it
  return d;
})();
function saveMeta() { saveJSON("tpbq_meta", META); }
function validRun(r) {
  return !!r && typeof r === "object" && typeof r.level === "number" && r.level >= 0 && r.level < LEVELS && typeof r.wallet === "number" && typeof r.points === "number" &&
    r.v === 2 && r.owned && r.owned.bots && r.owned.mixes && r.items && Array.isArray(r.bossMods) && r.bossMods.length === GALAXIES &&
    Array.isArray(r.comps) && Array.isArray(r.galaxies) && !r.over;
}
var RUN = (function () { var r = loadJSON("tpbq_run"); return validRun(r) ? normalizeRun(r, CONFIG) : null; })();
function saveRun() { if (RUN && !RUN.over) saveJSON("tpbq_run", RUN); else { try { localStorage.removeItem("tpbq_run"); } catch (e) { } } }
function t2Unlocked() { return !!CONFIG.arcadeTier2Unlocked || !!META.arcadeTier2Unlocked; }
function newSeed() { return (Date.now() ^ (Math.random() * 1e9)) >>> 0; }
/* ----- haptics. iOS Safari has no vibration API, but toggling an <input type=checkbox switch> (Safari 17.4+ / iOS 18)
   plays the system haptic tick, including when its label is clicked from script. Android uses navigator.vibrate.
   Respects the phone's own System Haptics setting. Best effort: unsupported devices simply do nothing. ----- */
var Haptic = (function () {
  var last = 0, canVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  function iosTick() {
    try {
      var lab = document.createElement("label"), inp = document.createElement("input");
      inp.type = "checkbox"; inp.setAttribute("switch", ""); lab.appendChild(inp);
      lab.style.cssText = "position:fixed;left:-99px;top:-99px;opacity:0;pointer-events:none";
      document.body.appendChild(lab); lab.click(); document.body.removeChild(lab);
    } catch (e) { }
  }
  function tick(ms) {
    if (!CONFIG.haptics) return;
    var now = performance.now(); if (now - last < 18) return; last = now;
    if (canVibrate) { try { navigator.vibrate(ms || 12); } catch (e) { } } else iosTick();
  }
  function pattern(n, gap) { tick(); for (var i = 1; i < n; i++) setTimeout(function () { last = 0; tick(); }, i * gap); }
  return {
    tap: function () { tick(12); },
    paint: function () { if (performance.now() - last >= CONFIG.hapticPaintMs) tick(8); },
    confirm: function () { pattern(2, 90); },
    error: function () { pattern(3, 70); }
  };
})();
// every button, swatch, well and bot ticks on press
document.addEventListener("pointerdown", function (e) {
  var t = e.target && e.target.closest && e.target.closest("button, .tile, .bot");
  if (t && !t.disabled && !t.classList.contains("locked")) Haptic.tap();
}, true);

var mode = "arcade", spec = null, round = null, phase = "idle", lastT = 0, lastSecShown = -1, cdToken = 0, undoStack = [], bucketArmed = false, pausedFrom = null;
var planetEl = $("planet"), pctx = planetEl.getContext("2d"), ghostEl = $("ghost"), gctx = ghostEl.getContext("2d"), wrapEl = $("planetWrap");
var brush = 1, wells = [0], brushWell = null, lastWell = 0, drag = null, paint = null, builtKey = "", lastHiss = 0;
var peekUsed = false, peekUntil = -1, hiddenShown = false, spinAng = 0, fogPts = [];
var sys = null, solarT = 0, solarSel = -1, stockEarned = 0;
var PALETTE = [1, 2, 3, 4, 5, 6, 0];

/* ----- planet = squares, drawn as three stacked layers: base (empty squares) / paint (one tile per square,
   straight from the scoring grid) / over (grid lines + outline). A square's pixels change only when its terrain changes.
   The square size is constant, so a smaller planet simply has fewer squares. ----- */
var baseC = document.createElement("canvas"), overC = document.createElement("canvas"), LY = null;
function buildLayers() {
  var g = round.grid, G = g.G, S = Math.max(1, Math.round(L.Dp / CONFIG.GRID)), N = G * S, i, x, y, xg, yg;
  baseC.width = baseC.height = overC.width = overC.height = paintC.width = paintC.height = planetEl.width = planetEl.height = N;
  LY = { G: G, S: S, N: N, css: N / L.dpr };
  wrapEl.style.width = wrapEl.style.height = LY.css + "px";
  var b = baseC.getContext("2d"), o = overC.getContext("2d"), lw = Math.max(2, Math.round(S * 0.16)), pst = POSTER();
  if (pst) lw = Math.max(lw, Math.round(2.5 * L.dpr));
  b.fillStyle = pst ? "#0f272c" : "#0a1030"; o.fillStyle = pst ? "rgba(244,230,200,.10)" : "rgba(255,255,255,.11)";
  for (i = 0; i < G * G; i++) if (g.inside[i]) {
    x = (i % G) * S; y = ((i / G) | 0) * S; b.fillRect(x, y, S, S);
    if (S >= 4) { o.fillRect(x, y, S, 1); o.fillRect(x, y, 1, S); }
  }
  o.fillStyle = pst ? "#f4e6c8" : "rgba(160,235,255,.95)";
  for (i = 0; i < G * G; i++) if (g.inside[i]) {
    xg = i % G; yg = (i / G) | 0; x = xg * S; y = yg * S;
    if (yg === 0 || !g.inside[i - G]) o.fillRect(x, y, S, lw);
    if (yg === G - 1 || !g.inside[i + G]) o.fillRect(x, y + S - lw, S, lw);
    if (xg === 0 || !g.inside[i - 1]) o.fillRect(x, y, lw, S);
    if (xg === G - 1 || !g.inside[i + 1]) o.fillRect(x + S - lw, y, lw, S);
  }
  var f = $("fog"); f.width = f.height = N; f.style.display = round.mod.fog ? "block" : "none";
  paintCells(null, g.cells);
}
function paintCells(list, cells) { // list = changed square indices, or null to redraw every square
  var G = LY.G, S = LY.S, x = paintC.getContext("2d"), n = list ? list.length : cells.length, k, i, id, px, py;
  if (!list) x.clearRect(0, 0, LY.N, LY.N);
  for (k = 0; k < n; k++) {
    i = list ? list[k] : k; id = cells[i]; px = (i % G) * S; py = ((i / G) | 0) * S;
    if (!id) { if (list) x.clearRect(px, py, S, S); continue; }
    if (list) x.clearRect(px, py, S, S);
    texDraw(x, id, px, py, S, S, px, py, S, S);
  }
}
function composeTo(ctx, px) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, px, px);
  ctx.drawImage(baseC, 0, 0, px, px); ctx.drawImage(paintC, 0, 0, px, px); ctx.drawImage(overC, 0, 0, px, px);
}
function showPct() {
  var cn = countGrid(round.grid), tot = round.grid.total - cn[0];
  $("debug").textContent = round.queue[0].slots.map(function (s) { return TERRAINS[s.terrain].name.slice(0, 4) + " " + pctOf(cn[s.terrain], tot) + "%"; }).join("  ");
}
function renderPlanet() {
  composeTo(pctx, LY.N);
  if (CONFIG.debugLivePct) showPct(); else if (peekUntil < 0) $("debug").textContent = "";
}
function snapshot() {
  var c = document.createElement("canvas"), px = Math.round(110 * L.dpr); c.width = c.height = px;
  composeTo(c.getContext("2d"), px); return c;
}
function drawFog(now) { // boss "fog": the planet is hidden except near where the finger has just been
  var f = $("fog"), x = f.getContext("2d"), N = LY.N, S = LY.S, fade = CONFIG.fogFadeSec, R = brushRad(round) * CONFIG.fogRadiusMul * S, k;
  x.globalCompositeOperation = "source-over"; x.fillStyle = POSTER() ? "#24525b" : "#1a2150"; x.fillRect(0, 0, N, N);
  x.globalCompositeOperation = "destination-out";
  fogPts = fogPts.filter(function (p) { return now - p.t < fade * 1000; });
  for (k = 0; k < fogPts.length; k++) {
    var p = fogPts[k], a = Math.min(1, (fade * 1000 - (now - p.t)) / 400), g = x.createRadialGradient(p.x * S, p.y * S, R * 0.6, p.x * S, p.y * S, R);
    g.addColorStop(0, "rgba(0,0,0," + a + ")"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.beginPath(); x.arc(p.x * S, p.y * S, R, 0, 7); x.fill();
  }
  x.globalCompositeOperation = "destination-in"; x.drawImage(baseC, 0, 0);
  x.globalCompositeOperation = "source-over";
}

function layout() {
  if (paint) { pendingLayout = true; return; }
  pendingLayout = false;
  var dpr = Math.min(3, window.devicePixelRatio || 1), vw = window.innerWidth, vh = window.innerHeight, inGame = $("game").classList.contains("on");
  ghostEl.width = Math.round(vw * dpr); ghostEl.height = Math.round(vh * dpr); ghostEl.style.width = vw + "px"; ghostEl.style.height = vh + "px";
  var D = Math.round(vw * CONFIG.canvasDiameterPct / 100), shrunk = false;
  if (inGame) { var avail = $("mid").clientHeight - 30; if (avail > 60 && D > avail) { D = avail; shrunk = true; } }
  if (inGame && spec && (spec.dialSize || spec.dialShape)) { var side = 8 + (spec.dialSize ? 36 : 0) + (spec.dialShape ? 36 : 0); if (D > vw - 2 * side) { D = vw - 2 * side; shrunk = true; } }
  var pal = CONFIG.paletteLayout, tw = Math.max(48, Math.min(96, Math.floor((vw - 16 - 54 - 12 - 3 * 8 - (pal === "b" ? 10 : 0)) / 4))), th = pal === "a" ? 34 : 46;
  var changed = !L || L.vw !== vw || L.vh !== vh || L.dpr !== dpr || L.art !== CONFIG.artStyle;
  L = { dpr: dpr, vw: vw, vh: vh, D: D, Dp: Math.round(D * dpr), cw: 0, ch: 0, cwPx: D * 0.36, chPx: D * 0.54, hw: tw, hh: th, shrunk: shrunk, art: CONFIG.artStyle };
  if (changed) drawSpace();
  buildTextures();
  if (round && inGame) {
    buildLayers();
    var k = tw + ":" + th + ":" + dpr + ":" + texKey + ":" + nWells() + ":" + pal;
    if (k !== builtKey) { buildPalette(); builtKey = k; }
    renderPlanet(); fitOrder();
    if (round.mod.fog) drawFog(performance.now());
  }
  drawHero();
}
function drawHero() { // little demo planet on the start screen, drawn the same square-by-square way
  var c = $("hero"), S = Math.min(120, Math.round(L.vh * 0.16)), G = 20, cs = Math.max(2, Math.round(S * L.dpr / G)), px = G * cs, x = c.getContext("2d"), i, u, v, id;
  c.style.width = c.style.height = S + "px"; c.width = c.height = px;
  var g = makeGrid(G, "circle"), k = Math.round(L.D * L.dpr) / px;
  for (i = 0; i < G * G; i++) if (g.inside[i]) {
    u = ((i % G) + 0.5 - G / 2) / (G / 2); v = (((i / G) | 0) + 0.5 - G / 2) / (G / 2);
    id = disc(u, v, -0.35, -0.3, 0.5) ? 1 : disc(u, v, 0.45, 0.05, 0.42) ? 2 : disc(u, v, -0.15, 0.6, 0.42) ? 5 : disc(u, v, 0.5, -0.6, 0.32) ? 6 : disc(u, v, -0.75, 0.25, 0.25) ? 4 : 3;
    var X = (i % G) * cs, Y = ((i / G) | 0) * cs;
    texDraw(x, id, X * k, Y * k, cs * k, cs * k, X, Y, cs, cs);
    x.fillStyle = "rgba(255,255,255,.12)"; x.fillRect(X, Y, cs, 1); x.fillRect(X, Y, 1, cs);
  }
}

/* ----- palette: 6 base terrains + erase, then the mixing well(s). Bots sit at the planet corners and act on a well. ----- */
function activeId() { return brushWell !== null ? wells[brushWell] : brush; } // terrain the brush paints (0 = erase / empty well)
function nWells() { return spec && spec.wells ? spec.wells : 1; }
// 2 rows x 4: six terrains, ERASE and the WELL. Three looks (CONFIG.paletteLayout): a = cards with labels under,
// b = cards with labels inside and a separate tools column (WELL over ERASE), c = label chips (swatch + name).
var PAL_ORDER = { a: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 0: 7, w: 8 }, b: { 1: 1, 2: 2, 3: 3, w: 4, 4: 5, 5: 6, 6: 7, 0: 8 }, c: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 0: 7, w: 8 } };
function tileCanvas(s) { // art canvas for a palette tile; size depends on the layout
  var pal = CONFIG.paletteLayout, d = L.dpr, c = document.createElement("canvas"), chip = pal === "c";
  var aw = chip ? L.hh - 22 : L.hw, ah = chip ? L.hh - 22 : L.hh, m = chip ? 0 : 20;
  c.width = Math.round((aw + m) * d); c.height = Math.round((ah + m) * d); c.style.width = (aw + m) + "px"; c.style.height = (ah + m) + "px";
  c._aw = aw; c._ah = ah; s.appendChild(c); return c;
}
function buildPalette() {
  var h = $("hand"), d = L.dpr, pal = CONFIG.paletteLayout; h.innerHTML = ""; h.className = "grid pal" + pal.toUpperCase();
  $("bottom").className = "pal" + pal.toUpperCase();
  PALETTE.forEach(function (id) {
    var s = document.createElement("div"); s.className = "tile" + (id === 0 ? " tool" : ""); s.style.width = L.hw + "px"; s.style.height = L.hh + "px"; s.setAttribute("data-id", id);
    s.style.order = PAL_ORDER[pal][id];
    var c = tileCanvas(s), x = c.getContext("2d"); x.setTransform(d, 0, 0, d, c.width / 2, c.height / 2);
    if (pal === "c" && id) { x.beginPath(); x.arc(0, 0, c._aw / 2, 0, 7); x.clip(); texDraw(x, id, 0, 0, 120, 120, -c._aw / 2, -c._aw / 2, c._aw, c._aw); }
    else drawCard(x, id, c._aw, c._ah, 1, pal !== "c");
    var lab = document.createElement("span"); lab.textContent = id === 0 ? "ERASE" : TERRAINS[id].name;
    s.appendChild(lab); h.appendChild(s); fitLabel(lab);
    s.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      if (round && round.locked.indexOf(id) >= 0) { AudioSys.sfx("bonk"); Haptic.error(); return; }
      selectBrush(id, true);
      drag = { id: id, pid: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, on: false };
    });
  });
  for (var w = 0; w < nWells(); w++) (function (w) {
    var s = document.createElement("div"); s.className = "tile well tool"; s.id = "well" + w; s.style.width = L.hw + "px"; s.style.height = L.hh + "px";
    s.style.order = PAL_ORDER[CONFIG.paletteLayout].w + w;
    tileCanvas(s);
    var lab = document.createElement("span");
    s.appendChild(lab); h.appendChild(s);
    s.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      if (!wells[w]) { AudioSys.sfx("bonk"); Haptic.error(); wellHint(); return; }
      selectWell(w);
    });
  })(w);
  refreshWells(); refreshBrushUI(); refreshLocked();
}
function fitLabel(sp) { // chips: shrink a long terrain name until it fits its tile
  if (CONFIG.paletteLayout !== "c") return;
  var f = 11; sp.style.fontSize = f + "px";
  while (f > 7 && (sp.scrollWidth > sp.clientWidth + 1 || sp.scrollHeight > sp.parentNode.clientHeight - 4)) { f -= 0.5; sp.style.fontSize = f + "px"; }
}
function refreshWells() {
  for (var w = 0; w < nWells(); w++) {
    var el = $("well" + w); if (!el) continue;
    var c = el.firstChild, d = L.dpr, x = c.getContext("2d");
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); x.setTransform(d, 0, 0, d, c.width / 2, c.height / 2);
    if (CONFIG.paletteLayout === "c") drawWell(x, wells[w], c._aw * 1.15, c._ah * 1.25); else drawWell(x, wells[w], c._aw, c._ah);
    el.lastChild.textContent = wells[w] ? TERRAINS[wells[w]].name : "WELL"; fitLabel(el.lastChild);
  }
}
function wellPulse(w) { var el = $("well" + w); if (!el) return; el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); }
function wellHint() { var el = $("flash"); el.innerHTML = "<small>DRAG A TERRAIN INTO THE WELL</small>"; el.classList.remove("go"); void el.offsetWidth; el.classList.add("go"); }
function dropInWell(w, id) {
  if (round && round.locked.indexOf(id) >= 0) { AudioSys.sfx("bonk"); return; }
  var before = wells[w], now = wellDrop(before, id, round.owned);
  wells[w] = now; lastWell = w; wellPulse(w);
  AudioSys.sfx(!now ? "erase" : before && now !== id ? "coin" : "drop");
  if (before && now && now !== id) Haptic.confirm(); else Haptic.tap();
  if (!now && brushWell === w) selectBrush(1, false);
  refreshWells(); refreshBrushUI();
}
function pressBot(b) {
  var w = brushWell !== null ? brushWell : lastWell, now = wellBot(wells[w], b, round.owned), el = $("bot_" + b);
  el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse");
  if (!now) { AudioSys.sfx("bonk"); Haptic.error(); if (!wells[w]) wellHint(); return; }
  wells[w] = now; lastWell = w; wellPulse(w); AudioSys.sfx("coin"); Haptic.confirm(); refreshWells(); refreshBrushUI();
}
function wellAt(x, y) {
  for (var w = 0; w < nWells(); w++) { var el = $("well" + w); if (!el) continue; var r = el.getBoundingClientRect(); if (x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 20 && y <= r.bottom + 14) return w; }
  return -1;
}
document.addEventListener("pointermove", function (e) {
  if (!drag || e.pointerId !== drag.pid) return;
  drag.x = e.clientX; drag.y = e.clientY;
  if (!drag.on && Math.abs(drag.x - drag.x0) + Math.abs(drag.y - drag.y0) > 10) drag.on = true;
});
function dragEnd(e) {
  if (!drag || e.pointerId !== drag.pid) return;
  var d = drag; drag = null;
  if (!d.on || !round) return;
  var w = wellAt(e.clientX, e.clientY);
  if (w >= 0 && (phase === "play" || phase === "countdown")) dropInWell(w, d.id);
}
document.addEventListener("pointerup", dragEnd); document.addEventListener("pointercancel", dragEnd);
function refreshBrushUI() {
  var tiles = $("hand").children, i, id = activeId(), col = TCOL[id] || "#f4e6c8";
  for (i = 0; i < tiles.length; i++) {
    var t = tiles[i], isW = t.classList.contains("well");
    t.classList.toggle("sel", isW ? brushWell === +t.id.slice(4) : brushWell === null && +t.getAttribute("data-id") === brush);
  }
  var c = $("brushCan"), px = Math.round(60 * L.dpr), x = c.getContext("2d");
  c.width = c.height = px;
  x.save(); x.beginPath(); x.arc(px / 2, px / 2, px / 2, 0, 7); x.clip(); texDraw(x, id, 0, 0, px, px, 0, 0, px, px); x.restore();
  c.style.borderColor = col; c.style.boxShadow = "0 0 18px " + col;
  $("brushName").textContent = (brushWell !== null ? "WELL: " : "") + (id === 0 ? "ERASE" : TERRAINS[id].name);
  $("brushName").style.color = col;
}
function selectBrush(id, sound) { brush = id; brushWell = null; refreshBrushUI(); if (sound) AudioSys.sfx("pickup"); }
function selectWell(w) { brushWell = w; lastWell = w; refreshBrushUI(); AudioSys.sfx("pickup"); }
function refreshLocked() {
  var tiles = $("hand").children;
  for (var i = 0; i < tiles.length; i++) tiles[i].classList.toggle("locked", !!round && !tiles[i].classList.contains("well") && round.locked.indexOf(+tiles[i].getAttribute("data-id")) >= 0);
}
function setupTools() { // show only what this round owns
  BOTS.forEach(function (b) { var el = $("bot_" + b); el.classList.toggle("own", !!round.owned.bots[b]); el.innerHTML = botSVG(b); el.style.color = BOT_COL[b]; el.style.borderColor = BOT_COL[b]; });
  $("peekBtn").classList.toggle("own", !!spec.peek && !peekUsed);
  $("mid").classList.toggle("hastools", !!(spec.peek || spec.undo || spec.freeze || spec.bucket));
  $("dials").classList.toggle("own", !!spec.dialSize); $("shapes").classList.toggle("own", !!spec.dialShape);
  $("shapes").classList.toggle("solo", !spec.dialSize);
  refreshTools();
}
function refreshTools() { // UNDO / FREEZE / BUCKET buttons and the dials
  var u = $("undoBtn"), f = $("freezeBtn"), b = $("bucketBtn");
  function lab(el, icon, t) { var h = storeIcon(icon) + "<span>" + t + "</span>"; if (el._h !== h) { el.innerHTML = h; el._h = h; } }
  lab($("peekBtn"), "peek", "PEEK"); lab(b, "bucket", bucketArmed && !round.bucketUsed ? "TAP PLANET" : "BUCKET");
  u.classList.toggle("own", !!spec.undo); lab(u, "undo", "UNDO " + round.undoLeft); u.disabled = round.undoLeft <= 0 || !undoStack.length;
  f.classList.toggle("own", !!spec.freeze && (round.freezeLeft > 0 || round.frozen > 0)); lab(f, "freeze", round.frozen > 0 ? "FROZEN " + Math.ceil(round.frozen) : "FREEZE"); f.classList.toggle("on", round.frozen > 0);
  b.classList.toggle("own", !!spec.bucket); b.disabled = round.bucketUsed; b.classList.toggle("on", bucketArmed && !round.bucketUsed);
  $("dialPct").textContent = Math.round(round.basePct) + "%";
  ["circle", "square", "triangle"].forEach(function (k) { $("sh_" + k).classList.toggle("sel", round.shape === k); });
}
function setBrushPct(d) {
  var v = clampDial(round.basePct + d * CONFIG.dialStepPct, CONFIG);
  if (v === round.basePct) { AudioSys.sfx("bonk"); return; }
  round.basePct = v; if (spec.story && RUN) { RUN.brushPct = v; saveRun(); } AudioSys.sfx("pickup"); refreshTools();
}
function setBrushShape(k) { round.shape = k; if (spec.story && RUN) { RUN.brushShape = k; saveRun(); } AudioSys.sfx("pickup"); refreshTools(); }
/* ----- quit: pauses the round and asks what to do ----- */
function openQuit() {
  if (phase !== "play" && phase !== "countdown") return;
  pausedFrom = phase; phase = "paused"; paint = null; cdToken++; AudioSys.music(null);
  $("cd").style.display = "none"; $("banner").style.display = "none";
  var h = '<div class="qbox"><b>PAUSED</b>';
  if (spec.story) h += '<button id="qKeep" class="pri">KEEP RUN, QUIT TO MENU</button><small>Replay this level from the start later</small><button id="qAband">ABANDON RUN</button>';
  else h += '<button id="qKeep" class="pri">QUIT TO MENU</button><small>' + (spec.practice ? "" : "This round won't be scored") + "</small>";
  h += '<button id="qResume">RESUME</button></div>';
  var q = $("quitDlg"); q.innerHTML = h; q.style.display = "flex";
  $("qResume").onclick = function () { AudioSys.sfx("tap"); q.style.display = "none"; if (pausedFrom === "countdown") { beginCountdown(); } else { phase = "play"; lastT = performance.now(); AudioSys.music("game"); } };
  $("qKeep").onclick = function () { AudioSys.sfx("tap"); q.style.display = "none"; phase = "idle"; round = null; toStart(); };
  if ($("qAband")) { var armed = false; $("qAband").onclick = function () {
    if (!armed) { armed = true; $("qAband").textContent = "TAP AGAIN TO ABANDON"; return; }
    q.style.display = "none"; phase = "idle"; round = null; RUN.over = true; stockEarned = endRun(RUN, META, CONFIG); saveMeta(); saveRun(); pageRunEnd();
  }; }
}
function updateHud() {
  if (spec.practice) { $("hudL").textContent = "PRACTICE · NO CLOCK"; $("hudR").textContent = ""; }
  else if (spec.story) { $("hudL").textContent = "G" + (spec.g + 1) + " · " + (spec.boss ? "BOSS" : "L" + (spec.l + 1)) + " · QUOTA " + spec.quota; $("hudR").textContent = round.points + " PTS"; }
  else { $("hudL").textContent = "ARCADE"; $("hudR").textContent = round.results.length + " SHIPPED"; }
}

/* ----- flow ----- */
function shipped(f) { // no grade mid-round: results wait for the review. Points are fine to show.
  var el = $("flash");
  el.innerHTML = "<small>" + f.order.planet.toUpperCase() + " SHIPPED" + (spec.story ? " &middot; +" + f.points + " PTS" : "") + "</small>";
  el.classList.remove("go"); void el.offsetWidth; el.classList.add("go");
}
function beginLevel() {
  AudioSys.init(); sanitizeConfig();
  spec = mode === "story" ? levelSpec(RUN, META, CONFIG) : mode === "practice" ? practiceSpec() : arcadeSpec(CONFIG, t2Unlocked(), META);
  round = createPaintRound(CONFIG, spec, makeRng(newSeed()));
  paint = null; lastSecShown = -1; builtKey = ""; LY = null; undoStack = []; bucketArmed = false; wells = []; for (var w = 0; w < spec.wells; w++) wells.push(0); brushWell = null; lastWell = 0; drag = null; peekUsed = false; peekUntil = -1; hiddenShown = false; spinAng = 0; fogPts = [];
  if (brush === undefined || brush > 6) brush = 1;
  wrapEl.style.transform = "";
  show("game");
  $("skip").classList.toggle("off", !CONFIG.skipEnabled);
  $("fly").style.display = "none"; $("flash").classList.remove("go");
  layout(); setupTools(); updateOrderUI(false); updateTimer(); updateHud();
  $("quitDlg").style.display = "none";
  beginCountdown(true);
}
function beginCountdown(first) {
  var my = ++cdToken, ban = $("banner");
  function count() {
    ban.style.display = "none";
    if (my !== cdToken) return;
    if (!CONFIG.countdown) { $("cd").style.display = "none"; go(); return; }
    phase = "countdown"; AudioSys.music(null);
    var cd = $("cd"), n = 3; cd.style.display = "flex";
    (function stepCd() {
      if (my !== cdToken) return;
      if (n > 0) { cd.textContent = n; AudioSys.sfx("beep"); n--; setTimeout(stepCd, 600); }
      else { cd.style.display = "none"; go(); }
    })();
  }
  $("cd").style.display = "none";
  if (first && spec.mods.length) { // boss banner before the countdown
    phase = "countdown"; AudioSys.music(null); AudioSys.sfx("end");
    ban.innerHTML = "<small>BOSS LEVEL</small>" + spec.mods.map(function (m) { return "<b>" + MOD_INFO[m][0] + "</b><span>" + MOD_INFO[m][1] + "</span>"; }).join("");
    ban.style.display = "block"; setTimeout(count, 2400);
  } else count();
}
function go() {
  phase = "play"; lastT = performance.now(); lastSecShown = -1;
  AudioSys.sfx("go"); AudioSys.sfx("chatter"); AudioSys.music("game"); updateTimer();
}
function endRound() {
  if (phase !== "play") return;
  phase = "over"; paint = null; lastSecShown = -1; updateTimer();
  AudioSys.music(null); AudioSys.sfx("end");
  var my = ++cdToken;
  setTimeout(function () { if (my === cdToken) showResults(); }, 1000);
}
function newPlanetUI(slide) { undoStack = []; bucketArmed = false; buildLayers(); renderPlanet(); refreshLocked(); updateOrderUI(slide); updateHud(); refreshTools(); fogPts = []; if (round.mod.fog) drawFog(performance.now()); }
function doSkip() {
  if (phase !== "play") return;
  paint = null;
  if (!roundSkip(round)) return;
  AudioSys.sfx("skip"); setTimeout(function () { AudioSys.sfx("chatter"); }, 380);
  newPlanetUI(true);
  if (round.over) endRound();
}
function handleEvents() {
  var ev = round.events.splice(0), i;
  for (i = 0; i < ev.length; i++) {
    if (ev[i] === "fickle") { updateOrderUI(false); var b = $("bubble"); b.classList.remove("flashy"); void b.offsetWidth; b.classList.add("flashy"); AudioSys.sfx("bonk"); }
    else if (ev[i] === "meteorWarn") AudioSys.sfx("tick");
    else if (ev[i] === "meteor") { paintCells(null, round.grid.cells); renderPlanet(); AudioSys.sfx("erase"); Haptic.error(); }
    else if (ev[i] === "locked") { refreshLocked(); AudioSys.sfx("tap"); }
    else if (ev[i] === "thaw") { refreshTools(); AudioSys.sfx("beep"); }
    else if (ev[i] === "freeSkip") { var fl = $("flash"); setTimeout(function () { fl.innerHTML = "<small>FREE SKIP +" + CONFIG.freeSkipSec + " s</small>"; fl.classList.remove("go"); void fl.offsetWidth; fl.classList.add("go"); }, 50); }
  }
}

/* ----- input: press and hold on the planet to spray; release to stop ----- */
function wrapCentre() { var r = wrapEl.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function toGrid(c, X, Y) { // screen -> grid squares, undoing the boss spin
  var dx = X - c.x, dy = Y - c.y, a = spinAng * Math.PI / 180, cell = LY.S / L.dpr;
  if (a) { var co = Math.cos(a), si = Math.sin(a), t = dx * co + dy * si; dy = -dx * si + dy * co; dx = t; }
  return { x: (dx + LY.css / 2) / cell, y: (dy + LY.css / 2) / cell };
}
function toScreen(c, gx, gy) {
  var cell = LY.S / L.dpr, dx = gx * cell - LY.css / 2, dy = gy * cell - LY.css / 2, a = spinAng * Math.PI / 180;
  if (a) { var co = Math.cos(a), si = Math.sin(a), t = dx * co - dy * si; dy = dx * si + dy * co; dx = t; }
  return { x: c.x + dx, y: c.y + dy };
}
(function () {
  var mid = $("mid");
  mid.addEventListener("pointerdown", function (e) {
    if (e.target && e.target.closest && e.target.closest("button")) return;
    e.preventDefault();
    if (phase !== "play" || paint) return;
    if (spec.undo) { undoStack.push(snapGrid(round)); if (undoStack.length > 6) undoStack.shift(); }
    if (bucketArmed && !round.bucketUsed) { // fill bucket: one tap floods the connected same-terrain area
      var gp = toGrid(wrapCentre(), e.clientX, e.clientY - CONFIG.brushOffsetY), gx = Math.floor(gp.x), gy = Math.floor(gp.y), G = round.grid.G;
      var ch = gx >= 0 && gy >= 0 && gx < G && gy < G ? bucketFill(round, gy * G + gx, activeId()) : [];
      if (!ch.length) { if (spec.undo) undoStack.pop(); AudioSys.sfx("bonk"); Haptic.error(); return; }
      bucketArmed = false; AudioSys.sfx("drop"); Haptic.confirm(); afterPaint(ch); refreshTools(); return;
    }
    try { mid.setPointerCapture(e.pointerId); } catch (err) { }
    paint = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, c: wrapCentre(), buzz: false };
    Haptic.paint();
  });
  mid.addEventListener("pointermove", function (e) { if (paint && e.pointerId === paint.id) { paint.x = e.clientX; paint.y = e.clientY; if (paint.buzz) { paint.buzz = false; Haptic.paint(); } } });
  function stop(e) {
    if (!paint || e.pointerId !== paint.id) return;
    try { mid.releasePointerCapture(e.pointerId); } catch (err) { }
    paint = null; if (pendingLayout) layout();
    if (spec && spec.undo && undoStack.length && round && undoStack[undoStack.length - 1].planet === round.planetNo && countSame(undoStack[undoStack.length - 1])) undoStack.pop(); // a stroke that changed nothing
    if (round) refreshTools();
  }
  function countSame(sn) { var c = round.grid.cells; for (var i = 0; i < c.length; i++) if (c[i] !== sn.cells[i]) return false; return true; }
  mid.addEventListener("pointerup", stop); mid.addEventListener("pointercancel", stop);
  BOTS.forEach(function (b) {
    $("bot_" + b).addEventListener("pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); if (phase === "play" || phase === "countdown") pressBot(b); });
  });
  function tool(id, fn) { $(id).addEventListener("pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); if (phase === "play" && round) fn(); }); }
  tool("undoBtn", function () {
    var sn = undoStack.pop();
    if (!roundUndo(round, sn)) { AudioSys.sfx("bonk"); refreshTools(); return; }
    paintCells(null, round.grid.cells); renderPlanet(); AudioSys.sfx("skip"); refreshTools();
  });
  tool("freezeBtn", function () { if (roundFreeze(round)) { AudioSys.sfx("coin"); Haptic.confirm(); } refreshTools(); });
  tool("bucketBtn", function () { if (round.bucketUsed) return; bucketArmed = !bucketArmed; AudioSys.sfx("tap"); refreshTools(); });
  tool("dUp", function () { setBrushPct(1); }); tool("dDn", function () { setBrushPct(-1); });
  ["circle", "square", "triangle"].forEach(function (k) { tool("sh_" + k, function () { setBrushShape(k); }); });
  $("quitBtn").addEventListener("pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); AudioSys.sfx("tap"); openQuit(); });
  $("peekBtn").addEventListener("pointerdown", function (e) {
    e.preventDefault(); e.stopPropagation();
    if (phase !== "play" || peekUsed) return;
    peekUsed = true; peekUntil = round.elapsed + CONFIG.peekSec; $("peekBtn").classList.remove("own"); AudioSys.sfx("coin");
  });
})();
function doSpray(now) {
  var off = CONFIG.brushOffsetY, a = toGrid(paint.c, paint.lx, paint.ly - off), b = toGrid(paint.c, paint.x, paint.y - off), rad = brushRad(round), G = round.grid.G;
  var dist = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y)), steps = Math.max(1, Math.ceil(dist / Math.max(0.5, rad * 0.4))), changed = [], s, c, k, px, py;
  var id = activeId(), empty = brushWell !== null && !id;
  for (s = 1; s <= steps && !empty; s++) {
    px = a.x + (b.x - a.x) * s / steps; py = a.y + (b.y - a.y) * s / steps;
    c = paintSpray(round, px, py, rad, id); for (k = 0; k < c.length; k++) changed.push(c[k]);
    if (round.mod.mirror) { c = paintSpray(round, G - px, py, rad, id); for (k = 0; k < c.length; k++) changed.push(c[k]); }
  }
  paint.lx = paint.x; paint.ly = paint.y;
  if (round.mod.fog) { var lp = fogPts[fogPts.length - 1]; if (lp && Math.abs(lp.x - b.x) + Math.abs(lp.y - b.y) < rad * 0.5) lp.t = now; else fogPts.push({ x: b.x, y: b.y, t: now }); }
  if (!changed.length) return;
  paint.buzz = true;
  if (now - lastHiss > 90) { lastHiss = now; AudioSys.sfx(id === 0 ? "rot" : "spray", 3); }
  afterPaint(changed);
}
function afterPaint(changed) { // redraw changed squares; ship the planet if it is done
  paintCells(changed, round.grid.cells);
  var fin = paintFinishIfDone(round);
  if (fin) { // finished: ship it (no grade until the review) and bring in the next customer's planet
    paintCells(null, fin.cells); renderPlanet(); fin.pic = snapshot(); flyOff(fin.pic);
    paint = null;
    Haptic.confirm();
    if (spec.practice) { shipped(fin); AudioSys.sfx("ship"); round.over = true; round.endReason = "practice"; endRound(); return; }
    newPlanetUI(true);
    shipped(fin); AudioSys.sfx("ship");
    setTimeout(function () { AudioSys.sfx("chatter"); }, 420);
    return;
  }
  renderPlanet();
}
function drawCursor() {
  var d = L ? L.dpr : 1;
  gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, ghostEl.width, ghostEl.height);
  if (!L || (phase !== "play" && phase !== "countdown") || !LY) return;
  gctx.setTransform(d, 0, 0, d, 0, 0);
  if (drag && drag.on) { // a terrain being carried to a well
    var q = 34, over = wellAt(drag.x, drag.y) >= 0;
    gctx.save(); gctx.translate(drag.x, drag.y - 30); gctx.globalAlpha = 0.92; gctx.scale(over ? 1.15 : 1, over ? 1.15 : 1);
    rr(gctx, -q / 2, -q / 2, q, q, 7); gctx.save(); gctx.clip(); texDraw(gctx, drag.id, 0, 0, 120, 120, -q / 2, -q / 2, q, q); gctx.restore();
    gctx.lineWidth = 3; gctx.strokeStyle = over ? "#f2b33d" : "#f4e6c8"; rr(gctx, -q / 2, -q / 2, q, q, 7); gctx.stroke(); gctx.restore();
  }
  if (phase !== "play") return;
  var cell = LY.S / L.dpr, rad = brushRad(round) * cell, c;
  if (round.meteor) { // incoming!
    c = wrapCentre(); var m = round.meteor, p = toScreen(c, m.cx, m.cy);
    gctx.strokeStyle = "#ff4a2a"; gctx.lineWidth = 4; gctx.setLineDash([7, 6]); gctx.beginPath(); gctx.arc(p.x, p.y, m.rad * cell, 0, 7); gctx.stroke(); gctx.setLineDash([]);
    gctx.fillStyle = "rgba(255,74,42,.25)"; gctx.fill();
  }
  if (!paint) return;
  var x = paint.x, y = paint.y - CONFIG.brushOffsetY, col = TCOL[activeId()] || "#f4e6c8";
  var a = spinAng * Math.PI / 180;
  function outline(X, Y) {
    gctx.save(); gctx.translate(X, Y); gctx.rotate(a); gctx.beginPath();
    if (round.shape === "square") gctx.rect(-rad, -rad, rad * 2, rad * 2);
    else if (round.shape === "triangle") { gctx.moveTo(0, -rad); gctx.lineTo(rad, rad); gctx.lineTo(-rad, rad); gctx.closePath(); }
    else gctx.arc(0, 0, rad, 0, 7);
    gctx.restore();
  }
  function ring(X, Y) {
    gctx.strokeStyle = "rgba(5,6,15,.8)"; gctx.lineWidth = 4; outline(X, Y); gctx.stroke();
    gctx.strokeStyle = col; gctx.lineWidth = 2; outline(X, Y); gctx.stroke();
  }
  ring(x, y);
  if (round.mod.mirror) { var g = toGrid(paint.c, x, y), q = toScreen(paint.c, round.grid.G - g.x, g.y); ring(q.x, q.y); }
}
function frame(now) {
  var dt = Math.min(0.25, Math.max(0, (now - lastT) / 1000)); lastT = now;
  if (phase === "play") {
    roundTick(round, dt);
    if (round.events.length) handleEvents();
    if (round.mod.spin) { spinAng = (spinAng + CONFIG.spinDegPerSec * dt) % 360; wrapEl.style.transform = "rotate(" + spinAng + "deg)"; }
    if (paint && !round.over) doSpray(now);
    var hide = !!round.mod.hidden && round.elapsed - round.planetStart > CONFIG.hiddenShowSec;
    if (hide !== hiddenShown) { hiddenShown = hide; updateOrderUI(false); }
    if (peekUntil >= 0) { if (round.elapsed < peekUntil) showPct(); else { peekUntil = -1; if (!CONFIG.debugLivePct) $("debug").textContent = ""; } }
    if (round.mod.fog) drawFog(now);
    updateTimer(); if (round.frozen > 0) refreshTools();
    if (round.over) endRound();
  } else if (phase === "recap" && sys && $("recap").classList.contains("on")) { solarT += dt; drawSolar($("solar"), sys, solarT, solarSel); }
  drawCursor();
  requestAnimationFrame(frame);
}

/* ----- results: solar system on top, then the level summary (overall grade spins like a slot machine) and the planet-by-planet review ----- */
function miniPlanet(pic) {
  var c = document.createElement("canvas"); c.width = pic.width; c.height = pic.height; c.style.width = c.style.height = "84px";
  c.getContext("2d").drawImage(pic, 0, 0); return c;
}
function arcadeKey() { return (CONFIG.arcadeCount || "R") + (CONFIG.randomShapes ? "S" : "C") + (CONFIG.arcadeTier2 && t2Unlocked() ? "T" : "") + (CONFIG.arcadeDialSize ? "z" : "") + (CONFIG.arcadeDialShape ? "h" : ""); }
var spinToken = 0;
function spinGrade(final, gi, done) { // slot-machine reel for the overall grade, then the grade sting
  var el = $("ogReel"), my = ++spinToken, n = 0, steps = 22, letters = GRADES;
  if (!el) return;
  if (final === "-") { el.textContent = "-"; el.classList.add("stop"); AudioSys.music(null); AudioSys.sfx("sting", 5); if (done) done(); return; }
  el.classList.add("spinning");
  (function tick() {
    if (my !== spinToken) return;
    if (n < steps) {
      el.textContent = letters[(n * 5 + 3) % letters.length]; AudioSys.sfx("reel", n);
      el.classList.remove("roll"); void el.offsetWidth; el.classList.add("roll");
      n++; setTimeout(tick, 45 + Math.pow(n / steps, 3) * 330);
      return;
    }
    el.textContent = final; el.classList.remove("spinning", "roll"); el.classList.add("stop", "g" + gi);
    AudioSys.music(null); AudioSys.sfx("sting", gi); if (gi <= 1) Haptic.confirm(); else if (gi >= 4) Haptic.error(); else Haptic.tap();
    setTimeout(function () { if (my === spinToken && phase === "recap") AudioSys.music("recap"); }, 3200);
    if (done) done();
  })();
}
function showResults() {
  var sum = summarizeRound(round), body = $("recapBody"), html = "", res = null, lvl = "", best = false, prac = !!spec.practice;
  sys = makeSystem(round.results, makeRng(newSeed()), !!META.hq.suns); solarT = 0; solarSel = -1; stockEarned = 0;
  var credits = "pay " + sum.payments + " MC &nbsp;" + (sum.bonus >= 0 ? "+" : "&minus;") + " " + Math.abs(sum.bonus) + " grade bonus" + (sum.t2 ? " &nbsp;(incl. " + sum.t2 + " tier-2 multiplier)" : "") + (sum.steady ? " &nbsp;+ " + sum.steady + " steady payout" : "") + (sum.tips ? " &nbsp;+ " + sum.tips + " speed tips" : "");
  var reel = '<div class="og">OVERALL GRADE <b id="ogReel" class="reel">?</b></div>';
  if (spec.story) {
    lvl = "GALAXY " + (spec.g + 1) + " &middot; " + (spec.boss ? "BOSS" : "LEVEL " + (spec.l + 1));
    res = finishLevel(RUN, sum, CONFIG);
    if (RUN.level >= LPG && !META.arcadeTier2Unlocked) { META.arcadeTier2Unlocked = true; saveMeta(); }
    if (RUN.over) { best = RUN.points > META.best; stockEarned = endRun(RUN, META, CONFIG); saveMeta(); }
    saveRun();
    html = '<div id="totals"><div class="lbl">' + lvl + '</div><div class="big">' + sum.points + " / " + res.quota + ' PTS</div>' + (sum.cushion ? '<div class="sm">incl. +' + sum.cushion + " grade cushion</div>" : "") +
      '<div id="stamp" class="stamp hide ' + (res.passed ? "pass" : "fail") + '">' + (res.shielded ? "SHIELDED PASS" : res.passed ? "QUOTA PASSED" : "QUOTA FAILED") + "</div>" + reel +
      '<div id="newBest" class="newbest hide">NEW BEST RUN!</div>' +
      '<div class="sm">credits earned: ' + sum.total + " MC &nbsp;(" + credits + ")<br>wallet: " + RUN.wallet + " MC &middot; run points: " + RUN.points + "</div></div>";
    $("recapTitle").textContent = "LEVEL REVIEW";
  } else if (prac) {
    html = '<div id="totals"><div class="lbl">PRACTICE PLANET</div>' + reel + '<div class="sm">Practice earns nothing. In a real round you keep painting planets until the clock runs out.</div></div>';
    $("recapTitle").textContent = "PRACTICE REVIEW";
  } else {
    var hist = loadJSON("tpbq_hist_arc"); if (!Array.isArray(hist)) hist = [];
    var dnow = new Date();
    hist.unshift({ t: (dnow.getMonth() + 1) + "/" + dnow.getDate() + " " + dnow.getHours() + ":" + ("0" + dnow.getMinutes()).slice(-2), k: arcadeKey(), total: sum.total, grade: sum.overall, planets: sum.planets, skipped: sum.skipped });
    hist = hist.slice(0, 40); saveJSON("tpbq_hist_arc", hist);
    best = sum.planets > 0 && arcadeBest(META, arcadeKey(), sum.total); saveMeta();
    html = '<div id="totals"><div class="lbl">ROUND SCORE</div><div class="big">' + sum.total + ' MC</div>' + reel +
      '<div id="newBest" class="newbest hide">NEW HIGH SCORE!</div><div class="sm">' + credits + "<br>best with these options: " + META.bestArc[arcadeKey()] + " MC</div></div>";
    $("recapTitle").textContent = "QUARTERLY PLANET REVIEW";
  }
  body.innerHTML = html;
  if (!round.results.length) {
    var none = document.createElement("div"); none.className = "pcard"; none.style.fontSize = "17px";
    none.textContent = "No planets finished. Legal has been notified. (Unfinished planets earn nothing.)";
    body.appendChild(none);
  }
  round.results.forEach(function (p, i) {
    var el = document.createElement("div"); el.className = "pcard"; el.id = "pc" + i;
    el.appendChild(miniPlanet(p.pic));
    var t = '<div class="pname">' + p.order.planet + "<small>for " + p.order.name + '</small></div><table><tr><td>#' + (i + 1) + '</td><td class="n">target</td><td class="n">got</td><td class="n">diff</td></tr>';
    p.rows.forEach(function (r) { t += '<tr><td style="color:' + TCOL[r.terrain] + '">' + tname(r.terrain) + '</td><td class="n">' + r.target + '%</td><td class="n">' + r.actual + '%</td><td class="n">' + r.err + "</td></tr>"; });
    t += '<tr><td colspan="3">SUM DIFF</td><td class="n">' + p.S + '</td></tr><tr><td colspan="4">base ' + p.basePay + (p.order.mult > 100 ? " x" + p.order.mult / 100 : "") + " &rarr; paid " + p.paid + (p.t2 ? " (incl. +" + p.t2 + " tier-2)" : "") + (p.steady ? " +" + p.steady : "") + (p.tip ? " +" + p.tip + " tip" : "") + " MC &middot; " + p.seconds.toFixed(1) + "s &middot; " + p.points + " pts" + (p.vip ? " (VIP: nothing below B)" : "") + "</td></tr></table>";
    var w = document.createElement("div"); w.style.flex = "1"; w.innerHTML = t; el.appendChild(w);
    var g = document.createElement("div"); g.className = "pg"; g.innerHTML = p.grade + "<small>GRADE</small>"; el.appendChild(g);
    body.appendChild(el);
  });
  var rest = document.createElement("div"), btns;
  if (spec.story) btns = !RUN.over ? '<button id="rcNext" class="pri">CONTINUE TO STORE</button>' : '<button id="rcNext" class="pri">' + (RUN.won ? "RUN COMPLETE!" : "RUN OVER") + "</button>";
  else if (prac) btns = '<button id="rcPrac" class="pri">ANOTHER PRACTICE</button><button id="rcMenu">MENU</button>';
  else btns = '<button id="rcReplay" class="pri">REPLAY</button><button id="rcMenu">MENU</button>';
  var hl = "";
  if (!spec.story && !prac) {
    var mine = (loadJSON("tpbq_hist_arc") || []).filter(function (h) { return h.k === arcadeKey(); }).slice(0, 10);
    hl = '<div class="hist">LAST ' + mine.length + " ROUNDS WITH THESE OPTIONS<br>" + mine.map(function (h) { return h.t + " &middot; " + h.total + " MC &middot; " + h.grade + " &middot; " + h.planets + " planets, " + h.skipped + " skipped"; }).join("<br>") + "</div>";
  }
  rest.innerHTML = (prac ? "" : '<div class="stats">planets finished: ' + sum.planets + " &middot; skipped: " + sum.skipped + "<br>avg seconds / planet: " + (sum.planets ? sum.avgSeconds.toFixed(1) : "-") + "</div>") +
    '<div class="rbtns">' + btns + '</div><div class="rbtns"><button id="rcMute" class="small"></button></div>' + hl;
  body.appendChild(rest);
  if ($("rcNext")) $("rcNext").onclick = function () { spinToken++; AudioSys.sfx("tap"); if (RUN.over) pageRunEnd(); else pageStore(true); };
  if ($("rcReplay")) $("rcReplay").onclick = function () { spinToken++; AudioSys.sfx("tap"); beginLevel(); };
  if ($("rcPrac")) $("rcPrac").onclick = function () { spinToken++; AudioSys.sfx("tap"); mode = "practice"; beginLevel(); };
  if ($("rcMenu")) $("rcMenu").onclick = function () { spinToken++; AudioSys.sfx("tap"); toStart(); };
  $("rcMute").onclick = function () { AudioSys.toggleMute(); muteLabels(); };
  muteLabels();
  phase = "recap"; show("recap"); body.scrollTop = 0;
  AudioSys.music("recap");
  setTimeout(function () {
    spinGrade(sum.planets ? sum.overall : "-", sum.planets ? sum.overallGi : 5, function () {
      if ($("stamp")) $("stamp").classList.remove("hide");
      if (best && $("newBest")) { $("newBest").classList.remove("hide"); setTimeout(function () { AudioSys.sfx("fanfare"); }, 900); }
    });
  }, 700);
}
$("solar").addEventListener("pointerdown", function (e) { // tap a planet -> its card
  if (!sys) return;
  var r = $("solar").getBoundingClientRect(), i = solarHit(sys, e.clientX - r.left, e.clientY - r.top);
  if (i < 0) return;
  solarSel = i; AudioSys.sfx("tap");
  var cards = document.querySelectorAll("#recapBody .pcard"), k;
  for (k = 0; k < cards.length; k++) cards[k].classList.remove("hl");
  var el = $("pc" + i); if (el) { el.classList.add("hl"); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
});

/* ----- pages: slideshows (tutorial, galaxy intros, explainers), run map, store, HQ, arcade options, run end ----- */
function page(title, html, back) {
  $("pageTitle").textContent = title; $("pageBody").innerHTML = html;
  $("pageBack").style.display = back === false ? "none" : ""; $("pageBack").onclick = function () { AudioSys.sfx("tap"); toStart(); };
  phase = "idle"; show("page"); $("pageBody").scrollTop = 0; AudioSys.init(); AudioSys.music("title");
}
// slides: [{ h, html, draw(el) }]. Always shown; a SKIP button appears once this sequence has been seen before.
function slideshow(title, slides, seenKey, done, finish) {
  var i = 0, seen = !!META.seen[seenKey];
  function end(how) { META.seen[seenKey] = true; saveMeta(); done(how); }
  function render() {
    var s = slides[i], last = i === slides.length - 1;
    var dots = slides.map(function (x, k) { return '<i class="' + (k === i ? "on" : "") + '"></i>'; }).join("");
    page(title, '<div class="dots">' + dots + '</div><div class="slcard"><h3>' + s.h + '</h3><div class="sart" id="sart"></div><div class="stext">' + s.html + "</div></div>" +
      '<div class="rbtns">' + (i > 0 ? '<button id="slBack">BACK</button>' : "") + (last && finish ? finish.map(function (f, k) { return '<button id="slF' + k + '"' + (k === 0 ? ' class="pri"' : "") + ">" + f + "</button>"; }).join("") : '<button id="slNext" class="pri">' + (last ? "START" : "NEXT") + "</button>") + "</div>" +
      (seen && !last ? '<div class="rbtns"><button id="slSkip" class="small">SKIP</button></div>' : ""), seenKey === "tutorial");
    if (s.draw) s.draw($("sart"));
    if ($("slBack")) $("slBack").onclick = function () { AudioSys.sfx("tap"); i--; render(); };
    if ($("slNext")) $("slNext").onclick = function () { AudioSys.sfx("tap"); if (last) end(0); else { i++; render(); } };
    if (finish) finish.forEach(function (f, k) { if ($("slF" + k)) $("slF" + k).onclick = function () { AudioSys.sfx("tap"); end(k); }; });
    if ($("slSkip")) $("slSkip").onclick = function () { AudioSys.sfx("tap"); end(finish ? finish.length - 1 : 0); };
  }
  render();
}
function chipRow(ids) { return '<span class="crow">' + ids.map(function (id) { return chip(id) + "<b>" + TERRAINS[id].name + "</b>"; }).join("") + "</span>"; }
function recipeLine(a, op, out) { return '<div class="rline">' + chip(a) + "<b>" + TERRAINS[a].name + "</b><em>" + op + "</em>&rarr;" + chip(out) + "<b>" + TERRAINS[out].name + "</b></div>"; }
function shapeThumbs(el, names) {
  names.forEach(function (n) {
    var g = makeGrid(26, n), c = document.createElement("canvas"), px = 26 * 2; c.width = c.height = px; c.style.width = c.style.height = "44px"; c.className = "sthumb";
    var x = c.getContext("2d"); x.fillStyle = "#f4e6c8";
    for (var i = 0; i < g.cells.length; i++) if (g.inside[i]) x.fillRect((i % 26) * 2, ((i / 26) | 0) * 2, 2, 2);
    el.appendChild(c);
  });
}
function wellArt(el, a, b, out) { // little "A + B -> well" picture
  var c = document.createElement("canvas"), d = L.dpr, w = 230, h = 92; c.width = w * d; c.height = h * d; c.style.width = w + "px"; c.style.height = h + "px";
  var x = c.getContext("2d"); x.scale(d, d);
  function card(id, cx) { x.save(); x.translate(cx, 46); drawCard(x, id, 34, 50, 1, true); x.restore(); }
  card(a, 28); if (b !== null) card(b, 84);
  x.fillStyle = POSTER() ? "#17383f" : "#e6ecff"; x.font = "900 24px sans-serif"; x.textAlign = "center"; x.fillText(b === null ? "" : "+", 56, 54); x.fillText("→", b === null ? 84 : 132, 54);
  x.save(); x.translate(190, 46); drawWell(x, out, 40, 60); x.restore();
  el.appendChild(c);
}
function botSlide(b) {
  var rec = BOT_RECIPES[b], lines = Object.keys(rec).map(function (k) { return recipeLine(+k, BOT_NAMES[b], rec[k]); }).join("");
  var notes = Object.keys(rec).filter(function (k) { return +k > 6; }).map(function (k) { var rc = recipeFor(+k); return "<br>" + TERRAINS[k].name + " is itself made: " + recipeText(+k) + "."; }).join("");
  return { h: BOT_NAMES[b] + " UNLOCKED", html: lines + '<p>Drag a terrain into your <b>WELL</b>, tap the ' + BOT_NAMES[b] + ' at the planet corner, then tap the well and paint with the result. No recipe for what is in the well? Nothing happens.' + notes + "</p>",
    draw: function (el) { var s = document.createElement("div"); s.className = "bigbot"; s.style.color = BOT_COL[b]; s.style.borderColor = BOT_COL[b]; s.innerHTML = botSVG(b); el.appendChild(s); var k = +Object.keys(rec)[0]; wellArt(el, k, null, rec[k]); } };
}
function mixSlide(id) {
  var m = MIXES.filter(function (x) { return x.id === id; })[0];
  return { h: "NEW RECIPE: " + TERRAINS[m.out].name, html: recipeLine(m.a, "+ " + TERRAINS[m.b].name, m.out) +
    "<p>Drop " + TERRAINS[m.a].name + " and " + TERRAINS[m.b].name + " into a well, in either order, and they combine into " + TERRAINS[m.out].name + ". If the second terrain is not a recipe with what is in the well, it just replaces it. Drag ERASE into a well to empty it.</p>",
    draw: function (el) { wellArt(el, m.a, m.b, m.out); } };
}
function galaxySlides(info) {
  var g = info.g, sl = [], adds = [];
  if (info.moreTerrains) adds.push("<li><b>+1 TERRAIN PER ORDER</b> (now " + info.terrains + ")</li>");
  if (info.comp) adds.push("<li><b>" + COMP_INFO[info.comp][0] + "</b> " + COMP_INFO[info.comp][1] + "</li>");
  var mixes = info.mixes || (info.mix ? [info.mix] : []);
  mixes.forEach(function (id) { var m = MIXES.filter(function (x) { return x.id === id; })[0]; adds.push("<li><b>NEW RECIPE: " + TERRAINS[m.out].name + "</b> " + TERRAINS[m.a].name + " + " + TERRAINS[m.b].name + "</li>"); });
  if (info.newTerrains.length) adds.push("<li><b>NOW ORDERED:</b> " + chipRow(info.newTerrains) + "</li>");
  if (g > 0) adds.push("<li><b>STILL IN EFFECT:</b> everything from earlier galaxies</li>");
  if (g === 0) adds = ["<li><b>" + CONFIG.galaxyTerrains[0] + " TERRAINS PER ORDER</b>, round planets in all sizes</li>", "<li><b>YOUR MIXING WELL</b> sits right of the paints. Recipes and bots arrive in later galaxies.</li>", "<li><b>" + LPG + " LEVELS</b>: " + (LPG - 1) + " normal, then a boss</li>"];
  sl.push({ h: '<small>GALAXY ' + (g + 1) + " OF " + GALAXIES + "</small>" + info.name.toUpperCase(), html: "<ul>" + adds.join("") + "</ul>",
    draw: function (el) { var c = document.createElement("canvas"); c.className = "galart"; el.appendChild(c); drawGalaxyArt(c, info); } });
  if (info.comp && info.comp.indexOf("bot:") === 0) sl.push(botSlide(info.comp.slice(4)));
  if (info.comp && info.comp.indexOf("shapes:") === 0) sl.push({ h: COMP_INFO[info.comp][0], html: "<p>" + COMP_INFO[info.comp][1] + ". Same brush, same scoring: percentages are of the planet's own squares.</p>", draw: function (el) { shapeThumbs(el, SHAPE_SETS[info.comp.slice(7)]); } });
  if (info.comp === "size") sl.push({ h: COMP_INFO.size[0], html: "<p>" + COMP_INFO.size[1] + ".</p>", draw: function (el) { shapeThumbs(el, ["circle"]); var a = el.lastChild; a.style.width = a.style.height = "28px"; shapeThumbs(el, ["circle"]); } });
  mixes.forEach(function (id) { sl.push(mixSlide(id)); });
  return sl;
}
function showGalaxy(g, then) {
  var info = RUN.galaxies[g];
  slideshow("NEW GALAXY", galaxySlides(info), "gal:" + (info.comp || "home"), function () { AudioSys.sfx("go"); then(); });
  AudioSys.sfx("fanfare");
}
function ownedText(run) {
  var b = BOTS.filter(function (x) { return run.owned.bots[x]; }).map(function (x) { return BOT_NAMES[x]; });
  var m = MIXES.filter(function (x) { return run.owned.mixes[x.id]; }).map(function (x) { return TERRAINS[x.out].name; });
  var it = []; if (run.items.brush) it.push("BRUSH +" + run.items.brush); if (run.items.time) it.push("+" + run.items.time * CONFIG.timeStackSec + " s");
  [["peek", "PEEK"], ["auto", "AUTO-FINISH"], ["steady", "STEADY PAYOUT"], ["calm", "CALM TOKEN"], ["skips", "FREE SKIPS"], ["boost", "MULTIPLIER BOOST"], ["dialSize", "SIZE DIAL"], ["dialShape", "SHAPE DIAL"], ["undo", "UNDO"], ["freeze", "TIME FREEZE"], ["bucket", "FILL BUCKET"], ["cushion", "GRADE CUSHION"], ["tip", "SPEED TIP"]].forEach(function (p) { if (run.items[p[0]]) it.push(p[1]); });
  if (run.items.shield === 1) it.push("QUOTA SHIELD"); if (run.items.shield === 2) it.push("SHIELD (used)");
  return "bots: " + (b.join(", ") || "none") + "<br>recipes: " + (m.join(", ") || "none") + "<br>items: " + (it.join(", ") || "none");
}
function modText(mods) { return mods.map(function (m) { return MOD_INFO[m][0]; }).join(" + "); }
function pageRunMap() {
  mode = "story";
  var fresh = catchUpGalaxies(RUN, CONFIG, makeRng(newSeed())); if (fresh.length) saveRun();
  var h = '<div class="wal"><div><b>' + RUN.wallet + '</b>CREDITS</div><div><b>' + RUN.points + '</b>RUN POINTS</div><div><b>' + quotaFor(RUN.level, CONFIG) + '</b>NEXT QUOTA</div></div>';
  h += '<div class="rbtns"><button id="pgGo" class="pri">START ' + (levelInfo(RUN.level).boss ? "BOSS" : "LEVEL " + (levelInfo(RUN.level).l + 1)) + "</button></div>";
  h += '<div class="note">' + ownedText(RUN) + "</div>";
  for (var l = 0; l < LEVELS; l++) {
    var li = levelInfo(l), mods = levelMods(RUN, l), known = l <= RUN.level + 1, gi = RUN.galaxies[li.g];
    if (li.l === 0) h += '<div class="gal">GALAXY ' + (li.g + 1) + " &middot; " + (gi ? gi.name.toUpperCase() : "???") + " &middot; " + CONFIG.galaxyTerrains[li.g] + " TERRAINS" + (gi && gi.comp ? "<br><small>+ " + COMP_INFO[gi.comp][0] + "</small>" : "") + "</div>";
    h += '<div class="node' + (l === RUN.level ? " cur" : l < RUN.level ? " done" : "") + (li.boss ? " boss" : "") + '"><span>' + (li.boss ? "BOSS" : "LEVEL " + (li.l + 1)) + " &middot; quota " + quotaFor(l, CONFIG) + "</span><i>" +
      (mods.length ? (known ? modText(mods) + (li.boss && RUN.items.calm ? " (CALMED)" : "") : "??? modifier") : "") + "</i></div>";
  }
  h += '<div class="rbtns"><button id="pgAb" class="small">ABANDON RUN</button></div>';
  page("RUN MAP", h);
  $("pgGo").onclick = function () { AudioSys.sfx("tap"); beginLevel(); };
  var armed = false;
  $("pgAb").onclick = function () {
    if (!armed) { armed = true; $("pgAb").textContent = "TAP AGAIN TO ABANDON"; return; }
    RUN.over = true; stockEarned = endRun(RUN, META, CONFIG); saveMeta(); saveRun(); pageRunEnd();
  };
}
function toRunMap() { // after the store: a new galaxy gets its intro first
  var g = levelInfo(RUN.level).g;
  if (!RUN.galaxies[g]) { enterGalaxy(RUN, g, CONFIG, makeRng(newSeed())); saveRun(); showGalaxy(g, pageRunMap); }
  else pageRunMap();
}
var offers = [], rerolled = false;
var QUIPS = ["Everything must go. Mostly the customers.", "Prices include tax, gravity and a modest curse.", "No refunds. No questions. Some answers.", "Buy two, get the feeling you bought two.",
  "Fresh from the cargo bay, barely scorched.", "I accept credits, compliments and small moons.", "This one fell off a freighter. Legally.", "Corporate says I have to smile. :|"];
var SHOPKEEP = { tint: 6, look: { head: 2, eyes: 3, antenna: 2 } };
function pageStore(fresh) {
  if (fresh) { offers = storeOffers(RUN, META, CONFIG, makeRng(newSeed())); rerolled = false; }
  var items = storeItems(CONFIG), q = QUIPS[(Math.random() * QUIPS.length) | 0];
  var h = '<div class="keeper"><div class="ksvg">' + alienSVG(SHOPKEEP, "k") + '</div><div class="ksay"><b>ZORGLE\'S ORBITAL BAZAAR</b>' + q + "</div></div>" +
    '<div class="wal"><div><b>' + RUN.wallet + '</b>CREDITS</div><div><b>' + RUN.points + '</b>RUN POINTS</div></div><div class="tower">';
  if (!offers.length) h += '<div class="note">Nothing left to sell you. Remarkable.</div>';
  offers.forEach(function (id, i) {
    var it = items.filter(function (x) { return x.id === id; })[0], can = itemEligible(RUN, id, CONFIG, META);
    h += '<div class="stall s' + (i % 4) + (can ? "" : " sold") + '"><div class="awn"></div><div class="sbody"><div class="sicon">' + storeIcon(id) + '</div><div class="it"><b>' + it.name + "</b><small>" + it.desc + '</small></div><button data-buy="' + i + '"' + (!can || RUN.wallet < it.price ? " disabled" : "") + ">" + (can ? it.price + " MC" : "SOLD") + "</button></div></div>";
  });
  h += '</div><div class="rbtns">' + (META.hq.reroll && !rerolled ? '<button id="pgRe" class="small">FREE REROLL</button>' : "") + '<button id="pgGo" class="pri">CONTINUE</button></div><div class="note">' + ownedText(RUN) + "</div>";
  page("STORE", h, false);
  $("pageTitle").innerHTML = '<span class="ticon">' + storeIcon("shop") + "</span>STORE";
  Array.prototype.forEach.call(document.querySelectorAll("[data-buy]"), function (b) {
    b.onclick = function () { if (buyItem(RUN, offers[+b.getAttribute("data-buy")], CONFIG, META)) { AudioSys.sfx("coin"); saveRun(); pageStore(false); } else AudioSys.sfx("bonk"); };
  });
  if ($("pgRe")) $("pgRe").onclick = function () { rerolled = true; offers = storeOffers(RUN, META, CONFIG, makeRng(newSeed())); AudioSys.sfx("skip"); pageStore(false); };
  $("pgGo").onclick = function () { AudioSys.sfx("tap"); saveRun(); toRunMap(); };
}
function pageRunEnd() {
  var won = RUN && RUN.won, li = RUN ? levelInfo(Math.min(RUN.level, LEVELS - 1)) : { g: 0, l: 0, boss: false };
  var h = '<div class="big2">' + (won ? "ALL FOUR GALAXIES SERVED" : "RUN OVER") + '</div><div class="wal" style="margin-top:14px"><div><b>' + (RUN ? RUN.points : 0) + '</b>RUN POINTS</div><div><b>+' + stockEarned + '</b>STOCK EARNED</div><div><b>' + META.stock + "</b>STOCK</div></div>" +
    '<div class="note">' + (won ? "The board is pleased. Briefly." : "Reached galaxy " + (li.g + 1) + ", " + (li.boss ? "boss" : "level " + (li.l + 1)) + ".") + "<br>best run: " + META.best + " points &middot; runs: " + META.runs + "<br>Stock = run points / " + CONFIG.stockPerPoints + ", spent at HQ on permanent unlocks.</div>" +
    '<div class="rbtns"><button id="pgHQ" class="pri">GO TO HQ</button><button id="pgNew">NEW RUN</button></div>';
  RUN = null;
  page(won ? "VICTORY" : "RUN END", h);
  if (won) AudioSys.sfx("fanfare");
  $("pgHQ").onclick = function () { AudioSys.sfx("tap"); pageHQ(); };
  $("pgNew").onclick = function () { AudioSys.sfx("tap"); startStory(true); };
}
function pageHQ() {
  var h = '<div class="wal"><div><b>' + META.stock + '</b>STOCK</div><div><b>' + META.best + '</b>BEST RUN</div><div><b>' + META.runs + "</b>RUNS</div></div>" +
    '<div class="note">Permanent unlocks. Stock is earned at the end of every story run (won or lost).</div>';
  hqItems(CONFIG).forEach(function (it) {
    var own = !!META.hq[it.id];
    h += '<div class="pcard"><div class="it"><b>' + it.name + "</b><small>" + it.desc + '</small></div><button data-hq="' + it.id + '"' + (own || META.stock < it.price ? " disabled" : "") + ">" + (own ? "OWNED" : it.price + " STOCK") + "</button></div>";
  });
  page("HQ", h);
  Array.prototype.forEach.call(document.querySelectorAll("[data-hq]"), function (b) {
    b.onclick = function () { if (buyHQ(META, b.getAttribute("data-hq"), CONFIG)) { AudioSys.sfx("coin"); saveMeta(); pageHQ(); } else AudioSys.sfx("bonk"); };
  });
}
function pageArcade() {
  mode = "arcade";
  function row(label, key, opts, names, locked) {
    return '<div class="srow"><label>' + label + '</label><div class="choice">' + opts.map(function (o, i) {
      return '<button data-k="' + key + '" data-v="' + i + '"' + (CONFIG[key] === o ? ' class="sel"' : "") + (locked ? " disabled" : "") + ">" + names[i] + "</button>";
    }).join("") + "</div></div>";
  }
  var OPT = { arcadeCount: [3, 4, 5, 0], randomShapes: [false, true], arcadeTier2: [false, true], arcadeDialSize: [false, true], arcadeDialShape: [false, true] }, un = t2Unlocked(), bst = META.bestArc[arcadeKey()];
  var h = row("Terrains per order", "arcadeCount", OPT.arcadeCount, ["3", "4", "5", "RANDOM"]) + row("Planet shapes", "randomShapes", OPT.randomShapes, ["CIRCLE", "RANDOM"]) +
    row("Tier-2 terrains" + (un ? "" : " (reach Galaxy 2)"), "arcadeTier2", OPT.arcadeTier2, ["OFF", "ON"], !un) +
    row("Brush size dial", "arcadeDialSize", OPT.arcadeDialSize, ["OFF", "ON"]) + row("Brush shape dial", "arcadeDialShape", OPT.arcadeDialShape, ["OFF", "ON"]) +
    '<div class="wal"><div><b>' + (bst === undefined ? "-" : bst) + '</b>HIGH SCORE (THESE OPTIONS)</div></div>' +
    '<div class="note">' + (CONFIG.arcadeTier2 && un ? "Tier-2 ON: every bot and every recipe works in your well this round." : "One " + CONFIG.roundSeconds + " s round. Score = credits.") + "</div>" +
    '<div class="rbtns"><button id="pgGo" class="pri">PLAY</button></div>';
  page("ARCADE", h);
  Array.prototype.forEach.call(document.querySelectorAll("[data-k]"), function (b) {
    b.onclick = function () { var k = b.getAttribute("data-k"); CONFIG[k] = OPT[k][+b.getAttribute("data-v")]; saveJSON(CFG_KEY, CONFIG); AudioSys.sfx("tap"); pageArcade(); };
  });
  $("pgGo").onclick = function () { beginLevel(); };
}
function startStory(fresh) {
  mode = "story";
  if (RUN && !fresh) {
    var li = levelInfo(RUN.level);
    page("STORY", '<div class="note">A run is in progress: galaxy ' + (li.g + 1) + ", " + (li.boss ? "boss" : "level " + (li.l + 1)) + " &middot; " + RUN.points + " points &middot; " + RUN.wallet + ' credits.</div><div class="rbtns"><button id="pgGo" class="pri">RESUME</button><button id="pgAb">ABANDON</button></div>');
    $("pgGo").onclick = function () { AudioSys.sfx("tap"); pageRunMap(); };
    var armed = false;
    $("pgAb").onclick = function () {
      if (!armed) { armed = true; $("pgAb").textContent = "TAP AGAIN"; return; }
      RUN.over = true; stockEarned = endRun(RUN, META, CONFIG); saveMeta(); saveRun(); pageRunEnd();
    };
    return;
  }
  RUN = newRun(META, CONFIG, makeRng(newSeed())); enterGalaxy(RUN, 0, CONFIG, makeRng(newSeed())); saveRun();
  showGalaxy(0, pageRunMap);
}
/* ----- 5-step tutorial, then an optional untimed practice planet ----- */
function tutorial() {
  var gm = CONFIG.gradeMaxSum, pb = CONFIG.pointsByGrade;
  var demo = { tint: 3, look: { head: 0, eyes: 2, antenna: 1 }, slots: [{ terrain: 1, pct: 50 }, { terrain: 3, pct: 30 }, { terrain: 2, pct: 20 }] };
  var slides = [
    { h: "1 &middot; THE ORDER", html: "<p>Alien clients want tiny planets. Each one orders a mix of terrains by percentage: here, <b>50% FOREST, 30% SEA, 20% DESERT</b>. The thought bubble above them shows what the job pays.</p>",
      draw: function (el) { el.innerHTML = '<div class="tdemo"><div class="ksvg">' + alienSVG(demo, "t") + '</div><div class="tbub">' + demo.slots.map(function (s) { return '<div class="oline">' + chip(s.terrain) + '<span class="nm">' + TERRAINS[s.terrain].name + '</span><span class="pc">' + s.pct + "%</span></div>"; }).join("") + "</div></div>"; } },
    { h: "2 &middot; PAINT", html: "<p>Tap a terrain swatch at the bottom, then <b>press and hold on the planet</b> to spray it. Paint over mistakes freely. When the planet is " + CONFIG.paintFinishPct + "% covered it ships and the next client steps up. Stuck? <b>SKIP</b> them.</p>",
      draw: function (el) { var c = document.createElement("canvas"); el.appendChild(c); drawDemoPlanet(c, [1, 3, 2], 0.7); } },
    { h: "3 &middot; WELLS &amp; TIER 2", html: "<p><b>Drag</b> a swatch into the <b>WELL</b> to the right of the paints. Drop a second terrain in: if it's a recipe they combine (DESERT + SEA = BEACH), if not it replaces the first. Bots at the planet corners transform what's in the well. Tap the well to paint with it. Orders with tier-2 terrains pay up to <b>x2</b>.</p>",
      draw: function (el) { wellArt(el, 2, 3, 21); } },
    { h: "4 &middot; SCORING", html: "<p>Add up how far each percentage is off. <b>" + gm[0] + " or less = S</b>, " + gm[1] + " = A, " + gm[2] + " = B, " + gm[3] + " = C, " + gm[4] + " = D, more = F. Better grades pay more credits and earn points: S " + pb[0] + ", A " + pb[1] + ", B " + pb[2] + ", C " + pb[3] + ", D " + pb[4] + ". Grades are revealed at the end of the round.</p>",
      draw: function (el) { el.innerHTML = '<table class="ttab"><tr><td></td><td>target</td><td>got</td><td>diff</td></tr><tr><td>FOREST</td><td>50</td><td>53</td><td>3</td></tr><tr><td>SEA</td><td>30</td><td>28</td><td>2</td></tr><tr><td>DESERT</td><td>20</td><td>19</td><td>1</td></tr><tr><td><b>SUM</b></td><td></td><td></td><td><b>6 = A</b></td></tr></table>'; } },
    { h: "5 &middot; WIN &amp; HIGH SCORES", html: "<p><b>STORY:</b> " + GALAXIES + " galaxies of " + LPG + " levels. Each level is one " + CONFIG.roundSeconds + " s round with a points <b>quota</b>; miss it and the run ends. Every galaxy adds a new twist and every boss has a modifier. Spend credits in the store between levels. Your run points become <b>Stock</b> for permanent HQ unlocks.<br><b>ARCADE:</b> one round, score = credits.<br>Your best story run and arcade high score are on the main menu.</p>",
      draw: function (el) { var c = document.createElement("canvas"); c.className = "galart"; el.appendChild(c); drawGalaxyArt(c, { g: 3, comp: "size" }); } }
  ];
  slideshow("HOW TO PLAY", slides, "tutorial", function (k) { if (k === 0) { mode = "practice"; beginLevel(); } else toStart(); }, ["PRACTICE PLANET", "MENU"]);
}

/* ----- start screen / settings ----- */
var STYLE_NAMES = { chip: "CHIPTUNE", wave: "SYNTHWAVE", funk: "70s FUNK", poster: "INKED POSTER", classic: "CLASSIC NEON", a: "A CARDS", b: "B TRAY", c: "C CHIPS" };
var SETTINGS = [
  ["#", "LOOK AND SOUND"],
  ["artStyle", "Art style", ["poster", "classic"]], ["paletteLayout", "Palette layout", ["a", "b", "c"]], ["musicStyle", "Music style", MUSIC_STYLES], ["musicVolume", "Music volume 0-100"], ["sfxVolume", "SFX volume 0-100"],
  ["haptics", "Haptics (iPhone needs iOS 18+ and System Haptics on)"], ["hapticPaintMs", "  ms between paint ticks (lower = buzzier)"],
  ["#", "ROUND"],
  ["roundSeconds", "Round seconds"], ["GRID", "Planet grid: squares across", [25, 50, 75, 100]], ["GRID", "Planet grid: custom (8-200)"],
  ["canvasDiameterPct", "Max planet size % of screen width"], ["brushRadiusPct", "Brush size % of max planet"],
  ["minTargetPct", "Min target %"], ["maxTargetPct", "Max target %"], ["paintFinishPct", "Planet auto-finishes at % filled"], ["brushOffsetY", "Brush lands px above finger"],
  ["skipEnabled", "Skip enabled"], ["skipPenaltySec", "Skip time penalty sec"], ["debugLivePct", "Debug live % readout"], ["countdown", "3-2-1 countdown"],
  ["#", "SCORING"],
  ["gradeMaxSum", "gradeMaxSum S,A,B,C,D"], ["payPct", "payPct S..F"], ["bonusMC", "bonusMC S..F"], ["payRanges", "Pay ranges for 3 / 4 / 5 terrains (lo-hi)"],
  ["pointsByGrade", "Planet points S..F"], ["stockPerPoints", "Run points per 1 Stock"],
  ["#", "STORY"],
  ["quotasG1", "Galaxy 1 quotas L1-L3, boss"], ["quotasG2", "Galaxy 2 quotas"], ["quotasG3", "Galaxy 3 quotas"], ["galaxyTerrains", "Terrains per order, galaxy 1/2/3/4"],
  ["quotasG4", "Galaxy 4 quotas"], ["sizeVarRange", "Planet size % range (min, max)"],
  ["#", "TIER 2 / 3"],
  ["tier2SlotChance", "Chance a slot is tier 2/3 (0-1)"], ["tier2MultPct", "Pay % for 0,1,2,3,4+ tier-2 slots (tier 3 = 2)"], ["featuredWeight", "New-galaxy terrains: x likelier"],
  ["arcadeTier2Unlocked", "Arcade tier-2 unlocked"],
  ["#", "STORE"],
  ["storeSlots", "Store slots"], ["priceBrush", "Price: brush +15%"], ["priceTime", "Price: +10 seconds"],
  ["pricePeek", "Price: peek"], ["priceAuto", "Price: auto-finish"], ["priceSteady", "Price: steady payout"], ["priceCalm", "Price: calm token"],
  ["priceSkips", "Price: free skips"], ["priceBoost", "Price: multiplier boost"], ["priceShield", "Price: quota shield"],
  ["priceDialSize", "Price: brush size dial"], ["priceDialShape", "Price: brush shape dial"], ["priceUndo", "Price: undo"], ["priceFreeze", "Price: time freeze"],
  ["priceBucket", "Price: fill bucket"], ["priceCushion", "Price: grade cushion"], ["priceTip", "Price: speed tip"],
  ["dialMinPct", "Size dial min %"], ["dialMaxPct", "Size dial max %"], ["dialStepPct", "Size dial step %"], ["undoCount", "Undos per level"], ["freezeSec", "Freeze seconds"],
  ["tipSec", "Speed tip: under sec"], ["tipCredits", "Speed tip credits"],
  ["freeSkipCount", "Free skips per level"], ["freeSkipSec", "Seconds per free skip"], ["shieldMargin", "Quota shield covers a miss of up to"],
  ["maxBrushStacks", "Max brush stacks"], ["maxTimeStacks", "Max time stacks"],
  ["brushStackMul", "Brush multiplier per stack"], ["timeStackSec", "Seconds per time stack"], ["peekSec", "Peek seconds"], ["autoFinishPct", "Auto-finish threshold %"],
  ["#", "HQ PRICES (STOCK)"],
  ["hqSlots", "4 store slots"], ["hqReroll", "Free store reroll"], ["hqHeadStart", "Head start time"], ["hqBigBrush", "Bigger starting brush"], ["hqSuns", "Sun styles"], ["hqHats", "Alien hats"],
  ["#", "BOSS MODIFIERS"],
  ["modHidden", "Hidden order"], ["hiddenShowSec", "  % visible for sec"], ["modShrink", "Shrinking brush"], ["shrinkToPct", "  shrinks to %"],
  ["modMeteors", "Meteors"], ["meteorEverySec", "  every sec"], ["meteorWarnSec", "  warning sec"], ["meteorSizeMul", "  size x brush"],
  ["modSpin", "Spinning planet"], ["spinDegPerSec", "  degrees per sec"], ["modMirror", "Mirror brush"], ["modRush", "Rush"], ["rushSeconds", "  rush seconds"], ["modVip", "VIP"],
  ["modFickle", "Fickle client"], ["fickleShiftMin", "  shift min"], ["fickleShiftMax", "  shift max"], ["fickleOrderSec", "  assumed order length sec"],
  ["modFog", "Fog"], ["fogRadiusMul", "  visible radius x brush"], ["fogFadeSec", "  fade sec"], ["modLocked", "Locked palette"], ["lockedCount", "  terrains locked"], ["lockedEverySec", "  rotates every sec"], ["modSix", "Six terrains"]
];
var settingsFrom = "start";
function refreshStart() {
  var ab = META.bestArc[arcadeKey()];
  $("stockLine").innerHTML = "HIGH SCORES &middot; STORY <b>" + META.best + " PTS</b> &middot; ARCADE <b>" + (ab === undefined ? "-" : ab + " MC") + "</b><br><small>STOCK " + META.stock + " &middot; arcade score is for your current arcade options</small>";
  $("storyBtn").textContent = RUN ? "RESUME STORY" : "STORY";
  $("storyBtn").style.fontSize = RUN ? "20px" : "";
  $("musicBtn").textContent = "MUSIC: " + STYLE_NAMES[CONFIG.musicStyle];
  muteLabels();
}
function cfgChanged(k) {
  sanitizeConfig(); saveJSON(CFG_KEY, CONFIG);
  if (k === "musicStyle") AudioSys.restyle(); if (k === "artStyle") applyArt(); AudioSys.applyVolumes();
}
function buildSettings() {
  var box = $("setRows"); box.innerHTML = "";
  SETTINGS.forEach(function (s) {
    var k = s[0];
    if (k === "#") { var hd = document.createElement("div"); hd.className = "sech"; hd.textContent = s[1]; box.appendChild(hd); return; }
    var row = document.createElement("div"); row.className = "srow";
    var lab = document.createElement("label"); lab.textContent = s[1];
    var wrap = document.createElement("div"), inp;
    if (s[2]) { // pick-one buttons
      wrap.className = "choice";
      s[2].forEach(function (opt) {
        var b = document.createElement("button"); b.textContent = STYLE_NAMES[opt] || opt; if (CONFIG[k] === opt) b.className = "sel";
        b.onclick = function () { CONFIG[k] = opt; cfgChanged(k); AudioSys.sfx("tap"); buildSettings(); };
        wrap.appendChild(b);
      });
    } else if (typeof CONFIG_DEFAULTS[k] === "boolean") {
      inp = document.createElement("input"); inp.type = "checkbox"; inp.checked = CONFIG[k];
      inp.onchange = function () { CONFIG[k] = inp.checked; cfgChanged(k); };
      wrap.appendChild(inp);
    } else {
      inp = document.createElement("input"); inp.type = "text"; inp.value = fmt(k); inp.autocomplete = "off";
      if (!Array.isArray(CONFIG_DEFAULTS[k])) inp.inputMode = "decimal";
      inp.onchange = function () {
        var v = parseSetting(k, inp.value);
        if (v !== undefined) { CONFIG[k] = v; cfgChanged(k); }
        if (k === "GRID") buildSettings(); else inp.value = fmt(k);
      };
      wrap.appendChild(inp);
    }
    row.appendChild(lab); row.appendChild(wrap); box.appendChild(row);
  });
  buildDev();
}
function buildDev() { // owner testing tools
  var d = $("devTools"), force = RUN && RUN.force;
  d.innerHTML = '<div class="sech">DEV TOOLS</div><div class="note" id="devMsg">' + (RUN ? "run: level " + (RUN.level + 1) + " of " + LEVELS + " &middot; comps: " + RUN.comps.join(", ") + " &middot; " + RUN.wallet + " credits" : "no story run in progress") + " &middot; stock " + META.stock + "</div>" +
    '<div class="devrow"><button data-d="cred">+100 CREDITS</button><button data-d="stock">+50 STOCK</button><button data-d="own">OWN ALL BOTS + RECIPES</button><button data-d="seen">RESET SEEN EXPLAINERS</button></div>' +
    '<div class="devrow"><input id="devLvl" type="text" inputmode="decimal" value="' + (RUN ? RUN.level + 1 : 1) + '"><button data-d="jump">JUMP TO LEVEL (1-' + LEVELS + ')</button></div>' +
    '<div class="note">force a boss modifier on the next level played:</div><div class="devrow">' + MODS.map(function (m) { return '<button data-f="' + m + '"' + (force === m ? ' class="pri"' : "") + ">" + MOD_INFO[m][0] + "</button>"; }).join("") + "</div>" +
    '<div class="devrow"><button data-d="rrun">RESET RUN</button><button data-d="rmeta">RESET META PROGRESS</button></div>';
  function need() { if (!RUN) { RUN = newRun(META, CONFIG, makeRng(newSeed())); enterGalaxy(RUN, 0, CONFIG, makeRng(newSeed())); } }
  var armed = false;
  Array.prototype.forEach.call(d.querySelectorAll("[data-d]"), function (b) {
    b.onclick = function () {
      var a = b.getAttribute("data-d");
      if (a === "cred") { need(); RUN.wallet += 100; }
      else if (a === "stock") { META.stock += 50; saveMeta(); }
      else if (a === "own") { need(); RUN.owned = allOwned(); }
      else if (a === "jump") { need(); RUN.level = Math.max(0, Math.min(LEVELS - 1, (parseInt($("devLvl").value, 10) || 1) - 1)); catchUpGalaxies(RUN, CONFIG, makeRng(newSeed())); }
      else if (a === "rrun") { RUN = null; }
      else if (a === "seen") { META.seen = {}; saveMeta(); }
      else if (a === "rmeta") { if (!armed) { armed = true; b.textContent = "TAP AGAIN TO WIPE STOCK + UNLOCKS"; return; } META = newMeta(); saveMeta(); }
      saveRun(); AudioSys.sfx("coin"); buildDev();
    };
  });
  Array.prototype.forEach.call(d.querySelectorAll("[data-f]"), function (b) {
    b.onclick = function () { need(); var m = b.getAttribute("data-f"); RUN.force = RUN.force === m ? null : m; saveRun(); AudioSys.sfx("tap"); buildDev(); };
  });
}
function applyArt() { // switch between the two art styles
  document.body.classList.toggle("poster", POSTER());
  texKey = ""; builtKey = ""; LY = null; if (L) L.art = null;
  layout();
}
function show(id) {
  ["start", "game", "recap", "page", "settings"].forEach(function (s) { $(s).classList.toggle("on", s === id); });
}
function fitOrder() {
  var el = $("orderText"), b = $("bubble"), W = b.clientWidth - 22, H = b.clientHeight - 14, n = round.queue[0].slots.length;
  var size = Math.min(68, Math.floor(H / n / (POSTER() ? 1.18 : 1.02)));
  el.style.fontSize = size + "px";
  while (size > 12 && (el.scrollWidth > W || el.offsetHeight > H)) { size--; el.style.fontSize = size + "px"; }
}
function updateOrderUI(slide) {
  var a = round.queue[0], n = round.queue[1];
  $("svgActive").innerHTML = alienSVG(a, "a"); $("svgNext").innerHTML = alienSVG(n, "n");
  $("custName").textContent = a.name;
  function pay(o) { return (o.basePay + o.bonus) + " MC" + (o.mult > 100 ? " x" + o.mult / 100 : ""); }
  $("payActive").textContent = pay(a); $("payNext").textContent = pay(n);
  $("orderText").innerHTML = a.slots.map(function (s) {
    return '<div class="oline">' + chip(s.terrain) + '<span class="pc">' + (hiddenShown ? "??" : s.pct) + '%</span><span class="nm" style="color:' + TCOL[s.terrain] + '">' + tname(s.terrain) + "</span></div>";
  }).join("");
  fitOrder();
  if (slide) { var el = $("aliens"); el.classList.remove("slide"); void el.offsetWidth; el.classList.add("slide"); }
}
function updateTimer() {
  var s = Math.ceil(round.timeLeft - 1e-6);
  if (s === lastSecShown) return;
  lastSecShown = s;
  var m = Math.floor(s / 60), ss = s % 60;
  $("timer").textContent = spec && spec.practice ? "--:--" : (m < 10 ? "0" : "") + m + ":" + (ss < 10 ? "0" : "") + ss;
  $("timer").classList.toggle("low", s <= 5 && phase === "play");
  if (phase === "play" && !(spec && spec.practice)) {
    if (s <= 5 && s > 0) AudioSys.sfx("tick");
    AudioSys.setTempo(s <= 10 ? 1.18 : 1);
  }
}
function flyOff(pic) { // finished planet is shipped to the client
  var f = $("fly"), pr = wrapEl.getBoundingClientRect(), mr = $("mid").getBoundingClientRect(), ar = $("svgActive").getBoundingClientRect(), D = LY.css;
  f.width = f.height = pic.width; f.style.width = f.style.height = D + "px";
  f.getContext("2d").drawImage(pic, 0, 0);
  f.style.transition = "none"; f.style.transform = "translate(" + (pr.left + pr.width / 2 - D / 2 - mr.left) + "px," + (pr.top + pr.height / 2 - D / 2 - mr.top) + "px)"; f.style.opacity = 1; f.style.display = "block";
  void f.offsetWidth;
  f.style.transition = "transform .5s cubic-bezier(.5,-0.3,.8,.4), opacity .5s ease-in";
  f.style.transform = "translate(" + (ar.left + ar.width / 2 - mr.left - D / 2) + "px," + (ar.top - mr.top - D / 2) + "px) scale(.08)";
  f.style.opacity = 0.3;
  setTimeout(function () { f.style.display = "none"; }, 530);
}
function toStart() { phase = "idle"; refreshStart(); show("start"); AudioSys.music("title"); }
function muteLabels() {
  var t = AudioSys.isMuted() ? "SOUND OFF" : "SOUND ON";
  $("muteBtn").textContent = t; if ($("rcMute")) $("rcMute").textContent = t;
}
function fmt(k) {
  var v = CONFIG[k];
  if (k === "payRanges") return v.map(function (r) { return r[0] + "-" + r[1]; }).join(", ");
  return Array.isArray(v) ? v.join(", ") : String(v);
}
function parseSetting(k, str) {
  var def = CONFIG_DEFAULTS[k], out;
  if (k === "payRanges") {
    out = str.split(",").map(function (p) { var m = /^\s*(-?\d+)\s*-\s*(-?\d+)\s*$/.exec(p); return m ? [+m[1], +m[2]] : null; });
    return out.length === def.length && out.every(function (r) { return r && r[0] <= r[1]; }) ? out : undefined;
  }
  if (Array.isArray(def)) {
    out = str.split(",").map(function (p) { return parseFloat(p); });
    return out.length === def.length && out.every(isFinite) ? out : undefined;
  }
  out = parseFloat(str); return isFinite(out) ? out : undefined;
}
function openSettings(from) { settingsFrom = from; buildSettings(); show("settings"); }

bind("storyBtn", function () { AudioSys.init(); AudioSys.sfx("tap"); startStory(false); });
bind("arcadeBtn", function () { AudioSys.init(); AudioSys.sfx("tap"); pageArcade(); });
bind("hqBtn", function () { AudioSys.init(); AudioSys.sfx("tap"); pageHQ(); });
bind("tutBtn", function () { AudioSys.init(); AudioSys.sfx("tap"); tutorial(); });
bind("gearBtn", function () { AudioSys.init(); AudioSys.music("title"); AudioSys.sfx("tap"); openSettings("start"); });
bind("muteBtn", function () { AudioSys.init(); AudioSys.toggleMute(); AudioSys.music("title"); muteLabels(); });
if ($("skip")) $("skip").addEventListener("pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); doSkip(); });
(function () { // files-out-of-sync guard: index.html and js/ must come from the same build
  var m = document.querySelector('meta[name="tpbq-build"]'), ok = m && m.getAttribute("content") === BUILD;
  $("version").textContent = ok ? VERSION : "FILES OUT OF SYNC: re-upload index.html AND the js/ folder, then reload (" + VERSION + ")";
  if (!ok) $("version").style.cssText = "color:#ff6a4a;opacity:1;max-width:300px;line-height:1.4";
})();
bind("musicBtn", function () {
  AudioSys.init(); var i = MUSIC_STYLES.indexOf(CONFIG.musicStyle); CONFIG.musicStyle = MUSIC_STYLES[(i + 1) % MUSIC_STYLES.length]; saveJSON(CFG_KEY, CONFIG);
  refreshStart(); AudioSys.music("title"); AudioSys.restyle();
});
bind("setClose", function () {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  AudioSys.sfx("tap"); refreshStart(); show(settingsFrom); layout();
});
bind("hapTest", function () { Haptic.tap(); setTimeout(function () { Haptic.confirm(); }, 400); });
bind("setReset", function () { CONFIG = clone(CONFIG_DEFAULTS); saveJSON(CFG_KEY, CONFIG); AudioSys.applyVolumes(); AudioSys.restyle(); applyArt(); buildSettings(); AudioSys.sfx("bonk"); });

/* ----- global guards ----- */
document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
$("game").addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
$("start").addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
document.addEventListener("dblclick", function (e) { e.preventDefault(); });
window.addEventListener("resize", layout);
window.addEventListener("orientationchange", function () { setTimeout(layout, 250); });

document.body.classList.toggle("poster", POSTER());
refreshStart(); layout();
requestAnimationFrame(function (t) { lastT = t; requestAnimationFrame(frame); });
