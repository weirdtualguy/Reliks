const fs = require('fs');

// 1. Restore bridge3.ts from vault (it has the correct destructuring)
fs.copyFileSync('vault/02-core/bridge3.ts', 'src/bridge3.ts');
console.log('✅ restored bridge3.ts from vault');

// 2. Revert 'art' back to 'slot' in series-v4.ts
let c = fs.readFileSync('src/series-v4.ts', 'utf8');
c = c.replace(/art: slotHex/g, 'slot: slotHex');
if (c.includes('Buffer.alloc(568)')) c = c.split('Buffer.alloc(568)').join('Buffer.alloc(2048)');
fs.writeFileSync('src/series-v4.ts', c);
console.log('✅ series-v4.ts: reverted to "slot", ensured alloc 2048');

// 3. Revert 'art' back to 'slot' in mint-v2.ts
c = fs.readFileSync('src/mint-v2.ts', 'utf8');
c = c.replace(/art: F\.slotHex/g, 'slot: F.slotHex');
c = c.replace(/art: S\.slotHex/g, 'slot: S.slotHex');
fs.writeFileSync('src/mint-v2.ts', c);
console.log('✅ mint-v2.ts: reverted to "slot"');

// 4. Revert 'art' back to 'slot' in edition-run.ts
c = fs.readFileSync('src/edition-run.ts', 'utf8');
c = c.replace(/art: F\.slotHex/g, 'slot: F.slotHex');
fs.writeFileSync('src/edition-run.ts', c);
console.log('✅ edition-run.ts: reverted to "slot"');

// 5. Revert 'art' back to 'slot' in series-js.ts
if (fs.existsSync('src/series-js.ts')) {
  c = fs.readFileSync('src/series-js.ts', 'utf8');
  c = c.replace(/art: slotHex/g, 'slot: slotHex');
  fs.writeFileSync('src/series-js.ts', c);
  console.log('✅ series-js.ts: reverted to "slot"');
}
