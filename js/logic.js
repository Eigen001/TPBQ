"use strict";
var VERSION = "v1.0 build 2026-11-15 15:30 (story + arcade)";

/* ================= PURE LOGIC (no DOM) - tested by logic.test.mjs ================= */
// THE one tunable object. Everything here is live-editable in the settings panel.
var CONFIG_DEFAULTS = {
  roundSeconds: 90,
  canvasDiameterPct: 70,            // MAX planet diameter as % of screen width
  GRID: 75,                         // squares across a full-size planet
  minTargetPct: 6,
  maxTargetPct: 73,
  artStyle: "poster",               // poster | classic
  musicStyle: "chip",               // chip | wave | funk
  brushRadiusPct: 22,               // brush radius as % of the MAX planet radius
  paintFinishPct: 99,               // planet auto-finishes at this % covered
  brushOffsetY: 5,                  // px the spray lands above the finger
  gradeMaxSum: [4, 10, 18, 28, 40], // S, A, B, C, D (inclusive); above = F
  payPct: [125, 100, 75, 50, 25, 0],
  bonusMC: [10, 5, 3, 1, 0, -5],
  payRanges: [[3, 8], [7, 12], [9, 15]],      // 3, 4, 5 terrains
  skipEnabled: true,
  skipPenaltySec: 0,
  debugLivePct: false,
  countdown: true,
  musicVolume: 60,
  sfxVolume: 80,
  // ----- story -----
  pointsByGrade: [10, 7, 5, 3, 1, 0],
  stockPerPoints: 10,
  quotasG1: [10, 12, 14, 16, 18],
  quotasG2: [18, 20, 22, 24, 28],
  quotasG3: [26, 28, 30, 32, 38],
  galaxyTerrains: [3, 4, 5],
  sizeRangeG1: [65, 100],
  sizeRangeG2: [75, 100],
  sizeRangeG3: [75, 100],
  // ----- tier 2 / 3 -----
  tier2SlotChance: 0.35,
  tier2Bonus: 2,
  tier3Bonus: 4,
  mixMode: "toggle",                // toggle | hold
  // ----- store -----
  storeSlots: 3,
  priceBot: 25, priceMix: 15, priceBrush: 20, priceTime: 20, pricePeek: 15, priceAuto: 20, priceSteady: 15,
  maxBrushStacks: 3, maxTimeStacks: 3,
  brushStackMul: 1.15, timeStackSec: 10, peekSec: 5, autoFinishPct: 95,
  // ----- HQ (Stock prices) -----
  hqStartBot: 8, hqSlots: 10, hqReroll: 6, hqHeadStart: 6, hqBigBrush: 5, hqSuns: 3, hqHats: 3,
  // ----- arcade -----
  arcadeCount: 3,                   // 3 | 4 | 5 | 0 = random per order
  randomShapes: false,
  arcadeTier2: false,
  arcadeTier2Unlocked: true,        // later gate: reach Galaxy 2 in story
  // ----- boss modifiers -----
  modHidden: true, hiddenShowSec: 5,
  modShrink: true, shrinkToPct: 50,
  modMeteors: true, meteorEverySec: 8, meteorWarnSec: 0.7, meteorSizeMul: 1.5,
  modSpin: true, spinDegPerSec: 6,
  modMirror: true,
  modRush: true, rushSeconds: 60,
  modVip: true,
  modFickle: true, fickleShiftMin: 5, fickleShiftMax: 10, fickleOrderSec: 15,
  modFog: true, fogRadiusMul: 2, fogFadeSec: 1.5,
  modLocked: true, lockedCount: 2, lockedEverySec: 10
};
function T(id, name, color, tier) { return { id: id, name: name, color: color, tier: tier }; }
var TERRAINS = [
  T(0, "BLANK", [24, 27, 40], 0),
  T(1, "FOREST", [34, 120, 52], 1), T(2, "DESERT", [222, 184, 98], 1), T(3, "SEA", [24, 58, 150], 1),
  T(4, "LAKE", [120, 215, 235], 1), T(5, "PLAINS", [196, 232, 160], 1), T(6, "HILLS", [176, 64, 44], 1),
  T(7, "MOUNTAINS", [138, 84, 66], 2), T(8, "JUNGLE", [22, 96, 52], 2), T(9, "TUNDRA", [176, 204, 192], 2),
  T(10, "ICEBERG", [150, 200, 240], 2), T(11, "VALLEY", [132, 186, 84], 2), T(12, "CANYON", [200, 112, 44], 2),
  T(13, "DEEP SEA", [20, 44, 110], 2), T(14, "ARCTIC", [226, 238, 244], 2), T(15, "CAVE", [104, 78, 70], 2),
  T(16, "MAGMA", [120, 26, 18], 3),
  T(17, "SWAMP", [104, 136, 72], 2), T(18, "OASIS", [84, 190, 160], 2), T(19, "PRAIRIE", [212, 204, 116], 2),
  T(20, "SAVANNA", [198, 172, 84], 2), T(21, "BEACH", [244, 220, 160], 2), T(22, "ESTUARY", [60, 146, 196], 2),
  T(23, "MESA", [190, 92, 58], 3), T(24, "SHRUBLAND", [160, 150, 84], 3)
];
var GRADES = ["S", "A", "B", "C", "D", "F"];
var ANY = -1; // retired; kept so old helpers stay harmless

/* ----- recipes: tier 2/3 terrains are MADE on the planet (bots transform, MIX combines) ----- */
var BOTS = ["hot", "chill", "low", "high"];
var BOT_NAMES = { hot: "HOT BOT", chill: "CHILL BOT", low: "LOW BOT", high: "HIGH BOT" };
var BOT_RECIPES = { hot: { 1: 8, 7: 16 }, chill: { 5: 9, 3: 10, 2: 14 }, low: { 5: 11, 2: 12, 3: 13, 6: 15 }, high: { 6: 7 } };
var MIXES = [
  { id: "swamp", a: 1, b: 4, out: 17 }, { id: "oasis", a: 2, b: 4, out: 18 }, { id: "prairie", a: 5, b: 6, out: 19 },
  { id: "savanna", a: 5, b: 1, out: 20 }, { id: "beach", a: 2, b: 3, out: 21 }, { id: "estuary", a: 4, b: 3, out: 22 },
  { id: "mesa", a: 7, b: 2, out: 23 }, { id: "shrubland", a: 20, b: 2, out: 24 }
];
function emptyOwned() { return { bots: {}, mixes: {} }; }
function allOwned() { var o = emptyOwned(); BOTS.forEach(function (b) { o.bots[b] = true; }); MIXES.forEach(function (m) { o.mixes[m.id] = true; }); return o; }
function recipeFor(id) { // how a terrain is made: { bot, from } or { mix, a, b }; null for base terrains
  var b, k, i;
  for (b = 0; b < BOTS.length; b++) for (k in BOT_RECIPES[BOTS[b]]) if (BOT_RECIPES[BOTS[b]][k] === id) return { bot: BOTS[b], from: +k };
  for (i = 0; i < MIXES.length; i++) if (MIXES[i].out === id) return { mix: MIXES[i].id, a: MIXES[i].a, b: MIXES[i].b };
  return null;
}
function makeable(id, owned) {
  if (id >= 1 && id <= 6) return true;
  var rc = recipeFor(id); if (!rc || !owned) return false;
  if (rc.bot) return !!owned.bots[rc.bot] && makeable(rc.from, owned);
  return !!owned.mixes[rc.mix] && makeable(rc.a, owned) && makeable(rc.b, owned);
}
function makeableList(owned) { var o = []; for (var id = 7; id < TERRAINS.length; id++) if (makeable(id, owned)) o.push(id); return o; }
function botOut(bot, cur, owned) { return owned && owned.bots[bot] ? (BOT_RECIPES[bot][cur] || 0) : 0; }
function mixOut(cur, id, owned) {
  if (!owned) return 0;
  for (var i = 0; i < MIXES.length; i++) { var m = MIXES[i]; if (owned.mixes[m.id] && ((m.a === cur && m.b === id) || (m.b === cur && m.a === id))) return m.out; }
  return 0;
}
function baseInputs(id, out) { // the base terrains (1-6) needed to make a terrain
  out = out || {};
  if (id >= 1 && id <= 6) { out[id] = true; return out; }
  var rc = recipeFor(id); if (!rc) return out;
  if (rc.bot) baseInputs(rc.from, out); else { baseInputs(rc.a, out); baseInputs(rc.b, out); }
  return out;
}
function recipeText(id) {
  var rc = recipeFor(id); if (!rc) return "";
  return rc.bot ? TERRAINS[rc.from].name + " + " + BOT_NAMES[rc.bot] : TERRAINS[rc.a].name + " + " + TERRAINS[rc.b].name + " (MIX)";
}

function roundHalfUp(x) { return Math.floor(x + 0.5); }
// exact integer version of roundHalfUp(count/total*100)
function pctOf(count, total) { return total > 0 ? Math.floor((200 * count + total) / (2 * total)) : 0; }

function makeRng(seed) { // mulberry32
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
function shuffle(arr, rng) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
function splitPcts(n, min, max, rng) { // n integers summing to 100, each within [min, max]
  min = Math.max(0, Math.min(min | 0, Math.floor(100 / n)));
  max = Math.min(100, Math.max(max === undefined ? 100 : max | 0, Math.ceil(100 / n)));
  var rem = 100 - n * min, i, tries, p, prev, ok, cuts;
  for (tries = 0; tries < 200; tries++) {
    cuts = []; for (i = 0; i < n - 1; i++) cuts.push(randInt(rng, 0, rem));
    cuts.sort(function (a, b) { return a - b; });
    p = []; prev = 0;
    for (i = 0; i < n - 1; i++) { p.push(min + cuts[i] - prev); prev = cuts[i]; }
    p.push(min + rem - prev);
    ok = true; for (i = 0; i < n; i++) if (p[i] > max) ok = false;
    if (ok) return p;
  }
  p = []; for (i = 0; i < n; i++) p.push(min);
  while (rem > 0) { i = randInt(rng, 0, n - 1); if (p[i] < max) { p[i]++; rem--; } }
  return p;
}
/* ----- random customer and planet names ----- */
var ALIEN_TITLES = ["Mr.", "Mrs.", "Ms.", "Dr.", "Lady", "Lord", "Captain", "Madame", "Sir", "Chief", "Professor", "Baron", "Auntie", "Admiral", "Dame", "Uncle"];
var ALIEN_NAMES = ["Blorbo", "Zib", "Snorvek", "Glorp", "Vex", "Quazzle", "Mubb", "Xanthor", "Plim", "Zorgle", "Wubwub", "Skreel", "Thrax", "Oomla", "Fizzbin", "Krellick", "Bloop", "Yonk", "Drazzle", "Splern", "Gnarf", "Zizzix", "Hork", "Pleeb", "Morbo", "Squee", "Blixt", "Urgo"];
var PLANET_A = ["Glorb", "Squonk", "Blip", "Wobbl", "Zant", "Kreb", "Floob", "Mox", "Thwip", "Yibb", "Quorn", "Zeeb", "Plonk", "Vorp", "Snarf", "Dingl", "Bort", "Klaxx", "Noob", "Frell", "Gump", "Skrob", "Womp", "Zuul"];
var PLANET_B = ["ax", "ulon", "aria", "ix", "os", "opolis", "onia", "ara", "ium", "oid", "", "", "us", "eth"];
var PLANET_C = [" Prime", " IV", " VII", " IX", "-7", "-12", " Minor", " Major", " B", " II", "", "", "", " XL", " Jr."];
function alienName(rng) { return ALIEN_TITLES[randInt(rng, 0, ALIEN_TITLES.length - 1)] + " " + ALIEN_NAMES[randInt(rng, 0, ALIEN_NAMES.length - 1)]; }
function planetName(rng) {
  var n = PLANET_A[randInt(rng, 0, PLANET_A.length - 1)] + PLANET_B[randInt(rng, 0, PLANET_B.length - 1)];
  return rng() < 0.15 ? "New " + n : n + PLANET_C[randInt(rng, 0, PLANET_C.length - 1)];
}
/* ----- planet shapes: inside(u, v) with u right, v down, both in [-1, 1] ----- */
function inPoly(p, u, v) {
  var c = false;
  for (var i = 0, j = p.length - 1; i < p.length; j = i++)
    if ((p[i][1] > v) !== (p[j][1] > v) && u < (p[j][0] - p[i][0]) * (v - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
}
function ngon(n, r, rot, cy, r2) { // regular polygon, or a star when r2 (inner radius) is given
  var p = [], k = r2 ? n * 2 : n;
  for (var i = 0; i < k; i++) { var a = rot + i * 2 * Math.PI / k, rr = r2 && i % 2 ? r2 : r; p.push([Math.cos(a) * rr, Math.sin(a) * rr + (cy || 0)]); }
  return p;
}
function disc(u, v, cx, cy, r) { return (u - cx) * (u - cx) + (v - cy) * (v - cy) <= r * r; }
function heartFn(x, y) { var a = x * x + y * y - 1; return a * a * a - x * x * y * y * y <= 0; }
var UP = -Math.PI / 2;
var POLY = {
  kite: [[0, -1], [0.72, -0.3], [0, 1], [-0.72, -0.3]],
  pentagon: ngon(5, 1, UP, 0.1), hexagon: ngon(6, 1, 0, 0), octagon: ngon(8, 1.04, Math.PI / 8, 0),
  star: ngon(5, 1.05, UP, 0.08, 0.44), triangle: [[0, -1], [0.82, 0.97], [-0.82, 0.97]]
};
var SHAPES = {
  circle: function (u, v) { return u * u + v * v <= 1; },
  square: function (u, v) { return true; },
  rectangle: function (u, v) { return Math.abs(v) <= 0.6; },
  diamond: function (u, v) { return Math.abs(u) + Math.abs(v) <= 1; },
  oval: function (u, v) { return u * u + (v / 0.64) * (v / 0.64) <= 1; },
  kite: function (u, v) { return inPoly(POLY.kite, u, v); },
  pentagon: function (u, v) { return inPoly(POLY.pentagon, u, v); },
  hexagon: function (u, v) { return inPoly(POLY.hexagon, u, v); },
  octagon: function (u, v) { return inPoly(POLY.octagon, u, v); },
  heart: function (u, v) { return heartFn(u * 1.2, -v * 1.2 + 0.12); },
  club: function (u, v) {
    return disc(u, v, 0, -0.5, 0.44) || disc(u, v, -0.48, 0.12, 0.44) || disc(u, v, 0.48, 0.12, 0.44) || disc(u, v, 0, -0.08, 0.3) ||
      (v >= 0.1 && v <= 0.96 && Math.abs(u) <= 0.1 + 0.3 * Math.pow((v - 0.1) / 0.86, 2));
  },
  spade: function (u, v) {
    return heartFn(u * 1.2, (v + 1) * 1.5 - 1) || (v >= 0.3 && v <= 0.96 && Math.abs(u) <= 0.1 + 0.3 * Math.pow((v - 0.3) / 0.66, 2));
  },
  star: function (u, v) { return inPoly(POLY.star, u, v); },
  crescent: function (u, v) { return u * u + v * v <= 1 && !disc(u, v, 0.48, 0, 0.84); },
  cross: function (u, v) { return Math.abs(u) <= 0.36 || Math.abs(v) <= 0.36; },
  triangle: function (u, v) { return inPoly(POLY.triangle, u, v); },
  teardrop: function (u, v) { return disc(u, v, 0, 0.36, 0.64) || (v > -1 && v <= 0.36 && Math.abs(u) <= 0.64 * Math.pow((v + 1) / 1.36, 0.8)); },
  cloud: function (u, v) {
    return v <= 0.62 && (disc(u, v, -0.52, 0.2, 0.44) || disc(u, v, -0.08, -0.12, 0.56) || disc(u, v, 0.5, 0.14, 0.48) || (Math.abs(u) <= 0.62 && v >= 0.1));
  },
  semicircle: function (u, v) { return v <= 0.5 && u * u + (v - 0.5) * (v - 0.5) <= 1; }
};
var SHAPE_NAMES = Object.keys(SHAPES);

function makeGrid(G, shape) {
  var fn = SHAPES[shape] || SHAPES.circle, inside = new Uint8Array(G * G), total = 0, c = G / 2;
  for (var y = 0; y < G; y++) for (var x = 0; x < G; x++)
    if (fn((x + 0.5 - c) / c, (y + 0.5 - c) / c)) { inside[y * G + x] = 1; total++; }
  return { G: G, shape: SHAPES[shape] ? shape : "circle", cells: new Uint8Array(G * G), inside: inside, total: total };
}
function countGrid(grid) {
  var c = []; for (var k = 0; k < TERRAINS.length; k++) c.push(0);
  for (var i = 0; i < grid.cells.length; i++) if (grid.inside[i]) c[grid.cells[i]]++;
  return c;
}
// leftover unpainted slivers on a finished planet take the colour of their neighbours (picture only; scoring ignores them)
function fillBlanks(cells, grid) {
  var G = grid.G, changed = true, guard = 0;
  while (changed && guard++ < 64) {
    changed = false; var prev = new Uint8Array(cells);
    for (var i = 0; i < cells.length; i++) {
      if (!grid.inside[i] || prev[i] !== 0) continue;
      var x = i % G, v = (x > 0 && prev[i - 1]) || (x < G - 1 && prev[i + 1]) || (i >= G && prev[i - G]) || (i + G < cells.length && prev[i + G]) || 0;
      if (v) { cells[i] = v; changed = true; }
    }
  }
  return cells;
}

function gradeIndexForSum(S, cfg) {
  for (var i = 0; i < 5; i++) if (S <= cfg.gradeMaxSum[i]) return i;
  return 5;
}
function payFor(base, gi, cfg) { return Math.ceil(base * cfg.payPct[gi] / 100 - 1e-9); }
function scorePlanet(order, counts, total, cfg) {
  var rows = [], S = 0;
  total = total - counts[0]; // percentages are of the painted area
  order.slots.forEach(function (s) {
    var actual = pctOf(counts[s.terrain], total), err = Math.abs(actual - s.pct);
    S += err; rows.push({ terrain: s.terrain, target: s.pct, actual: actual, err: err });
  });
  var gi = gradeIndexForSum(S, cfg);
  return { rows: rows, S: S, gi: gi, grade: GRADES[gi], basePay: order.basePay, paid: payFor(order.basePay, gi, cfg) };
}
function overallGrade(gis, cfg) {
  if (!gis.length) return null;
  var sum = 0; gis.forEach(function (g) { sum += 5 - g; });
  var gi = 5 - roundHalfUp(sum / gis.length);
  return { gi: gi, grade: GRADES[gi], bonus: cfg.bonusMC[gi] };
}

var SHAPES_SIMPLE = ["circle", "square", "rectangle", "oval", "diamond", "pentagon", "hexagon", "octagon", "triangle", "semicircle"];
function systemName(rng) {
  var n = PLANET_A[randInt(rng, 0, PLANET_A.length - 1)] + PLANET_B[randInt(rng, 0, PLANET_B.length - 1)], k = randInt(rng, 0, 5);
  return k === 0 ? "The " + n + " Expanse" : n + [" System", " System", " Cluster", " Reach", " Belt"][k - 1];
}

/* ----- orders. spec = { n (0 = random 3-5), shapes[], sizeMin, sizeMax (%), tier2, owned } ----- */
function generateOrder(spec, cfg, rng) {
  var n = spec.n ? spec.n : randInt(rng, 3, 5), ids = shuffle([1, 2, 3, 4, 5, 6], rng).slice(0, n), i, bonus = 0;
  var mk = spec.tier2 ? makeableList(spec.owned) : [];
  if (mk.length) for (i = 0; i < n; i++) if (rng() < cfg.tier2SlotChance) {
    var cand = mk.filter(function (t) { return ids.indexOf(t) < 0; });
    if (cand.length) { ids[i] = cand[randInt(rng, 0, cand.length - 1)]; bonus += TERRAINS[ids[i]].tier === 3 ? cfg.tier3Bonus : cfg.tier2Bonus; }
  }
  var pcts = splitPcts(n, cfg.minTargetPct, cfg.maxTargetPct, rng), slots = [], big = ids[0], bigPct = -1;
  for (i = 0; i < n; i++) { slots.push({ terrain: ids[i], pct: pcts[i] }); if (pcts[i] > bigPct) { bigPct = pcts[i]; big = ids[i]; } }
  var pr = cfg.payRanges[n - 3], shapes = spec.shapes && spec.shapes.length ? spec.shapes : ["circle"];
  var o = {
    n: n, slots: slots, basePay: randInt(rng, pr[0], pr[1]), bonus: bonus, tint: big,
    look: { head: randInt(rng, 0, 2), eyes: randInt(rng, 1, 3), antenna: randInt(rng, 0, 2) },
    shape: shapes[randInt(rng, 0, shapes.length - 1)],
    size: randInt(rng, spec.sizeMin || 100, spec.sizeMax || 100) / 100
  };
  o.name = alienName(rng); o.planet = planetName(rng);
  return o;
}

/* ----- auto-finish: fill the blanks with the terrains that best close the gaps to the order ----- */
function autoFill(grid, order) {
  var G = grid.G, cells = new Uint8Array(grid.cells), counts = countGrid(grid), total = grid.total, blanks = [], i, k, s;
  for (i = 0; i < cells.length; i++) if (grid.inside[i] && !cells[i]) blanks.push(i);
  var def = order.slots.map(function (sl) { return sl.pct / 100 * total - counts[sl.terrain]; }), alloc = {}, left = blanks.length;
  while (left > 0) { // one cell at a time to the most under-target terrain
    var best = -1, bv = 0.5;
    for (s = 0; s < def.length; s++) if (def[s] >= bv) { bv = def[s]; best = s; }
    if (best < 0) break;
    var t = order.slots[best].terrain; alloc[t] = (alloc[t] || 0) + 1; def[best]--; left--;
  }
  function nb(i) { var x = i % G, o = []; if (x > 0) o.push(i - 1); if (x < G - 1) o.push(i + 1); if (i >= G) o.push(i - G); if (i + G < cells.length) o.push(i + G); return o; }
  var changed = true;
  while (changed) { // a blank next to a terrain that still has allocation takes it
    changed = false;
    for (k = 0; k < blanks.length; k++) {
      i = blanks[k]; if (cells[i]) continue;
      var ns = nb(i), j;
      for (j = 0; j < ns.length; j++) { var v = cells[ns[j]]; if (v && alloc[v] > 0) { cells[i] = v; alloc[v]--; changed = true; break; } }
    }
  }
  for (k = 0; k < blanks.length; k++) { // otherwise any terrain with allocation left
    i = blanks[k]; if (cells[i]) continue;
    for (var key in alloc) if (alloc[key] > 0) { cells[i] = +key; alloc[key]--; break; }
  }
  return fillBlanks(cells, grid); // leftovers (every gap closed) take a neighbour's terrain
}

/* ----- boss modifiers ----- */
var MODS = ["hidden", "shrink", "meteors", "spin", "mirror", "rush", "vip", "fickle", "fog", "locked"];
var MOD_INFO = {
  hidden: ["HIDDEN ORDER", "Percentages vanish after a few seconds"], shrink: ["SHRINKING BRUSH", "Your brush shrinks all round"],
  meteors: ["METEORS", "Chunks of your planet get blasted blank"], spin: ["SPINNING PLANET", "The planet rotates while you paint"],
  mirror: ["MIRROR BRUSH", "Every dab is mirrored left-right"], rush: ["RUSH", "A much shorter clock"],
  vip: ["VIP CLIENTS", "Below grade B earns nothing"], fickle: ["FICKLE CLIENT", "Targets change mid-order"],
  fog: ["FOG", "You only see near your finger"], locked: ["LOCKED PALETTE", "Two terrains are locked at a time"]
};
function modKey(m) { return "mod" + m.charAt(0).toUpperCase() + m.slice(1); }
function enabledMods(cfg) { return MODS.filter(function (m) { return cfg[modKey(m)]; }); }
function pickBossMods(cfg, rng) { // one per galaxy boss; the last boss gets two different ones
  var pool = enabledMods(cfg), out = [[], [], []];
  if (!pool.length) return out;
  for (var g = 0; g < 3; g++) { var p = shuffle(pool.slice(), rng); out[g] = p.slice(0, g === 2 ? 2 : 1); }
  return out;
}
function fickleShift(order, cfg, rng) { // two targets trade 5-10 points; still sums to 100, nothing below 1
  var n = order.slots.length; if (n < 2) return false;
  var idx = shuffle(order.slots.map(function (s, i) { return i; }), rng), d = randInt(rng, cfg.fickleShiftMin, cfg.fickleShiftMax), a = idx[0], b = idx[1];
  if (order.slots[b].pct - d < 1 && order.slots[a].pct - d >= 1) { var t = a; a = b; b = t; }
  d = Math.min(d, order.slots[b].pct - 1);
  if (d <= 0) return false;
  order.slots[a].pct += d; order.slots[b].pct -= d;
  return true;
}
function pickLocked(order, cfg, rng) { // never lock a base terrain the current order needs
  var need = {}; order.slots.forEach(function (s) { baseInputs(s.terrain, need); });
  var cand = [1, 2, 3, 4, 5, 6].filter(function (t) { return !need[t]; });
  return shuffle(cand, rng).slice(0, Math.max(0, cfg.lockedCount | 0));
}

/* ----- a round (one 90 s level). spec adds: seconds, mods[], brushMul, autoFinish, steady ----- */
function gridFor(order, cfg) { return makeGrid(Math.max(4, Math.round((cfg.GRID | 0) * (order.size || 1))), order.shape); }
function armOrder(r) {
  r.grid = gridFor(r.queue[0], r.cfg); r.blank = r.grid.total; r.planetStart = r.elapsed;
  r.fickleAt = r.mod.fickle ? r.elapsed + (0.3 + 0.3 * r.rng()) * r.cfg.fickleOrderSec : Infinity;
  if (r.mod.locked) { r.locked = pickLocked(r.queue[0], r.cfg, r.rng); r.lockNext = r.elapsed + r.cfg.lockedEverySec; }
}
function createPaintRound(cfg, spec, rng) {
  var mod = {}; (spec.mods || []).forEach(function (m) { mod[m] = true; });
  var secs = spec.seconds || cfg.roundSeconds;
  var r = {
    cfg: cfg, spec: spec, rng: rng, owned: spec.owned || emptyOwned(), mod: mod,
    timeLeft: secs, seconds: secs, elapsed: 0, planetStart: 0, over: false, endReason: null,
    queue: [generateOrder(spec, cfg, rng), generateOrder(spec, cfg, rng)], results: [], skipped: 0, points: 0,
    brushMul: spec.brushMul || 1, autoFinish: !!spec.autoFinish, steady: !!spec.steady,
    events: [], locked: [], meteor: null, meteorNext: cfg.meteorEverySec
  };
  armOrder(r);
  return r;
}
function brushRad(r) { // in grid squares; relative to the MAX planet, so small planets need fewer dabs
  var k = r.mod.shrink ? 1 - (1 - r.cfg.shrinkToPct / 100) * Math.min(1, r.elapsed / r.seconds) : 1;
  return (r.cfg.GRID / 2) * r.cfg.brushRadiusPct / 100 * r.brushMul * k;
}
function advanceOrder(r) { r.queue.shift(); r.queue.push(generateOrder(r.spec, r.cfg, r.rng)); r.meteor = null; armOrder(r); }
function meteorStrike(r, m) {
  var g = r.grid, G = g.G, n = 0;
  for (var y = Math.max(0, Math.floor(m.cy - m.rad)); y <= Math.min(G - 1, Math.ceil(m.cy + m.rad)); y++)
    for (var x = Math.max(0, Math.floor(m.cx - m.rad)); x <= Math.min(G - 1, Math.ceil(m.cx + m.rad)); x++) {
      var i = y * G + x;
      if (g.inside[i] && g.cells[i] && (x + 0.5 - m.cx) * (x + 0.5 - m.cx) + (y + 0.5 - m.cy) * (y + 0.5 - m.cy) <= m.rad * m.rad) { g.cells[i] = 0; r.blank++; n++; }
    }
  return n;
}
function roundTick(r, dt) {
  if (r.over) return;
  r.timeLeft -= dt; r.elapsed += dt;
  if (r.timeLeft <= 0) { r.elapsed += r.timeLeft; r.timeLeft = 0; r.over = true; r.endReason = "time"; return; }
  if (r.elapsed >= r.fickleAt) { r.fickleAt = Infinity; if (fickleShift(r.queue[0], r.cfg, r.rng)) r.events.push("fickle"); }
  if (r.mod.meteors) {
    if (!r.meteor && r.elapsed >= r.meteorNext - r.cfg.meteorWarnSec) {
      var g = r.grid, painted = [], i;
      for (i = 0; i < g.cells.length; i++) if (g.inside[i] && g.cells[i]) painted.push(i);
      if (painted.length) { i = painted[randInt(r.rng, 0, painted.length - 1)]; r.meteor = { cx: i % g.G + 0.5, cy: Math.floor(i / g.G) + 0.5, rad: brushRad(r) * r.cfg.meteorSizeMul, at: r.meteorNext }; r.events.push("meteorWarn"); }
      else r.meteorNext += 1;
    }
    if (r.meteor && r.elapsed >= r.meteor.at) { meteorStrike(r, r.meteor); r.meteor = null; r.meteorNext = r.elapsed + r.cfg.meteorEverySec; r.events.push("meteor"); }
  }
  if (r.mod.locked && r.elapsed >= r.lockNext) { r.locked = pickLocked(r.queue[0], r.cfg, r.rng); r.lockNext = r.elapsed + r.cfg.lockedEverySec; r.events.push("locked"); }
}
function roundSkip(r) {
  if (r.over || !r.cfg.skipEnabled) return false;
  r.skipped++; advanceOrder(r);
  if (r.cfg.skipPenaltySec > 0) roundTick(r, r.cfg.skipPenaltySec);
  return true;
}
// One dab at (cx,cy), radius rad, in grid squares. Every square the brush touches at all changes whole.
// opt.bot = transform brush (only cells with an owned recipe change); opt.mix = MIX on (only cells that combine with id change).
function paintSpray(r, cx, cy, rad, id, opt) {
  var changed = [], bot = opt && opt.bot, mix = opt && opt.mix && id > 0;
  if (r.over || !(rad > 0)) return changed;
  if (!bot && r.locked.indexOf(id) >= 0) return changed;
  var g = r.grid, G = g.G, cells = g.cells, r2 = rad * rad;
  var x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(G - 1, Math.floor(cx + rad));
  var y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(G - 1, Math.floor(cy + rad));
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
    var i = y * G + x; if (!g.inside[i]) continue;
    var cur = cells[i], nid = bot ? botOut(bot, cur, r.owned) : mix ? mixOut(cur, id, r.owned) : id;
    if ((bot || mix) && !nid) continue;
    if (nid === cur) continue;
    var nx = cx < x ? x : cx > x + 1 ? x + 1 : cx, ny = cy < y ? y : cy > y + 1 ? y + 1 : cy;
    if ((nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) > r2) continue;
    if (cur === 0) r.blank--; else if (nid === 0) r.blank++;
    cells[i] = nid; changed.push(i);
  }
  return changed;
}
function paintFinishIfDone(r) {
  if (r.over) return null;
  var cfg = r.cfg, pct = r.autoFinish ? cfg.autoFinishPct : cfg.paintFinishPct;
  if (r.blank > Math.max(0, Math.floor(r.grid.total * (100 - pct) / 100))) return null;
  var order = r.queue[0], f, cells;
  if (r.autoFinish) {
    cells = autoFill(r.grid, order);
    f = scorePlanet(order, countGrid({ cells: cells, inside: r.grid.inside }), r.grid.total, cfg);
  } else {
    f = scorePlanet(order, countGrid(r.grid), r.grid.total, cfg);
    cells = fillBlanks(new Uint8Array(r.grid.cells), r.grid);
  }
  f.order = order; f.cells = cells; f.grid = r.grid; f.seconds = r.elapsed - r.planetStart;
  // the tier-2 bonus is part of the order's pay, so it scales with the grade like the base pay does
  var withBonus = payFor(order.basePay + (order.bonus || 0), f.gi, cfg);
  f.points = cfg.pointsByGrade[f.gi]; f.t2 = withBonus - f.paid; f.paid = withBonus; f.steady = r.steady && f.gi <= 2 ? 1 : 0;
  if (r.mod.vip && f.gi > 2) { f.paid = 0; f.points = 0; f.t2 = 0; f.vip = true; }
  r.points += f.points; r.results.push(f); advanceOrder(r);
  return f;
}
function summarizeRound(r) {
  var pay = 0, secs = 0, gis = [], t2 = 0, steady = 0, points = 0;
  r.results.forEach(function (p) { pay += p.paid; secs += p.seconds; gis.push(p.gi); t2 += p.t2; steady += p.steady; points += p.points; });
  var og = overallGrade(gis, r.cfg), bonus = og ? og.bonus : 0;
  return {
    planets: r.results.length, payments: pay, overall: og ? og.grade : "-", overallGi: og ? og.gi : 5, bonus: bonus, t2: t2, steady: steady,
    total: pay + bonus + steady, points: points, secondsLeft: r.timeLeft,
    avgSeconds: r.results.length ? secs / r.results.length : 0, skipped: r.skipped
  };
}

/* ----- story run: 3 galaxies x (4 levels + boss) ----- */
var LEVELS = 15;
function newMeta() { return { stock: 0, hq: {}, best: 0, runs: 0, arcadeTier2Unlocked: false }; }
function levelInfo(level) { return { g: Math.floor(level / 5), l: level % 5, boss: level % 5 === 4 }; }
function quotaFor(level, cfg) { var li = levelInfo(level); return cfg["quotasG" + (li.g + 1)][li.l]; }
function newRun(meta, cfg, rng) {
  var owned = emptyOwned();
  BOTS.forEach(function (b) { if (meta.hq["startBot:" + b]) owned.bots[b] = true; });
  return { level: 0, wallet: 0, points: 0, owned: owned, items: { brush: 0, time: 0, peek: false, auto: false, steady: false },
    bossMods: pickBossMods(cfg, rng), force: null, over: false, won: false, credits: 0 };
}
function levelMods(run, level) {
  var li = levelInfo(level), m = li.boss ? (run.bossMods[li.g] || []).slice() : [];
  if (run.force && level === run.level && m.indexOf(run.force) < 0) m.push(run.force);
  return m;
}
function levelSpec(run, meta, cfg) {
  var li = levelInfo(run.level), mods = levelMods(run, run.level), g = li.g, sr = cfg["sizeRangeG" + (g + 1)];
  var secs = (mods.indexOf("rush") >= 0 ? cfg.rushSeconds : cfg.roundSeconds) + run.items.time * cfg.timeStackSec + (meta.hq.headStart ? 10 : 0);
  return {
    n: cfg.galaxyTerrains[g], shapes: g === 0 ? ["circle"] : g === 1 ? SHAPES_SIMPLE : SHAPE_NAMES, sizeMin: sr[0], sizeMax: sr[1],
    tier2: true, owned: run.owned, seconds: secs, mods: mods, quota: quotaFor(run.level, cfg),
    brushMul: Math.pow(cfg.brushStackMul, run.items.brush) * (meta.hq.bigBrush ? 1.15 : 1),
    autoFinish: run.items.auto, steady: run.items.steady, peek: run.items.peek, story: true, g: g, l: li.l, boss: li.boss
  };
}
function arcadeSpec(cfg, unlocked) {
  var t2 = !!cfg.arcadeTier2 && !!unlocked;
  return { n: cfg.arcadeCount | 0, shapes: cfg.randomShapes ? SHAPE_NAMES : ["circle"], sizeMin: cfg.randomShapes ? 75 : 100, sizeMax: 100,
    tier2: t2, owned: t2 ? allOwned() : emptyOwned(), seconds: cfg.roundSeconds, mods: [], brushMul: 1, story: false };
}
function finishLevel(run, sum, cfg) { // apply a finished level to the run
  var quota = quotaFor(run.level, cfg), passed = sum.points >= quota;
  run.points += sum.points; run.wallet = Math.max(0, run.wallet + sum.total); run.credits += sum.total; run.force = null;
  if (!passed) run.over = true;
  else { run.level++; if (run.level >= LEVELS) { run.over = true; run.won = true; } }
  return { passed: passed, quota: quota };
}
function stockFor(points, cfg) { return Math.floor(points / cfg.stockPerPoints); }
function endRun(run, meta, cfg) { var s = stockFor(run.points, cfg); meta.stock += s; meta.runs++; if (run.points > meta.best) meta.best = run.points; return s; }

/* ----- store (credits) ----- */
function storeItems(cfg) {
  var out = [];
  BOTS.forEach(function (b) {
    var makes = Object.keys(BOT_RECIPES[b]).map(function (k) { return TERRAINS[BOT_RECIPES[b][k]].name; }).join(", ");
    out.push({ id: "bot:" + b, name: BOT_NAMES[b], desc: "Makes " + makes, price: cfg.priceBot });
  });
  MIXES.forEach(function (m) { out.push({ id: "mix:" + m.id, name: TERRAINS[m.out].name + " RECIPE", desc: "MIX " + TERRAINS[m.a].name + " + " + TERRAINS[m.b].name, price: cfg.priceMix }); });
  out.push({ id: "brush", name: "BRUSH +15%", desc: "Bigger brush (stacks)", price: cfg.priceBrush });
  out.push({ id: "time", name: "+10 SECONDS", desc: "Longer clock on every remaining level (stacks)", price: cfg.priceTime });
  out.push({ id: "peek", name: "PEEK", desc: "Once per level: live % readout for a few seconds", price: cfg.pricePeek });
  out.push({ id: "auto", name: "AUTO-FINISH", desc: "Planets finish at " + cfg.autoFinishPct + "% and the gaps fill themselves", price: cfg.priceAuto });
  out.push({ id: "steady", name: "STEADY PAYOUT", desc: "+1 credit per planet graded B or better", price: cfg.priceSteady });
  return out;
}
function itemEligible(run, id, cfg) {
  var p = id.split(":");
  if (p[0] === "bot") return !run.owned.bots[p[1]];
  if (p[0] === "mix") { var m = MIXES.filter(function (x) { return x.id === p[1]; })[0]; return !!m && !run.owned.mixes[m.id] && makeable(m.a, run.owned) && makeable(m.b, run.owned); }
  if (id === "brush") return run.items.brush < cfg.maxBrushStacks;
  if (id === "time") return run.items.time < cfg.maxTimeStacks;
  return id in run.items && !run.items[id];
}
function storeOffers(run, meta, cfg, rng) {
  var pool = storeItems(cfg).filter(function (it) { return itemEligible(run, it.id, cfg); }).map(function (it) { return it.id; });
  return shuffle(pool, rng).slice(0, meta.hq.slots4 ? 4 : Math.max(1, cfg.storeSlots | 0));
}
function buyItem(run, id, cfg) {
  var it = storeItems(cfg).filter(function (x) { return x.id === id; })[0];
  if (!it || !itemEligible(run, id, cfg) || run.wallet < it.price) return false;
  run.wallet -= it.price;
  var p = id.split(":");
  if (p[0] === "bot") run.owned.bots[p[1]] = true; else if (p[0] === "mix") run.owned.mixes[p[1]] = true;
  else if (id === "brush" || id === "time") run.items[id]++; else run.items[id] = true;
  return true;
}

/* ----- HQ (Stock, permanent) ----- */
function hqItems(cfg) {
  var out = BOTS.map(function (b) { return { id: "startBot:" + b, name: "START WITH " + BOT_NAMES[b], desc: "Every run begins owning it", price: cfg.hqStartBot }; });
  out.push({ id: "slots4", name: "4 STORE SLOTS", desc: "The store shows 4 items", price: cfg.hqSlots });
  out.push({ id: "reroll", name: "FREE STORE REROLL", desc: "One free reroll per store visit", price: cfg.hqReroll });
  out.push({ id: "headStart", name: "HEAD START", desc: "+10 s on every level", price: cfg.hqHeadStart });
  out.push({ id: "bigBrush", name: "BIGGER STARTING BRUSH", desc: "Brush x1.15", price: cfg.hqBigBrush });
  out.push({ id: "suns", name: "SUN STYLES", desc: "Cosmetic: rings, spots and pulsing suns", price: cfg.hqSuns });
  out.push({ id: "hats", name: "ALIEN HATS", desc: "Cosmetic: customers wear hats", price: cfg.hqHats });
  return out;
}
function buyHQ(meta, id, cfg) {
  var it = hqItems(cfg).filter(function (x) { return x.id === id; })[0];
  if (!it || meta.hq[id] || meta.stock < it.price) return false;
  meta.stock -= it.price; meta.hq[id] = true; return true;
}

/* ================= CONFIG persistence (safe without a browser) ================= */
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function sameShape(a, b) {
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every(function (x, i) { return sameShape(x, b[i]); });
  return typeof a === typeof b && (typeof b !== "number" || isFinite(b));
}
function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
var MUSIC_STYLES = ["chip", "wave", "funk"];
var CONFIG = clone(CONFIG_DEFAULTS);
(function () {
  var s = loadJSON("tpbq_cfg_main2");
  if (s && typeof s === "object") Object.keys(CONFIG_DEFAULTS).forEach(function (k) {
    if (k in s && sameShape(CONFIG_DEFAULTS[k], s[k])) CONFIG[k] = s[k];
  });
})();
function sanitizeConfig() {
  CONFIG.GRID = Math.max(8, Math.min(200, CONFIG.GRID | 0));
  if (MUSIC_STYLES.indexOf(CONFIG.musicStyle) < 0) CONFIG.musicStyle = "chip";
  if (CONFIG.artStyle !== "classic") CONFIG.artStyle = "poster";
  if (CONFIG.mixMode !== "hold") CONFIG.mixMode = "toggle";
  if ([0, 3, 4, 5].indexOf(CONFIG.arcadeCount) < 0) CONFIG.arcadeCount = 3;
  CONFIG.brushRadiusPct = Math.max(1, Math.min(200, CONFIG.brushRadiusPct));
  CONFIG.roundSeconds = Math.max(1, CONFIG.roundSeconds);
  CONFIG.rushSeconds = Math.max(1, CONFIG.rushSeconds);
  CONFIG.canvasDiameterPct = Math.max(20, Math.min(100, CONFIG.canvasDiameterPct));
  CONFIG.stockPerPoints = Math.max(1, CONFIG.stockPerPoints);
  CONFIG.autoFinishPct = Math.max(1, Math.min(100, CONFIG.autoFinishPct));
  ["sizeRangeG1", "sizeRangeG2", "sizeRangeG3"].forEach(function (k) {
    var a = Math.max(20, Math.min(100, CONFIG[k][0])), b = Math.max(20, Math.min(100, CONFIG[k][1])); CONFIG[k] = [Math.min(a, b), Math.max(a, b)];
  });
}
sanitizeConfig();
