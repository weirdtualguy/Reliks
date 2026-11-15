// resolve-node.js — resolve a public Kaspa wRPC endpoint via the official SDK Resolver.
// Usage: node tools/resolve-node.js [mainnet|testnet-10] [json|borsh] [--verify]
// Prints the URL on the last stdout line (machine-readable); diagnostics go to stderr.
// --verify also connects an RpcClient to the URL and prints getInfo (isSynced / isUtxoIndexed).
//
// Design note (kaspa-agent-notes 12/14): public nodes are reached through the SDK's
// Resolver — there is no static list. Our lib speaks JSON wRPC, so we ask the Resolver
// for a JSON endpoint (Encoding.SerdeJson) and hand that URL to the existing raw
// JSON-RPC transport in lib/reliks-lib.js. Borsh is only for the SDK's own RpcClient.
'use strict';
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const network = args.find(a => !a.startsWith('--')) || 'mainnet';
  const encArg = args.find(a => a === 'json' || a === 'borsh') || 'json';
  const verify = args.includes('--verify');

  // Node >= 22 ships a W3C WebSocket global; the SDK's RpcClient needs one.
  // If it is missing, fall back to the `websocket` npm package (cookbook §1).
  if (typeof globalThis.WebSocket === 'undefined') {
    try { globalThis.WebSocket = require('websocket').w3cwebsocket; }
    catch (e) { console.error('no W3C WebSocket available (need Node >= 22 or the `websocket` package)'); process.exit(2); }
  }

  const kaspa = require(path.join(__dirname, '..', 'vendor', 'kaspa-wasm', 'kaspa.js'));
  const encoding = encArg === 'json' ? kaspa.Encoding.SerdeJson : kaspa.Encoding.Borsh;
  console.error(`resolving ${encArg} wRPC endpoint for ${network}...`);
  const resolver = new kaspa.Resolver();
  let url;
  try {
    url = await resolver.getUrl(encoding, network);
  } catch (e) {
    console.error('resolver.getUrl failed:', typeof e === 'string' ? e : (e && e.message) || String(e));
    process.exit(1);
  }
  console.error('resolved:', url);

  if (verify) {
    const rpc = new kaspa.RpcClient({ url, encoding, networkId: network });
    const timer = setTimeout(() => { console.error('verify connect timed out (20s)'); process.exit(1); }, 20000);
    try {
      await rpc.connect();
      const info = await rpc.getInfo();
      clearTimeout(timer);
      console.error(`verify: isSynced=${info.isSynced} isUtxoIndexed=${info.isUtxoIndexed} serverVersion=${info.serverVersion || '?'} virtualDaaScore=${info.virtualDaaScore || '?'}`);
      if (!info.isSynced) { console.error('verify FAILED: node not synced'); process.exit(1); }
      if (!info.isUtxoIndexed) { console.error('verify FAILED: node has no --utxoindex'); process.exit(1); }
      console.error('verify OK');
    } finally {
      try { await rpc.disconnect(); } catch (_) { /* already closed */ }
    }
  }
  console.log(url);
}

main().catch(e => { console.error('fatal:', typeof e === 'string' ? e : (e && e.message) || String(e)); process.exit(1); });
