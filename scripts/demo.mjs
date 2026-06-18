// End-to-end ConduitCredit underwriting loop on Sui testnet — the live proof.
// LP deposits (senior+junior) → enclave attests income (fresh signature) →
// attest_income (on-chain verify_signature) → open credit line → borrow → repay →
// and a tampered-signature attestation that the chain REJECTS.
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { readFileSync } from 'node:fs';
import { signCreditAttestation } from './attester.mjs';

const cfg = JSON.parse(readFileSync(new URL('../config/deployment.testnet.json', import.meta.url)));
const ks = JSON.parse(readFileSync('/Users/farseen/conduitcredit/.sui/sui.keystore'));
const kp = Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(ks[0], 'base64').subarray(1)));
const me = kp.getPublicKey().toSuiAddress();
const client = new SuiClient({ url: getFullnodeUrl('testnet') });
const { packageId: PKG, usdcType: USDC, pool: POOL, enclave: ENCLAVE, blacklist: BL } = cfg;
const CLOCK = '0x6';
const hexToBytes = (h) => Array.from(Buffer.from(h.replace(/^0x/, ''), 'hex'));
const u = (n) => `$${(Number(n) / 1e6).toLocaleString()}`;

async function run(tx, label) {
  tx.setGasBudget(60_000_000);
  const res = await client.signAndExecuteTransaction({
    signer: kp, transaction: tx, options: { showEffects: true, showObjectChanges: true },
  });
  const st = res.effects?.status?.status;
  console.log(`\n▶ ${label}\n  ${st}  ${res.digest}`);
  if (res.effects?.status?.error) throw new Error(`${label}: ${res.effects.status.error}`);
  await client.waitForTransaction({ digest: res.digest });
  return res;
}
const created = (res, needle) =>
  res.objectChanges.find((c) => c.type === 'created' && (c.objectType || '').includes(needle))?.objectId;

async function biggestUsdc() {
  const { data } = await client.getCoins({ owner: me, coinType: USDC });
  return data.sort((a, b) => Number(b.balance) - Number(a.balance))[0].coinObjectId;
}

console.log('ConduitCredit — live testnet underwriting loop');
console.log('borrower/LP =', me);
console.log('pool        =', POOL);
console.log('enclave     =', ENCLAVE);

// 1) Lenders fund the tranches.
{
  const tx = new Transaction();
  const [c] = tx.splitCoins(tx.object(await biggestUsdc()), [tx.pure.u64(5_000_000000n)]);
  tx.moveCall({ target: `${PKG}::credit_pool::deposit_senior`, typeArguments: [USDC], arguments: [tx.object(POOL), c] });
  await run(tx, 'Senior LP deposits 5,000 dUSDC (protected tranche)');
}
{
  const tx = new Transaction();
  const [c] = tx.splitCoins(tx.object(await biggestUsdc()), [tx.pure.u64(2_000_000000n)]);
  tx.moveCall({ target: `${PKG}::credit_pool::deposit_junior`, typeArguments: [USDC], arguments: [tx.object(POOL), c] });
  await run(tx, 'Junior LP deposits 2,000 dUSDC (first-loss tranche)');
}

// 2) The enclave reads income and signs an attestation (fresh, current timestamp).
const att = await signCreditAttestation({ borrower: me, income6moUsdc: 4_200_000000 });
console.log(`\n🔐 enclave signed: income=$4,200/mo  data_source=${att.data_source}  pk=${att.pk_hex.slice(0, 16)}…`);

// 3) attest_income — the chain verifies the signature and mints the attestation.
let attestationId;
{
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::income::attest_income`,
    arguments: [
      tx.object(ENCLAVE),
      tx.pure.address(att.borrower),
      tx.pure.u64(BigInt(att.income_6mo_avg_usdc)),
      tx.pure.vector('u8', Array.from(Buffer.from(att.data_source))),
      tx.pure.u64(BigInt(att.fetch_ts_ms)),
      tx.pure.u64(BigInt(att.timestamp_ms)),
      tx.pure.vector('u8', hexToBytes(att.signature_hex)),
      tx.object(CLOCK),
    ],
  });
  const res = await run(tx, 'attest_income → on-chain verify_signature ✓ → mint IncomeAttestation');
  attestationId = created(res, '::income::IncomeAttestation');
  console.log('  IncomeAttestation =', attestationId);
}

// 4) Open the credit line: limit = income × 30%.
let lineId;
{
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::credit_line::open_credit_line`,
    typeArguments: [USDC],
    arguments: [tx.object(attestationId), tx.object(POOL), tx.object(BL), tx.object(CLOCK)],
  });
  const res = await run(tx, 'open_credit_line → limit = $4,200 × 30% = $1,260');
  lineId = created(res, '::credit_line::CreditLine');
  console.log('  CreditLine =', lineId);
}

// 5) Borrow.
{
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::credit_line::borrow`,
    typeArguments: [USDC],
    arguments: [tx.object(POOL), tx.object(lineId), tx.pure.u64(1_000_000000n), tx.object(CLOCK)],
  });
  await run(tx, 'borrow 1,000 dUSDC → lands in the borrower wallet');
}

// 6) Repay (principal + a little interest).
{
  const tx = new Transaction();
  const [pay] = tx.splitCoins(tx.object(await biggestUsdc()), [tx.pure.u64(1_010_000000n)]);
  tx.moveCall({
    target: `${PKG}::credit_line::repay`,
    typeArguments: [USDC],
    arguments: [tx.object(POOL), tx.object(lineId), pay, tx.object(CLOCK)],
  });
  await run(tx, 'repay 1,010 dUSDC → principal back, interest to LPs');
}

// 7) The moat in action: a TAMPERED signature is rejected on chain.
{
  const tx = new Transaction();
  const bad = hexToBytes(att.signature_hex);
  bad[0] ^= 0x01;
  tx.moveCall({
    target: `${PKG}::income::attest_income`,
    arguments: [
      tx.object(ENCLAVE),
      tx.pure.address(att.borrower),
      tx.pure.u64(BigInt(att.income_6mo_avg_usdc)),
      tx.pure.vector('u8', Array.from(Buffer.from(att.data_source))),
      tx.pure.u64(BigInt(att.fetch_ts_ms)),
      tx.pure.u64(BigInt(att.timestamp_ms)),
      tx.pure.vector('u8', bad),
      tx.object(CLOCK),
    ],
  });
  try {
    await run(tx, 'attest_income with a TAMPERED signature (must abort)');
    console.log('  ⚠️  unexpectedly succeeded');
  } catch (e) {
    console.log(`  ✓ chain REJECTED the forged attestation: ${String(e.message).split(' in ')[0]}`);
  }
}

// Final pool state.
const pool = await client.getObject({ id: POOL, options: { showContent: true } });
const f = pool.data.content.fields;
console.log('\n📊 pool state:');
console.log(`  liquidity=${u(f.liquidity)}  borrowed=${u(f.total_borrowed)}`);
console.log(`  senior_assets=${u(f.senior_assets)}  junior_assets=${u(f.junior_assets)}  (interest accrued to LPs)`);
console.log('\n✅ live underwriting loop complete on testnet.');
