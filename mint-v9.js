const V = require('./v8-lib.js');
const { B, hex, H, pushMin, pushMinInt, sighash, parts, encState, pickUtxo, secp, fs, DUST, feeLoop, waitForConfirmation, serialOf } = V;
(async () => {
  const LD = JSON.parse(fs.readFileSync('data/minter-ledger-v9.json', 'utf8'));
  const F = parts(JSON.parse(fs.readFileSync('data/minter-abi-v9.json', 'utf8')));
  const Ed = parts(JSON.parse(fs.readFileSync('data/edition-abi-v9.json', 'utf8')));
  const TAG_MINT = H(F.c.entries.mint.dispatch_tag);
  const k = parseInt(process.argv[2] || '0', 10);
  const lane = LD.lanes[k];
  if (!lane || lane.mintsLeft <= 0) throw new Error('lane exhausted or missing');
  const price = BigInt(LD.series.price);
  const fee = price * 100n / 10000n;          // PLATFORM_BIPS = 100
  const artistCut = price - fee;
  const artistSpk = '20' + LD.series.artist + 'ac';
  const REQUIRED = price + BigInt(DUST) + 25000000n; // price + edition dust + fee buffer
  const allUtxos = await (await fetch(V.rest + '/addresses/' + V.WALLET + '/utxos')).json();
  if (!Array.isArray(allUtxos)) throw new Error('UTXO fetch failed');
  const confirmed = allUtxos.filter(x => x.utxoEntry && x.utxoEntry.blockDaaScore).sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
  const walletInputs = [];
  let totalWalletIn = 0n;
  for (const u of confirmed) {
    if (totalWalletIn >= REQUIRED) break;
    walletInputs.push({ txId: u.outpoint.transactionId, index: u.outpoint.index, sequence: 0, spk: '20' + V.USER + 'ac', amount: BigInt(u.utxoEntry.amount) });
    totalWalletIn += BigInt(u.utxoEntry.amount);
  }
  if (totalWalletIn < REQUIRED) throw new Error('insufficient wallet funds: have ' + totalWalletIn.toString() + ' need ' + REQUIRED.toString());
  console.log('funding mint with', walletInputs.length, 'UTXO(s) totaling', Number(totalWalletIn)/1e8, 'KAS');
  const redeemLane = B.concat([F.prefix, encState(F, { ...LD.series, mints_left: lane.mintsLeft }), F.suffix]);
  const laneSpk = V.p2sh(redeemLane);
  const serial = serialOf(lane.txId, lane.index);
  const edState = { ownerIdentifier: V.USER, identifierType: 0, price: 0, artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial };
  const edSpk = V.p2sh(B.concat([Ed.prefix, encState(Ed, edState), Ed.suffix]));
  const edCov = V.covIdGenesis(walletInputs[0].txId, walletInputs[0].index, [{ idx: 1, value: DUST, script: edSpk }]);
  const inputs = [
    { txId: lane.txId, index: lane.index, sequence: 0, spk: laneSpk, amount: DUST },
    ...walletInputs
  ];
  function build(txFee) {
    const change = totalWalletIn - price - BigInt(DUST) - txFee;
    const outputs = [
      { amount: DUST, scriptPublicKey: V.p2sh(B.concat([F.prefix, encState(F, { ...LD.series, mints_left: lane.mintsLeft - 1 }), F.suffix])), covenant: { authorizingInput: 0, covenantId: LD.C } },
      { amount: DUST, scriptPublicKey: edSpk, covenant: { authorizingInput: 1, covenantId: edCov } },
      { amount: artistCut, scriptPublicKey: artistSpk },
      { amount: fee, scriptPublicKey: artistSpk },
      { amount: change, scriptPublicKey: walletInputs[0].spk }
    ];
    const ssLane = B.concat([pushMin(H(V.USER)), pushMin(B.from([0])), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(TAG_MINT), pushMin(redeemLane)]);
    const txInputs = [
      { previousOutpoint: { transactionId: inputs[0].txId, index: inputs[0].index }, signatureScript: hex(ssLane), sequence: 0, sigOpCount: 0, computeBudget: 100 },
      ...walletInputs.map((w, i) => ({ previousOutpoint: { transactionId: w.txId, index: w.index }, signatureScript: '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, i + 1), V.PRIV)) + '01', sequence: 0, sigOpCount: 0, computeBudget: 10 }))
    ];
    return { version: 1, inputs: txInputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  }
  const { txId, fee: txFee } = await feeLoop(build);
  console.log('  waiting for confirmation...');
  await waitForConfirmation(txId);
  LD.lanes[k] = { txId, index: 0, mintsLeft: lane.mintsLeft - 1 };
  (LD.editions = LD.editions || []).push({ cov: edCov, txId, index: 1, amount: Number(DUST), owner: V.USER, price: 0, serial, spk: hex(edSpk), templateHash: (Array.isArray(Ed.c.compiled.template_hash) ? Buffer.from(Ed.c.compiled.template_hash).toString('hex') : Ed.c.compiled.template_hash) });
  fs.writeFileSync('data/minter-ledger-v9.json', JSON.stringify(LD, null, 2));
  console.log('RELIKS MINT:', txId, '| serial', serial, '| artistCut', artistCut.toString(), '| platformFee', fee.toString(), '| edition', edCov.slice(0, 16) + '...');
})().catch(e => { console.error(e); process.exit(1); });
