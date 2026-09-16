const fs = require('fs');
let s = fs.readFileSync('web/index.html', 'utf8');
const anchor = '// Load gallery from editions-ledger.json';
const appendAnchor = '      gallery.appendChild(div);';
if (!s.includes(anchor) || !s.includes(appendAnchor)) { console.error('anchors not found'); process.exit(1); }
const helpers = `// ---- chain-verified art resolution ----
const HX = t => Uint8Array.from(t.replace(/\\s/g,'').match(/.{2}/g).map(b => parseInt(b, 16)));
const hexb = b => Array.from(b).map(x => x.toString(16).padStart(2,'0')).join('');
function parsePushes(bytes){const out=[];let i=0;while(i<bytes.length){const op=bytes[i++];let len=-1;
  if(op===0x00){out.push(new Uint8Array(0));continue;}
  if(op>=0x01&&op<=0x4b)len=op; else if(op===0x4c){len=bytes[i];i+=1;} else if(op===0x4d){len=bytes[i]|(bytes[i+1]<<8);i+=2;} else if(op===0x4e){len=bytes[i]|(bytes[i+1]<<8)|(bytes[i+2]<<16)|(bytes[i+3]<<24);i+=4;} else continue;
  if(len<0||i+len>bytes.length)break; out.push(bytes.slice(i,i+len)); i+=len;} return out;}
async function artFor(cov, ph){
  const key = 'pc_art_' + cov;
  const cached = localStorage.getItem(key);
  if (cached && hexb(blake2b(new TextEncoder().encode(cached), { dkLen: 32 })) === ph) return cached;
  try {
    const c = await (await fetch('https://kascov.io/data/testnet-10/c/' + cov + '.json')).json();
    const gen = (c.events || []).find(e => e.kind === 'genesis');
    const txid = gen && (gen.txid || gen.tx_id);
    if (txid) {
      const tx = await (await fetch('https://kascov.io/data/testnet-10/tx/' + txid + '.json')).json();
      const ss = (tx.inputs && tx.inputs[0] && (tx.inputs[0].signature_script || tx.inputs[0].signatureScript)) || '';
      const art = parsePushes(HX(ss)).find(p => p.length === 2048);
      if (art && hexb(blake2b(art, { dkLen: 32 })) === ph) {
        const html = new TextDecoder().decode(art);
        localStorage.setItem(key, html);
        log('art #' + ' verified on-chain (blake2b matches program_hash)');
        return html;
      }
    }
  } catch (e) { log('art chain fetch failed: ' + e.message); }
  try {
    const local = (await (await fetch('../art-program.hex')).text()).trim();
    if (hexb(blake2b(HX(local), { dkLen: 32 })) === ph) { log('art from local copy (hash matches)'); return new TextDecoder().decode(HX(local)); }
  } catch (e) {}
  log('art not found for ' + cov.slice(0, 10));
  return null;
}

`;
s = s.split(anchor).join(helpers + anchor);
s = s.split(appendAnchor).join(appendAnchor + `
      { const frame = div.querySelector('iframe');
        artFor(ed.covenantId, ed.program_hash).then(html => {
          if (html) frame.srcdoc = '<scr' + 'ipt>window.SERIAL=' + ed.serial + ';</scr' + 'ipt>' + html;
        }); }`);
fs.writeFileSync('web/index.html', s);
console.log('✅ dApp now renders chain-verified generative art');
