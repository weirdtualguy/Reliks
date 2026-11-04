// F-01 Hardening: No hardcoded demo keys.
// Mainnet execution requires explicit key injection via environment.
const PRIV = process.env.PC_PRIV;
if (!PRIV) {
  console.error('FATAL: PC_PRIV environment variable is not set.');
  console.error('Refusing to sign transactions without an explicit key.');
  console.error('Usage: export PC_PRIV=<64-hex-chars> or create a secrets.env file.');
  process.exit(1);
}
if (!/^[0-9a-fA-F]{64}$/.test(PRIV)) {
  console.error('FATAL: PC_PRIV must be exactly 64 hexadecimal characters.');
  process.exit(1);
}
module.exports = { PRIV };
