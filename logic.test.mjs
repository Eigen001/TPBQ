// TPBQ pure-logic tests. Run: node logic.test.mjs   (loads js/logic.js in a vm sandbox; no browser needed)
import fs from "node:fs";
import vm from "node:vm";
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(new URL("./js/logic.js", import.meta.url), "utf8"), ctx);
const L = (expr) => vm.runInContext(expr, ctx);
const cfg = L("clone(CONFIG_DEFAULTS)");
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log("FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); } }
const G = (n) => ctx[n];
const rng = (s) => ctx.makeRng(s);
const NAME = (n) => ctx.TERRAINS.findIndex((t) => t.name === n);

// ---------- 1. v0.7 scoring vectors (sum of diffs -> grade -> pay) ----------
{
  const order = { basePay: 10, slots: [{ terrain: 1, pct: 50 }, { terrain: 3, pct: 30 }, { terrain: 2, pct: 20 }] };
  const counts = (a) => { const c = new Array(ctx.TERRAINS.length).fill(0); Object.entries(a).forEach(([k, v]) => (c[k] = v)); return c; };
  let r = ctx.scorePlanet(order, counts({ 1: 500, 3: 300, 2: 200 }), 1000, cfg);
  ok("1a perfect = S, pay 125%", r.S === 0 && r.grade === "S" && r.paid === 13, r);
  r = ctx.scorePlanet(order, counts({ 1: 530, 3: 270, 2: 200 }), 1000, cfg);
  ok("1b diff 6 = A, pay 100%", r.S === 6 && r.grade === "A" && r.paid === 10, r);
  r = ctx.scorePlanet(order, counts({ 1: 570, 3: 230, 2: 200 }), 1000, cfg);
  ok("1c diff 14 = B, pay 75% (ceil)", r.S === 14 && r.grade === "B" && r.paid === 8, r);
  r = ctx.scorePlanet(order, counts({ 1: 620, 3: 180, 2: 200 }), 1000, cfg);
  ok("1d diff 24 = C", r.S === 24 && r.grade === "C" && r.paid === 5, r);
  r = ctx.scorePlanet(order, counts({ 1: 690, 3: 110, 2: 200 }), 1000, cfg);
  ok("1e diff 38 = D", r.S === 38 && r.grade === "D" && r.paid === 3, r);
  r = ctx.scorePlanet(order, counts({ 1: 1000 }), 1000, cfg);
  ok("1f diff 100 = F, pay 0", r.S === 100 && r.grade === "F" && r.paid === 0, r);
  r = ctx.scorePlanet(order, counts({ 0: 100, 1: 450, 3: 270, 2: 180 }), 1000, cfg);
  ok("1g percentages are of the painted area", r.S === 0, r);
  ok("1h grade boundaries", [4, 5, 10, 11, 18, 19, 28, 29, 40, 41].map((s) => ctx.gradeIndexForSum(s, cfg)).join("") === "0112233445");
  ok("1i roundHalfUp / pctOf", ctx.roundHalfUp(2.5) === 3 && ctx.pctOf(1, 8) === 13 && ctx.pctOf(1, 3) === 33 && ctx.pctOf(0, 0) === 0);
  ok("1j overall grade + bonus", ctx.overallGrade([0, 2, 5], cfg).grade === "B" && ctx.overallGrade([0, 2, 5], cfg).bonus === 3 && ctx.overallGrade([], cfg) === null);
}
// helper: play a round to completion by painting exact stripes
function fillExact(r, order) { // paints the current planet to match its order exactly (direct cell writes), returns the finished record
  const g = r.grid, idx = []; for (let i = 0; i < g.cells.length; i++) if (g.inside[i]) idx.push(i);
  let k = 0;
  order.slots.forEach((s, si) => { const n = si === order.slots.length - 1 ? idx.length - k : Math.round(g.total * s.pct / 100); for (let j = 0; j < n && k < idx.length; j++) g.cells[idx[k++]] = s.terrain; });
  r.blank = 0; return ctx.paintFinishIfDone(r);
}
function paintAll(r, id) { const g = r.grid; for (let i = 0; i < g.cells.length; i++) if (g.inside[i]) g.cells[i] = id; r.blank = 0; return ctx.paintFinishIfDone(r); }
const baseSpec = { n: 3, shapes: ["circle"], sizeMin: 100, sizeMax: 100, tier2: false, owned: ctx.emptyOwned(), seconds: 90, mods: [] };

// ---------- 2. pointsByGrade: S, B, F -> 15 ----------
{
  const r = ctx.createPaintRound(cfg, baseSpec, rng(5));
  const a = fillExact(r, r.queue[0]);
  // B: shift 7 points from slot 0 to slot 1 (sum diff 14)
  const o2 = r.queue[0], g = r.grid, idx = []; for (let i = 0; i < g.cells.length; i++) if (g.inside[i]) idx.push(i);
  let k = 0; const want = o2.slots.map((s) => s.pct); want[0] += 7; want[1] -= 7;
  o2.slots.forEach((s, si) => { const n = si === 2 ? idx.length - k : Math.round(g.total * want[si] / 100); for (let j = 0; j < n && k < idx.length; j++) g.cells[idx[k++]] = s.terrain; });
  r.blank = 0; const b = ctx.paintFinishIfDone(r);
  const other = [1, 2, 3, 4, 5, 6].find((t) => !r.queue[0].slots.some((s) => s.terrain === t));
  const c = paintAll(r, other);
  ok("2a grades S, B, F", a.grade === "S" && b.grade === "B" && c.grade === "F", [a.grade, a.S, b.grade, b.S, c.grade]);
  ok("2b points 10 + 5 + 0 = 15", r.points === 15 && ctx.summarizeRound(r).points === 15, r.points);
  const sum = ctx.summarizeRound(r);
  ok("2c credits = pay + overall bonus", sum.total === a.paid + b.paid + c.paid + sum.bonus && sum.t2 === 0 && a.paid === Math.ceil(a.basePay * 1.25 - 1e-9));
}
// ---------- 3. quota ----------
{
  const meta = ctx.newMeta();
  let run = ctx.newRun(meta, cfg, rng(1)); run.level = 3; // G1 L4 quota 16
  let res = ctx.finishLevel(run, { points: 15, total: 20 }, cfg);
  ok("3a 15 vs quota 16 -> run over", res.quota === 16 && !res.passed && run.over && !run.won && run.level === 3, [res, run.level]);
  run = ctx.newRun(meta, cfg, rng(1)); run.level = 2; // quota 14
  res = ctx.finishLevel(run, { points: 15, total: 20 }, cfg);
  ok("3b 15 vs quota 14 -> continue", res.quota === 14 && res.passed && !run.over && run.level === 3 && run.wallet === 20 && run.points === 15);
  run = ctx.newRun(meta, cfg, rng(1)); run.level = 14;
  res = ctx.finishLevel(run, { points: 38, total: 1 }, cfg);
  ok("3c beating the last boss wins the run", res.passed && run.over && run.won);
  ok("3d quota table", [0, 4, 5, 9, 10, 14].map((l) => ctx.quotaFor(l, cfg)).join() === "10,18,18,28,26,38");
  run = ctx.newRun(meta, cfg, rng(1)); ctx.finishLevel(run, { points: 99, total: -5 }, cfg);
  ok("3e wallet never negative", run.wallet === 0);
}
// ---------- 4. stock ----------
{
  ok("4a 137 points -> 13 stock", ctx.stockFor(137, cfg) === 13);
  const meta = ctx.newMeta(), run = ctx.newRun(meta, cfg, rng(1)); run.points = 137;
  ok("4b endRun banks stock and best", ctx.endRun(run, meta, cfg) === 13 && meta.stock === 13 && meta.best === 137 && meta.runs === 1);
}
// ---------- 5. bot recipes ----------
{
  const F = NAME("FOREST"), MT = NAME("MOUNTAINS"), D = NAME("DESERT"), J = NAME("JUNGLE"), MG = NAME("MAGMA");
  const owned = ctx.emptyOwned(); owned.bots.hot = true;
  const r = ctx.createPaintRound(cfg, { ...baseSpec, owned }, rng(2));
  const g = r.grid, Gs = g.G, mid = Math.floor(Gs / 2), row = mid * Gs;
  g.cells[row + mid - 3] = F; g.cells[row + mid - 1] = MT; g.cells[row + mid + 1] = D; r.blank -= 3; // mid+3 stays blank
  const ch = ctx.paintSpray(r, mid, mid + 0.5, 6, 0, { bot: "hot" });
  ok("5a Hot over Forest -> Jungle", g.cells[row + mid - 3] === J);
  ok("5b Hot over Mountains -> Magma", g.cells[row + mid - 1] === MG);
  ok("5c Hot over Desert unchanged", g.cells[row + mid + 1] === D);
  ok("5d blank stays blank, only 2 cells changed", g.cells[row + mid + 3] === 0 && ch.length === 2 && r.blank === g.total - 3, [ch.length, r.blank, g.total]);
  ok("5e without HighBot Mountains (and Magma, Mesa) are not makeable", !ctx.makeable(MT, owned) && !ctx.makeable(MG, owned) && !ctx.makeable(NAME("MESA"), ctx.allOwned() && owned));
  let never = true; const rr = rng(77);
  for (let i = 0; i < 1000; i++) { const o = ctx.generateOrder({ ...baseSpec, n: 5, tier2: true, owned }, cfg, rr); if (o.slots.some((s) => s.terrain === MT || s.terrain === MG)) never = false; }
  ok("5f never ordered when not makeable", never);
  const o2 = ctx.emptyOwned(); o2.bots.high = true; o2.bots.hot = true;
  ok("5g HighBot + HotBot -> Mountains and Magma makeable", ctx.makeable(MT, o2) && ctx.makeable(MG, o2));
  const r2 = ctx.createPaintRound(cfg, baseSpec, rng(2)); r2.grid.cells[row + mid] = F; r2.blank--;
  ok("5h a bot you do not own does nothing", ctx.paintSpray(r2, mid, mid + 0.5, 6, 0, { bot: "hot" }).length === 0);
  ok("5i 18 new terrains, every one has exactly one recipe", ctx.TERRAINS.length === 25 && ctx.TERRAINS.slice(7).every((t) => ctx.recipeFor(t.id)) && ctx.makeableList(ctx.allOwned()).length === 18);
}
// ---------- 6. MIX ----------
{
  const S = NAME("SEA"), D = NAME("DESERT"), F = NAME("FOREST"), B = NAME("BEACH");
  const owned = ctx.emptyOwned(); owned.mixes.beach = true;
  const mk = () => { const r = ctx.createPaintRound(cfg, { ...baseSpec, owned }, rng(3)); const m = Math.floor(r.grid.G / 2); r.grid.cells[m * r.grid.G + m - 2] = S; r.grid.cells[m * r.grid.G + m + 2] = F; r.blank -= 2; return [r, m]; };
  let [r, m] = mk(); let row = m * r.grid.G;
  ctx.paintSpray(r, m, m + 0.5, 5, D, { mix: true });
  ok("6a MIX on: Desert over Sea -> Beach", r.grid.cells[row + m - 2] === B);
  ok("6b MIX on: Desert over Forest unchanged, blanks untouched", r.grid.cells[row + m + 2] === F && r.grid.cells[row + m] === 0 && r.blank === r.grid.total - 2);
  [r, m] = mk(); row = m * r.grid.G;
  ctx.paintSpray(r, m, m + 0.5, 5, D);
  ok("6c MIX off: Desert overwrites", r.grid.cells[row + m - 2] === D && r.grid.cells[row + m + 2] === D && r.grid.cells[row + m] === D);
  [r, m] = mk(); row = m * r.grid.G; r.grid.cells[row + m - 2] = D;
  ctx.paintSpray(r, m, m + 0.5, 5, S, { mix: true });
  ok("6d order does not matter: Sea over Desert -> Beach", r.grid.cells[row + m - 2] === B);
  const none = ctx.createPaintRound(cfg, baseSpec, rng(3)); none.grid.cells[row + m - 2] = S; none.blank--;
  ok("6e recipe not owned -> nothing", ctx.paintSpray(none, m, m + 0.5, 5, D, { mix: true }).length === 0);
}
// ---------- 7. orders, 1000 per galaxy ----------
{
  const meta = ctx.newMeta();
  for (let g = 0; g < 3; g++) {
    for (const ownAll of [false, true]) {
      const run = ctx.newRun(meta, cfg, rng(9)); run.level = g * 5; if (ownAll) run.owned = ctx.allOwned(); else { run.owned.bots.chill = true; run.owned.mixes.swamp = true; }
      const spec = ctx.levelSpec(run, meta, cfg), rr = rng(100 + g), mk = ctx.makeableList(run.owned);
      let bad = [], t2seen = 0, shapes = new Set(), sizes = [1, 0];
      for (let i = 0; i < 1000; i++) {
        const o = ctx.generateOrder(spec, cfg, rr), ids = o.slots.map((s) => s.terrain);
        const sum = o.slots.reduce((a, s) => a + s.pct, 0);
        let bonus = 0; ids.forEach((t) => { const tr = ctx.TERRAINS[t].tier; bonus += tr === 2 ? cfg.tier2Bonus : tr === 3 ? cfg.tier3Bonus : 0; if (tr > 1) t2seen++; });
        if (ids.length !== cfg.galaxyTerrains[g]) bad.push("count");
        if (new Set(ids).size !== ids.length) bad.push("dup");
        if (sum !== 100) bad.push("sum");
        if (o.slots.some((s) => s.pct < cfg.minTargetPct || s.pct > cfg.maxTargetPct)) bad.push("range");
        if (ids.some((t) => t < 1 || (t > 6 && !mk.includes(t)))) bad.push("unmakeable");
        if (o.bonus !== bonus) bad.push("bonus");
        const pr = cfg.payRanges[ids.length - 3]; if (o.basePay < pr[0] || o.basePay > pr[1]) bad.push("pay");
        shapes.add(o.shape); sizes = [Math.min(sizes[0], o.size), Math.max(sizes[1], o.size)];
      }
      ok(`7 galaxy ${g + 1} ${ownAll ? "all owned" : "chill+swamp"}: 1000 orders valid`, bad.length === 0, [...new Set(bad)]);
      ok(`7 galaxy ${g + 1}: tier-2 slots appear`, t2seen > 100, t2seen);
      const sr = cfg["sizeRangeG" + (g + 1)];
      ok(`7 galaxy ${g + 1}: shapes and sizes`, (g === 0 ? shapes.size === 1 && shapes.has("circle") : g === 1 ? shapes.size === 10 : shapes.size === 19) && sizes[0] >= sr[0] / 100 && sizes[1] <= sr[1] / 100, [shapes.size, sizes]);
    }
  }
  const run = ctx.newRun(meta, cfg, rng(9)), spec = ctx.levelSpec(run, meta, cfg); let any = false; const rr = rng(4);
  for (let i = 0; i < 300; i++) if (ctx.generateOrder(spec, cfg, rr).slots.some((s) => s.terrain > 6)) any = true;
  ok("7 nothing owned -> base terrains only", !any);
  // tier-2 bonus reaches the credits
  const r = ctx.createPaintRound(cfg, { ...baseSpec, tier2: true, owned: ctx.allOwned() }, rng(11));
  let guard = 0; while (!r.queue[0].bonus && guard++ < 50) ctx.roundSkip(r);
  const o = r.queue[0], f = fillExact(r, o), sum = ctx.summarizeRound(r);
  const full = Math.ceil((o.basePay + o.bonus) * 1.25 - 1e-9), plain = Math.ceil(o.basePay * 1.25 - 1e-9);
  ok("7 tier-2 bonus is part of the pay (grade S: 125% of base + bonus)", o.bonus > 0 && f.grade === "S" && f.paid === full && f.t2 === full - plain && sum.t2 === f.t2 && sum.total === f.paid + sum.bonus, [o.bonus, f.paid, f.t2, sum]);
  const other = [1, 2, 3, 4, 5, 6].find((t) => !r.queue[0].slots.some((s) => s.terrain === t)), junk = paintAll(r, other);
  ok("7 a grade-F planet earns no tier-2 bonus", junk.grade === "F" && junk.paid === 0 && junk.t2 === 0);
}
// ---------- 8. arcade RANDOM count ----------
{
  const c2 = { ...cfg, arcadeCount: 0, randomShapes: true }, spec = ctx.arcadeSpec(c2, true), rr = rng(21), seen = {};
  let bad = 0;
  for (let i = 0; i < 1000; i++) { const o = ctx.generateOrder(spec, c2, rr), n = o.slots.length; seen[n] = (seen[n] || 0) + 1; if (n < 3 || n > 5 || o.slots.reduce((a, s) => a + s.pct, 0) !== 100) bad++; }
  ok("8a 1000 random-count orders all 3-5", bad === 0);
  ok("8b all three counts occur", seen[3] > 200 && seen[4] > 200 && seen[5] > 200, seen);
  ok("8c arcade tier-2 toggle", ctx.arcadeSpec({ ...cfg, arcadeTier2: true }, true).tier2 && !ctx.arcadeSpec({ ...cfg, arcadeTier2: true }, false).tier2 && !ctx.arcadeSpec(cfg, true).tier2);
  ok("8d fixed counts", [3, 4, 5].every((n) => ctx.generateOrder(ctx.arcadeSpec({ ...cfg, arcadeCount: n }, true), cfg, rng(n)).slots.length === n));
}
// ---------- 9. auto-finish ----------
{
  const SEA = NAME("SEA"), FOR = NAME("FOREST"), DES = NAME("DESERT");
  const g = ctx.makeGrid(40, "square"); // 1600 cells
  const order = { basePay: 10, slots: [{ terrain: SEA, pct: 40 }, { terrain: FOR, pct: 35 }, { terrain: DES, pct: 25 }] };
  const want = { [SEA]: 640 - 48, [FOR]: 560 - 32, [DES]: 400 }; // sea 3% short, forest 2% short, 80 blank (5%)
  let i = 0; for (const [t, n] of Object.entries(want)) for (let k = 0; k < n; k++) g.cells[i++] = +t;
  const before = ctx.scorePlanet(order, ctx.countGrid(g), g.total, cfg);
  const cells = ctx.autoFill(g, order), c = ctx.countGrid({ cells, inside: g.inside });
  const after = ctx.scorePlanet(order, c, g.total, cfg);
  ok("9a blanks filled to the deficits exactly", c[SEA] === 640 && c[FOR] === 560 && c[DES] === 400, [c[SEA], c[FOR], c[DES]]);
  ok("9b no blanks left", c[0] === 0);
  ok("9c sum diff reduced to 0", after.S === 0 && after.S <= before.S, [before.S, after.S]);
  ok("9d input grid untouched", ctx.countGrid(g)[0] === 80);
  // through the round: finishes at 95 %
  const r = ctx.createPaintRound(cfg, { ...baseSpec, autoFinish: true }, rng(8)), gg = r.grid, idx = [];
  for (let k = 0; k < gg.cells.length; k++) if (gg.inside[k]) idx.push(k);
  const o = r.queue[0]; let k = 0;
  const n95 = Math.ceil(gg.total * 0.951);
  o.slots.forEach((s) => { const n = Math.floor(gg.total * s.pct / 100 * 0.95); for (let j = 0; j < n; j++) gg.cells[idx[k++]] = s.terrain; });
  while (k < n95) gg.cells[idx[k++]] = o.slots[0].terrain;
  r.blank = gg.total - k;
  const f = ctx.paintFinishIfDone(r);
  ok("9e round auto-finishes at 95% with a filled picture", !!f && f.cells.every((v, q) => !gg.inside[q] || v > 0) && f.S <= 2, f && [f.S, f.grade]);
  const r0 = ctx.createPaintRound(cfg, baseSpec, rng(8)); r0.blank = Math.floor(r0.grid.total * 0.04);
  ok("9f without the item 96% is not finished", ctx.paintFinishIfDone(r0) === null);
}
// ---------- 10. store ----------
{
  const meta = ctx.newMeta(); let bad = [];
  for (let seed = 0; seed < 300; seed++) {
    const rr = rng(seed), run = ctx.newRun(meta, cfg, rr); run.wallet = 60;
    for (let visit = 0; visit < 8; visit++) {
      const offers = ctx.storeOffers(run, meta, cfg, rr);
      if (offers.length > 3 || new Set(offers).size !== offers.length) bad.push("slots");
      offers.forEach((id) => {
        const p = id.split(":");
        if (p[0] === "bot" && run.owned.bots[p[1]]) bad.push("owned bot");
        if (p[0] === "mix" && run.owned.mixes[p[1]]) bad.push("owned mix");
        if (id === "mix:mesa" && !run.owned.bots.high) bad.push("mesa prereq");
        if (id === "mix:shrubland" && !run.owned.mixes.savanna) bad.push("shrubland prereq");
        if (id === "brush" && run.items.brush >= 3) bad.push("brush stack");
        if (id === "time" && run.items.time >= 3) bad.push("time stack");
        if (["peek", "auto", "steady"].includes(id) && run.items[id]) bad.push("owned once");
      });
      const w = run.wallet; if (offers.length && ctx.buyItem(run, offers[0], cfg) && run.wallet >= w) bad.push("no charge");
      run.wallet += 40;
    }
  }
  ok("10a 300 runs x 8 visits: offers always eligible", bad.length === 0, [...new Set(bad)]);
  const run = ctx.newRun(meta, cfg, rng(1)); run.wallet = 1000;
  let n = 0; while (ctx.buyItem(run, "brush", cfg)) n++;
  let t = 0; while (ctx.buyItem(run, "time", cfg)) t++;
  ok("10b stack limits 3 / 3", n === 3 && t === 3 && run.items.brush === 3 && run.items.time === 3);
  ok("10c one-time items", ctx.buyItem(run, "bot:hot", cfg) && !ctx.buyItem(run, "bot:hot", cfg) && ctx.buyItem(run, "peek", cfg) && !ctx.buyItem(run, "peek", cfg));
  ok("10d mesa needs HighBot", !ctx.buyItem(run, "mix:mesa", cfg) && ctx.buyItem(run, "bot:high", cfg) && ctx.buyItem(run, "mix:mesa", cfg));
  const poor = ctx.newRun(meta, cfg, rng(1)); poor.wallet = 24;
  ok("10e cannot overspend", !ctx.buyItem(poor, "bot:hot", cfg) && poor.wallet === 24 && ctx.buyItem(poor, "steady", cfg) && poor.wallet === 9);
  const spec = ctx.levelSpec(run, meta, cfg);
  ok("10f items reach the level", Math.abs(spec.brushMul - Math.pow(1.15, 3)) < 1e-9 && spec.seconds === 120 && spec.peek === true);
  const m4 = ctx.newMeta(); m4.hq.slots4 = true; const r4 = ctx.newRun(m4, cfg, rng(2));
  ok("10g HQ 4 slots", ctx.storeOffers(r4, m4, cfg, rng(3)).length === 4);
  const hq = ctx.newMeta(); hq.stock = 9;
  ok("10h HQ purchases", ctx.buyHQ(hq, "startBot:low", cfg) && hq.stock === 1 && !ctx.buyHQ(hq, "startBot:low", cfg) && !ctx.buyHQ(hq, "suns", cfg) && ctx.newRun(hq, cfg, rng(1)).owned.bots.low === true);
}
// ---------- 11. boss modifiers ----------
{
  let bad = 0, moved = 0; const rr = rng(31);
  for (let i = 0; i < 2000; i++) {
    const o = ctx.generateOrder({ ...baseSpec, n: 3 + (i % 3) }, cfg, rr), before = o.slots.map((s) => s.pct);
    const did = ctx.fickleShift(o, cfg, rr), after = o.slots.map((s) => s.pct);
    if (after.reduce((a, b) => a + b, 0) !== 100 || after.some((p) => p < 1)) bad++;
    const diff = after.filter((p, k) => p !== before[k]).length; if (did && diff !== 2) bad++; if (did) moved++;
  }
  ok("11a fickle keeps sum 100, each >= 1, exactly two targets move", bad === 0 && moved > 1900, [bad, moved]);
  const r = ctx.createPaintRound(cfg, { ...baseSpec, mods: ["fickle"] }, rng(4)); const b4 = r.queue[0].slots.map((s) => s.pct).join();
  for (let t = 0; t < 100; t++) ctx.roundTick(r, 0.1);
  ok("11b fickle fires once, 30-60% into the order", r.events.filter((e) => e === "fickle").length === 1 && r.queue[0].slots.map((s) => s.pct).join() !== b4);
  let lockBad = 0; const lr = rng(6);
  for (let i = 0; i < 500; i++) { const o = ctx.generateOrder({ ...baseSpec, n: 3, tier2: true, owned: ctx.allOwned() }, cfg, lr), need = {}; o.slots.forEach((s) => ctx.baseInputs(s.terrain, need)); const lk = ctx.pickLocked(o, cfg, lr); if (lk.some((t) => need[t]) || lk.length > 2) lockBad++; }
  ok("11c locked palette never locks a needed base terrain", lockBad === 0);
  const rl = ctx.createPaintRound(cfg, { ...baseSpec, mods: ["locked"] }, rng(4));
  ok("11d a locked terrain cannot be painted", rl.locked.length > 0 && ctx.paintSpray(rl, 30, 30, 5, rl.locked[0]).length === 0);
  const rm = ctx.createPaintRound(cfg, { ...baseSpec, mods: ["meteors"] }, rng(4)); ctx.paintSpray(rm, 37, 37, 30, 1); const filled = rm.grid.total - rm.blank;
  for (let t = 0; t < 85; t++) ctx.roundTick(rm, 0.1);
  ok("11e meteor warns then blanks painted cells", rm.events.join() === "meteorWarn,meteor" && rm.grid.total - rm.blank < filled && rm.blank === ctx.countGrid(rm.grid)[0], rm.events);
  const rs = ctx.createPaintRound(cfg, { ...baseSpec, mods: ["shrink"] }, rng(4)); const b0 = ctx.brushRad(rs); ctx.roundTick(rs, 89.9);
  ok("11f brush shrinks to 50%", Math.abs(ctx.brushRad(rs) / b0 - 0.5) < 0.01);
  const rv = ctx.createPaintRound(cfg, { ...baseSpec, mods: ["vip"] }, rng(4)); const other = [1, 2, 3, 4, 5, 6].find((t) => !rv.queue[0].slots.some((s) => s.terrain === t));
  const fv = paintAll(rv, other); const fs2 = fillExact(rv, rv.queue[0]);
  ok("11g VIP: below B earns nothing, S still pays", fv.paid === 0 && fv.points === 0 && fs2.points === 10 && fs2.paid > 0);
  const meta = ctx.newMeta(), run = ctx.newRun(meta, cfg, rng(3));
  ok("11h bosses: 1, 1, 2 distinct modifiers", run.bossMods[0].length === 1 && run.bossMods[1].length === 1 && run.bossMods[2].length === 2 && run.bossMods[2][0] !== run.bossMods[2][1]);
  run.level = 4; run.bossMods[0] = ["rush"];
  ok("11i rush = 60 s, only on the boss", ctx.levelSpec(run, meta, cfg).seconds === 60 && (run.level = 3, ctx.levelSpec(run, meta, cfg).seconds === 90 && ctx.levelSpec(run, meta, cfg).mods.length === 0));
  const off = { ...cfg }; ctx.MODS.forEach((m) => (off[ctx.modKey(m)] = false)); off.modFog = true;
  ok("11j disabled modifiers are never picked", ctx.pickBossMods(off, rng(1)).every((a) => a.every((m) => m === "fog")));
}
// ---------- 12. grid / shapes / sizes ----------
{
  let okAll = true;
  for (const s of ctx.SHAPE_NAMES) { const g = ctx.makeGrid(50, s); if (g.total < 300) okAll = false; }
  ok("12a 19 shapes, all substantial", ctx.SHAPE_NAMES.length === 19 && okAll);
  const o = { size: 0.65, shape: "circle" }; ok("12b grid scales with planet size (cell size constant)", ctx.gridFor(o, cfg).G === Math.round(75 * 0.65));
  const big = ctx.createPaintRound(cfg, baseSpec, rng(1)), small = ctx.createPaintRound(cfg, { ...baseSpec, sizeMin: 65, sizeMax: 65 }, rng(1));
  ok("12c brush radius does not shrink with the planet", ctx.brushRad(big) === ctx.brushRad(small) && small.grid.total < big.grid.total * 0.5);
  const r = ctx.createPaintRound(cfg, baseSpec, rng(1)); const ch = ctx.paintSpray(r, 37.5, 37.5, 0.2, 1);
  ok("12d touching any part of a square fills the whole square", ch.length >= 1 && r.blank === r.grid.total - ch.length);
  ok("12e system names", typeof ctx.systemName(rng(1)) === "string" && ctx.systemName(rng(1)).length > 4);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
