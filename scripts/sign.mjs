// Offline Ed25519 + BCS signer — produces the gate test fixture.
//
// Two jobs:
//   1) Cross-check our BCS encoder against nautilus's canonical weather vector.
//      If our IntentMessage<WeatherResponse> serialization is byte-identical to
//      the upstream `x"0020b1d1...0d00000000000000"`, our BCS layout is correct.
//   2) Generate a (deterministic, throwaway) enclave-sim keypair, BCS-serialize an
//      IntentMessage<CreditPayload>{intent:2,...}, sign it, and emit (pk, sig, fields)
//      so the Move side (tests + on-chain assert_verify) can prove accept/reject.
//
// The seed below is a TEST keypair standing in for the enclave key — NOT a secret,
// NOT a real enclave. The real enclave key lives in AWS Secrets Manager (post-gate).
import * as ed from '@noble/ed25519';
import { bcs } from '@mysten/bcs';
import { writeFileSync } from 'node:fs';

const toHex = (u8) => Buffer.from(u8).toString('hex');
const hexToBytes = (h) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ''), 'hex'));

// --- BCS schemas (mirror the Move structs positionally) ---
const Address32 = bcs.fixedArray(32, bcs.u8());
const IntentMessage = (P) =>
  bcs.struct('IntentMessage', { intent: bcs.u8(), timestamp_ms: bcs.u64(), payload: P });
const WeatherResponse = bcs.struct('WeatherResponse', {
  location: bcs.string(),
  temperature: bcs.u64(),
});
const CreditPayload = bcs.struct('CreditPayload', {
  borrower: Address32,
  income_6mo_avg_usdc: bcs.u64(),
  data_source: bcs.vector(bcs.u8()),
  fetch_ts_ms: bcs.u64(),
});

// --- 1) Canonical weather vector cross-check ---
const CANONICAL = '0020b1d110960100000d53616e204672616e636973636f0d00000000000000';
const weatherHex = toHex(
  IntentMessage(WeatherResponse)
    .serialize({ intent: 0, timestamp_ms: 1744038900000n, payload: { location: 'San Francisco', temperature: 13n } })
    .toBytes(),
);
if (weatherHex !== CANONICAL) {
  console.error(`CANONICAL MISMATCH\n got: ${weatherHex}\n exp: ${CANONICAL}`);
  process.exit(1);
}
console.log(`[ok] weather BCS == canonical vector: ${weatherHex}`);

// --- 2) Deterministic enclave-sim keypair (fixed seed; fixture is committable) ---
const priv = new Uint8Array(32);
for (let i = 0; i < 32; i++) priv[i] = (i * 7 + 3) & 0xff;
const pk = await ed.getPublicKeyAsync(priv);

// --- 3) CreditPayload fixture (intent scope = 2) ---
const borrowerHex = '0x000000000000000000000000000000000000000000000000000000000000cafe';
const fields = {
  intent: 2,
  timestamp_ms: 1744038900000n,
  borrower: borrowerHex,
  income_6mo_avg_usdc: 4200000000n, // $4,200.000000 (USDC, 6 dp)
  data_source: 'plaid',
  fetch_ts_ms: 1744038900000n,
};
const msg = IntentMessage(CreditPayload)
  .serialize({
    intent: fields.intent,
    timestamp_ms: fields.timestamp_ms,
    payload: {
      borrower: Array.from(hexToBytes(borrowerHex)),
      income_6mo_avg_usdc: fields.income_6mo_avg_usdc,
      data_source: Array.from(Buffer.from(fields.data_source)),
      fetch_ts_ms: fields.fetch_ts_ms,
    },
  })
  .toBytes();

const sig = await ed.signAsync(msg, priv);
const tampered = Uint8Array.from(sig);
tampered[0] ^= 0x01;

const okGood = await ed.verifyAsync(sig, msg, pk);
const okBad = await ed.verifyAsync(tampered, msg, pk);
if (!okGood || okBad) {
  console.error(`self-verify failed: good=${okGood} tampered=${okBad}`);
  process.exit(1);
}
console.log('[ok] self-verify: good=true tampered=false');

const out = {
  canonical_weather_vector: CANONICAL,
  pk_hex: toHex(pk),
  msg_hex: toHex(msg),
  good_sig_hex: toHex(sig),
  tampered_sig_hex: toHex(tampered),
  intent: fields.intent,
  timestamp_ms: fields.timestamp_ms.toString(),
  borrower: fields.borrower,
  income_6mo_avg_usdc: fields.income_6mo_avg_usdc.toString(),
  data_source: fields.data_source,
  data_source_hex: toHex(Buffer.from(fields.data_source)),
  fetch_ts_ms: fields.fetch_ts_ms.toString(),
};
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
