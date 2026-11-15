// sdk-submit.js — submit a fully-built transaction through a public node discovered
// via the Kaspa Resolver protocol, using the official WASM SDK (Borsh wRPC).
//
// WHY THIS EXISTS (kaspa-agent-notes 12/14, verified 2026-11-15):
// - The public node fleet moved to wRPC v2 (Borsh). The resolver service answers
//   GET /v2/kaspa/{network}/any/wrpc/borsh with {"uid","url"} but returns 404 for
//   .../wrpc/json on mainnet — there is NO public JSON wRPC endpoint left to discover.
// - The kaspa-ng groups (us-1/eu-1.kaspa-ng.org) are commented out of the SDK's
//   Resolvers.toml, i.e. retired; the live fleet is kaspa.stream/.red/.green/.blue.
// - Our lib builds/signs transactions in the node's JSON format and speaks raw JSON
//   wRPC. That transport is dead on mainnet. This module keeps our builder/signer
//   untouched and swaps only the SUBMIT step to the SDK's Borsh RpcClient:
//   Transaction.deserializeFromSafeJSON(ourTxJson) -> submitTransaction.
// - The WASM Resolver itself is NOT used for discovery: its fetch has no timeout,
//   so a dead resolver host hangs getUrl forever. This module implements the same
//   protocol (same hosts, same path) with an 8s timeout per host and shuffling.
//
// Usage: PC_USE_SDK=1 node <builder>.js   (reliks-lib routes broadcast through here first)
// Direct: node lib/sdk-submit.js <tx.json> [mainnet|testnet]  (tx.json = our rpcTx JSON)
'use strict';
const path = require('path');
const fs = require('fs');

const SDK_PATH = path.join(__dirname, '..', 'vendor', 'kaspa-wasm', 'kaspa.js');

// Resolver service hosts, from kaspanet/rusty-kaspa rpc/wrpc/client/Resolvers.toml
// (active groups only; kaspa-ng groups are commented out there). Shuffled per call.
const RESOLVER_HOSTS = [
  'eric.kaspa.stream', 'maxim.kaspa.stream', 'sean.kaspa.stream', 'troy.kaspa.stream',
  'john.kaspa.red', 'mike.kaspa.red', 'paul.kaspa.red', 'alex.kaspa.red',
  'jake.kaspa.green', 'mark.kaspa.green', 'adam.kaspa.green', 'liam.kaspa.green',
  'noah.kaspa.blue', 'ryan.kaspa.blue', 'jack.kaspa.blue', 'luke.kaspa.blue',
];

const errMsg = e => (typeof e === 'string' ? e : (e && e.message) || String(e));

function sdkNetworkId(net) {
  return net === 'mainnet' ? 'mainnet' : 'testnet-10';
}

async function fetchJson(url, ms) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Discover a Borsh wRPC node URL for the network. Same protocol as the SDK Resolver.
async function resolveBorshNode(net) {
  const networkId = sdkNetworkId(net);
  const hosts = RESOLVER_HOSTS.slice();
  for (let i = hosts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [hosts[i], hosts[j]] = [hosts[j], hosts[i]]; }
  const errors = [];
  for (const host of hosts) {
    const url = `https://${host}/v2/kaspa/${networkId}/any/wrpc/borsh`;
    try {
      const desc = await fetchJson(url, 8000);
      if (desc && typeof desc.url === 'string' && desc.url.startsWith('wss://')) {
        console.error(`  sdk-resolver: ${host} -> ${desc.url}`);
        return desc.url;
      }
      errors.push(`${host}: bad descriptor`);
    } catch (e) { errors.push(`${host}: ${errMsg(e)}`); }
  }
  throw new Error('resolver: no resolver service answered (' + errors.slice(0, 4).join('; ') + (errors.length > 4 ? '; ...' : '') + ')');
}

function withTimeout(p, ms, label) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(label + ' timed out after ' + ms + 'ms')), ms); })])
    .finally(() => clearTimeout(t));
}

// Our lib builds tx JSON in the node's RPC shape (nested previousOutpoint, numbers);
// the SDK's SafeJSON wants the *serializable* shape (ISerializableTransaction):
// flat inputs {transactionId, index, sequence, sigOpCount, computeBudget,
// signatureScript, utxo}, outputs {value, scriptPublicKey:{version, script}},
// u64 fields as strings, a top-level `id` (dummy — finalize() recomputes it),
// and no `mass`. The `utxo` entries are SDK-side auxiliary data (the node
// re-derives everything from the outpoints), so blockDaaScore is filled with
// '0'; amount/script come from a REST lookup of each input's funding tx.
const REST_BASE = { testnet: 'https://api-tn10.kaspa.org', mainnet: 'https://api.kaspa.org' };

async function fetchJsonRest(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`REST ${res.status} for ${url}`);
  return res.json();
}

async function toSafeJson(rpcTx, net) {
  const rest = REST_BASE[net === 'mainnet' ? 'mainnet' : 'testnet'];
  const stripVer = s => (typeof s === 'string' && s.slice(0, 4) === '0000') ? s.slice(4) : s;
  const inputs = [];
  for (const inp of rpcTx.inputs || []) {
    const prevId = inp.previousOutpoint.transactionId;
    const prevIdx = Number(inp.previousOutpoint.index);
    const prev = await fetchJsonRest(`${rest}/transactions/${prevId}`);
    const out = (prev.outputs || [])[prevIdx];
    if (!out) throw new Error(`funding output ${prevId}:${prevIdx} not found via REST`);
    inputs.push({
      transactionId: prevId,
      index: prevIdx,
      sequence: String(inp.sequence ?? 0),
      sigOpCount: Number(inp.sigOpCount ?? 0),
      computeBudget: Number(inp.computeBudget ?? 10),
      signatureScript: inp.signatureScript || '',
      utxo: {
        amount: String(out.amount),
        scriptPublicKey: { version: 0, script: out.script_public_key },
        blockDaaScore: '0',
        isCoinbase: false,
      },
    });
  }
  const outputs = (rpcTx.outputs || []).map(o => ({
    value: String(o.value),
    scriptPublicKey: { version: 0, script: stripVer(o.scriptPublicKey) },
  }));
  return {
    id: '00'.repeat(32),
    version: Number(rpcTx.version ?? 1),
    inputs,
    outputs,
    lockTime: String(rpcTx.lockTime ?? 0),
    subnetworkId: rpcTx.subnetworkId || '00'.repeat(20),
    gas: String(rpcTx.gas ?? 0),
    payload: rpcTx.payload || '',
  };
}

// Submit an already-built, already-signed transaction (our rpcTx JSON object)
// through the SDK's Borsh RpcClient. Returns the txid string.
async function submitViaSdk(rpcTx, net) {
  if (typeof globalThis.WebSocket === 'undefined') {
    try { globalThis.WebSocket = require('websocket').w3cwebsocket; }
    catch (e) { throw new Error('no W3C WebSocket available (need Node >= 22 or the `websocket` package)'); }
  }
  if (!fs.existsSync(SDK_PATH)) {
    throw new Error('WASM SDK not found at vendor/kaspa-wasm/kaspa.js — run tools/setup-sdk.sh first');
  }
  const kaspa = require(SDK_PATH);
  const networkId = sdkNetworkId(net);
  // A resolved node can be slow or down (one connect timed out on testnet even
  // though the resolver answered) — retry with a freshly resolved node, up to 3.
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const nodeUrl = await resolveBorshNode(net);
    const rpc = new kaspa.RpcClient({ url: nodeUrl, encoding: kaspa.Encoding.Borsh, networkId });
    try {
      await withTimeout(rpc.connect(), 20000, 'sdk node connect');
      const info = await withTimeout(rpc.getInfo(), 15000, 'sdk getInfo');
      if (!info.isSynced) throw new Error('sdk node not synced');
      if (!info.isUtxoIndexed) throw new Error('sdk node has no --utxoindex');
      console.error(`  sdk-node: ${nodeUrl} (server ${info.serverVersion || '?'}, synced, utxo-indexed)`);
      const safeTx = await toSafeJson(rpcTx, net);
      const tx = kaspa.Transaction.deserializeFromSafeJSON(JSON.stringify(safeTx));
      tx.finalize();
      const expected = String(tx.id).toLowerCase();
      console.error(`  sdk-submit: tx id ${expected} (pre-broadcast)`);
      let res;
      try {
        res = await withTimeout(rpc.submitTransaction({ transaction: tx, allowOrphan: true }), 30000, 'sdk submitTransaction');
      } catch (e) {
        const m = errMsg(e);
        if (m.includes(expected) && /already in the mempool|already accepted/i.test(m)) return expected;
        throw new Error(m);
      }
      return String((res && res.transactionId) || expected).toLowerCase();
    } catch (e) {
      lastErr = e;
      console.error(`  sdk attempt ${attempt} failed on ${nodeUrl}: ${errMsg(e)}`);
    } finally {
      try { await rpc.disconnect(); } catch (_) { /* already closed */ }
    }
  }
  throw lastErr || new Error('sdk submit failed on all resolved nodes');
}

if (require.main === module) {
  (async () => {
    const [txFile, net = 'testnet'] = process.argv.slice(2);
    if (!txFile) { console.error('usage: node lib/sdk-submit.js <tx.json> [mainnet|testnet]'); process.exit(2); }
    const rpcTx = JSON.parse(fs.readFileSync(txFile, 'utf8'));
    const txId = await submitViaSdk(rpcTx, net);
    console.log(txId);
  })().catch(e => { console.error('sdk-submit failed:', errMsg(e)); process.exit(1); });
}

module.exports = { submitViaSdk, resolveBorshNode, sdkNetworkId };
