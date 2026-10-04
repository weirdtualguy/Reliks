/* Reliks-VM v1: second reference interpreter (JavaScript, no dependencies; hostInputs takes a blake2b-256 function as a parameter). */
'use strict';
var MAGIC = [0x52, 0x56, 0x4d, 0x01];
var FUEL_MAX = 1000000, STACK_MAX = 256, CALL_MAX = 64, MAX_ELEMS = 10000, MAX_SEGS = 2048, MAX_SVG = 1 << 20, WEAR_CAP = 255, MEM_SIZE = 1024, GROUP_MAX = 4, GRAD_MAX = 8, STOP_MAX = 8;
var INT_MIN = -2147483648, INT_MAX = 2147483647;
var OPS = {
  0x00: ['halt'], 0x01: ['push', 's'], 0x02: ['dup'], 0x03: ['drop'], 0x04: ['swap'], 0x05: ['over'], 0x06: ['rot'],
  0x10: ['add'], 0x11: ['sub'], 0x12: ['mul'], 0x13: ['div'], 0x14: ['mod'], 0x15: ['neg'], 0x16: ['abs'], 0x17: ['min'], 0x18: ['max'],
  0x20: ['and'], 0x21: ['or'], 0x22: ['xor'], 0x23: ['not'], 0x24: ['shl'], 0x25: ['shr'], 0x26: ['ushr'],
  0x30: ['eq'], 0x31: ['ne'], 0x32: ['lt'], 0x33: ['le'], 0x34: ['gt'], 0x35: ['ge'],
  0x40: ['jmp', 'u16'], 0x41: ['jz', 'u16'], 0x42: ['jnz', 'u16'], 0x43: ['call', 'u16'], 0x44: ['ret'],
  0x50: ['load', 'u8'], 0x51: ['store', 'u8'], 0x52: ['ldx'], 0x53: ['stx'],
  0x60: ['lane', 'u8'], 0x61: ['serial'], 0x62: ['pat'], 0x63: ['wear'],
  0x70: ['rnginit'], 0x71: ['rnd'], 0x72: ['rndr'],
  0x80: ['fill'], 0x81: ['stroke'], 0x82: ['swidth'], 0x83: ['opacity'],
  0x90: ['rect'], 0x91: ['circle'], 0x92: ['line'],
  0x94: ['pbegin'], 0x95: ['m'], 0x96: ['l'], 0x97: ['z'], 0x98: ['pend'],
  0x99: ['lr'], 0x9a: ['qr'], 0x9b: ['gopen'], 0x9c: ['gclose'], 0x9d: ['gradbegin'], 0x9e: ['gradstop'], 0x9f: ['gradend']
};
function Fault(code) { this.code = code; }
function sc(x) { return (x | 0); }

function slebEnc(v) {
  var out = [];
  for (;;) {
    var b = v & 0x7f; v >>= 7;
    if ((v === 0 && !(b & 0x40)) || (v === -1 && (b & 0x40))) { out.push(b); return out; }
    out.push(b | 0x80);
  }
}
function slebDec(code, i) {
  var start = i, result = 0, shift = 0, n = 0, b;
  for (;;) {
    if (i >= code.length) throw new Fault('E_DECODE');
    b = code[i++]; n++;
    if (n > 5) throw new Fault('E_DECODE');
    result += (b & 0x7f) * Math.pow(2, shift); shift += 7;
    if (!(b & 0x80)) break;
  }
  if (b & 0x40) result -= Math.pow(2, shift);
  if (result < INT_MIN || result > INT_MAX) throw new Fault('E_DECODE');
  var enc = slebEnc(result);
  if (enc.length !== i - start) throw new Fault('E_DECODE');
  for (var k = 0; k < enc.length; k++) if (enc[k] !== code[start + k]) throw new Fault('E_DECODE');
  return [result, i];
}
function parse(prog) {
  if (prog.length < 9) throw new Fault('E_HEADER');
  for (var k = 0; k < 4; k++) if (prog[k] !== MAGIC[k]) throw new Fault('E_HEADER');
  var W = prog[4] | (prog[5] << 8), H = prog[6] | (prog[7] << 8);
  var code = prog.subarray(8);
  if (W < 1 || W > 4096 || H < 1 || H > 4096 || code.length > 65535) throw new Fault('E_HEADER');
  var insns = new Map(), i = 0;
  while (i < code.length) {
    var op = code[i], def = OPS[op];
    if (!def) throw new Fault('E_DECODE');
    var start = i, imm = null; i++;
    if (def[1] === 's') { var r = slebDec(code, i); imm = r[0]; i = r[1]; }
    else if (def[1] === 'u8') { if (i >= code.length) throw new Fault('E_DECODE'); imm = code[i++]; }
    else if (def[1] === 'u16') { if (i + 2 > code.length) throw new Fault('E_DECODE'); imm = code[i] | (code[i + 1] << 8); i += 2; }
    if (def[0] === 'lane' && imm > 7) throw new Fault('E_DECODE');
    insns.set(start, [def[0], imm, i]);
  }
  insns.forEach(function (v) { if ((v[0] === 'jmp' || v[0] === 'jz' || v[0] === 'jnz' || v[0] === 'call') && !insns.has(v[1])) throw new Fault('E_TARGET'); });
  return { W: W, H: H, insns: insns };
}
function tdiv(a, b) { return Math.trunc(a / b); }
function fmtOp(n) { if (n === 100) return '1'; if (n === 0) return '0'; return '0.' + (n < 10 ? '0' + n : '' + n).replace(/0+$/, ''); }
function hex6(c) { return ('000000' + c.toString(16)).slice(-6); }

function render(progIn, lanes, serial32, pat, wear) {
  var prog = progIn instanceof Uint8Array ? progIn : Uint8Array.from(progIn);
  var P = parse(prog), insns = P.insns;
  var OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + P.W + ' ' + P.H + '">';
  var stack = [], calls = [], mem = new Array(MEM_SIZE).fill(0);
  var fuel = FUEL_MAX, pc = 0, fill = 0, stroke = -1, sw = 1, opac = 100, rng = null;
  var body = [], total = OPEN.length, elems = 0, path = null, groups = [], grad = null, ngrad = 0;
  function pop() { if (!stack.length) throw new Fault('E_UNDERFLOW'); return stack.pop(); }
  function need(n) { if (stack.length < n) throw new Fault('E_UNDERFLOW'); }
  function push(v) { if (stack.length >= STACK_MAX) throw new Fault('E_OVERFLOW'); stack.push(v); }
  function emit(s, nocount) {
    if (!nocount) elems++;
    if (elems > MAX_ELEMS) throw new Fault('E_ELEMS');
    total += s.length; if (total > MAX_SVG) throw new Fault('E_SIZE');
    body.push(s);
  }
  function fcol(c) { return c < 0 ? 'none' : c > 0xFFFFFF ? 'url(#g' + (c - 0x1000000) + ')' : '#' + hex6(c); }
  function tail(ws) {
    var s = '';
    if (ws && stroke >= 0) s += ' stroke="#' + hex6(stroke) + '" stroke-width="' + sw + '"';
    if (opac !== 100) s += ' opacity="' + fmtOp(opac) + '"';
    return s + '/>';
  }
  for (;;) {
    if (!insns.has(pc)) throw new Fault('E_NOHALT');
    if (fuel === 0) throw new Fault('E_FUEL');
    fuel--;
    var ins = insns.get(pc), name = ins[0], imm = ins[1], nxt = ins[2];
    pc = nxt;
    var a, b, c, r;
    switch (name) {
      case 'halt': if (path !== null) throw new Fault('E_PATH'); if (groups.length) throw new Fault('E_GROUP'); if (grad !== null) throw new Fault('E_GRAD'); return finish();
      case 'push': push(imm); break;
      case 'dup': need(1); push(stack[stack.length - 1]); break;
      case 'drop': pop(); break;
      case 'swap': need(2); a = stack[stack.length - 1]; stack[stack.length - 1] = stack[stack.length - 2]; stack[stack.length - 2] = a; break;
      case 'over': need(2); push(stack[stack.length - 2]); break;
      case 'rot': need(3); a = stack.splice(stack.length - 3, 1)[0]; stack.push(a); break;
      case 'add': case 'sub': case 'mul': case 'div': case 'mod': case 'min': case 'max': case 'and': case 'or': case 'xor':
      case 'shl': case 'shr': case 'ushr': case 'eq': case 'ne': case 'lt': case 'le': case 'gt': case 'ge':
        b = pop(); a = pop();
        if (name === 'add') r = (a + b) | 0;
        else if (name === 'sub') r = (a - b) | 0;
        else if (name === 'mul') r = Math.imul(a, b);
        else if (name === 'div' || name === 'mod') {
          if (b === 0) throw new Fault('E_DIV0');
          r = name === 'div' ? (tdiv(a, b) | 0) : ((a % b) | 0);
        }
        else if (name === 'min') r = Math.min(a, b);
        else if (name === 'max') r = Math.max(a, b);
        else if (name === 'and') r = a & b;
        else if (name === 'or') r = a | b;
        else if (name === 'xor') r = a ^ b;
        else if (name === 'shl' || name === 'shr' || name === 'ushr') {
          if (b < 0 || b > 31) throw new Fault('E_RANGE');
          r = name === 'shl' ? (a << b) : name === 'shr' ? (a >> b) : ((a >>> b) | 0);
        }
        else r = ({ eq: a === b, ne: a !== b, lt: a < b, le: a <= b, gt: a > b, ge: a >= b })[name] ? 1 : 0;
        push(r); break;
      case 'neg': push((-pop()) | 0); break;
      case 'abs': a = pop(); push(a < 0 ? ((-a) | 0) : a); break;
      case 'not': push(~pop()); break;
      case 'jmp': pc = imm; break;
      case 'jz': if (pop() === 0) pc = imm; break;
      case 'jnz': if (pop() !== 0) pc = imm; break;
      case 'call': if (calls.length >= CALL_MAX) throw new Fault('E_CALLDEPTH'); calls.push(nxt); pc = imm; break;
      case 'ret': if (!calls.length) throw new Fault('E_UNDERFLOW'); pc = calls.pop(); break;
      case 'load': push(mem[imm]); break;
      case 'store': mem[imm] = pop(); break;
      case 'ldx': a = pop(); if (!(a >= 0 && a < MEM_SIZE)) throw new Fault('E_RANGE'); push(mem[a]); break;
      case 'stx': a = pop(); b = pop(); if (!(a >= 0 && a < MEM_SIZE)) throw new Fault('E_RANGE'); mem[a] = b; break;
      case 'lane': push(lanes[imm]); break;
      case 'serial': push(serial32); break;
      case 'pat': push(pat); break;
      case 'wear': push(wear); break;
      case 'rnginit': {
        var w = pop() >>> 0, z = pop() >>> 0, y = pop() >>> 0, x = pop() >>> 0;
        if (x === 0 && y === 0 && z === 0 && w === 0) x = 1;
        rng = [x, y, z, w]; break;
      }
      case 'rnd': case 'rndr': {
        var hi, lo;
        if (name === 'rndr') { hi = pop(); lo = pop(); }
        if (rng === null) throw new Fault('E_RNG');
        var rx = rng[0], ry = rng[1], rz = rng[2], rw = rng[3];
        var t = (rx ^ (rx << 11)) >>> 0;
        rx = ry; ry = rz; rz = rw;
        rw = (((rw ^ (rw >>> 19)) ^ (t ^ (t >>> 8))) >>> 0);
        rng = [rx, ry, rz, rw];
        var rr = rw >>> 1;
        if (name === 'rnd') push(rr);
        else { if (hi < lo) throw new Fault('E_RANGE'); push(lo + (rw % (hi - lo + 1))); }
        break;
      }
      case 'fill': case 'stroke':
        c = pop();
        if (!(name === 'fill' && c >= 0x1000000 && c < 0x1000000 + ngrad) && !(c === -1 || (c >= 0 && c <= 0xFFFFFF))) throw new Fault('E_RANGE');
        if (name === 'fill') fill = c; else stroke = c; break;
      case 'swidth': c = pop(); if (c < 1 || c > 64) throw new Fault('E_RANGE'); sw = c; break;
      case 'opacity': c = pop(); if (c < 0 || c > 100) throw new Fault('E_RANGE'); opac = c; break;
      case 'rect': {
        need(4); var h = pop(), wd = pop(), ry2 = pop(), rx2 = pop();
        if (wd < 0 || h < 0) throw new Fault('E_RANGE');
        emit('<rect x="' + rx2 + '" y="' + ry2 + '" width="' + wd + '" height="' + h + '" fill="' + fcol(fill) + '"' + tail(true)); break;
      }
      case 'circle': {
        need(3); var cr = pop(), cy = pop(), cx = pop();
        if (cr < 0) throw new Fault('E_RANGE');
        emit('<circle cx="' + cx + '" cy="' + cy + '" r="' + cr + '" fill="' + fcol(fill) + '"' + tail(true)); break;
      }
      case 'line': {
        need(4); var y2 = pop(), x2 = pop(), y1 = pop(), x1 = pop();
        if (stroke < 0) throw new Fault('E_STROKE');
        emit('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#' + hex6(stroke) + '" stroke-width="' + sw + '"' + tail(false)); break;
      }
      case 'pbegin': if (path !== null) throw new Fault('E_PATH'); path = []; break;
      case 'm': case 'l': {
        need(2); var py = pop(), px = pop();
        if (path === null || (name === 'l' && !path.length) || path.length >= MAX_SEGS) throw new Fault('E_PATH');
        if (name === 'm' && path.length) throw new Fault('E_PATH');
        path.push(name.toUpperCase() + px + ' ' + py); break;
      }
      case 'lr': case 'qr': {
        var qdy, qdx, qcy, qcx;
        if (name === 'qr') { need(4); qdy = pop(); qdx = pop(); qcy = pop(); qcx = pop(); }
        else { need(2); qdy = pop(); qdx = pop(); }
        if (path === null || !path.length || path.length >= MAX_SEGS) throw new Fault('E_PATH');
        path.push(name === 'lr' ? 'l' + qdx + ' ' + qdy : 'q' + qcx + ' ' + qcy + ' ' + qdx + ' ' + qdy); break;
      }
      case 'gopen': {
        var gv = pop();
        if (path !== null) throw new Fault('E_PATH');
        if (gv < 0 || gv > 100) throw new Fault('E_RANGE');
        if (groups.length >= GROUP_MAX) throw new Fault('E_GROUP');
        emit(gv === 100 ? '<g>' : '<g opacity="' + fmtOp(gv) + '">');
        groups.push([fill, stroke, sw, opac]); opac = 100; break;
      }
      case 'gclose': {
        if (path !== null) throw new Fault('E_PATH');
        if (!groups.length) throw new Fault('E_GROUP');
        emit('</g>', true);
        var sv = groups.pop(); fill = sv[0]; stroke = sv[1]; sw = sv[2]; opac = sv[3]; break;
      }
      case 'gradbegin': if (grad !== null || ngrad >= GRAD_MAX) throw new Fault('E_GRAD'); grad = []; break;
      case 'gradstop': {
        need(3); var so = pop(), sc2 = pop(), soff = pop();
        if (grad === null || grad.length >= STOP_MAX) throw new Fault('E_GRAD');
        if (!(soff >= 0 && soff <= 100 && sc2 >= 0 && sc2 <= 0xFFFFFF && so >= 0 && so <= 100)) throw new Fault('E_RANGE');
        if (grad.length && soff < grad[grad.length - 1][0]) throw new Fault('E_RANGE');
        grad.push([soff, sc2, so]); break;
      }
      case 'gradend': {
        if (grad === null || grad.length < 2) throw new Fault('E_GRAD');
        var stops = grad.map(function (g) { return '<stop offset="' + g[0] + '%" stop-color="#' + hex6(g[1]) + '"' + (g[2] === 100 ? '' : ' stop-opacity="' + fmtOp(g[2]) + '"') + '/>'; }).join('');
        emit('<defs><radialGradient id="g' + ngrad + '">' + stops + '</radialGradient></defs>');
        ngrad++; grad = null; break;
      }
      case 'z': if (path === null || !path.length || path.length >= MAX_SEGS) throw new Fault('E_PATH'); path.push('Z'); break;
      case 'pend':
        if (path === null || !path.length) throw new Fault('E_PATH');
        emit('<path d="' + path.join('') + '" fill="' + fcol(fill) + '"' + tail(true)); path = null; break;
      default: throw new Fault('E_DECODE');
    }
  }
  function finish() {
    var svg = OPEN + body.join('') + '</svg>';
    if (svg.length > MAX_SVG) throw new Fault('E_SIZE');
    return svg;
  }
}

function hostInputs(blake2b, serial, lineage, sales) {
  var enc = new TextEncoder(), s = BigInt(serial);
  var m = new Uint8Array(12 + 8); m.set(enc.encode('ReliksSeedV2'), 0);
  for (var i = 0; i < 8; i++) m[12 + i] = Number((s >> BigInt(8 * i)) & 0xffn);
  var h = blake2b(m, 32), lanes = [];
  for (var k = 0; k < 8; k++) lanes.push((h[4 * k] | (h[4 * k + 1] << 8) | (h[4 * k + 2] << 16) | (h[4 * k + 3] << 24)) | 0);
  var pl = new Uint8Array(14 + 32); pl.set(enc.encode('ReliksPatinaV2'), 0); pl.set(lineage, 14);
  var pat = blake2b(pl, 32)[0] & 63;
  return { lanes: lanes, serial32: Number(BigInt.asIntN(32, s)), pat: pat, wear: Math.min(Number(sales), WEAR_CAP) };
}
module.exports = { render: render, hostInputs: hostInputs, Fault: Fault, limits: { FUEL_MAX: FUEL_MAX, STACK_MAX: STACK_MAX, CALL_MAX: CALL_MAX, MAX_ELEMS: MAX_ELEMS, MAX_SEGS: MAX_SEGS, MAX_SVG: MAX_SVG, WEAR_CAP: WEAR_CAP } };
