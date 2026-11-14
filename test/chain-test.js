// Network-free tests for web/reliks-chain.js. No packages, no keys, no chain access.
'use strict';
const path = require('path');
const root = path.join(__dirname, '..');
const C = require(path.join(root, 'web', 'reliks-chain.js'));
const B32 = require(path.join(root, 'lib', 'bech32-kaspa.js'));
const E = require(path.join(root, 'lib', 'reliks-engine-mainnet.js'));
const anchors = require(path.join(root, 'data', 'mainnet-anchors.json'));
const makeTemplates = require(path.join(root, 'lib', 'reliks-templates.js'));
const S = anchors.series[0];
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ' | ' + e.message); } };
const eq = (a, b, m) => { if (String(a) !== String(b)) throw new Error((m || 'mismatch') + ': ' + a + ' != ' + b); };
const throws = (fn, re, m) => { try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error((m || 'wrong error') + ': ' + e.message); return; } throw new Error(m || 'expected a throw'); };
const t12 = makeTemplates();
const t13 = makeTemplates({ editionAbi: 'edition-abi-v13.json' });
C.init(t12);
const H = (s) => Buffer.from(s, 'hex');
const PK = 'aa'.repeat(32), PK2 = 'bb'.repeat(32);

(async () => {
  await t('engine bytes hash to the mainnet program_hash anchor', () => eq(E.engineHashHex, S.programHash));
  await t('render(1) hashes to the mainnet render_hash anchor', () => eq(E.renderHashHex, S.renderHash));
  await t('serial oracle: edition #0 serial recomputes from the genesis lane outpoint', () => eq(C.serialFromOutpoint(S.genesisTxId, 0), S.editions[0].serial));
  await t('state spans are frozen: factory 135, edition v12 161, edition v13 203', () => {
    const f = { program_hash: S.programHash, artist: S.artist, price: 100000000n, royalty_bips: 500n, mints_left: 8n, engine_lang: 0n, render_hash: S.renderHash };
    eq(C.encFactoryState(f).length, 135);
    const e = { ownerIdentifier: PK, identifierType: 0, price: 0, artist: S.artist, royalty_bips: 500, program_hash: S.programHash, factory_covid: S.laneCovenantId, serial: S.editions[0].serial };
    eq(C.encEditionState(e).length, 161);
    const e13 = { ...e, lineage: '11'.repeat(32), sales: 2n };
    eq(C.encEditionState(e13, t13.edition).length, 203);
  });
  await t('template spans match the ABI-derived layout', () => {
    eq(t12.factory.span.len, 135); eq(t12.edition.span.len, 161);
    eq(t12.factory.entries.mint, 'b781beeb');
  });
  await t('the mainnet engine is baked into the factory template', () => {
    if (!t12.factory.suffixHex.includes(Buffer.from(E.ENGINE_SRC, 'utf8').toString('hex'))) throw new Error('engine bytes not found in factory suffix');
  });
  await t('addresses: P2PK and P2SH encoders and decodeAddress match bech32-kaspa.js', () => {
    const a1 = C.p2pkAddress('kaspa', PK);
    eq(a1, B32.encodeP2PK('kaspa', PK));
    const dec = C.decodeAddress(a1);
    eq(dec.hrp, 'kaspa'); eq(dec.version, 0); eq(dec.payloadHex, PK);
    const spk = 'aa20' + '11'.repeat(32) + '87';
    eq(C.p2shAddress('kaspa', spk), B32.encodeP2SH('kaspa', '11'.repeat(32)));
    eq(C.parseOwnerInput('kaspa', a1).pubkey, PK);
    eq(C.parseOwnerInput('kaspa', PK).address, a1);
    throws(() => C.decodeAddress(a1.slice(0, -1) + 'q'), /checksum/);
  });
  await t('state decode round-trips through a full redeem script', () => {
    const st = { program_hash: S.programHash, artist: S.artist, price: 100000000n, royalty_bips: 500n, mints_left: 7n, engine_lang: 0n, render_hash: S.renderHash };
    const red = Buffer.from(C.factoryRedeem(st)).toString('hex');
    const d = C.decodeFactoryState(red);
    eq(d.mints_left, 7n); eq(d.price, 100000000n); eq(d.artist, S.artist); eq(d.render_hash, S.renderHash);
  });
  await t('buildFactorySuffix: reproduces v12 factory suffixHex byte-for-byte and synthesizes v13 factory suffix', () => {
    const got12 = Buffer.from(C.buildFactorySuffix(Buffer.from(E.ENGINE_SRC, 'utf8'), t12.edition)).toString('hex');
    eq(got12, t12.factory.suffixHex);
    const dummyVm = new Uint8Array(500); dummyVm.fill(0x42);
    const got13 = C.buildFactorySuffix(dummyVm, t13.edition);
    if (!Buffer.from(got13).toString('hex').includes(t13.edition.templateHashHex)) throw new Error('missing v13 templateHashHex');
  });

  // ---- synthetic lane with 3 mints left
  const st = { program_hash: S.programHash, artist: S.artist, price: 100000000n, royalty_bips: 500n, mints_left: 3n, engine_lang: 0n, render_hash: S.renderHash };
  const laneSpk = C.p2shSpk(C.factoryRedeem(st));
  const lane = { state: st, spk: laneSpk, outpoint: { txId: '01'.repeat(32), index: 0 }, value: 100000000n, covenantId: S.laneCovenantId, daa: 5n };
  const buyer = { pubkey: PK, address: C.p2pkAddress('kaspa', PK) };
  const seller = { pubkey: PK2, address: C.p2pkAddress('kaspa', PK2) };
  const funding = { txId: '02'.repeat(32), index: 3, amount: 550000000n, daa: 9n };
  const fee = 4200000n;
  let d;
  await t('buildMint: assembles a draft', () => { d = C.buildMint({ lane, buyer, funding, fee, hrp: 'kaspa' }); eq(d.outputs.length, 4); });
  await t('buildMint: value is conserved (inputs = outputs + fee)', () => {
    const inn = d.inputs.reduce((a, i) => a + i.utxo.amount, 0n), out = d.outputs.reduce((a, o) => a + o.value, 0n);
    eq(inn, out + d.fee);
  });
  await t('buildMint: artist receives exactly the price; carrier is 1 KAS', () => {
    eq(d.outputs.find(o => o.role === 'artist').value, 100000000n);
    eq(d.outputs.find(o => o.role === 'edition').value, 100000000n);
    eq(d.outputs.find(o => o.role === 'artist').spk, '20' + S.artist + 'ac');
  });
  await t('buildMint: sigscript ends with the redeem of the CURRENT lane state (regression: old builder pushed the successor)', () => {
    const ss = H(d.inputs[0].sigScript);
    const red = Buffer.from(C.factoryRedeem(st));
    const tail = ss.subarray(ss.length - red.length);
    if (!tail.equals(red)) throw new Error('sigscript tail is not the current redeem');
    eq(C.p2shSpk(new Uint8Array(tail)), laneSpk, 'redeem must hash to the spent lane output');
  });
  await t('buildMint: dispatch tag and buyer are in the argument order the ABI declares', () => {
    const ss = H(d.inputs[0].sigScript);
    eq(ss.subarray(0, 33).toString('hex'), '20' + PK);
    eq(ss.subarray(33, 35).toString('hex'), '0100');
    eq(ss[35], 0x51); eq(ss[36], 0x52);
    eq(ss.subarray(37, 42).toString('hex'), '04b781beeb');
  });
  await t('buildMint: successor lane has mints_left - 1 and the same covenant id', () => {
    const next = { ...st, mints_left: 2n };
    eq(d.outputs[0].spk, C.p2shSpk(C.factoryRedeem(next)));
    eq(d.outputs[0].covenant.covenantId, S.laneCovenantId); eq(d.outputs[0].covenant.authorizingInput, 0);
  });
  await t('buildMint: edition covenant id recomputes from the funding outpoint', () => {
    const rec = C.covenantIdGenesis(funding.txId, funding.index, [{ idx: 1, value: 100000000, script: d.outputs[1].spk }]);
    eq(d.outputs[1].covenant.covenantId, rec); eq(d.outputs[1].covenant.authorizingInput, 1);
  });
  await t('buildMint: edition serial derives from the consumed lane outpoint', () => eq(d.summary.serial, C.serialFromOutpoint('01'.repeat(32), 0)));
  await t('buildMint: dust-sized change is folded into the fee', () => {
    const d2 = C.buildMint({ lane, buyer, funding: { ...funding, amount: 100000000n + 100000000n + fee + 500000n }, fee, hrp: 'kaspa' });
    eq(d2.outputs.some(o => o.role === 'change'), false); eq(d2.fee, fee + 500000n);
  });
  await t('buildMint: refuses a sold-out lane', () => throws(() => C.buildMint({ lane: { ...lane, state: { ...st, mints_left: 0n } }, buyer, funding, fee, hrp: 'kaspa' }), /sold out/));
  await t('buildMint: refuses a key that does not belong to the address', () => throws(() => C.buildMint({ lane, buyer: { pubkey: PK2, address: buyer.address }, funding, fee, hrp: 'kaspa' }), /public key/));
  await t('buildMint: refuses a price under the 1 KAS floor', () => throws(() => C.buildMint({ lane: { ...lane, state: { ...st, price: 5000n } }, buyer, funding, fee, hrp: 'kaspa' }), /1 KAS floor|drift/));
  await t('buildMint: refuses an under-funded output', () => throws(() => C.buildMint({ lane, buyer, funding: { ...funding, amount: 100n }, fee, hrp: 'kaspa' }), /too small/));
  await t('buildMint: a free series pays the artist nothing and emits no artist output', () => {
    const free = { ...st, price: 0n }; const fl = { ...lane, state: free, spk: C.p2shSpk(C.factoryRedeem(free)) };
    const d3 = C.buildMint({ lane: fl, buyer, funding, fee, hrp: 'kaspa' });
    eq(d3.outputs.some(o => o.role === 'artist'), false);
  });
  await t('fee estimate lands in a sane band (0.02 to 0.09 KAS for a 3.9 KB engine)', () => {
    const f = C.estimateFee(d); if (f < 2000000n || f > 9000000n) throw new Error('fee ' + f);
  });
  await t('SafeJSON: u64 values are strings, inputs embed their UTXO, covenants survive', () => {
    const j = JSON.parse(C.toSafeJSON(d));
    eq(typeof j.outputs[0].value, 'string'); eq(j.inputs[1].utxo.address, buyer.address);
    eq(j.inputs[0].utxo.scriptPublicKey, '0000' + laneSpk); eq(j.outputs[1].covenant.authorizingInput, 1);
    eq(j.inputs[0].signatureScript, d.inputs[0].sigScript); eq(j.inputs[1].signatureScript, '');
  });
  const sig = '41' + 'cd'.repeat(64) + '01';
  const signed = () => { const j = JSON.parse(C.toSafeJSON(d)); j.inputs[1].signatureScript = sig; return j; };
  await t('verifySigned: accepts the exact transaction with a standard signature', () => { const r = C.verifySigned(d, JSON.stringify(signed())); eq(r.rpcTx.inputs[1].signatureScript, sig); eq(r.rpcTx.outputs.length, 4); });
  await t('verifySigned: rejects a changed output value', () => { const j = signed(); j.outputs[2].value = '1'; throws(() => C.verifySigned(d, j), /output 2 value/); });
  await t('verifySigned: rejects a redirected artist payment', () => { const j = signed(); j.outputs[2].scriptPublicKey = '0000' + '20' + 'ee'.repeat(32) + 'ac'; throws(() => C.verifySigned(d, j), /output 2 script/); });
  await t('verifySigned: rejects a re-bound covenant', () => { const j = signed(); j.outputs[1].covenant.covenantId = 'ff'.repeat(32); throws(() => C.verifySigned(d, j), /covenant/); });
  await t('verifySigned: rejects an altered factory script', () => { const j = signed(); j.inputs[0].signatureScript = '00'; throws(() => C.verifySigned(d, j), /factory input/); });
  await t('verifySigned: rejects an unsigned wallet input', () => { const j = JSON.parse(C.toSafeJSON(d)); throws(() => C.verifySigned(d, j), /Schnorr/); });
  await t('verifySigned: rejects an added output', () => { const j = signed(); j.outputs.push({ value: '1', scriptPublicKey: '0000' + '20' + 'ee'.repeat(32) + 'ac' }); throws(() => C.verifySigned(d, j), /output count/); });

  // ---- 1-click Series Deploy (buildDeploySeries)
  await t('buildDeploySeries: builds a valid genesis SeriesFactory-v13 transaction', () => {
    const prog = new Uint8Array([0x52, 0x56, 0x4d, 0x01, 0x90, 0x01]);
    const ph = C.hashHex(prog);
    const depState = { program_hash: ph, artist: buyer.pubkey, price: 200000000n, royalty_bips: 500n, mints_left: 8n, engine_lang: 2n, render_hash: '33'.repeat(32) };
    const dep = C.buildDeploySeries({ state: depState, progBytes: prog, editionTemplate: t13.edition, artist: buyer, funding, fee: 50000n, hrp: 'kaspa' });
    eq(dep.inputs.length, 1); eq(dep.outputs.length, 2);
    eq(dep.outputs[0].value, 100000000n);
    eq(dep.outputs[0].covenant.authorizingInput, 0);
    const expectedCov = C.covenantIdGenesis(funding.txId, funding.index, [{ idx: 0, value: 100000000, script: dep.outputs[0].spk }]);
    eq(dep.outputs[0].covenant.covenantId, expectedCov);
  });

  // ---- Secondary Market Builders (list, unlist, buy, transfer, bid/sell)
  const edState13 = {
    ownerIdentifier: seller.pubkey, identifierType: 0, price: 0n,
    artist: S.artist, royalty_bips: 500n, program_hash: S.programHash,
    factory_covid: S.laneCovenantId, serial: '12345',
    lineage: '44'.repeat(32), sales: 1n
  };
  const edSpk0 = C.p2shSpk(C.editionRedeem(edState13, t13.edition));
  const edObj = {
    index: 0, serial: '12345', covenantId: '55'.repeat(32),
    outpoint: { txId: '66'.repeat(32), index: 1 }, value: 100000000n,
    state: edState13, spk: edSpk0, editionTemplate: t13.edition
  };

  await t('buildListEdition + finalizeOwnerCovenantTx: lists edition for 10 KAS and verifies wrapped ownerSig', () => {
    const listDraft = C.buildListEdition({ edition: edObj, owner: seller, newPrice: 1000000000n, funding, fee: 500000n, hrp: 'kaspa', editionTemplate: t13.edition });
    const sj = JSON.parse(C.toSafeJSON(listDraft));
    sj.inputs[0].signatureScript = sig;
    sj.inputs[1].signatureScript = sig;
    const fin = C.finalizeOwnerCovenantTx(listDraft, sj);
    eq(fin.rpcTx.outputs[0].value, 100000000);
    const decodedNext = C.decodeEditionState(Buffer.from(C.editionRedeem(listDraft.summary.nextState, t13.edition)).toString('hex'), t13.edition);
    eq(decodedNext.price, 1000000000n);
  });

  await t('buildBuyEdition: splits 95% seller / 5% artist royalty and advances v13 lineage + sales', () => {
    const listedState = { ...edState13, price: 1000000000n }; // 10 KAS
    const listedEd = { ...edObj, state: listedState, spk: C.p2shSpk(C.editionRedeem(listedState, t13.edition)) };
    const buyFunding = { txId: '09'.repeat(32), index: 0, amount: 2000000000n, daa: 10n };
    const buyDraft = C.buildBuyEdition({ edition: listedEd, buyer, funding: buyFunding, fee: 500000n, hrp: 'kaspa', editionTemplate: t13.edition });
    eq(buyDraft.outputs[0].value, 100000000n);
    eq(buyDraft.outputs[1].value, 950000000n);
    eq(buyDraft.outputs[2].value, 50000000n);
    eq(buyDraft.summary.nextState.ownerIdentifier, buyer.pubkey);
    eq(buyDraft.summary.nextState.price, 0n);
    eq(buyDraft.summary.nextState.sales, 2n);
    eq(buyDraft.summary.nextState.lineage, C.advanceLineage(edState13.lineage, buyer.pubkey));
  });

  await t('buildMakeBid + finalizeOwnerCovenantTx (sell 89cfc99a): 2-party atomic bid on unlisted edition', () => {
    const bidFunding = { txId: '0a'.repeat(32), index: 0, amount: 1500000000n, daa: 12n };
    const bidDraft = C.buildMakeBid({ edition: edObj, bidder: buyer, offerPrice: 800000000n, funding: bidFunding, fee: 500000n, hrp: 'kaspa', editionTemplate: t13.edition });
    eq(C.walletSignIndices(bidDraft).join(','), '1');
    // Step 1: Bidder signs input 1
    const bidderSigned = JSON.parse(C.toSafeJSON(bidDraft));
    bidderSigned.inputs[1].signatureScript = sig;
    C.verifySigned(bidDraft, bidderSigned);
    // Step 2: Owner co-signs input 0 and finalizes sell (89cfc99a) covenant script
    bidderSigned.inputs[0].signatureScript = sig;
    const fin = C.finalizeOwnerCovenantTx(bidDraft, bidderSigned);
    eq(fin.rpcTx.outputs[0].value, 100000000); // edition carrier to buyer
    eq(fin.rpcTx.outputs[1].value, 760000000); // 7.6 KAS (95%) to seller
    eq(fin.rpcTx.outputs[2].value, 40000000);  // 0.4 KAS (5%) royalty to artist
    eq(bidDraft.summary.nextState.ownerIdentifier, buyer.pubkey);
    eq(bidDraft.summary.nextState.sales, 2n);
  });

  await t('buildTransferEdition: accepts a kaspa: address, advances lineage, keeps sales unchanged', () => {
    const xferDraft = C.buildTransferEdition({ edition: edObj, owner: seller, newOwner: buyer.address, funding, fee: 500000n, hrp: 'kaspa', editionTemplate: t13.edition });
    eq(xferDraft.summary.nextState.ownerIdentifier, buyer.pubkey);
    eq(xferDraft.summary.nextState.sales, 1n);
    eq(xferDraft.summary.nextState.lineage, C.advanceLineage(edState13.lineage, buyer.pubkey));
  });

  await t('pickFunding: prefers single output when large enough, automatically combines multiple outputs when fragmented, and refuses when total is insufficient', () => {
    const list = [
      { outpoint: { transactionId: 'aa'.repeat(32), index: 0 }, utxoEntry: { amount: '300000000', blockDaaScore: '5' } },
      { outpoint: { transactionId: 'bb'.repeat(32), index: 1 }, utxoEntry: { amount: '900000000', blockDaaScore: '6' } },
      { outpoint: { transactionId: 'cc'.repeat(32), index: 1 }, utxoEntry: { amount: '9000000000', isCoinbase: true, blockDaaScore: '6' } }
    ];
    const p1 = C.pickFunding(list, 500000000n);
    eq(p1.txId, 'bb'.repeat(32)); eq(p1.inputs.length, 1);
    const p2 = C.pickFunding(list, 1100000000n);
    eq(p2.inputs.length, 2); eq(p2.amount, 1200000000n);
    // Verify buildMint with 2-UTXO funding
    const m2 = C.buildMint({ lane, buyer, funding: p2, fee, hrp: 'kaspa' });
    eq(m2.inputs.length, 3);
    eq(C.walletSignIndices(m2).join(','), '1,2');
    if (!C.pickFunding(list, 5000000000n).error) throw new Error('should refuse');
  });
  await t('fmtKas formats exactly', () => { eq(C.fmtKas(100000000n), '1'); eq(C.fmtKas(150000000n), '1.5'); eq(C.fmtKas(3500000n), '0.035'); });

  // ---- lane resolution against mocked public data
  const cfg = { rest: 'https://rest.test', kascov: 'https://kascov.test' };
  const genesisState = { ...st, mints_left: 1n };
  const genesisRedeem = Buffer.from(C.factoryRedeem(genesisState)).toString('hex');
  const mintTx = '9d'.repeat(32);
  const doneState = { ...st, mints_left: 0n };
  const doneSpk = C.p2shSpk(C.factoryRedeem(doneState));
  const bodies = {
    'https://kascov.test/c/1569a69fd3e82b28ef32d9daea0d1a107cd26a586cf30458416889e689739c09.json': { utxos: [{ outpoint: S.genesisTxId + ':0', live: false, revealed_hex: genesisRedeem }, { outpoint: mintTx + ':0', live: true, value: 100000000, script_hex: doneSpk }], events: [{ kind: 'genesis' }, { kind: 'transition' }], live_value: 100000000 },
    ['https://rest.test/transactions/' + mintTx]: { inputs: [{ previous_outpoint_hash: S.genesisTxId, previous_outpoint_index: 0 }] }
  };
  const io = C.makeIO(cfg, async (u) => ({ ok: !!bodies[u], status: bodies[u] ? 200 : 404, json: async () => bodies[u] }));
  await t('resolveLane: follows the mint chain and proves state == on-chain script', async () => {
    const r = await C.resolveLane(io, S); eq(r.state.mints_left, 0n); eq(r.spk, doneSpk); eq(r.outpoint.txId, mintTx);
  });
  await t('resolveLane: fails closed when the on-chain script disagrees', async () => {
    const b = JSON.parse(JSON.stringify(bodies)); b['https://kascov.test/c/' + S.laneCovenantId + '.json'].utxos[1].script_hex = 'aa20' + '00'.repeat(32) + '87';
    const io2 = C.makeIO(cfg, async (u) => ({ ok: !!b[u], status: 200, json: async () => b[u] }));
    let threw = false; try { await C.resolveLane(io2, S); } catch (e) { threw = /does not match/.test(e.message); } if (!threw) throw new Error('accepted a drifted script');
  });
  await t('resolveLane: refuses forked or closed lanes', async () => {
    const b = JSON.parse(JSON.stringify(bodies)); b['https://kascov.test/c/' + S.laneCovenantId + '.json'].events.push({ kind: 'fork' });
    const io3 = C.makeIO(cfg, async (u) => ({ ok: !!b[u], status: 200, json: async () => b[u] }));
    let threw = false; try { await C.resolveLane(io3, S); } catch (e) { threw = /fork/.test(e.message); } if (!threw) throw new Error('followed a fork');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
