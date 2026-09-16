const fs = require('fs');
let c = fs.readFileSync('src/mint-edition.ts', 'utf8');

// Fix the sigscript push order: states first (deepest), then arrayLen, then buyer args, then tag, then program
c = c.split("sb.data(Buffer.from(USER, 'hex')); sb.data(Buffer.from([0])); sb.int(cb[0]); sb.data(Buffer.from(tagHex, 'hex')); sb.data(progBuf); sb.pushStateFields(childFields); sb.pushStateFields(contFields);")
     .join("sb.pushStateFields(contFields); sb.pushStateFields(childFields); sb.int(2n); sb.int(cb[0]); sb.data(Buffer.from([0])); sb.data(Buffer.from(USER, 'hex')); sb.data(Buffer.from(tagHex, 'hex')); sb.data(progBuf);");

fs.writeFileSync('src/mint-edition.ts', c);
console.log('✅ sigscript order: states → arrayLen → buyerArgs → tag → program');
