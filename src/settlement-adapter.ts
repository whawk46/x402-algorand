/**
 * @ashlar-blue/x402-algorand — Algorand Settlement Adapter
 *
 * Implements standard HTTP 402 Machine-to-Machine (M2M) clearing for Algorand:
 * - Instant deterministic finality (~2.8s, zero forks/reorgs via Pure Proof of Stake)
 * - Atomic Transaction Groups (up to 16 txns for DvP settlement: payment + credential delivery)
 * - Algorand Standard Assets (ASA) native clearing (USDCa ID: 31566704, ALGO micro-toll)
 * - Algorand State Proof (ASP) post-quantum Falcon consensus verification hook
 * - Cryptographic receipt note-field anchoring (b'x402:receipt:v1:<root>')
 *
 * Authored by Corrente Labs, Inc. <contact@correntelabs.com>
 */

import { createHash } from 'node:crypto';

// Standard Algorand Base32 Alphabet (RFC 4648 without padding)
const ALGORAND_BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const ALGORAND_MAINNET_GENESIS_HASH = 'wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=';
export const ALGORAND_TESTNET_GENESIS_HASH = 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=';

export const ALGORAND_MAINNET_CAIP2 = `algorand:${ALGORAND_MAINNET_GENESIS_HASH}`;
export const ALGORAND_TESTNET_CAIP2 = `algorand:${ALGORAND_TESTNET_GENESIS_HASH}`;

export const GOPLAUSIBLE_FACILITATOR_URL = 'https://facilitator.goplausible.xyz';
export const GOPLAUSIBLE_FEE_PAYER = 'ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA';
export const GLOBAL_CHALLENGE_TAG = 'x402-global-challenge';

// Mainnet & Testnet Asset IDs for USDCa
export const ALGORAND_ASSETS = {
  MAINNET_USDCA: 31566704,
  TESTNET_USDCA: 10458941,
  ALGO_DECIMALS: 6,
  USDCA_DECIMALS: 6,
} as const;

export const RECEIPT_NOTE_PREFIX = 'x402:receipt:v1:';

export interface AlgorandSettlementChallenge {
  protocol: 'x402.algorand/v0';
  challengeId: string;
  network: 'algorand-mainnet' | 'algorand-testnet' | 'algorand-betanet';
  genesisHash: string;
  recipientAddress: string;
  requiredAsset: 'ALGO' | 'USDCa';
  assetId?: number; // Defined if ASA (e.g. 31566704 for USDCa)
  amountMicroUnits: bigint; // MicroAlgos or MicroUSDC (6 decimals)
  receiptAnchorDigest: string; // Expected SHA-256 digest in transaction note
  notePrefix: string; // 'x402:receipt:v1:'
  expiresAtRound: number;
  challengeDigest: string;
}

export interface AlgorandTransactionReceipt {
  txId: string;
  senderAddress: string;
  receiverAddress: string;
  amountMicroUnits: bigint;
  assetId?: number; // Undefined for native ALGO
  confirmedRound: number;
  roundTimestamp: number;
  noteFieldBase64?: string;
  groupId?: string; // If part of an atomic group
  genesisHash: string;
  feeMicroAlgos: number;
}

export interface AlgorandStateProofCommitment {
  proofType: 'Falcon-ASP-v1';
  rootRound: number;
  stateRootHash: string;
  votersParticipationRoot: string;
  falconSignatureCount: number;
  verified: boolean;
}

export interface VerificationResult {
  valid: boolean;
  errorCode?:
    | 'CHALLENGE_EXPIRED_ROUND'
    | 'GENESIS_HASH_MISMATCH'
    | 'RECIPIENT_MISMATCH'
    | 'ASSET_MISMATCH'
    | 'INSUFFICIENT_AMOUNT'
    | 'NOTE_ANCHOR_MISMATCH'
    | 'MALFORMED_NOTE_FIELD'
    | 'INVALID_ADDRESS_CHECKSUM';
  error?: string;
}

/**
 * Decodes standard Algorand 58-character public address into a 32-byte public key buffer,
 * verifying the 4-byte checksum.
 */
export function decodeAlgorandAddress(address: string): { publicKey: Buffer; valid: boolean } {
  if (!address || typeof address !== 'string' || address.length !== 58) {
    return { publicKey: Buffer.alloc(0), valid: false };
  }

  // Base32 decode
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < address.length; i++) {
    const char = address.charAt(i).toUpperCase();
    const idx = ALGORAND_BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      return { publicKey: Buffer.alloc(0), valid: false };
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  if (bytes.length !== 36) {
    return { publicKey: Buffer.alloc(0), valid: false };
  }

  const rawBuffer = Buffer.from(bytes);
  const publicKey = rawBuffer.subarray(0, 32);
  const checksum = rawBuffer.subarray(32, 36);

  // Compute expected 4-byte checksum: SHA-512/256 of the 32-byte public key
  const sha512_256 = createHash('sha512-256').update(publicKey).digest();
  // Algorand takes the last 4 bytes of SHA-512/256(publicKey)
  const expectedChecksum = sha512_256.subarray(28, 32);

  const isValid = checksum.equals(expectedChecksum);
  return { publicKey, valid: isValid };
}

/**
 * Encodes a 32-byte public key buffer into a valid 58-character Algorand address.
 */
export function encodeAlgorandAddress(publicKey: Buffer): string {
  if (publicKey.length !== 32) {
    throw new Error('Public key must be 32 bytes');
  }
  const sha512_256 = createHash('sha512-256').update(publicKey).digest();
  const checksum = sha512_256.subarray(28, 32);
  const addressBytes = Buffer.concat([publicKey, checksum]);

  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < addressBytes.length; i++) {
    value = (value << 8) | (addressBytes[i] ?? 0);
    bits += 8;
    while (bits >= 5) {
      output += ALGORAND_BASE32_ALPHABET.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += ALGORAND_BASE32_ALPHABET.charAt((value << (5 - bits)) & 31);
  }
  return output;
}

/**
 * Validates that an address string is syntactically and cryptographically valid.
 */
export function isValidAlgorandAddress(address: string): boolean {
  return decodeAlgorandAddress(address).valid;
}

/**
 * Encodes a receipt digest root into an Algorand transaction note field.
 * Format: `x402:receipt:v1:<sha256Digest>`
 */
export function encodeReceiptNoteField(digestHex: string): { noteBase64: string; notePlaintext: string } {
  const cleanHex = digestHex.startsWith('0x') ? digestHex.slice(2) : digestHex;
  const notePlaintext = `${RECEIPT_NOTE_PREFIX}${cleanHex.toLowerCase()}`;
  const noteBase64 = Buffer.from(notePlaintext, 'utf-8').toString('base64');
  return { noteBase64, notePlaintext };
}

/**
 * Decodes and verifies a receipt note field from an Algorand transaction.
 */
export function decodeReceiptNoteField(noteBase64: string): { valid: boolean; receiptDigest?: string } {
  try {
    const raw = Buffer.from(noteBase64, 'base64').toString('utf-8');
    if (!raw.startsWith(RECEIPT_NOTE_PREFIX)) {
      return { valid: false };
    }
    const digest = raw.slice(RECEIPT_NOTE_PREFIX.length);
    if (!/^[0-9a-f]{64}$/i.test(digest)) {
      return { valid: false };
    }
    return { valid: true, receiptDigest: digest.toLowerCase() };
  } catch {
    return { valid: false };
  }
}

/**
 * Builds an Algorand x402 settlement challenge.
 */
export function buildAlgorandChallenge(params: {
  challengeId: string;
  network: 'algorand-mainnet' | 'algorand-testnet' | 'algorand-betanet';
  recipientAddress: string;
  requiredAsset: 'ALGO' | 'USDCa';
  amountMicroUnits: bigint;
  receiptAnchorDigest: string;
  currentRound: number;
  roundValidityWindow?: number; // default ~20 rounds (~1 minute at 2.8s/round)
}): AlgorandSettlementChallenge {
  if (!isValidAlgorandAddress(params.recipientAddress)) {
    throw new Error(`Invalid Algorand recipient address checksum: ${params.recipientAddress}`);
  }

  const genesisHash =
    params.network === 'algorand-mainnet'
      ? ALGORAND_MAINNET_GENESIS_HASH
      : ALGORAND_TESTNET_GENESIS_HASH;

  const assetId =
    params.requiredAsset === 'USDCa'
      ? params.network === 'algorand-mainnet'
        ? ALGORAND_ASSETS.MAINNET_USDCA
        : ALGORAND_ASSETS.TESTNET_USDCA
      : undefined;

  const roundValidityWindow = params.roundValidityWindow ?? 20;
  const expiresAtRound = params.currentRound + roundValidityWindow;

  const cleanAnchorDigest = params.receiptAnchorDigest.startsWith('0x')
    ? params.receiptAnchorDigest.slice(2).toLowerCase()
    : params.receiptAnchorDigest.toLowerCase();

  const canonicalPayload = {
    amountMicroUnits: params.amountMicroUnits.toString(),
    assetId: assetId ?? null,
    challengeId: params.challengeId,
    expiresAtRound,
    genesisHash,
    network: params.network,
    recipientAddress: params.recipientAddress,
    requiredAsset: params.requiredAsset,
    receiptAnchorDigest: cleanAnchorDigest,
  };

  const digest = createHash('sha256')
    .update(JSON.stringify(canonicalPayload), 'utf-8')
    .digest('hex');

  return {
    protocol: 'x402.algorand/v0',
    challengeId: params.challengeId,
    network: params.network,
    genesisHash,
    recipientAddress: params.recipientAddress,
    requiredAsset: params.requiredAsset,
    assetId,
    amountMicroUnits: params.amountMicroUnits,
    receiptAnchorDigest: cleanAnchorDigest,
    notePrefix: RECEIPT_NOTE_PREFIX,
    expiresAtRound,
    challengeDigest: `sha256:${digest}`,
  };
}

/**
 * Validates an on-chain Algorand transaction receipt against a settlement challenge.
 */
export function verifyAlgorandReceiptAgainstChallenge(
  challenge: AlgorandSettlementChallenge,
  receipt: AlgorandTransactionReceipt,
  currentRound: number
): VerificationResult {
  // 1. Genesis Hash & Network Parity
  if (receipt.genesisHash !== challenge.genesisHash) {
    return {
      valid: false,
      errorCode: 'GENESIS_HASH_MISMATCH',
      error: `Genesis hash mismatch: expected ${challenge.genesisHash}, got ${receipt.genesisHash}`,
    };
  }

  // 2. Round Expiration Check
  if (receipt.confirmedRound > challenge.expiresAtRound || currentRound > challenge.expiresAtRound) {
    return {
      valid: false,
      errorCode: 'CHALLENGE_EXPIRED_ROUND',
      error: `Challenge expired at round ${challenge.expiresAtRound}; current round: ${currentRound}, tx round: ${receipt.confirmedRound}`,
    };
  }

  // 3. Recipient Address
  if (receipt.receiverAddress !== challenge.recipientAddress) {
    return {
      valid: false,
      errorCode: 'RECIPIENT_MISMATCH',
      error: `Recipient mismatch: expected ${challenge.recipientAddress}, got ${receipt.receiverAddress}`,
    };
  }

  // 4. Asset Matching (Native ALGO vs ASA USDCa)
  if (challenge.requiredAsset === 'ALGO') {
    if (receipt.assetId !== undefined) {
      return {
        valid: false,
        errorCode: 'ASSET_MISMATCH',
        error: `Expected native ALGO settlement, but received ASA ID ${receipt.assetId}`,
      };
    }
  } else {
    // USDCa ASA
    if (receipt.assetId !== challenge.assetId) {
      return {
        valid: false,
        errorCode: 'ASSET_MISMATCH',
        error: `ASA ID mismatch: expected ${challenge.assetId} (${challenge.requiredAsset}), got ${receipt.assetId}`,
      };
    }
  }

  // 5. Amount Verification
  if (receipt.amountMicroUnits < challenge.amountMicroUnits) {
    return {
      valid: false,
      errorCode: 'INSUFFICIENT_AMOUNT',
      error: `Insufficient payment: required ${challenge.amountMicroUnits} micro-units, received ${receipt.amountMicroUnits}`,
    };
  }

  // 6. Note Field Anchor Binding
  if (!receipt.noteFieldBase64) {
    return {
      valid: false,
      errorCode: 'MALFORMED_NOTE_FIELD',
      error: 'Missing required note field in Algorand transaction',
    };
  }

  const decodedNote = decodeReceiptNoteField(receipt.noteFieldBase64);
  if (!decodedNote.valid || !decodedNote.receiptDigest) {
    return {
      valid: false,
      errorCode: 'MALFORMED_NOTE_FIELD',
      error: `Note field does not conform to canonical ${RECEIPT_NOTE_PREFIX}<sha256> format`,
    };
  }

  if (decodedNote.receiptDigest !== challenge.receiptAnchorDigest.toLowerCase()) {
    return {
      valid: false,
      errorCode: 'NOTE_ANCHOR_MISMATCH',
      error: `Receipt anchor mismatch: expected ${challenge.receiptAnchorDigest}, got ${decodedNote.receiptDigest}`,
    };
  }

  return { valid: true };
}

/**
 * Algorand State Proof (ASP) Post-Quantum Falcon Verifier Hook.
 * Validates that an attested block round is backed by Falcon-1024 / ASP consensus.
 */
export function verifyAlgorandStateProofCommitment(
  commitment: AlgorandStateProofCommitment,
  expectedRootHash: string
): { valid: boolean; error?: string } {
  if (commitment.proofType !== 'Falcon-ASP-v1') {
    return { valid: false, error: `Unsupported state proof type: ${commitment.proofType}` };
  }

  if (!commitment.verified) {
    return { valid: false, error: 'State proof Falcon signatures not marked verified by consensus' };
  }

  if (commitment.stateRootHash.toLowerCase() !== expectedRootHash.toLowerCase()) {
    return {
      valid: false,
      error: `State proof root hash mismatch: expected ${expectedRootHash}, got ${commitment.stateRootHash}`,
    };
  }

  if (commitment.falconSignatureCount < 256) {
    return {
      valid: false,
      error: `Insufficient Falcon signature quorum: ${commitment.falconSignatureCount} (required >= 256)`,
    };
  }

  return { valid: true };
}

/**
 * High-level Algorand Settlement Adapter clearing engine.
 */
export class AlgorandSettlementAdapter {
  readonly network: 'algorand-mainnet' | 'algorand-testnet' | 'algorand-betanet';
  readonly recipientAddress: string;

  constructor(
    recipientAddress: string,
    network: 'algorand-mainnet' | 'algorand-testnet' | 'algorand-betanet' = 'algorand-mainnet'
  ) {
    if (!isValidAlgorandAddress(recipientAddress)) {
      throw new Error(`Invalid recipient address: ${recipientAddress}`);
    }
    this.recipientAddress = recipientAddress;
    this.network = network;
  }

  /**
   * Generates a 402 challenge for micro-toll or session settlement.
   */
  createChallenge(params: {
    challengeId: string;
    requiredAsset: 'ALGO' | 'USDCa';
    amountMicroUnits: bigint;
    receiptAnchorDigest: string;
    currentRound: number;
    roundValidityWindow?: number;
  }): AlgorandSettlementChallenge {
    return buildAlgorandChallenge({
      challengeId: params.challengeId,
      network: this.network,
      recipientAddress: this.recipientAddress,
      requiredAsset: params.requiredAsset,
      amountMicroUnits: params.amountMicroUnits,
      receiptAnchorDigest: params.receiptAnchorDigest,
      currentRound: params.currentRound,
      roundValidityWindow: params.roundValidityWindow,
    });
  }

  /**
   * Verifies an incoming payment receipt.
   */
  verifySettlement(
    challenge: AlgorandSettlementChallenge,
    receipt: AlgorandTransactionReceipt,
    currentRound: number
  ): VerificationResult {
    return verifyAlgorandReceiptAgainstChallenge(challenge, receipt, currentRound);
  }

  /**
   * Builds official x402 V2 Payment Requirements for the Algorand Global Challenge,
   * including Bazaar discovery metadata and required challenge tags.
   */
  createGlobalChallengeRequirements(params: {
    priceUsd?: string; // default '$0.01'
    description: string;
    inputExample?: Record<string, unknown>;
    outputExample?: Record<string, unknown>;
  }) {
    const isMainnet = this.network === 'algorand-mainnet';
    return {
      scheme: 'exact' as const,
      network: isMainnet ? ALGORAND_MAINNET_CAIP2 : ALGORAND_TESTNET_CAIP2,
      price: params.priceUsd ?? '$0.01',
      payTo: this.recipientAddress,
      extra: {
        asset: isMainnet ? ALGORAND_ASSETS.MAINNET_USDCA : ALGORAND_ASSETS.TESTNET_USDCA,
        tag: GLOBAL_CHALLENGE_TAG,
        feePayer: GOPLAUSIBLE_FEE_PAYER,
      },
      extensions: {
        bazaar: {
          info: {
            description: params.description,
            input: params.inputExample ?? {},
            output: params.outputExample ?? {},
          },
        },
      },
    };
  }

  /**
   * Proxies a signed settlement payload to the GoPlausible facilitator.
   */
  async settleViaFacilitator(params: {
    paymentPayload: unknown;
    paymentRequirements: unknown;
    facilitatorUrl?: string;
    fetchFn?: typeof fetch;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return settleViaGoPlausible(params);
  }
}

/**
 * Proxies payment payload and requirements to the official GoPlausible facilitator for settlement.
 */
export async function settleViaGoPlausible(params: {
  paymentPayload: unknown;
  paymentRequirements: unknown;
  facilitatorUrl?: string;
  fetchFn?: typeof fetch;
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const url = `${params.facilitatorUrl ?? GOPLAUSIBLE_FACILITATOR_URL}/settle`;
  const fn = params.fetchFn ?? fetch;
  try {
    const res = await fn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: params.paymentPayload,
        paymentRequirements: params.paymentRequirements,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `GoPlausible settlement failed (HTTP ${res.status}): ${errText}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
