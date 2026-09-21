const fs = require('fs');
let d = fs.readFileSync('deploy-v11.js', 'utf8');
const oldSelf = "const t = covHex(covIdGenesis(w0, [{ idx: 1 }]));";
const newSelf = "const t = covHex(covIdGenesis(w0.txId, w0.index, [{ idx: 1, value: Number(LD2.editions[0].amount), script: LD2.editions[0].spk }]));";
if (!d.includes(oldSelf)) { console.error('deploy self-test anchor not found'); process.exit(1); }
d = d.split(oldSelf).join(newSelf);
const oldC = "const C = covHex(covIdGenesis({ txId: wIn.txId, index: wIn.index }, [{ idx: 0 }]));";
const newC = "const C = covHex(covIdGenesis(wIn.txId, wIn.index, [{ idx: 0, value: 100000000, script: laneSpk }]));";
if (!d.includes(oldC)) { console.error('deploy C anchor not found'); process.exit(1); }
d = d.split(oldC).join(newC);
fs.writeFileSync('deploy-v11.js', d);

let m = fs.readFileSync('mint-v11.js', 'utf8');
const oldEd = "const covEd = covHex(covIdGenesis({ txId: wIn.txId, index: wIn.index }, [{ idx: 1 }]));";
const newEd = "const covEd = covHex(covIdGenesis(wIn.txId, wIn.index, [{ idx: 1, value: Number(CARRIER), script: V.p2sh(edRedeem) }]));";
if (!m.includes(oldEd)) { console.error('mint covEd anchor not found'); process.exit(1); }
m = m.split(oldEd).join(newEd);
fs.writeFileSync('mint-v11.js', m);
console.log('covIdGenesis call sites fixed: (txIdHex, index, [{idx, value, script}])');
