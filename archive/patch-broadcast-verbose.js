const fs = require('fs');
let code = fs.readFileSync('offer-lib.js', 'utf8');

// Find the broadcastWithMsg function and add error logging
const OLD_WS_ERROR = /ws\.on\('error', \(\) => \{ clearTimeout\(t\); tryUrl\(k \+ 1\); \}\);/g;
const NEW_WS_ERROR = `ws.on('error', (e) => { clearTimeout(t); console.error('WRPC ERROR [' + N.wrpc[k] + ']:', e.message || e.code || e); tryUrl(k + 1); });`;

if (!OLD_WS_ERROR.test(code)) {
  console.log('❌ could not find ws.on("error") pattern in offer-lib.js');
  console.log('Searching for similar patterns...');
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    if (line.includes("ws.on('error'")) console.log('Line', i+1, ':', line);
  });
  process.exit(1);
}

code = code.replace(OLD_WS_ERROR, NEW_WS_ERROR);

// Also add timeout logging
const OLD_TIMEOUT = /const t = setTimeout\(\(\) => \{ ws\.terminate\(\); tryUrl\(k \+ 1\); \}, 15000\);/g;
const NEW_TIMEOUT = `const t = setTimeout(() => { console.log('WRPC TIMEOUT [' + N.wrpc[k] + '] after 15s'); ws.terminate(); tryUrl(k + 1); }, 15000);`;

code = code.replace(OLD_TIMEOUT, NEW_TIMEOUT);

fs.writeFileSync('offer-lib.js', code);
console.log('✅ offer-lib.js patched: WebSocket errors and timeouts now print to console');
