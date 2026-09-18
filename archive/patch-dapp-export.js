const fs = require('fs');
let s = fs.readFileSync('web/index.html', 'utf8');
const btnOld = '<button class="go" id="bMint" onclick="doMint()">⛏ MINT NEXT EDITION</button>';
const btnNew = btnOld + '\n<button id="bExport">📤 Export overlay</button>';
const wireOld = 'window.refreshBalance();\nloadGallery();';
const wireNew = "document.getElementById('bExport').onclick=()=>{navigator.clipboard.writeText(JSON.stringify({overlay:overlay(),fac:facOv(),lastout:lastOut()}));log('overlay JSON copied to clipboard');};\nwindow.refreshBalance();\nloadGallery();";
if (!s.includes(btnOld) || !s.includes(wireOld)) { console.error('anchors not found'); process.exit(1); }
s = s.split(btnOld).join(btnNew).split(wireOld).join(wireNew);
fs.writeFileSync('web/index.html', s);
console.log('✅ export button added');
