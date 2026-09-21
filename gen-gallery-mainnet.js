const fs = require('fs');
const LD = JSON.parse(fs.readFileSync('data/factory-ledger-v8.json', 'utf8'));
const RG = JSON.parse(fs.readFileSync('web/reliks-registry-mainnet.json', 'utf8'));
const REG = { network: RG.network, series: RG.series, factoryCovenantId: RG.factoryCovenantId, artTxId: LD.artTxId || null, revealTxIds: LD.revealTxIds || [], editions: RG.editions };
const TEMPLATE = `<!doctype html><html><head><meta charset=utf-8><title>Reliks Gallery — Mainnet</title>
<style>body{background:#05060d;color:#dfe6ff;font-family:monospace;margin:0;padding:24px}h1{font-size:20px}.muted{color:#8fa0c9}.card{border:1px solid #2a3350;border-radius:10px;padding:16px;margin:16px 0;max-width:780px}.ok{background:#0c3;color:#000;padding:2px 8px;border-radius:6px;font-size:12px}.bad{background:#f33;color:#fff;padding:2px 8px;border-radius:6px;font-size:12px}iframe{width:100%;aspect-ratio:1;border:0;background:#000;border-radius:8px}a{color:#7fb4ff}.fee{border-left:3px solid #f5c542;padding:8px 12px;margin:12px 0;color:#ffe9a8}</style>
</head><body>
<h1>RELIKS — Genesis Gallery <span class=muted>(Kaspa mainnet)</span></h1>
<div id=status class=muted>reconstructing on-chain program…</div>
<div id=cards></div>
<script>
const REGISTRY = __REGISTRY__;
const REST = 'https://api.kaspa.org';
function hb(h){const b=new Uint8Array(h.length/2);for(let i=0;i<b.length;i++)b[i]=parseInt(h.substr(i*2,2),16);return b;}
function hx(b){let s='';for(let i=0;i<b.length;i++)s+=('0'+b[i].toString(16)).slice(-2);return s;}
function concat(a,b){const c=new Uint8Array(a.length+b.length);c.set(a);c.set(b,a.length);return c;}
function parsePushes(b){const out=[];let i=0;while(i<b.length){const op=b[i++];let len=-1;if(op===0){out.push(new Uint8Array(0));continue;}if(op>=1&&op<=75)len=op;else if(op===76){len=b[i];i++;}else if(op===77){len=b[i]|(b[i+1]<<8);i+=2;}else if(op===78){len=b[i]|(b[i+1]<<8)|(b[i+2]<<16)|(b[i+3]<<24);i+=4;}else break;if(i+len>b.length)break;out.push(b.slice(i,i+len));i+=len;}return out;}
async function tx(id){const r=await fetch(REST+'/transactions/'+id);return await r.json();}
async function programBytes(){let all=new Uint8Array(0);for(const id of REGISTRY.revealTxIds){const t=await tx(id);const ins=t.inputs||[];for(const inp of ins){const ss=inp.signature_script||inp.signatureScript||'';if(!ss)continue;const ps=parsePushes(hb(ss));if(!ps.length)continue;const rp=parsePushes(ps[ps.length-1]);if(rp.length)all=concat(all,rp[0]);}}return all;}
function kas(v){return (v/1e8).toFixed(8).replace(/0+$/,'').replace(/\\.$/,'');}
async function main(){
  const st=document.getElementById('status');
  const cards=document.getElementById('cards');
  try{
    const mod=await import('https://esm.sh/@noble/hashes@1.3.3/blake2b');
    const bytes=await programBytes();
    const h=hx(mod.blake2b(bytes,{dkLen:32}));
    const ok=(h===REGISTRY.series.program_hash);
    const s=REGISTRY.series;
    const p=s.price, roy=p*s.royalty_bips/10000, fee=p/100;
    st.innerHTML='program '+bytes.length+' bytes reconstructed from '+REGISTRY.revealTxIds.length+' reveal tx(s) — blake2b '+h.slice(0,16)+'… '+(ok?'<span class=ok>✅ MATCHES FACTORY program_hash</span>':'<span class=bad>❌ MISMATCH — refusing to render</span>');
    const d=document.createElement('div');d.className='fee';
    d.innerHTML='Fee stack enforced on-chain by Edition-v4: price '+kas(p)+' KAS → seller '+kas(p-roy-fee)+' · artist royalty '+kas(roy)+' ('+s.royalty_bips/100+'%) · Reliks protocol '+kas(fee)+' (1%). Exact-equality covenant checks; no intermediary holds funds.';
    cards.appendChild(d);
    for(const e of REGISTRY.editions){
      const c=document.createElement('div');c.className='card';
      c.innerHTML='<b>Serial '+e.serial+'</b> · edition covenant <a href=https://explorer.kaspa.org/transactions/'+e.txId+'>'+e.covenantId.slice(0,16)+'…</a><br><span class=muted>owner '+e.owner.slice(0,12)+'… · list price '+kas(e.price)+' KAS · mint tx '+e.txId.slice(0,12)+'…</span>';
      if(ok){const f=document.createElement('iframe');f.sandbox='allow-scripts';f.srcdoc=new TextDecoder().decode(bytes);c.appendChild(f);}
      cards.appendChild(c);
    }
  }catch(err){st.textContent='gallery error: '+err.message;}
}
main();
</script></body></html>`;
fs.writeFileSync('reliks-gallery.html', TEMPLATE.split('__REGISTRY__').join(JSON.stringify(REG)));
console.log('✅ wrote reliks-gallery.html with inlined registry (' + REG.editions.length + ' edition(s), ' + REG.revealTxIds.length + ' reveal tx(s))');
