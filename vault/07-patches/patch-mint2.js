const fs = require('fs');
let c = fs.readFileSync('src/mint-edition.ts', 'utf8');
c = c.split("sb.data(Buffer.from(USER, 'hex')); sb.data(Buffer.from([0])); sb.int(cb[0]); sb.int(cb[1]); sb.int(cb[2]); sb.data(Buffer.from(tagHex, 'hex')); sb.data(progBuf);")
     .join("sb.data(Buffer.from(USER, 'hex')); sb.data(Buffer.from([0])); sb.int(cb[0]); sb.data(Buffer.from(tagHex, 'hex')); sb.data(progBuf);");
c = c.split('const COMBOS: bigint[][] = [[2n, 0n, 1n], [3n, 1n, 2n]];').join('const COMBOS: bigint[][] = [[2n], [3n]];');
fs.writeFileSync('src/mint-edition.ts', c);
console.log('✅ mint-edition sigscript → 3 args (buyerId, scheme, payIdx)');
