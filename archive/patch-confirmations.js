const fs = require('fs');
['deploy-v7.js', 'deploy-offer.js', 'deploy-token.js', 'mint-art-v5-final.js', 'mint-art-v6.js'].forEach(f => {
  if (!fs.existsSync(f)) return;
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes('waitForConfirmation')) {
    s = s.replace(/const txId = await ([^.]+)\.broadcast\(tx\);/g, 'const txId = await $1.broadcast(tx);\n  console.log("  waiting for confirmation...");\n  await $1.waitForConfirmation(txId);');
    fs.writeFileSync(f, s);
    console.log('patched', f, 'with F-07 confirmation gate');
  }
});
