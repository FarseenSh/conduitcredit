// Protocol PTB builders + on-chain readers.
//
// Every Transaction here MIRRORS scripts/demo.mjs byte-for-byte: same target strings,
// same typeArguments ([usdcType]), same argument order, same pure encodings. demo.mjs
// is verified working on testnet, so these are too. The connected wallet signs them.
import { Transaction } from "@mysten/sui/transactions";
import type { SuiClient } from "@mysten/sui/client";
import { CONFIG, CLOCK_ID, TYPES } from "./config";

const PKG = CONFIG.packageId;
const USDC = CONFIG.usdcType;
const POOL = CONFIG.pool;
const ENCLAVE = CONFIG.enclave;
const BL = CONFIG.blacklist;

/** hex (with/without 0x) → number[] for tx.pure.vector('u8', …). */
export function hexToBytes(h: string): number[] {
  const clean = h.replace(/^0x/, "");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    out.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return out;
}

/** utf8 string → number[] (data_source is a vector<u8>). */
export function strToBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

/** The signed attestation shape returned by /api/attest. */
export interface Attestation {
  borrower: string;
  income_6mo_avg_usdc: string;
  data_source: string;
  fetch_ts_ms: number;
  timestamp_ms: number;
  signature_hex: string;
  pk_hex: string;
}

/**
 * Find the connected wallet's largest dUSDC coin object. Returns null if none —
 * the caller surfaces a "get test dUSDC" prompt.
 */
export async function biggestUsdcCoin(
  client: SuiClient,
  owner: string
): Promise<{ id: string; balance: bigint } | null> {
  const { data } = await client.getCoins({ owner, coinType: USDC });
  if (!data.length) return null;
  const sorted = [...data].sort((a, b) =>
    Number(BigInt(b.balance) - BigInt(a.balance))
  );
  return { id: sorted[0].coinObjectId, balance: BigInt(sorted[0].balance) };
}

/** Total dUSDC balance across all coin objects for `owner`. */
export async function totalUsdc(
  client: SuiClient,
  owner: string
): Promise<bigint> {
  const { data } = await client.getCoins({ owner, coinType: USDC });
  return data.reduce((acc, c) => acc + BigInt(c.balance), 0n);
}

// ─────────────────────────── PTB builders ───────────────────────────

/**
 * attest_income — the underwriting gate. NO type argument (matches income.move /
 * demo.mjs). `tamper` flips signature byte 0, forcing the on-chain E_BAD_SIGNATURE
 * abort: the money shot (accept good / reject bad, live).
 */
export function buildAttestIncomeTx(
  att: Attestation,
  opts: { tamper?: boolean } = {}
): Transaction {
  const tx = new Transaction();
  const sig = hexToBytes(att.signature_hex);
  if (opts.tamper) sig[0] ^= 0x01;
  tx.moveCall({
    target: `${PKG}::income::attest_income`,
    arguments: [
      tx.object(ENCLAVE),
      tx.pure.address(att.borrower),
      tx.pure.u64(BigInt(att.income_6mo_avg_usdc)),
      tx.pure.vector("u8", strToBytes(att.data_source)),
      tx.pure.u64(BigInt(att.fetch_ts_ms)),
      tx.pure.u64(BigInt(att.timestamp_ms)),
      tx.pure.vector("u8", sig),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/** open_credit_line<USDC>(attestation, pool, blacklist, clock). */
export function buildOpenCreditLineTx(attestationId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::credit_line::open_credit_line`,
    typeArguments: [USDC],
    arguments: [
      tx.object(attestationId),
      tx.object(POOL),
      tx.object(BL),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/** borrow<USDC>(pool, line, amount, clock). */
export function buildBorrowTx(lineId: string, amount: bigint): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::credit_line::borrow`,
    typeArguments: [USDC],
    arguments: [
      tx.object(POOL),
      tx.object(lineId),
      tx.pure.u64(amount),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/** repay<USDC>(pool, line, payCoin, clock) — splits `amount` off the biggest coin. */
export function buildRepayTx(
  lineId: string,
  coinId: string,
  amount: bigint
): Transaction {
  const tx = new Transaction();
  const [pay] = tx.splitCoins(tx.object(coinId), [tx.pure.u64(amount)]);
  tx.moveCall({
    target: `${PKG}::credit_line::repay`,
    typeArguments: [USDC],
    arguments: [tx.object(POOL), tx.object(lineId), pay, tx.object(CLOCK_ID)],
  });
  return tx;
}

/** deposit_senior|deposit_junior<USDC>(pool, coin) — splits `amount` off the biggest coin. */
export function buildDepositTx(
  tranche: "senior" | "junior",
  coinId: string,
  amount: bigint
): Transaction {
  const tx = new Transaction();
  const [c] = tx.splitCoins(tx.object(coinId), [tx.pure.u64(amount)]);
  const fn = tranche === "senior" ? "deposit_senior" : "deposit_junior";
  tx.moveCall({
    target: `${PKG}::credit_pool::${fn}`,
    typeArguments: [USDC],
    arguments: [tx.object(POOL), c],
  });
  return tx;
}

/** withdraw_senior|withdraw_junior<USDC>(pool, lpToken). */
export function buildWithdrawTx(
  tranche: "senior" | "junior",
  lpTokenId: string
): Transaction {
  const tx = new Transaction();
  const fn = tranche === "senior" ? "withdraw_senior" : "withdraw_junior";
  tx.moveCall({
    target: `${PKG}::credit_pool::${fn}`,
    typeArguments: [USDC],
    arguments: [tx.object(POOL), tx.object(lpTokenId)],
  });
  return tx;
}

// ─────────────────────────── object change extractors ───────────────────────────

interface CreatedChange {
  type: string;
  objectType?: string;
  objectId?: string;
}

/** First created object whose type contains `needle` (from showObjectChanges). */
export function createdId(
  changes: readonly unknown[] | undefined,
  needle: string
): string | undefined {
  if (!changes) return undefined;
  const match = (changes as CreatedChange[]).find(
    (c) => c.type === "created" && (c.objectType || "").includes(needle)
  );
  return match?.objectId;
}

// ─────────────────────────── on-chain readers ───────────────────────────

export interface PoolState {
  liquidity: bigint;
  totalBorrowed: bigint;
  seniorAssets: bigint;
  seniorShares: bigint;
  juniorAssets: bigint;
  juniorShares: bigint;
  totalAssets: bigint;
  utilizationBps: number;
}

export async function readPool(client: SuiClient): Promise<PoolState> {
  const res = await client.getObject({
    id: POOL,
    options: { showContent: true },
  });
  const content = res.data?.content;
  if (!content || content.dataType !== "moveObject") {
    throw new Error("pool object not found");
  }
  // liquidity is a Balance<T> which BCS-encodes as a struct { value }. The RPC
  // surfaces it either as a string or as { value } — handle both.
  const f = content.fields as Record<string, unknown>;
  const liqRaw = f.liquidity as unknown;
  const liquidity =
    typeof liqRaw === "object" && liqRaw !== null && "value" in (liqRaw as object)
      ? BigInt((liqRaw as { value: string }).value)
      : BigInt(liqRaw as string);
  const seniorAssets = BigInt(f.senior_assets as string);
  const juniorAssets = BigInt(f.junior_assets as string);
  const totalBorrowed = BigInt(f.total_borrowed as string);
  const totalAssets = seniorAssets + juniorAssets;
  return {
    liquidity,
    totalBorrowed,
    seniorAssets,
    seniorShares: BigInt(f.senior_shares as string),
    juniorAssets,
    juniorShares: BigInt(f.junior_shares as string),
    totalAssets,
    utilizationBps:
      totalAssets === 0n
        ? 0
        : Number((totalBorrowed * 10000n) / totalAssets),
  };
}

export interface CreditLineState {
  id: string;
  borrower: string;
  creditLimit: bigint;
  outstanding: bigint;
  accruedInterest: bigint;
  irBps: number;
  attestationId: string;
  poolId: string;
  openedTs: number;
}

function parseLine(id: string, f: Record<string, unknown>): CreditLineState {
  return {
    id,
    borrower: f.borrower as string,
    creditLimit: BigInt(f.credit_limit as string),
    outstanding: BigInt(f.outstanding as string),
    accruedInterest: BigInt(f.accrued_interest as string),
    irBps: Number(f.ir_bps as string),
    attestationId: f.attestation_id as string,
    poolId: f.pool_id as string,
    openedTs: Number(f.opened_ts as string),
  };
}

export async function readCreditLine(
  client: SuiClient,
  id: string
): Promise<CreditLineState | null> {
  const res = await client.getObject({ id, options: { showContent: true } });
  const content = res.data?.content;
  if (!content || content.dataType !== "moveObject") return null;
  return parseLine(id, content.fields as Record<string, unknown>);
}

/** All CreditLine objects owned by `owner` (a borrower may re-open after repay). */
export async function readOwnedCreditLines(
  client: SuiClient,
  owner: string
): Promise<CreditLineState[]> {
  const res = await client.getOwnedObjects({
    owner,
    filter: { StructType: TYPES.creditLine },
    options: { showContent: true },
  });
  const out: CreditLineState[] = [];
  for (const o of res.data) {
    const content = o.data?.content;
    if (content && content.dataType === "moveObject" && o.data?.objectId) {
      out.push(parseLine(o.data.objectId, content.fields as Record<string, unknown>));
    }
  }
  return out;
}

export interface AttestationState {
  id: string;
  owner: string;
  income: bigint;
  dataSource: string;
  attestationTs: number;
  expiryTs: number;
  enclaveId: string;
}

export async function readOwnedAttestations(
  client: SuiClient,
  owner: string
): Promise<AttestationState[]> {
  const res = await client.getOwnedObjects({
    owner,
    filter: { StructType: TYPES.attestation },
    options: { showContent: true },
  });
  const out: AttestationState[] = [];
  for (const o of res.data) {
    const content = o.data?.content;
    if (content && content.dataType === "moveObject" && o.data?.objectId) {
      const f = content.fields as Record<string, unknown>;
      // data_source is a vector<u8>; RPC returns it as a number[] of byte values.
      const dsRaw = f.data_source as number[] | string;
      const dataSource = Array.isArray(dsRaw)
        ? new TextDecoder().decode(Uint8Array.from(dsRaw))
        : String(dsRaw);
      out.push({
        id: o.data.objectId,
        owner: f.owner as string,
        income: BigInt(f.income_6mo_avg_usdc as string),
        dataSource,
        attestationTs: Number(f.attestation_ts as string),
        expiryTs: Number(f.expiry_ts as string),
        enclaveId: f.enclave_id as string,
      });
    }
  }
  return out;
}

export interface LpPosition {
  id: string;
  tranche: "senior" | "junior";
  shares: bigint;
}

export async function readOwnedLpTokens(
  client: SuiClient,
  owner: string
): Promise<LpPosition[]> {
  const fetchTranche = async (
    tranche: "senior" | "junior",
    structType: string
  ): Promise<LpPosition[]> => {
    const res = await client.getOwnedObjects({
      owner,
      filter: { StructType: structType },
      options: { showContent: true },
    });
    const out: LpPosition[] = [];
    for (const o of res.data) {
      const content = o.data?.content;
      if (content && content.dataType === "moveObject" && o.data?.objectId) {
        const f = content.fields as Record<string, unknown>;
        out.push({
          id: o.data.objectId,
          tranche,
          shares: BigInt(f.shares as string),
        });
      }
    }
    return out;
  };
  const [senior, junior] = await Promise.all([
    fetchTranche("senior", TYPES.lpSenior),
    fetchTranche("junior", TYPES.lpJunior),
  ]);
  return [...senior, ...junior];
}
