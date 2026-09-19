# MainNet Settlement & Verification Proof

## On-Chain Settlement Verification

This document records the cryptographic and consensus verification details for the live Algorand MainNet settlement executed by `@ashlar-blue/x402-algorand` via the GoPlausible Facilitator.

---

## 1. Settlement Summary

- **Network**: `algorand-mainnet`
- **Confirmed Round (Block)**: `65179852`
- **Timestamp**: `2026-09-19T02:32:53Z`
- **Transaction ID**: [`TZEJXAJH7TQ3XLESNR2QGJR3Z7ODWU3NB4N3IHAJ3Y7M6A5NWKRA`](https://explorer.perawallet.app/tx/TZEJXAJH7TQ3XLESNR2QGJR3Z7ODWU3NB4N3IHAJ3Y7M6A5NWKRA)
- **Asset**: Circle USDCa (ASA ID: `31566704`)
- **Amount**: `10,000` microUnits (`$0.01` USDC)
- **Sender**: `7X62YXQK2UTT7RY6IA2DMAJBPEA57C2MAZ6TGHXIF23E6Z6K5WQS5SNP64`
- **Recipient**: `ZMFK2OI7N3C5I54BVRVAYCGS3Y3KRNUX776C56J2RNL4X24W23YJ2L5RAA` (GoPlausible Facilitator Vault)
- **Facilitator Sponsor Fee**: `0` microAlgos charged to client (sponsored via Fee-Pooling)
- **L1 Note Field**: `x402-payment-v2-1789785173651`

---

## 2. Block Explorers & Public Verification

Verify directly on Algorand block explorers:
- **Pera Wallet Explorer**:  
  https://explorer.perawallet.app/tx/TZEJXAJH7TQ3XLESNR2QGJR3Z7ODWU3NB4N3IHAJ3Y7M6A5NWKRA
- **AlgoScan**:  
  https://algoscan.app/tx/TZEJXAJH7TQ3XLESNR2QGJR3Z7ODWU3NB4N3IHAJ3Y7M6A5NWKRA

---

## 3. Electric Capital Indexing

- **Repository**: `https://github.com/whawk46/x402-algorand`
- **Pull Request**: [electric-capital/open-dev-data PR #3002](https://github.com/electric-capital/open-dev-data/pull/3002)
- **Migration Fingerprint**: `migrations/2026-09-19T022039_add_ashlar_x402_algorand.json`
