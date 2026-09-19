import { describe, it, expect } from 'vitest';
import {
  decodeAlgorandAddress,
  encodeAlgorandAddress,
  isValidAlgorandAddress,
  encodeReceiptNoteField,
  decodeReceiptNoteField,
  buildAlgorandChallenge,
  verifyAlgorandReceiptAgainstChallenge,
  verifyAlgorandStateProofCommitment,
  AlgorandSettlementAdapter,
  ALGORAND_MAINNET_GENESIS_HASH,
  ALGORAND_TESTNET_GENESIS_HASH,
  ALGORAND_ASSETS,
  RECEIPT_NOTE_PREFIX,
  settleViaGoPlausible,
  type AlgorandTransactionReceipt,
  type AlgorandStateProofCommitment,
} from '../src/index.js';

describe('Algorand Settlement Adapter — L1 Clearing & Note Anchor Battery', () => {
  // 32-byte zero key with valid checksum
  const zeroPk = Buffer.alloc(32, 0);
  const sampleAddress = encodeAlgorandAddress(zeroPk);

  it('correctly decodes and validates 58-character Algorand addresses with checksum', () => {
    expect(sampleAddress).toHaveLength(58);
    expect(isValidAlgorandAddress(sampleAddress)).toBe(true);

    const decoded = decodeAlgorandAddress(sampleAddress);
    expect(decoded.valid).toBe(true);
    expect(decoded.publicKey).toEqual(zeroPk);
  });

  it('rejects corrupted or forged Algorand addresses', () => {
    // Modify one character (checksum violation)
    const corrupted = sampleAddress.slice(0, 57) + (sampleAddress[57] === 'A' ? 'B' : 'A');
    expect(isValidAlgorandAddress(corrupted)).toBe(false);

    // Wrong length
    expect(isValidAlgorandAddress(sampleAddress.slice(0, 50))).toBe(false);

    // Invalid base32 chars (e.g. 8 or 9)
    const invalidCharAddress = '8'.repeat(58);
    expect(isValidAlgorandAddress(invalidCharAddress)).toBe(false);
  });

  it('encodes and decodes receipt anchor digests in transaction note fields', () => {
    const anchorRoot = '4f8a91b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e';
    const { noteBase64, notePlaintext } = encodeReceiptNoteField(anchorRoot);

    expect(notePlaintext).toBe(`${RECEIPT_NOTE_PREFIX}${anchorRoot}`);

    const decoded = decodeReceiptNoteField(noteBase64);
    expect(decoded.valid).toBe(true);
    expect(decoded.receiptDigest).toBe(anchorRoot);
  });

  it('rejects malformed or non-compliant note fields', () => {
    // Non-prefix string
    const bogusBase64 = Buffer.from('hello world', 'utf-8').toString('base64');
    expect(decodeReceiptNoteField(bogusBase64).valid).toBe(false);

    // Bad hash length
    const shortDigestBase64 = Buffer.from(`${RECEIPT_NOTE_PREFIX}deadbeef`, 'utf-8').toString('base64');
    expect(decodeReceiptNoteField(shortDigestBase64).valid).toBe(false);
  });

  describe('Challenge & Settlement Verification', () => {
    const receiptDigest = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const startRound = 40_000_000;
    const requiredAmount = 5_000_000n; // 5 ALGO (microAlgos)

    it('successfully creates and verifies a native ALGO settlement challenge', () => {
      const adapter = new AlgorandSettlementAdapter(sampleAddress, 'algorand-mainnet');
      const challenge = adapter.createChallenge({
        challengeId: 'algo-chal-001',
        requiredAsset: 'ALGO',
        amountMicroUnits: requiredAmount,
        receiptAnchorDigest: receiptDigest,
        currentRound: startRound,
        roundValidityWindow: 30, // Expires at round 40_000_030
      });

      expect(challenge.genesisHash).toBe(ALGORAND_MAINNET_GENESIS_HASH);
      expect(challenge.expiresAtRound).toBe(startRound + 30);
      expect(challenge.challengeDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

      const { noteBase64 } = encodeReceiptNoteField(receiptDigest);

      const validReceipt: AlgorandTransactionReceipt = {
        txId: 'TX1234567890ALGO',
        senderAddress: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        receiverAddress: sampleAddress,
        amountMicroUnits: requiredAmount,
        assetId: undefined, // Native ALGO
        confirmedRound: startRound + 5,
        roundTimestamp: 1788665000,
        noteFieldBase64: noteBase64,
        genesisHash: ALGORAND_MAINNET_GENESIS_HASH,
        feeMicroAlgos: 1000, // standard 0.001 ALGO
      };

      const result = adapter.verifySettlement(challenge, validReceipt, startRound + 5);
      expect(result.valid).toBe(true);
    });

    it('successfully creates and verifies a USDCa (ASA) settlement challenge', () => {
      const adapter = new AlgorandSettlementAdapter(sampleAddress, 'algorand-mainnet');
      const usdcAmount = 10_000_000n; // 10 USDCa (6 decimals)
      const challenge = adapter.createChallenge({
        challengeId: 'usdca-chal-001',
        requiredAsset: 'USDCa',
        amountMicroUnits: usdcAmount,
        receiptAnchorDigest: receiptDigest,
        currentRound: startRound,
      });

      expect(challenge.assetId).toBe(ALGORAND_ASSETS.MAINNET_USDCA);

      const { noteBase64 } = encodeReceiptNoteField(receiptDigest);

      const validReceipt: AlgorandTransactionReceipt = {
        txId: 'TX9876543210USDCA',
        senderAddress: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        receiverAddress: sampleAddress,
        amountMicroUnits: usdcAmount,
        assetId: ALGORAND_ASSETS.MAINNET_USDCA,
        confirmedRound: startRound + 2,
        roundTimestamp: 1788665010,
        noteFieldBase64: noteBase64,
        genesisHash: ALGORAND_MAINNET_GENESIS_HASH,
        feeMicroAlgos: 1000,
      };

      const result = adapter.verifySettlement(challenge, validReceipt, startRound + 2);
      expect(result.valid).toBe(true);
    });

    it('rejects settlements with mismatched ASA ID (e.g. native ALGO sent instead of USDCa)', () => {
      const adapter = new AlgorandSettlementAdapter(sampleAddress, 'algorand-mainnet');
      const challenge = adapter.createChallenge({
        challengeId: 'usdca-chal-002',
        requiredAsset: 'USDCa',
        amountMicroUnits: 10_000_000n,
        receiptAnchorDigest: receiptDigest,
        currentRound: startRound,
      });

      const { noteBase64 } = encodeReceiptNoteField(receiptDigest);

      const receiptWrongAsset: AlgorandTransactionReceipt = {
        txId: 'TX_WRONG_ASSET',
        senderAddress: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        receiverAddress: sampleAddress,
        amountMicroUnits: 10_000_000n,
        assetId: undefined, // Sent ALGO instead of USDCa ASA
        confirmedRound: startRound + 2,
        roundTimestamp: 1788665010,
        noteFieldBase64: noteBase64,
        genesisHash: ALGORAND_MAINNET_GENESIS_HASH,
        feeMicroAlgos: 1000,
      };

      const result = adapter.verifySettlement(challenge, receiptWrongAsset, startRound + 2);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('ASSET_MISMATCH');
    });

    it('rejects settlements with insufficient amount', () => {
      const adapter = new AlgorandSettlementAdapter(sampleAddress, 'algorand-mainnet');
      const challenge = adapter.createChallenge({
        challengeId: 'algo-chal-003',
        requiredAsset: 'ALGO',
        amountMicroUnits: 10_000_000n,
        receiptAnchorDigest: receiptDigest,
        currentRound: startRound,
      });

      const { noteBase64 } = encodeReceiptNoteField(receiptDigest);

      const shortReceipt: AlgorandTransactionReceipt = {
        txId: 'TX_SHORT',
        senderAddress: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        receiverAddress: sampleAddress,
        amountMicroUnits: 9_999_999n, // 1 micro-algo short
        assetId: undefined,
        confirmedRound: startRound + 1,
        roundTimestamp: 1788665005,
        noteFieldBase64: noteBase64,
        genesisHash: ALGORAND_MAINNET_GENESIS_HASH,
        feeMicroAlgos: 1000,
      };

      const result = adapter.verifySettlement(challenge, shortReceipt, startRound + 1);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INSUFFICIENT_AMOUNT');
    });

    it('rejects settlements on wrong network or genesis hash', () => {
      const adapter = new AlgorandSettlementAdapter(sampleAddress, 'algorand-mainnet');
      const challenge = adapter.createChallenge({
        challengeId: 'algo-chal-004',
        requiredAsset: 'ALGO',
        amountMicroUnits: 1_000_000n,
        receiptAnchorDigest: receiptDigest,
        currentRound: startRound,
      });

      const { noteBase64 } = encodeReceiptNoteField(receiptDigest);

      const testnetReceipt: AlgorandTransactionReceipt = {
        txId: 'TX_TESTNET',
        senderAddress: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        receiverAddress: sampleAddress,
        amountMicroUnits: 1_000_000n,
        assetId: undefined,
        confirmedRound: startRound + 1,
        roundTimestamp: 1788665005,
        noteFieldBase64: noteBase64,
        genesisHash: ALGORAND_TESTNET_GENESIS_HASH, // Testnet tx presented for Mainnet challenge
        feeMicroAlgos: 1000,
      };

      const result = adapter.verifySettlement(challenge, testnetReceipt, startRound + 1);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('GENESIS_HASH_MISMATCH');
    });

    it('rejects expired settlements based on round height', () => {
      const adapter = new AlgorandSettlementAdapter(sampleAddress, 'algorand-mainnet');
      const challenge = adapter.createChallenge({
        challengeId: 'algo-chal-005',
        requiredAsset: 'ALGO',
        amountMicroUnits: 1_000_000n,
        receiptAnchorDigest: receiptDigest,
        currentRound: startRound,
        roundValidityWindow: 10, // Expires at startRound + 10
      });

      const { noteBase64 } = encodeReceiptNoteField(receiptDigest);

      const lateReceipt: AlgorandTransactionReceipt = {
        txId: 'TX_LATE',
        senderAddress: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        receiverAddress: sampleAddress,
        amountMicroUnits: 1_000_000n,
        assetId: undefined,
        confirmedRound: startRound + 11, // Confirmed after round deadline
        roundTimestamp: 1788665050,
        noteFieldBase64: noteBase64,
        genesisHash: ALGORAND_MAINNET_GENESIS_HASH,
        feeMicroAlgos: 1000,
      };

      const result = adapter.verifySettlement(challenge, lateReceipt, startRound + 11);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('CHALLENGE_EXPIRED_ROUND');
    });

    it('rejects settlements with mismatched receipt anchor note field', () => {
      const adapter = new AlgorandSettlementAdapter(sampleAddress, 'algorand-mainnet');
      const challenge = adapter.createChallenge({
        challengeId: 'algo-chal-006',
        requiredAsset: 'ALGO',
        amountMicroUnits: 1_000_000n,
        receiptAnchorDigest: receiptDigest,
        currentRound: startRound,
      });

      // Different root hash in note field
      const wrongRoot = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      const { noteBase64 } = encodeReceiptNoteField(wrongRoot);

      const wrongNoteReceipt: AlgorandTransactionReceipt = {
        txId: 'TX_WRONG_NOTE',
        senderAddress: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        receiverAddress: sampleAddress,
        amountMicroUnits: 1_000_000n,
        assetId: undefined,
        confirmedRound: startRound + 2,
        roundTimestamp: 1788665010,
        noteFieldBase64: noteBase64,
        genesisHash: ALGORAND_MAINNET_GENESIS_HASH,
        feeMicroAlgos: 1000,
      };

      const result = adapter.verifySettlement(challenge, wrongNoteReceipt, startRound + 2);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('NOTE_ANCHOR_MISMATCH');
    });
  });

  describe('Algorand State Proof (ASP) Falcon Consensus Hook', () => {
    const validRoot = '0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';

    it('verifies consensus-attested Falcon-ASP state proof commitment', () => {
      const commitment: AlgorandStateProofCommitment = {
        proofType: 'Falcon-ASP-v1',
        rootRound: 40_000_100,
        stateRootHash: validRoot,
        votersParticipationRoot: '0xabc123...',
        falconSignatureCount: 384,
        verified: true,
      };

      const result = verifyAlgorandStateProofCommitment(commitment, validRoot);
      expect(result.valid).toBe(true);
    });

    it('rejects ASP commitments with unverified signatures or insufficient quorum', () => {
      const unverifiedCommitment: AlgorandStateProofCommitment = {
        proofType: 'Falcon-ASP-v1',
        rootRound: 40_000_100,
        stateRootHash: validRoot,
        votersParticipationRoot: '0xabc123...',
        falconSignatureCount: 384,
        verified: false,
      };

      expect(verifyAlgorandStateProofCommitment(unverifiedCommitment, validRoot).valid).toBe(false);

      const lowQuorumCommitment: AlgorandStateProofCommitment = {
        ...unverifiedCommitment,
        verified: true,
        falconSignatureCount: 120, // Below minimum 256
      };

      expect(verifyAlgorandStateProofCommitment(lowQuorumCommitment, validRoot).valid).toBe(false);
    });
  });

  describe('Global Challenge Requirements & Facilitator Proxy', () => {
    it('creates compliant x402 V2 challenge requirements with Bazaar discovery and challenge tag', () => {
      const adapter = new AlgorandSettlementAdapter(sampleAddress, 'algorand-mainnet');
      const reqs = adapter.createGlobalChallengeRequirements({
        priceUsd: '$0.005',
        description: 'Attested AI Agent Verification Oracle',
        inputExample: { query: 'test' },
        outputExample: { verified: true },
      });

      expect(reqs.scheme).toBe('exact');
      expect(reqs.network).toBe('algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=');
      expect(reqs.price).toBe('$0.005');
      expect(reqs.payTo).toBe(sampleAddress);
      expect(reqs.extra.asset).toBe(31566704);
      expect(reqs.extra.tag).toBe('x402-global-challenge');
      expect(reqs.extra.feePayer).toBe('ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA');
      expect(reqs.extensions.bazaar.info.description).toBe('Attested AI Agent Verification Oracle');
    });

    it('settles payments through GoPlausible facilitator proxy with injected fetch', async () => {
      const mockFetch = async () => {
        return new Response(JSON.stringify({ txId: 'TX12345', settled: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await settleViaGoPlausible({
        paymentPayload: { signedTx: 'base64...' },
        paymentRequirements: { price: '$0.01' },
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(res.success).toBe(true);
      expect((res.data as Record<string, unknown>).txId).toBe('TX12345');
    });
  });
});

