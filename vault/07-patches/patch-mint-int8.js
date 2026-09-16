const fs = require('fs');
let c = fs.readFileSync('src/mint-edition.ts', 'utf8');
// Add int8 method to SB that always pushes 8-byte LE
c = c.split('  hex() { return this.p.toString(\'hex\'); }')
     .join(`  int8(v: bigint) { const b = Buffer.alloc(8); b.writeBigUInt64LE(v, 0); this.p = Buffer.concat([this.p, Buffer.from([8]), b]); }
  hex() { return this.p.toString('hex'); }`);
// Update pushStateFields to use int8 for int fields
c = c.split("for (const f of fields) { if (typeof f === 'string') this.data(Buffer.from(f.replace(/^0x/, ''), 'hex')); else this.int(BigInt(f)); }")
     .join("for (const f of fields) { if (typeof f === 'string') this.data(Buffer.from(f.replace(/^0x/, ''), 'hex')); else this.int8(BigInt(f)); }");
fs.writeFileSync('src/mint-edition.ts', c);
console.log('✅ state fields now pushed as 8-byte LE ints');
