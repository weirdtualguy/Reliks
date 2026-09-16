import { execFileSync } from 'child_process';
import { blake2b } from '@noble/hashes/blake2b';
import * as os from 'os';
import * as path from 'path';

const SILVERSCRIPT_ROOT = path.join(os.homedir(), 'opt', 'silverscript');
const CLI_DEBUGGER_PATH = path.join(SILVERSCRIPT_ROOT, 'target', 'release', 'cli-debugger');
const CONTRACT_PATH = path.join(SILVERSCRIPT_ROOT, 'contracts', 'NftInstance.sil');

export interface NftInstanceCtorArgs {
    collectionId: string;
    tokenId: number;
    artPayload: string;
    initOwner: string;
    initScheme: number;
}

export interface CompiledNft {
    bytecodeHex: string;
    scriptPublicKey: string;
}

export function compileNftInstance(args: NftInstanceCtorArgs): CompiledNft {
    const ctorArgs = [
        args.collectionId,
        String(args.tokenId),
        args.artPayload,
        args.initOwner,
        String(args.initScheme),
    ];

    const cliArgs = [
        CONTRACT_PATH,
        '--emit-bytecode',
        ...ctorArgs.flatMap(a => ['--ctor-arg', a]),
    ];

    let bytecodeHex: string;
    try {
        bytecodeHex = execFileSync(CLI_DEBUGGER_PATH, cliArgs, { encoding: 'utf8' }).trim();
    } catch (err: any) {
        const stderr = err?.stderr?.toString?.() ?? '';
        throw new Error(`cli-debugger compile failed: ${stderr || err.message}`);
    }

    if (!bytecodeHex || !/^[0-9a-fA-F]+$/.test(bytecodeHex)) {
        throw new Error(`cli-debugger returned non-hex output: '${bytecodeHex}'`);
    }

    const scriptBytes = Uint8Array.from(Buffer.from(bytecodeHex, 'hex'));
    const scriptHash = blake2b(scriptBytes, { dkLen: 32 });
    const hashHex = Buffer.from(scriptHash).toString('hex');

    const scriptPublicKey = `aa20${hashHex}87`;

    return { bytecodeHex, scriptPublicKey };
}

if (require.main === module) {
    const result = compileNftInstance({
        collectionId: '0x0000000000000000000000000000000000000000000000000000000000000001',
        tokenId: 1,
        artPayload: '0x' + '00'.repeat(568),
        initOwner: '0x0000000000000000000000000000000000000000000000000000000000000002',
        initScheme: 0,
    });
    console.log('Bytecode:', result.bytecodeHex);
    console.log('ScriptPublicKey:', result.scriptPublicKey);
}
