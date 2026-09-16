const fs = require('fs');
let c = fs.readFileSync('src/mint-edition.ts', 'utf8');
// Sigscript: [buyerId, buyerScheme, payIdx, tag, program, new_states[0] (8 fields), new_states[1] (8 fields)]
// But the dispatcher pops tag first, so: [buyerId, buyerScheme, payIdx, tag, program, child_slot, child_artist, child_price, child_cap, child_role, child_counter, child_owner, child_type, cont_slot, cont_artist, cont_price, cont_cap, cont_role, cont_counter, cont_owner, cont_type]
// That's 5 buyer args + tag + program + 16 state fields = 23 pushes. Let's simplify: tag crack will tell us the exact layout.
c = c.split("sb.data(Buffer.from(USER, 'hex')); sb.data(Buffer.from([0])); sb.int(cb[0]); sb.data(Buffer.from(tagHex, 'hex')); sb.data(progBuf);")
     .join("sb.data(Buffer.from(USER, 'hex')); sb.data(Buffer.from([0])); sb.int(cb[0]); sb.data(Buffer.from(tagHex, 'hex')); sb.data(progBuf); sb.pushStateFields(childFields); sb.pushStateFields(contFields);");
c = c.split('const COMBOS: bigint[][] = [[2n], [3n]];').join('const COMBOS: bigint[][] = [[2n], [3n]]; const childFields = [S.slotHex, USER, 0, 64, 1, 0, USER, 0]; const contFields = [S.slotHex, USER, 100000000, 64, 0, 1, USER, 0];');
// Add pushStateFields method to SB class
c = c.split('  hex() { return this.p.toString(\'hex\'); } }')
     .join('  pushStateFields(fields: any[]) { for (const f of fields) { if (typeof f === \'string\') this.data(Buffer.from(f.replace(/^0x/, \'\'), \'hex\')); else this.int(BigInt(f)); } }\n  hex() { return this.p.toString(\'hex\'); } }');
fs.writeFileSync('src/mint-edition.ts', c);
console.log('✅ mint-edition sigscript → caller pushes 2 new_states');
