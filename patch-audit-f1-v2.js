const fs = require('fs');
const p = 'verify-render-v10.js';
let v = fs.readFileSync(p, 'utf8');

if (v.includes('ENGINE_SRC embedded')) { console.log('F1 gate already present'); process.exit(0); }

const anchor = "const ok = results.every(x => x);";
if (!v.includes(anchor)) { console.error('verifier summary anchor not found'); process.exit(1); }

const gate = `  // F1 gate: the redeem revealed in the mint sigscript (authenticated by the spk checks)
  // must embed the exact anchored engine bytes. This closes the compiler-elision hole where
  // engine_code could be garbage while program_hash is honest.
  const mint0 = await (await fetch(V.rest + '/transactions/' + LD.editions[0].txId)).json();
  const ss = Buffer.from(mint0.inputs[0].signature_script || mint0.inputs[0].signatureScript, 'hex');
  const lastPush = (() => { let o = 0, data = Buffer.alloc(0);
    while (o < ss.length) { const op = ss[o++]; let len = 0;
      if (op === 0x00) { data = Buffer.alloc(0); continue; }
      if (op >= 0x01 && op <= 0x4b) len = op;
      else if (op === 0x4c) { len = ss[o]; o += 1; }
      else if (op === 0x4d) { len = ss.readUInt16LE(o); o += 2; }
      else if (op === 0x4e) { len = ss.readUInt32LE(o); o += 4; }
      else throw new Error('non-push opcode in sigscript');
      data = ss.subarray(o, o + len); o += len; }
    return data; })();
  const engineBytes = Buffer.from(ENGINE.ENGINE_SRC, 'utf8');
  check('ENGINE_SRC embedded in on-chain redeem (engine_code == anchored engine)', lastPush.includes(engineBytes));

  ` + anchor;

v = v.split(anchor).join(gate);
fs.writeFileSync(p, v);
console.log('F1 fixed: verifier now checks the on-chain redeem embeds the anchored engine');
