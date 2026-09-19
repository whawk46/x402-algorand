# @ashlar-blue/x402-algorand

> **Production HTTP 402 Machine-to-Machine (M2M) Clearing & Settlement SDK for Algorand Consensus V2**  
> *Zero Dependencies · Sub-3s Deterministic Finality · Native ASA & Fee Pooling · Post-Quantum Falcon ASP Ready*

---

## ⚡ Overview

`@ashlar-blue/x402-algorand` is an enterprise-grade TypeScript settlement adapter designed for autonomous AI agents, non-interactive sub-processes, and high-concurrency API paywalls operating under the **HTTP 402 Payment Required** standard.

While traditional networks (Ethereum, Base, Solana) suffer from multi-block reorg risk, gas volatility, and upfront float liabilities, **Algorand Consensus V2** provides the ideal foundation for automated machine commerce:
1. **Instant Deterministic Finality (~2.8s)**: Pure Proof-of-Stake guarantees zero chain forks or reorgs. Once confirmed, payment is final.
2. **Native Fee Pooling**: Sponsor accounts cover transaction fees in atomic groups. Automated worker agents require **zero native ALGO balance** to execute.
3. **Native ASA Clearing**: Native micro-metering in Circle USDC (`USDCa` Asset ID: `31566704`) or `ALGO` with 6-decimal precision.
4. **Cryptographic Receipt Anchoring**: Commits 32-byte hash roots directly into Algorand's 1KB transaction note field (`x402:receipt:v1:<sha256>`), establishing an immutable audit trail on L1.
5. **Zero External Dependencies**: Built entirely on native Node.js cryptographic primitives (`node:crypto` with SHA-512/256 and RFC 4648 Base32).

---

---

## 🎬 3-Minute Executive Video Walkthrough

Watch the architectural walkthrough, 16-txn atomic DvP breakdown, and confirmed MainNet settlement:
- **Direct Video Stream (MP4)**: [Ashlar-Blue-Algorand-Executive-Demo.mp4](https://raw.githubusercontent.com/whawk46/x402-algorand/main/assets/Ashlar-Blue-Algorand-Executive-Demo.mp4)
- **Confirmed MainNet Settlement**: [`TZEJXAJH7TQ3XLESNR2QGJR3Z7ODWU3NB4N3IHAJ3Y7M6A5NWKRA`](https://explorer.perawallet.app/tx/TZEJXAJH7TQ3XLESNR2QGJR3Z7ODWU3NB4N3IHAJ3Y7M6A5NWKRA) (Round #65179852, 0.01 USDCa via GoPlausible Facilitator)
- **Electric Capital Indexing**: [PR #3002 (open-dev-data)](https://github.com/electric-capital/open-dev-data/pull/3002)

---

## 📦 Installation

```bash
npm install @ashlar-blue/x402-algorand
```

*(Requirements: Node.js >= 20.0.0. Zero runtime dependencies.)*

---

## 🚀 5-Minute Quickstart

### 1. Server Side: Issue an HTTP 402 Challenge & Verify Settlement

Protect an API route with sub-3-second on-chain verification:

```typescript
import {
  AlgorandSettlementAdapter,
  type AlgorandSettlementChallenge,
  type AlgorandTransactionReceipt,
} from '@ashlar-blue/x402-algorand';

// Initialize adapter with your server treasury address
const settlement = new AlgorandSettlementAdapter(
  'AEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEA5RCDXMI',
  'algorand-mainnet'
);

// 1. Issue an HTTP 402 Challenge for an unpaid request
const challenge = settlement.createChallenge({
  challengeId: 'req_8849204',
  requiredAsset: 'USDCa',          // Native USDCa ASA or 'ALGO'
  amountMicroUnits: 50_000n,       // 0.05 USDCa ($0.05)
  receiptAnchorDigest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  currentRound: 40_500_120,
  roundValidityWindow: 20,         // Valid for ~20 rounds (~56 seconds)
});

// 2. Verify an incoming transaction receipt presented by the client
const verdict = settlement.verifySettlement(challenge, receipt, currentRound);

if (verdict.valid) {
  console.log('✅ Payment confirmed on Algorand L1! Delivering API resource.');
} else {
  console.error(`❌ Verification failed: [${verdict.errorCode}] ${verdict.error}`);
}
```

---

### 2. Client Side: Autonomous AI Agent Settlement

How an agent catches an HTTP 402 challenge, signs on Algorand, and retries:

```typescript
import { encodeReceiptNoteField } from '@ashlar-blue/x402-algorand';

// 1. Agent receives HTTP 402 response containing challenge parameters
const { receiptAnchorDigest, recipientAddress, amountMicroUnits } = challenge;

// 2. Encode the receipt anchor into the Algorand transaction note field
const { noteBase64, notePlaintext } = encodeReceiptNoteField(receiptAnchorDigest);
// notePlaintext => "x402:receipt:v1:e3b0c442..."

// 3. Broadcast payment using standard Algorand SDK or native signer
// 4. Attach confirmed receipt to the request header and retry
```

---

## 🏛️ Architecture & Mechanics

```
┌────────────────────────────────────────────────────────────────────────┐
│                        HTTP 402 CLIENT (AI AGENT)                      │
│                                                                        │
│  1. GET /v1/resource ───────────────────────────────────────────────┐  │
│  4. GET /v1/resource + Header: X-402-Receipt: <base64> ──────────┐  │  │
└──────────────────────────────────────────────────────────────────┼──┼──┘
                                                                   │  │
                                    HTTP 402 Challenge Issued (2)  │  │ HTTP 200 (5)
                                                                   ▼  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        HTTP 402 RESOURCE SERVER                        │
│                                                                        │
│  - Generates unique challenge digest binding recipient + amount        │
│  - Sets roundValidityWindow (~20 rounds / ~56s)                        │
│  - Verifies receipt note anchor matches challenge receiptAnchorDigest  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   │ 3. Instant Settlement (~2.8s)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    ALGORAND LAYER-1 CONSENSUS V2                       │
│                                                                        │
│  - Deterministic finality in ~2.8s (Zero Reorg Risk)                   │
│  - Native Fee Pooling: sponsor pays 0.001 ALGO for worker key          │
│  - Native ASA Transfer: Asset ID 31566704 (USDCa)                      │
│  - Note Field Anchor: b"x402:receipt:v1:<sha256>"                      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Benchmark Comparison: Algorand vs Other L1/L2s for x402

| Metric | Algorand Consensus V2 | Base / Arbitrum (Rollups) | Solana |
| :--- | :--- | :--- | :--- |
| **Finality Time** | **~2.8s (Immediate L1)** | 12s soft / 7 days hard | ~0.4s slot / 12s root |
| **Reorganization Risk** | **0% (Mathematically impossible)** | High (Soft-forks / sequencer reorgs) | Medium (Fork switching) |
| **Worker Key Funding** | **$0.00 (Native Fee Pooling)** | Must pre-fund gas on every key | Must pre-fund SOL rent |
| **Native Audit Field** | **1,024 bytes (Transaction Note)** | 0 bytes (requires calldata event) | 0 bytes (requires SPL memo) |
| **Long-Term Consensus** | **Falcon-1024 State Proofs (ASP)** | ECDSA (Quantum-vulnerable) | Ed25519 (Quantum-vulnerable) |

---

## 🧪 Testing & Verification

Run the hermetic test suite (15 automated test vectors covering RFC Base32 address decoding, SHA-512/256 checksum verification, note-field anchoring, GoPlausible facilitator proxying, round height expiration, and Falcon ASP consensus hooks):

```bash
npm test
```

Build dual CommonJS/ESM distribution files and TypeScript declarations:

```bash
npm run build
```

---

## 🛡️ License & Institutional Governance

Authored and maintained by **Corrente Labs, Inc.** (`contact@correntelabs.com`), a Delaware Corporation.  
Distributed under the **MIT License**.
