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
  var api = { assemble: assemble, OPS: OPS };
  if (typeof module === 'object' && module.exports) module.exports = api; else g.RvmAsm = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
