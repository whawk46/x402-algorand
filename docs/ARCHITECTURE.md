# Architecture & Protocol Specification

## 1. Executive Summary

`@ashlar-blue/x402-algorand` bridges the IETF RFC x402 HTTP micropayment protocol with the Algorand Virtual Machine (AVM) consensus engine. It enables automated software agents, microservices, and resource paywalls to conduct cryptographic Delivery-versus-Payment (DvP) settlements with sub-3-second finality.

---

## 2. Protocol Flow: The 5-Step Settlement Cycle

```
[ HTTP Client / AI Agent ]          [ Resource Server / Gateway ]          [ GoPlausible Facilitator / Algorand L1 ]
          |                                       |                                                |
          | ----- 1. GET /v1/data --------------> |                                                |
          |                                       |                                                |
          | <---- 2. HTTP 402 Payment Required -- |                                                |
          |       (Challenge Payload)             |                                                |
          |                                       |                                                |
          | ----- 3. Sign & Submit TxGroup ------------------------------------------------------> |
          |          (Sponsored Fee + Asset Transfer)                                              |
          |                                                                                        |
          | <---- 4. Settlement Receipt / TxID --------------------------------------------------- |
          |          (Anchored in Round #65179852)                                                 |
          |                                       |                                                |
          | ----- 5. GET /v1/data + Receipt ----> |                                                |
          |                                       | (Verifies On-Chain Anchor & Round Window)      |
          | <---- 6. HTTP 200 OK + Resource ----- |                                                |
```

### Step 1: Resource Request
The client requests a protected endpoint without payment headers.

### Step 2: HTTP 402 Challenge Generation
The server responds with `402 Payment Required` and a standard x402 payload:
```json
{
  "x402Version": 2,
  "accepts": [
    {
      "network": "algorand-mainnet",
      "asset": "31566704",
      "amount": "10000",
      "recipient": "7X62YXQK2UTT7RY6IA2DMAJBPEA57C2MAZ6TGHXIF23E6Z6K5WQS5SNP64",
      "facilitator": "https://facilitator.goplausible.xyz",
      "extra": {
        "tag": "x402-global-challenge"
      }
    }
  ]
}
```

### Step 3: Atomic DvP Transaction Group
Algorand consensus supports **Atomic Transaction Groups** (up to 16 transactions grouped via a joint transaction group hash `grp`).

The settlement adapter uses fee-pooling:
1. **Tx 0 (Fee-Payer Payment)**: A 0-ALGO or fee-sponsorship transaction executed by the GoPlausible facilitator or gateway.
2. **Tx 1 (Asset Transfer)**: The client's signed transfer of Circle USDCa (`31566704`) to the resource server recipient.
3. **Note Field Anchoring**: Tx 1 commits the 32-byte cryptographic hash of the requested resource into its note field:
   `x402:receipt:v1:<sha256_digest>`

### Step 4: Consensus Settlement & Verification
Because Algorand consensus operates on Pure Proof-of-Stake with single-round finality, the transaction is finalized upon block proposal (~2.8 seconds). No waiting for confirmation blocks or probabilistic reorg protection.

---

## 3. Security & Invariants

1. **Zero Reorg Guarantee**: Unlike EVM chains or Solana, Algorand blocks cannot fork or reorg under honest majority.
2. **Deterministic Expiration**: Challenges are bound to a specific round validity window (e.g. `currentRound + 20`), preventing replay attacks.
3. **Hermetic Cryptography**: Zero dependencies on third-party bloat. Standard Node.js `node:crypto` executes all SHA-512/256 hashing and RFC 4648 Base32 decoding.
