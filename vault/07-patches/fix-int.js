const fs = require('fs');
let c = fs.readFileSync('src/m2-builders.ts', 'utf8');
const fixed = [
 'int(v: bigint) {',
 '    if (v === 0n) { this.p = Buffer.concat([this.p, Buffer.from([0])]); return; }',
 '    if (v >= 1n && v <= 16n) { this.p = Buffer.concat([this.p, Buffer.from([0x50 + Number(v)])]); return; }',
 '    let h = v.toString(16); if (h.length % 2) h = \'0\' + h;',
 '    const b = Buffer.from(h, \'hex\').reverse();',
 '    const body = (b[b.length - 1] & 0x80) ? Buffer.concat([b, Buffer.from([0])]) : b;',
 '    this.p = Buffer.concat([this.p, Buffer.from([body.length]), body]);',
 '  }',
 '  hex()'
].join('\n');
c = c.replace(/int\(v: bigint\) \{[\s\S]*?\n  hex\(\)/, fixed);
fs.writeFileSync('src/m2-builders.ts', c);
console.log('✅ SB.int fixed');
