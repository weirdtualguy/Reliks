export interface GenOut { palette: number[][]; grid: number[]; ops: number }
export const OP = { PUSH: 0x01, RINT: 0x02, PICK: 0x03, LOAD: 0x04, STORE: 0x05, FILL: 0x06, DOT: 0x07, CIRCLE: 0x08, MIRRORC: 0x09, LOOP: 0x0c, END: 0x0d, HALT: 0x11, PAL: 0x20 } as const;
const N = 16, M = 0xffffffffffffffffn;
export class Rng {
  private s: bigint;
  constructor(seed: Buffer) { let x = 0n; for (let i = 0; i < 8; i++) x |= BigInt(seed[i % seed.length]) << BigInt(8 * i); this.s = x || 0x9e3779b97f4a7c15n; }
  next(): bigint { this.s = (this.s + 0x9e3779b97f4a7c15n) & M; let z = this.s;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M; z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M; return (z ^ (z >> 31n)) & M; }
  int(a: number, b: number): number { if (b < a) { const t = a; a = b; b = t; } return a + Number(this.next() % BigInt(b - a + 1)); }
}
export function execute(bc: Buffer, seed: Buffer, maxOps = 200000): GenOut {
  const rng = new Rng(seed), palette: number[][] = [], grid = new Array(N * N).fill(0);
  const stack: number[] = [], locals = new Array(16).fill(0), ctrl: { start: number; rem: number }[] = [];
  let pc = 0, ops = 0;
  const vi = () => { let v = 0, sh = 0; for (;;) { const b = bc[pc++]; v |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; } return v; };
  const i16 = () => { const v = bc.readInt16LE(pc); pc += 2; return v; };
  const pop = () => { const v = stack.pop(); if (v === undefined) throw new Error('pcove: stack underflow'); return v; };
  const plot = (x: number, y: number, c: number) => { if (x >= 0 && x < N && y >= 0 && y < N) grid[y * N + x] = c; };
  const circle = (cx: number, cy: number, r: number, c: number, mir: boolean) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) { plot(cx + dx, cy + dy, c); if (mir) plot(N - 1 - (cx + dx), cy + dy, c); } };
  while (pc < bc.length) {
    if (++ops > maxOps) throw new Error('pcove: op limit exceeded');
    const op = bc[pc++];
    if (op === OP.HALT) break;
    else if (op === OP.PAL) { const n = vi(); for (let i = 0; i < n; i++) palette.push([bc[pc++], bc[pc++], bc[pc++]]); }
    else if (op === OP.PUSH) stack.push(i16());
    else if (op === OP.RINT) { const b = pop(), a = pop(); stack.push(rng.int(a, b)); }
    else if (op === OP.PICK) { const k = vi(); const o: number[] = []; for (let i = 0; i < k; i++) o.push(i16()); stack.push(o[rng.int(0, k - 1)]); }
    else if (op === OP.LOAD) stack.push(locals[vi()]);
    else if (op === OP.STORE) locals[vi()] = pop();
    else if (op === OP.FILL) { const c = pop(); for (let i = 0; i < N * N; i++) grid[i] = c; }
    else if (op === OP.DOT) { const c = pop(), y = pop(), x = pop(); plot(x, y, c); }
    else if (op === OP.CIRCLE) { const c = pop(), r = pop(), y = pop(), x = pop(); circle(x, y, r, c, false); }
    else if (op === OP.MIRRORC) { const c = pop(), r = pop(), y = pop(), x = pop(); circle(x, y, r, c, true); }
    else if (op === OP.LOOP) { const count = pop(), end = i16(); if (count <= 0) pc = end; else ctrl.push({ start: pc, rem: count }); }
    else if (op === OP.END) { const e = ctrl[ctrl.length - 1]; e.rem--; if (e.rem > 0) pc = e.start; else ctrl.pop(); }
    else throw new Error('pcove: bad opcode 0x' + op.toString(16));
  }
  return { palette, grid, ops };
}
