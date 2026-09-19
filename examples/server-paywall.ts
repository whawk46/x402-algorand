/**
 * Example: Algorand x402 Server Paywall
 *
 * Demonstrates an HTTP API endpoint protected by an Algorand x402 settlement gate.
 * When an unauthenticated or unpaid request arrives, the server issues an HTTP 402
 * challenge with exact ALGO or USDCa settlement requirements and a receipt anchor.
 */

import {
  AlgorandSettlementAdapter,
  type AlgorandTransactionReceipt,
  type AlgorandSettlementChallenge,
} from '../src/index.js';

// Server recipient address on Algorand (valid 58-char Base32 address with SHA-512/256 checksum)
const API_TREASURY_ADDRESS = 'AEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEA5RCDXMI';

// Initialize settlement adapter for Algorand Mainnet (or Testnet)
const settlement = new AlgorandSettlementAdapter(API_TREASURY_ADDRESS, 'algorand-mainnet');

// In-memory challenge store (in production: Redis / KV store)
const activeChallenges = new Map<string, AlgorandSettlementChallenge>();

/**
 * Handle incoming API request
 */
export async function handleApiRequest(req: {
  headers: Record<string, string | undefined>;
  path: string;
}) {
  const authReceiptHeader = req.headers['x-402-receipt'];

  // Case 1: No payment receipt attached — Issue HTTP 402 challenge
  if (!authReceiptHeader) {
    const challengeId = `chal_${Date.now()}`;
    const currentRound = 40_500_120; // In production: fetch from algodClient.status()

    // Create 0.05 USDCa or 0.10 ALGO micropayment challenge (valid for ~20 rounds / ~56s)
    const challenge = settlement.createChallenge({
      challengeId,
      requiredAsset: 'USDCa',
      amountMicroUnits: 50_000n, // 0.05 USDCa (6 decimals)
      receiptAnchorDigest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      currentRound,
      roundValidityWindow: 20,
    });

    activeChallenges.set(challengeId, challenge);

    return {
      status: 402,
      statusText: 'Payment Required',
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `x402 protocol="x402.algorand/v0", challenge="${challenge.challengeDigest}"`,
      },
      body: {
        error: 'Payment Required',
        challenge,
      },
    };
  }

  // Case 2: Payment receipt presented — Verify against challenge
  try {
    const rawReceipt = JSON.parse(
      Buffer.from(authReceiptHeader, 'base64').toString('utf-8')
    );
    const receipt: AlgorandTransactionReceipt = {
      ...rawReceipt,
      amountMicroUnits: BigInt(rawReceipt.amountMicroUnits),
    };

    const challengeId = req.headers['x-402-challenge-id'];
    const challenge = challengeId ? activeChallenges.get(challengeId) : undefined;

    if (!challenge) {
      return { status: 400, body: { error: 'Unknown or expired challenge ID' } };
    }

    const currentRound = 40_500_125;
    const verdict = settlement.verifySettlement(challenge, receipt, currentRound);

    if (!verdict.valid) {
      return {
        status: 403,
        body: { error: 'Settlement verification failed', code: verdict.errorCode, detail: verdict.error },
      };
    }

    // Payment cleared! Return requested resource
    return {
      status: 200,
      body: {
        success: true,
        data: 'Hardware-attested inference output delivered.',
        clearedTxId: receipt.txId,
        asset: challenge.requiredAsset,
      },
    };
  } catch (err: any) {
    return { status: 400, body: { error: 'Malformed receipt envelope', detail: err.message } };
  }
}

export function jsonStringify(obj: any, space = 2): string {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), space);
}

// Quick demo run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('--- 1. Request without payment ---');
  const challengeResponse = await handleApiRequest({ headers: {}, path: '/v1/inference' });
  console.log(`HTTP ${challengeResponse.status}:`, jsonStringify(challengeResponse.body, 2));
}
