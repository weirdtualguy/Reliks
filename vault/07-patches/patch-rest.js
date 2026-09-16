const fs = require('fs');
let code = fs.readFileSync('src/mint.ts', 'utf8');
const marker = "const wsUrl = 'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json';";
const idx = code.indexOf(marker);
if (idx === -1) { console.log('❌ marker not found in mint.ts'); process.exit(1); }
const head = code.slice(0, idx);
fs.writeFileSync('src/mint.ts', head + `// ---- REST broadcast: mint is a plain payment, no computeBudget needed ----
console.log('\\n📡 Broadcasting mint via REST POST...');
try {
    const res = await fetch('https://api-tn10.kaspa.org/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: txJson.transaction, allowOrphan: false },
            (k, v) => typeof v === 'bigint' ? Number(v) : v)
    });
    console.log('📥 HTTP', res.status, await res.text());
} catch (e) {
    console.error('❌ Broadcast failed:', e);
    process.exit(1);
}
process.exit(0);
`);
console.log('✅ mint.ts now broadcasts via REST');
