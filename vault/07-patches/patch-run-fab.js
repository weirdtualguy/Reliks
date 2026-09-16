const fs = require('fs');
let c = fs.readFileSync('src/edition-run.ts', 'utf8');
const a = "    const nextF = compileSeries({ slot: F.slotHex, artist: USER, price: 100000000, cap: 64, role: 0, counter: k + 1, owner: USER });";
if (c.indexOf(a) < 0) { console.log('❌ nextF line not found'); process.exit(1); }
c = c.split(a).join(a + "\n    const fab = compileSeries({ slot: F.slotHex, artist: USER, price: 100000000, cap: 64, role: 0, counter: k, owner: USER });");
const b = "const inputs: UtxoInput[] = [{ txId: prevTx, index: prevIdx, sequence: 0, spk: FSPK, amount: V }, w];";
if (c.indexOf(b) < 0) { console.log('❌ inputs line not found'); process.exit(1); }
c = c.split(b).join("const inputs: UtxoInput[] = [{ txId: prevTx, index: prevIdx, sequence: 0, spk: fab.scriptPublicKey, amount: V }, w];");
const d = "sb.data(TAG); sb.data(Buffer.from(PROG, 'hex'));";
if (c.indexOf(d) < 0) { console.log('❌ redeem push line not found'); process.exit(1); }
c = c.split(d).join("sb.data(TAG); sb.data(Buffer.from(fab.bytecodeHex, 'hex'));");
const e = "script: ki === 0 ? FSPK : w.spk";
if (c.indexOf(e) < 0) { console.log('❌ body spk line not found'); process.exit(1); }
c = c.split(e).join("script: ki === 0 ? fab.scriptPublicKey : w.spk");
fs.writeFileSync('src/edition-run.ts', c);
console.log('✅ edition-run now recompiles the factory program at counter=k each iteration');
