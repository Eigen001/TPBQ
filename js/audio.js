"use strict";
/* ================= AUDIO: synthesized music (chiptune / synthwave / 70s funk) + sfx (Web Audio, no files) ================= */
var AudioSys = (function () {
  var ctx = null, master, musicGain, sfxGain, leadBus, noiseBuf, waves = {};
  var muted = !!loadJSON("tpbq_mute"), song = null, songName = null, step = 0, nextTime = 0, tempoMul = 1;
  var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(n) { var m = /^([A-G])(#?)(\d)$/.exec(n); return 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] ? 1 : 0); }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function pulseWave(d) {
    var n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (var k = 1; k < n; k++) re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * d);
    return ctx.createPeriodicWave(re, im);
  }
  function applyVolumes() {
    if (!ctx) return;
    master.gain.value = muted ? 0 : 0.9;
    musicGain.gain.value = Math.max(0, Math.min(100, CONFIG.musicVolume)) / 100;
    sfxGain.gain.value = Math.max(0, Math.min(100, CONFIG.sfxVolume)) / 100;
  }
  function init() {
    if (ctx) { if (ctx.state !== "running") ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 8; comp.attack.value = 0.004; comp.release.value = 0.2; // safety limiter
      master.connect(comp); comp.connect(ctx.destination);
      ana = ctx.createAnalyser(); ana.fftSize = 2048; anaBuf = new Float32Array(2048); comp.connect(ana);
      musicGain = ctx.createGain(); musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.connect(master);
      leadBus = ctx.createGain(); leadBus.connect(musicGain);
      var echo = ctx.createDelay(0.5), fb = ctx.createGain(), wet = ctx.createGain(); // spacey echo on the lead
      echo.delayTime.value = 0.19; fb.gain.value = 0.3; wet.gain.value = 0.35;
      leadBus.connect(echo); echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(musicGain);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      waves.p12 = pulseWave(0.125); waves.p25 = pulseWave(0.25); waves.p50 = pulseWave(0.5);
      initStyles();
      applyVolumes();
      setInterval(schedule, 25);
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) ctx.suspend(); else { ctx.resume(); nextTime = 0; }
      });
      ctx.resume();
    } catch (e) { ctx = null; }
  }
  function tone(dest, type, f0, f1, t, dur, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    if (waves[type]) o.setPeriodicWave(waves[type]); else o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dest, t, dur, vol, type, freq, freqEnd) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.03);
  }
  /* ----- modern music styles: lo-fi, orchestral sci-fi, synthwave. Layered voices, filters, reverb, swing. ----- */
  var rvIn, vib, wow, padBus, lofiBus, ana, anaBuf, songLite = false, baseMul = 1;
  function initStyles() {
    var len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate), c, i, d;
    for (c = 0; c < 2; c++) { d = ir.getChannelData(c); for (i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    var conv = ctx.createConvolver(), rvOut = ctx.createGain(); conv.buffer = ir; rvIn = ctx.createGain(); rvOut.gain.value = 0.5;
    rvIn.connect(conv); conv.connect(rvOut); rvOut.connect(musicGain);
    vib = ctx.createGain(); vib.gain.value = 7; var l1 = ctx.createOscillator(); l1.frequency.value = 5.2; l1.connect(vib); l1.start();
    wow = ctx.createGain(); wow.gain.value = 9; var l2 = ctx.createOscillator(); l2.frequency.value = 0.45; l2.connect(wow); l2.start();
    padBus = ctx.createGain(); padBus.connect(musicGain);
    lofiBus = ctx.createBiquadFilter(); lofiBus.type = "lowpass"; lofiBus.frequency.value = 2600; lofiBus.connect(musicGain);
  }
  function synth(o) { // one layered, filtered, enveloped voice
    var g = ctx.createGain(), end = o.t + o.dur + (o.r || 0.06), a = Math.min(o.a || 0.006, o.dur * 0.5), flt = null;
    g.gain.setValueAtTime(0.0001, o.t); g.gain.linearRampToValueAtTime(o.vol, o.t + a);
    if (o.decay) g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol * o.decay), o.t + o.dur); else g.gain.setValueAtTime(o.vol, o.t + o.dur);
    g.gain.linearRampToValueAtTime(0.0001, end);
    if (o.cut) {
      flt = ctx.createBiquadFilter(); flt.type = "lowpass"; flt.Q.value = o.q || 0.7; flt.frequency.setValueAtTime(o.cut, o.t);
      if (o.cutEnd) flt.frequency.exponentialRampToValueAtTime(o.cutEnd, o.t + Math.max(0.02, o.dur * (o.cutT || 1)));
      flt.connect(g);
    }
    o.osc.forEach(function (d) { // [wave, detune cents, level, frequency multiple]
      var os = ctx.createOscillator(), og = ctx.createGain(); os.type = d[0]; os.frequency.value = o.f * (d[3] || 1); os.detune.value = d[1] || 0; og.gain.value = d[2];
      if (o.lfo) o.lfo.connect(os.detune);
      os.connect(og); og.connect(flt || g); os.start(o.t); os.stop(end + 0.03);
    });
    g.connect(o.dest);
    if (o.send) { var sg = ctx.createGain(); sg.gain.value = o.send; g.connect(sg); sg.connect(rvIn); }
  }
  var INST = {
    wbass: function (t, f, d) { synth({ t: t, f: f, dur: d, vol: 0.11, decay: 0.35, r: 0.04, cut: 900, cutEnd: 260, q: 4, osc: [["sawtooth", 0, 1], ["square", 0, 0.4, 0.5]], dest: musicGain }); },
    wpad: function (t, f, d) { synth({ t: t, f: f, dur: d, vol: 0.03, a: 0.2, r: 0.5, cut: 1700, osc: [["sawtooth", -11, 1], ["sawtooth", 11, 1]], dest: padBus, send: 0.3 }); },
    warp: function (t, f, d) { synth({ t: t, f: f, dur: d, vol: 0.035, decay: 0.15, r: 0.05, cut: 3000, cutEnd: 800, osc: [["square", 0, 1], ["sawtooth", 7, 0.6]], dest: leadBus }); },
    clead: function (t, f, d) { tone(leadBus, "p25", f, 0, t, d, 0.07); },
    cbass: function (t, f, d) { tone(musicGain, "triangle", f, 0, t, d, 0.2); },
    carp: function (t, f, d) { tone(musicGain, "p12", f, 0, t, d, 0.03); },
    fbass: function (t, f, d) { synth({ t: t, f: f, dur: d, vol: 0.16, decay: 0.3, r: 0.04, cut: 1500, cutEnd: 320, q: 6, osc: [["sawtooth", 0, 1], ["square", 0, 0.5, 0.5]], dest: musicGain }); },
    clav: function (t, f, d) { synth({ t: t, f: f, dur: Math.max(d, 0.07), vol: 0.045, decay: 0.12, r: 0.03, cut: 3400, cutEnd: 900, q: 5, osc: [["square", 0, 1], ["sawtooth", 0, 0.5, 2]], dest: musicGain, send: 0.08 }); },
    brass: function (t, f, d) { synth({ t: t, f: f, dur: d, vol: 0.04, a: 0.015, decay: 0.55, r: 0.08, cut: 900, cutEnd: 2800, cutT: 0.25, osc: [["sawtooth", -7, 1], ["sawtooth", 7, 1], ["square", 0, 0.3]], dest: musicGain, send: 0.25 }); },
    flead: function (t, f, d) { synth({ t: t, f: f, dur: d, vol: 0.05, a: 0.012, r: 0.12, cut: 2600, cutEnd: 1500, q: 2, osc: [["square", 0, 1], ["sine", 0, 0.6, 2]], lfo: vib, dest: leadBus, send: 0.2 }); },
    wlead: function (t, f, d) { synth({ t: t, f: f, dur: d, vol: 0.055, a: 0.02, r: 0.2, cut: 2400, osc: [["sawtooth", -5, 1], ["sawtooth", 5, 1]], lfo: vib, dest: leadBus, send: 0.3 }); }
  };
  function pump(t) { padBus.gain.cancelScheduledValues(t); padBus.gain.setValueAtTime(0.3, t); padBus.gain.linearRampToValueAtTime(1, t + 0.28); }
  function drum(kit, ch, t) {
    if (kit === "chip") {
      if (ch === "k") tone(musicGain, "sine", 160, 45, t, 0.11, 0.4);
      else if (ch === "s") noise(musicGain, t, 0.09, 0.2, "highpass", 1500);
      else if (ch === "h") noise(musicGain, t, 0.03, 0.09, "highpass", 7000);
    } else if (kit === "funk") {
      if (ch === "k") tone(musicGain, "sine", 140, 46, t, 0.16, 0.5);
      else if (ch === "s") { noise(musicGain, t, 0.13, 0.22, "bandpass", 1900); tone(musicGain, "triangle", 200, 160, t, 0.07, 0.14); }
      else if (ch === "g") noise(musicGain, t, 0.05, 0.06, "bandpass", 2000);
      else if (ch === "h") noise(musicGain, t, 0.03, 0.06, "highpass", 8000);
      else if (ch === "o") noise(musicGain, t, 0.13, 0.06, "highpass", 7000);
      else if (ch === "c") noise(musicGain, t, 0.05, 0.1, "bandpass", 900, 2400);
      else if (ch === "p") tone(musicGain, "sine", 330, 250, t, 0.08, 0.16);
    } else {
      if (ch === "k" || ch === "K") { tone(musicGain, "sine", 150, 40, t, 0.2, 0.5); pump(t); }
      if (ch === "K") { noise(musicGain, t, 0.2, 0.2, "bandpass", 1600); noise(rvIn, t, 0.3, 0.3, "bandpass", 1400); tone(musicGain, "triangle", 210, 160, t, 0.1, 0.12); }
      else if (ch === "h") noise(musicGain, t, 0.03, 0.055, "highpass", 8000);
      else if (ch === "o") noise(musicGain, t, 0.14, 0.055, "highpass", 7000);
    }
  }
  /* ----- songs are COMPOSED from sections (chords + per-bar patterns), so a loop is 24-32 bars (43-52 s at game tempo), not 4 ----- */
  var KIND = { m: [0, 3, 7, 12], M: [0, 4, 7, 12], m7: [0, 3, 7, 10], "7": [0, 4, 7, 10], M7: [0, 4, 7, 11] };
  function tn(root, kind, i) { var k = KIND[kind], n = k.length; return root + k[((i % n) + n) % n] + 12 * Math.floor(i / n); }
  function r16(a) { var p = []; for (var i = 0; i < a.length; i++) p.push(i, a[i], 1); return p; }
  // def.tracks: [instrument, type, transpose, gate]; type "t" = chord-tone index, "s" = semitones above the root, "c" = chord (list of tone indices)
  // def.sections: { ch: [[root, kind] per bar], p: [pattern (or list of per-bar patterns) per track], d: [16-step drum string per bar] }
  function compose(def) {
    var maps = def.tracks.map(function () { return { map: {}, len: 0 }; }), drums = "", bar = 0;
    def.sections.forEach(function (sec) {
      sec.ch.forEach(function (c, bi) {
        var base = bar * 16;
        def.tracks.forEach(function (tr, ti) {
          var p = sec.p[ti]; if (!p || !p.length) return;
          if (Array.isArray(p[0])) p = p[bi % p.length];
          for (var k = 0; p && k < p.length; k += 3) {
            var v = p[k + 1];
            if (tr[1] === "c") maps[ti].map[base + p[k]] = { ms: v.map(function (i) { return tn(c[0], c[1], i) + tr[2]; }), l: p[k + 2] };
            else maps[ti].map[base + p[k]] = { m: (tr[1] === "s" ? c[0] + v : tn(c[0], c[1], v)) + tr[2], l: p[k + 2] };
          }
        });
        drums += sec.d[bi % sec.d.length]; bar++;
      });
    });
    maps.forEach(function (m) { m.len = bar * 16; });
    return { bpm: def.bpm, kit: def.kit, swing: def.swing || 0, bars: bar, drums: drums, tracks: def.tracks.map(function (tr, i) { return [tr[0], maps[i], tr[3]]; }) };
  }
  var Am = [57, "m"], F = [53, "M"], Gc = [55, "M"], E7 = [52, "7"], Dm = [50, "m"], C = [48, "M"], Em = [52, "m"];
  var STYLES = {};
  // CHIPTUNE "Rush Order": pulse lead with echo, triangle bass, arpeggios. 32 bars.
  (function () {
    var P1 = [Am, F, Gc, E7], P2 = [F, Gc, Am, Am], P3 = [Dm, Gc, C, E7], P4 = [Am, Gc, F, E7];
    var L1 = [0, 0, 1, 1, 1, 1, 2, 2, 1, 3, 3, 1, 4, 2, 1, 5, 1, 1, 6, 0, 1, 7, 1, 1, 8, 2, 2, 10, 3, 2, 12, 4, 2, 14, 2, 2];
    var L2 = [0, 3, 2, 3, 2, 1, 4, 3, 2, 6, 4, 2, 9, 3, 1, 10, 2, 2, 12, 1, 2, 14, 2, 2];
    var L3 = [0, 2, 3, 3, 3, 3, 6, 4, 6, 12, 3, 2, 14, 2, 2];
    var L4 = [0, 4, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 4, 2, 1, 5, 3, 1, 6, 4, 1, 7, 5, 1, 8, 4, 1, 9, 3, 1, 10, 2, 1, 11, 3, 1, 12, 4, 2, 14, 2, 2];
    var L5 = [0, 2, 2, 4, 2, 1, 6, 3, 2, 8, 4, 4, 14, 3, 2];
    var LE = [0, 4, 2, 2, 3, 2, 4, 2, 2, 6, 1, 2, 8, 0, 1, 9, 1, 1, 10, 2, 1, 11, 3, 1, 12, 4, 4];
    var B1 = [0, 0, 2, 2, 12, 2, 4, 0, 2, 6, 12, 2, 8, 0, 2, 10, 12, 2, 12, 0, 2, 14, 12, 2];
    var B2 = [0, 0, 1, 1, 0, 1, 2, 12, 2, 4, 0, 1, 5, 0, 1, 6, 7, 2, 8, 0, 1, 9, 0, 1, 10, 12, 2, 12, 0, 2, 14, 7, 2];
    var B3 = [0, 0, 6, 6, 0, 2, 8, 7, 4, 12, 12, 4];
    var A1 = r16([0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2]), A2 = r16([0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3]);
    var D1 = "k-hhs-hhk-khs-hh", D2 = "k-h-s-h-k-h-s-hh", DF = "k-hhs-hhkkhsssss", DH = "k--hs--hk-khs-h-", DB = "k---h---k---h-h-", DU = "k-k-k-k-kkkkssss";
    STYLES.chip = compose({
      bpm: 150, kit: "chip", tracks: [["clead", "t", 12, 0.85], ["cbass", "s", -12, 0.9], ["carp", "t", 0, 0.6]],
      sections: [
        { ch: P1, p: [L1, B1, null], d: [D1, D1, D1, DF] },
        { ch: P1, p: [[L2, L2, L3, LE], B2, A1], d: [D1, D1, D1, DF] },
        { ch: P2, p: [[L3, L5, L4, L4], B1, A2], d: [D2, D2, D1, DF] },
        { ch: P4, p: [[L4, L1, L4, LE], B2, A1], d: [D1, D1, D1, DF] },
        { ch: P3, p: [[L5, L5, L2, L3], B3, A2], d: [DH, DH, DH, DF] },
        { ch: P1, p: [null, B2, A2], d: [DB, DB, DB, DU] },
        { ch: P1, p: [[L1, L4, L1, L4], B2, A1], d: [D1, D1, D1, DF] },
        { ch: P4, p: [[L2, L3, L2, LE], B1, A2], d: [D1, D2, D1, DF] }
      ]
    });
  })();
  // SYNTHWAVE "Neon Freight": pulsing bass, pumping pad, arpeggio, delayed lead, gated snare. 24 bars.
  (function () {
    var W1 = [Am, F, C, Gc], W2 = [F, Gc, Am, Em], W3 = [Dm, F, Am, Gc], W4 = [F, Gc, E7, E7];
    var PB = r16([0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0]), PB2 = [0, 0, 2, 2, 12, 2, 4, 0, 2, 6, 12, 2, 8, 0, 2, 10, 12, 2, 12, 0, 2, 14, 7, 2], PB3 = [0, 0, 8, 8, 0, 6, 14, 12, 2];
    var PAD = [0, [0, 1, 2], 16];
    var WA1 = r16([0, 1, 2, 4, 2, 1, 0, 1, 0, 1, 2, 4, 2, 1, 0, 1]), WA2 = r16([4, 2, 1, 2, 4, 2, 1, 2, 5, 2, 1, 2, 4, 2, 1, 2]), WA3 = [0, 2, 2, 2, 3, 2, 4, 4, 2, 6, 3, 2, 8, 2, 2, 10, 3, 2, 12, 4, 2, 14, 5, 2];
    var M1 = [0, 2, 6, 6, 1, 2, 8, 0, 4, 12, 2, 4], M2 = [0, 3, 6, 6, 2, 2, 8, 1, 8], M3 = [0, 4, 4, 4, 3, 2, 6, 2, 2, 8, 3, 4, 12, 1, 4];
    var M4 = [0, 2, 2, 2, 3, 2, 4, 4, 4, 8, 5, 6, 14, 4, 2], M5 = [0, 4, 12, 12, 3, 2, 14, 2, 2];
    var D1 = "k-h-K-h-k-h-K-ho", DF = "k-h-K-h-k-h-KhKK", DQ = "k-h-h-h-k-h-h-ho", DB = "k-------k-----h-";
    STYLES.wave = compose({
      bpm: 110, kit: "wave", tracks: [["wbass", "s", -12, 0.7], ["wpad", "c", 0, 0.95], ["warp", "t", 12, 0.7], ["wlead", "t", 12, 0.9]],
      sections: [
        { ch: W1, p: [PB, PAD, null, null], d: [DQ, DQ, DQ, D1] },
        { ch: W1, p: [PB, PAD, WA1, [M1, M2, M1, M3]], d: [D1, D1, D1, DF] },
        { ch: W2, p: [PB2, PAD, WA2, [M4, M2, M4, M5]], d: [D1, D1, D1, DF] },
        { ch: W3, p: [PB, PAD, WA1, [M3, M1, M3, M2]], d: [D1, D1, D1, DF] },
        { ch: W4, p: [PB3, PAD, WA3, [M5, [], M5, []]], d: [DB, DB, DQ, DF] },
        { ch: W1, p: [PB, PAD, WA2, [M4, M3, M4, M1]], d: [D1, D1, D1, DF] }
      ]
    });
  })();
  // 70s FUNK "Overtime at the Planet Works": syncopated bass, clavinet, brass stabs, wah chicks, 16th hats. 24 bars.
  (function () {
    var Em7 = [52, "m7"], A7 = [57, "7"], CM7 = [48, "M7"], D7 = [50, "7"], Am7 = [57, "m7"], Bm7 = [59, "m7"], B7 = [59, "7"];
    var F1 = [Em7, Em7, Em7, Em7], F2 = [A7, A7, Em7, Em7], F3 = [CM7, D7, Em7, Em7], F4 = [Am7, Bm7, CM7, B7];
    var FB1 = [0, 0, 2, 3, 0, 1, 4, 12, 1, 6, 0, 1, 7, 10, 1, 8, 0, 2, 11, 7, 1, 12, 10, 1, 14, 12, 1, 15, 10, 1];
    var FB2 = [0, 0, 1, 2, 0, 1, 3, 12, 1, 5, 10, 1, 6, 12, 1, 8, 0, 2, 10, 7, 1, 11, 10, 1, 12, 12, 1, 14, 10, 1, 15, 7, 1];
    var FB3 = [0, 0, 2, 2, 12, 1, 4, 0, 2, 6, 7, 1, 8, 0, 1, 9, 3, 1, 10, 5, 1, 11, 6, 1, 12, 7, 2, 14, 10, 1, 15, 11, 1];
    var FB4 = [0, 0, 3, 6, 0, 1, 7, 12, 1, 10, 0, 2, 14, 10, 2];
    var FB5 = [0, 0, 2, 3, 0, 1, 4, 12, 1, 6, 7, 1, 8, 0, 2, 11, 7, 1, 12, 12, 1, 14, 7, 2];
    var CL1 = [1, 2, 1, 2, 3, 1, 4, 2, 1, 6, 3, 1, 7, 2, 1, 9, 3, 1, 10, 4, 1, 12, 2, 1, 14, 3, 1, 15, 2, 1];
    var CL2 = [0, 4, 1, 2, 3, 1, 3, 2, 1, 5, 3, 1, 6, 4, 1, 8, 5, 1, 10, 4, 1, 11, 3, 1, 13, 2, 1, 14, 3, 1];
    var BR1 = [0, [1, 2, 3], 1, 3, [1, 2, 3], 1, 10, [1, 2, 3], 2], BR2 = [6, [1, 2, 3], 1, 7, [2, 3, 4], 3];
    var BRH = [0, [1, 2, 3, 4], 2, 4, [1, 2, 3, 4], 2, 8, [1, 2, 3, 4], 1, 10, [1, 2, 3, 4], 1, 12, [2, 3, 4, 5], 4];
    var FL1 = [0, 4, 2, 3, 3, 1, 4, 4, 2, 7, 5, 1, 8, 4, 3, 12, 3, 2, 14, 2, 2], FL2 = [0, 2, 3, 4, 3, 2, 6, 4, 2, 8, 6, 6], FL3 = [2, 5, 1, 3, 4, 1, 4, 3, 2, 8, 4, 1, 9, 5, 1, 10, 6, 4];
    var D1 = "k-hhs-hkh-khs-ho", D2 = "k-hgs-hkhgk-s-hh", D3 = "kchcschkcckcschc", D4 = "kphps-pkh-kps-po", DF = "k-hhs-hkh-ksssss", DB = "k--h--k---h-s---", DU = "k-k-s-k-ksksssss";
    STYLES.funk = compose({
      bpm: 132, kit: "funk", swing: 0.1, tracks: [["fbass", "s", -12, 0.8], ["clav", "t", 0, 0.55], ["brass", "c", 12, 0.8], ["flead", "t", 12, 0.85]],
      sections: [
        { ch: F1, p: [[FB1, FB2, FB1, FB2], CL1, null, null], d: [D1, D1, D1, DF] },
        { ch: F1, p: [[FB1, FB2, FB1, FB2], [CL1, CL2], [BR1, BR2, BR1, BRH], null], d: [D3, D1, D3, DF] },
        { ch: F2, p: [[FB1, FB2, FB1, FB3], CL2, [BR1, [], BR1, BR2], [FL1, FL2, FL1, FL3]], d: [D4, D1, D4, DF] },
        { ch: F3, p: [[FB5, FB1, FB1, FB2], CL1, [BR2, BR2, BR1, BRH], [FL2, FL3, FL1, FL2]], d: [D1, D3, D1, DF] },
        { ch: F1, p: [FB4, CL2, null, null], d: [DB, DB, D2, DU] },
        { ch: F4, p: [[FB5, FB5, FB5, FB3], CL1, [BR1, BR1, BR2, BRH], [FL1, FL3, FL2, FL3]], d: [D3, D1, D3, DF] }
      ]
    });
  })();
  function schedStyle(sd, t) {
    var i, k, e;
    if (song.swing && step % 2 === 1) t += sd * song.swing;
    for (i = 0; i < song.tracks.length; i++) {
      var tr = song.tracks[i], m = tr[1]; e = m.map[step % m.len];
      if (!e) continue;
      var dur = e.l * sd * (tr[2] || 0.92);
      if (e.ms) for (k = 0; k < e.ms.length; k++) INST[tr[0]](t, hz(e.ms[k]), dur);
      else INST[tr[0]](t, hz(e.m), dur);
    }
    if (!songLite) { var ch = song.drums[step % song.drums.length]; if (ch !== "-") drum(song.kit, ch, t); }
  }
  function schedule() {
    if (!ctx || !song || ctx.state !== "running") return;
    var now = ctx.currentTime;
    if (nextTime < now) nextTime = now + 0.05;
    while (nextTime < now + 0.15) {
      var sd = 60 / (song.bpm * tempoMul * baseMul) / 4, t = nextTime, e;
      schedStyle(sd, t);
      nextTime += sd; step++;
    }
  }
  function music(name) { // name: "title" | "game" | "recap" | null, played in the selected style
    if (!ctx) return;
    var key = name ? CONFIG.musicStyle + ":" + name : null;
    if (key === songName) return;
    songName = key; step = 0; tempoMul = 1; nextTime = ctx.currentTime + 0.08;
    if (!name) { song = null; return; }
    song = STYLES[CONFIG.musicStyle] || STYLES.chip; songLite = name === "recap"; baseMul = name === "title" ? 0.92 : name === "recap" ? 0.86 : 1;
  }
  function restyle() { var cur = songName ? songName.split(":")[1] : null; songName = "?"; music(cur); }
  function peak() { if (!ana) return 0; ana.getFloatTimeDomainData(anaBuf); var m = 0; for (var i = 0; i < anaBuf.length; i++) m = Math.max(m, Math.abs(anaBuf[i])); return m; }
  var SFX = {
    tap: function (t) { tone(sfxGain, "p50", 880, 0, t, 0.04, 0.12); },
    pickup: function (t) { tone(sfxGain, "p25", 520, 1040, t, 0.07, 0.14); },
    rot: function (t, a) { tone(sfxGain, "p12", 700 + (a % 8) * 90, 0, t, 0.025, 0.09); },
    stamp: function (t) { tone(sfxGain, "p50", 240, 70, t, 0.13, 0.22); noise(sfxGain, t, 0.12, 0.3, "lowpass", 2500, 300); },
    erase: function (t) { noise(sfxGain, t, 0.25, 0.3, "bandpass", 4000, 400); tone(sfxGain, "p25", 900, 200, t, 0.22, 0.08); },
    bonk: function (t) { tone(sfxGain, "triangle", 190, 0, t, 0.08, 0.35); tone(sfxGain, "triangle", 140, 0, t + 0.1, 0.12, 0.35); },
    skip: function (t) { noise(sfxGain, t, 0.3, 0.25, "bandpass", 3000, 300); tone(sfxGain, "p25", 600, 90, t, 0.3, 0.13); tone(sfxGain, "p50", 180, 360, t + 0.3, 0.08, 0.13); },
    chatter: function (t) { // goofy alien client mumbling
      for (var i = 0; i < 5; i++) { var f = 300 + Math.random() * 700; tone(sfxGain, "p12", f, f * (0.7 + Math.random() * 0.7), t + i * 0.055, 0.05, 0.1); }
    },
    toss: function (t) { noise(sfxGain, t, 0.2, 0.28, "bandpass", 700, 3500); tone(sfxGain, "p25", 260, 980, t, 0.17, 0.11); tone(sfxGain, "triangle", 120, 60, t + 0.17, 0.09, 0.3); },
    ship: function (t) { [67, 72, 79].forEach(function (m, i) { tone(sfxGain, "p25", hz(m), 0, t + i * 0.06, 0.09, 0.12); }); noise(sfxGain, t, 0.32, 0.12, "bandpass", 500, 4500); },
    spray: function (t) { noise(sfxGain, t, 0.11, 0.06, "highpass", 3800); },
    beep: function (t) { tone(sfxGain, "p50", 440, 0, t, 0.12, 0.16); },
    go: function (t) { tone(sfxGain, "p50", 880, 0, t, 0.3, 0.16); tone(sfxGain, "p25", 1320, 0, t, 0.3, 0.08); },
    tick: function (t) { tone(sfxGain, "p12", 1500, 0, t, 0.04, 0.14); },
    coin: function (t) { tone(sfxGain, "p50", 1319, 0, t, 0.07, 0.13); tone(sfxGain, "p50", 1760, 0, t + 0.07, 0.22, 0.13); },
    grade: function (t, gi) {
      var seq, i;
      if (gi === 0) seq = [72, 76, 79, 84, 88, 91, 96];
      else if (gi === 1) seq = [72, 76, 79, 84];
      else if (gi === 2) seq = [72, 79];
      else if (gi === 3) seq = [67, 65];
      if (seq) { for (i = 0; i < seq.length; i++) tone(sfxGain, "p25", hz(seq[i]), 0, t + i * 0.055, 0.09, 0.14); }
      else { // D / F : sad trombone "womp womp"
        var w = [311, 293, 277, 261];
        for (i = 0; i < (gi === 5 ? 4 : 2); i++) tone(sfxGain, "sawtooth", w[i], w[i] * (i === 3 || (gi === 4 && i === 1) ? 0.8 : 0.97), t + i * 0.2, i === 3 ? 0.5 : 0.19, 0.13);
      }
    },
    end: function (t) { tone(sfxGain, "sawtooth", 120, 100, t, 0.55, 0.2); tone(sfxGain, "p50", 123, 100, t, 0.55, 0.12); noise(sfxGain, t, 0.5, 0.12, "lowpass", 900); },
    fanfare: function (t) { [60, 64, 67, 72, 67, 72, 76].forEach(function (m, i) { tone(sfxGain, "p25", hz(m), 0, t + i * 0.09, i === 6 ? 0.4 : 0.085, 0.13); }); }
  };
  function sfx(name, arg) { if (ctx && ctx.state === "running" && SFX[name]) try { SFX[name](ctx.currentTime + 0.005, arg); } catch (e) { } }
  return {
    styles: STYLES,
    loopSeconds: function (style) { var s = STYLES[style]; return s.bars * 16 * 60 / s.bpm / 4; },
    init: init, music: music, sfx: sfx, applyVolumes: applyVolumes, restyle: restyle, peak: peak,
    setTempo: function (m) { tempoMul = m; },
    isMuted: function () { return muted; },
    toggleMute: function () { muted = !muted; saveJSON("tpbq_mute", muted); applyVolumes(); return muted; }
  };
})();

