const fs = require('fs');

// 1. Force-patch network.js
let code = fs.readFileSync('network.js', 'utf8');
const match = code.match(/wrpc\s*:\s*\[/);
if (match) {
  let startIdx = match.index + match[0].length;
  let depth = 1;
  let endIdx = startIdx;
  while (depth > 0 && endIdx < code.length) {
    if (code[endIdx] === '[') depth++;
    else if (code[endIdx] === ']') depth--;
    if (depth > 0) endIdx++;
  }
  code = code.slice(0, match.index) + "wrpc: ['ws://seeder1.kaspad.net:18110', 'ws://seeder2.kaspad.net:18110']" + code.slice(endIdx + 1);
  fs.writeFileSync('network.js', code);
  console.log("✅ Force-patched network.js wrpc array using brace-matching");
} else {
  console.log("❌ Could not find wrpc array in network.js");
}

// 2. Verify what Node.js actually sees
delete require.cache[require.resolve('./network.js')];
const N = require('./network.js');
console.log("Node now sees N.wrpc as:", N.wrpc);

// 3. Check for duplicate broadcast functions in libs
for (const file of ['v7-lib.js', 'offer-lib.js']) {
  const libCode = fs.readFileSync(file, 'utf8');
  const matches = libCode.match(/function\s+broadcastWithMsg/g) || [];
  console.log(`${file} has ${matches.length} broadcastWithMsg definition(s)`);
  if (matches.length > 1) console.log("⚠️ WARNING: Multiple definitions found in " + file);
}
