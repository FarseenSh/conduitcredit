// On-chain gate tx: prove enclave_registry::assert_verify ACCEPTS the good
// signature (tx success) and REJECTS the tampered one (Move abort) on testnet.
// Signs with the isolated project deployer key. Usage: PKG=<pkgid> node gate_call.mjs
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { readFileSync } from 'node:fs';

const PKG = process.env.PKG;
if (!PKG) { console.error('set PKG=<package id>'); process.exit(1); }
const fx = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url)));

// Load the deployer keypair from the project-isolated keystore: [flag(1B), secret(32B)].
const ks = JSON.parse(readFileSync('/Users/farseen/conduitcredit/.sui/sui.keystore'));
const raw = Buffer.from(ks[0], 'base64');
const kp = Ed25519Keypair.fromSecretKey(Uint8Array.from(raw.subarray(1)));
const me = kp.getPublicKey().toSuiAddress();
const client = new SuiClient({ url: getFullnodeUrl('testnet') });
const hexToBytes = (h) => Array.from(Buffer.from(h.replace(/^0x/, ''), 'hex'));

function buildTx(sigHex) {
  const tx = new Transaction();
  tx.setGasBudget(20_000_000); // explicit so the aborting tx doesn't fail dry-run gas estimation
  tx.moveCall({
    target: `${PKG}::enclave_registry::assert_verify`,
    arguments: [
      tx.pure.vector('u8', hexToBytes(fx.pk_hex)),
      tx.pure.u8(fx.intent),
      tx.pure.u64(BigInt(fx.timestamp_ms)),
      tx.pure.address(fx.borrower),
      tx.pure.u64(BigInt(fx.income_6mo_avg_usdc)),
      tx.pure.vector('u8', hexToBytes(fx.data_source_hex)),
      tx.pure.u64(BigInt(fx.fetch_ts_ms)),
      tx.pure.vector('u8', hexToBytes(sigHex)),
    ],
  });
  return tx;
}

async function run(label, sigHex) {
  try {
    const res = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: buildTx(sigHex),
      options: { showEffects: true },
    });
    const st = res.effects?.status?.status;
    console.log(`${label}\n  digest=${res.digest}\n  status=${st}${res.effects?.status?.error ? ' error=' + res.effects.status.error : ''}`);
  } catch (e) {
    console.log(`${label}\n  threw=${e.message}`);
  }
}

console.log(`deployer=${me}\nPKG=${PKG}\n`);
await run('GOOD signature (expect status=success):', fx.good_sig_hex);
await run('TAMPERED signature (expect Move abort, E_BAD_SIGNATURE=3):', fx.tampered_sig_hex);
