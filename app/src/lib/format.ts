import { USDC_DECIMALS } from "./config";

const SCALE = 10 ** USDC_DECIMALS;

/** Convert a 6-decimal base-unit amount (bigint | string | number) to a JS number. */
export function toUsdc(base: bigint | string | number): number {
  return Number(BigInt(base)) / SCALE;
}

/** Convert a human dUSDC amount to a base-unit bigint (6 dp). Floors to whole micro-units. */
export function toBase(human: number): bigint {
  return BigInt(Math.round(human * SCALE));
}

/** $1,234.56 — currency formatting at 2 dp for dUSDC. */
export function fmtUsd(
  base: bigint | string | number,
  opts: { decimals?: number } = {}
): string {
  const v = toUsdc(base);
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.decimals ?? 2,
    maximumFractionDigits: opts.decimals ?? 2,
  });
}

/** Plain number with thousands separators (no currency symbol). */
export function fmtNum(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** 0x771c…82ee style address/id truncation. */
export function shorten(id: string, head = 6, tail = 4): string {
  if (!id) return "";
  if (id.length <= head + tail + 2) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

/** basis points → percent string, e.g. 1100 → "11.00%". */
export function bpsToPct(bps: number, decimals = 2): string {
  return `${(bps / 100).toFixed(decimals)}%`;
}
