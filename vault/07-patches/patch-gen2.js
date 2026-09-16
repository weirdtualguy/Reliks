const fs = require('fs');
let c = fs.readFileSync('src/gen2.ts', 'utf8');
const a = "if (t.t === 'id' && t.v === 'if') { p++; args(1); u8(0x42); const j = here(); i16(0); block();";
const a2 = "if (t.t === 'id' && t.v === 'if') { p++; if (tk[p]?.v === '(') { p++; expr(); eat(')'); } else expr(); u8(0x42); const j = here(); i16(0); block();";
if (!c.includes(a)) { console.log('❌ if-line not found'); process.exit(1); }
c = c.split(a).join(a2);
const b = "          add.forEach(p => prims.push({ op: p.op, c: p.c, a: p.a.map((v, idx) => idx).map(idx => (idx % 2 === 0 ? rotPt(p.a[idx], p.a[idx + 1], c, s)[0] : rotPt(p.a[idx - 1], p.a[idx], c, s)[1])) })); } } }";
const b2 = "          add.forEach(p => { const q = p.a.slice(); const R = (i: number) => { const t2 = rotPt(q[i], q[i + 1], c, s); q[i] = t2[0]; q[i + 1] = t2[1]; };\n            if (p.op === 'line') { R(0); R(2); } else if (p.op === 'tri') { R(0); R(2); R(4); } else R(0);\n            prims.push({ op: p.op, c: p.c, a: q }); }); } } }";
if (!c.includes(b)) { console.log('❌ rotation line not found'); process.exit(1); }
c = c.split(b).join(b2);
fs.writeFileSync('src/gen2.ts', c);
console.log('✅ gen2: paren-free if + shape-aware sym rotation');
