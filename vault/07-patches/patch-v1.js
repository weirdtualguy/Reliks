const fs = require('fs');
let c = fs.readFileSync('src/mint.ts', 'utf8');
const outMarker = "const nftOutput: TxOutput = { amount: NFT_OUTPUT_AMOUNT, scriptPublicKey: nftSpk };";
const txMarker  = "const txJson: any = buildMintTransaction(fundingInput, nftOutput, changeOutput, signatureScript);";
if (!c.includes(outMarker) || !c.includes(txMarker)) { console.log('❌ markers not found'); process.exit(1); }

// Fund the canonical Studio Genesis instance (its 735-byte script hash)
c = c.replace(outMarker,
`const GENESIS_SPK = 'aa2047336ebb68fa0ade391d4761a11e7a889bb72fbe79cae66059d4f0e13aec88c387';
    const nftOutput: TxOutput = { amount: NFT_OUTPUT_AMOUNT, scriptPublicKey: GENESIS_SPK };`);

// Toccata TN10: v0 gets only 9,999 free script units; one Schnorr checkSig costs
// 100,000 -> every tx must be v1 with a committed compute budget (issue #1073).
c = c.replace(txMarker, txMarker + `
    txJson.transaction.version = 1;
    txJson.transaction.inputs[0].sigOpCount = 1;
    txJson.transaction.inputs[0].computeBudget = 100000;`);

fs.writeFileSync('src/mint.ts', c);
console.log('✅ patched: Genesis SPK + v1 compute budget');
