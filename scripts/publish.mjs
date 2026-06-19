// Fresh-publish the conduit_credit package to testnet and record every created object
// ID into config/deployment.testnet.json. Clears `enclave`+`pool` so setup.mjs recreates
// them against the NEW package. A new publish is required (not an upgrade) because the
// shared Blacklist gained an `active_lines` field — the old shared object is incompatible.
//
//   node scripts/publish.mjs   (uses the isolated project .sui config; never touches ~/.sui)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const CFG = `${ROOT}config/deployment.testnet.json`;
const SUI_CONFIG_DIR = `${ROOT}.sui`;
const PKG_DIR = `${ROOT}contracts`;

// Fresh publish: drop the prior Published.toml (automated address management) so the CLI
// mints a brand-new package id instead of refusing with "already published".
const published = `${PKG_DIR}/Published.toml`;
if (existsSync(published)) rmSync(published);

console.error('publishing conduit_credit → testnet (≈20s)…');
const out = execSync('sui client publish --gas-budget 300000000 --json', {
  cwd: PKG_DIR,
  env: { ...process.env, SUI_CONFIG_DIR },
  maxBuffer: 128 * 1024 * 1024,
}).toString();

const res = JSON.parse(out);
if (res.effects?.status?.status !== 'success') {
  throw new Error(`publish failed: ${JSON.stringify(res.effects?.status)}`);
}
const changes = res.objectChanges || [];
const pkg = changes.find((c) => c.type === 'published');
const created = (needle) =>
  changes.find((c) => c.type === 'created' && (c.objectType || '').includes(needle))?.objectId;

const packageId = pkg?.packageId;
const found = {
  packageId,
  adminCap: created('::enclave_registry::AdminCap'),
  keeperCap: created('::registry::KeeperCap'),
  upgradeCap: created('::package::UpgradeCap'),
  blacklist: created('::registry::Blacklist'),
  enclaveConfig: created('::enclave_registry::EnclaveConfig'),
  treasuryCap: created('::coin::TreasuryCap'),
  coinMetadata: created('::coin::CoinMetadata'),
};
// Fail loudly if any expected object is missing — never write a half-populated config.
const missing = Object.entries(found).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(JSON.stringify(changes, null, 2));
  throw new Error(`could not resolve from publish: ${missing.join(', ')}`);
}

const cfg = JSON.parse(readFileSync(CFG));
Object.assign(cfg, found, {
  publishDigest: res.digest,
  usdcType: `${packageId}::mock_usdc::MOCK_USDC`,
});
delete cfg.enclave; // recreated by setup.mjs against the new package
delete cfg.pool;
writeFileSync(CFG, JSON.stringify(cfg, null, 2) + '\n');

console.error(`\n✓ published ${packageId}`);
console.error(`  digest      ${res.digest}`);
console.error(`  blacklist   ${found.blacklist}`);
console.error(`  treasuryCap ${found.treasuryCap}`);
console.error(`  adminCap    ${found.adminCap}`);
console.error(`  keeperCap   ${found.keeperCap}`);
console.error('\nnext: node scripts/setup.mjs  (register enclave, create pool, mint dUSDC)');
