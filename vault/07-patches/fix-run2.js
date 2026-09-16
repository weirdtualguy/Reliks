const fs = require('fs');
let c = fs.readFileSync('src/m2-run.ts', 'utf8');
const oldS = "outputs: plan.transaction.outputs.map((o: any) => ({ ...o, scriptPublicKey: '0000' + o.scriptPublicKey.scriptPublicKey })) };";
const newS = "outputs: plan.transaction.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), gas: Number(plan.transaction.gas || 0) };";
if (!c.includes(oldS)) { console.log('❌ marker not found'); process.exit(1); }
c = c.split(oldS).join(newS);
fs.writeFileSync('src/m2-run.ts', c);
console.log('✅ broadcast body now fully node-native (value + flat SPK + numeric gas)');
