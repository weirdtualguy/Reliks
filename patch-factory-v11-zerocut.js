const fs = require('fs');
const p = 'sil/SeriesFactory-v11.sil';
let s = fs.readFileSync(p, 'utf8');
const old = `        if (price > 0) {
            int artistCut = price - MINT_FEE;
            byte[36] artistSpk = new ScriptPubKeyP2PK(pubkey(artist));
            byte[36] treasurySpk = new ScriptPubKeyP2PK(pubkey(treasury));
            require(artistOutIdx != platformOutIdx);
            require(tx.outputs[artistOutIdx].value == artistCut);
            require(tx.outputs[artistOutIdx].scriptPubKey == byte[](artistSpk));
            require(tx.outputs[platformOutIdx].value == MINT_FEE);
            require(tx.outputs[platformOutIdx].scriptPubKey == byte[](treasurySpk));
        }`;
const neu = `        if (price > 0) {
            int artistCut = price - MINT_FEE;
            byte[36] artistSpk = new ScriptPubKeyP2PK(pubkey(artist));
            byte[36] treasurySpk = new ScriptPubKeyP2PK(pubkey(treasury));
            require(tx.outputs[platformOutIdx].value == MINT_FEE);
            require(tx.outputs[platformOutIdx].scriptPubKey == byte[](treasurySpk));
            if (artistCut > 0) {
                require(artistOutIdx != platformOutIdx);
                require(tx.outputs[artistOutIdx].value == artistCut);
                require(tx.outputs[artistOutIdx].scriptPubKey == byte[](artistSpk));
            }
        }`;
if (!s.includes(old)) { console.error('mint branch anchor not found'); process.exit(1); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log('patched SeriesFactory-v11: zero artistCut no longer demands a dust output');
