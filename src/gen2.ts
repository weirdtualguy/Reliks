export type Prim = { op: string; a: number[]; c: number };
export interface DL { bg: number; prims: Prim[]; ops: number }
const C = 512;
class Rng { private s: bigint; constructor(seed: Buffer) { let x = 0n; for (let i = 0; i < 8; i++) x |= BigInt(seed[i % seed.length]) << BigInt(8 * i); this.s = x || 0x9e3779b97f4a7c15n; }
  next(): bigint { const M = 0xffffffffffffffffn; this.s = (this.s + 0x9e3779b97f4a7c15n) & M; let z = this.s; z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M; z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M; return (z ^ (z >> 31n)) & M; }
  int(a: number, b: number): number { if (b < a) { const t = a; a = b; b = t; } return a + Number(this.next() % BigInt(b - a + 1)); } }
const mix = (x: number) => { let z = (Math.imul(x ^ 61, 0x9e37) << 16) ^ x; z = Math.imul(z ^ (z >>> 15), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); return (z ^ (z >>> 16)) >>> 0; };
const ROT: Record<number, [number, number]> = { 2: [-1024, 0], 3: [-512, 887], 4: [0, 1024], 6: [512, 887], 8: [724, 724] };
const rotPt = (x: number, y: number, c: number, s: number): [number, number] => { const dx = x - C, dy = y - C; return [C + ((dx * c - dy * s) >> 10), C + ((dx * s + dy * c) >> 10)]; };
const mirX = (p: Prim): Prim => { const a = p.a.slice();
  if (p.op === 'rect') a[0] = 1023 - a[0] - a[2]; else if (p.op === 'line') { a[0] = 1023 - a[0]; a[2] = 1023 - a[2]; } else if (p.op === 'tri') { a[0] = 1023 - a[0]; a[2] = 1023 - a[2]; a[4] = 1023 - a[4]; } else a[0] = 1023 - a[0];
  return { op: p.op, a, c: p.c }; };
function hsl2rgb(h: number, s: number, l: number): number { h = ((h % 1024) + 1024) % 1024; s = Math.min(1024, Math.max(0, s)); l = Math.min(1024, Math.max(0, l));
  const q = l < 512 ? (l * (1024 + s)) >> 10 : l + s - ((l * s) >> 10), p = 2 * l - q;
  const f = (t0: number) => { let t = ((t0 % 1024) + 1024) % 1024;
    if (t < 171) return p + (((q - p) * ((t * 6) >> 10)) >> 10); if (t < 512) return q; if (t < 683) return p + (((q - p) * (((683 - t) * 6) >> 10)) >> 10); return p; };
  const r = f(h + 341) >> 2, g = f(h) >> 2, b = f(h + 683) >> 2; return (r << 16) | (g << 8) | b; }
export function execute2(bc: Buffer, seed: Buffer, frame = 0, maxOps = 400000): DL {
  const rng = new Rng(seed); const sw = Number(rng.next() & 0xffffffffn);
  let pc = 0, cur = 0xffffff, bg = 0x000000, ops = 0;
  const pal: number[] = [], st: number[] = [], loc = new Array(16).fill(0), ctl: { start: number; rem: number }[] = [], marks: { kind: number; n: number; at: number }[] = [];
  const prims: Prim[] = [];
  const vi = () => { let v = 0, sh = 0; for (;;) { const b = bc[pc++]; v |= (b & 127) << sh; if (!(b & 128)) break; sh += 7; } return v; };
  const i16 = () => { const v = ((bc[pc] | (bc[pc + 1] << 8)) << 16) >> 16; pc += 2; return v; };
  const pop = () => { const v = st.pop(); if (v === undefined) throw new Error('underflow'); return v; };
  const P = (op: string, a: number[]) => prims.push({ op, a, c: cur });
  while (pc < bc.length) { if (++ops > maxOps) throw new Error('op limit'); const o = bc[pc++];
    if (o === 0x0f) break;
    else if (o === 0x01) st.push(i16());
    else if (o === 0x02) { const b = pop(), a = pop(); st.push(rng.int(a, b)); }
    else if (o === 0x03) { const k = vi(), ar: number[] = []; for (let i = 0; i < k; i++) ar.push(i16()); st.push(ar[rng.int(0, k - 1)]); }
    else if (o === 0x04) st.push(loc[vi()]); else if (o === 0x05) loc[vi()] = pop();
    else if (o === 0x06) { const y = pop(), x = pop(); st.push(mix(sw ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(frame + 1, 83492791)) & 1023); }
    else if (o === 0x07) st.push(frame);
    else if (o === 0x10) cur = pal[pop()] ?? 0; else if (o === 0x11) { const b = pop(), g = pop(), r = pop(); cur = (r << 16) | (g << 8) | b; }
    else if (o === 0x12) { const l = pop(), s = pop(), h = pop(); cur = hsl2rgb(h, s, l); }
    else if (o === 0x20) { const n = vi(); for (let i = 0; i < n; i++) pal.push((bc[pc++] << 16) | (bc[pc++] << 8) | bc[pc++]); }
    else if (o === 0x21) bg = cur;
    else if (o === 0x22) { const r = pop(), y = pop(), x = pop(); P('dot', [x, y, r]); }
    else if (o === 0x23) { const r = pop(), y = pop(), x = pop(); P('circle', [x, y, r]); }
    else if (o === 0x24) { const r = pop(), y = pop(), x = pop(); P('ring', [x, y, r]); }
    else if (o === 0x25) { const w = pop(), y1 = pop(), x1 = pop(), y0 = pop(), x0 = pop(); P('line', [x0, y0, x1, y1, w]); }
    else if (o === 0x26) { const h = pop(), w = pop(), y = pop(), x = pop(); P('rect', [x, y, w, h]); }
    else if (o === 0x27) { const y2 = pop(), x2 = pop(), y1 = pop(), x1 = pop(), y0 = pop(), x0 = pop(); P('tri', [x0, y0, x1, y1, x2, y2]); }
    else if (o === 0x28) marks.push({ kind: 0, n: 0, at: prims.length });
    else if (o === 0x2a) marks.push({ kind: 1, n: pop(), at: prims.length });
    else if (o === 0x29) { const m = marks.pop()!; const add = prims.slice(m.at);
      if (m.kind === 0) add.forEach(p => prims.push(mirX(p)));
      else { const base = ROT[m.n]; if (!base) throw new Error('sym n in {2,3,4,6,8}');
        for (let k = 1; k < m.n; k++) { let c = 1024, s = 0; for (let i = 0; i < k; i++) { const nc = ((c * base[0] - s * base[1]) >> 10), ns = ((c * base[1] + s * base[0]) >> 10); c = nc; s = ns; }
          add.forEach(p => { const q = p.a.slice(); const R = (i: number) => { const t2 = rotPt(q[i], q[i + 1], c, s); q[i] = t2[0]; q[i + 1] = t2[1]; };
            if (p.op === 'line') { R(0); R(2); } else if (p.op === 'tri') { R(0); R(2); R(4); } else R(0);
            prims.push({ op: p.op, c: p.c, a: q }); }); } } }
    else if (o === 0x40) { const n = pop(), end = i16(); if (n <= 0) pc = end; else ctl.push({ start: pc, rem: n }); }
    else if (o === 0x41) { const e = ctl[ctl.length - 1]; e.rem--; if (e.rem > 0) pc = e.start; else ctl.pop(); }
    else if (o === 0x42) { const j = i16(); if (!pop()) pc = j; } else if (o === 0x43) pc = i16();
    else if (o === 0x50) { const b = pop(); st.push(pop() + b); } else if (o === 0x51) { const b = pop(); st.push(pop() - b); }
    else if (o === 0x52) { const b = pop(); st.push(pop() * b); } else if (o === 0x53) { const b = pop(); if (!b) throw new Error('div0'); st.push(Math.trunc(pop() / b)); }
    else if (o === 0x54) { const b = pop(); if (!b) throw new Error('mod0'); st.push(pop() % b); } else if (o === 0x55) { const b = pop(); st.push(pop() >> b); }
    else if (o === 0x56) { const b = pop(); st.push(pop() > b ? 1 : 0); } else if (o === 0x57) { const b = pop(); st.push(pop() < b ? 1 : 0); }
    else if (o === 0x58) { const b = pop(); st.push(pop() === b ? 1 : 0); }
    else throw new Error('bad op ' + o.toString(16)); }
  return { bg, prims, ops }; }
type Tok = { t: 'id' | 'num' | 'str' | 'p'; v: string };
export function compile2(src: string): Buffer {
  const tk: Tok[] = []; const re = /#[0-9a-fA-F]{6}|"[^"]*"|[A-Za-z_][A-Za-z_0-9]*|\d+|==|[(){};,=+\-*\/%<>]/g; let m: RegExpExecArray | null;
  while ((m = re.exec(src))) { const v = m[0];
    if (v.startsWith('#') || v.startsWith('"')) tk.push({ t: 'str', v }); else if (/^\d+$/.test(v)) tk.push({ t: 'num', v });
    else if (/[A-Za-z_]/.test(v[0])) tk.push({ t: 'id', v }); else tk.push({ t: 'p', v }); }
  let p = 0; const slots = new Map<string, number>(); const b: number[] = [];
  const u8 = (n: number) => b.push(n & 255), vi = (n: number) => { do { let x = n & 127; n >>= 7; if (n) x |= 128; b.push(x); } while (n); };
  const i16 = (n: number) => { const buf = Buffer.alloc(2); buf.writeInt16LE(n, 0); b.push(buf[0], buf[1]); };
  const here = () => b.length, patch = (at: number) => { const buf = Buffer.alloc(2); buf.writeInt16LE(here(), 0); b[at] = buf[0]; b[at + 1] = buf[1]; };
  const eat = (v: string) => { if (tk[p]?.v !== v) throw new Error(`expected ${v} got ${tk[p]?.v}`); p++; };
  const slot = (n: string) => { if (!slots.has(n)) slots.set(n, slots.size); return slots.get(n)!; };
  function expr(): void { cmp(); }
  function cmp(): void { add(); while (tk[p]?.v === '>' || tk[p]?.v === '<' || tk[p]?.v === '==') { const o = tk[p++].v; add(); u8(o === '>' ? 0x56 : o === '<' ? 0x57 : 0x58); } }
  function add(): void { mul(); while (tk[p]?.v === '+' || tk[p]?.v === '-') { const o = tk[p++].v; mul(); u8(o === '+' ? 0x50 : 0x51); } }
  function mul(): void { prim(); while (tk[p]?.v === '*' || tk[p]?.v === '/' || tk[p]?.v === '%') { const o = tk[p++].v; prim(); u8(o === '*' ? 0x52 : o === '/' ? 0x53 : 0x54); } }
  function prim(): void { const t = tk[p];
    if (t.t === 'num') { p++; u8(0x01); i16(parseInt(t.v, 10)); return; }
    if (t.t === 'p' && t.v === '(') { p++; expr(); eat(')'); return; }
    if (t.t === 'id') { const n = t.v; p++;
      if (tk[p]?.v === '(') { p++;
        if (n === 'rint') { expr(); eat(','); expr(); eat(')'); u8(0x02); return; }
        if (n === 'n2') { expr(); eat(','); expr(); eat(')'); u8(0x06); return; }
        if (n === 'frame') { eat(')'); u8(0x07); return; }
        if (n === 'pick') { const o: number[] = []; for (;;) { const q = tk[p]; if (q.t !== 'num') throw new Error('pick ints'); p++; o.push(parseInt(q.v, 10)); if (tk[p]?.v === ',') { p++; continue; } break; } eat(')'); u8(0x03); vi(o.length); o.forEach(i16); return; }
        throw new Error('bad call ' + n); }
      u8(0x04); vi(slot(n)); return; }
    throw new Error('bad expr ' + t?.v); }
  const args = (k: number) => { eat('('); for (let i = 0; i < k; i++) { if (i) eat(','); expr(); } eat(')'); };
  function block(): void { eat('{'); while (tk[p].v !== '}') stmt(); eat('}'); }
  function stmt(): void { const t = tk[p];
    if (t.t === 'id' && t.v === 'palette') { p++; eat('('); const c: number[] = []; for (;;) { const q = tk[p]; if (q.t !== 'str') throw new Error('palette hex'); p++; c.push(parseInt(q.v.slice(1, 3), 16), parseInt(q.v.slice(3, 5), 16), parseInt(q.v.slice(5, 7), 16)); if (tk[p]?.v === ',') { p++; continue; } break; } eat(')'); eat(';'); u8(0x20); vi(c.length / 3); c.forEach(u8); return; }
    if (t.t === 'id' && t.v === 'let') { p++; const n = tk[p].v; p++; eat('='); expr(); eat(';'); u8(0x05); vi(slot(n)); return; }
    if (t.t === 'id' && t.v === 'mirror') { p++; u8(0x28); block(); u8(0x29); return; }
    if (t.t === 'id' && t.v === 'sym') { p++; args(1); u8(0x2a); block(); u8(0x29); return; }
    if (t.t === 'id' && t.v === 'if') { p++; if (tk[p]?.v === '(') { p++; expr(); eat(')'); } else expr(); u8(0x42); const j = here(); i16(0); block();
      if (tk[p]?.v === 'else') { p++; u8(0x43); const e = here(); i16(0); patch(j); block(); patch(e); } else patch(j); return; }
    if (t.t === 'id' && t.v === 'for') { p++; expr(); eat('{'); u8(0x40); const ph = here(); i16(0); while (tk[p].v !== '}') stmt(); eat('}'); u8(0x41); patch(ph); return; }
    if (t.t === 'id') { const n = t.v; p++;
      if (n === 'col') { args(1); u8(0x10); } else if (n === 'rgb') { args(3); u8(0x11); } else if (n === 'hsl') { args(3); u8(0x12); }
      else if (n === 'fill') { args(0); u8(0x21); } else if (n === 'dot') { args(3); u8(0x22); } else if (n === 'circle') { args(3); u8(0x23); }
      else if (n === 'ring') { args(3); u8(0x24); } else if (n === 'line') { args(5); u8(0x25); } else if (n === 'rect') { args(4); u8(0x26); }
      else if (n === 'tri') { args(6); u8(0x27); }
      else { eat('='); expr(); u8(0x05); vi(slot(n)); }
      eat(';'); return; }
    throw new Error('bad stmt ' + t?.v); }
  while (p < tk.length) stmt(); u8(0x0f);
  if (here() > 4096) throw new Error('program too large'); return Buffer.from(b); }
export function toSVG(dl: DL, px = 720): string { const h = (c: number) => '#' + c.toString(16).padStart(6, '0');
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${px}" height="${px}"><rect width="1024" height="1024" fill="${h(dl.bg)}"/>`;
  for (const p of dl.prims) { const c = h(p.c), a = p.a;
    if (p.op === 'dot' || p.op === 'circle') s += `<circle cx="${a[0]}" cy="${a[1]}" r="${a[2]}" fill="${c}"/>`;
    else if (p.op === 'ring') s += `<circle cx="${a[0]}" cy="${a[1]}" r="${a[2]}" fill="none" stroke="${c}" stroke-width="14"/>`;
    else if (p.op === 'line') s += `<line x1="${a[0]}" y1="${a[1]}" x2="${a[2]}" y2="${a[3]}" stroke="${c}" stroke-width="${a[4]}" stroke-linecap="round"/>`;
    else if (p.op === 'rect') s += `<rect x="${a[0]}" y="${a[1]}" width="${a[2]}" height="${a[3]}" fill="${c}"/>`;
    else s += `<polygon points="${a[0]},${a[1]} ${a[2]},${a[3]} ${a[4]},${a[5]}" fill="${c}"/>`; }
  return s + '</svg>'; }
