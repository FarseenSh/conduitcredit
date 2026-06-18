"use client";

import { Icon, ObjLink, Stat, Bar } from "./ui";
import { usePool } from "@/hooks/useChainData";
import { PoolState } from "@/lib/protocol";
import { fmtUsd, fmtNum } from "@/lib/format";
import { CONFIG } from "@/lib/config";

/**
 * Live, self-refreshing pool dashboard. A stacked capital-structure bar
 * (junior buffer beneath protected senior) plus a utilization gauge and the
 * headline numbers — all wired to usePool() (8s refetch).
 */
export function PoolPanel() {
  const { data: pool, isLoading } = usePool();

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-12">
        {/* capital structure */}
        <div className="panel grain overflow-hidden p-6 lg:col-span-7">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="chart" className="h-4 w-4 text-lime" />
              <span className="label">capital structure</span>
            </div>
            <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-chalk-faint">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
              live · refetch 8s
            </span>
          </div>
          <CapitalStack pool={pool} loading={isLoading} />
        </div>

        {/* utilization gauge */}
        <div className="panel p-6 lg:col-span-5">
          <div className="mb-5 flex items-center gap-2">
            <Icon name="bolt" className="h-4 w-4 text-teal" />
            <span className="label">utilization</span>
          </div>
          <UtilGauge pool={pool} />
        </div>
      </div>

      {/* headline numbers */}
      <div className="panel grid grid-cols-2 gap-y-6 p-6 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Total liquidity"
          value={pool ? fmtUsd(pool.liquidity, { decimals: 0 }) : "—"}
          sub="idle cash"
        />
        <Stat
          label="Total borrowed"
          value={pool ? fmtUsd(pool.totalBorrowed, { decimals: 0 }) : "—"}
          accent="lime"
          sub="drawn by borrowers"
        />
        <Stat
          label="Total assets"
          value={pool ? fmtUsd(pool.totalAssets, { decimals: 0 }) : "—"}
          sub="senior + junior"
        />
        <Stat
          label="Senior assets"
          value={pool ? fmtUsd(pool.seniorAssets, { decimals: 0 }) : "—"}
          accent="teal"
          sub="protected"
        />
        <Stat
          label="Junior assets"
          value={pool ? fmtUsd(pool.juniorAssets, { decimals: 0 }) : "—"}
          accent="amber"
          sub="first-loss buffer"
        />
        <Stat
          label="Utilization"
          value={pool ? `${fmtNum(pool.utilizationBps / 100, 1)}%` : "—"}
          sub="borrowed / assets"
        />
      </div>

      {/* footer link */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1">
        <span className="label">shared CreditPool object</span>
        <ObjLink id={CONFIG.pool} />
        <span className="font-mono text-[10.5px] text-chalk-faint">
          one standalone pool · isolated from the rest of DeFi
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────── stacked capital bar ───────────────────────────

function CapitalStack({ pool, loading }: { pool?: PoolState; loading: boolean }) {
  const senior = pool?.seniorAssets ?? 0n;
  const junior = pool?.juniorAssets ?? 0n;
  const total = senior + junior;
  const borrowed = pool?.totalBorrowed ?? 0n;

  const seniorPct = total > 0n ? Number((senior * 10000n) / total) / 100 : 0;
  const juniorPct = total > 0n ? Number((junior * 10000n) / total) / 100 : 0;
  // borrowed line, as a fraction of total assets (drawn out of the stack)
  const borrowedPct = total > 0n ? Number((borrowed * 10000n) / total) / 100 : 0;

  if (!loading && total === 0n) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-ink-900/40 px-4 py-10 text-center">
        <p className="font-mono text-[12px] text-chalk-dim">
          Pool is empty. Be the first to{" "}
          <a href="#lend" className="link-ext">
            fund a tranche
          </a>{" "}
          and watch this fill.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* the stack — senior on top (protected), junior underneath (buffer) */}
      <div className="relative h-14 w-full overflow-hidden rounded-xl border border-line bg-ink-900">
        <div className="flex h-full w-full">
          <div
            className="flex h-full items-center justify-center bg-gradient-to-r from-teal/30 to-teal/15 transition-[width] duration-700 ease-out"
            style={{ width: `${seniorPct}%` }}
          >
            {seniorPct > 12 && (
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-teal">
                senior {fmtNum(seniorPct, 0)}%
              </span>
            )}
          </div>
          <div
            className="flex h-full items-center justify-center bg-gradient-to-r from-amber/25 to-amber/10 transition-[width] duration-700 ease-out"
            style={{ width: `${juniorPct}%` }}
          >
            {juniorPct > 12 && (
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-amber">
                junior {fmtNum(juniorPct, 0)}%
              </span>
            )}
          </div>
        </div>
        {/* borrowed marker line */}
        {borrowedPct > 0 && borrowedPct < 100 && (
          <div
            className="absolute top-0 h-full border-r-2 border-dashed border-lime/70 transition-[left] duration-700 ease-out"
            style={{ left: `${borrowedPct}%` }}
          >
            <span className="absolute -top-0 left-1.5 hidden whitespace-nowrap font-mono text-[9px] text-lime sm:inline">
              ← {fmtNum(borrowedPct, 0)}% drawn
            </span>
          </div>
        )}
      </div>

      {/* legend */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <LegendCell
          color="teal"
          label="Senior"
          value={fmtUsd(senior, { decimals: 0 })}
          note="protected"
        />
        <LegendCell
          color="amber"
          label="Junior"
          value={fmtUsd(junior, { decimals: 0 })}
          note="first-loss"
        />
        <LegendCell
          color="lime"
          label="Borrowed"
          value={fmtUsd(borrowed, { decimals: 0 })}
          note="drawn"
        />
      </div>

      <p className="mt-4 font-mono text-[10.5px] leading-relaxed text-chalk-faint">
        The junior tranche sits in front of senior: defaults erode junior first,
        so senior lenders keep a buffer equal to the entire junior balance.
      </p>
    </div>
  );
}

function LegendCell({
  color,
  label,
  value,
  note,
}: {
  color: "teal" | "amber" | "lime";
  label: string;
  value: string;
  note: string;
}) {
  const dot =
    color === "amber" ? "bg-amber" : color === "lime" ? "bg-lime" : "bg-teal";
  const text =
    color === "amber" ? "text-amber" : color === "lime" ? "text-lime" : "text-teal";
  return (
    <div className="rounded-lg border border-line bg-ink-900/50 p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="label">{label}</span>
      </div>
      <div className={`data text-[15px] font-semibold ${text}`}>{value}</div>
      <div className="mt-0.5 font-mono text-[10px] text-chalk-faint">{note}</div>
    </div>
  );
}

// ─────────────────────────── utilization gauge ───────────────────────────

function UtilGauge({ pool }: { pool?: PoolState }) {
  const util = pool ? pool.utilizationBps / 100 : 0;
  const hot = util > 80;
  const warm = util > 50;
  const color = hot ? "amber" : warm ? "lime" : "teal";
  const colorText =
    color === "amber" ? "text-amber" : color === "lime" ? "text-lime" : "text-teal";

  return (
    <div>
      <div className="flex items-end justify-between">
        <div className={`data text-5xl font-bold tracking-tight ${colorText}`}>
          {pool ? fmtNum(util, 1) : "—"}
          <span className="text-2xl">%</span>
        </div>
        <div className="pb-1 text-right">
          <div className="label">borrowed</div>
          <div className="data text-[13px] text-chalk-dim">
            {pool ? fmtUsd(pool.totalBorrowed, { decimals: 0 }) : "—"}
          </div>
          <div className="label mt-1.5">of assets</div>
          <div className="data text-[13px] text-chalk-dim">
            {pool ? fmtUsd(pool.totalAssets, { decimals: 0 }) : "—"}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <Bar pct={util} color={color} height="h-3" />
        <div className="mt-2 flex justify-between font-mono text-[9.5px] uppercase tracking-wider text-chalk-faint">
          <span>0%</span>
          <span>idle</span>
          <span className={warm ? colorText : ""}>50%</span>
          <span className={hot ? "text-amber" : ""}>80%</span>
          <span>100%</span>
        </div>
      </div>

      <div
        className={`mt-5 rounded-lg border px-3.5 py-3 ${
          hot
            ? "border-amber/30 bg-amber/[0.06]"
            : "border-line bg-ink-900/40"
        }`}
      >
        <p className="font-mono text-[10.5px] leading-relaxed text-chalk-dim">
          {hot ? (
            <>
              <span className="text-amber">High utilization.</span> Most pool
              cash is drawn — new borrows may hit insufficient-liquidity until
              repayments or deposits land.
            </>
          ) : (
            <>
              Utilization is the share of pooled assets currently lent out. Cash
              left idle earns nothing; drawn USDC earns the 11% APR for lenders.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
