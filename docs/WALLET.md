# Wallet integration

Reliks connects to the [Kaspire](https://kaspire.kaslab.space) wallet. The site never receives a private key: Kaspire shows its own review of the exact transaction and signs inside the wallet.

## Transports

| | Kaspire Extension | Kaspire Mobile |
|---|---|---|
| Mechanism | injected `window.kaspire` (`requestAccounts`, `getNetwork`, `getPublicKey`, `signPskt`, `pushTx`) | WalletConnect v2 on `kaspa:mainnet` (`kaspa_getAccounts`, `kaspa_getPublicKey`, `kaspa_signPskt`) |
| Third-party code | none | `@walletconnect/sign-client@2.13.0` from a pinned esm.sh URL, loaded **only** after the visitor picks this option |
| Broadcast | Kaspire `pushTx` | not available through public REST for covenant transactions (compute budget is dropped); paste your own wRPC node in the mint review |
| Reconnect | silent on reload (never opens an approval window) | WalletConnect session restore |

Source: `web/kaspire.js`. Protocol references: kaspire.kaslab.space/developers and /developers/extension.

## Mint handshake

1. `resolveLane` rebuilds the live lane state from kascov and REST data and requires it to recompute to the on-chain script. Any mismatch disables minting.
2. `buildMint` creates the transaction: input 0 is the factory lane (script already complete), input 1 is one confirmed output from the wallet. Outputs: successor lane, edition (1 KAS carrier, covenant-bound), artist payment, change.
3. The transaction is handed to Kaspire as SafeJSON with `signInputs: [{ index: 1, sighashType: 1 }]`. Input 0 is never touched.
4. `verifySigned` requires the returned transaction to match the draft: same version, input outpoints, factory signature script, output values, output scripts and covenant bindings, and a standard 65-byte Schnorr signature on the wallet input.
5. Only then is it broadcast. If nothing can broadcast it, the signed transaction is returned to the user rather than discarded.

The wallet's own public key is checked against the connected address before anything is built.

## Known limits & pre-announcement live gate (F-03)

- Tested against mocks that follow Kaspire's published API (`test/wallet-test.js`, `test/kaspire-mass-test.js`). **The first real-wallet mint through the browser extension has not been run yet.** Before announcing a public mintable series, run one live mint through the Kaspire Extension on a fresh lane with a low-value wallet:
  1. Deploy a fresh lane (e.g. v13 Reliks-VM genesis with `engine_lang = 2`, after passing `node cli/reliks-lens-vm.js`), add its anchor to `data/mainnet-anchors.json`, and run `npm run site`.
  2. Connect a low-value Kaspire Extension wallet on `docs/index.html`, click **Mint**, inspect Kaspire's PSKT covenant review window, approve, and verify that `verifySigned` and `pushTx` succeed and the transaction confirms on chain.
  3. Record the confirmed transaction ID and date here in `docs/WALLET.md` and generate the updated provenance bundle (`npm run bundle`).
- The SafeJSON field names for covenant metadata follow the rusty-kaspa v1 transaction layout. If Kaspire rejects the payload, the review step's "Transaction details" shows exactly what was sent.
- The mainnet v12 genesis series is sold out, so there is currently nothing to mint on mainnet from the site until the next series lane is deployed.
- No public mainnet wRPC endpoints are pinned on purpose (see `docs/AUDIT-SUMMARY.md` and `docs/ENGINEERING-NOTES.md`).
