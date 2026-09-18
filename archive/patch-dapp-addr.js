const fs = require('fs');
let s = fs.readFileSync('web/index.html', 'utf8');

// Find the pubkey display line
const pubLine = "document.getElementById('pubkey').textContent = pubHex;";
if (!s.includes(pubLine)) { console.error('pubkey marker not found'); process.exit(1); }

// Find the balance fetch line
const balLine = "const resp = await fetch('https://kascov.io/data/testnet-10/a/' + pubHex + '.json');";
if (!s.includes(balLine)) { console.error('balance marker not found'); process.exit(1); }

// Replace pubkey display with real address
const pubReplacement = `let addr = pubHex;
try {
  const { encodePub } = await import('../bech32-solved.js');
  addr = encodePub(pubHex);
  log('bech32: ' + addr);
} catch (e) { log('bech32 unavailable: ' + e.message); }
document.getElementById('pubkey').textContent = addr;`;

// Replace balance fetch with REST API using real address
const balReplacement = "const resp = await fetch('https://api-tn10.kaspa.org/addresses/' + addr + '/utxos');";

// Find and replace the balance calculation
const balCalcLine = "const balance = (data.balance || 0) / 1e8;";
const balCalcReplacement = "const balance = Number(data.reduce((x, u) => x + BigInt(u.utxoEntry.amount), 0n)) / 1e8;";

s = s.split(pubLine).join(pubReplacement);
s = s.split(balLine).join(balReplacement);
s = s.split(balCalcLine).join(balCalcReplacement);

fs.writeFileSync('web/index.html', s);
console.log('✅ dApp patched: real bech32 address + REST balance');
