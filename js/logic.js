"use strict";
var VERSION = "v1.3 build 2026-11-25 (60 s, dials, new items, quit)";

/* ================= PURE LOGIC (no DOM) - tested by logic.test.mjs ================= */
// THE one tunable object. Everything here is live-editable in the settings panel.
var CONFIG_DEFAULTS = {
  roundSeconds: 60,
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
  payRanges: [[3, 8], [7, 12], [9, 15], [12, 18]], // 3, 4, 5, 6 terrains
  skipEnabled: true,
  skipPenaltySec: 0,
  debugLivePct: false,
  countdown: true,
  musicVolume: 60,
  haptics: true,                    // iPhone (iOS 17.4+ Safari) / Android vibration
  hapticPaintMs: 70,                // min ms between haptic ticks while painting
  sfxVolume: 80,
  // ----- story -----
  pointsByGrade: [10, 7, 5, 3, 1, 0],
  stockPerPoints: 10,
  quotasG1: [7, 8, 9, 11],          // L1-L3, boss (set for 60 s rounds)
  quotasG2: [11, 12, 13, 16],
  quotasG3: [15, 16, 17, 20],
  quotasG4: [19, 20, 21, 25],
  galaxyTerrains: [3, 4, 5, 5],
  sizeVarRange: [65, 100],          // planet size % (every mode, every galaxy)
  // ----- tier 2 / 3 -----
  tier2SlotChance: 0.35,
  tier2MultPct: [100, 125, 150, 175, 200], // credit multiplier on base pay for 0-4+ tier-2 slots (a tier-3 slot counts 2)
  featuredWeight: 3,                // terrains new in this galaxy are this many times likelier in orders
  // ----- store -----
  storeSlots: 3,
  priceBrush: 20, priceTime: 20, pricePeek: 15, priceAuto: 20, priceSteady: 15,
  priceCalm: 20, priceSkips: 15, priceBoost: 20, priceShield: 25,
  maxBrushStacks: 3, maxTimeStacks: 3,
  brushStackMul: 1.15, timeStackSec: 10, peekSec: 5, autoFinishPct: 95,
  freeSkipCount: 2, freeSkipSec: 3, shieldMargin: 3,
  priceDialSize: 20, priceDialShape: 15, priceUndo: 15, priceFreeze: 20, priceBucket: 25, priceCushion: 20, priceTip: 15,
  dialMinPct: 10, dialMaxPct: 30, dialStepPct: 2, undoCount: 3, freezeSec: 6, tipSec: 10, tipCredits: 2,
  // ----- HQ (Stock prices) -----
  hqSlots: 10, hqReroll: 6, hqHeadStart: 6, hqBigBrush: 5, hqSuns: 3, hqHats: 3,
  // ----- arcade -----
  arcadeCount: 3,                   // 3 | 4 | 5 | 0 = random per order
  randomShapes: false,
  arcadeTier2: false,
  arcadeTier2Unlocked: true,        // later gate: reach Galaxy 2 in story
  arcadeDialSize: false, arcadeDialShape: false,
  // ----- boss modifiers -----
  modHidden: true, hiddenShowSec: 5,
  modShrink: true, shrinkToPct: 50,
  modMeteors: true, meteorEverySec: 8, meteorWarnSec: 0.7, meteorSizeMul: 1.5,
  modSpin: true, spinDegPerSec: 6,
  modMirror: true,
  modRush: true, rushSeconds: 40,
  modVip: true,
  modFickle: true, fickleShiftMin: 5, fickleShiftMax: 10, fickleOrderSec: 15,
  modFog: true, fogRadiusMul: 2, fogFadeSec: 1.5,
  modLocked: true, lockedCount: 2, lockedEverySec: 10,
  modSix: true
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
/* ----- mixing wells: terrains are combined in a well, then the well is painted like a swatch ----- */
function wellDrop(cur, id, owned) { // drop terrain id into a well holding cur -> new well content (0 = empty)
  if (!id) return 0;
  return (cur && mixOut(cur, id, owned)) || id; // a recipe combines; anything else overwrites
}
function wellBot(cur, bot, owned) { return cur ? botOut(bot, cur, owned) : 0; } // 0 = no recipe (well unchanged)
function tier2Count(slots) { var n = 0; slots.forEach(function (s) { var t = TERRAINS[s.terrain].tier; n += t === 3 ? 2 : t === 2 ? 1 : 0; }); return n; }
function tier2Mult(count, boost, cfg) { var k = count > 0 ? count + (boost ? 1 : 0) : 0, m = cfg.tier2MultPct; return m[Math.min(m.length - 1, k)]; }
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
/* ----- random customer, planet, system and galaxy names. About 1 in 4 is "regular": real-sounding or deadpan-corporate ----- */
var ALIEN_TITLES = ["Mr.", "Mrs.", "Ms.", "Dr.", "Lady", "Lord", "Captain", "Madame", "Sir", "Chief", "Professor", "Baron", "Auntie", "Admiral", "Dame", "Uncle",
  "Count", "Duchess", "Grand Vizier", "Supreme Leader", "Little", "Big", "Old", "Young", "Señor", "Herr", "Mx.", "Comrade", "Reverend", "Sheriff", "Coach", "Nurse",
  "Agent", "Magistrate", "Overlord", "Grandma", "Grandpa", "Cousin", "Sergeant", "Lieutenant", "Ambassador", "Senator", "Wizard", "Saint", "Prince", "Princess", "Emperor", "The Honourable"];
var ALIEN_NAMES = ["Blorbo", "Zib", "Snorvek", "Glorp", "Vex", "Quazzle", "Mubb", "Xanthor", "Plim", "Zorgle", "Wubwub", "Skreel", "Thrax", "Oomla", "Fizzbin", "Krellick", "Bloop", "Yonk", "Drazzle", "Splern", "Gnarf", "Zizzix", "Hork", "Pleeb", "Morbo", "Squee", "Blixt", "Urgo",
  "Flumph", "Grizzik", "Vorbin", "Quill", "Snibbet", "Torgo", "Wazzle", "Yibbit", "Klonk", "Mirzak", "Ploob", "Rhazz", "Shmorp", "Tibbin", "Ulgar", "Vimble", "Wonko", "Xyloth", "Zoobie", "Bramble", "Crunk", "Dweezil",
  "Eebo", "Frobb", "Gilmo", "Hubbub", "Izzik", "Jorble", "Kazoo", "Lurk", "Mimsy", "Nubb", "Orrin", "Pazuzu", "Quonk", "Rumbo", "Sprock", "Twerk", "Umbo", "Vrill", "Wibble", "Xax", "Yarbo", "Zelph", "Glimmox",
  "Snazz", "Throbbin", "Bungo", "Fleeb", "Krang", "Mungus", "Plotz", "Squidge", "Tonk", "Blibbo", "Zargon"];
var HUMAN_FIRST = ["Linda", "Gary", "Steve", "Karen", "Dave", "Priya", "Marcus", "Jenny", "Raj", "Sofia", "Tom", "Megan", "Luis", "Yuki", "Brenda", "Kevin", "Ana", "Doug", "Nina", "Walter", "Omar", "Beth", "Carl", "Ingrid"];
var HUMAN_LAST = ["Park", "Smith", "Okafor", "Novak", "Patel", "Garcia", "Johnson", "Kim", "Rossi", "Müller", "Chen", "Brown", "Silva", "Nguyen", "Kowalski", "Murphy", "Haddad", "Lindqvist"];
var DEADPAN_ALIENS = ["Gary", "Steve from Accounting", "Kevin (Regional)", "The Customer", "Some Guy", "Brenda, Facilities", "A Blob", "Doug", "Mr. Client", "Ms. Invoice", "Unit 7", "Middle Manager Zorp", "Account #4471", "Janet (Interim)", "Bob", "Valued Customer"];
var PLANET_A = ["Glorb", "Squonk", "Blip", "Wobbl", "Zant", "Kreb", "Floob", "Mox", "Thwip", "Yibb", "Quorn", "Zeeb", "Plonk", "Vorp", "Snarf", "Dingl", "Bort", "Klaxx", "Noob", "Frell", "Gump", "Skrob", "Womp", "Zuul",
  "Brum", "Crax", "Drib", "Fizz", "Gloop", "Hux", "Jabb", "Kroo", "Lumm", "Mung", "Nix", "Oob", "Prang", "Quib", "Rizz", "Spoon", "Trog", "Umb", "Vasp", "Whee", "Xorb", "Yowl", "Zork", "Blorf",
  "Chum", "Dorb", "Eek", "Flarn", "Grunt", "Hoob", "Izz", "Jumb", "Kazz", "Lurp", "Mizz", "Narb", "Orp", "Pubb", "Qwop", "Rumb", "Sklar", "Tump", "Urk", "Vonk", "Wizz", "Yamm", "Zibb", "Floop"];
var PLANET_B = ["ax", "ulon", "aria", "ix", "os", "opolis", "onia", "ara", "ium", "oid", "", "", "us", "eth",
  "ania", "ovia", "eon", "ithia", "ulus", "andor", "ora", "ennium", "ox", "ulia", "ica", "ane", "esh", "amar",
  "on", "ion", "ulor", "atopia", "orax", "ingus", "elle", "ia", "", "", "o", "una", "ibus", "astra"];
var PLANET_C = [" Prime", " IV", " VII", " IX", "-7", "-12", " Minor", " Major", " B", " II", "", "", "", " XL", " Jr.",
  " III", " V", " XII", "-3", "-99", " Beta", " Gamma", " Alpha", " Sr.", " Deluxe", " Lite", " Classic", " Redux", " Plus", " Max",
  " Mk II", " 2.0", " Nova", " Outpost", " Station", " Colony", "", "", "", " Ultra", " Zero", " Too", " Again", " (Remastered)", " Express"];
var REAL_PLANETS = ["Kepler-442b", "Gliese 581 c", "HD 40307 g", "Nova Terra", "New Hope", "Proxima b", "TRAPPIST-1e", "Wolf 1061 c", "Ross 128 b", "Teegarden b", "New Eden", "Arcadia", "Elysium", "Meridian", "Haven", "Tau Ceti f"];
var DEADPAN_PLANETS = ["Planet 7 (Rev B)", "Untitled Planet", "Planet_final_v2", "Planet (Copy)", "Some Rock", "Placeholder", "Planet, Standard", "Order #2231", "Rock Number Four", "Another One", "Generic World", "Planet TBD", "Sample Planet", "New Planet (1)", "Big Ball", "Earth But Worse"];
var SYS_SUFFIX = [" System", " System", " Cluster", " Reach", " Belt", " Nebula", " Drift", " Sector", " Quadrant", " Spur", " Cloud", " Expanse", " Arm", " Corridor", " Cradle"];
var REAL_SYSTEMS = ["The Andromeda Arm", "Alpha Centauri", "The Orion Spur", "Sirius System", "Vega Reach", "The Perseus Arm", "Betelgeuse Belt", "The Pleiades", "Cygnus Sector", "Polaris Drift", "Rigel Cluster", "Lyra Expanse"];
var DEADPAN_SYSTEMS = ["Unnamed Galaxy #12", "Galaxy (Draft)", "The Usual Galaxy", "Galaxy Two-ish", "Sector Whatever", "The Office Park", "Business Park Nebula", "Overflow Parking", "Zone B", "The Cluster Nobody Asked For", "Loading Dock 3", "Galaxy_v3_FINAL"];
function pick(a, rng) { return a[randInt(rng, 0, a.length - 1)]; }
function alienName(rng) {
  var q = rng();
  if (q < 0.13) return pick(["Dr.", "Ms.", "Mr.", "Mrs.", "Captain", "Professor"], rng) + " " + pick(HUMAN_FIRST, rng) + " " + pick(HUMAN_LAST, rng);
  if (q < 0.25) return pick(DEADPAN_ALIENS, rng);
  return pick(ALIEN_TITLES, rng) + " " + pick(ALIEN_NAMES, rng);
}
function planetName(rng) {
  var q = rng();
  if (q < 0.13) return pick(REAL_PLANETS, rng);
  if (q < 0.25) return pick(DEADPAN_PLANETS, rng);
  var n = pick(PLANET_A, rng) + pick(PLANET_B, rng);
  return rng() < 0.15 ? pick(["New ", "Old ", "Little ", "Greater ", "Lesser ", "Planet "], rng) + n : n + pick(PLANET_C, rng);
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
  donut: function (u, v) { var q = u * u + v * v; return q <= 1 && q >= 0.16; },
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
var SHAPE_SETS = { // story complications (circle is always in the mix)
  basic: ["square", "rectangle", "oval", "triangle", "pentagon", "hexagon", "octagon", "semicircle", "donut", "kite"],
  suits: ["heart", "club", "spade", "diamond"],
  long: ["cross", "crescent", "star", "teardrop", "cloud"]
};
function systemName(rng) {
  var q = rng();
  if (q < 0.13) return pick(REAL_SYSTEMS, rng);
  if (q < 0.25) return pick(DEADPAN_SYSTEMS, rng);
  var n = pick(PLANET_A, rng) + pick(PLANET_B, rng);
  return rng() < 0.2 ? "The " + n + pick([" Expanse", " Nebula", " Drift", " Belt", " Cluster"], rng) : n + pick(SYS_SUFFIX, rng);
}

/* ----- orders. spec = { n (0 = random 3-5), shapes[], sizeMin, sizeMax (%), tier2, owned, featured[], multBoost, six } ----- */
function pickWeighted(cand, featured, w, rng) {
  var tot = 0, i, ws = cand.map(function (t) { var x = featured && featured.indexOf(t) >= 0 ? w : 1; tot += x; return x; }), r = rng() * tot;
  for (i = 0; i < cand.length; i++) { r -= ws[i]; if (r < 0) return cand[i]; }
  return cand[cand.length - 1];
}
function generateOrder(spec, cfg, rng) {
  var six = !!spec.six, n = six ? 6 : spec.n ? spec.n : randInt(rng, 3, 5), ids = shuffle([1, 2, 3, 4, 5, 6], rng).slice(0, n), i;
  var mk = spec.tier2 && !six ? makeableList(spec.owned) : [];
  if (mk.length) for (i = 0; i < n; i++) if (rng() < cfg.tier2SlotChance) {
    var cand = mk.filter(function (t) { return ids.indexOf(t) < 0; });
    if (cand.length) ids[i] = pickWeighted(cand, spec.featured, Math.max(1, cfg.featuredWeight), rng);
  }
  var pcts = splitPcts(n, cfg.minTargetPct, cfg.maxTargetPct, rng), slots = [], big = ids[0], bigPct = -1;
  for (i = 0; i < n; i++) { slots.push({ terrain: ids[i], pct: pcts[i] }); if (pcts[i] > bigPct) { bigPct = pcts[i]; big = ids[i]; } }
  var pr = cfg.payRanges[Math.min(cfg.payRanges.length - 1, n - 3)], shapes = spec.shapes && spec.shapes.length ? spec.shapes : ["circle"];
  var basePay = randInt(rng, pr[0], pr[1]), mult = tier2Mult(tier2Count(slots), spec.multBoost, cfg);
  var o = {
    n: n, slots: slots, basePay: basePay, mult: mult, bonus: Math.ceil(basePay * mult / 100 - 1e-9) - basePay, tint: big,
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
  // every blank gets painted, so the final percentages are of the whole planet. One cell at a time, give it to the ordered
  // terrain that leaves the lowest score error (ties: the most under-target terrain). Cells never go to unordered terrains.
  var cnt = order.slots.map(function (sl) { return counts[sl.terrain]; }), alloc = {}, left = blanks.length;
  function err() { var e = 0; for (var q = 0; q < cnt.length; q++) e += Math.abs(pctOf(cnt[q], total) - order.slots[q].pct); return e; }
  while (left > 0 && cnt.length) {
    var best = 0, be = Infinity, bd = -Infinity;
    for (s = 0; s < cnt.length; s++) {
      cnt[s]++; var e = err(), d = order.slots[s].pct / 100 * total - (cnt[s] - 1); cnt[s]--;
      if (e < be || (e === be && d > bd)) { be = e; bd = d; best = s; }
    }
    var t = order.slots[best].terrain; alloc[t] = (alloc[t] || 0) + 1; cnt[best]++; left--;
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
var MODS = ["hidden", "shrink", "meteors", "spin", "mirror", "rush", "vip", "fickle", "fog", "locked", "six"];
var MOD_INFO = {
  hidden: ["HIDDEN ORDER", "Percentages vanish after a few seconds"], shrink: ["SHRINKING BRUSH", "Your brush shrinks all round"],
  meteors: ["METEORS", "Chunks of your planet get blasted blank"], spin: ["SPINNING PLANET", "The planet rotates while you paint"],
  mirror: ["MIRROR BRUSH", "Every dab is mirrored left-right"], rush: ["RUSH", "A much shorter clock"],
  vip: ["VIP CLIENTS", "Below grade B earns nothing"], fickle: ["FICKLE CLIENT", "Targets change mid-order"],
  fog: ["FOG", "You only see near your finger"], locked: ["LOCKED PALETTE", "Two terrains are locked at a time"],
  six: ["SIX TERRAINS", "Every order wants all six base terrains"]
};
function modKey(m) { return "mod" + m.charAt(0).toUpperCase() + m.slice(1); }
function enabledMods(cfg) { return MODS.filter(function (m) { return cfg[modKey(m)]; }); }
function pickBossMods(cfg, rng) { // one per galaxy boss; the last boss gets two different ones
  var pool = enabledMods(cfg), out = [], g;
  for (g = 0; g < GALAXIES; g++) out.push([]);
  if (!pool.length) return out;
  for (g = 0; g < GALAXIES; g++) { var p = shuffle(pool.slice(), rng); out[g] = p.slice(0, g === GALAXIES - 1 ? 2 : 1); }
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
  r.grid = gridFor(r.queue[0], r.cfg); r.blank = r.grid.total; r.planetStart = r.elapsed; r.bucketUsed = false; r.planetNo = (r.planetNo || 0) + 1;
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
    events: [], locked: [], meteor: null, meteorNext: cfg.meteorEverySec, freeSkips: spec.freeSkips || 0,
    basePct: spec.brushPct || cfg.brushRadiusPct, shape: spec.brushShape || "circle",
    undoLeft: spec.undo ? cfg.undoCount : 0, freezeLeft: spec.freeze ? 1 : 0, frozen: 0, cushion: !!spec.cushion, tip: !!spec.tip
  };
  armOrder(r);
  return r;
}
function brushRad(r) { // in grid squares; relative to the MAX planet, so small planets need fewer dabs
  var k = r.mod.shrink ? 1 - (1 - r.cfg.shrinkToPct / 100) * Math.min(1, r.elapsed / r.seconds) : 1;
  return (r.cfg.GRID / 2) * r.basePct / 100 * r.brushMul * k;
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
  var run = dt;
  if (r.frozen > 0) { run = Math.max(0, dt - r.frozen); r.frozen = Math.max(0, r.frozen - dt); if (!r.frozen) r.events.push("thaw"); }
  if (!r.spec.practice) r.timeLeft -= run;
  r.elapsed += dt;
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
  if (r.freeSkips > 0) { r.freeSkips--; r.timeLeft += r.cfg.freeSkipSec; r.events.push("freeSkip"); }
  else if (r.cfg.skipPenaltySec > 0) roundTick(r, r.cfg.skipPenaltySec);
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
    if (!brushHits(r.shape, cx, cy, rad, r2, x, y)) continue;
    if (cur === 0) r.blank--; else if (nid === 0) r.blank++;
    cells[i] = nid; changed.push(i);
  }
  return changed;
}
// does a brush of this shape touch grid square (x, y)? Square = the circle's bounding box; triangle (point up) fits inside it.
function brushHits(shape, cx, cy, rad, r2, x, y) {
  if (shape === "square") return x < cx + rad && x + 1 > cx - rad && y < cy + rad && y + 1 > cy - rad;
  if (shape === "triangle") { // any corner or the centre of the square inside the triangle, or the triangle's apex inside the square
    var ax = cx, ay = cy - rad, bx = cx - rad, by = cy + rad, ex = cx + rad, ey = cy + rad;
    if (ax >= x && ax <= x + 1 && ay >= y && ay <= y + 1) return true;
    var pts = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1], [x + 0.5, y + 0.5]];
    for (var k = 0; k < 5; k++) { var px = pts[k][0], py = pts[k][1];
      var d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by), d2 = (px - ax) * (ey - ay) - (ex - ax) * (py - ay), d3 = (px - ex) * (by - ey) - (bx - ex) * (py - ey);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true; }
    return false;
  }
  var nx = cx < x ? x : cx > x + 1 ? x + 1 : cx, ny = cy < y ? y : cy > y + 1 ? y + 1 : cy;
  return (nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) <= r2;
}
// fill bucket: the connected area of the same terrain (blank or painted) around square i becomes id. Once per planet.
function bucketFill(r, i, id) {
  var g = r.grid, G = g.G, cells = g.cells, changed = [];
  if (r.over || r.bucketUsed || i < 0 || i >= cells.length || !g.inside[i] || r.locked.indexOf(id) >= 0) return changed;
  var from = cells[i]; if (from === id) return changed;
  var stack = [i], seen = new Uint8Array(cells.length); seen[i] = 1;
  while (stack.length) {
    var k = stack.pop(), x = k % G, nb = [x > 0 ? k - 1 : -1, x < G - 1 ? k + 1 : -1, k - G, k + G];
    if (from === 0) r.blank--; else if (id === 0) r.blank++;
    cells[k] = id; changed.push(k);
    for (var q = 0; q < 4; q++) { var n = nb[q]; if (n >= 0 && n < cells.length && !seen[n] && g.inside[n] && cells[n] === from) { seen[n] = 1; stack.push(n); } }
  }
  r.bucketUsed = true;
  return changed;
}
// undo: put back a snapshot taken at the start of the last stroke (same planet only)
function snapGrid(r) { return { planet: r.planetNo, cells: new Uint8Array(r.grid.cells), blank: r.blank, bucket: r.bucketUsed }; }
function roundUndo(r, snap) {
  if (r.over || r.undoLeft <= 0 || !snap || snap.planet !== r.planetNo) return false;
  r.grid.cells.set(snap.cells); r.blank = snap.blank; r.bucketUsed = snap.bucket; r.undoLeft--; return true;
}
function roundFreeze(r) { if (r.over || r.freezeLeft <= 0) return false; r.freezeLeft--; r.frozen = r.cfg.freezeSec; return true; }
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
  f.tip = r.tip && f.seconds < cfg.tipSec && f.gi <= 2 && !f.vip ? cfg.tipCredits : 0;
  r.points += f.points; r.results.push(f); advanceOrder(r);
  return f;
}
function summarizeRound(r) {
  var pay = 0, secs = 0, gis = [], t2 = 0, steady = 0, points = 0, tips = 0, cushion = 0, worst = -1;
  r.results.forEach(function (p, i) { pay += p.paid; secs += p.seconds; gis.push(p.gi); t2 += p.t2; steady += p.steady; points += p.points; tips += p.tip || 0; if (worst < 0 || p.gi > r.results[worst].gi) worst = i; });
  if (r.cushion && worst >= 0) { // grade cushion: the worst planet's points count one grade higher
    var w = r.results[worst], up = Math.max(0, w.gi - 1);
    cushion = (w.vip && up > 2) ? 0 : r.cfg.pointsByGrade[up] - w.points;
  }
  var og = overallGrade(gis, r.cfg), bonus = og ? og.bonus : 0;
  return {
    planets: r.results.length, payments: pay, overall: og ? og.grade : "-", overallGi: og ? og.gi : 5, bonus: bonus, t2: t2, steady: steady, tips: tips, cushion: cushion,
    total: pay + bonus + steady + tips, points: points + cushion, secondsLeft: r.timeLeft,
    avgSeconds: r.results.length ? secs / r.results.length : 0, skipped: r.skipped
  };
}

/* ----- story run: 4 galaxies x (3 levels + boss). Galaxy 1 is always the same; galaxies 2-4 each draw one complication ----- */
var GALAXIES = 4, LPG = 4, LEVELS = GALAXIES * LPG;
var COMPLICATIONS = ["bot:hot", "bot:chill", "bot:low", "bot:high", "shapes:basic", "shapes:suits", "shapes:long"];
var COMP_INFO = {
  "bot:hot": ["HOT BOT ONLINE", "Heats the terrain in a well"], "bot:chill": ["CHILL BOT ONLINE", "Freezes the terrain in a well"],
  "bot:low": ["LOW BOT ONLINE", "Sinks the terrain in a well"], "bot:high": ["HIGH BOT ONLINE", "Raises the terrain in a well"],
  "shapes:basic": ["ODD-SHAPED PLANETS", "Squares, triangles, donuts and other polygons join the circles"],
  "shapes:suits": ["CARD-SUIT PLANETS", "Hearts, clubs, spades and diamonds join the line-up"],
  "shapes:long": ["STRETCHED PLANETS", "Crosses, moons, stars, teardrops and clouds"],
  "size": ["PLANETS COME IN SIZES", "Planets range from small to full size. Your brush stays the same, so small ones fill fast"]
};
var GALAXY_NAMES = {
  "bot:hot": ["The Scorch Nebula", "Cinder Reach", "The Kiln Cluster", "The Blistering Belt", "Furnace Drift", "The Sauna Sector", "Ember Spur", "The Toasty Expanse", "Simmer Quadrant"],
  "bot:chill": ["The Frostbite Belt", "Glacier Drift", "The Shiver Expanse", "The Icebox Cluster", "Brrr Reach", "The Permafrost Spur", "Snowglobe Sector", "The Cold Shoulder Nebula", "Sleet Corridor"],
  "bot:low": ["The Sunken Deep", "Basin Reach", "The Undertow Cluster", "The Basement Nebula", "Lowland Drift", "The Sinkhole Sector", "Trench Spur", "The Bottom Shelf", "Gully Quadrant"],
  "bot:high": ["The Summit Spiral", "Peak Reach", "The Altitude Belt", "The Lofty Expanse", "Ridge Cluster", "The Top Shelf Nebula", "Spire Sector", "The Nosebleed Drift", "Plateau Spur"],
  "shapes:basic": ["The Geometry Sector", "Polygon Reach", "The Angular Belt", "The Protractor Nebula", "Hexagon Drift", "The Right Angle Spur", "Vertex Cluster", "The Ruler's Expanse", "Isosceles Quadrant"],
  "shapes:suits": ["The Casino Cluster", "High Stakes Expanse", "The Full House Nebula", "The Royal Flush", "Blackjack Drift", "The Poker Face Sector", "Wildcard Spur", "The House Edge", "Ace High Reach"],
  "shapes:long": ["The Contortion Nebula", "Stretch Reach", "The Noodle Expanse", "The Taffy Belt", "Elastic Drift", "The Long Way Round", "Spaghetti Spur", "The Bendy Sector", "Yoga Cluster"],
  "size": ["The Scale Drift", "Variable Reach", "The One-Size-Fits-Some Cluster"]
};
var HOME_GALAXY = "The Home Spiral";
function newMeta() { return { stock: 0, hq: {}, best: 0, runs: 0, arcadeTier2Unlocked: false, seen: {}, bestArc: {} }; }
function levelInfo(level) { return { g: Math.floor(level / LPG), l: level % LPG, boss: level % LPG === LPG - 1 }; }
function quotaFor(level, cfg) { var li = levelInfo(level); return cfg["quotasG" + (li.g + 1)][li.l]; }
function newRun(meta, cfg, rng) {
  return { v: 2, level: 0, wallet: 0, points: 0, owned: emptyOwned(),
    items: newItems(), brushPct: cfg.brushRadiusPct, brushShape: "circle",
    comps: shuffle(COMPLICATIONS.slice(), rng).slice(0, GALAXIES - 1), bossMods: pickBossMods(cfg, rng),
    galaxies: [], featured: [], force: null, over: false, won: false, credits: 0 };
}
function newItems() { return { brush: 0, time: 0, peek: false, auto: false, steady: false, calm: false, skips: false, boost: false, shield: 0,
  dialSize: false, dialShape: false, undo: false, freeze: false, bucket: false, cushion: false, tip: false }; }
function normalizeRun(run, cfg) { // older saves: add missing item slots and brush settings
  var d = newItems(); for (var k in d) if (!(k in run.items)) run.items[k] = d[k];
  delete run.items.well2;
  if (typeof run.brushPct !== "number") run.brushPct = cfg.brushRadiusPct;
  if (["circle", "square", "triangle"].indexOf(run.brushShape) < 0) run.brushShape = "circle";
  return run;
}
function clampDial(pct, cfg) { return Math.max(cfg.dialMinPct, Math.min(cfg.dialMaxPct, pct)); }
function runComps(run, g) { return run.comps.slice(0, Math.max(0, g)); } // complications active in galaxy g (they stack)
// enter galaxy g: unlock its bot and one random mix recipe; returns the intro record (stored on the run)
function enterGalaxy(run, g, cfg, rng) {
  if (run.galaxies[g]) return run.galaxies[g];
  var before = makeableList(run.owned), comp = g > 0 ? run.comps[g - 1] : null, mix = null;
  if (comp && comp.indexOf("bot:") === 0) run.owned.bots[comp.slice(4)] = true;
  if (g > 0) {
    var cand = MIXES.filter(function (m) { return !run.owned.mixes[m.id] && makeable(m.a, run.owned) && makeable(m.b, run.owned); });
    if (cand.length) { mix = cand[randInt(rng, 0, cand.length - 1)].id; run.owned.mixes[mix] = true; }
  }
  var after = makeableList(run.owned);
  run.featured = after.filter(function (t) { return before.indexOf(t) < 0; });
  var names = comp ? GALAXY_NAMES[comp] : null;
  var q = rng(), gname = !names ? HOME_GALAXY : q < 0.13 ? pick(REAL_SYSTEMS, rng) : q < 0.25 ? pick(DEADPAN_SYSTEMS, rng) : pick(names, rng);
  var info = { g: g, name: gname, comp: comp, mix: mix, newTerrains: run.featured.slice(),
    terrains: cfg.galaxyTerrains[g], moreTerrains: g > 0 && cfg.galaxyTerrains[g] > cfg.galaxyTerrains[g - 1] };
  run.galaxies[g] = info;
  return info;
}
function catchUpGalaxies(run, cfg, rng) { // make sure every galaxy up to the current one has been entered (dev jumps, old saves)
  var g = levelInfo(run.level).g, out = [];
  for (var k = 0; k <= g; k++) if (!run.galaxies[k]) out.push(enterGalaxy(run, k, cfg, rng));
  return out;
}
function levelMods(run, level) {
  var li = levelInfo(level), m = li.boss ? (run.bossMods[li.g] || []).slice() : [];
  if (li.boss && run.items.calm && m.length) m.pop(); // calm token cancels one
  if (run.force && level === run.level && m.indexOf(run.force) < 0) m.push(run.force);
  return m;
}
function storyShapes(comps) {
  var s = ["circle"];
  comps.forEach(function (c) { if (c.indexOf("shapes:") === 0) s = s.concat(SHAPE_SETS[c.slice(7)]); });
  return s;
}
function levelSpec(run, meta, cfg) {
  var li = levelInfo(run.level), mods = levelMods(run, run.level), g = li.g, comps = runComps(run, g), it = run.items;
  var secs = (mods.indexOf("rush") >= 0 ? cfg.rushSeconds : cfg.roundSeconds) + run.items.time * cfg.timeStackSec + (meta.hq.headStart ? 10 : 0);
  return {
    n: cfg.galaxyTerrains[g], six: mods.indexOf("six") >= 0, shapes: storyShapes(comps), sizeMin: cfg.sizeVarRange[0], sizeMax: cfg.sizeVarRange[1],
    tier2: true, owned: run.owned, featured: run.featured || [], multBoost: !!run.items.boost, seconds: secs, mods: mods, quota: quotaFor(run.level, cfg),
    brushMul: Math.pow(cfg.brushStackMul, it.brush) * (meta.hq.bigBrush ? 1.15 : 1), wells: 1,
    freeSkips: it.skips ? cfg.freeSkipCount : 0,
    dialSize: !!it.dialSize, dialShape: !!it.dialShape, brushPct: it.dialSize ? clampDial(run.brushPct, cfg) : cfg.brushRadiusPct, brushShape: it.dialShape ? run.brushShape : "circle",
    undo: !!it.undo, freeze: !!it.freeze, bucket: !!it.bucket, cushion: !!it.cushion, tip: !!it.tip,
    autoFinish: run.items.auto, steady: run.items.steady, peek: run.items.peek, story: true, g: g, l: li.l, boss: li.boss
  };
}
function arcadeSpec(cfg, unlocked, meta) {
  var t2 = !!cfg.arcadeTier2 && !!unlocked;
  return { n: cfg.arcadeCount | 0, shapes: cfg.randomShapes ? SHAPE_NAMES : ["circle"], sizeMin: cfg.sizeVarRange[0], sizeMax: cfg.sizeVarRange[1],
    tier2: t2, owned: t2 ? allOwned() : emptyOwned(), seconds: cfg.roundSeconds, mods: [], brushMul: 1, wells: 1, story: false,
    dialSize: !!cfg.arcadeDialSize, dialShape: !!cfg.arcadeDialShape, brushPct: cfg.brushRadiusPct, brushShape: "circle" };
}
function practiceSpec() { return { n: 3, shapes: ["circle"], sizeMin: 80, sizeMax: 80, tier2: false, owned: emptyOwned(), seconds: 599, mods: [], brushMul: 1, wells: 1, story: false, practice: true }; }
function finishLevel(run, sum, cfg) { // apply a finished level to the run
  var li = levelInfo(run.level), quota = quotaFor(run.level, cfg), passed = sum.points >= quota, shielded = false;
  if (!passed && run.items.shield === 1 && quota - sum.points <= cfg.shieldMargin) { passed = true; shielded = true; run.items.shield = 2; }
  if (li.boss && run.items.calm && (run.bossMods[li.g] || []).length) run.items.calm = false; // used up
  run.points += sum.points; run.wallet = Math.max(0, run.wallet + sum.total); run.credits += sum.total; run.force = null;
  if (!passed) run.over = true;
  else { run.level++; if (run.level >= LEVELS) { run.over = true; run.won = true; } }
  return { passed: passed, quota: quota, shielded: shielded, newGalaxy: passed && !run.over && run.level % LPG === 0 };
}
function stockFor(points, cfg) { return Math.floor(points / cfg.stockPerPoints); }
function endRun(run, meta, cfg) { var s = stockFor(run.points, cfg); meta.stock += s; meta.runs++; if (run.points > meta.best) meta.best = run.points; return s; }
function arcadeBest(meta, key, total) { var prev = meta.bestArc[key]; if (prev === undefined || total > prev) { meta.bestArc[key] = total; return true; } return false; }

/* ----- store (credits). Bots and recipes are no longer sold: galaxies hand them out ----- */
function storeItems(cfg) {
  return [
    { id: "brush", name: "BRUSH +15%", desc: "Bigger brush (stacks)", price: cfg.priceBrush },
    { id: "time", name: "+" + cfg.timeStackSec + " SECONDS", desc: "Longer clock on every remaining level (stacks)", price: cfg.priceTime },
    { id: "peek", name: "PEEK", desc: "Once per level: live % readout for a few seconds", price: cfg.pricePeek },
    { id: "auto", name: "AUTO-FINISH", desc: "At " + cfg.autoFinishPct + "% the planet colours its last squares for the best possible score", price: cfg.priceAuto },
    { id: "steady", name: "STEADY PAYOUT", desc: "+1 credit per planet graded B or better", price: cfg.priceSteady },
    { id: "calm", name: "CALM TOKEN", desc: "Cancels one modifier on the next boss level", price: cfg.priceCalm },
    { id: "skips", name: "FREE SKIPS", desc: "Your first " + cfg.freeSkipCount + " skips each level give +" + cfg.freeSkipSec + " s", price: cfg.priceSkips },
    { id: "boost", name: "MULTIPLIER BOOST", desc: "Tier-2 orders pay one step more (1 tier-2 pays x1.5)", price: cfg.priceBoost },
    { id: "shield", name: "QUOTA SHIELD", desc: "Once per run: miss a quota by " + cfg.shieldMargin + " or less and still pass", price: cfg.priceShield },
    { id: "dialSize", name: "BRUSH SIZE DIAL", desc: "Up/down arrows by the planet: brush " + cfg.dialMinPct + "-" + cfg.dialMaxPct + "% in " + cfg.dialStepPct + "% steps", price: cfg.priceDialSize },
    { id: "dialShape", name: "BRUSH SHAPE DIAL", desc: "Switch the brush between circle, square and triangle", price: cfg.priceDialShape },
    { id: "undo", name: "UNDO", desc: "Take back your last stroke, " + cfg.undoCount + " times per level", price: cfg.priceUndo },
    { id: "freeze", name: "TIME FREEZE", desc: "Once per level: stop the clock for " + cfg.freezeSec + " s", price: cfg.priceFreeze },
    { id: "bucket", name: "FILL BUCKET", desc: "Once per planet: tap an area to flood it with your brush terrain", price: cfg.priceBucket },
    { id: "cushion", name: "GRADE CUSHION", desc: "Your worst planet each level scores points one grade higher", price: cfg.priceCushion },
    { id: "tip", name: "SPEED TIP", desc: "+" + cfg.tipCredits + " credits for a planet shipped in under " + cfg.tipSec + " s graded B or better", price: cfg.priceTip }
  ];
}
function itemEligible(run, id, cfg, meta) {
  if (id === "brush") return run.items.brush < cfg.maxBrushStacks;
  if (id === "time") return run.items.time < cfg.maxTimeStacks;
  return id in run.items && !run.items[id];
}
function storeOffers(run, meta, cfg, rng) {
  var pool = storeItems(cfg).filter(function (it) { return itemEligible(run, it.id, cfg, meta); }).map(function (it) { return it.id; });
  return shuffle(pool, rng).slice(0, meta.hq.slots4 ? 4 : Math.max(1, cfg.storeSlots | 0));
}
function buyItem(run, id, cfg, meta) {
  var it = storeItems(cfg).filter(function (x) { return x.id === id; })[0];
  if (!it || !itemEligible(run, id, cfg, meta) || run.wallet < it.price) return false;
  run.wallet -= it.price;
  if (id === "brush" || id === "time") run.items[id]++; else if (id === "shield") run.items.shield = 1; else run.items[id] = true;
  return true;
}

/* ----- HQ (Stock, permanent) ----- */
function hqItems(cfg) {
  return [
    { id: "slots4", name: "4 STORE SLOTS", desc: "The store shows 4 items", price: cfg.hqSlots },
    { id: "reroll", name: "FREE STORE REROLL", desc: "One free reroll per store visit", price: cfg.hqReroll },
    { id: "headStart", name: "HEAD START", desc: "+10 s on every level", price: cfg.hqHeadStart },
    { id: "bigBrush", name: "BIGGER STARTING BRUSH", desc: "Brush x1.15", price: cfg.hqBigBrush },
    { id: "suns", name: "SUN STYLES", desc: "Cosmetic: rings, spots and pulsing suns", price: cfg.hqSuns },
    { id: "hats", name: "ALIEN HATS", desc: "Cosmetic: customers wear hats", price: cfg.hqHats }
  ];
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
var CFG_KEY = "tpbq_cfg_main3";
var CONFIG = clone(CONFIG_DEFAULTS);
(function () {
  var s = loadJSON(CFG_KEY), old = false;
  if (!s) { s = loadJSON("tpbq_cfg_main2"); old = true; } // v1.2 settings: keep them, except the numbers whose defaults changed in v1.3
  var changed = ["roundSeconds", "rushSeconds", "quotasG1", "quotasG2", "quotasG3", "quotasG4"];
  if (s && typeof s === "object") Object.keys(CONFIG_DEFAULTS).forEach(function (k) {
    if (old && changed.indexOf(k) >= 0) return;
    if (k in s && sameShape(CONFIG_DEFAULTS[k], s[k])) CONFIG[k] = s[k];
  });
})();
function sanitizeConfig() {
  CONFIG.GRID = Math.max(8, Math.min(200, CONFIG.GRID | 0));
  if (MUSIC_STYLES.indexOf(CONFIG.musicStyle) < 0) CONFIG.musicStyle = "chip";
  if (CONFIG.artStyle !== "classic") CONFIG.artStyle = "poster";
  if ([0, 3, 4, 5].indexOf(CONFIG.arcadeCount) < 0) CONFIG.arcadeCount = 3;
  CONFIG.brushRadiusPct = Math.max(1, Math.min(200, CONFIG.brushRadiusPct));
  CONFIG.roundSeconds = Math.max(1, CONFIG.roundSeconds);
  CONFIG.rushSeconds = Math.max(1, CONFIG.rushSeconds);
  CONFIG.canvasDiameterPct = Math.max(20, Math.min(100, CONFIG.canvasDiameterPct));
  CONFIG.stockPerPoints = Math.max(1, CONFIG.stockPerPoints);
  CONFIG.autoFinishPct = Math.max(1, Math.min(100, CONFIG.autoFinishPct));
  CONFIG.hapticPaintMs = Math.max(20, CONFIG.hapticPaintMs);
  CONFIG.dialMinPct = Math.max(1, CONFIG.dialMinPct); CONFIG.dialMaxPct = Math.max(CONFIG.dialMinPct, CONFIG.dialMaxPct); CONFIG.dialStepPct = Math.max(0.5, CONFIG.dialStepPct);
  CONFIG.undoCount = Math.max(0, CONFIG.undoCount | 0);
  ["sizeVarRange"].forEach(function (k) {
    var a = Math.max(20, Math.min(100, CONFIG[k][0])), b = Math.max(20, Math.min(100, CONFIG[k][1])); CONFIG[k] = [Math.min(a, b), Math.max(a, b)];
  });
}
sanitizeConfig();
