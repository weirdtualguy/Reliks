import * as fs from 'fs';
import { execSync } from 'child_process';
import { blake2b } from '@noble/hashes/blake2b';
const CLI = process.env.HOME + '/opt/silverscript/target/release/cli-debugger';
const SIL = process.env.HOME + '/opt/silverscript/contracts/NftInstance.sil';
const hx = (s: string) => (s.startsWith('0x') ? s : '0x' + s);

export interface V2Args {
  collectionId: string; tokenId: number; artPayload: string;
  initOwner: string; initScheme: number; initPrice: number; initRoyalty: string;
}

export function compileV2(a: V2Args): { bytecodeHex: string; scriptPublicKey: string } {
  // RAW SilverScript literals, one per --ctor-arg (the format v1 used successfully)
  const raw = [
    hx(a.collectionId), String(a.tokenId), hx(a.artPayload),
    hx(a.initOwner), String(a.initScheme), String(a.initPrice), hx(a.initRoyalty),
  ];
  const cmd = `${CLI} ${SIL} ` + raw.map(v => `--ctor-arg ${v}`).join(' ') + ` --emit-bytecode`;
  let out = '';
  try { out = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (e: any) { throw new Error('cli-debugger failed: ' + (e.stderr || e.message).toString().substring(0, 300)); }
  const m = out.match(/([0-9a-f]{200,})\s*$/m) || out.match(/Bytecode:\s*([0-9a-f]+)/i) || out.match(/([0-9a-f]{100,})/);
  if (!m) throw new Error('no bytecode in output: ' + out.substring(0, 400));
  const bytecodeHex = m[1].trim();
  const scriptPublicKey = 'aa20' + Buffer.from(blake2b(Buffer.from(bytecodeHex, 'hex'), { dkLen: 32 })).toString('hex') + '87';
  console.log(`✅ Compiled: ${bytecodeHex.length / 2} bytes | P2SH: ${scriptPublicKey}`);
  return { bytecodeHex, scriptPublicKey };
}
