// ConduitCredit enclave attester (income signer).
//
// This is the off-chain half of the TEE underwriting loop. In production it runs
// INSIDE the AWS Nitro enclave (Marlin Oyster): it reads payroll/bank data via Plaid
// (keys from AWS Secrets Manager), computes the 6-month average, and Ed25519-signs an
// `IntentMessage<CreditPayload>{ intent: 2, ts, payload }` whose pubkey is registered
// on chain. The chain verifies the signature; the raw statements never leave the enclave.
//
// For the demo the income is supplied directly (Plaid sandbox is the production source);
// the SIGNATURE — the thing the chain actually trusts — is real either way. The signing
// key here is the same deterministic key whose pubkey is registered as the operator enclave.
import * as ed from '@noble/ed25519';
import { bcs } from '@mysten/bcs';

const INTENT_SCOPE_CREDIT = 2;
const Address32 = bcs.fixedArray(32, bcs.u8());
const IntentMessage = (P) =>
  bcs.struct('IntentMessage', { intent: bcs.u8(), timestamp_ms: bcs.u64(), payload: P });
const CreditPayload = bcs.struct('CreditPayload', {
  borrower: Address32,
  income_6mo_avg_usdc: bcs.u64(),
  data_source: bcs.vector(bcs.u8()),
  fetch_ts_ms: bcs.u64(),
});

// Deterministic demo enclave key (throwaway; the real key lives in the Nitro enclave +
// AWS Secrets Manager). Its pubkey == the registered operator enclave's pubkey.
function enclaveSecret() {
  const s = new Uint8Array(32);
  for (let i = 0; i < 32; i++) s[i] = (i * 7 + 3) & 0xff;
  return s;
}

export async function enclavePubkeyHex() {
  return Buffer.from(await ed.getPublicKeyAsync(enclaveSecret())).toString('hex');
}

const addrBytes = (a) => Array.from(Buffer.from(a.replace(/^0x/, '').padStart(64, '0'), 'hex'));

/// Sign a CreditPayload for `borrower`. `nowMs` defaults to the current time so the
/// chain's freshness check (< 10 min) passes.
export async function signCreditAttestation({ borrower, income6moUsdc, dataSource = 'plaid', nowMs }) {
  const now = nowMs ?? Date.now();
  const ts = BigInt(now);
  const secret = enclaveSecret();
  const pk = await ed.getPublicKeyAsync(secret);
  const payload = {
    borrower: addrBytes(borrower),
    income_6mo_avg_usdc: BigInt(income6moUsdc),
    data_source: Array.from(Buffer.from(dataSource)),
    fetch_ts_ms: ts,
  };
  const msg = IntentMessage(CreditPayload)
    .serialize({ intent: INTENT_SCOPE_CREDIT, timestamp_ms: ts, payload })
    .toBytes();
  const signature = await ed.signAsync(msg, secret);
  return {
    borrower,
    income_6mo_avg_usdc: String(income6moUsdc),
    data_source: dataSource,
    fetch_ts_ms: now,
    timestamp_ms: now,
    signature_hex: Buffer.from(signature).toString('hex'),
    pk_hex: Buffer.from(pk).toString('hex'),
  };
}
