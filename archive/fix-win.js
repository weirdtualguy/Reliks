const fs = require('fs');
let code = fs.readFileSync('mint-v8.js', 'utf8');

// Replace wIn.spk with walletInputs[0].spk (the change output goes to the first funding UTXO's address)
code = code.replace(/wIn\.spk/g, 'walletInputs[0].spk');

// Replace wIn.amount with totalWalletIn (the sum of all selected UTXOs)
code = code.replace(/wIn\.amount/g, 'totalWalletIn');

// Just in case there are any stray wIn.txId or wIn.index references
code = code.replace(/wIn\.txId/g, 'walletInputs[0].txId');
code = code.replace(/wIn\.index/g, 'walletInputs[0].index');

fs.writeFileSync('mint-v8.js', code);
console.log('✅ Replaced remaining wIn references with walletInputs[0] and totalWalletIn');
