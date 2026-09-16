import { blake3 } from '@noble/hashes/blake3';

export class SigScriptBuilder {
    private payload: Buffer = Buffer.alloc(0);
    pushData(data: Buffer | Uint8Array) {
        const buf = Buffer.from(data);
        const len = buf.length;
        if (len === 0) {
            this.payload = Buffer.concat([this.payload, Buffer.from([0x00])]);
        } else if (len <= 75) {
            this.payload = Buffer.concat([this.payload, Buffer.from([len]), buf]);
        } else if (len <= 255) {
            this.payload = Buffer.concat([this.payload, Buffer.from([0x4c, len]), buf]);
        } else if (len <= 65535) {
            const lenBuf = Buffer.alloc(2); lenBuf.writeUInt16LE(len, 0);
            this.payload = Buffer.concat([this.payload, Buffer.from([0x4d]), lenBuf, buf]);
        } else {
            const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32LE(len, 0);
            this.payload = Buffer.concat([this.payload, Buffer.from([0x4e]), lenBuf, buf]);
        }
    }
    pushInt(value: bigint | number) {
        let v = BigInt(value);
        if (v === 0n) { this.payload = Buffer.concat([this.payload, Buffer.from([0x00])]); return; }
        if (v >= 1n && v <= 16n) { this.payload = Buffer.concat([this.payload, Buffer.from([0x50 + Number(v)])]); return; }
        if (v === -1n) { this.payload = Buffer.concat([this.payload, Buffer.from([0x4f])]); return; }
        const absV = v < 0n ? -v : v;
        let hex = absV.toString(16);
        if (hex.length % 2 !== 0) hex = '0' + hex;
        const bytes = Buffer.from(hex, 'hex').reverse();
        let result: Buffer;
        if (bytes[bytes.length - 1] & 0x80) {
            result = Buffer.alloc(bytes.length + 1); bytes.copy(result);
            if (v < 0n) result[result.length - 1] = 0x80;
        } else {
            result = Buffer.from(bytes);
            if (v < 0n) result[result.length - 1] |= 0x80;
        }
        this.pushData(result);
    }
    getScript(): Buffer { return this.payload; }
}

export function getDispatchTag(entryName: string, signatureTypes: string[]): Uint8Array {
    const signature = `${entryName}(${signatureTypes.join(',')})`;
    const hash = blake3(signature);
    return hash.slice(0, 4);
}

export function buildSellSigScript(
    ownerSigHex: string,
    buyerIdentifierHex: string,
    buyerSchemeHex: string,
    priceSompi: bigint,
    paymentOutIdx: number,
    contractBytecodeHex: string
): string {
    const builder = new SigScriptBuilder();
    builder.pushData(Buffer.from(ownerSigHex, 'hex'));
    builder.pushData(Buffer.from(buyerIdentifierHex, 'hex'));
    builder.pushData(Buffer.from(buyerSchemeHex, 'hex'));
    builder.pushInt(priceSompi);
    builder.pushInt(BigInt(paymentOutIdx));
    const tag = getDispatchTag('__covenant_entrypoint_auth_sell', ['sig', 'byte[32]', 'byte', 'int', 'int']); // DECL.md default
    builder.pushData(Buffer.from(tag));
    builder.pushData(Buffer.from(contractBytecodeHex, 'hex'));
    return builder.getScript().toString('hex');
}
