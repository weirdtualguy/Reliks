const fs = require('fs');
let s = fs.readFileSync('offer-lib.js', 'utf8');
if (!s.includes('clear orphan window')) {
  s = s.replace(
    /console\.log\('  confirmed in block:', tx\.block_hash \? tx\.block_hash\[0\]\.slice\(0, 8\) \+ '\.\.\.' : 'accepted'\);\s*return true;/,
    "console.log('  confirmed in block:', tx.block_hash ? tx.block_hash[0].slice(0, 8) + '...' : 'accepted');\n          console.log('  waiting 10s to clear orphan window...');\n          await new Promise(r => setTimeout(r, 10000));\n          return true;"
  );
  fs.writeFileSync('offer-lib.js', s);
  console.log('✅ patched waitForConfirmation with 10s anti-orphan sleep');
} else {
  console.log('already patched');
}
