import * as vm from 'vm';
import { toSVG } from './gen2';
export interface JSOut { bg: number; prims: { op: string; a: number[]; c: number }[]; ops: number }
const C = 512;
const ROT: Record<number, [number, number]> = { 2: [-1024, 0], 3: [-512, 887], 4: [0, 1024], 6: [512, 887], 8: [724, 724] };
const rotPt = (x: number, y: number, c: number, s: number): [number, number] => { const dx = x - C, dy = y - C; return [C + ((dx * c - dy * s) >> 10), C + ((dx * s + dy * c) >> 10)]; };
const mirP = (p: any): any => { const a = p.a.slice();
  if (p.op === 'rect') a[0] = 1023 - a[0] - a[2]; else if (p.op === 'line') { a[0] = 1023 - a[0]; a[2] = 1023 - a[2]; } else if (p.op === 'tri') { a[0] = 1023 - a[0]; a[2] = 1023 - a[2]; a[4] = 1023 - a[4]; } else a[0] = 1023 - a[0];
  return { op: p.op, a, c: p.c }; };
function hsl2rgb(h: number, s: number, l: number): number { h = ((h % 1024) + 1024) % 1024; s = Math.min(1024, Math.max(0, s)); l = Math.min(1024, Math.max(0, l));
  const q = l < 512 ? (l * (1024 + s)) >> 10 : l + s - ((l * s) >> 10), p = 2 * l - q;
  const f = (t0: number) => { let t = ((t0 % 1024) + 1024) % 1024;
    if (t < 171) return p + (((q - p) * ((t * 6) >> 10)) >> 10); if (t < 512) return q; if (t < 683) return p + (((q - p) * (((683 - t) * 6) >> 10)) >> 10); return p; };
  return ((f(h + 341) >> 2) << 16) | ((f(h) >> 2) << 8) | (f(h + 683) >> 2); }
export function renderJS(src: string, seed: Buffer, frame = 0): JSOut {
  const M = 0xffffffffffffffffn; let st = 0n; for (let i = 0; i < 8; i++) st |= BigInt(seed[i % seed.length]) << BigInt(8 * i); if (!st) st = 0x9e3779b97f4a7c15n;
  const nx = () => { st = (st + 0x9e3779b97f4a7c15n) & M; let z = st; z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M; z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M; return (z ^ (z >> 31n)) & M; };
  const rng = { int: (a: number, b: number) => { if (b < a) { const t = a; a = b; b = t; } return a + Number(nx() % BigInt(b - a + 1)); },
    pick: (arr: any[]) => arr[rng.int(0, arr.length - 1)], f: () => Number(nx() % 1024n) / 1024 };
  const prims: any[] = []; let cur = 0xffffff, bg = 0x000000;
  const q = (v: number) => Math.max(0, Math.min(1023, Math.round(v)));
  const cap = () => { if (prims.length > 20000) throw new Error('prim limit'); };
  const P = (op: string, a: number[]) => { cap(); prims.push({ op, a, c: cur }); };
  const cv: any = {
    hex: (h: string) => parseInt(h.slice(1), 16), rgb: (r: number, g: number, b: number) => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255),
    hsl: hsl2rgb, color: (c: number) => { cur = c | 0; }, fill: (c: number) => { bg = c | 0; },
    dot: (x: number, y: number, r: number) => P('dot', [q(x), q(y), q(r)]),
    circle: (x: number, y: number, r: number) => P('circle', [q(x), q(y), q(r)]),
    ring: (x: number, y: number, r: number) => P('ring', [q(x), q(y), q(r)]),
    line: (x0: number, y0: number, x1: number, y1: number, w: number) => P('line', [q(x0), q(y0), q(x1), q(y1), q(w)]),
    rect: (x: number, y: number, w: number, h: number) => P('rect', [q(x), q(y), q(w), q(h)]),
    tri: (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => P('tri', [q(x0), q(y0), q(x1), q(y1), q(x2), q(y2)]),
    mirror: (fn: () => void) => { const at = prims.length; fn(); prims.slice(at).forEach(p => prims.push(mirP(p))); },
    sym: (n: number, fn: () => void) => { const at = prims.length; fn(); const add = prims.slice(at); const base = ROT[n]; if (!base) throw new Error('sym n in {2,3,4,6,8}');
      for (let k = 1; k < n; k++) { let c = 1024, s2 = 0; for (let i = 0; i < k; i++) { const nc = ((c * base[0] - s2 * base[1]) >> 10), ns = ((c * base[1] + s2 * base[0]) >> 10); c = nc; s2 = ns; }
        add.forEach(p => { const a = p.a.slice(); const R = (i: number) => { const t2 = rotPt(a[i], a[i + 1], c, s2); a[i] = q(t2[0]); a[i + 1] = q(t2[1]); };
          if (p.op === 'line') { R(0); R(2); } else if (p.op === 'tri') { R(0); R(2); R(4); } else R(0); cap(); prims.push({ op: p.op, a, c: p.c }); }); } },
  };
  const ctx = vm.createContext({ rng, cv, frame, Math: Object.assign(Object.create(Math), { random: () => rng.f() }), Date: undefined, console: { log: () => {} } });
  vm.runInContext(src, ctx, { timeout: 5000 });
  return { bg, prims, ops: prims.length };
}
export { toSVG };
