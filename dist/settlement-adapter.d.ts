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
export declare const ALGORAND_MAINNET_GENESIS_HASH = "wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=";
export declare const ALGORAND_TESTNET_GENESIS_HASH = "SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=";
export declare const ALGORAND_MAINNET_CAIP2 = "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=";
export declare const ALGORAND_TESTNET_CAIP2 = "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=";
export declare const GOPLAUSIBLE_FACILITATOR_URL = "https://facilitator.goplausible.xyz";
export declare const GOPLAUSIBLE_FEE_PAYER = "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA";
export declare const GLOBAL_CHALLENGE_TAG = "x402-global-challenge";
export declare const ALGORAND_ASSETS: {
    readonly MAINNET_USDCA: 31566704;
    readonly TESTNET_USDCA: 10458941;
    readonly ALGO_DECIMALS: 6;
    readonly USDCA_DECIMALS: 6;
};
export declare const RECEIPT_NOTE_PREFIX = "x402:receipt:v1:";
export interface AlgorandSettlementChallenge {
    protocol: 'x402.algorand/v0';
    challengeId: string;
    network: 'algorand-mainnet' | 'algorand-testnet' | 'algorand-betanet';
    genesisHash: string;
    recipientAddress: string;
    requiredAsset: 'ALGO' | 'USDCa';
    assetId?: number;
    amountMicroUnits: bigint;
    receiptAnchorDigest: string;
    notePrefix: string;
    expiresAtRound: number;
    challengeDigest: string;
}
export interface AlgorandTransactionReceipt {
    txId: string;
    senderAddress: string;
    receiverAddress: string;
    amountMicroUnits: bigint;
    assetId?: number;
    confirmedRound: number;
    roundTimestamp: number;
    noteFieldBase64?: string;
    groupId?: string;
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
    errorCode?: 'CHALLENGE_EXPIRED_ROUND' | 'GENESIS_HASH_MISMATCH' | 'RECIPIENT_MISMATCH' | 'ASSET_MISMATCH' | 'INSUFFICIENT_AMOUNT' | 'NOTE_ANCHOR_MISMATCH' | 'MALFORMED_NOTE_FIELD' | 'INVALID_ADDRESS_CHECKSUM';
    error?: string;
}
/**
 * Decodes standard Algorand 58-character public address into a 32-byte public key buffer,
 * verifying the 4-byte checksum.
 */
export declare function decodeAlgorandAddress(address: string): {
    publicKey: Buffer;
    valid: boolean;
};
/**
 * Encodes a 32-byte public key buffer into a valid 58-character Algorand address.
 */
export declare function encodeAlgorandAddress(publicKey: Buffer): string;
/**
 * Validates that an address string is syntactically and cryptographically valid.
 */
export declare function isValidAlgorandAddress(address: string): boolean;
/**
 * Encodes a receipt digest root into an Algorand transaction note field.
 * Format: `x402:receipt:v1:<sha256Digest>`
 */
export declare function encodeReceiptNoteField(digestHex: string): {
    noteBase64: string;
    notePlaintext: string;
};
/**
 * Decodes and verifies a receipt note field from an Algorand transaction.
 */
export declare function decodeReceiptNoteField(noteBase64: string): {
    valid: boolean;
    receiptDigest?: string;
};
/**
 * Builds an Algorand x402 settlement challenge.
 */
export declare function buildAlgorandChallenge(params: {
    challengeId: string;
    network: 'algorand-mainnet' | 'algorand-testnet' | 'algorand-betanet';
    recipientAddress: string;
    requiredAsset: 'ALGO' | 'USDCa';
    amountMicroUnits: bigint;
    receiptAnchorDigest: string;
    currentRound: number;
    roundValidityWindow?: number;
}): AlgorandSettlementChallenge;
/**
 * Validates an on-chain Algorand transaction receipt against a settlement challenge.
 */
export declare function verifyAlgorandReceiptAgainstChallenge(challenge: AlgorandSettlementChallenge, receipt: AlgorandTransactionReceipt, currentRound: number): VerificationResult;
/**
 * Algorand State Proof (ASP) Post-Quantum Falcon Verifier Hook.
 * Validates that an attested block round is backed by Falcon-1024 / ASP consensus.
 */
export declare function verifyAlgorandStateProofCommitment(commitment: AlgorandStateProofCommitment, expectedRootHash: string): {
    valid: boolean;
    error?: string;
};
/**
 * High-level Algorand Settlement Adapter clearing engine.
 */
export declare class AlgorandSettlementAdapter {
    readonly network: 'algorand-mainnet' | 'algorand-testnet' | 'algorand-betanet';
    readonly recipientAddress: string;
    constructor(recipientAddress: string, network?: 'algorand-mainnet' | 'algorand-testnet' | 'algorand-betanet');
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
    }): AlgorandSettlementChallenge;
    /**
     * Verifies an incoming payment receipt.
     */
    verifySettlement(challenge: AlgorandSettlementChallenge, receipt: AlgorandTransactionReceipt, currentRound: number): VerificationResult;
    /**
     * Builds official x402 V2 Payment Requirements for the Algorand Global Challenge,
     * including Bazaar discovery metadata and required challenge tags.
     */
    createGlobalChallengeRequirements(params: {
        priceUsd?: string;
        description: string;
        inputExample?: Record<string, unknown>;
        outputExample?: Record<string, unknown>;
    }): {
        scheme: "exact";
        network: string;
        price: string;
        payTo: string;
        extra: {
            asset: 31566704 | 10458941;
            tag: string;
            feePayer: string;
        };
        extensions: {
            bazaar: {
                info: {
                    description: string;
                    input: Record<string, unknown>;
                    output: Record<string, unknown>;
                };
            };
        };
    };
    /**
     * Proxies a signed settlement payload to the GoPlausible facilitator.
     */
    settleViaFacilitator(params: {
        paymentPayload: unknown;
        paymentRequirements: unknown;
        facilitatorUrl?: string;
        fetchFn?: typeof fetch;
    }): Promise<{
        success: boolean;
        data?: unknown;
        error?: string;
    }>;
}
/**
 * Proxies payment payload and requirements to the official GoPlausible facilitator for settlement.
 */
export declare function settleViaGoPlausible(params: {
    paymentPayload: unknown;
    paymentRequirements: unknown;
    facilitatorUrl?: string;
    fetchFn?: typeof fetch;
}): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
}>;
//# sourceMappingURL=settlement-adapter.d.ts.map