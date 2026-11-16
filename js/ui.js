"use strict";
/* ================= UI: screens, input, game loop, settings ================= */
var META = (function () {
  var d = newMeta(), m = loadJSON("tpbq_meta");
  if (m && typeof m === "object") Object.keys(d).forEach(function (k) { if (typeof m[k] === typeof d[k] && m[k] !== null) d[k] = m[k]; });
  return d;
})();
function saveMeta() { saveJSON("tpbq_meta", META); }
function validRun(r) {
  return !!r && typeof r === "object" && typeof r.level === "number" && r.level >= 0 && r.level < LEVELS && typeof r.wallet === "number" && typeof r.points === "number" &&
    r.owned && r.owned.bots && r.owned.mixes && r.items && Array.isArray(r.bossMods) && r.bossMods.length === 3 && !r.over;
}
var RUN = (function () { var r = loadJSON("tpbq_run"); return validRun(r) ? r : null; })();
function saveRun() { if (RUN && !RUN.over) saveJSON("tpbq_run", RUN); else { try { localStorage.removeItem("tpbq_run"); } catch (e) { } } }
function t2Unlocked() { return !!CONFIG.arcadeTier2Unlocked || !!META.arcadeTier2Unlocked; }
function newSeed() { return (Date.now() ^ (Math.random() * 1e9)) >>> 0; }

var mode = "arcade", spec = null, round = null, phase = "idle", lastT = 0, lastSecShown = -1, cdToken = 0;
var planetEl = $("planet"), pctx = planetEl.getContext("2d"), ghostEl = $("ghost"), gctx = ghostEl.getContext("2d"), wrapEl = $("planetWrap");
var brush = 1, botBrush = null, mixOn = false, paint = null, builtKey = "", lastHiss = 0;
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
  var tw = Math.max(28, Math.min(56, Math.floor((vw - 16 - 46 - 5 * 7) / 7))), th = Math.round(tw * 1.5);
  var changed = !L || L.vw !== vw || L.vh !== vh || L.dpr !== dpr || L.art !== CONFIG.artStyle;
  L = { dpr: dpr, vw: vw, vh: vh, D: D, Dp: Math.round(D * dpr), cw: 0, ch: 0, cwPx: D * 0.36, chPx: D * 0.54, hw: tw, hh: th, shrunk: shrunk, art: CONFIG.artStyle };
  if (changed) drawSpace();
  buildTextures();
  if (round && inGame) {
    buildLayers();
    var k = tw + ":" + th + ":" + dpr + ":" + texKey;
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

/* ----- palette: 6 base terrains + erase. Bots sit at the corners, MIX on the right. ----- */
function buildPalette() {
  var h = $("hand"), d = L.dpr; h.innerHTML = "";
  PALETTE.forEach(function (id) {
    var s = document.createElement("div"); s.className = "tile"; s.style.width = L.hw + "px"; s.style.height = L.hh + "px"; s.setAttribute("data-id", id);
    var c = document.createElement("canvas"); c.width = Math.round((L.hw + 20) * d); c.height = Math.round((L.hh + 20) * d);
    c.style.width = (L.hw + 20) + "px"; c.style.height = (L.hh + 20) + "px";
    var x = c.getContext("2d"); x.setTransform(d, 0, 0, d, c.width / 2, c.height / 2); drawCard(x, id, L.hw, L.hh, 1, true);
    var lab = document.createElement("span"); lab.textContent = id === 0 ? "ERASE" : TERRAINS[id].name;
    s.appendChild(c); s.appendChild(lab); h.appendChild(s);
    s.addEventListener("pointerdown", function (e) { e.preventDefault(); if (round && round.locked.indexOf(id) >= 0) { AudioSys.sfx("bonk"); return; } selectBrush(id, true); });
  });
  refreshBrushUI(); refreshLocked();
}
function refreshBrushUI() {
  var tiles = $("hand").children, i, col = botBrush ? BOT_COL[botBrush] : TCOL[brush];
  for (i = 0; i < tiles.length; i++) tiles[i].classList.toggle("sel", !botBrush && +tiles[i].getAttribute("data-id") === brush);
  BOTS.forEach(function (b) { $("bot_" + b).classList.toggle("sel", botBrush === b); });
  $("brush").classList.toggle("isbot", !!botBrush);
  if (botBrush) { $("brushBot").innerHTML = botSVG(botBrush); $("brushBot").style.color = col; $("brushName").textContent = BOT_NAMES[botBrush]; }
  else {
    var c = $("brushCan"), px = Math.round(60 * L.dpr), x = c.getContext("2d");
    c.width = c.height = px;
    x.save(); x.beginPath(); x.arc(px / 2, px / 2, px / 2, 0, 7); x.clip(); texDraw(x, brush, 0, 0, px, px, 0, 0, px, px); x.restore();
    c.style.borderColor = col; c.style.boxShadow = "0 0 18px " + col;
    $("brushName").textContent = (mixOn && brush ? "MIX " : "") + (brush === 0 ? "ERASE" : TERRAINS[brush].name);
  }
  $("brushName").style.color = col;
  $("mixBtn").classList.toggle("on", mixOn);
}
function selectBrush(id, sound) { brush = id; botBrush = null; refreshBrushUI(); if (sound) AudioSys.sfx("pickup"); }
function selectBot(b) { botBrush = b; refreshBrushUI(); AudioSys.sfx("pickup"); }
function refreshLocked() {
  var tiles = $("hand").children;
  for (var i = 0; i < tiles.length; i++) tiles[i].classList.toggle("locked", !!round && round.locked.indexOf(+tiles[i].getAttribute("data-id")) >= 0);
}
function setupTools() { // show only what this round owns
  BOTS.forEach(function (b) { var el = $("bot_" + b); el.classList.toggle("own", !!round.owned.bots[b]); el.innerHTML = botSVG(b); el.style.color = BOT_COL[b]; el.style.borderColor = BOT_COL[b]; });
  $("mixBtn").classList.toggle("own", Object.keys(round.owned.mixes).length > 0);
  $("peekBtn").classList.toggle("own", !!spec.peek && !peekUsed);
}
function updateHud() {
  if (spec.story) { $("hudL").textContent = "G" + (spec.g + 1) + " · " + (spec.boss ? "BOSS" : "L" + (spec.l + 1)) + " · QUOTA " + spec.quota; $("hudR").textContent = round.points + " PTS"; }
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
  spec = mode === "story" ? levelSpec(RUN, META, CONFIG) : arcadeSpec(CONFIG, t2Unlocked());
  round = createPaintRound(CONFIG, spec, makeRng(newSeed()));
  paint = null; lastSecShown = -1; builtKey = ""; LY = null; botBrush = null; mixOn = false; peekUsed = false; peekUntil = -1; hiddenShown = false; spinAng = 0; fogPts = [];
  if (brush === undefined || brush > 6) brush = 1;
  wrapEl.style.transform = "";
  show("game");
  $("skip").classList.toggle("off", !CONFIG.skipEnabled);
  $("fly").style.display = "none"; $("flash").classList.remove("go");
  layout(); setupTools(); updateOrderUI(false); updateTimer(); updateHud();
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
  if (spec.mods.length) { // boss banner before the countdown
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
function newPlanetUI(slide) { buildLayers(); renderPlanet(); refreshLocked(); updateOrderUI(slide); updateHud(); fogPts = []; if (round.mod.fog) drawFog(performance.now()); }
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
    else if (ev[i] === "meteor") { paintCells(null, round.grid.cells); renderPlanet(); AudioSys.sfx("erase"); }
    else if (ev[i] === "locked") { refreshLocked(); AudioSys.sfx("tap"); }
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
    try { mid.setPointerCapture(e.pointerId); } catch (err) { }
    paint = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, c: wrapCentre() };
  });
  mid.addEventListener("pointermove", function (e) { if (paint && e.pointerId === paint.id) { paint.x = e.clientX; paint.y = e.clientY; } });
  function stop(e) {
    if (!paint || e.pointerId !== paint.id) return;
    try { mid.releasePointerCapture(e.pointerId); } catch (err) { }
    paint = null; if (pendingLayout) layout();
  }
  mid.addEventListener("pointerup", stop); mid.addEventListener("pointercancel", stop);
  BOTS.forEach(function (b) {
    $("bot_" + b).addEventListener("pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); if (phase === "play" || phase === "countdown") selectBot(b); });
  });
  var mx = $("mixBtn");
  mx.addEventListener("pointerdown", function (e) {
    e.preventDefault(); e.stopPropagation();
    mixOn = CONFIG.mixMode === "hold" ? true : !mixOn; if (botBrush) botBrush = null; refreshBrushUI(); AudioSys.sfx("tap");
  });
  function mixUp(e) { if (CONFIG.mixMode === "hold" && mixOn) { mixOn = false; refreshBrushUI(); } }
  mx.addEventListener("pointerup", mixUp); mx.addEventListener("pointercancel", mixUp); mx.addEventListener("pointerleave", mixUp);
  $("peekBtn").addEventListener("pointerdown", function (e) {
    e.preventDefault(); e.stopPropagation();
    if (phase !== "play" || peekUsed) return;
    peekUsed = true; peekUntil = round.elapsed + CONFIG.peekSec; $("peekBtn").classList.remove("own"); AudioSys.sfx("coin");
  });
})();
function doSpray(now) {
  var off = CONFIG.brushOffsetY, a = toGrid(paint.c, paint.lx, paint.ly - off), b = toGrid(paint.c, paint.x, paint.y - off), rad = brushRad(round), G = round.grid.G;
  var dist = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y)), steps = Math.max(1, Math.ceil(dist / Math.max(0.5, rad * 0.4))), changed = [], s, c, k, px, py;
  var opt = botBrush ? { bot: botBrush } : mixOn ? { mix: true } : null;
  for (s = 1; s <= steps; s++) {
    px = a.x + (b.x - a.x) * s / steps; py = a.y + (b.y - a.y) * s / steps;
    c = paintSpray(round, px, py, rad, brush, opt); for (k = 0; k < c.length; k++) changed.push(c[k]);
    if (round.mod.mirror) { c = paintSpray(round, G - px, py, rad, brush, opt); for (k = 0; k < c.length; k++) changed.push(c[k]); }
  }
  paint.lx = paint.x; paint.ly = paint.y;
  if (round.mod.fog) { var lp = fogPts[fogPts.length - 1]; if (lp && Math.abs(lp.x - b.x) + Math.abs(lp.y - b.y) < rad * 0.5) lp.t = now; else fogPts.push({ x: b.x, y: b.y, t: now }); }
  if (!changed.length) return;
  if (now - lastHiss > 90) { lastHiss = now; AudioSys.sfx(brush === 0 || botBrush ? "rot" : "spray", 3); }
  paintCells(changed, round.grid.cells);
  var fin = paintFinishIfDone(round);
  if (fin) { // finished: ship it (no grade until the review) and bring in the next customer's planet
    paintCells(null, fin.cells); renderPlanet(); fin.pic = snapshot(); flyOff(fin.pic);
    paint = null; newPlanetUI(true);
    shipped(fin); AudioSys.sfx("ship");
    setTimeout(function () { AudioSys.sfx("chatter"); }, 420);
    return;
  }
  renderPlanet();
}
function drawCursor() {
  var d = L ? L.dpr : 1;
  gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, ghostEl.width, ghostEl.height);
  if (!L || phase !== "play" || !LY) return;
  gctx.setTransform(d, 0, 0, d, 0, 0);
  var cell = LY.S / L.dpr, rad = brushRad(round) * cell, c;
  if (round.meteor) { // incoming!
    c = wrapCentre(); var m = round.meteor, p = toScreen(c, m.cx, m.cy);
    gctx.strokeStyle = "#ff4a2a"; gctx.lineWidth = 4; gctx.setLineDash([7, 6]); gctx.beginPath(); gctx.arc(p.x, p.y, m.rad * cell, 0, 7); gctx.stroke(); gctx.setLineDash([]);
    gctx.fillStyle = "rgba(255,74,42,.25)"; gctx.fill();
  }
  if (!paint) return;
  var x = paint.x, y = paint.y - CONFIG.brushOffsetY, col = botBrush ? BOT_COL[botBrush] : TCOL[brush];
  function ring(X, Y) {
    gctx.strokeStyle = "rgba(5,6,15,.8)"; gctx.lineWidth = 4; gctx.beginPath(); gctx.arc(X, Y, rad, 0, 7); gctx.stroke();
    gctx.strokeStyle = col; gctx.lineWidth = 2; gctx.beginPath(); gctx.arc(X, Y, rad, 0, 7); gctx.stroke();
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
    updateTimer();
    if (round.over) endRound();
  } else if (phase === "recap" && sys && $("recap").classList.contains("on")) { solarT += dt; drawSolar($("solar"), sys, solarT, solarSel); }
  drawCursor();
  requestAnimationFrame(frame);
}

/* ----- results: solar system on top, then the level summary and the planet-by-planet review ----- */
function miniPlanet(pic) {
  var c = document.createElement("canvas"); c.width = pic.width; c.height = pic.height; c.style.width = c.style.height = "84px";
  c.getContext("2d").drawImage(pic, 0, 0); return c;
}
function arcadeKey() { return (CONFIG.arcadeCount || "R") + (CONFIG.randomShapes ? "S" : "C") + (spec && spec.tier2 ? "T" : ""); }
function showResults() {
  var sum = summarizeRound(round), body = $("recapBody"), html = "", res = null, lvl = "";
  sys = makeSystem(round.results, makeRng(newSeed()), !!META.hq.suns); solarT = 0; solarSel = -1; stockEarned = 0;
  var credits = "pay " + sum.payments + " MC &nbsp;" + (sum.bonus >= 0 ? "+" : "&minus;") + " " + Math.abs(sum.bonus) + " grade bonus" + (sum.t2 ? " &nbsp;(incl. " + sum.t2 + " tier-2 bonus)" : "") + (sum.steady ? " &nbsp;+ " + sum.steady + " steady payout" : "");
  if (spec.story) {
    lvl = "GALAXY " + (spec.g + 1) + " &middot; " + (spec.boss ? "BOSS" : "LEVEL " + (spec.l + 1));
    res = finishLevel(RUN, sum, CONFIG);
    if (RUN.level >= 5 && !META.arcadeTier2Unlocked) { META.arcadeTier2Unlocked = true; saveMeta(); }
    if (RUN.over) { stockEarned = endRun(RUN, META, CONFIG); saveMeta(); }
    saveRun();
    html = '<div id="totals"><div class="lbl">' + lvl + '</div><div class="big">' + sum.points + " / " + res.quota + ' PTS</div>' +
      '<div class="stamp ' + (res.passed ? "pass" : "fail") + '">' + (res.passed ? "QUOTA PASSED" : "QUOTA FAILED") + "</div>" +
      '<div class="og">OVERALL GRADE <b>' + sum.overall + '</b></div><div class="sm">credits earned: ' + sum.total + " MC &nbsp;(" + credits + ")<br>wallet: " + RUN.wallet + " MC &middot; run points: " + RUN.points + "</div></div>";
    $("recapTitle").textContent = "LEVEL REVIEW";
  } else {
    var hist = loadJSON("tpbq_hist_arc"); if (!Array.isArray(hist)) hist = [];
    var dnow = new Date();
    hist.unshift({ t: (dnow.getMonth() + 1) + "/" + dnow.getDate() + " " + dnow.getHours() + ":" + ("0" + dnow.getMinutes()).slice(-2), k: arcadeKey(), total: sum.total, grade: sum.overall, planets: sum.planets, skipped: sum.skipped });
    hist = hist.slice(0, 40); saveJSON("tpbq_hist_arc", hist);
    html = '<div id="totals"><div class="lbl">ROUND SCORE</div><div class="big">' + sum.total + ' MC</div><div class="og">OVERALL GRADE <b>' + sum.overall + '</b></div><div class="sm">' + credits + "</div></div>";
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
    var t = '<div class="pname">' + p.order.planet + "<small>for " + p.order.name + '</small></div><table><tr><td>#' + (i + 1) + '</td><td class="n">want</td><td class="n">got</td><td class="n">diff</td></tr>';
    p.rows.forEach(function (r) { t += '<tr><td style="color:' + TCOL[r.terrain] + '">' + tname(r.terrain) + '</td><td class="n">' + r.target + '%</td><td class="n">' + r.actual + '%</td><td class="n">' + r.err + "</td></tr>"; });
    t += '<tr><td colspan="3">SUM DIFF</td><td class="n">' + p.S + '</td></tr><tr><td colspan="4">base ' + p.basePay + " &rarr; paid " + p.paid + (p.t2 ? " (incl. +" + p.t2 + " tier-2)" : "") + (p.steady ? " +" + p.steady : "") + " MC &middot; " + p.seconds.toFixed(1) + "s &middot; " + p.points + " pts" + (p.vip ? " (VIP: nothing below B)" : "") + "</td></tr></table>";
    var w = document.createElement("div"); w.style.flex = "1"; w.innerHTML = t; el.appendChild(w);
    var g = document.createElement("div"); g.className = "pg"; g.innerHTML = p.grade + "<small>GRADE</small>"; el.appendChild(g);
    body.appendChild(el);
  });
  var rest = document.createElement("div"), btns;
  if (spec.story) btns = !RUN.over ? '<button id="rcNext" class="pri">CONTINUE TO STORE</button>' : '<button id="rcNext" class="pri">' + (RUN.won ? "RUN COMPLETE!" : "RUN OVER") + "</button>";
  else btns = '<button id="rcReplay" class="pri">REPLAY</button><button id="rcMenu">MENU</button>';
  var hl = "";
  if (!spec.story) {
    var mine = (loadJSON("tpbq_hist_arc") || []).filter(function (h) { return h.k === arcadeKey(); }).slice(0, 10);
    hl = '<div class="hist">LAST ' + mine.length + " ROUNDS WITH THESE OPTIONS<br>" + mine.map(function (h) { return h.t + " &middot; " + h.total + " MC &middot; " + h.grade + " &middot; " + h.planets + " planets, " + h.skipped + " skipped"; }).join("<br>") + "</div>";
  }
  rest.innerHTML = '<div class="stats">planets finished: ' + sum.planets + " &middot; skipped: " + sum.skipped + "<br>avg seconds / planet: " + (sum.planets ? sum.avgSeconds.toFixed(1) : "-") + "</div>" +
    '<div class="rbtns">' + btns + '</div><div class="rbtns"><button id="rcMute" class="small"></button></div>' + hl;
  body.appendChild(rest);
  if ($("rcNext")) $("rcNext").onclick = function () { AudioSys.sfx("tap"); if (RUN.over) pageRunEnd(); else pageStore(true); };
  if ($("rcReplay")) $("rcReplay").onclick = function () { AudioSys.sfx("tap"); beginLevel(); };
  if ($("rcMenu")) $("rcMenu").onclick = function () { AudioSys.sfx("tap"); toStart(); };
  $("rcMute").onclick = function () { AudioSys.toggleMute(); muteLabels(); };
  muteLabels();
  phase = "recap"; show("recap"); body.scrollTop = 0;
  AudioSys.sfx("grade", sum.planets ? sum.overallGi : 5);
  AudioSys.music("recap");
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

/* ----- pages: run map, store, HQ, arcade options, run end ----- */
function page(title, html, back) {
  $("pageTitle").textContent = title; $("pageBody").innerHTML = html;
  $("pageBack").style.display = back === false ? "none" : ""; $("pageBack").onclick = function () { AudioSys.sfx("tap"); toStart(); };
  phase = "idle"; show("page"); $("pageBody").scrollTop = 0; AudioSys.init(); AudioSys.music("title");
}
function ownedText(run) {
  var b = BOTS.filter(function (x) { return run.owned.bots[x]; }).map(function (x) { return BOT_NAMES[x]; });
  var m = MIXES.filter(function (x) { return run.owned.mixes[x.id]; }).map(function (x) { return TERRAINS[x.out].name; });
  var it = []; if (run.items.brush) it.push("BRUSH +" + run.items.brush); if (run.items.time) it.push("+" + run.items.time * CONFIG.timeStackSec + " s");
  if (run.items.peek) it.push("PEEK"); if (run.items.auto) it.push("AUTO-FINISH"); if (run.items.steady) it.push("STEADY PAYOUT");
  return "bots: " + (b.join(", ") || "none") + "<br>mix recipes: " + (m.join(", ") || "none") + "<br>items: " + (it.join(", ") || "none");
}
function modText(mods) { return mods.map(function (m) { return MOD_INFO[m][0]; }).join(" + "); }
function pageRunMap() {
  mode = "story";
  var h = '<div class="wal"><div><b>' + RUN.wallet + '</b>CREDITS</div><div><b>' + RUN.points + '</b>RUN POINTS</div><div><b>' + quotaFor(RUN.level, CONFIG) + '</b>NEXT QUOTA</div></div>';
  h += '<div class="rbtns"><button id="pgGo" class="pri">START ' + (levelInfo(RUN.level).boss ? "BOSS" : "LEVEL " + (RUN.level + 1)) + "</button></div>";
  h += '<div class="note">' + ownedText(RUN) + "</div>";
  for (var l = 0; l < LEVELS; l++) {
    var li = levelInfo(l), mods = levelMods(RUN, l), known = l <= RUN.level + 1;
    if (li.l === 0) h += '<div class="gal">GALAXY ' + (li.g + 1) + " &middot; " + CONFIG.galaxyTerrains[li.g] + " TERRAINS" + "</div>";
    h += '<div class="node' + (l === RUN.level ? " cur" : l < RUN.level ? " done" : "") + (li.boss ? " boss" : "") + '"><span>' + (li.boss ? "BOSS" : "LEVEL " + (li.l + 1)) + " &middot; quota " + quotaFor(l, CONFIG) + "</span><i>" +
      (mods.length ? (known ? modText(mods) : "??? modifier") : "") + "</i></div>";
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
var offers = [], rerolled = false;
function pageStore(fresh) {
  if (fresh) { offers = storeOffers(RUN, META, CONFIG, makeRng(newSeed())); rerolled = false; }
  var items = storeItems(CONFIG), h = '<div class="wal"><div><b>' + RUN.wallet + '</b>CREDITS</div><div><b>' + RUN.points + '</b>RUN POINTS</div></div>';
  if (!offers.length) h += '<div class="note">Nothing left to sell you. Remarkable.</div>';
  offers.forEach(function (id, i) {
    var it = items.filter(function (x) { return x.id === id; })[0], can = itemEligible(RUN, id, CONFIG);
    h += '<div class="pcard"><div class="it"><b>' + it.name + "</b><small>" + it.desc + '</small></div><button data-buy="' + i + '"' + (!can || RUN.wallet < it.price ? " disabled" : "") + ">" + (can ? it.price + " MC" : "SOLD") + "</button></div>";
  });
  h += '<div class="rbtns">' + (META.hq.reroll && !rerolled ? '<button id="pgRe" class="small">FREE REROLL</button>' : "") + '<button id="pgGo" class="pri">CONTINUE</button></div><div class="note">' + ownedText(RUN) + "</div>";
  page("STORE", h, false);
  Array.prototype.forEach.call(document.querySelectorAll("[data-buy]"), function (b) {
    b.onclick = function () { if (buyItem(RUN, offers[+b.getAttribute("data-buy")], CONFIG)) { AudioSys.sfx("coin"); saveRun(); pageStore(false); } else AudioSys.sfx("bonk"); };
  });
  if ($("pgRe")) $("pgRe").onclick = function () { rerolled = true; offers = storeOffers(RUN, META, CONFIG, makeRng(newSeed())); AudioSys.sfx("skip"); pageStore(false); };
  $("pgGo").onclick = function () { AudioSys.sfx("tap"); saveRun(); pageRunMap(); };
}
function pageRunEnd() {
  var won = RUN && RUN.won, li = RUN ? levelInfo(Math.min(RUN.level, LEVELS - 1)) : { g: 0, l: 0 };
  var h = '<div class="big2">' + (won ? "ALL THREE GALAXIES SERVED" : "RUN OVER") + '</div><div class="wal" style="margin-top:14px"><div><b>' + (RUN ? RUN.points : 0) + '</b>RUN POINTS</div><div><b>+' + stockEarned + '</b>STOCK EARNED</div><div><b>' + META.stock + "</b>STOCK</div></div>" +
    '<div class="note">' + (won ? "The board is pleased. Briefly." : "Reached galaxy " + (li.g + 1) + ", " + (li.l === 4 ? "boss" : "level " + (li.l + 1)) + ".") + "<br>best run: " + META.best + " points &middot; runs: " + META.runs + "<br>Stock = run points / " + CONFIG.stockPerPoints + ", spent at HQ on permanent unlocks.</div>" +
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
  var OPT = { arcadeCount: [3, 4, 5, 0], randomShapes: [false, true], arcadeTier2: [false, true] }, un = t2Unlocked();
  var h = row("Terrains per order", "arcadeCount", OPT.arcadeCount, ["3", "4", "5", "RANDOM"]) + row("Planet shapes", "randomShapes", OPT.randomShapes, ["CIRCLE", "RANDOM"]) +
    row("Tier-2 terrains" + (un ? "" : " (reach Galaxy 2)"), "arcadeTier2", OPT.arcadeTier2, ["OFF", "ON"], !un) +
    '<div class="note">' + (CONFIG.arcadeTier2 && un ? "Tier-2 ON: every bot and every MIX recipe is yours for the round." : "One " + CONFIG.roundSeconds + " s round. Score = credits.") + "</div>" +
    '<div class="rbtns"><button id="pgGo" class="pri">PLAY</button></div>';
  page("ARCADE", h);
  Array.prototype.forEach.call(document.querySelectorAll("[data-k]"), function (b) {
    b.onclick = function () { var k = b.getAttribute("data-k"); CONFIG[k] = OPT[k][+b.getAttribute("data-v")]; saveJSON("tpbq_cfg_main2", CONFIG); AudioSys.sfx("tap"); pageArcade(); };
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
  RUN = newRun(META, CONFIG, makeRng(newSeed())); saveRun(); pageRunMap();
}

/* ----- start screen / settings ----- */
var STYLE_NAMES = { chip: "CHIPTUNE", wave: "SYNTHWAVE", funk: "70s FUNK", poster: "INKED POSTER", classic: "CLASSIC NEON", toggle: "TAP TOGGLE", hold: "HOLD" };
var SETTINGS = [
  ["#", "LOOK AND SOUND"],
  ["artStyle", "Art style", ["poster", "classic"]], ["musicStyle", "Music style", MUSIC_STYLES], ["musicVolume", "Music volume 0-100"], ["sfxVolume", "SFX volume 0-100"],
  ["#", "ROUND"],
  ["roundSeconds", "Round seconds"], ["GRID", "Planet grid: squares across", [25, 50, 75, 100]], ["GRID", "Planet grid: custom (8-200)"],
  ["canvasDiameterPct", "Max planet size % of screen width"], ["brushRadiusPct", "Brush size % of max planet"],
  ["minTargetPct", "Min target %"], ["maxTargetPct", "Max target %"], ["paintFinishPct", "Planet auto-finishes at % filled"], ["brushOffsetY", "Brush lands px above finger"],
  ["skipEnabled", "Skip enabled"], ["skipPenaltySec", "Skip time penalty sec"], ["debugLivePct", "Debug live % readout"], ["countdown", "3-2-1 countdown"],
  ["#", "SCORING"],
  ["gradeMaxSum", "gradeMaxSum S,A,B,C,D"], ["payPct", "payPct S..F"], ["bonusMC", "bonusMC S..F"], ["payRanges", "Pay ranges for 3 / 4 / 5 terrains (lo-hi)"],
  ["pointsByGrade", "Planet points S..F"], ["stockPerPoints", "Run points per 1 Stock"],
  ["#", "STORY"],
  ["quotasG1", "Galaxy 1 quotas L1-L4, boss"], ["quotasG2", "Galaxy 2 quotas"], ["quotasG3", "Galaxy 3 quotas"], ["galaxyTerrains", "Terrains per order, galaxy 1/2/3"],
  ["sizeRangeG1", "Galaxy 1 planet size % (min, max)"], ["sizeRangeG2", "Galaxy 2 planet size %"], ["sizeRangeG3", "Galaxy 3 planet size %"],
  ["#", "TIER 2 / 3"],
  ["tier2SlotChance", "Chance a slot is tier 2/3 (0-1)"], ["tier2Bonus", "Tier-2 bonus credits per slot"], ["tier3Bonus", "Tier-3 bonus credits per slot"], ["mixMode", "MIX button", ["toggle", "hold"]],
  ["arcadeTier2Unlocked", "Arcade tier-2 unlocked"],
  ["#", "STORE"],
  ["storeSlots", "Store slots"], ["priceBot", "Price: bot"], ["priceMix", "Price: mix recipe"], ["priceBrush", "Price: brush +15%"], ["priceTime", "Price: +10 seconds"],
  ["pricePeek", "Price: peek"], ["priceAuto", "Price: auto-finish"], ["priceSteady", "Price: steady payout"], ["maxBrushStacks", "Max brush stacks"], ["maxTimeStacks", "Max time stacks"],
  ["brushStackMul", "Brush multiplier per stack"], ["timeStackSec", "Seconds per time stack"], ["peekSec", "Peek seconds"], ["autoFinishPct", "Auto-finish threshold %"],
  ["#", "HQ PRICES (STOCK)"],
  ["hqStartBot", "Starting bot (each)"], ["hqSlots", "4 store slots"], ["hqReroll", "Free store reroll"], ["hqHeadStart", "Head start time"], ["hqBigBrush", "Bigger starting brush"], ["hqSuns", "Sun styles"], ["hqHats", "Alien hats"],
  ["#", "BOSS MODIFIERS"],
  ["modHidden", "Hidden order"], ["hiddenShowSec", "  % visible for sec"], ["modShrink", "Shrinking brush"], ["shrinkToPct", "  shrinks to %"],
  ["modMeteors", "Meteors"], ["meteorEverySec", "  every sec"], ["meteorWarnSec", "  warning sec"], ["meteorSizeMul", "  size x brush"],
  ["modSpin", "Spinning planet"], ["spinDegPerSec", "  degrees per sec"], ["modMirror", "Mirror brush"], ["modRush", "Rush"], ["rushSeconds", "  rush seconds"], ["modVip", "VIP"],
  ["modFickle", "Fickle client"], ["fickleShiftMin", "  shift min"], ["fickleShiftMax", "  shift max"], ["fickleOrderSec", "  assumed order length sec"],
  ["modFog", "Fog"], ["fogRadiusMul", "  visible radius x brush"], ["fogFadeSec", "  fade sec"], ["modLocked", "Locked palette"], ["lockedCount", "  terrains locked"], ["lockedEverySec", "  rotates every sec"]
];
var settingsFrom = "start";
function refreshStart() {
  $("stockLine").textContent = "STOCK " + META.stock + " · BEST RUN " + META.best + " PTS";
  $("storyBtn").textContent = RUN ? "RESUME STORY" : "STORY";
  $("storyBtn").style.fontSize = RUN ? "20px" : "";
  $("musicBtn").textContent = "MUSIC: " + STYLE_NAMES[CONFIG.musicStyle];
  muteLabels();
}
function cfgChanged(k) {
  sanitizeConfig(); saveJSON("tpbq_cfg_main2", CONFIG);
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
  d.innerHTML = '<div class="sech">DEV TOOLS</div><div class="note" id="devMsg">' + (RUN ? "run: level " + (RUN.level + 1) + " of 15 &middot; " + RUN.wallet + " credits" : "no story run in progress") + " &middot; stock " + META.stock + "</div>" +
    '<div class="devrow"><button data-d="cred">+100 CREDITS</button><button data-d="stock">+50 STOCK</button><button data-d="own">OWN ALL BOTS + RECIPES</button></div>' +
    '<div class="devrow"><input id="devLvl" type="text" inputmode="decimal" value="' + (RUN ? RUN.level + 1 : 1) + '"><button data-d="jump">JUMP TO LEVEL (1-15)</button></div>' +
    '<div class="note">force a boss modifier on the next level played:</div><div class="devrow">' + MODS.map(function (m) { return '<button data-f="' + m + '"' + (force === m ? ' class="pri"' : "") + ">" + MOD_INFO[m][0] + "</button>"; }).join("") + "</div>" +
    '<div class="devrow"><button data-d="rrun">RESET RUN</button><button data-d="rmeta">RESET META PROGRESS</button></div>';
  function need() { if (!RUN) { RUN = newRun(META, CONFIG, makeRng(newSeed())); } }
  var armed = false;
  Array.prototype.forEach.call(d.querySelectorAll("[data-d]"), function (b) {
    b.onclick = function () {
      var a = b.getAttribute("data-d");
      if (a === "cred") { need(); RUN.wallet += 100; }
      else if (a === "stock") { META.stock += 50; saveMeta(); }
      else if (a === "own") { need(); RUN.owned = allOwned(); }
      else if (a === "jump") { need(); RUN.level = Math.max(0, Math.min(LEVELS - 1, (parseInt($("devLvl").value, 10) || 1) - 1)); }
      else if (a === "rrun") { RUN = null; }
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
  $("payActive").textContent = (a.basePay + a.bonus) + " MC"; $("payNext").textContent = (n.basePay + n.bonus) + " MC";
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
  $("timer").textContent = (m < 10 ? "0" : "") + m + ":" + (ss < 10 ? "0" : "") + ss;
  $("timer").classList.toggle("low", s <= 5 && phase === "play");
  if (phase === "play") {
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

$("storyBtn").onclick = function () { AudioSys.init(); AudioSys.sfx("tap"); startStory(false); };
$("arcadeBtn").onclick = function () { AudioSys.init(); AudioSys.sfx("tap"); pageArcade(); };
$("hqBtn").onclick = function () { AudioSys.init(); AudioSys.sfx("tap"); pageHQ(); };
$("gearBtn").onclick = function () { AudioSys.init(); AudioSys.music("title"); AudioSys.sfx("tap"); openSettings("start"); };
$("muteBtn").onclick = function () { AudioSys.init(); AudioSys.toggleMute(); AudioSys.music("title"); muteLabels(); };
$("skip").addEventListener("pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); doSkip(); });
$("version").textContent = VERSION;
$("musicBtn").onclick = function () {
  AudioSys.init(); var i = MUSIC_STYLES.indexOf(CONFIG.musicStyle); CONFIG.musicStyle = MUSIC_STYLES[(i + 1) % MUSIC_STYLES.length]; saveJSON("tpbq_cfg_main2", CONFIG);
  refreshStart(); AudioSys.music("title"); AudioSys.restyle();
};
$("setClose").onclick = function () {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  AudioSys.sfx("tap"); refreshStart(); show(settingsFrom); layout();
};
$("setReset").onclick = function () { CONFIG = clone(CONFIG_DEFAULTS); saveJSON("tpbq_cfg_main2", CONFIG); AudioSys.applyVolumes(); AudioSys.restyle(); applyArt(); buildSettings(); AudioSys.sfx("bonk"); };

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
