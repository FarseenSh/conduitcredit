// Post-publish setup: register the operator enclave (signer pubkey), create the
// CreditPool<MOCK_USDC>, and mint demo dUSDC. Records the shared-object IDs back
// into config/deployment.testnet.json. Idempotent on enclave/pool.
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { readFileSync, writeFileSync } from 'node:fs';

const CFG = new URL('../config/deployment.testnet.json', import.meta.url);
const cfg = JSON.parse(readFileSync(CFG));
const ks = JSON.parse(readFileSync('/Users/farseen/conduitcredit/.sui/sui.keystore'));
const kp = Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(ks[0], 'base64').subarray(1)));
const client = new SuiClient({ url: getFullnodeUrl('testnet') });
const PKG = cfg.packageId;
const hexToBytes = (h) => Array.from(Buffer.from(h.replace(/^0x/, ''), 'hex'));

async function exec(tx, label) {
  tx.setGasBudget(50_000_000);
  const res = await client.signAndExecuteTransaction({
    signer: kp, transaction: tx, options: { showObjectChanges: true, showEffects: true },
  });
  console.log(`${label}: ${res.effects?.status?.status}  ${res.digest}`);
  if (res.effects?.status?.error) throw new Error(res.effects.status.error);
  await client.waitForTransaction({ digest: res.digest }); // let gas coin version settle before next tx
  return res.objectChanges || [];
}
const createdOfType = (ch, needle) =>
  ch.find((c) => c.type === 'created' && (c.objectType || '').includes(needle))?.objectId;

// 1) Register the operator enclave (fallback path; same verify_signature pattern).
if (!cfg.enclave) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::enclave_registry::register_via_operator`,
    arguments: [
      tx.object(cfg.adminCap),
      tx.pure.vector('u8', hexToBytes(cfg.enclaveSignerPk)),
      tx.pure.vector('u8', Array.from(Buffer.from('conduit-operator-pcr0'))),
      tx.pure.vector('u8', Array.from(Buffer.from('conduit-operator-pcr1'))),
      tx.pure.vector('u8', Array.from(Buffer.from('conduit-operator-pcr2'))),
    ],
  });
  cfg.enclave = createdOfType(await exec(tx, 'register_via_operator'), '::enclave_registry::Enclave');
  console.log('  enclave =', cfg.enclave);
}

// 2) Create the standalone CreditPool<MOCK_USDC>.
if (!cfg.pool) {
  const tx = new Transaction();
  tx.moveCall({ target: `${PKG}::credit_pool::create_pool`, typeArguments: [cfg.usdcType], arguments: [] });
  cfg.pool = createdOfType(await exec(tx, 'create_pool'), '::credit_pool::CreditPool');
  console.log('  pool =', cfg.pool);
}

// 3) Mint 100,000 dUSDC to the deployer to seed LPs + the borrower demo.
{
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::mock_usdc::mint`,
    arguments: [tx.object(cfg.treasuryCap), tx.pure.u64(100_000_000000n), tx.pure.address(cfg.deployer)],
  });
  await exec(tx, 'mint 100,000 dUSDC');
}

writeFileSync(CFG, JSON.stringify(cfg, null, 2));
console.log(`\nconfig updated → enclave=${cfg.enclave} pool=${cfg.pool}`);
