#!/usr/bin/env node
// Verifies a Series Anchor JSON submitted via a GitHub Issue and adds it to data/mainnet-anchors.json.
// Fails closed if any hash, Reliks-VM determinism gate, KIP-20 covenantId, or on-chain P2SH script mismatches.
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { blake2b } = require(path.join(ROOT, 'web', 'blake2b.js'));
const C = require(path.join(ROOT, 'web', 'reliks-chain.js'));
const RVM = require(path.join(ROOT, 'v13', 'vm', 'rvm.js'));
const makeTemplates = require(path.join(ROOT, 'lib', 'reliks-templates.js'));

const t12 = makeTemplates();
const t13 = makeTemplates({ editionAbi: 'edition-abi-v13.json' });
C.init(t12);

const ANCHORS_PATH = process.env.RELIKS_ANCHORS || path.join(ROOT, 'data', 'mainnet-anchors.json');
const hashHex = (u) => C.u8hex(blake2b(u instanceof Uint8Array ? u : new Uint8Array(u), 32));

function extractJsonFromText(text) {
  const s = String(text || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : s;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object found in submission');
  return JSON.parse(raw.slice(start, end + 1));
}

async function verifyAndAddSeries(rawText, opts) {
  opts = opts || {};
  const sub = typeof rawText === 'string' ? extractJsonFromText(rawText) : rawText;
  const anchors = JSON.parse(fs.readFileSync(ANCHORS_PATH, 'utf8'));
  const io = opts.io || C.makeIO(anchors);

  const reqFields = ['title', 'laneCovenantId', 'genesisTxId', 'programHash', 'renderHash', 'artist', 'genesisState'];
  for (const f of reqFields) {
    if (!sub[f]) throw new Error('Missing required field: ' + f);
  }
  for (const h64 of ['laneCovenantId', 'genesisTxId', 'programHash', 'renderHash', 'artist']) {
    if (!/^[0-9a-f]{64}$/.test(String(sub[h64]).toLowerCase())) throw new Error('Invalid 64-hex field: ' + h64);
  }

  const lang = Number(sub.engine_lang != null ? sub.engine_lang : 2);
  if (lang !== 2) throw new Error('Only Reliks-VM (engine_lang = 2) series are accepted for permissionless listing (v12 JS is deprecated)');
  if (!sub.programHex || !/^52564d01[0-9a-f]+$/i.test(sub.programHex)) {
    throw new Error('Missing or invalid Reliks-VM programHex (must start with RVM\\x01 magic 52564d01)');
  }
  const progBytes = C.hex2u8(sub.programHex.toLowerCase());
  if (progBytes.length > 25641) throw new Error('Program exceeds PUSHDATA2 baking cap (25641 bytes)');

  const gotPh = hashHex(progBytes);
  if (gotPh !== sub.programHash.toLowerCase()) throw new Error('programHash mismatch: expected ' + gotPh + ', got ' + sub.programHash);

  // Run Reliks-VM anchor render (serial=1, lineage=0, sales=0) + corner sweep gates
  const hi1 = RVM.hostInputs(blake2b, '1', new Uint8Array(32), 0);
  const svg1 = RVM.render(progBytes, hi1.lanes, hi1.serial32, hi1.pat, hi1.wear);
  const gotRh = hashHex(C.utf8(svg1));
  if (gotRh !== sub.renderHash.toLowerCase()) throw new Error('renderHash mismatch: expected ' + gotRh + ', got ' + sub.renderHash);

  for (const ser of ['1', '42', '999']) {
    const hi = RVM.hostInputs(blake2b, ser, new Uint8Array(32), 0);
    for (const [pat, wear] of [[0, 0], [21, 128], [63, 255]]) {
      RVM.render(progBytes, hi.lanes, hi.serial32, pat, wear);
    }
  }

  // Verify genesisState and on-chain genesis transaction
  const gs = sub.genesisState;
  const facState = {
    program_hash: gotPh,
    artist: sub.artist.toLowerCase(),
    price: BigInt(gs.price),
    royalty_bips: BigInt(gs.royalty_bips),
    mints_left: BigInt(gs.mints_left),
    engine_lang: 2n,
    render_hash: gotRh
  };
  if (facState.price !== 0n && facState.price < C.SOMPI) throw new Error('Price must be 0 or >= 1 KAS');
  if (facState.royalty_bips < 1n || facState.royalty_bips > 2000n) throw new Error('Royalty must be 1..2000 bips');
  if (facState.mints_left < 1n) throw new Error('Initial supply must be >= 1');

  const tx = await io.tx(sub.genesisTxId.toLowerCase());
  if (!tx || !tx.outputs || !tx.outputs[0]) throw new Error('Genesis transaction not found on Kaspa mainnet');
  if (tx.is_accepted === false || tx.isAccepted === false) throw new Error('Genesis transaction is not yet accepted on mainnet');

  const out0 = tx.outputs[0];
  const expectSpk = C.p2shSpk(C.buildFactoryRedeem(facState, progBytes, t13.edition));
  const gotSpk = C.spkOfOutput(out0);
  if (gotSpk !== expectSpk) throw new Error('On-chain P2SH scriptPubKey does not match synthesized SeriesFactory-v13 script');

  const cov0 = C.covenantOf(out0);
  const authIn = tx.inputs && tx.inputs[Number(cov0.authorizingInput)];
  const authOp = authIn ? C.inputOutpoint(authIn) : null;
  if (!authOp) throw new Error('Genesis transaction missing authorizing input');

  const recCov = C.covenantIdGenesis(authOp.txId, authOp.index, [{
    idx: 0,
    value: Number(C.outputValue(out0)),
    script: expectSpk
  }]);
  if (recCov !== sub.laneCovenantId.toLowerCase() || recCov !== cov0.id) {
    throw new Error('KIP-20 laneCovenantId mismatch: recomputed ' + recCov);
  }

  // Deduplicate check
  const slugBase = String(sub.id || sub.title).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'series';
  const id = slugBase.includes(sub.genesisTxId.slice(0, 6)) ? slugBase : (slugBase + '-' + sub.genesisTxId.slice(0, 6));
  if (anchors.series.some(s => s.laneCovenantId === recCov || s.genesisTxId === sub.genesisTxId.toLowerCase())) {
    throw new Error('Series is already listed in mainnet-anchors.json');
  }

  const entry = {
    id: id,
    title: String(sub.title).slice(0, 80),
    protocol_version: 'v13',
    laneCovenantId: recCov,
    genesisTxId: sub.genesisTxId.toLowerCase(),
    programHash: gotPh,
    renderHash: gotRh,
    artist: sub.artist.toLowerCase(),
    engine_lang: 2,
    engineKind: 'vm',
    programHex: C.u8hex(progBytes),
    royalty_bips: Number(facState.royalty_bips),
    genesisState: {
      program_hash: gotPh,
      artist: sub.artist.toLowerCase(),
      price: facState.price.toString(),
      royalty_bips: facState.royalty_bips.toString(),
      mints_left: facState.mints_left.toString(),
      engine_lang: '2',
      render_hash: gotRh
    },
    editions: []
  };

  anchors.series.unshift(entry);
  fs.writeFileSync(ANCHORS_PATH, JSON.stringify(anchors, null, 2) + '\n');
  return entry;
}

if (require.main === module) {
  const inputFile = process.argv[2];
  const raw = inputFile ? fs.readFileSync(inputFile, 'utf8') : fs.readFileSync(0, 'utf8');
  verifyAndAddSeries(raw)
    .then(entry => {
      console.log('VERIFIED_SERIES_JSON=' + JSON.stringify({ id: entry.id, title: entry.title, laneCovenantId: entry.laneCovenantId }));
    })
    .catch(e => {
      console.error('VERIFICATION_FAILED:', e.message);
      process.exit(1);
    });
}

module.exports = { verifyAndAddSeries, extractJsonFromText };
