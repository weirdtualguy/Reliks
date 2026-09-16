const fs = require('fs');
let c = fs.readFileSync('src/series-js.ts', 'utf8');
const a = "if (!d) { console.log('❌ deploy failed'); process.exit(1); }";
if (c.indexOf(a) < 0) { console.log('❌ deploy guard not found'); process.exit(1); }
c = c.split(a).join(a + "\n  console.log('🏭 JS factory covenant:', d.covenant_id);\n  fs.writeFileSync('factory3-pending.json', JSON.stringify({ covenantId: d.covenant_id, genesis: '', counter: 0, slotHex: slot.toString('hex') }, null, 1));");
const b = "for (let i = 0; i < 8 && !genesis; i++) {";
c = c.split(b).join("for (let i = 0; i < 15 && !genesis; i++) {");
fs.writeFileSync('src/series-js.ts', c);
console.log('✅ series-js: id persisted at deploy, poll 15×4s');
