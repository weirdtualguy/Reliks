// Network-free tests for web/reliks-chain.js. No packages, no keys, no chain access.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const C = require(path.join(root, 'web', 'reliks-chain.js'));
const B32 = require(path.join(root, 'lib', 'bech32-kaspa.js'));
const RVM = require(path.join(root, 'vm', 'rvm.js'));
const RvmAsm = require(path.join(root, 'web', 'rvm-asm.js'));
const { blake2b } = require(path.join(root, 'web', 'blake2b.js'));
const makeTemplates = require(path.join(root, 'lib', 'reliks-templates.js'));
const demoBundle = JSON.parse(fs.readFileSync(path.join(root, 'data', 'provenance-demo.json'), 'utf8'));
const S = demoBundle.series;
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ' | ' + e.message); } };
const eq = (a, b, m) => { if (String(a) !== String(b)) throw new Error((m || 'mismatch') + ': ' + a + ' != ' + b); };
const throws = (fn, re, m) => { try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error((m || 'wrong error') + ': ' + e.message); return; } throw new Error(m || 'expected a throw'); };
const tpl = makeTemplates();
C.init(tpl);
const H = (s) => Buffer.from(s, 'hex');
const PK = 'aa'.repeat(32), PK2 = 'bb'.repeat(32);

(async () => {
  const progBytes = C.hex2u8(S.program_hex);
  await t('Reliks-VM program bytes hash to the demo program_hash anchor', () => eq(C.hashHex(progBytes), S.program_hash));
  await t('Reliks-VM render(1, 0, 0) hashes to the demo render_hash anchor', () => {
    const hi1 = RVM.hostInputs(blake2b, '1', new Uint8Array(32), 0);
    const svg1 = RVM.render(progBytes, hi1.lanes, hi1.serial32, hi1.pat, hi1.wear);
    eq(C.hashHex(C.utf8(svg1)), S.render_hash);
  });
  await t('state spans are frozen: factory 144 (8 fields), edition 203 (10 fields), escrow 161 (8 fields)', () => {
    const f = { program_hash: S.program_hash, artist: S.artist, price: 100000000n, royalty_bips: 500n, mints_left: 8n, engine_lang: 2n, render_hash: S.render_hash, next_serial: 0n };
    eq(C.encFactoryState(f).length, 144);
    const e = { ownerIdentifier: PK, identifierType: 0, price: 0, artist: S.artist, royalty_bips: 500, program_hash: S.program_hash, factory_covid: S.laneCovenantId, serial: '0', lineage: '11'.repeat(32), sales: 0n };
    eq(C.encEditionState(e).length, 203);
    eq(tpl.escrow.span.len, 161);
  });
  await t('template spans match the ABI-derived layout', () => {
    eq(tpl.factory.span.len, 144); eq(tpl.edition.span.len, 203);
    eq(tpl.factory.entries.mint, 'b781beeb');
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
    const st = { program_hash: S.program_hash, artist: S.artist, price: 100000000n, royalty_bips: 500n, mints_left: 7n, engine_lang: 2n, render_hash: S.render_hash, next_serial: 1n };
    const red = Buffer.from(C.factoryRedeem(st, progBytes)).toString('hex');
    const d = C.decodeFactoryState(red);
    eq(d.mints_left, 7n); eq(d.price, 100000000n); eq(d.artist, S.artist); eq(d.render_hash, S.render_hash); eq(d.next_serial, 1n);
  });
  await t('buildFactorySuffix: reproduces canonical contracts/factory.json suffixHex byte-for-byte', () => {
    const fa = JSON.parse(fs.readFileSync(path.join(root, 'contracts', 'factory-args.json'), 'utf8'));
    const fixtureEng = new Uint8Array(fa[5].value);
    const got = Buffer.from(C.buildFactorySuffix(fixtureEng, tpl.edition)).toString('hex');
    eq(got, tpl.factory.suffixHex);
  });

  // ---- synthetic lane with 3 mints left, next_serial = 0
  const st = { program_hash: S.program_hash, artist: S.artist, price: 100000000n, royalty_bips: 500n, mints_left: 3n, engine_lang: 2n, render_hash: S.render_hash, next_serial: 0n };
  const laneSpk = C.p2shSpk(C.factoryRedeem(st, progBytes));
  const lane = { state: st, spk: laneSpk, outpoint: { txId: '01'.repeat(32), index: 0 }, value: 100000000n, covenantId: S.laneCovenantId, daa: 5n, progBytes };
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
    eq(d.outputs.find((o) => o.role === 'artist').value, 100000000n);
    eq(d.outputs.find((o) => o.role === 'edition').value, 100000000n);
    eq(d.outputs.find((o) => o.role === 'artist').spk, '20' + S.artist + 'ac');
  });
  await t('buildMint: sigscript ends with the redeem of the CURRENT lane state', () => {
    const ss = H(d.inputs[0].sigScript);
    const red = Buffer.from(C.factoryRedeem(st, progBytes));
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
  await t('buildMint: successor lane has mints_left - 1, next_serial + 1, and the same covenant id', () => {
    const next = { ...st, mints_left: 2n, next_serial: 1n };
    eq(d.outputs[0].spk, C.p2shSpk(C.factoryRedeem(next, progBytes)));
    eq(d.outputs[0].covenant.covenantId, S.laneCovenantId); eq(d.outputs[0].covenant.authorizingInput, 0);
  });
  await t('buildMint: edition covenant id recomputes from the funding outpoint', () => {
    const rec = C.covenantIdGenesis(funding.txId, funding.index, [{ idx: 1, value: 100000000, script: d.outputs[1].spk }]);
    eq(d.outputs[1].covenant.covenantId, rec); eq(d.outputs[1].covenant.authorizingInput, 1);
  });
  await t('buildMint: edition serial equals lane next_serial counter (0)', () => eq(d.summary.serial, '0'));
  await t('buildMint: dust-sized change is folded into the fee', () => {
    const d2 = C.buildMint({ lane, buyer, funding: { ...funding, amount: 100000000n + 100000000n + fee + 500000n }, fee, hrp: 'kaspa' });
    eq(d2.outputs.some((o) => o.role === 'change'), false); eq(d2.fee, fee + 500000n);
  });
  await t('buildMint: refuses a sold-out lane', () => throws(() => C.buildMint({ lane: { ...lane, state: { ...st, mints_left: 0n } }, buyer, funding, fee, hrp: 'kaspa' }), /sold out/));
  await t('buildMint: refuses a key that does not belong to the address', () => throws(() => C.buildMint({ lane, buyer: { pubkey: PK2, address: buyer.address }, funding, fee, hrp: 'kaspa' }), /public key/));
  await t('buildMint: refuses a price under the 1 KAS floor', () => throws(() => C.buildMint({ lane: { ...lane, state: { ...st, price: 5000n } }, buyer, funding, fee, hrp: 'kaspa' }), /1 KAS floor|drift/));
  await t('buildMint: refuses an under-funded output', () => throws(() => C.buildMint({ lane, buyer, funding: { ...funding, amount: 100n }, fee, hrp: 'kaspa' }), /too small/));
  await t('fee estimate lands in a sane band (0.02 to 0.09 KAS)', () => {
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
  await t('buildDeploySeries: builds a valid genesis SeriesFactory transaction', () => {
    const prog = new Uint8Array([0x52, 0x56, 0x4d, 0x01, 0x90, 0x01]);
    const ph = C.hashHex(prog);
    const depState = { program_hash: ph, artist: buyer.pubkey, price: 200000000n, royalty_bips: 500n, mints_left: 8n, engine_lang: 2n, render_hash: '33'.repeat(32), next_serial: 0n };
    const dep = C.buildDeploySeries({ state: depState, progBytes: prog, artist: buyer, funding, fee: 50000n, hrp: 'kaspa' });
    eq(dep.inputs.length, 1); eq(dep.outputs.length, 2);
    eq(dep.outputs[0].value, 100000000n);
    eq(dep.outputs[0].covenant.authorizingInput, 0);
    const expectedCov = C.covenantIdGenesis(funding.txId, funding.index, [{ idx: 0, value: 100000000, script: dep.outputs[0].spk }]);
    eq(dep.outputs[0].covenant.covenantId, expectedCov);
  });

  // ---- Secondary Market Builders (list, unlist, buy, transfer, bid/sell)
  const edState = {
    ownerIdentifier: seller.pubkey, identifierType: 0, price: 0n,
    artist: S.artist, royalty_bips: 500n, program_hash: S.program_hash,
    factory_covid: S.laneCovenantId, serial: '0',
    lineage: '44'.repeat(32), sales: 1n
  };
  const edSpk0 = C.p2shSpk(C.editionRedeem(edState));
  const edObj = {
    index: 0, serial: '0', covenantId: '55'.repeat(32),
    outpoint: { txId: '66'.repeat(32), index: 1 }, value: 100000000n,
    state: edState, spk: edSpk0
  };

  await t('buildListEdition + finalizeOwnerCovenantTx: lists edition for 10 KAS and verifies wrapped ownerSig', () => {
    const listDraft = C.buildListEdition({ edition: edObj, owner: seller, newPrice: 1000000000n, funding, fee: 500000n, hrp: 'kaspa' });
    const sj = JSON.parse(C.toSafeJSON(listDraft));
    sj.inputs[0].signatureScript = sig;
    sj.inputs[1].signatureScript = sig;
    const fin = C.finalizeOwnerCovenantTx(listDraft, sj);
    eq(fin.rpcTx.outputs[0].value, 100000000);
    const decodedNext = C.decodeEditionState(Buffer.from(C.editionRedeem(listDraft.summary.nextState)).toString('hex'));
    eq(decodedNext.price, 1000000000n);
  });

  await t('buildBuyEdition: splits 95% seller / 5% artist royalty and advances lineage + sales', () => {
    const listedState = { ...edState, price: 1000000000n };
    const listedEd = { ...edObj, state: listedState, spk: C.p2shSpk(C.editionRedeem(listedState)) };
    const buyFunding = { txId: '09'.repeat(32), index: 0, amount: 2000000000n, daa: 10n };
    const buyDraft = C.buildBuyEdition({ edition: listedEd, buyer, funding: buyFunding, fee: 500000n, hrp: 'kaspa' });
    eq(buyDraft.outputs[0].value, 100000000n);
    eq(buyDraft.outputs[1].value, 950000000n);
    eq(buyDraft.outputs[2].value, 50000000n);
    eq(buyDraft.summary.nextState.ownerIdentifier, buyer.pubkey);
    eq(buyDraft.summary.nextState.price, 0n);
    eq(buyDraft.summary.nextState.sales, 2n);
    eq(buyDraft.summary.nextState.lineage, C.advanceLineage(edState.lineage, buyer.pubkey));
  });

  await t('buildMakeBid + finalizeOwnerCovenantTx (sell 89cfc99a): 2-party atomic bid on unlisted edition', () => {
    const bidFunding = { txId: '0a'.repeat(32), index: 0, amount: 1500000000n, daa: 12n };
    const bidDraft = C.buildMakeBid({ edition: edObj, bidder: buyer, offerPrice: 800000000n, funding: bidFunding, fee: 500000n, hrp: 'kaspa' });
    eq(C.walletSignIndices(bidDraft).join(','), '1');
    const bidderSigned = JSON.parse(C.toSafeJSON(bidDraft));
    bidderSigned.inputs[1].signatureScript = sig;
    C.verifySigned(bidDraft, bidderSigned);
    bidderSigned.inputs[0].signatureScript = sig;
    const fin = C.finalizeOwnerCovenantTx(bidDraft, bidderSigned);
    eq(fin.rpcTx.outputs[0].value, 100000000);
    eq(fin.rpcTx.outputs[1].value, 760000000);
    eq(fin.rpcTx.outputs[2].value, 40000000);
    eq(bidDraft.summary.nextState.ownerIdentifier, buyer.pubkey);
    eq(bidDraft.summary.nextState.sales, 2n);
  });

  await t('OfferEscrow (offer, accept 948f2512, cancel a0893109, expire 12ab1c61): state round-trip and all 4 builders', () => {
    const listedEd = { ...edObj, state: { ...edState, price: 1000000000n }, spk: C.p2shSpk(C.editionRedeem({ ...edState, price: 1000000000n })) };
    const offDraft = C.buildCreateEscrowOffer({ edition: listedEd, offerer: buyer, askPrice: 1000000000n, expireAge: 100000n, funding: { ...funding, amount: 2000000000n }, fee: 500000n, hrp: 'kaspa' });
    eq(offDraft.summary.locked, 1010000000n);
    const escRedeemHex = Buffer.from(C.escrowRedeem(offDraft.summary.escrowState)).toString('hex');
    const decEsc = C.decodeEscrowState(escRedeemHex);
    eq(decEsc.askPrice, 1000000000n);
    eq(decEsc.expireAge, 100000n);
    eq(decEsc.offerer, buyer.pubkey);
    eq(decEsc.edition_covid, listedEd.covenantId);

    const escTicket = { txId: '77'.repeat(32), index: 0, spk: offDraft.summary.escrowSpk, locked: offDraft.summary.locked, state: offDraft.summary.escrowState };
    const accDraft = C.buildAcceptEscrowOffer({ edition: listedEd, escrow: escTicket, owner: seller, hrp: 'kaspa' });
    eq(C.walletSignIndices(accDraft).join(','), '1');
    const accSafe = JSON.parse(C.toSafeJSON(accDraft));
    accSafe.inputs[1].signatureScript = sig;
    const accFin = C.finalizeOwnerCovenantTx(accDraft, accSafe);
    eq(accFin.rpcTx.outputs[0].value, 100000000);
    eq(accFin.rpcTx.outputs[1].value, 950000000);
    eq(accFin.rpcTx.outputs[2].value, 50000000);
    eq(accDraft.summary.nextState.ownerIdentifier, buyer.pubkey);
    eq(accDraft.summary.nextState.sales, 2n);

    const canDraft = C.buildCancelEscrowOffer({ escrow: escTicket, offerer: buyer, funding, fee: 500000n, hrp: 'kaspa' });
    eq(C.walletSignIndices(canDraft).join(','), '0,1');
    const canSafe = JSON.parse(C.toSafeJSON(canDraft));
    canSafe.inputs[0].signatureScript = sig;
    canSafe.inputs[1].signatureScript = sig;
    const canFin = C.finalizeOwnerCovenantTx(canDraft, canSafe);
    eq(canFin.rpcTx.outputs[0].value, 1010000000);

    const expDraft = C.buildExpireEscrowOffer({ escrow: escTicket, caller: seller, funding, fee: 500000n, hrp: 'kaspa' });
    eq(C.walletSignIndices(expDraft).join(','), '1');
    eq(expDraft.inputs[0].sequence, 100000n);
    const expSafe = JSON.parse(C.toSafeJSON(expDraft));
    expSafe.inputs[1].signatureScript = sig;
    const expVer = C.verifySigned(expDraft, expSafe);
    eq(expVer.rpcTx.outputs[0].value, 1010000000);
    eq(expVer.rpcTx.inputs[0].sequence, 100000);
  });

  await t('buildTransferEdition: accepts a kaspa: address, advances lineage, keeps sales unchanged', () => {
    const xferDraft = C.buildTransferEdition({ edition: edObj, owner: seller, newOwner: buyer.address, funding, fee: 500000n, hrp: 'kaspa' });
    eq(xferDraft.summary.nextState.ownerIdentifier, buyer.pubkey);
    eq(xferDraft.summary.nextState.sales, 1n);
    eq(xferDraft.summary.nextState.lineage, C.advanceLineage(edState.lineage, buyer.pubkey));
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
    const m2 = C.buildMint({ lane, buyer, funding: p2, fee, hrp: 'kaspa' });
    eq(m2.inputs.length, 3);
    eq(C.walletSignIndices(m2).join(','), '1,2');
    if (!C.pickFunding(list, 5000000000n).error) throw new Error('should refuse');
  });
  await t('fmtKas formats exactly', () => { eq(C.fmtKas(100000000n), '1'); eq(C.fmtKas(150000000n), '1.5'); eq(C.fmtKas(3500000n), '0.035'); });

  // ---- lane resolution against mocked public data
  const cfg = { rest: 'https://rest.test', kascov: 'https://kascov.test' };
  const genesisState = { ...st, mints_left: 1n, next_serial: 0n };
  const genesisRedeem = Buffer.from(C.factoryRedeem(genesisState, progBytes)).toString('hex');
  const mintTx = '9d'.repeat(32);
  const doneState = { ...st, mints_left: 0n, next_serial: 1n };
  const doneSpk = C.p2shSpk(C.factoryRedeem(doneState, progBytes));
  const seriesMock = { id: 'demo', laneCovenantId: S.laneCovenantId, genesisTxId: S.genesisTxId, _progBytes: progBytes };
  const bodies = {
    ['https://kascov.test/c/' + S.laneCovenantId + '.json']: { utxos: [{ outpoint: S.genesisTxId + ':0', live: false, revealed_hex: genesisRedeem }, { outpoint: mintTx + ':0', live: true, value: 100000000, script_hex: doneSpk }], events: [{ kind: 'genesis' }, { kind: 'transition' }], live_value: 100000000 },
    ['https://rest.test/transactions/' + mintTx]: { inputs: [{ previous_outpoint_hash: S.genesisTxId, previous_outpoint_index: 0 }] }
  };
  const io = C.makeIO(cfg, async (u) => ({ ok: !!bodies[u], status: bodies[u] ? 200 : 404, json: async () => bodies[u] }));
  await t('resolveLane: follows the mint chain and proves state == on-chain script', async () => {
    const r = await C.resolveLane(io, seriesMock); eq(r.state.mints_left, 0n); eq(r.state.next_serial, 1n); eq(r.spk, doneSpk); eq(r.outpoint.txId, mintTx);
  });
  await t('resolveLane: fails closed when the on-chain script disagrees', async () => {
    const b = JSON.parse(JSON.stringify(bodies)); b['https://kascov.test/c/' + S.laneCovenantId + '.json'].utxos[1].script_hex = 'aa20' + '00'.repeat(32) + '87';
    const io2 = C.makeIO(cfg, async (u) => ({ ok: !!b[u], status: 200, json: async () => b[u] }));
    let threw = false; try { await C.resolveLane(io2, seriesMock); } catch (e) { threw = /does not match/.test(e.message); } if (!threw) throw new Error('accepted a drifted script');
  });
  await t('resolveLane: refuses forked or closed lanes', async () => {
    const b = JSON.parse(JSON.stringify(bodies)); b['https://kascov.test/c/' + S.laneCovenantId + '.json'].events.push({ kind: 'fork' });
    const io3 = C.makeIO(cfg, async (u) => ({ ok: !!b[u], status: 200, json: async () => b[u] }));
    let threw = false; try { await C.resolveLane(io3, seriesMock); } catch (e) { threw = /fork/.test(e.message); } if (!threw) throw new Error('followed a fork');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
