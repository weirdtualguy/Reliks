#!/usr/bin/env node
// Syncs data/mainnet-anchors.json and docs/marketplace-index.json from public Kaspa chain data
// (kascov + api.kaspa.org). Recomputes every serial, edition scriptPubKey, and KIP-20 covenantId
// locally—never trusts unverified API claims.
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'web', 'reliks-chain.js'));
const makeTemplates = require(path.join(ROOT, 'lib', 'reliks-templates.js'));

const t12 = makeTemplates();
const t13 = makeTemplates({ editionAbi: 'edition-abi-v13.json' });
C.init(t12);

const ANCHORS_PATH = process.env.RELIKS_ANCHORS || path.join(ROOT, 'data', 'mainnet-anchors.json');
const INDEX_OUT = process.env.RELIKS_INDEX_OUT || path.join(ROOT, 'docs', 'marketplace-index.json');

function isVmSeries(s) {
  return Number(s.engine_lang) === 2 || s.engineKind === 'vm' || typeof s.programHex === 'string' || typeof s.programFile === 'string';
}

function loadProgBytes(s) {
  if (s.programHex) return C.hex2u8(s.programHex);
  if (s.programFile) {
    const p = fs.existsSync(path.join(ROOT, s.programFile)) ? path.join(ROOT, s.programFile) : path.join(ROOT, 'v13', s.programFile);
    const raw = fs.readFileSync(p, 'utf8').trim();
    if (/^[0-9a-fA-F\s]+$/.test(raw) && /^52564d01/i.test(raw.replace(/\s+/g, ''))) return C.hex2u8(raw.replace(/\s+/g, '').toLowerCase());
    return require(path.join(ROOT, 'web', 'rvm-asm.js')).assemble(raw);
  }
  if (s.engine && fs.existsSync(path.join(ROOT, 'lib', s.engine))) {
    const E = require(path.join(ROOT, 'lib', s.engine));
    return C.utf8(E.ENGINE_SRC);
  }
  return null;
}

async function discoverNewEditions(io, s, progBytes, edTpl) {
  const kj = await io.covenant(s.laneCovenantId);
  const utxos = kj.utxos || [];
  const knownMintTxs = new Set((s.editions || []).map(e => e.mintTxId));
  let added = 0;

  // Walk lane UTXOs in chronological order by looking at transition/mint transactions
  // Each lane spend tx has input 0 = previous lane outpoint, output 0 = next lane, output 1 = new edition
  const byTx = new Map();
  for (const u of utxos) {
    const [txId, idxStr] = String(u.outpoint || '').split(':');
    if (!txId || Number(idxStr) !== 0) continue;
    byTx.set(txId, u);
  }

  // Reconstruct chain from genesisTxId forward using tx inputs
  const nextByPrev = new Map();
  for (const [txId] of byTx.entries()) {
    if (txId === s.genesisTxId) continue;
    try {
      const tx = await io.tx(txId);
      const inp0 = tx && tx.inputs && C.inputOutpoint(tx.inputs[0]);
      if (inp0 && inp0.index === 0) nextByPrev.set(inp0.txId, { txId, tx });
    } catch (e) { /* skip unreachable tx */ }
  }

  let curTxId = s.genesisTxId;
  let idx = 0;
  while (nextByPrev.has(curTxId)) {
    const { txId: mintTxId, tx } = nextByPrev.get(curTxId);
    if (!knownMintTxs.has(mintTxId) && tx.outputs && tx.outputs.length >= 2) {
      const edOut = tx.outputs[1];
      const edCov = C.covenantOf(edOut);
      const authIn = tx.inputs[Number(edCov.authorizingInput)];
      const authOp = authIn ? C.inputOutpoint(authIn) : null;
      const mintInp0 = C.inputOutpoint(tx.inputs[0]);
      if (authOp && mintInp0) {
        const serial = C.serialFromOutpoint(mintInp0.txId, mintInp0.index);
        const edSig = String(C.pick(tx.inputs[0], ['signature_script', 'signatureScript']) || '').toLowerCase();
        const pushes = edSig ? C.parsePushes(edSig) : [];
        const buyerPk = pushes[0] && /^[0-9a-f]{64}$/.test(pushes[0]) ? pushes[0] : null;
        if (buyerPk && edCov.id) {
          const recCov = C.covenantIdGenesis(authOp.txId, authOp.index, [{
            idx: 1,
            value: Number(C.outputValue(edOut)),
            script: C.spkOfOutput(edOut)
          }]);
          if (recCov === edCov.id) {
            const newEd = {
              index: idx,
              serial: serial,
              covenantId: edCov.id,
              mintTxId: mintTxId,
              outputIndex: 1,
              ownerAtMint: buyerPk
            };
            if (C.editionHasLineage(edTpl)) {
              newEd.lineage = C.genesisLineage(mintInp0.txId, mintInp0.index);
              newEd.sales = 0;
            }
            s.editions.push(newEd);
            knownMintTxs.add(mintTxId);
            added++;
          }
        }
      }
    }
    curTxId = mintTxId;
    idx++;
  }
  return added;
}

async function sync(opts) {
  opts = opts || {};
  const anchors = JSON.parse(fs.readFileSync(ANCHORS_PATH, 'utf8'));
  const io = opts.io || C.makeIO(anchors);
  let totalAdded = 0;
  const marketSeries = [];

  for (const s of anchors.series) {
    const isVm = isVmSeries(s);
    const edTpl = (isVm || s.protocol_version === 'v13') ? t13.edition : t12.edition;
    const progBytes = loadProgBytes(s);
    if (!Array.isArray(s.editions)) s.editions = [];

    let laneInfo = null;
    try {
      totalAdded += await discoverNewEditions(io, s, progBytes, edTpl);
      laneInfo = await C.resolveLane(io, s, { progBytes, editionTemplate: edTpl });
    } catch (e) {
      console.warn('[sync] lane warning for', s.id, ':', e.message);
    }

    const editionsSummary = [];
    let listedCount = 0;
    let floorSompi = null;
    let totalSales = 0;

    for (const ed of s.editions) {
      try {
        const live = await C.resolveEdition(io, s, ed, edTpl);
        const price = BigInt(live.state.price || 0);
        const sales = Number(live.state.sales || 0);
        totalSales += sales;
        if (price >= C.SOMPI) {
          listedCount++;
          if (floorSompi === null || price < floorSompi) floorSompi = price;
        }
        editionsSummary.push({
          index: ed.index,
          serial: String(ed.serial),
          covenantId: ed.covenantId,
          owner: live.state.ownerIdentifier,
          priceSompi: price.toString(),
          sales: sales,
          lineage: live.state.lineage || null
        });
      } catch (e) {
        editionsSummary.push({ index: ed.index, serial: String(ed.serial), covenantId: ed.covenantId, error: e.message });
      }
    }

    marketSeries.push({
      id: s.id,
      title: s.title,
      laneCovenantId: s.laneCovenantId,
      mintsLeft: laneInfo ? laneInfo.state.mints_left.toString() : null,
      mintPriceSompi: laneInfo ? laneInfo.state.price.toString() : null,
      editionsMinted: s.editions.length,
      listedCount: listedCount,
      floorSompi: floorSompi !== null ? floorSompi.toString() : null,
      totalSecondarySales: totalSales,
      editions: editionsSummary
    });
  }

  if (totalAdded > 0) {
    fs.writeFileSync(ANCHORS_PATH, JSON.stringify(anchors, null, 2) + '\n');
    console.log('Added', totalAdded, 'newly minted edition(s) to', path.relative(ROOT, ANCHORS_PATH));
  } else {
    console.log('No new editions found.');
  }

  const indexPayload = {
    updatedAt: new Date().toISOString(),
    network: anchors.network,
    series: marketSeries
  };
  fs.mkdirSync(path.dirname(INDEX_OUT), { recursive: true });
  fs.writeFileSync(INDEX_OUT, JSON.stringify(indexPayload, null, 2) + '\n');
  console.log('Wrote', path.relative(ROOT, INDEX_OUT));
  return { totalAdded, indexPayload };
}

if (require.main === module) {
  sync().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { sync, discoverNewEditions };
