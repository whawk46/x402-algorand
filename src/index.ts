/**
 * @ashlar-blue/x402-algorand
 * Production HTTP 402 Machine-to-Machine (M2M) Clearing & Settlement SDK for Algorand Consensus V2.
 *
 * Authored by Corrente Labs, Inc. <contact@correntelabs.com>
 * Dual MIT License. Zero Dependencies.
 */

export {
  // Main Engine
  AlgorandSettlementAdapter,

  // Address utilities
  decodeAlgorandAddress,
  encodeAlgorandAddress,
  isValidAlgorandAddress,

  // Note-field receipt anchoring
  encodeReceiptNoteField,
  decodeReceiptNoteField,
  RECEIPT_NOTE_PREFIX,

  // Challenge & Verification
  buildAlgorandChallenge,
  verifyAlgorandReceiptAgainstChallenge,
  verifyAlgorandStateProofCommitment,

  // Constants & Identifiers
  ALGORAND_MAINNET_GENESIS_HASH,
  ALGORAND_TESTNET_GENESIS_HASH,
  ALGORAND_MAINNET_CAIP2,
  ALGORAND_TESTNET_CAIP2,
  GOPLAUSIBLE_FACILITATOR_URL,
  GOPLAUSIBLE_FEE_PAYER,
  GLOBAL_CHALLENGE_TAG,
  ALGORAND_ASSETS,

  // Facilitator Settlement Helper
  settleViaGoPlausible,

  // Types
  type AlgorandSettlementChallenge,
  type AlgorandTransactionReceipt,
  type AlgorandStateProofCommitment,
  type VerificationResult,
} from './settlement-adapter.js';
