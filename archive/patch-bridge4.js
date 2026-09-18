const fs = require('fs');
let c = fs.readFileSync('src/bridge4.ts', 'utf8');

// 1. Find and replace a specific block
const oldBlock = "const CLI = path.join(os.homedir(), 'opt/silverscript/target/release/cli-debugger');";
const newBlock = "const CLI = process.env.SILVERC_CLI || path.join(os.homedir(), 'opt/silverscript/target/release/cli-debugger');";

if (!c.includes(oldBlock)) { console.log('❌ marker not found'); process.exit(1); }
c = c.split(oldBlock).join(newBlock);

// 2. Write it back
fs.writeFileSync('src/bridge4.ts', c);
console.log('✅ bridge4.ts patched successfully');
