const fs = require('fs');
let code = fs.readFileSync('offer-lib.js', 'utf8');

// Add a REST-based broadcast function that uses POST /transactions
const REST_BROADCAST = `
async function broadcastREST(rpcTx) {
  const url = N.rest + '/transactions?replaceByFee=false';
  const payload = { transaction: rpcTx, allowOrphan: true };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (r.ok) {
      const j = await r.json();
      const txId = j.transactionId || j.transaction_id || null;
      if (txId) {
        console.log('  REST broadcast success:', txId);
        return { txId, msg: 'ok' };
      }
      return { txId: null, msg: 'no txId in response: ' + JSON.stringify(j).slice(0, 200) };
    }
    const errTxt = await r.text();
    console.error('  REST broadcast error [' + r.status + ']:', errTxt.slice(0, 400));
    return { txId: null, msg: 'HTTP ' + r.status + ': ' + errTxt.slice(0, 200) };
  } catch (e) {
    console.error('  REST broadcast exception:', e.message);
    return { txId: null, msg: 'fetch failed: ' + e.message };
  }
}
`;

// Insert the REST broadcast function before broadcastWithMsg
if (!code.includes('async function broadcastREST')) {
  code = code.replace('async function broadcastWithMsg', REST_BROADCAST + '\nasync function broadcastWithMsg');
  console.log('✅ Added broadcastREST function');
}

// Modify feeLoop to try REST first, then fall back to wRPC
const OLD_FEELOOP = `async function feeLoop(buildFn, initialFee = 3000000n) {
  let fee = initialFee;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await broadcastWithMsg(buildFn(fee));`;

const NEW_FEELOOP = `async function feeLoop(buildFn, initialFee = 3000000n) {
  let fee = initialFee;
  for (let attempt = 0; attempt < 6; attempt++) {
    console.log('  attempt', attempt, '| fee', fee.toString(), '| trying REST first...');
    const restRes = await broadcastREST(buildFn(fee));
    if (restRes.txId) return { txId: restRes.txId, fee };
    console.log('  REST failed:', restRes.msg, '| trying wRPC fallback...');
    const res = await broadcastWithMsg(buildFn(fee));`;

if (code.includes(OLD_FEELOOP)) {
  code = code.replace(OLD_FEELOOP, NEW_FEELOOP);
  console.log('✅ Modified feeLoop to try REST broadcast first');
} else {
  console.log('⚠️  Could not find feeLoop pattern to modify');
}

fs.writeFileSync('offer-lib.js', code);
console.log('✅ Patched offer-lib.js for REST broadcasting');
