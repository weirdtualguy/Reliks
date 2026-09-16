const fs = require('fs');
const WebSocket = require('ws');

const tx = JSON.parse(fs.readFileSync('mint-tx.json', 'utf8'));

function transformForRpc(tx) {
  return {
    version: tx.version,
    inputs: tx.inputs.map(inp => ({
      previousOutpoint: {
        transactionId: inp.previousOutpoint.transactionId,
        index: inp.previousOutpoint.index
      },
      signatureScript: inp.signatureScript,
      sequence: inp.sequence,
      sigOpCount: inp.sigOpCount || 0,
      computeBudget: inp.computeBudget || 0
    })),
    outputs: tx.outputs.map(out => ({
      value: Number(out.amount),
      // Flatten scriptPublicKey into a single hex string prefixed with version 0000
      scriptPublicKey: '0000' + out.scriptPublicKey.scriptPublicKey,
      ...(out.covenant ? {
        covenant: {
          authorizingInput: out.covenant.authorizingInput,
          covenantId: out.covenant.covenantId
        }
      } : {})
    })),
    lockTime: tx.lockTime,
    subnetworkId: tx.subnetworkId,
    gas: 0,
    payload: tx.payload || "",
    mass: 0
  };
}

const rpcTx = transformForRpc(tx);

console.log('Connecting to Kaspa wRPC...');
const ws = new WebSocket('wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Origin': 'https://wallet.kaspanet.io'
  }
});

ws.on('open', () => {
  console.log('Connected. Submitting transaction...');
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'submitTransaction',
    params: {
      transaction: rpcTx,
      allowOrphan: true // camelCase!
    }
  };

  console.log('Request size:', JSON.stringify(request).length, 'bytes');
  ws.send(JSON.stringify(request));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.error) {
    console.error('❌ Rejected:', JSON.stringify(msg.error, null, 2));
    console.log('\nTrying fallback endpoint...');
    ws.close();
    tryFallback();
  } else {
    console.log('✅ SUCCESS! Transaction accepted by the DAG!');
    console.log('TxId:', msg.result.transactionId);
    console.log(`\n🎉 View your minted Edition #0 on kascov:`);
    console.log(`https://kascov.io/testnet-10/tx/${msg.result.transactionId}`);
    ws.close();
  }
});

ws.on('error', (err) => console.error('WebSocket error:', err.message));

function tryFallback() {
  const ws2 = new WebSocket('wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Origin': 'https://wallet.kaspanet.io'
    }
  });

  ws2.on('open', () => {
    console.log('Fallback connected.');
    ws2.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'submitTransaction',
      params: { transaction: rpcTx, allowOrphan: true }
    }));
  });

  ws2.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.error) {
      console.error('Fallback rejected:', JSON.stringify(msg.error, null, 2));
    } else {
      console.log('✅ SUCCESS via fallback!');
      console.log('TxId:', msg.result.transactionId);
      console.log(`\n🎉 View your minted Edition #0 on kascov:`);
      console.log(`https://kascov.io/testnet-10/tx/${msg.result.transactionId}`);
    }
    ws2.close();
  });

  ws2.on('error', (err) => console.error('Fallback error:', err.message));
}
