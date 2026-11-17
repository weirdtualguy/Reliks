// Network-free tests for GitHub Actions marketplace scripts:
// tools/verify-and-add-series.js and tools/sync-marketplace.js.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');

const { blake2b } = require(path.join(root, 'web', 'blake2b.js'));
const C = require(path.join(root, 'web', 'reliks-chain.js'));
const RVM = require(path.join(root, 'vm', 'rvm.js'));
const RvmAsm = require(path.join(root, 'web', 'rvm-asm.js'));
const makeTemplates = require(path.join(root, 'lib', 'reliks-templates.js'));

const tpl = makeTemplates();
C.init(tpl);

const tmpAnchors = path.join(os.tmpdir(), 'reliks-mkt-anchors-' + process.pid + '.json');
const tmpIndex = path.join(os.tmpdir(), 'reliks-mkt-index-' + process.pid + '.json');
process.env.RELIKS_ANCHORS = tmpAnchors;
process.env.RELIKS_INDEX_OUT = tmpIndex;

const { verifyAndAddSeries } = require(path.join(root, 'tools', 'verify-and-add-series.js'));
const { sync } = require(path.join(root, 'tools', 'sync-marketplace.js'));

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ' | ' + e.message); } };
const eq = (a, b, m) => { if (String(a) !== String(b)) throw new Error((m || 'mismatch') + ': ' + a + ' != ' + b); };

(async () => {
  const baseAnchors = JSON.parse(fs.readFileSync(path.join(root, 'data', 'mainnet-anchors.json'), 'utf8'));
  baseAnchors.series = []; // isolate test
  fs.writeFileSync(tmpAnchors, JSON.stringify(baseAnchors, null, 2));

  const progBytes = RvmAsm.assemble(fs.readFileSync(path.join(root, 'web', 'vm-templates', 'starter.txt'), 'utf8'));
  const progHex = C.u8hex(progBytes);
  const progHash = C.u8hex(blake2b(progBytes, 32));
  const hi1 = RVM.hostInputs(blake2b, '1', new Uint8Array(32), 0);
  const svg1 = RVM.render(progBytes, hi1.lanes, hi1.serial32, hi1.pat, hi1.wear);
  const renderHash = C.u8hex(blake2b(C.utf8(svg1), 32));

  const artist = '25aafe02662998a62b4b4c1a887005ea8c604705c0a3cb29c3f63dfb85332f8b';
  const genState = { program_hash: progHash, artist, price: '100000000', royalty_bips: '500', mints_left: '8', engine_lang: '2', render_hash: renderHash, next_serial: '0' };
  const facRedeem = C.buildFactoryRedeem(genState, progBytes, tpl.edition);
  const facSpk = C.p2shSpk(facRedeem);
  const authTxId = 'aa'.repeat(32);
  const genesisTxId = 'bb'.repeat(32);
  const laneCov = C.covenantIdGenesis(authTxId, 0, [{ idx: 0, value: 100000000, script: facSpk }]);

  const submission = {
    id: 'starter-circles',
    title: 'Starter Circles',
    laneCovenantId: laneCov,
    genesisTxId: genesisTxId,
    programHash: progHash,
    renderHash: renderHash,
    artist: artist,
    engine_lang: 2,
    programHex: progHex,
    genesisState: genState
  };

  const mockTx = {
    is_accepted: true,
    inputs: [{ previous_outpoint_hash: authTxId, previous_outpoint_index: 0 }],
    outputs: [{ amount: '100000000', script_public_key: '0000' + facSpk, covenant: { authorizing_input: 0, covenant_id: laneCov } }]
  };

  // Also test discovering 1 newly minted edition in sync-marketplace.js
  const mintTxId = 'cc'.repeat(32);
  const buyer = 'dd'.repeat(32);
  const buyerFundTx = 'ee'.repeat(32);
  const serial0 = '0';
  const lin0 = C.genesisLineage(laneCov, 0);
  const edState0 = { ownerIdentifier: buyer, identifierType: 0, price: 0, artist, royalty_bips: 500, program_hash: progHash, factory_covid: laneCov, serial: serial0, lineage: lin0, sales: 0 };
  const edSpk0 = C.p2shSpk(C.editionRedeem(edState0, tpl.edition));
  const edCov0 = C.covenantIdGenesis(buyerFundTx, 1, [{ idx: 1, value: 100000000, script: edSpk0 }]);
  const nextLaneState = { ...genState, mints_left: '7', next_serial: '1' };
  const nextLaneSpk = C.p2shSpk(C.buildFactoryRedeem(nextLaneState, progBytes, tpl.edition));

  const mintSigScript = C.u8hex(Buffer.concat([
    Buffer.from(C.pushMin(C.hex2u8(buyer))),
    Buffer.from(C.pushMin(new Uint8Array([0]))),
    Buffer.from(C.pushMinInt(1)),
    Buffer.from(C.pushMinInt(2)),
    Buffer.from(C.pushMin(C.hex2u8('b781beeb'))),
    Buffer.from(C.pushMin(facRedeem))
  ]));

  const io = {
    tx: async (id) => {
      if (id === genesisTxId) return mockTx;
      if (id === mintTxId) {
        return {
          is_accepted: true,
          inputs: [
            { previous_outpoint_hash: genesisTxId, previous_outpoint_index: 0, signature_script: mintSigScript },
            { previous_outpoint_hash: buyerFundTx, previous_outpoint_index: 1 }
          ],
          outputs: [
            { amount: '100000000', script_public_key: '0000' + nextLaneSpk, covenant: { authorizing_input: 0, covenant_id: laneCov } },
            { amount: '100000000', script_public_key: '0000' + edSpk0, covenant: { authorizing_input: 1, covenant_id: edCov0 } }
          ]
        };
      }
      throw new Error('404 ' + id);
    },
    covenant: async (id) => {
      if (id === laneCov) {
        return {
          utxos: [
            { outpoint: genesisTxId + ':0', live: false, revealed_hex: C.u8hex(facRedeem) },
            { outpoint: mintTxId + ':0', live: true, value: 100000000, script_hex: nextLaneSpk }
          ],
          events: [{ kind: 'genesis' }, { kind: 'transition' }],
          live_value: 100000000
        };
      }
      if (id === edCov0) {
        return {
          utxos: [{ outpoint: mintTxId + ':1', live: true, value: 100000000, script_hex: edSpk0 }],
          events: [{ kind: 'genesis' }],
          live_value: 100000000
        };
      }
      throw new Error('404 cov ' + id);
    }
  };

  await t('verifyAndAddSeries: verifies Issue markdown JSON against Reliks-VM and genesis tx, and adds to anchors', async () => {
    const issueMd = '### Series Anchor JSON\n```json\n' + JSON.stringify(submission, null, 2) + '\n```';
    const entry = await verifyAndAddSeries(issueMd, { io });
    eq(entry.laneCovenantId, laneCov);
    const saved = JSON.parse(fs.readFileSync(tmpAnchors, 'utf8'));
    eq(saved.series.length, 1);
  });

  await t('verifyAndAddSeries: rejects tampered renderHash', async () => {
    const bad = { ...submission, renderHash: '00'.repeat(32) };
    let threw = false;
    try { await verifyAndAddSeries(JSON.stringify(bad), { io }); } catch (e) { threw = /renderHash mismatch/.test(e.message); }
    if (!threw) throw new Error('accepted tampered renderHash');
  });

  await t('sync: discovers newly minted edition, recomputes serial + KIP-20 covenantId, and builds marketplace-index.json', async () => {
    const res = await sync({ io });
    eq(res.totalAdded, 1);
    const saved = JSON.parse(fs.readFileSync(tmpAnchors, 'utf8'));
    eq(saved.series[0].editions.length, 1);
    eq(saved.series[0].editions[0].serial, serial0);
    eq(saved.series[0].editions[0].covenantId, edCov0);
    eq(res.indexPayload.series[0].mintsLeft, '7');
    eq(res.indexPayload.series[0].editionsMinted, 1);
  });

  // Fork scenario: genesis -> mint(serial 0) -> fork -> mint(serial 1 on the left lane).
  // A fork must not consume a serial (the old walker numbered the second mint 2) and the index must flag the fork.
  const forkTxId = 'f1'.repeat(32), mint2TxId = 'c2'.repeat(32), buyer2 = 'd2'.repeat(32), fund2Tx = 'e2'.repeat(32);
  const lin1 = C.genesisLineage(laneCov, 1);
  const edState1 = { ownerIdentifier: buyer2, identifierType: 0, price: 0, artist, royalty_bips: 500, program_hash: progHash, factory_covid: laneCov, serial: '1', lineage: lin1, sales: 0 };
  const edSpk1 = C.p2shSpk(C.editionRedeem(edState1, tpl.edition));
  const edCov1 = C.covenantIdGenesis(fund2Tx, 1, [{ idx: 1, value: 100000000, script: edSpk1 }]);
  const sig2 = C.u8hex(Buffer.concat([Buffer.from(C.pushMin(C.hex2u8(buyer2))), Buffer.from(C.pushMin(facRedeem))]));
  const laneOut = (cov) => ({ amount: '100000000', script_public_key: '0000' + nextLaneSpk, covenant: { authorizing_input: 0, covenant_id: cov } });
  const forkTx = { is_accepted: true, inputs: [{ previous_outpoint_hash: mintTxId, previous_outpoint_index: 0 }], outputs: [laneOut(laneCov), laneOut(laneCov)] };
  const mint2Tx = {
    is_accepted: true,
    inputs: [{ previous_outpoint_hash: forkTxId, previous_outpoint_index: 0, signature_script: sig2 }, { previous_outpoint_hash: fund2Tx, previous_outpoint_index: 1 }],
    outputs: [laneOut(laneCov), { amount: '100000000', script_public_key: '0000' + edSpk1, covenant: { authorizing_input: 1, covenant_id: edCov1 } }]
  };
  const io2 = Object.assign({}, io, {
    tx: async (id) => (id === forkTxId ? forkTx : id === mint2TxId ? mint2Tx : io.tx(id)),
    covenant: async (id) => {
      if (id === laneCov) {
        return { utxos: [
          { outpoint: genesisTxId + ':0', live: false, revealed_hex: C.u8hex(facRedeem) },
          { outpoint: mintTxId + ':0', live: false },
          { outpoint: forkTxId + ':0', live: false },
          { outpoint: forkTxId + ':1', live: true, value: 100000000, script_hex: nextLaneSpk },
          { outpoint: mint2TxId + ':0', live: true, value: 100000000, script_hex: nextLaneSpk }
        ], events: [{ kind: 'genesis' }, { kind: 'transition' }, { kind: 'transition' }, { kind: 'transition' }], live_value: 200000000 };
      }
      if (id === edCov1) return { utxos: [{ outpoint: mint2TxId + ':1', live: true, value: 100000000, script_hex: edSpk1 }], events: [{ kind: 'genesis' }], live_value: 100000000 };
      return io.covenant(id);
    }
  });
  await t('sync: a fork does not consume a serial; the next left-lane mint gets serial 1 and the index flags the fork', async () => {
    const res = await sync({ io: io2 });
    eq(res.totalAdded, 1);
    const saved = JSON.parse(fs.readFileSync(tmpAnchors, 'utf8'));
    eq(saved.series[0].editions.length, 2);
    eq(saved.series[0].editions[1].serial, '1');
    eq(saved.series[0].editions[1].covenantId, edCov1);
    if (!/forked|live outputs/.test(String(res.indexPayload.series[0].laneError))) throw new Error('index did not flag the forked lane: ' + res.indexPayload.series[0].laneError);
  });

  // Fail closed: an unrecognisable lane transaction stops discovery instead of guessing serials.
  await t('sync: an unrecognised lane transaction stops discovery (fail closed)', async () => {
    const anchors = JSON.parse(fs.readFileSync(tmpAnchors, 'utf8'));
    anchors.series[0].editions = anchors.series[0].editions.slice(0, 1);
    fs.writeFileSync(tmpAnchors, JSON.stringify(anchors, null, 2));
    const weirdTx = Object.assign({}, mint2Tx, { inputs: [Object.assign({}, mint2Tx.inputs[0], { signature_script: '' }), mint2Tx.inputs[1]] });
    const io3 = Object.assign({}, io2, { tx: async (id) => (id === mint2TxId ? weirdTx : io2.tx(id)) });
    const res = await sync({ io: io3 });
    eq(res.totalAdded, 0);
  });

  try { fs.unlinkSync(tmpAnchors); fs.unlinkSync(tmpIndex); } catch (e) {}
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
