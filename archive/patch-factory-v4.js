const fs = require('fs');
const path = require('path');

const srcPath = path.join(process.env.HOME, 'opt/silverscript/contracts/SeriesFactory-v3.sil');
const dstPath = path.join(process.env.HOME, 'opt/silverscript/contracts/SeriesFactory-v4.sil');

let src = fs.readFileSync(srcPath, 'utf8');

// 1. [HIGH] Fix "Unsold Collection" Trap: Allow artist to close early
// Replace the strict cap check with a comment explaining the new logic
src = src.replace(
  /require\(counter >= cap\);/,
  '// Artist can close early to cap supply and reclaim storage mass'
);

// 2. [LOW] Fix negative royalty_bips
// Find the existing upper bound check and add the lower bound
src = src.replace(
  /require\(royalty_bips <= 10000\);/,
  'require(royalty_bips >= 0 && royalty_bips <= 10000);'
);

// 3. [MEDIUM] Fix Factory Siphoning: Enforce UTXO value conservation
// Insert the value check right before the factory state validation
const anchor = 'validateOutputState(factoryOutIdx, State {';
const valueCheck = 'require(tx.outputs[factoryOutIdx].value >= tx.inputs[this.activeInputIndex].value);\n        ';
if (!src.includes(anchor)) {
  console.error('❌ Anchor for value check not found!');
  process.exit(1);
}
src = src.replace(anchor, valueCheck + anchor);

fs.writeFileSync(dstPath, src);
console.log('✅ SeriesFactory-v4.sil created with audit patches applied.');
