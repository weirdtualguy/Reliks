const fs = require('fs');
const p = 'web/v5-gallery.html';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('dkLen: 32')) { console.log('already patched'); process.exit(0); }

const anchorA = "                log(`   Found revealTxId: ${revealTxId}`, 'success');\n\n                log('2. Fetching reveal tx from Kaspa REST API...');";
if (!s.includes(anchorA)) { console.error('anchor A not found'); process.exit(1); }
const insertB = "                log(`   Found revealTxId: ${revealTxId}`, 'success');\n\n                log('1b. Extracting on-chain program_hash from factory mint tx (trustless)...');\n                const abiRes = await fetch('factory-abi-v5.json');\n                if (!abiRes.ok) throw new Error('factory-abi-v5.json missing in web/ - copy it first');\n                const abi = await abiRes.json();\n                const fC = abi.contracts[Object.keys(abi.contracts)[0]];\n                const span = fC.compiled.state_span;\n                const covRes = await fetch(`${KASCOV_BASE}/c/${factoryCovId}.json`);\n                const covData = await covRes.json();\n                const liveU = covData.utxos.find(u => u.live);\n                if (!liveU) throw new Error('No live factory UTXO in kascov');\n                const mintTxId = liveU.outpoint.split(':')[0];\n                const mintRes = await fetch(`${REST_BASE}/transactions/${mintTxId}`);\n                const mintTx = await mintRes.json();\n                const mintPushes = parsePushes(hexToBytes(mintTx.inputs[0].signature_script));\n                const fRedeem = mintPushes[mintPushes.length - 1];\n                const fState = fRedeem.slice(span.offset, span.offset + span.len);\n                const programHashOnChain = bytesToHex(parsePushes(fState)[0]);\n                log(`   On-chain program_hash: ${programHashOnChain} (mint ${mintTxId.slice(0, 8)}...)`, 'success');\n\n                log('2. Fetching reveal tx from Kaspa REST API...');";
s = s.split(anchorA).join(insertB);

const anchorB = "                const hash = bytesToHex(blake2b(fullArt));\n                log(`   Art program_hash: ${hash}`, 'success');";
if (!s.includes(anchorB)) { console.error('anchor B not found'); process.exit(1); }
const replB = "                const hash = bytesToHex(blake2b(fullArt, { dkLen: 32 }));\n                log(`   Computed program_hash (32B): ${hash}`, 'success');\n                if (hash !== programHashOnChain) throw new Error('HASH MISMATCH: on-chain ' + programHashOnChain + ' vs computed ' + hash);\n                log('   TRUSTLESS CHECK PASSED: reassembled art matches on-chain factory state', 'success');";
s = s.split(anchorB).join(replB);

fs.writeFileSync(p, s);
console.log('patched web/v5-gallery.html: 32B digest + on-chain hash enforcement');
