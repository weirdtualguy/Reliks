# Known limitations

Properties of the canonical contracts that integrators and collectors should know. The contract hashes are pinned, so none of these can change without a new template set and redeploy.

## Royalties apply to covenant-priced resales only
`buy`, `sell` and `OfferEscrow.accept` pay the artist at least 5%. `transfer` (owner-signed free handover) and `spend` (leaves the covenant) are royalty-free by design, so an off-chain OTC sale paid outside the contract skips the royalty. Marketplaces should route sales through `buy`/`sell`/`accept` and should not describe royalties as enforced on every change of ownership.

## Patina can be rerolled by the holder
`lineage` advances with every ownership change and includes the new owner key; patina is derived from 6 bits of `blake2b("ReliksPatinaV2" || lineage)`. A holder can self-transfer to freshly generated keys until a preferred patina (1 of 64) appears. Wear (`sales`) cannot be rerolled because it only advances on royalty-paying sales. Treat patina as a holder-selectable variation, not provenance-guaranteed randomness.

## Serials are predictable
Serials come from the lane's `next_serial` counter, so the artwork for the next mint is known before it is minted. This removes the grindable outpoint-hash serials of earlier versions; Kaspa script has no randomness beacon.

## OfferEscrow
- **Surplus is unconstrained.** `accept` requires the escrow input to hold at least `askPrice`, and the outputs pay exactly `askPrice`. Whatever the escrow holds above `askPrice` can be redirected by the transaction builder (the seller). The standalone accept needs that margin to pay the network fee, so fund an offer with `askPrice` plus the expected fee and nothing more.
- **Expired offers can still be accepted.** `silverc 0.1.0` cannot express an upper bound on age (finding M3). Until the offerer calls `cancel`, or anyone calls `expire` after `expireAge`, the owner can still accept. Interfaces should show an offer's age and expiry state.
- **`cancel` pins no output.** The offerer signs, so a careless builder can omit the refund output and burn the funds. Builders must always include it.

## Forked series
`SeriesFactory.fork` splits a lane in two. The browser and the marketplace indexer follow plain mint chains and the left lane only: forked lanes are flagged (`laneError` in `marketplace-index.json`) and mints from the right lane are not discovered. Use the CLI for forked series, or avoid forking.

## Edition covenant binding
The factory does not assert on-chain that a minted edition output is bound to a KIP-20 covenant id. Indexers and the verifier enforce this (finding M4); do not trust an edition output that has not been verified that way.
