var MintBuilder = (function() {
  // --- Byte-Level State Encoding (Matches Silverscript pushExp) ---
  function le64(n) {
    const b = new Uint8Array(8);
    const v = BigInt(n);
    for (let i = 0; i < 8; i++) b[i] = Number((v >> BigInt(i * 8)) & 0xFFn);
    return b;
  }
  function encField(data) { // data is Uint8Array
    const out = new Uint8Array(data.length + 1);
    out[0] = data.length; // pushExp length prefix
    out.set(data, 1);
    return out;
  }
  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  }
  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // --- Chain Data Fetchers ---
  async function fetchFactory(covid) {
    const res = await fetch(`https://kascov.io/data/mainnet/c/${covid}.json`);
    if (!res.ok) throw new Error('Factory lane not found on Kascov');
    return await res.json();
  }
  async function fetchBuyerUtxos(address) {
    const res = await fetch(`https://api.kaspa.org/addresses/${address}/utxos`);
    if (!res.ok) throw new Error('Failed to fetch buyer UTXOs');
    return await res.json();
  }

  // --- Transaction Construction ---
  function buildMintTx(factoryUtxo, buyerUtxos, buyerPubkey, factoryState) {
    const price = BigInt(factoryState.state.price);
    const fee = 3500000n; // ~0.035 KAS estimated fee for V1 covenant tx
    const required = price + fee;

    // Simple UTXO selection (accumulate until we cover price + fee)
    let selected = [], total = 0n;
    for (const u of buyerUtxos) {
      selected.push(u);
      total += BigInt(u.utxoEntry.amount);
      if (total >= required) break;
    }
    if (total < required) throw new Error('Insufficient funds. Need ' + required + ' sompi, have ' + total);
    const change = total - required;

    // 1. Factory Input (Index 0)
    // Sigscript: tag(b781beeb) + buyer(32) + scheme(00) + edIdx(01) + artIdx(02)
    const mintTag = hexToBytes('b781beeb');
    const sigScriptParts = [
      mintTag,
      encField(hexToBytes(buyerPubkey)),
      encField(new Uint8Array([0x00])), // IDENTIFIER_PUBKEY
      encField(le64(1n)), // editionOutIdx
      encField(le64(2n))  // artistOutIdx
    ];
    const factorySigScript = bytesToHex(new Uint8Array(sigScriptParts.reduce((a, c) => [...a, ...c], [])));

    const inputs = [
      {
        previousOutpoint: { transactionId: factoryUtxo.outpoint.transactionId, index: factoryUtxo.outpoint.index },
        signatureScript: factorySigScript,
        sequence: 0, sigOpCount: 0
      }
    ];

    // Buyer Inputs (Index 1..N)
    selected.forEach(u => {
      inputs.push({
        previousOutpoint: { transactionId: u.outpoint.transactionId, index: u.outpoint.index },
        signatureScript: '', // Kaspire fills this
        sequence: 0, sigOpCount: 1
      });
    });

    // Outputs
    const outputs = [];

    // Output 0: Factory Continuation (mints_left - 1)
    // We must reconstruct the exact 135-byte state span
    const newState = [ ...factoryState.state ];
    newState[4] = Number(BigInt(newState[4]) - 1n); // mints_left
    // Note: In a real builder, we'd use the exact prefix/suffix from the ABI to rebuild the P2SH script.
    // For this UI wire, we'll use the existing scriptPubKey from the live UTXO as a placeholder 
    // since the state encoding logic is complex to inline without the full codec.
    outputs.push({
      scriptPublicKey: { scriptPublicKey: factoryUtxo.utxoEntry.scriptPublicKey.scriptPublicKey, version: 0 },
      amount: Number(factoryUtxo.utxoEntry.amount)
    });

    // Output 1: Edition Spawn (Placeholder P2SH for now)
    outputs.push({
      scriptPublicKey: { scriptPublicKey: '00', version: 0 }, // TODO: Full Edition template encoding
      amount: 100000000 // 1 KAS carrier floor
    });

    // Output 2: Artist Payment (P2PK)
    // Script: OP_DATA_32 <artist_pubkey> OP_CHECKSIG
    const artistSpk = '20' + factoryState.state.artist + 'ac'; 
    outputs.push({
      scriptPublicKey: { scriptPublicKey: artistSpk, version: 0 },
      amount: Number(price)
    });

    // Output 3: Buyer Change (P2PK)
    if (change > 0n) {
      const buyerSpk = '20' + buyerPubkey + 'ac';
      outputs.push({
        scriptPublicKey: { scriptPublicKey: buyerSpk, version: 0 },
        amount: Number(change)
      });
    }

    return {
      version: 0,
      inputs: inputs,
      outputs: outputs,
      lockTime: 0,
      subnetworkId: '0000000000000000000000000000000000000000'
    };
  }

  return { fetchFactory, fetchBuyerUtxos, buildMintTx };
})();
