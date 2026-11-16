// Reliks-VM assembler + High-Level Reliks-Script macro compiler (works in Node and browsers).
// 100% backward-compatible with raw Reliks-VM assembly, plus structured high-level DSL:
//   .vars X Y I J R C        (auto-assigns variable slots 0..254)
//   seedrng                  (lane 0 serial xor lane 1 lane 2 lane 3 rnginit)
//   bg 0x0b0f14              (fills canvas background)
//   set X 100 / inc X 5      (assign / increment variable by literal or variable)
//   rand 20 380              (push/load min & max, then rndr)
//   for I 0 40 ... endfor    (structured counted loop, nestable)
//   if ... else ... endif    (structured conditional branch, nestable)
(function (g) {
  'use strict';
  var OPS = {
    halt: [0x00, null], push: [0x01, 's'], dup: [0x02, null], drop: [0x03, null], swap: [0x04, null], over: [0x05, null], rot: [0x06, null],
    add: [0x10, null], sub: [0x11, null], mul: [0x12, null], div: [0x13, null], mod: [0x14, null], neg: [0x15, null], abs: [0x16, null], min: [0x17, null], max: [0x18, null],
    and: [0x20, null], or: [0x21, null], xor: [0x22, null], not: [0x23, null], shl: [0x24, null], shr: [0x25, null], ushr: [0x26, null],
    eq: [0x30, null], ne: [0x31, null], lt: [0x32, null], le: [0x33, null], gt: [0x34, null], ge: [0x35, null],
    jmp: [0x40, 'u16'], jz: [0x41, 'u16'], jnz: [0x42, 'u16'], call: [0x43, 'u16'], ret: [0x44, null],
    load: [0x50, 'u8'], store: [0x51, 'u8'], ldx: [0x52, null], stx: [0x53, null],
    lane: [0x60, 'u8'], serial: [0x61, null], pat: [0x62, null], wear: [0x63, null],
    rnginit: [0x70, null], rnd: [0x71, null], rndr: [0x72, null],
    fill: [0x80, null], stroke: [0x81, null], swidth: [0x82, null], opacity: [0x83, null],
    rect: [0x90, null], circle: [0x91, null], line: [0x92, null],
    pbegin: [0x94, null], m: [0x95, null], l: [0x96, null], z: [0x97, null], pend: [0x98, null],
    lr: [0x99, null], qr: [0x9a, null], gopen: [0x9b, null], gclose: [0x9c, null],
    gradbegin: [0x9d, null], gradstop: [0x9e, null], gradend: [0x9f, null]
  };
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function errAt(msg, ln) { return new Error(ln ? msg + ' (line ' + ln + ')' : msg); }
  function isIntTok(s) { return typeof s === 'string' && /^([+-]?)(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:0+|[1-9][0-9]*))$/.test(s); }
  function int0(s, ln) {
    if (s === undefined) throw errAt('missing operand', ln);
    var m = /^([+-]?)(?:0[xX]([0-9a-fA-F]+)|0[bB]([01]+)|0[oO]([0-7]+)|(0+|[1-9][0-9]*))$/.exec(s);
    if (!m) throw errAt('bad integer: ' + s, ln);
    var v = m[2] !== undefined ? BigInt('0x' + m[2]) : m[3] !== undefined ? BigInt('0b' + m[3]) : m[4] !== undefined ? BigInt('0o' + m[4]) : BigInt(m[5]);
    return m[1] === '-' ? -v : v;
  }
  function sleb(v) {
    var out = [];
    for (;;) {
      var b = Number(v & 0x7fn); v >>= 7n;
      if ((v === 0n && !(b & 0x40)) || (v === -1n && (b & 0x40))) { out.push(b); return out; }
      out.push(b | 0x80);
    }
  }
  function rng(v, max, what, ln) { if (v < 0n || v > BigInt(max)) throw errAt(what + ' out of range', ln); return Number(v); }
  function assemble(src) {
    var toks = [], tlines = [], lines = String(src).split('\n'), i, j;
    for (i = 0; i < lines.length; i++) {
      var p = lines[i].split(';')[0].split(/\s+/);
      for (j = 0; j < p.length; j++) if (p[j]) { toks.push(p[j]); tlines.push(i + 1); }
    }
    var at = function (a, lns, k, refLn) { if (k >= a.length) throw errAt('missing operand', refLn || (lns && lns[a.length - 1])); return a[k]; };
    var exp = [], elines = [], names = new Map(), usedSlots = new Set(), nextSlot = 0;
    function allocSlot(ln) {
      while (usedSlots.has(nextSlot)) nextSlot++;
      if (nextSlot > 254) throw errAt('too many .vars (max 255)', ln);
      usedSlots.add(nextSlot);
      return BigInt(nextSlot++);
    }
    // First pass: collect explicit .var slots so auto-allocated .vars never collide with explicit ones
    for (i = 0; i < toks.length; i++) {
      if (toks[i].toLowerCase() === '.var' && i + 2 < toks.length && isIntTok(toks[i + 2])) {
        var sv = int0(toks[i + 2], tlines[i + 2]);
        if (sv >= 0n && sv <= 255n) usedSlots.add(Number(sv));
        i += 2;
      }
    }
    function pushE(ln) { for (var k = 1; k < arguments.length; k++) { exp.push(arguments[k]); elines.push(ln); } }
    function pushValOrVar(ln, tok) {
      if (names.has(tok)) pushE(ln, 'load', tok);
      else pushE(ln, 'push', tok);
    }
    var canvasW = '64', canvasH = '64', macroSeq = 0, forStack = [], ifStack = [];
    i = 0;
    while (i < toks.length) {
      var t = toks[i], tl = t.toLowerCase(), ln = tlines[i];
      if (tl === '.canvas' && i + 2 < toks.length) {
        canvasW = toks[i + 1]; canvasH = toks[i + 2];
        pushE(ln, '.canvas', canvasW, canvasH);
        i += 3; continue;
      }
      if (tl === '.var') {
        var vname = at(toks, tlines, i + 1, ln);
        if (i + 2 < toks.length && isIntTok(toks[i + 2])) {
          names.set(vname, int0(toks[i + 2], tlines[i + 2] || ln));
          i += 3;
        } else {
          names.set(vname, allocSlot(ln));
          i += 2;
        }
        continue;
      }
      if (tl === '.vars') {
        var vln = ln; i += 1;
        while (i < toks.length && tlines[i] === vln && toks[i].charAt(0) !== '.' && !has(OPS, toks[i].toLowerCase())) {
          names.set(toks[i], allocSlot(vln));
          i += 1;
        }
        continue;
      }
      if (tl === 'seedrng') {
        pushE(ln, 'lane', '0', 'serial', 'xor', 'lane', '1', 'lane', '2', 'lane', '3', 'rnginit');
        i += 1; continue;
      }
      if (tl === 'bg') {
        var bgCol = at(toks, tlines, i + 1, ln);
        pushE(ln, 'push', '-1', 'stroke', 'push', '100', 'opacity');
        pushValOrVar(ln, bgCol);
        pushE(ln, 'fill', 'push', '0', 'push', '0', 'push', canvasW, 'push', canvasH, 'rect');
        i += 2; continue;
      }
      if (tl === 'set') {
        var dstV = at(toks, tlines, i + 1, ln), valV = at(toks, tlines, i + 2, ln);
        pushValOrVar(ln, valV);
        pushE(ln, 'store', dstV);
        i += 3; continue;
      }
      if (tl === 'inc') {
        var incV = at(toks, tlines, i + 1, ln), stepV = at(toks, tlines, i + 2, ln);
        pushE(ln, 'load', incV);
        pushValOrVar(ln, stepV);
        pushE(ln, 'add', 'store', incV);
        i += 3; continue;
      }
      if (tl === 'rand') {
        var rMin = at(toks, tlines, i + 1, ln), rMax = at(toks, tlines, i + 2, ln);
        pushValOrVar(ln, rMin);
        pushValOrVar(ln, rMax);
        pushE(ln, 'rndr');
        i += 3; continue;
      }
      if (tl === 'for' || tl === 'forle') {
        var fv = at(toks, tlines, i + 1, ln), fStart = at(toks, tlines, i + 2, ln), fLim = at(toks, tlines, i + 3, ln);
        if (!names.has(fv) && !isIntTok(fv)) names.set(fv, allocSlot(ln));
        var flbl = '__for_' + (++macroSeq);
        pushValOrVar(ln, fStart);
        pushE(ln, 'store', fv, flbl + ':');
        forStack.push({ v: fv, lim: fLim, lbl: flbl, le: tl === 'forle', ln: ln });
        i += 4; continue;
      }
      if (tl === 'endfor') {
        if (!forStack.length) throw errAt('endfor without matching for', ln);
        var ftop = forStack.pop();
        pushE(ln, 'load', ftop.v, 'push', '1', 'add', 'dup', 'store', ftop.v);
        pushValOrVar(ln, ftop.lim);
        pushE(ln, ftop.le ? 'le' : 'lt', 'jnz', ftop.lbl);
        i += 1; continue;
      }
      if (tl === 'if' || tl === 'ifz') {
        var id = ++macroSeq;
        var elseL = '__else_' + id, endL = '__endif_' + id;
        pushE(ln, tl === 'if' ? 'jz' : 'jnz', elseL);
        ifStack.push({ elseLbl: elseL, endLbl: endL, hasElse: false, ln: ln });
        i += 1; continue;
      }
      if (tl === 'else') {
        if (!ifStack.length) throw errAt('else without matching if', ln);
        var itop = ifStack[ifStack.length - 1];
        if (itop.hasElse) throw errAt('duplicate else in if block', ln);
        itop.hasElse = true;
        pushE(ln, 'jmp', itop.endLbl, itop.elseLbl + ':');
        i += 1; continue;
      }
      if (tl === 'endif') {
        if (!ifStack.length) throw errAt('endif without matching if', ln);
        var idone = ifStack.pop();
        if (!idone.hasElse) pushE(ln, idone.elseLbl + ':');
        else pushE(ln, idone.endLbl + ':');
        i += 1; continue;
      }
      if (tl === 'show') pushE(ln, 'store', '255', 'load', '255', 'push', '0', 'push', '1', 'push', '1', 'rect');
      else if (tl === 'next' || tl === 'nextle') {
        var v = at(toks, tlines, i + 1, ln), lim = at(toks, tlines, i + 2, ln), lab = at(toks, tlines, i + 3, ln);
        pushE(ln, 'load', v, 'push', '1', 'add', 'dup', 'store', v);
        if (names.has(lim)) pushE(ln, 'load', lim); else pushE(ln, 'push', lim);
        pushE(ln, tl === 'next' ? 'lt' : 'le', 'jnz', lab);
        i += 3;
      } else if (tl === 'ld' || tl === 'st') { pushE(ln, tl === 'ld' ? 'load' : 'store', at(toks, tlines, i + 1, ln)); i += 1; }
      else pushE(ln, t);
      i += 1;
    }
    if (forStack.length) throw errAt('unclosed for loop', forStack[forStack.length - 1].ln);
    if (ifStack.length) throw errAt('unclosed if block', ifStack[ifStack.length - 1].ln);
    var W = 64n, H = 64n, canvasLn = 1, items = [];
    i = 0;
    while (i < exp.length) {
      var x = exp[i], xln = elines[i];
      if (x === '.canvas') { canvasLn = xln; W = int0(at(exp, elines, i + 1, xln), elines[i + 1] || xln); H = int0(at(exp, elines, i + 2, xln), elines[i + 2] || xln); i += 3; }
      else if (x === '.byte') { items.push({ k: 'raw', b: rng(int0(at(exp, elines, i + 1, xln), elines[i + 1] || xln), 255, '.byte', xln), ln: xln }); i += 2; }
      else if (x.charAt(x.length - 1) === ':') { items.push({ k: 'label', n: x.slice(0, -1), ln: xln }); i += 1; }
      else {
        var name = x.toLowerCase();
        if (!has(OPS, name)) throw errAt('unknown opcode: ' + x, xln);
        var o = OPS[name];
        if (o[1] === null) { items.push({ k: 'op', op: o[0], kind: null, ln: xln }); i += 1; }
        else { items.push({ k: 'op', op: o[0], kind: o[1], arg: at(exp, elines, i + 1, xln), ln: xln }); i += 2; }
      }
    }
    var labels = new Map(), off = 0;
    items.forEach(function (it) {
      if (it.k === 'label') labels.set(it.n, off);
      else if (it.k === 'raw') off += 1;
      else { off += 1; if (it.kind === 's') off += sleb(int0(it.arg, it.ln)).length; else if (it.kind === 'u8') off += 1; else if (it.kind === 'u16') off += 2; }
    });
    var code = [];
    items.forEach(function (it) {
      if (it.k === 'label') return;
      if (it.k === 'raw') { code.push(it.b); return; }
      code.push(it.op);
      if (it.kind === 's') sleb(int0(it.arg, it.ln)).forEach(function (b) { code.push(b); });
      else if (it.kind === 'u8') code.push(rng(names.has(it.arg) ? names.get(it.arg) : int0(it.arg, it.ln), 255, 'u8', it.ln));
      else if (it.kind === 'u16') { var tg = rng(labels.has(it.arg) ? BigInt(labels.get(it.arg)) : int0(it.arg, it.ln), 65535, 'u16', it.ln); code.push(tg & 255, tg >> 8); }
    });
    var w = rng(W, 65535, 'canvas', canvasLn), h = rng(H, 65535, 'canvas', canvasLn);
    return Uint8Array.from([0x52, 0x56, 0x4d, 0x01, w & 255, w >> 8, h & 255, h >> 8].concat(code));
  }
  
  function hexColorInt(c, fallback) {
    var s = String(c || fallback || '#49c5b1').trim().replace(/^#|^0x/i, '');
    if (!/^[0-9a-fA-F]{6}$/.test(s)) s = '49c5b1';
    return '0x' + s.toLowerCase();
  }
  function clampInt(v, min, max, def) {
    var n = Math.round(Number(v));
    if (!Number.isFinite(n)) n = def;
    return Math.max(min, Math.min(max, n));
  }

  var VISUAL_PRESETS = {
    cyber_orbs: {
      name: 'Cyber Grid & Neon Orbs',
      bg: '#070b12', primary: '#49c5b1', secondary: '#ffd9a0', accent: '#e85d75',
      patinaShift: true, wearEffect: true,
      layers: [
        { type: 'glow', enabled: true, cx: 500, cy: 500, radius: 420, opacity: 85, colorSlot: 'primary' },
        { type: 'grid', enabled: true, cols: 8, rows: 8, margin: 120, gap: 12, density: 65, shape: 'mixed', opacity: 55, colorSlot: 'random' },
        { type: 'rings', enabled: true, count: 12, cx: 500, cy: 500, step: 28, strokeWidth: 2, opacity: 65, colorSlot: 'alternate' },
        { type: 'particles', enabled: true, count: 36, minR: 4, maxR: 22, spread: 400, opacity: 85, filled: true, colorSlot: 'random' }
      ]
    },
    solar_mandala: {
      name: 'Solar Mandala & Waves',
      bg: '#120914', primary: '#ffb347', secondary: '#ff5e62', accent: '#49c5b1',
      patinaShift: true, wearEffect: true,
      layers: [
        { type: 'glow', enabled: true, cx: 500, cy: 500, radius: 440, opacity: 90, colorSlot: 'primary' },
        { type: 'rays', enabled: true, count: 28, cx: 500, cy: 500, length: 400, strokeWidth: 2, opacity: 50, colorSlot: 'alternate' },
        { type: 'rings', enabled: true, count: 16, cx: 500, cy: 500, step: 22, strokeWidth: 3, opacity: 75, colorSlot: 'alternate' },
        { type: 'waves', enabled: true, count: 10, yStart: 640, spacing: 26, amp: 70, strokeWidth: 3, opacity: 65, colorSlot: 'secondary' },
        { type: 'polygons', enabled: true, count: 14, size: 65, spread: 320, opacity: 75, strokeWidth: 2, colorSlot: 'random' }
      ]
    },
    skyline_monoliths: {
      name: 'Synthwave Skyline Monoliths',
      bg: '#080711', primary: '#49c5b1', secondary: '#f7b267', accent: '#7b61ff',
      patinaShift: true, wearEffect: true,
      layers: [
        { type: 'glow', enabled: true, cx: 500, cy: 360, radius: 340, opacity: 90, colorSlot: 'secondary' },
        { type: 'particles', enabled: true, count: 45, minR: 2, maxR: 7, spread: 460, opacity: 80, filled: true, colorSlot: 'secondary' },
        { type: 'monoliths', enabled: true, count: 18, minW: 36, maxW: 96, minH: 140, maxH: 520, baseY: 880, opacity: 90, colorSlot: 'random' },
        { type: 'waves', enabled: true, count: 8, yStart: 880, spacing: 14, amp: 24, strokeWidth: 2, opacity: 60, colorSlot: 'primary' }
      ]
    },
    bauhaus_blocks: {
      name: 'Bauhaus Geometric Composition',
      bg: '#f4efe6', primary: '#d9381e', secondary: '#1b4965', accent: '#e9b44c',
      patinaShift: false, wearEffect: true,
      layers: [
        { type: 'grid', enabled: true, cols: 6, rows: 6, margin: 110, gap: 16, density: 80, shape: 'mixed', opacity: 90, colorSlot: 'random' },
        { type: 'polygons', enabled: true, count: 10, size: 110, spread: 340, opacity: 80, strokeWidth: 3, colorSlot: 'random' },
        { type: 'rings', enabled: true, count: 6, cx: 500, cy: 500, step: 48, strokeWidth: 4, opacity: 85, colorSlot: 'primary' }
      ]
    }
  };

  function compileLayers(spec) {
    spec = spec || VISUAL_PRESETS.cyber_orbs;
    var bgHex = hexColorInt(spec.bg, '#090d16');
    var c1 = hexColorInt(spec.primary, '#49c5b1');
    var c2 = hexColorInt(spec.secondary, '#ffd9a0');
    var c3 = hexColorInt(spec.accent, '#e85d75');
    var patOn = spec.patinaShift !== false;
    var wearOn = spec.wearEffect !== false;
    var layers = Array.isArray(spec.layers) ? spec.layers : [];
    var out = [
      '; Generated by Reliks Studio Visual No-Code Builder',
      '.canvas 1000 1000',
      '.vars I J X Y W H R DX DY C1 C2 C3 PICK WR',
      'seedrng',
      'wear push ' + (wearOn ? '1' : '0') + ' mul st WR ; wear_toggle',
      'bg ' + bgHex
    ];
    if (patOn) {
      out.push('push ' + c1 + ' pat push 2048 mul xor st C1');
      out.push('push ' + c2 + ' pat push 512 mul xor st C2');
      out.push('push ' + c3 + ' pat push 4096 mul xor st C3');
    } else {
      out.push('set C1 ' + c1);
      out.push('set C2 ' + c2);
      out.push('set C3 ' + c3);
    }

    var gradCount = 0;
    function colorExpr(slot, targetOp, idxVar) {
      if (slot === 'primary') return 'ld C1 ' + targetOp;
      if (slot === 'secondary') return 'ld C2 ' + targetOp;
      if (slot === 'accent') return 'ld C3 ' + targetOp;
      if (slot === 'alternate') {
        var v = idxVar || 'I';
        return 'ld ' + v + ' push 2 mod if ld C1 ' + targetOp + ' else ld C2 ' + targetOp + ' endif';
      }
      return 'rand 0 2 st PICK ld PICK push 0 eq if ld C1 ' + targetOp + ' else ld PICK push 1 eq if ld C2 ' + targetOp + ' else ld C3 ' + targetOp + ' endif endif';
    }

    layers.forEach(function (L, idx) {
      if (!L || L.enabled === false) return;
      var t = String(L.type || 'rings');
      var op = clampInt(L.opacity, 5, 100, 75);
      var slot = L.colorSlot || 'random';
      out.push('');
      out.push('; Layer ' + (idx + 1) + ': ' + t);

      if (t === 'glow' && gradCount < 8) {
        var gcx = clampInt(L.cx, 0, 1000, 500);
        var gcy = clampInt(L.cy, 0, 1000, 500);
        var gr = clampInt(L.radius, 40, 600, 380);
        var gCol = slot === 'secondary' ? c2 : slot === 'accent' ? c3 : c1;
        var gMid = slot === 'secondary' ? c3 : c2;
        out.push('gradbegin push 0 push ' + gCol + ' push ' + op + ' gradstop push 50 push ' + gMid + ' push ' + Math.max(10, Math.floor(op / 2)) + ' gradstop push 100 push ' + bgHex + ' push 0 gradstop gradend');
        out.push('push -1 stroke push 100 opacity push ' + (0x1000000 + gradCount) + ' fill');
        out.push('push ' + gcx + ' push ' + gcy + ' push ' + gr + ' ld WR push 2 div add circle');
        gradCount++;
      } else if (t === 'rings') {
        var rCount = clampInt(L.count, 1, 40, 12);
        var rcx = clampInt(L.cx, 0, 1000, 500);
        var rcy = clampInt(L.cy, 0, 1000, 500);
        var rStep = clampInt(L.step, 6, 80, 26);
        var rSw = clampInt(L.strokeWidth, 1, 24, 2);
        out.push('push -1 fill push ' + rSw + ' swidth push ' + op + ' opacity');
        out.push('for I 1 ' + (rCount + 1));
        out.push('  ' + colorExpr(slot, 'stroke', 'I'));
        out.push('  push ' + rcx + ' push ' + rcy + ' ld I push ' + rStep + ' mul ld WR push 4 div add circle');
        out.push('endfor');
      } else if (t === 'grid') {
        var cols = clampInt(L.cols, 2, 16, 6);
        var rows = clampInt(L.rows, 2, 16, 6);
        var margin = clampInt(L.margin, 20, 300, 120);
        var gap = clampInt(L.gap, 0, 40, 12);
        var density = clampInt(L.density, 10, 100, 75);
        var span = Math.max(100, 1000 - 2 * margin);
        var cellW = Math.max(8, Math.floor(span / cols));
        var cellH = Math.max(8, Math.floor(span / rows));
        var drawW = Math.max(4, cellW - gap);
        var drawH = Math.max(4, cellH - gap);
        var rad = Math.max(2, Math.floor(Math.min(drawW, drawH) / 2));
        var shp = L.shape || 'mixed';
        out.push('push -1 stroke push ' + op + ' opacity');
        out.push('for I 0 ' + rows);
        out.push('  for J 0 ' + cols);
        out.push('    rand 0 99 push ' + density + ' lt if');
        out.push('      ' + colorExpr(slot, 'fill', 'J'));
        out.push('      ld J push ' + cellW + ' mul push ' + margin + ' add st X');
        out.push('      ld I push ' + cellH + ' mul push ' + margin + ' add st Y');
        if (shp === 'circle') {
          out.push('      ld X push ' + rad + ' add ld Y push ' + rad + ' add push ' + rad + ' circle');
        } else if (shp === 'rect') {
          out.push('      ld X ld Y push ' + drawW + ' push ' + drawH + ' rect');
        } else {
          out.push('      rand 0 1 if ld X ld Y push ' + drawW + ' push ' + drawH + ' rect else ld X push ' + rad + ' add ld Y push ' + rad + ' add push ' + rad + ' circle endif');
        }
        out.push('    endif');
        out.push('  endfor');
        out.push('endfor');
      } else if (t === 'particles') {
        var pCount = clampInt(L.count, 2, 120, 40);
        var minR = clampInt(L.minR, 2, 80, 4);
        var maxR = Math.max(minR, clampInt(L.maxR, 2, 120, 24));
        var pSpread = clampInt(L.spread, 40, 480, 400);
        var pLo = Math.max(20, 500 - pSpread), pHi = Math.min(980, 500 + pSpread);
        var isFilled = L.filled !== false;
        out.push(isFilled ? 'push -1 stroke' : 'push -1 fill push 2 swidth');
        out.push('push ' + op + ' ld WR push 8 div add push 100 min opacity');
        out.push('for I 0 ' + pCount);
        out.push('  ' + colorExpr(slot, isFilled ? 'fill' : 'stroke', 'I'));
        out.push('  rand ' + pLo + ' ' + pHi + ' st X');
        out.push('  rand ' + pLo + ' ' + pHi + ' st Y');
        out.push('  rand ' + minR + ' ' + maxR + ' st R');
        out.push('  ld X ld Y ld R circle');
        out.push('endfor');
      } else if (t === 'rays') {
        var rayCount = clampInt(L.count, 3, 64, 24);
        var lcx = clampInt(L.cx, 0, 1000, 500);
        var lcy = clampInt(L.cy, 0, 1000, 500);
        var lLen = clampInt(L.length, 40, 480, 380);
        var lSw = clampInt(L.strokeWidth, 1, 16, 2);
        out.push('push -1 fill push ' + lSw + ' swidth push ' + op + ' opacity');
        out.push('for I 0 ' + rayCount);
        out.push('  ' + colorExpr(slot, 'stroke', 'I'));
        out.push('  rand ' + (-lLen) + ' ' + lLen + ' st DX');
        out.push('  rand ' + (-lLen) + ' ' + lLen + ' st DY');
        out.push('  push ' + lcx + ' push ' + lcy + ' push ' + lcx + ' ld DX add push ' + lcy + ' ld DY add line');
        out.push('endfor');
      } else if (t === 'polygons') {
        var polyCount = clampInt(L.count, 2, 45, 12);
        var pSize = clampInt(L.size, 16, 240, 70);
        var polySpread = clampInt(L.spread, 50, 440, 340);
        var sLo = Math.max(60, 500 - polySpread), sHi = Math.min(940, 500 + polySpread);
        var polySw = clampInt(L.strokeWidth, 0, 12, 2);
        out.push(polySw > 0 ? ('push ' + c2 + ' stroke push ' + polySw + ' swidth') : 'push -1 stroke');
        out.push('push ' + op + ' opacity');
        out.push('for I 0 ' + polyCount);
        out.push('  ' + colorExpr(slot, 'fill', 'I'));
        out.push('  rand ' + sLo + ' ' + sHi + ' st X');
        out.push('  rand ' + sLo + ' ' + sHi + ' st Y');
        out.push('  rand ' + Math.max(8, Math.floor(pSize / 2)) + ' ' + pSize + ' st R');
        out.push('  pbegin ld X ld Y ld R sub m ld R ld R lr ld R neg ld R lr ld R neg ld R neg lr z pend');
        out.push('endfor');
      } else if (t === 'waves') {
        var wCount = clampInt(L.count, 2, 32, 10);
        var yStart = clampInt(L.yStart, 40, 920, 320);
        var wSpace = clampInt(L.spacing, 6, 60, 28);
        var wAmp = clampInt(L.amp, 8, 200, 65);
        var wSw = clampInt(L.strokeWidth, 1, 16, 3);
        out.push('push -1 fill push ' + wSw + ' swidth push ' + op + ' opacity');
        out.push('for I 0 ' + wCount);
        out.push('  ' + colorExpr(slot, 'stroke', 'I'));
        out.push('  push ' + yStart + ' ld I push ' + wSpace + ' mul add st Y');
        out.push('  rand ' + (-wAmp) + ' ' + wAmp + ' st DY');
        out.push('  pbegin push 60 ld Y m push 220 ld DY push 440 push 0 qr push 220 ld DY neg push 440 push 0 qr pend');
        out.push('endfor');
      } else if (t === 'monoliths') {
        var mCount = clampInt(L.count, 3, 36, 16);
        var minW = clampInt(L.minW, 16, 100, 36);
        var maxW = Math.max(minW, clampInt(L.maxW, 24, 180, 90));
        var minH = clampInt(L.minH, 40, 400, 120);
        var maxH = Math.max(minH, clampInt(L.maxH, 80, 750, 520));
        var baseY = clampInt(L.baseY, 400, 980, 880);
        out.push('push ' + bgHex + ' stroke push 2 swidth push ' + op + ' opacity');
        out.push('for I 0 ' + mCount);
        out.push('  ' + colorExpr(slot, 'fill', 'I'));
        out.push('  rand ' + minW + ' ' + maxW + ' st W');
        out.push('  rand ' + minH + ' ' + maxH + ' st H');
        out.push('  rand 60 860 st X');
        out.push('  push ' + baseY + ' ld H sub st Y');
        out.push('  ld X ld Y ld W ld H rect');
        out.push('endfor');
      }
    });

    out.push('halt');
    return out.join('\n') + '\n';
  }

  var api = { assemble: assemble, OPS: OPS, compileLayers: compileLayers, VISUAL_PRESETS: VISUAL_PRESETS };
  if (typeof module === 'object' && module.exports) module.exports = api; else g.RvmAsm = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
