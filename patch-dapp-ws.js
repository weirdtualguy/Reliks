const fs = require('fs');
let s = fs.readFileSync('web/index.html', 'utf8');
const oldMsg = "ws.onmessage=d=>{const s=d.toString();clearTimeout(t);log('📥 '+s.slice(0,220));let id=null;try{id=(JSON.parse(s).params||JSON.parse(s).result||{}).transactionId||null;}catch(e){}ws.close();res(id);};";
const newMsg = "ws.onmessage=ev=>{const s=(typeof ev.data==='string')?ev.data:JSON.stringify(ev.data);clearTimeout(t);log('📥 '+s.slice(0,300));let id=null;try{const j=JSON.parse(s);id=(j.params||j.result||{}).transactionId||null;if(!id&&j.error)log('⛔ node rejected: '+j.error.message);}catch(e){}ws.close();res(id);};";
if (!s.includes(oldMsg)) { console.error('onmessage line not found'); process.exit(1); }
s = s.split(oldMsg).join(newMsg);
fs.writeFileSync('web/index.html', s);
console.log('✅ broadcast now reads MessageEvent.data and surfaces node rejections');
