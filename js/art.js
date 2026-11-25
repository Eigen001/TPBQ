"use strict";
/* ================= ART: everything is painted procedurally on canvas (no image files) ================= */
function $(id) { return document.getElementById(id); }
var INK = "#05060f";
var TCOL = ["#b48cff", "#2fbf5a", "#f0b22a", "#3f7dff", "#19c3d6", "#cdf5a8", "#ff5a3c"]; // order-text colours per terrain
var TEX = [], texKey = "", chipURL = {}, L = null;
var paintC = document.createElement("canvas"), pendingLayout = false;

function rgb(c) { return "rgb(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + ")"; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function fillGrad(x, S, a, b) { var g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(0, 0, S, S); }
function sparkle(x, X, Y, r, col) {
  x.fillStyle = col; x.beginPath();
  x.moveTo(X, Y - r); x.quadraticCurveTo(X, Y, X + r, Y); x.quadraticCurveTo(X, Y, X, Y + r); x.quadraticCurveTo(X, Y, X - r, Y); x.quadraticCurveTo(X, Y, X, Y - r); x.fill();
}

/* ----- terrain paintings (S x S css px, seeded) ----- */
var PAINT = [];
PAINT[0] = function (x, S, r) { // the void (eraser)
  var cx = L.cwPx / 2, cy = L.chPx / 2, g = x.createRadialGradient(cx, cy, 2, cx, cy, S * 0.7), k, a;
  g.addColorStop(0, "#000"); g.addColorStop(0.3, "#2c0f66"); g.addColorStop(1, "#0a0420"); x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.lineCap = "round";
  for (k = 0; k < 3; k++) {
    x.beginPath();
    for (a = 0; a < Math.PI * 5; a += 0.15) { var rad = 3 + a * 6, px = cx + Math.cos(a + k * 2.1) * rad, py = cy + Math.sin(a + k * 2.1) * rad; if (a === 0) x.moveTo(px, py); else x.lineTo(px, py); }
    x.strokeStyle = "rgba(205,150,255," + (0.6 - k * 0.14) + ")"; x.lineWidth = 2.6 - k * 0.6; x.stroke();
  }
  for (k = 0; k < 50; k++) sparkle(x, r() * S, r() * S, 1 + r() * 2.2, "rgba(255,255,255," + (0.4 + r() * 0.6) + ")");
};
PAINT[1] = function (x, S, r) { // forest: plump shaded canopies
  fillGrad(x, S, "#1f7a3c", "#083f20");
  var pts = [], row = 0, gy, gx;
  for (gy = -4; gy < S + 12; gy += 13, row++) for (gx = -8; gx < S + 12; gx += 16) pts.push([gx + (row % 2) * 8 + r() * 6 - 3, gy + r() * 5 - 2.5, 7.5 + r() * 3.5]);
  pts.forEach(function (p) {
    var X = p[0], Y = p[1], R = p[2];
    x.fillStyle = "rgba(2,36,18,.5)"; x.beginPath(); x.ellipse(X + 3, Y + 4, R, R * 0.85, 0, 0, 7); x.fill();
    var cg = x.createRadialGradient(X - R * 0.35, Y - R * 0.4, R * 0.1, X, Y, R);
    cg.addColorStop(0, "#a5e072"); cg.addColorStop(0.4, "#2f9a4c"); cg.addColorStop(1, "#0a4c28");
    x.fillStyle = cg; x.beginPath(); x.arc(X, Y, R, 0, 7); x.fill();
    x.strokeStyle = "rgba(5,46,24,.75)"; x.lineWidth = 0.9; x.stroke();
  });
};
PAINT[2] = function (x, S, r) { // desert: lit dune crests with soft shadow
  fillGrad(x, S, "#f2c56f", "#c98232");
  for (var y = -6, row = 0; y < S + 12; y += 15, row++) {
    var ph = r() * 6.3, amp = 3 + r() * 3, pass, X;
    for (pass = 0; pass < 2; pass++) {
      x.beginPath();
      for (X = -4; X <= S + 4; X += 4) { var Y = y + Math.sin(X / 17 + ph) * amp + Math.sin(X / 7 + ph * 2) * 1.2 + (pass ? 0 : 4); if (X === -4) x.moveTo(X, Y); else x.lineTo(X, Y); }
      x.strokeStyle = pass ? "rgba(255,246,200,.95)" : "rgba(150,78,20,.34)"; x.lineWidth = pass ? 2 : 6; x.lineCap = "round"; x.stroke();
    }
  }
  for (var k = 0; k < S * S / 260; k++) { x.fillStyle = "rgba(140,80,24,.55)"; x.beginPath(); x.arc(r() * S, r() * S, 0.8 + r() * 0.8, 0, 7); x.fill(); }
};
function waves(x, S, r, stepY, len, colA, colB, lw) {
  x.lineCap = "round";
  for (var y = 2, row = 0; y < S + stepY; y += stepY, row++) for (var X = -len + (row % 2) * len * 0.55 + r() * 4; X < S + len; X += len * 1.15) {
    var Y = y + r() * 3 - 1.5;
    x.beginPath(); x.moveTo(X, Y); x.quadraticCurveTo(X + len * 0.25, Y - len * 0.32, X + len * 0.5, Y); x.quadraticCurveTo(X + len * 0.75, Y + len * 0.26, X + len, Y);
    x.strokeStyle = colA; x.lineWidth = lw; x.stroke();
    if (r() < 0.6) { x.beginPath(); x.moveTo(X + len * 0.08, Y - 1.5); x.quadraticCurveTo(X + len * 0.25, Y - len * 0.36 - 1, X + len * 0.44, Y - 1.5); x.strokeStyle = colB; x.lineWidth = lw * 0.6; x.stroke(); }
  }
}
PAINT[3] = function (x, S, r) { // sea: deep, rolling
  fillGrad(x, S, "#2a63e0", "#0a2580");
  for (var k = 0; k < 9; k++) { var X = r() * S, Y = r() * S, R = 20 + r() * 30, g = x.createRadialGradient(X, Y, 0, X, Y, R); g.addColorStop(0, "rgba(4,14,70,.45)"); g.addColorStop(1, "rgba(4,14,70,0)"); x.fillStyle = g; x.fillRect(X - R, Y - R, R * 2, R * 2); }
  waves(x, S, r, 11, 19, "rgba(120,180,255,.9)", "rgba(255,255,255,.85)", 2.4);
};
PAINT[4] = function (x, S, r) { // lake: bright shallows, ripples, glints
  fillGrad(x, S, "#7fe9e6", "#1596b8");
  for (var k = 0; k < S * S / 1500; k++) {
    var X = r() * S, Y = r() * S, n = 2 + (r() * 2 | 0);
    for (var j = 1; j <= n; j++) { x.beginPath(); x.ellipse(X, Y, j * 6, j * 2.6, 0, 0, 7); x.strokeStyle = "rgba(255,255,255," + (0.75 - j * 0.16) + ")"; x.lineWidth = 1.6; x.stroke(); }
  }
  for (k = 0; k < S * S / 3200; k++) sparkle(x, r() * S, r() * S, 2.5 + r() * 2.5, "rgba(255,255,255,.95)");
};
PAINT[5] = function (x, S, r) { // plains: pale, open meadow with soft bands and sparse grass
  fillGrad(x, S, "#e6f8c8", "#bfe6a0");
  var y, X, k;
  for (y = 0; y < S + 20; y += 22) { var ph = r() * 6; x.beginPath(); for (X = -4; X <= S + 4; X += 6) { var Y = y + Math.sin(X / 26 + ph) * 6; if (X === -4) x.moveTo(X, Y); else x.lineTo(X, Y); } x.strokeStyle = "rgba(255,255,255,.5)"; x.lineWidth = 9; x.lineCap = "round"; x.stroke(); }
  x.lineWidth = 1.3; x.strokeStyle = "rgba(96,160,84,.8)";
  for (k = 0; k < S * S / 260; k++) { X = r() * S; y = r() * S; x.beginPath(); x.moveTo(X - 2.5, y - 3); x.lineTo(X, y + 1.5); x.lineTo(X, y - 4.5); x.moveTo(X, y + 1.5); x.lineTo(X + 2.5, y - 3); x.stroke(); }
};
PAINT[6] = function (x, S, r) { // hills: red rock, sharp faceted ridges (lit left face, shadowed right face)
  fillGrad(x, S, "#b8452c", "#741f14");
  for (var y = 6, row = 0; y < S + 22; y += 13, row++) for (var X = -16 + (row % 2) * 11; X < S + 16; X += 22) {
    var cx = X + r() * 5 - 2.5, by = y + r() * 3, w = 21 + r() * 5, h = 13 + r() * 5, px = cx + (r() * 4 - 2);
    x.beginPath(); x.moveTo(cx - w / 2, by); x.lineTo(px, by - h); x.lineTo(px + 1.5, by); x.closePath(); x.fillStyle = "#f29a70"; x.fill();
    x.beginPath(); x.moveTo(px, by - h); x.lineTo(cx + w / 2, by); x.lineTo(px + 1.5, by); x.closePath(); x.fillStyle = "#4e120c"; x.fill();
    x.beginPath(); x.moveTo(cx - w / 2, by); x.lineTo(px, by - h); x.lineTo(cx + w / 2, by); x.strokeStyle = "rgba(40,8,6,.85)"; x.lineWidth = 1.1; x.lineJoin = "round"; x.stroke();
    x.beginPath(); x.moveTo(px - 2.5, by - h * 0.62); x.lineTo(px, by - h); x.lineTo(px + 2, by - h * 0.66); x.closePath(); x.fillStyle = "rgba(255,236,220,.85)"; x.fill();
  }
};
function buildTextures() { // textures are (re)built lazily by getTex() whenever the screen, grid or art style changes
  var S = Math.ceil(Math.max(L.D, L.chPx, L.cwPx)) + 4 + Math.ceil(CONFIG.GRID / L.dpr), key = S + ":" + L.dpr + ":" + Math.round(L.cwPx) + ":" + Math.round(L.chPx) + ":" + CONFIG.artStyle;
  if (key === texKey) return;
  texKey = key; chipURL = {}; TEX = []; texS = S;
}

/* ================= ART STYLE 2: "INKED POSTER" (flat brochure colour + hand-inked map symbols) ================= */
function POSTER() { return CONFIG.artStyle === "poster"; }
var PCOL = ["#0f272c", "#3a9654", "#f2b33d", "#2e6ebe", "#46beba", "#cede96", "#d65430"], PINK = "#14262b";
function inkSym(x, id, r) { // one map symbol, drawn around the origin in a 77-unit cell
  var k, an, dx, dy; x.beginPath();
  if (id === 1) { for (k = 0; k < 7; k++) { an = -2.6 + k * 0.35; x.moveTo(0, 16); x.quadraticCurveTo(Math.cos(an) * 10, Math.sin(an) * 10, Math.cos(an) * (20 + r() * 5), -2 + Math.sin(an) * (20 + r() * 5)); } x.moveTo(0, 16); x.lineTo(1, 28); }
  if (id === 2) { x.moveTo(-28, 6); x.quadraticCurveTo(-6, -18, 10, -2); x.quadraticCurveTo(18, 4, 30, 4); x.stroke(); x.beginPath(); for (k = 0; k < 6; k++) { dx = -16 + r() * 40; dy = 12 + r() * 12; x.moveTo(dx, dy); x.arc(dx, dy, 2, 0, 7); } x.fill(); x.beginPath(); }
  if (id === 3) { x.moveTo(-28, 0); x.quadraticCurveTo(-18, -13, -8, 0); x.quadraticCurveTo(2, 10, 12, -2); x.quadraticCurveTo(19, -12, 28, -9); }
  if (id === 4) { x.moveTo(-24, -5 + r() * 2); x.lineTo(20, -5 + r() * 2); x.moveTo(-12, 7); x.lineTo(26, 7 + r() * 2); }
  if (id === 5) { x.moveTo(-8, -10); x.quadraticCurveTo(-3, 0, 0, 10); x.quadraticCurveTo(1, -2, 2, -14); x.moveTo(0, 10); x.quadraticCurveTo(5, 0, 11, -8); }
  if (id === 6) { x.moveTo(-30, 14); x.quadraticCurveTo(-10, -26, 2, -20); x.quadraticCurveTo(16, -12, 30, 14); x.stroke(); x.beginPath(); x.lineWidth *= 0.6; for (k = 0; k < 6; k++) { x.moveTo(4 + k * 4, -14 + k * 4); x.lineTo(k * 4.6, 12); } }
  x.stroke();
}
function posterPaint(id) {
  return function (x, S, r) {
    var k, row, X, Y, step = 26, sc = step / 77;
    x.fillStyle = PCOL[id]; x.fillRect(0, 0, S, S);
    if (id === 0) { // erase: empty canvas with faint crosses
      x.strokeStyle = "rgba(244,230,200,.5)"; x.lineWidth = 2; x.lineCap = "round"; x.beginPath();
      for (Y = 15; Y < S; Y += 30) for (X = 15; X < S; X += 30) { x.moveTo(X - 5, Y - 5); x.lineTo(X + 5, Y + 5); x.moveTo(X + 5, Y - 5); x.lineTo(X - 5, Y + 5); }
      x.stroke(); return;
    }
    x.fillStyle = "rgba(255,255,255,.13)";
    for (k = 0; k < S * S / 7000; k++) { x.beginPath(); x.ellipse(r() * S, r() * S, 16 + r() * 22, 10 + r() * 12, r() * 3, 0, 7); x.fill(); }
    step = PSTEP[id] || 26; sc = step / 77;
    x.lineCap = "round"; x.lineJoin = "round";
    for (Y = step / 2, row = 0; Y < S + step; Y += step, row++) for (X = (row % 2 ? step / 2 : 0); X < S + step; X += step) {
      x.save(); x.translate(X + (r() - 0.5) * 5, Y + (r() - 0.5) * 4); x.scale(sc, sc); x.strokeStyle = x.fillStyle = PINKC[id] || PINK; x.lineWidth = 3.7 * (0.85 + r() * 0.4); if (id > 6) inkSym2(x, id, r); else inkSym(x, id, r); x.restore();
    }
    var cv = x.canvas, im = x.getImageData(0, 0, cv.width, cv.height), d = im.data, n; // print grain
    for (k = 0; k < d.length; k += 4) { n = (r() - 0.5) * 22; d[k] += n; d[k + 1] += n; d[k + 2] += n; }
    x.putImageData(im, 0, 0);
  };
}
function star4(x, X, Y, q) { x.beginPath(); x.moveTo(X, Y - q * 2); x.lineTo(X + q * 0.5, Y - q * 0.5); x.lineTo(X + q * 2, Y); x.lineTo(X + q * 0.5, Y + q * 0.5); x.lineTo(X, Y + q * 2); x.lineTo(X - q * 0.5, Y + q * 0.5); x.lineTo(X - q * 2, Y); x.lineTo(X - q * 0.5, Y - q * 0.5); x.fill(); }
function drawSpacePoster() {
  var c = $("bg"), w = L.vw, h = L.vh, d = L.dpr, x = c.getContext("2d"), r = makeRng(42), k;
  c.width = Math.round(w * d); c.height = Math.round(h * d); c.style.width = w + "px"; c.style.height = h + "px"; x.scale(d, d);
  x.fillStyle = "#17383f"; x.fillRect(0, 0, w, h);
  x.fillStyle = "#f4e6c8"; for (k = 0; k < 60; k++) star4(x, r() * w, r() * h, 0.9 + r() * 2.2);
}
function drawCardPoster(c, id, w, h, poolAlpha, shadow) {
  var x = -w / 2, y = -h / 2, d = L.dpr, rad = Math.min(w, h) * 0.26, f = Math.max(3, w * 0.07);
  if (shadow) { c.fillStyle = "rgba(0,0,0,.45)"; rr(c, x + 3.5, y + 3.5, w, h, rad); c.fill(); }
  c.fillStyle = "#f4e6c8"; rr(c, x, y, w, h, rad); c.fill();
  c.save(); rr(c, x + f, y + f, w - 2 * f, h - 2 * f, Math.max(2, rad - f)); c.clip();
  c.globalAlpha = poolAlpha;
  if (id === 0) { c.fillStyle = "#17383f"; c.fillRect(x, y, w, h); }
  else texDraw(c, id, 0, 0, w * 1.25 * d, h * 1.25 * d, x, y, w, h);
  c.restore();
  if (id === 0) { var q = w * 0.2; c.strokeStyle = "#f4e6c8"; c.lineWidth = Math.max(2.5, w * 0.08); c.lineCap = "round"; c.beginPath(); c.moveTo(-q, -q); c.lineTo(q, q); c.moveTo(q, -q); c.lineTo(-q, q); c.stroke(); }
}
function alienSVGPoster(o) {
  var k = o.look, head = PCOL[o.tint], shirt = ["#e2622b", "#f2b33d", "#3aa7a3"][k.antenna], ink = PINK, cream = "#f4e6c8";
  var s = '<svg viewBox="0 -4 58 84"><path d="M5 80 Q7 57 29 57 Q51 57 53 80 Z" fill="' + shirt + '" stroke="' + ink + '" stroke-width="2"/>';
  s += '<path d="M23 58 L29 66 L35 58" fill="none" stroke="' + cream + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
  var st = k.antenna === 0 ? [[29, 4]] : k.antenna === 1 ? [[20, 5], [38, 5]] : [[16, 9], [29, 3], [42, 9]];
  st.forEach(function (a) { s += '<path d="M' + (29 + (a[0] - 29) * 0.5) + ' 16 L' + a[0] + " " + a[1] + '" stroke="' + ink + '" stroke-width="2" fill="none"/><circle cx="' + a[0] + '" cy="' + a[1] + '" r="3" fill="#f2b33d" stroke="' + ink + '" stroke-width="1.5"/>'; });
  var hf = ' fill="' + head + '" stroke="' + ink + '" stroke-width="2.2" stroke-linejoin="round"/>';
  if (k.head === 0) s += '<ellipse cx="29" cy="32" rx="14" ry="19"' + hf;
  else if (k.head === 1) s += '<path d="M14 18 Q14 13 19 13 L39 13 Q44 13 44 18 L42 42 Q29 54 16 42 Z"' + hf;
  else s += '<path d="M9 34 Q9 12 29 12 Q49 12 49 34 Q42 50 29 50 Q16 50 9 34 Z"' + hf;
  var ex = k.eyes === 1 ? [[29, 29, 7.5]] : k.eyes === 2 ? [[22, 30, 5.5], [36, 30, 5.5]] : [[19, 31, 4], [29, 26, 4], [39, 31, 4]];
  ex.forEach(function (e) { s += '<ellipse cx="' + e[0] + '" cy="' + e[1] + '" rx="' + e[2] + '" ry="' + (e[2] * 1.15) + '" fill="' + cream + '" stroke="' + ink + '" stroke-width="1.4"/><circle cx="' + (e[0] + 1) + '" cy="' + (e[1] + 1.5) + '" r="' + (e[2] * 0.42) + '" fill="' + ink + '"/>'; });
  s += '<path d="M24 43 h10" stroke="' + ink + '" stroke-width="2.2" stroke-linecap="round"/>';
  return s + hatSVG(o) + "</svg>";
}
/* ----- deep space backdrop ----- */
function drawSpace() {
  if (POSTER()) return drawSpacePoster();
  var c = $("bg"), w = L.vw, h = L.vh, d = L.dpr, x = c.getContext("2d"), r = makeRng(42), k, g;
  c.width = Math.round(w * d); c.height = Math.round(h * d); c.style.width = w + "px"; c.style.height = h + "px"; x.scale(d, d);
  g = x.createLinearGradient(0, 0, w * 0.4, h); g.addColorStop(0, "#03040c"); g.addColorStop(0.5, "#0b0e2e"); g.addColorStop(1, "#040a18"); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = "lighter";
  var neb = [[0.9, 0.45, 0.5, "255,43,214", 0.11], [0.08, 0.65, 0.55, "41,240,255", 0.1], [0.5, 0.3, 0.45, "90,70,255", 0.14]];
  neb.forEach(function (n) { var X = n[0] * w, Y = n[1] * h, R = n[2] * w * 1.2; g = x.createRadialGradient(X, Y, 0, X, Y, R); g.addColorStop(0, "rgba(" + n[3] + "," + n[4] + ")"); g.addColorStop(1, "rgba(" + n[3] + ",0)"); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  x.globalCompositeOperation = "source-over";
  for (k = 0; k < 170; k++) { x.fillStyle = "rgba(255,255,255," + (0.25 + r() * 0.75) + ")"; x.beginPath(); x.arc(r() * w, r() * h, 0.4 + r() * 1.1, 0, 7); x.fill(); }
  for (k = 0; k < 14; k++) sparkle(x, r() * w, r() * h, 3 + r() * 5, k % 3 ? "#fff" : "#ffe9a0");
  function orb(X, Y, R, a, b, c2, ring) {
    x.save(); x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = 20;
    if (ring) { x.strokeStyle = "rgba(120,200,255,.35)"; x.lineWidth = R * 0.16; x.beginPath(); x.ellipse(X, Y, R * 1.7, R * 0.42, -0.35, Math.PI, Math.PI * 2); x.stroke(); }
    g = x.createRadialGradient(X - R * 0.4, Y - R * 0.45, R * 0.1, X, Y, R * 1.05); g.addColorStop(0, a); g.addColorStop(0.55, b); g.addColorStop(1, c2);
    x.fillStyle = g; x.beginPath(); x.arc(X, Y, R, 0, 7); x.fill(); x.shadowBlur = 0;
    x.save(); x.clip(); x.globalAlpha = 0.12; x.strokeStyle = "#fff"; x.lineWidth = R * 0.09;
    for (var j = -2; j <= 2; j++) { x.beginPath(); x.ellipse(X, Y + j * R * 0.33, R * 1.2, R * 0.16, -0.25, 0, 7); x.stroke(); }
    x.restore();
    if (ring) { x.strokeStyle = "rgba(140,215,255,.8)"; x.lineWidth = R * 0.1; x.beginPath(); x.ellipse(X, Y, R * 1.7, R * 0.42, -0.35, 0, Math.PI); x.stroke(); x.strokeStyle = "rgba(255,255,255,.7)"; x.lineWidth = 1.2; x.beginPath(); x.ellipse(X, Y, R * 1.86, R * 0.47, -0.35, 0, Math.PI); x.stroke(); }
    x.restore();
  }
  orb(w * 0.02, h * 0.5, w * 0.12, "#b7c2f2", "#474c9c", "#100e30", true);
  orb(w * 0.95, h * 0.36, w * 0.045, "#a6ecff", "#236f8c", "#06202c", false);
}

/* ----- terrain card = thin chrome frame, corner studs, a pool of terrain. Drawn centred on the origin ----- */
function drawCard(c, id, w, h, poolAlpha, shadow) {
  if (POSTER()) return drawCardPoster(c, id, w, h, poolAlpha, shadow);
  var f = Math.max(2.5, w * 0.05), x = -w / 2, y = -h / 2, d = L.dpr, g, k;
  g = c.createLinearGradient(x, y, x + w, y + h);
  [[0, "#ffffff"], [0.2, "#9aa4c2"], [0.42, "#f1f4ff"], [0.6, "#6c7697"], [0.82, "#dfe5f8"], [1, "#7d86a6"]].forEach(function (s) { g.addColorStop(s[0], s[1]); });
  c.save();
  if (shadow) { c.shadowColor = "rgba(0,0,0,.6)"; c.shadowBlur = 9 * d; c.shadowOffsetX = 3 * d; c.shadowOffsetY = 6 * d; }
  rr(c, x, y, w, h, 2.5); c.fillStyle = g; c.fill(); c.restore();
  c.lineWidth = 1; c.strokeStyle = INK; rr(c, x, y, w, h, 2.5); c.stroke();
  var iw = w - 2 * f, ih = h - 2 * f, ix = x + f, iy = y + f;
  c.save(); c.beginPath(); c.rect(ix, iy, iw, ih); c.clip();
  c.fillStyle = "#0a0624"; c.fillRect(ix, iy, iw, ih);
  c.globalAlpha = poolAlpha;
  texDraw(c, id, 0, 0, L.cwPx * d, L.chPx * d, ix, iy, iw, ih);
  c.globalAlpha = 1;
  g = c.createLinearGradient(0, iy, 0, iy + Math.min(10, ih * 0.12)); g.addColorStop(0, "rgba(4,0,30,.6)"); g.addColorStop(1, "rgba(4,0,30,0)"); c.fillStyle = g; c.fillRect(ix, iy, iw, ih); // recessed pool
  g = c.createLinearGradient(ix, 0, ix + Math.min(8, iw * 0.16), 0); g.addColorStop(0, "rgba(4,0,30,.5)"); g.addColorStop(1, "rgba(4,0,30,0)"); c.fillStyle = g; c.fillRect(ix, iy, iw, ih);
  c.fillStyle = "rgba(255,255,255,.13)"; c.beginPath(); c.moveTo(ix + iw * 0.45, iy); c.lineTo(ix + iw, iy); c.lineTo(ix + iw, iy + ih * 0.3); c.lineTo(ix + iw * 0.1, iy + ih * 0.8); c.lineTo(ix, iy + ih * 0.62); c.closePath(); c.fill(); // gloss
  c.restore();
  c.lineWidth = 0.8; c.strokeStyle = "rgba(26,16,53,.9)"; c.strokeRect(ix, iy, iw, ih);
  var s = Math.max(3, f * 1.25), cs = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
  for (k = 0; k < 4; k++) { // corner diamond studs
    c.save(); c.translate(cs[k][0] + (k % 2 ? -f / 2 : f / 2), cs[k][1] + (k < 2 ? f / 2 : -f / 2)); c.rotate(Math.PI / 4);
    g = c.createLinearGradient(-s, -s, s, s); g.addColorStop(0, "#fff"); g.addColorStop(0.5, "#aab3d1"); g.addColorStop(1, "#4d5678");
    c.fillStyle = g; c.fillRect(-s, -s, 2 * s, 2 * s); c.lineWidth = 1; c.strokeStyle = INK; c.strokeRect(-s, -s, 2 * s, 2 * s);
    c.fillStyle = "rgba(255,255,255,.9)"; c.fillRect(-s * 0.4, -s * 0.4, s * 0.8, s * 0.8); c.restore();
  }
  if (id === 0) { c.strokeStyle = "#ff5a7a"; c.lineWidth = Math.max(2, w * 0.05); c.lineCap = "round"; c.beginPath(); c.moveTo(-iw * 0.28, -iw * 0.28); c.lineTo(iw * 0.28, iw * 0.28); c.moveTo(iw * 0.28, -iw * 0.28); c.lineTo(-iw * 0.28, iw * 0.28); c.stroke(); }
}
function chip(id) {
  if (id === ANY) return '<span class="chip any"></span>';
  if (!chipURL[id]) { var c = document.createElement("canvas"); c.width = c.height = 48; texDraw(c.getContext("2d"), id, 0, 0, 44 * L.dpr, 44 * L.dpr, 0, 0, 48, 48); chipURL[id] = c.toDataURL(); }
  return '<span class="chip" style="background-image:url(' + chipURL[id] + ')"></span>';
}
function tname(id) { return id === ANY ? "ANY" : TERRAINS[id].name; }

function alienSVG(o, p) {
  if (POSTER()) return alienSVGPoster(o);
  var base = TERRAINS[o.tint].color, hi = rgb(mix(base, [255, 255, 255], 0.3)), mid = rgb(mix(base, [10, 10, 40], 0.25)), lo = rgb(mix(base, [4, 4, 20], 0.72)), k = o.look, ink = INK;
  var neon = ["#29f0ff", "#ff2bd6", "#ffb000"][k.antenna];
  var s = '<svg viewBox="0 -4 58 84"><defs>' +
    '<radialGradient id="' + p + 'h" cx=".3" cy=".25" r=".95"><stop offset="0" stop-color="' + hi + '"/><stop offset=".5" stop-color="' + mid + '"/><stop offset="1" stop-color="' + lo + '"/></radialGradient>' +
    '<linearGradient id="' + p + 's" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a5380"/><stop offset=".5" stop-color="#1e2342"/><stop offset="1" stop-color="#090b1a"/></linearGradient></defs>';
  s += '<path d="M6 80 L11 59 Q29 50 47 59 L52 80 Z" fill="url(#' + p + 's)" stroke="' + ink + '" stroke-width="2"/>';
  s += '<path d="M17 60 L22 80 M41 60 L36 80" stroke="' + neon + '" stroke-width="1.6" fill="none"/><path d="M25 66 h8" stroke="' + neon + '" stroke-width="2.4" stroke-linecap="round"/>';
  s += '<path d="M16 57 Q29 64 42 57 L42 51 Q29 58 16 51 Z" fill="#7d86b3" stroke="' + ink + '" stroke-width="1.8"/>';
  var hf = ' fill="url(#' + p + 'h)" stroke="' + ink + '" stroke-width="2.2" stroke-linejoin="round"/>';
  if (k.head === 0) s += '<ellipse cx="29" cy="30" rx="13" ry="18"' + hf;
  else if (k.head === 1) s += '<path d="M13 14 L45 14 L41 42 L29 50 L17 42 Z"' + hf;
  else s += '<path d="M10 34 Q10 11 29 11 Q48 11 48 34 Q41 48 29 48 Q17 48 10 34 Z"' + hf;
  if (k.eyes === 1) s += '<path d="M18 29 Q29 24 40 29 Q29 34 18 29 Z" fill="#eaffff" stroke="' + neon + '" stroke-width="1.2"/><circle cx="29" cy="29" r="1.8" fill="' + ink + '"/>';
  else {
    var ex = k.eyes === 2 ? [[22, 12], [36, -12]] : [[19, 14], [29, 0], [39, -14]];
    ex.forEach(function (e) { var cy = e[1] === 0 ? 24 : 30; s += '<ellipse cx="' + e[0] + '" cy="' + cy + '" rx="4.6" ry="2" transform="rotate(' + e[1] + ' ' + e[0] + ' ' + cy + ')" fill="#eaffff" stroke="' + neon + '" stroke-width="1.1"/>'; });
  }
  s += '<path d="M25 41 h8 M26.5 44 h5" stroke="rgba(4,6,16,.7)" stroke-width="1.3" stroke-linecap="round"/>';
  s += '<path d="M17 22 Q20 15 27 13" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-linecap="round"/>';
  return s + hatSVG(o) + "</svg>";
}

/* ----- tier 2/3 terrains: poster colour + inked symbol that reads as a variant of the parent ----- */
PCOL = PCOL.concat(["#8a5442", "#1c6a3a", "#b4ccc0", "#8ec4ea", "#84ba54", "#c8702c", "#16347a", "#e6eef4", "#6a5048", "#6e1810",
  "#688848", "#f2c86a", "#d4cc74", "#c6ac54", "#f4dca0", "#3c92c4", "#c05c3a", "#a09654"]);
var PSTEP = { 8: 20, 13: 30, 14: 30, 10: 30 }, PINKC = { 13: "#f4e6c8", 15: "#f4e6c8", 16: "#f2913d" };
(function () { for (var id = 7; id < TERRAINS.length; id++) { var c = TERRAINS[id].color; TCOL[id] = rgb(mix(c, [255, 255, 255], 0.35)); PAINT[id] = posterPaint(id); } })();
function inkSym2(x, id, r) {
  var k, ink = x.strokeStyle;
  function sub(pid, dx, dy, sc) { x.save(); x.translate(dx, dy); x.scale(sc, sc); inkSym(x, pid, r); x.restore(); }
  x.beginPath();
  if (id === 7) { x.moveTo(-30, 18); x.lineTo(-8, -22); x.lineTo(6, 2); x.lineTo(14, -10); x.lineTo(30, 18); x.moveTo(-14, -11); x.lineTo(-8, -5); x.lineTo(-3, -12); x.stroke(); }
  else if (id === 8) { sub(1, -8, 0, 1); sub(1, 20, 12, 0.6); }
  else if (id === 9) { sub(5, 0, 2, 1); x.fillStyle = "#fff"; for (k = 0; k < 4; k++) { x.beginPath(); x.arc(-22 + k * 15 + r() * 4, -16 + r() * 34, 3, 0, 7); x.fill(); } }
  else if (id === 10) { x.moveTo(-22, 4); x.lineTo(-10, -16); x.lineTo(8, -12); x.lineTo(22, 2); x.lineTo(6, 12); x.lineTo(-12, 10); x.closePath(); x.fillStyle = "#fff"; x.fill(); x.stroke(); x.beginPath(); x.moveTo(-26, 22); x.quadraticCurveTo(-14, 14, -2, 22); x.quadraticCurveTo(10, 30, 24, 20); x.stroke(); }
  else if (id === 11) { x.moveTo(-30, -14); x.quadraticCurveTo(-12, -10, -2, 16); x.moveTo(30, -14); x.quadraticCurveTo(12, -10, 2, 16); x.moveTo(0, 16); x.quadraticCurveTo(-4, 22, 2, 28); x.stroke(); }
  else if (id === 12) { for (k = 0; k < 2; k++) { x.moveTo(-10 + k * 12, -26); x.lineTo(0 + k * 12, -12); x.lineTo(-10 + k * 12, 0); x.lineTo(2 + k * 12, 12); x.lineTo(-6 + k * 12, 26); } x.stroke(); }
  else if (id === 13) { sub(3, 0, 0, 1); for (k = 0; k < 3; k++) { x.beginPath(); x.arc(-16 + k * 16, 14 + r() * 8, 3.5, 0, 7); x.stroke(); } }
  else if (id === 14) { for (k = 0; k < 3; k++) { var a = k * Math.PI / 3; x.moveTo(Math.cos(a) * 14, Math.sin(a) * 14 - 6); x.lineTo(-Math.cos(a) * 14, -Math.sin(a) * 14 - 6); } x.moveTo(-26, 20); x.quadraticCurveTo(-6, 10, 26, 20); x.stroke(); }
  else if (id === 15) { x.moveTo(-20, 16); x.lineTo(-20, 0); x.quadraticCurveTo(-20, -20, 0, -20); x.quadraticCurveTo(20, -20, 20, 0); x.lineTo(20, 16); x.closePath(); x.fillStyle = "#241814"; x.fill(); x.stroke(); }
  else if (id === 16) { x.lineWidth *= 1.5; x.moveTo(-28, -6); x.lineTo(-12, 4); x.lineTo(-2, -10); x.lineTo(10, 6); x.lineTo(26, -4); x.moveTo(-2, -10); x.lineTo(2, -24); x.moveTo(10, 6); x.lineTo(14, 22); x.stroke(); x.fillStyle = "#f7cf73"; x.beginPath(); x.arc(-12, 4, 3.5, 0, 7); x.fill(); }
  else if (id === 17) { [[-10, -10], [0, -18], [10, -8]].forEach(function (p) { x.moveTo(p[0], 14); x.lineTo(p[0], p[1]); }); x.moveTo(-26, 21); x.lineTo(-6, 21); x.moveTo(8, 24); x.lineTo(26, 24); x.stroke(); x.fillStyle = ink; [[-10, -10], [0, -18], [10, -8]].forEach(function (p) { x.beginPath(); x.ellipse(p[0], p[1], 2.5, 5, 0, 0, 7); x.fill(); }); }
  else if (id === 18) { x.ellipse(-2, 12, 22, 9, 0, 0, 7); x.fillStyle = "#46beba"; x.fill(); x.stroke(); x.beginPath(); x.moveTo(8, 8); x.quadraticCurveTo(12, -6, 6, -16); for (k = 0; k < 4; k++) { var b = -2.9 + k * 0.85; x.moveTo(6, -16); x.quadraticCurveTo(6 + Math.cos(b) * 8, -22 + Math.sin(b) * 4, 6 + Math.cos(b) * 15, -14 + Math.sin(b) * 6); } x.stroke(); }
  else if (id === 19) { sub(5, 0, -6, 0.9); x.beginPath(); x.moveTo(-30, 22); x.quadraticCurveTo(0, 6, 30, 22); x.stroke(); }
  else if (id === 20) { x.moveTo(0, 18); x.lineTo(0, -6); x.moveTo(-18, -6); x.quadraticCurveTo(0, -22, 18, -6); x.closePath(); x.stroke(); sub(5, -22, 12, 0.5); }
  else if (id === 21) { sub(3, 0, -12, 0.9); x.fillStyle = ink; for (k = 0; k < 4; k++) { x.beginPath(); x.arc(-20 + k * 13 + r() * 4, 10 + r() * 12, 2.2, 0, 7); x.fill(); } }
  else if (id === 22) { sub(3, 0, -10, 0.9); sub(4, 0, 14, 0.9); }
  else if (id === 23) { x.moveTo(-28, 16); x.lineTo(-18, -14); x.lineTo(18, -14); x.lineTo(28, 16); x.stroke(); x.beginPath(); x.lineWidth *= 0.6; for (k = 0; k < 5; k++) { x.moveTo(-14 + k * 7, -14); x.lineTo(-16 + k * 7, 2); } x.stroke(); }
  else if (id === 24) { [[-16, 6, 8], [2, -4, 9], [18, 8, 7]].forEach(function (p) { x.moveTo(p[0] + p[2], p[1]); x.arc(p[0], p[1], p[2], 0, Math.PI, true); x.moveTo(p[0], p[1]); x.lineTo(p[0], p[1] + 8); }); x.stroke(); }
}
/* ----- textures are built lazily; tier 2/3 at half resolution to stay light on iPhone memory ----- */
var texS = 0;
function getTex(id) {
  if (TEX[id]) return TEX[id];
  var k = id >= 7 ? 0.5 : 1, c = document.createElement("canvas"); c.width = c.height = Math.ceil(texS * L.dpr * k);
  var x = c.getContext("2d"); x.scale(L.dpr * k, L.dpr * k);
  (POSTER() || id >= 7 ? posterPaint(id) : PAINT[id])(x, texS, makeRng(1000 + id * 77)); c.k = k; TEX[id] = c;
  return c;
}
function texDraw(ctx, id, sx, sy, sw, sh, dx, dy, dw, dh) { var c = getTex(id), k = c.k; ctx.drawImage(c, sx * k, sy * k, sw * k, sh * k, dx, dy, dw, dh); }

/* ----- bots, hats ----- */
var BOT_COL = { hot: "#e2622b", chill: "#8ec4ea", low: "#c79a5a", high: "#dfe6ee" };
var BOT_ICON = {
  hot: '<path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z" fill="currentColor"/>',
  chill: '<path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17M12 6l-2.5-2.5M12 6l2.5-2.5M12 18l-2.5 2.5M12 18l2.5 2.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  low: '<path d="M12 3v15M5 12l7 8 7-8" stroke="currentColor" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  high: '<path d="M12 21V6M5 12l7-8 7 8" stroke="currentColor" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
};
function botSVG(b) { return '<svg viewBox="0 0 24 24">' + BOT_ICON[b] + "</svg>"; }
function hatSVG(o) {
  if (typeof META === "undefined" || !META.hq.hats) return "";
  var k = (o.look.head + o.look.eyes) % 3, ink = POSTER() ? PINK : INK, c = ["#d9471f", "#f2b33d", "#3aa7a3"][o.look.antenna];
  if (k === 0) return '<path d="M19 1h20v11H19z" fill="' + ink + '"/><path d="M12 11h34v4H12z" fill="' + ink + '"/><path d="M19 8h20v3H19z" fill="' + c + '"/>';
  if (k === 1) return '<path d="M29 -2L18 15h22z" fill="' + c + '" stroke="' + ink + '" stroke-width="1.5"/><circle cx="29" cy="-1" r="3" fill="#f4e6c8" stroke="' + ink + '" stroke-width="1"/>';
  return '<path d="M15 14Q15 3 29 3Q43 3 43 14z" fill="' + c + '" stroke="' + ink + '" stroke-width="1.5"/><path d="M40 13h12v3H40z" fill="' + ink + '"/>';
}

/* ----- solar-system results: a sun, and every finished planet in orbit ----- */
var SUN_COLS = [["#e2472b", "#ff9a6a"], ["#f08a2b", "#ffc078"], ["#f2c53d", "#fff0a0"], ["#f6f0dc", "#ffffff"], ["#bfe0ff", "#ffffff"], ["#a06be0", "#d9b8ff"]];
function makeSystem(results, rng, fancy) {
  return {
    name: systemName(rng), sun: { col: SUN_COLS[rng() < 0.06 ? 5 : randInt(rng, 0, 4)], rk: 0.18 + rng() * 0.22, style: fancy ? randInt(rng, 0, 3) : 0 },
    planets: results.map(function (p, i) { return { pic: p.pic, name: p.order.planet, grade: p.grade, speed: (0.45 + rng() * 0.4) / (1 + i * 0.3) * (rng() < 0.15 ? -1 : 1), phase: rng() * 6.283, x: 0, y: 0, r: 0 }; })
  };
}
function drawSolar(cv, sys, t, sel) {
  var d = L.dpr, w = cv.clientWidth, h = cv.clientHeight, x = cv.getContext("2d"), n = sys.planets.length, i, p;
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
  x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, w, h);
  var ff = getComputedStyle(document.body).fontFamily, cx = w / 2, cy = h / 2 + 8, squash = Math.min(0.42, (h / 2 - 34) / (w / 2 - 34));
  var sr = Math.min(w * 0.5 * sys.sun.rk, h * 0.3) * (sys.sun.style === 3 ? 1 + 0.06 * Math.sin(t * 2.2) : 1);
  var r0 = sr + 24, r1 = w / 2 - 34, cream = "#f4e6c8";
  x.lineWidth = 1.2; x.strokeStyle = "rgba(244,230,200,.28)"; x.setLineDash([3, 5]);
  for (i = 0; i < n; i++) { p = sys.planets[i]; p.rx = n === 1 ? (r0 + r1) / 2 : r0 + (r1 - r0) * i / (n - 1); x.beginPath(); x.ellipse(cx, cy, p.rx, p.rx * squash, 0, 0, 7); x.stroke(); }
  x.setLineDash([]);
  function planet(p, i) {
    var a = p.phase + t * p.speed, s = Math.sin(a), R = 15 * (1 + 0.18 * s);
    p.x = cx + Math.cos(a) * p.rx; p.y = cy + s * p.rx * squash; p.r = R;
    if (i === sel) { x.strokeStyle = "#f2b33d"; x.lineWidth = 3; x.beginPath(); x.arc(p.x, p.y, R + 6, 0, 7); x.stroke(); }
    if (p.pic) x.drawImage(p.pic, p.x - R, p.y - R, R * 2, R * 2);
    x.font = "700 10px " + ff; x.textAlign = "center"; x.fillStyle = cream; x.fillText(p.name, p.x, p.y + R + 11);
    x.fillStyle = cream; x.beginPath(); x.arc(p.x + R * 0.8, p.y - R * 0.8, 8, 0, 7); x.fill();
    x.fillStyle = "#d9471f"; x.font = "900 11px " + ff; x.fillText(p.grade, p.x + R * 0.8, p.y - R * 0.8 + 4);
  }
  for (i = 0; i < n; i++) { p = sys.planets[i]; if (Math.sin(p.phase + t * p.speed) < 0) planet(p, i); }
  // the sun
  x.fillStyle = "rgba(0,0,0,.35)"; x.beginPath(); x.arc(cx + 5, cy + 5, sr, 0, 7); x.fill();
  x.strokeStyle = sys.sun.col[0]; x.lineWidth = 3; x.lineCap = "round";
  for (i = 0; i < 16; i++) { var a = i / 16 * 6.283 + t * 0.15; x.beginPath(); x.moveTo(cx + Math.cos(a) * (sr + 5), cy + Math.sin(a) * (sr + 5)); x.lineTo(cx + Math.cos(a) * (sr + (i % 2 ? 10 : 15)), cy + Math.sin(a) * (sr + (i % 2 ? 10 : 15))); x.stroke(); }
  x.fillStyle = sys.sun.col[0]; x.beginPath(); x.arc(cx, cy, sr, 0, 7); x.fill();
  x.fillStyle = sys.sun.col[1]; x.beginPath(); x.arc(cx - sr * 0.12, cy - sr * 0.12, sr * 0.72, 0, 7); x.fill();
  if (sys.sun.style === 2) { x.fillStyle = sys.sun.col[0]; [[0.3, 0.2, 0.16], [-0.35, 0.3, 0.1], [0.05, -0.4, 0.12]].forEach(function (q) { x.beginPath(); x.arc(cx + q[0] * sr, cy + q[1] * sr, q[2] * sr, 0, 7); x.fill(); }); }
  if (sys.sun.style === 1) { x.strokeStyle = cream; x.lineWidth = 3; x.beginPath(); x.ellipse(cx, cy, sr * 1.35, sr * 0.3, -0.3, 0, Math.PI); x.stroke(); }
  for (i = 0; i < n; i++) { p = sys.planets[i]; if (Math.sin(p.phase + t * p.speed) >= 0) planet(p, i); }
  x.textAlign = "center"; x.fillStyle = cream; x.font = "900 17px " + ff; x.fillText(sys.name.toUpperCase(), cx, 20);
  if (!n) { x.font = "700 11px " + ff; x.fillText("(no planets)", cx, h - 10); }
}
function solarHit(sys, px, py) { var best = -1, bd = 30 * 30; sys.planets.forEach(function (p, i) { var q = (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py); if (q < bd) { bd = q; best = i; } }); return best; }

/* ----- v1.1: mixing well, store icons, galaxy intro art, tutorial demo planet ----- */
function drawWell(x, id, w, h) { // a stone basin holding a pool of terrain (or empty water), centred on the origin
  var r = Math.min(w * 0.5, h * 0.4), cy = -h * 0.04, pst = POSTER(), rim = pst ? "#f4e6c8" : "#aab3d1", ink = pst ? PINK : INK, k;
  x.save();
  x.fillStyle = "rgba(0,0,0,.4)"; x.beginPath(); x.ellipse(3, cy + 4, r, r, 0, 0, 7); x.fill();
  x.fillStyle = pst ? "#8a5442" : "#4d5678"; x.fillRect(-r * 0.45, cy + r * 0.6, r * 0.9, h * 0.5 - r * 0.6 - cy); // pedestal
  x.strokeStyle = ink; x.lineWidth = 1.5; x.strokeRect(-r * 0.45, cy + r * 0.6, r * 0.9, h * 0.5 - r * 0.6 - cy);
  x.fillStyle = rim; x.beginPath(); x.arc(0, cy, r, 0, 7); x.fill(); x.lineWidth = 2; x.stroke();
  var pr = r * 0.74; x.save(); x.beginPath(); x.arc(0, cy, pr, 0, 7); x.clip();
  if (id) texDraw(x, id, 0, 0, 140, 140, -pr, cy - pr, pr * 2, pr * 2);
  else {
    x.fillStyle = pst ? "#24525b" : "#1a2150"; x.fillRect(-pr, cy - pr, pr * 2, pr * 2);
    x.strokeStyle = "rgba(244,230,200,.45)"; x.lineWidth = 1.2;
    for (k = 1; k <= 2; k++) { x.beginPath(); x.ellipse(0, cy, pr * 0.32 * k, pr * 0.14 * k, 0, 0, 7); x.stroke(); }
  }
  x.fillStyle = "rgba(255,255,255,.18)"; x.beginPath(); x.ellipse(-pr * 0.35, cy - pr * 0.45, pr * 0.42, pr * 0.16, -0.5, 0, 7); x.fill();
  x.restore();
  x.strokeStyle = ink; x.lineWidth = 1.6; x.beginPath(); x.arc(0, cy, pr, 0, 7); x.stroke();
  for (k = 0; k < 8; k++) { var a = k / 8 * 6.283; x.beginPath(); x.moveTo(Math.cos(a) * pr, cy + Math.sin(a) * pr); x.lineTo(Math.cos(a) * r, cy + Math.sin(a) * r); x.lineWidth = 1; x.stroke(); }
  x.restore();
}
var STORE_ICONS = {
  brush: '<path d="M20 3l-9 9 2 2 9-9z" fill="#f2b33d"/><path d="M11 12c-3 0-5 2-5 5 0 2-2 3-3 3 3 2 9 1 10-4z" fill="#e2622b"/>',
  time: '<circle cx="12" cy="12" r="9" fill="none" stroke="#f4e6c8" stroke-width="2.4"/><path d="M12 7v5l4 3" stroke="#f2b33d" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  peek: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="#f4e6c8"/><circle cx="12" cy="12" r="4" fill="#3aa7a3"/><circle cx="12" cy="12" r="1.8" fill="#17383f"/>',
  auto: '<path d="M4 20L15 9" stroke="#f4e6c8" stroke-width="2.6" stroke-linecap="round"/><path d="M17 2l1.2 3 3 1.2-3 1.2L17 10.4l-1.2-3-3-1.2 3-1.2z" fill="#f2b33d"/><circle cx="7" cy="5" r="1.4" fill="#f2b33d"/><circle cx="20" cy="15" r="1.4" fill="#f2b33d"/>',
  steady: '<ellipse cx="12" cy="18" rx="7" ry="2.6" fill="#f2b33d" stroke="#17383f"/><ellipse cx="12" cy="14" rx="7" ry="2.6" fill="#f2b33d" stroke="#17383f"/><ellipse cx="12" cy="10" rx="7" ry="2.6" fill="#f2b33d" stroke="#17383f"/><path d="M12 8.6v2.8" stroke="#17383f" stroke-width="1.5"/>',
  well2: '<circle cx="8" cy="12" r="6" fill="#f4e6c8"/><circle cx="8" cy="12" r="4" fill="#3aa7a3"/><circle cx="17" cy="12" r="6" fill="#f4e6c8"/><circle cx="17" cy="12" r="4" fill="#e2622b"/>',
  calm: '<path d="M15 3a9 9 0 1 0 6 14A7 7 0 0 1 15 3z" fill="#f4e6c8"/><path d="M5 21h14" stroke="#3aa7a3" stroke-width="2" stroke-linecap="round"/>',
  skips: '<path d="M3 5l8 7-8 7zM12 5l8 7-8 7z" fill="#f2b33d"/><path d="M21 5v14" stroke="#f4e6c8" stroke-width="2.4"/>',
  boost: '<text x="12" y="17" text-anchor="middle" font-size="14" font-weight="900" font-family="Arial Black,Arial" fill="#f2b33d">x2</text><path d="M4 20h16" stroke="#e2622b" stroke-width="2"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#3aa7a3" stroke="#f4e6c8" stroke-width="1.8"/><path d="M8 12l3 3 5-6" stroke="#f4e6c8" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
  dialSize: '<path d="M12 2l5 6H7z" fill="#f2b33d"/><path d="M12 22l-5-6h10z" fill="#f2b33d"/><circle cx="12" cy="12" r="2.6" fill="#f4e6c8"/>',
  dialShape: '<circle cx="6" cy="7" r="4" fill="#f4e6c8"/><rect x="13" y="3" width="8" height="8" fill="#f2b33d"/><path d="M12 13l5 9H7z" fill="#e2622b"/>',
  undo: '<path d="M8 5L3 10l5 5" stroke="#f2b33d" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 10h9a6 6 0 0 1 0 12H9" stroke="#f4e6c8" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
  freeze: '<path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17" stroke="#8ec4ea" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="4.5" fill="#17383f" stroke="#f4e6c8" stroke-width="1.6"/><path d="M12 10v2.4l1.6 1" stroke="#f4e6c8" stroke-width="1.4" fill="none"/>',
  bucket: '<path d="M5 9l7-6 7 6-7 7z" fill="#f4e6c8" stroke="#17383f" stroke-width="1.2"/><path d="M19 9c1.5 2.5 2.5 4 2.5 5.5a2.5 2.5 0 0 1-5 0c0-1.5 1-3 2.5-5.5z" fill="#3aa7a3"/><path d="M3 21h18" stroke="#f2b33d" stroke-width="2.4" stroke-linecap="round"/>',
  cushion: '<path d="M3 9c0-3 3-4 9-4s9 1 9 4v6c0 3-3 4-9 4s-9-1-9-4z" fill="#e2622b"/><path d="M8 12h8M12 8v8" stroke="#f4e6c8" stroke-width="2" stroke-linecap="round"/>',
  tip: '<circle cx="9" cy="14" r="7" fill="#f2b33d" stroke="#17383f" stroke-width="1.2"/><text x="9" y="18" text-anchor="middle" font-size="9" font-weight="900" font-family="Arial Black,Arial" fill="#17383f">+2</text><path d="M18 2l-3 7h3l-2 7 6-9h-3l2-5z" fill="#f4e6c8"/>',
  shop: '<path d="M3 10h18v11H3z" fill="#f4e6c8"/><path d="M2 4h20l-1 6H3z" fill="#e2622b"/><path d="M7 4v6M12 4v6M17 4v6" stroke="#f4e6c8" stroke-width="1.4"/><path d="M10 21v-6h4v6" fill="#17383f"/>'
};
function storeIcon(id) { return '<svg viewBox="0 0 24 24">' + (STORE_ICONS[id] || STORE_ICONS.shop) + "</svg>"; }
var GAL_COL = { home: ["#3aa7a3", "#f4e6c8"], "bot:hot": ["#e2622b", "#f2b33d"], "bot:chill": ["#8ec4ea", "#ffffff"], "bot:low": ["#2e6ebe", "#46beba"], "bot:high": ["#b8452c", "#f4dca0"],
  "shapes:basic": ["#f2b33d", "#f4e6c8"], "shapes:suits": ["#d65430", "#f4e6c8"], "shapes:long": ["#a06be0", "#f4e6c8"], size: ["#84ba54", "#f4e6c8"] };
function drawGalaxyArt(c, info) { // a spiral galaxy in the complication's colours
  var w = c.clientWidth || 300, h = c.clientHeight || 120, d = L.dpr, x = c.getContext("2d"), r = makeRng(77 + info.g * 13 + (info.comp || "").length), k, a;
  c.width = Math.round(w * d); c.height = Math.round(h * d); x.scale(d, d);
  var col = GAL_COL[info.comp || "home"];
  x.fillStyle = "#17383f"; x.fillRect(0, 0, w, h);
  x.fillStyle = "#f4e6c8"; for (k = 0; k < 40; k++) star4(x, r() * w, r() * h, 0.6 + r() * 1.4);
  x.save(); x.translate(w / 2, h / 2); x.scale(1, 0.42); x.rotate(r() * 6);
  for (var arm = 0; arm < 2; arm++) for (k = 0; k < 140; k++) {
    a = k / 140 * 9 + arm * Math.PI; var rad = 4 + k * 0.75, s = 1.2 + r() * 2.6 * (1 - k / 160);
    x.fillStyle = k % 3 ? col[0] : col[1]; x.globalAlpha = 0.9 - k / 220;
    x.beginPath(); x.arc(Math.cos(a) * rad + (r() - 0.5) * 8, Math.sin(a) * rad + (r() - 0.5) * 8, s, 0, 7); x.fill();
  }
  x.globalAlpha = 1; x.fillStyle = col[1]; x.beginPath(); x.arc(0, 0, 9, 0, 7); x.fill();
  x.restore();
  x.fillStyle = "#f4e6c8"; x.font = "900 13px sans-serif"; x.textAlign = "left"; x.fillText("GALAXY " + (info.g + 1), 10, h - 10);
}
function drawDemoPlanet(c, ids, frac) { // tutorial: a half-painted planet, square by square
  var G = 20, cs = Math.max(2, Math.round(6 * L.dpr)), px = G * cs, x = c.getContext("2d"), g = makeGrid(G, "circle"), i, n = 0, r = makeRng(3);
  c.width = c.height = px; c.style.width = c.style.height = (px / L.dpr) + "px";
  for (i = 0; i < G * G; i++) if (g.inside[i]) {
    var X = (i % G) * cs, Y = ((i / G) | 0) * cs, u = (i % G) / G, v = ((i / G) | 0) / G;
    x.fillStyle = POSTER() ? "#0f272c" : "#0a1030"; x.fillRect(X, Y, cs, cs);
    if (u + v * 0.4 < frac * 1.4 && r() < 0.97) { var id = ids[Math.min(ids.length - 1, Math.floor(v * ids.length))]; texDraw(x, id, X * 4, Y * 4, cs * 4, cs * 4, X, Y, cs, cs); }
    x.fillStyle = "rgba(255,255,255,.12)"; x.fillRect(X, Y, cs, 1); x.fillRect(X, Y, 1, cs); n++;
  }
}
