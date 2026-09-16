const fs = require('fs');
let code = fs.readFileSync('src/mint.ts', 'utf8');

// 1. Replace the broken resolver block with the hardcoded working wRPC URL
const resolverBlock = /console\.log\('\\n📡 Fetching direct node IPs[\s\S]*?process\.exit\(1\);\n \}/;
const newConnection = `console.log('\\n📡 Connecting to community wRPC node...');
 const wsUrl = 'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json';`;

if (resolverBlock.test(code)) {
    code = code.replace(resolverBlock, newConnection);
    console.log('✅ Patched: Hardcoded working wRPC URL');
} else {
    console.log('⚠️ Could not find resolver block to replace.');
}

// 2. Enforce Transaction Version 1 (Critical for covenants on TN-10)
if (!code.includes('txJson.transaction.version = 1;')) {
    code = code.replace(
        /txJson\.transaction\.inputs\[0\]\.computeBudget = 10;/,
        "txJson.transaction.version = 1;\n    txJson.transaction.inputs[0].computeBudget = 10;"
    );
    console.log('✅ Patched: Enforced Tx Version 1');
}

fs.writeFileSync('src/mint.ts', code);
