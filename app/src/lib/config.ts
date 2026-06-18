// Central protocol config. Single source of truth for the dApp, imported from the
// committed testnet deployment so on-chain IDs are never hand-typed twice.
import deployment from "./deployment.testnet.json";

export const CONFIG = {
  network: deployment.network as "testnet",
  rpc: deployment.rpc,
  packageId: deployment.packageId,
  pool: deployment.pool,
  enclave: deployment.enclave,
  blacklist: deployment.blacklist,
  treasuryCap: deployment.treasuryCap,
  coinMetadata: deployment.coinMetadata,
  usdcType: deployment.usdcType,
  enclaveSignerPk: deployment.enclaveSignerPk,
  deployer: deployment.deployer,
  adminCap: deployment.adminCap,
  keeperCap: deployment.keeperCap,
  upgradeCap: deployment.upgradeCap,
  publishDigest: deployment.publishDigest,
} as const;

// The on-chain shared `0x6` Clock object — required by every time-aware entry fun.
export const CLOCK_ID = "0x6";

// dUSDC has 6 decimals (mock_usdc::create_currency(.., 6, ..)). Mainnet swaps to
// native USDC, also 6 dp — no contract change.
export const USDC_DECIMALS = 6;

// Underwriting constants mirrored from credit_line.move so the UI can preview the
// limit/interest before any tx is signed.
export const LTV_BPS = 3000; // credit_limit = income * 30%
export const BASE_IR_BPS = 800; // 8%
export const RISK_PREMIUM_BPS = 300; // +3%
export const APR_BPS = BASE_IR_BPS + RISK_PREMIUM_BPS; // 11% APR

// Junior earns this multiple of senior's per-unit yield (credit_pool::JUNIOR_YIELD_WEIGHT).
export const JUNIOR_YIELD_WEIGHT = 3;

// Move struct type tags, prebuilt for objectChanges matching + getOwnedObjects filters.
export const TYPES = {
  attestation: `${CONFIG.packageId}::income::IncomeAttestation`,
  creditLine: `${CONFIG.packageId}::credit_line::CreditLine`,
  lpSenior: `${CONFIG.packageId}::credit_pool::LPToken<${CONFIG.packageId}::credit_pool::Senior>`,
  lpJunior: `${CONFIG.packageId}::credit_pool::LPToken<${CONFIG.packageId}::credit_pool::Junior>`,
  pool: `${CONFIG.packageId}::credit_pool::CreditPool`,
} as const;

export type Tranche = "senior" | "junior";

// Suiscan deep links (testnet).
export const suiscanObject = (id: string) =>
  `https://suiscan.xyz/testnet/object/${id}`;
export const suiscanTx = (digest: string) =>
  `https://suiscan.xyz/testnet/tx/${digest}`;
export const suiscanAccount = (addr: string) =>
  `https://suiscan.xyz/testnet/account/${addr}`;
