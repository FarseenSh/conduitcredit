"use client";

import { Icon } from "./ui";
import { usePool } from "@/hooks/useChainData";
import { fmtUsd } from "@/lib/format";

export function Hero() {
  const { data: pool } = usePool();

  return (
    <section id="top" className="relative overflow-hidden">
      {/* atmospheric grid + glow */}
      <div className="grid-texture pointer-events-none absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-lime/10 blur-[120px]" />
      <div className="pointer-events-none absolute -left-20 top-40 h-[420px] w-[420px] rounded-full bg-teal/10 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-16 lg:px-8 lg:pt-24">
        {/* eyebrow */}
        <div
          className="mb-7 inline-flex animate-fade-up items-center gap-2 rounded-full border border-line bg-ink-850/60 py-1.5 pl-2 pr-3.5"
          style={{ animationDelay: "0ms" }}
        >
          <span className="flex h-5 items-center gap-1.5 rounded-full bg-lime/15 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-lime">
            <Icon name="bolt" className="h-3 w-3" /> live on Sui testnet
          </span>
          <span className="font-mono text-[11px] tracking-wide text-chalk-dim">
            DeFi &amp; Payments · Sui Overflow 2026
          </span>
        </div>

        <div className="grid items-end gap-10 lg:grid-cols-12">
          {/* headline column */}
          <div className="lg:col-span-7">
            <h1
              className="animate-fade-up text-balance font-display text-[2.7rem] font-bold leading-[0.98] tracking-tightest text-chalk sm:text-6xl lg:text-[4.4rem]"
              style={{ animationDelay: "60ms" }}
            >
              Maria has{" "}
              <span className="text-grad-lime">$4,200/mo</span> of provable
              income and <span className="text-amber">$0</span> idle crypto.
            </h1>
            <p
              className="mt-6 max-w-xl animate-fade-up text-balance text-lg leading-relaxed text-chalk-dim"
              style={{ animationDelay: "140ms" }}
            >
              Every Sui money market — Suilend, NAVI, Scallop — wants{" "}
              <span className="text-chalk">130–200% collateral</span>. They
              only serve people who already have capital. ConduitCredit
              underwrites her <span className="text-chalk">income</span>, not her
              balance sheet.
            </p>

            <div
              className="mt-8 flex animate-fade-up flex-wrap items-center gap-3"
              style={{ animationDelay: "220ms" }}
            >
              <a href="#borrow" className="btn-primary group">
                Underwrite Maria&apos;s income
                <Icon
                  name="arrow"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                />
              </a>
              <a href="#lend" className="btn-ghost">
                Provide liquidity
              </a>
            </div>
          </div>

          {/* thesis / moat card */}
          <div className="lg:col-span-5">
            <div
              className="panel animate-fade-up grain overflow-hidden p-6"
              style={{ animationDelay: "300ms" }}
            >
              <div className="mb-4 flex items-center gap-2">
                <Icon name="lock" className="h-4 w-4 text-lime" />
                <span className="label text-lime/80">the one-sentence thesis</span>
              </div>
              <p className="text-[15px] leading-relaxed text-chalk">
                Prove six months of real income to the chain{" "}
                <span className="text-lime">without publishing your bank
                statements</span>{" "}
                — via an AWS Nitro enclave the chain{" "}
                <span className="underline decoration-lime/40 underline-offset-4">
                  natively verifies
                </span>{" "}
                — and draw a USDC credit line sized to that income.
              </p>
              <div className="my-5 h-px bg-line" />
              <div className="flex items-start gap-2.5">
                <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                <p className="font-mono text-[12px] leading-relaxed text-chalk-dim">
                  <span className="text-teal">Why Sui:</span> the AWS root CA
                  ships in the framework. EVM can&apos;t verify a Nitro
                  attestation without a trust-reintroducing oracle. The
                  per-request check is a cheap on-chain{" "}
                  <span className="text-chalk">Ed25519 verify</span>.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* live ticker stripe */}
        <div
          className="mt-12 grid animate-fade-up grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-4"
          style={{ animationDelay: "380ms" }}
        >
          <TickerCell
            label="Credit limit"
            value="30% of income"
            sub="$4,200 → $1,260 for Maria"
          />
          <TickerCell
            label="Pool liquidity"
            value={pool ? fmtUsd(pool.liquidity, { decimals: 0 }) : "—"}
            sub="senior + junior tranches"
          />
          <TickerCell
            label="On-chain borrowed"
            value={pool ? fmtUsd(pool.totalBorrowed, { decimals: 0 }) : "—"}
            sub="drawn against income"
          />
          <TickerCell
            label="Trust anchor"
            value="Nitro PCR"
            sub="no oracle · no middleman"
          />
        </div>
      </div>
    </section>
  );
}

function TickerCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-ink-900 px-5 py-4">
      <div className="label mb-1">{label}</div>
      <div className="data text-lg font-semibold text-chalk">{value}</div>
      <div className="mt-0.5 font-mono text-[10.5px] text-chalk-faint">{sub}</div>
    </div>
  );
}
