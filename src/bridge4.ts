import { execSync } from 'child_process';
import { blake2b } from '@noble/hashes/blake2b';
import * as path from 'path';
import * as os from 'os';

const CLI = process.env.SILVERC_CLI || path.join(os.homedir(), 'opt/silverscript/target/release/cli-debugger');
const CONTRACTS_DIR = path.join(os.homedir(), 'opt/silverscript/contracts');

export interface Bridge4Args {
  contractName: string; // e.g. 'Marketplace.sil' or 'RoyaltyPool.sil'
  ctorArgs: (string | number | bigint)[];
}

export function compileAny(args: Bridge4Args): { bytecodeHex: string; scriptPublicKey: string } {
  const SIL = path.join(CONTRACTS_DIR, args.contractName);
  const hx = (s: string) => (typeof s === 'string' && s.startsWith('0x') ? s : '0x' + s);
  
  const raw = args.ctorArgs.map(v => {
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'number') return v.toString();
    return hx(v);
  });
  
  const cmd = `${CLI} ${SIL} ` + raw.map(v => `--ctor-arg ${v}`).join(' ') + ` --emit-bytecode`;
  
  let out = '';
  try {
    out = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e: any) {
    throw new Error('cli-debugger failed: ' + (e.stderr || e.message).toString().substring(0, 500));
  }
  
  // Match the hex bytecode output from cli-debugger
  const m = out.match(/([0-9a-f]{40,})\s*$/m) || out.match(/Bytecode:\s*([0-9a-f]+)/i);
  if (!m) throw new Error('no bytecode in output: ' + out.substring(0, 400));
  
  const bytecodeHex = m[1].trim();
  const scriptPublicKey = 'aa20' + Buffer.from(blake2b(Buffer.from(bytecodeHex, 'hex'), { dkLen: 32 })).toString('hex') + '87';
  
  console.log(`✅ Compiled ${args.contractName}: ${bytecodeHex.length / 2} bytes | P2SH: ${scriptPublicKey}`);
  return { bytecodeHex, scriptPublicKey };
}
