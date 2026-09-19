/**
 * Example: Autonomous AI Agent x402 Client
 *
 * Demonstrates an automated agent catching an HTTP 402 Payment Required challenge,
 * evaluating the settlement terms (asset, amount, recipient), committing the
 * required receipt anchor into the transaction note field, and retrying the request.
 */

import {
  encodeReceiptNoteField,
  type AlgorandSettlementChallenge,
  type AlgorandTransactionReceipt,
} from '../src/index.js';
import { handleApiRequest, jsonStringify } from './server-paywall.js';

async function runAutonomousAgent() {
  console.log('🤖 AI Agent invoking protected endpoint: /v1/inference');

  // Step 1: Initial request (unauthenticated)
  const initialResponse = await handleApiRequest({
    headers: {},
    path: '/v1/inference',
  });

  if (initialResponse.status !== 402) {
    console.log('Resource already accessible without payment:', initialResponse.body);
    return;
  }

  const challenge: AlgorandSettlementChallenge = (initialResponse.body as any).challenge;
  console.log('💳 Received HTTP 402 Challenge:');
  console.log(`   - Network: ${challenge.network}`);
  console.log(`   - Asset Required: ${challenge.requiredAsset} (ID: ${challenge.assetId ?? 'Native'})`);
  console.log(`   - Micro-Units: ${challenge.amountMicroUnits} (${Number(challenge.amountMicroUnits) / 1e6} ${challenge.requiredAsset})`);
  console.log(`   - Recipient: ${challenge.recipientAddress}`);
  console.log(`   - Expires at Round: ${challenge.expiresAtRound}`);

  // Step 2: Prepare note field with canonical receipt anchor
  const { noteBase64, notePlaintext } = encodeReceiptNoteField(challenge.receiptAnchorDigest);
  console.log(`📝 Encoded L1 Note Field Anchor: ${notePlaintext}`);

  // Step 3: Simulate Algorand L1 transaction broadcast & confirmation (~2.8s)
  // In live production: use algosdk.makePaymentTxnWithSuggestedParamsFromObject() or makeAssetTransferTxnWithSuggestedParamsFromObject()
  const simulatedReceipt: AlgorandTransactionReceipt = {
    txId: 'TX_ALGO_L1_M2M_PAYMENT_998877',
    senderAddress: 'AGENT_WORKER_PUBKEY_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    receiverAddress: challenge.recipientAddress,
    amountMicroUnits: challenge.amountMicroUnits,
    assetId: challenge.assetId,
    confirmedRound: challenge.expiresAtRound - 15, // Confirmed well before expiration
    roundTimestamp: Math.floor(Date.now() / 1000),
    noteFieldBase64: noteBase64,
    genesisHash: challenge.genesisHash,
    feeMicroAlgos: 1000,
  };

  const receiptBase64 = Buffer.from(jsonStringify(simulatedReceipt), 'utf-8').toString('base64');

  // Step 4: Retry request presenting the confirmed L1 receipt
  console.log('\n🚀 Retrying request with verified L1 transaction receipt...');
  const paidResponse = await handleApiRequest({
    headers: {
      'x-402-challenge-id': challenge.challengeId,
      'x-402-receipt': receiptBase64,
    },
    path: '/v1/inference',
  });

  console.log(`HTTP ${paidResponse.status} ${paidResponse.status === 200 ? 'OK' : 'FAILED'}:`);
  console.log(JSON.stringify(paidResponse.body, null, 2));
}

runAutonomousAgent().catch(console.error);
