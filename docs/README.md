# Reliks (formerly Pixel-Cove)
A trustless, on-chain generative art and NFT platform built on Kaspa Toccata.

## Covenant Stack
- **SeriesFactory-v8**: Parallel-lane minting engine. Enforces 1% protocol fee on primary mints.
- **Edition-v4**: NFT state machine. Enforces 5% artist royalty + 1% protocol fee on secondary sales.
- **OfferEscrow-v2**: Trustless offer/accept escrow. Enforces 3-way split (owner/artist/platform) on acceptance.

## Economics (All-In Pricing)
- **Primary Mint:** Buyer pays `P`. Artist receives `P - 1%`. Platform receives `1%`.
- **Secondary Sales:** Buyer pays `P`. Seller receives `P - 6%`. Artist receives `5%`. Platform receives `1%`.
- **Custody Transfers:** Fee-free and royalty-free. (Documented limitation: off-chain consideration evades on-chain cuts).

## Security & Hardening
- F-01 to F-07 Pre-mainnet audit closed (Key hardening, CDN vendoring, Network abstraction, Confirmation margins, Fee loops, Confirmation gates).
