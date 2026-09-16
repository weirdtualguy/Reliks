const fs = require('fs');
let c = fs.readFileSync('src/mint-final.ts', 'utf8');

// Swap the order of the two states in the columnar arrays: [cont, child] instead of [child, cont]
c = c.split("sb.data(Buffer.concat([i64le(0), i64le(100000000)]));")
     .join("sb.data(Buffer.concat([i64le(100000000), i64le(0)])); // price: [cont, child]");
c = c.split("sb.data(Buffer.concat([i64le(0), i64le(1)]));")
     .join("sb.data(Buffer.concat([i64le(1), i64le(0)])); // counter: [cont, child]");
c = c.split("sb.data(Buffer.from([1, 0]));")
     .join("sb.data(Buffer.from([0, 1])); // role: [cont, child]");

fs.writeFileSync('src/mint-final.ts', c);
console.log('✅ swapped state order in columnar arrays: [cont, child]');
