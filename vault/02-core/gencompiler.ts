import { OP } from './genvm';
type Tok = { t: 'id' | 'num' | 'str' | 'p'; v: string };
export function tokenize(s: string): Tok[] {
  const out: Tok[] = []; const re = /#[0-9a-fA-F]{6}|"[^"]*"|[A-Za-z_][A-Za-z_0-9]*|\d+|[(){};,=]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) { const v = m[0];
    if (v.startsWith('#') || v.startsWith('"')) out.push({ t: 'str', v });
    else if (/^\d+$/.test(v)) out.push({ t: 'num', v });
    else if (/[A-Za-z_]/.test(v[0])) out.push({ t: 'id', v });
    else out.push({ t: 'p', v }); }
  return out;
}
export function compile(src: string): Buffer {
  const tk = tokenize(src); let p = 0; const slots = new Map<string, number>();
  const bytes: number[] = [];
  const patches: { at: number }[] = [];
  const u8 = (n: number) => bytes.push(n & 0xff);
  const vi = (n: number) => { do { let b = n & 0x7f; n >>= 7; if (n) b |= 0x80; bytes.push(b); } while (n); };
  const i16 = (n: number) => { const b = Buffer.alloc(2); b.writeInt16LE(n, 0); bytes.push(b[0], b[1]); };
  const here = () => bytes.length;
  const eat = (v: string) => { if (tk[p]?.v !== v) throw new Error(`parse: expected '${v}' got '${tk[p]?.v}' @${p}`); p++; };
  const isId = (v: string) => tk[p]?.t === 'id' && tk[p].v === v;
  const slot = (name: string) => { if (!slots.has(name)) { if (slots.size >= 16) throw new Error('too many locals'); slots.set(name, slots.size); } return slots.get(name)!; };
  function expr(): void {
    const t = tk[p];
    if (t.t === 'num') { p++; u8(OP.PUSH); i16(parseInt(t.v, 10)); return; }
    if (t.t === 'id') {
      if (t.v === 'rint') { p++; eat('('); expr(); eat(','); expr(); eat(')'); u8(OP.RINT); return; }
      if (t.v === 'pick') { p++; eat('('); const opts: number[] = [];
        for (;;) { const o = tk[p]; if (o.t !== 'num') throw new Error('pick needs int literals'); p++; opts.push(parseInt(o.v, 10)); if (tk[p]?.v === ',') { p++; continue; } break; }
        eat(')'); if (opts.length < 2 || opts.length > 16) throw new Error('pick: 2..16 options'); u8(OP.PICK); vi(opts.length); opts.forEach(i16); return; }
      p++; u8(OP.LOAD); vi(slot(t.v)); return; }
    throw new Error(`parse: bad expr '${t.v}' @${p}`);
  }
  function stmt(): void {
    const t = tk[p];
    if (t.t === 'id' && t.v === 'palette') { p++; eat('('); const cols: number[] = [];
      for (;;) { const c = tk[p]; if (c.t !== 'str') throw new Error('palette needs "#rrggbb"'); p++;
        cols.push(parseInt(c.v.slice(1, 3), 16), parseInt(c.v.slice(3, 5), 16), parseInt(c.v.slice(5, 7), 16));
        if (tk[p]?.v === ',') { p++; continue; } break; }
      eat(')'); eat(';'); if (cols.length / 3 > 16) throw new Error('palette max 16'); u8(OP.PAL); vi(cols.length / 3); cols.forEach(u8); return; }
    if (t.t === 'id' && t.v === 'let') { p++; const n = tk[p].v; p++; eat('='); expr(); eat(';'); u8(OP.STORE); vi(slot(n)); return; }
    if (t.t === 'id' && t.v === 'for') { p++; expr(); eat('{'); u8(OP.LOOP); const ph = { at: here() }; i16(0); patches.push(ph);
      while (tk[p].v !== '}') stmt(); eat('}'); u8(OP.END); const b = Buffer.alloc(2); b.writeInt16LE(here(), 0); bytes[ph.at] = b[0]; bytes[ph.at + 1] = b[1]; return; }
    if (t.t === 'id') { const name = t.v; p++; eat('('); const arity: Record<string, number> = { fill: 1, dot: 3, circle: 4, mirrorc: 4 };
      const n = arity[name]; if (!n) throw new Error('unknown call ' + name);
      for (let i = 0; i < n; i++) { if (i) eat(','); expr(); } eat(')'); eat(';');
      u8(name === 'fill' ? OP.FILL : name === 'dot' ? OP.DOT : name === 'circle' ? OP.CIRCLE : OP.MIRRORC); return; }
    throw new Error(`parse: bad stmt '${t.v}' @${p}`);
  }
  while (p < tk.length) stmt();
  u8(OP.HALT);
  if (here() > 4096) throw new Error('program too large (>4096B)');
  return Buffer.from(bytes);
}
