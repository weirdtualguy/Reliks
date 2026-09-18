const fs = require('fs');
let s = fs.readFileSync('web/index.html', 'utf8');
const reps = [
  ["await new Promise(r=>setTimeout(r,4000));}return null;}",
   "await new Promise(r=>setTimeout(r,4000));}return null;}\n" +
   "const lastOut=()=>JSON.parse(localStorage.getItem('pc_lastout')||'{}');\n" +
   "const setLastOut=(cov,op)=>{const o=lastOut();o[cov]=op;localStorage.setItem('pc_lastout',JSON.stringify(o));};\n" +
   "async function pollCell(cov,spk,expectOp){for(let i=0;i<20;i++){const u=await pollLive(cov,spk,1);if(u&&(!expectOp||u.txId+':'+u.index===expectOp))return u;if(u)log('  waiting confirmation: live '+u.txId.slice(0,8)+':'+u.index+' != expected '+expectOp);}return null;}"],
  ["const u=await pollLive(ed.covenantId,oldSpk);if(!u)return log('edition cell not live');",
   "const u=await pollCell(ed.covenantId,oldSpk,lastOut()[ed.covenantId]);if(!u)return log('edition cell not live/confirmed');"],
  ["const u=await pollLive(ed.covenantId,oldSpk);if(!u)return log('cell not live');",
   "const u=await pollCell(ed.covenantId,oldSpk,lastOut()[ed.covenantId]);if(!u)return log('cell not live/confirmed');"],
  ["const fu=await pollLive(facId,curSpk);if(!fu)return log('factory cell not live');",
   "const fu=await pollCell(facId,curSpk,lastOut()[facId]);if(!fu)return log('factory cell not live/confirmed');"],
  ["if(id)updOverlay({...ed,ownerIdentifier:pubHex,price:0});",
   "if(id){setLastOut(ed.covenantId,id+':0');updOverlay({...ed,ownerIdentifier:pubHex,price:0});}"],
  ["if(id)updOverlay({...ed,price:np});",
   "if(id){setLastOut(ed.covenantId,id+':0');updOverlay({...ed,price:np});}"],
  ["if(id)updOverlay({...ed,ownerIdentifier:buyer,price:0});",
   "if(id){setLastOut(ed.covenantId,id+':0');updOverlay({...ed,ownerIdentifier:buyer,price:0});}"],
  ["if(id)updOverlay({...ed,ownerIdentifier:no,price:0});",
   "if(id){setLastOut(ed.covenantId,id+':0');updOverlay({...ed,ownerIdentifier:no,price:0});}"],
  ["if(id){localStorage.setItem('pc_fac',JSON.stringify({covenantId:facId,counter:counter+1}));",
   "if(id){setLastOut(facId,id+':0');localStorage.setItem('pc_fac',JSON.stringify({covenantId:facId,counter:counter+1}));"],
];
for (const [a, b] of reps) {
  const n = s.split(a).length - 1;
  if (n < 1) { console.error('missing:', a.slice(0, 60)); process.exit(1); }
  s = s.split(a).join(b);
  console.log('  replaced', n, '×', a.slice(0, 50));
}
fs.writeFileSync('web/index.html', s);
console.log('✅ confirmation gate installed on all five actions + mint');
