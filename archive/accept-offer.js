const L = require('./offer-lib.js');
const WebSocket = require('ws');
const { B, hex, H, pushMin, pushMinInt, p2sh, sighash, parts, encState, pickUtxo, secp, fs, USER } = L;
function broadcastWithMsg(rpcTx) {
  const urls = ['wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', 'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json'];
  return new Promise(resolve => {
    const tryUrl = k => {
      if (k >= urls.length) return resolve({ txId: null, msg: 'all endpoints failed' });
      const ws = new WebSocket(urls[k], { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
      const t = setTimeout(() => { ws.terminate(); tryUrl(k + 1); }, 15000);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction: rpcTx, allowOrphan: true } })));
      ws.on('message', d => { const s = d.toString(); clearTimeout(t); let txId = null, msg = ''; try { const j = JSON.parse(s); txId = (j.params || j.result || {}).transactionId || null; msg = (j.error && j.error.message) || s.substring(0, 240); } catch (e) { msg = s.substring(0, 240); } ws.close(); resolve({ txId, msg }); });
      ws.on('error', () => { clearTimeout(t); tryUrl(k + 1); });
    };
    tryUrl(0);
  });
}
(async () => {
  const [,, edOutpoint, modeArg] = process.argv;
  if (!edOutpoint) { console.error('usage: node accept-offer.js <editionTxId:index> [sell|transfer]'); process.exit(1); }
  const mode = modeArg || 'sell';
  const O = JSON.parse(fs.readFileSync('offer-ledger.json', 'utf8'));
  const FL = JSON.parse(fs.readFileSync('factory-ledger-v6.json', 'utf8'));
  const CH = JSON.parse(fs.readFileSync('chunks.json', 'utf8'));
  const Ed = parts(JSON.parse(fs.readFileSync('edition-abi-v3.json', 'utf8')));
  const Es = parts(JSON.parse(fs.readFileSync('offer-escrow-abi.json', 'utf8')));
  const TAG_ACCEPT = H(Es.c.entries.accept.dispatch_tag);
  const TAG_SELL = H(Ed.c.entries.__covenant_entrypoint_auth_sell.dispatch_tag);
  const TAG_XFER = H(Ed.c.entries.__covenant_entrypoint_auth_transfer.dispatch_tag);
  const [eTx, eIdx] = edOutpoint.split(':');
  const serial = FL.editions.indexOf(O.editionCovId);
  const curEd = { ownerIdentifier: USER, identifierType: 0, price: 0, artist: USER, royalty_bips: 500, program_hash: CH.programHash, factory_covid: FL.covenantId, serial };
  const nextEd = { ownerIdentifier: O.offerer, identifierType: 0, price: 0, artist: USER, royalty_bips: 500, program_hash: CH.programHash, factory_covid: FL.covenantId, serial };
  const redeemEd = B.concat([Ed.prefix, encState(Ed, curEd), Ed.suffix]);
  const redeemEsc = B.concat([Es.prefix, encState(Es, { edition_covid: O.editionCovId, amount: O.amount, offerer: O.offerer, expire_age: O.expireAge }), Es.suffix]);
  const spkEd = p2sh(redeemEd);
  const escrowValue = BigInt(O.amount);
  const royalty = mode === 'sell' ? escrowValue * 500n / 10000n : 0n;
  const wIn = await pickUtxo();

  function build(fee) {
    const inputs = [
      { txId: eTx, index: parseInt(eIdx), sequence: 0, spk: spkEd, amount: 10000000n },
      { txId: O.txId, index: O.index, sequence: 0, spk: O.spk, amount: escrowValue },
      wIn
    ];
    const outputs = [
      { amount: 10000000n, scriptPublicKey: p2sh(B.concat([Ed.prefix, encState(Ed, nextEd), Ed.suffix])), covenant: { authorizingInput: 0, covenantId: O.editionCovId } },
      { amount: escrowValue, scriptPublicKey: '20' + USER + 'ac' },
      ...(mode === 'sell' ? [{ amount: royalty, scriptPublicKey: '20' + USER + 'ac' }] : []),
      { amount: wIn.amount - royalty - fee, scriptPublicKey: wIn.spk }
    ];
    const royIdx = mode === 'sell' ? 2 : -1;
    const ownerSig = secp.schnorr.signSync(sighash(inputs, outputs, 0), L.PRIV);
    const edArgs = mode === 'sell'
      ? B.concat([pushMin(B.concat([ownerSig, B.from([0x01])])), pushMin(H(O.offerer)), pushMin(B.from([0])), pushMinInt(Number(escrowValue)), pushMinInt(1), pushMinInt(royIdx)])
      : B.concat([pushMin(B.concat([ownerSig, B.from([0x01])])), pushMin(H(O.offerer)), pushMin(B.from([0]))]);
    const ssEd = B.concat([edArgs, pushMin(mode === 'sell' ? TAG_SELL : TAG_XFER), pushMin(redeemEd)]);
    const structNext = B.concat([pushMin(H(nextEd.ownerIdentifier)), pushMin(B.from([0])), pushMinInt(0), pushMin(H(nextEd.artist)), pushMinInt(nextEd.royalty_bips), pushMin(H(nextEd.program_hash)), pushMin(H(nextEd.factory_covid)), pushMinInt(nextEd.serial)]);
    const ssEsc = B.concat([pushMinInt(0), pushMinInt(1), structNext, pushMin(TAG_ACCEPT), pushMin(redeemEsc)]);
    const sigW = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 2), L.PRIV)) + '01';
    return { version: 1, inputs: [
        { previousOutpoint: { transactionId: inputs[0].txId, index: inputs[0].index }, signatureScript: hex(ssEd), sequence: 0, sigOpCount: 0, computeBudget: 60 },
        { previousOutpoint: { transactionId: inputs[1].txId, index: inputs[1].index }, signatureScript: hex(ssEsc), sequence: 0, sigOpCount: 0, computeBudget: 100 },
        { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sigW, sequence: 0, sigOpCount: 0, computeBudget: 10 }
      ], outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  }

  let fee = 4000000n;
  let txId = null;
  for (let attempt = 0; attempt < 6 && !txId; attempt++) {
    const res = await broadcastWithMsg(build(fee));
    if (res.txId) { txId = res.txId; break; }
    console.log('  attempt ' + attempt + ' rejected: ' + res.msg);
    const m = res.msg.match(/required fee of (\d+)/i) || res.msg.match(/under the required (\d+)/i) || res.msg.match(/required fee[^\d]*(\d+)/i);
    if (m) fee = BigInt(m[1]) + BigInt(m[1]) / 10n + 1n;
    else if (/fee/i.test(res.msg)) fee = fee * 2n;
    else throw new Error('non-fee rejection: ' + res.msg);
  }
  if (!txId) throw new Error('accept broadcast failed after fee discovery');
  console.log('OFFER ACCEPTED:', txId, '| fee', fee.toString(), '| edition ->', O.offerer.slice(0, 16) + '...', '| owner paid', escrowValue.toString(), mode === 'sell' ? ('| royalty ' + royalty.toString()) : '');
})().catch(e => { console.error(e); process.exit(1); });
