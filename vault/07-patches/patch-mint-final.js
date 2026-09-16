const fs = require('fs');
let c = fs.readFileSync('src/mint-edition.ts', 'utf8');

// Fix push order: buyer args FIRST (deepest), then states, then TAG+program
// Current: sb.fields(contFields); sb.fields(childFields); sb.int(2n); sb.int(cb[0]); sb.data(Buffer.from([0])); sb.data(Buffer.from(USER, 'hex')); sb.data(Buffer.from(tagHex, 'hex')); sb.data(progBuf);
// Fixed:   sb.data(Buffer.from(USER, 'hex')); sb.data(Buffer.from([0])); sb.int(cb[0]); sb.fields(childFields); sb.fields(contFields); sb.data(Buffer.from(tagHex, 'hex')); sb.data(progBuf);
c = c.split("sb.fields(contFields); sb.fields(childFields); sb.int(2n); sb.int(cb[0]); sb.data(Buffer.from([0])); sb.data(Buffer.from(USER, 'hex')); sb.data(Buffer.from(tagHex, 'hex')); sb.data(progBuf);")
     .join("sb.data(Buffer.from(USER, 'hex')); sb.data(Buffer.from([0])); sb.int(cb[0]); sb.fields(childFields); sb.fields(contFields); sb.data(Buffer.from(tagHex, 'hex')); sb.data(progBuf);");

fs.writeFileSync('src/mint-edition.ts', c);
console.log('✅ sigscript order: buyerArgs → childFields → contFields → TAG → program');
