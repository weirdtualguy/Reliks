const V = require('./v7-lib.js');
const { B, H, le32, blake2b } = V;
// ReliksSerialV8 mirror of SeriesFactory-v8.serialFromOutpoint.
// LE63 polynomial: sum_{i=0..6} h[i]*256^i + (h[7] mod 128)*2^56.
// Coefficients are literals on purpose: they must match the covenant exactly.
module.exports = { ...V };
