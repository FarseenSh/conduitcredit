"use client";

import { useState } from "react";
import { Icon } from "./ui";
import { fmtUsd } from "@/lib/format";

// Six months of deposits a payroll/bank data API would read. Averages to $4,200/mo.
const STATEMENTS = [
  { month: "Dec 2025", payroll: 2680, gig: 1490 },
  { month: "Jan 2026", payroll: 2680, gig: 1610 },
  { month: "Feb 2026", payroll: 2680, gig: 1380 },
  { month: "Mar 2026", payroll: 2680, gig: 1720 },
  { month: "Apr 2026", payroll: 2680, gig: 1450 },
  { month: "May 2026", payroll: 2680, gig: 1470 },
];

const AVG_MONTHLY = Math.round(
  STATEMENTS.reduce((a, s) => a + s.payroll + s.gig, 0) / STATEMENTS.length
);

export function PlaidModal({
  open,
  onClose,
  onLinked,
}: {
  open: boolean;
  onClose: () => void;
  onLinked: (avgMonthlyUsdc: number) => void;
}) {
  const [stage, setStage] = useState<"login" | "consent" | "reading">("login");

  if (!open) return null;

  const reset = () => setStage("login");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={() => {
        onClose();
        reset();
      }}
    >
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-md" />
      <div
        className="relative w-full max-w-md animate-fade-up overflow-hidden rounded-xl2 border border-line bg-ink-850 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* faux-bank chrome */}
        <div className="flex items-center justify-between border-b border-line bg-ink-900/70 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal/15 text-teal">
              <Icon name="lock" className="h-3.5 w-3.5" />
            </span>
            <div className="leading-none">
              <div className="font-display text-sm font-semibold text-chalk">
                Plaid
                <span className="ml-1.5 rounded bg-amber/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber">
                  sandbox
                </span>
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-chalk-faint">
                secure income link
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              onClose();
              reset();
            }}
            className="text-chalk-faint hover:text-chalk"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {stage === "login" && (
            <div className="space-y-4">
              <div>
                <h3 className="font-display text-base font-semibold text-chalk">
                  Connect First Republic Payroll
                </h3>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-chalk-dim">
                  ConduitCredit&apos;s enclave will read your last 6 months of
                  income. It never sees your password — and your raw statements
                  never leave the secure enclave.
                </p>
              </div>
              <div className="space-y-2.5">
                <FauxField label="Username" value="user_good" />
                <FauxField label="Password" value="••••••••••" />
              </div>
              <button
                onClick={() => setStage("consent")}
                className="btn-primary w-full"
              >
                Sign in securely
              </button>
              <p className="text-center font-mono text-[10px] text-chalk-faint">
                Sandbox credentials are pre-filled. No real account is touched.
              </p>
            </div>
          )}

          {stage === "consent" && (
            <div className="space-y-4">
              <h3 className="font-display text-base font-semibold text-chalk">
                Authorize income read
              </h3>
              <div className="rounded-lg border border-line bg-ink-900/60 p-3.5">
                <div className="mb-2 label">endpoints requested (frozen in PCRs)</div>
                <ConsentRow endpoint="/identity/get" desc="verify account owner" />
                <ConsentRow
                  endpoint="/income/verification/paystubs"
                  desc="6-month income history"
                />
              </div>
              <div className="space-y-1.5">
                {STATEMENTS.map((s) => (
                  <div
                    key={s.month}
                    className="flex items-center justify-between rounded-md bg-ink-900/40 px-3 py-1.5"
                  >
                    <span className="font-mono text-[11px] text-chalk-dim">
                      {s.month}
                    </span>
                    <span className="data text-[12px] text-chalk">
                      {fmtUsd((s.payroll + s.gig) * 1e6, { decimals: 0 })}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-lg border border-lime/30 bg-lime/[0.06] px-3.5 py-2.5">
                <span className="label text-lime/80">6-mo average</span>
                <span className="data text-lg font-bold text-lime">
                  {fmtUsd(AVG_MONTHLY * 1e6, { decimals: 0 })}/mo
                </span>
              </div>
              <button
                onClick={() => {
                  setStage("reading");
                  setTimeout(() => {
                    onLinked(AVG_MONTHLY);
                    onClose();
                    reset();
                  }, 1400);
                }}
                className="btn-primary w-full"
              >
                Allow &amp; continue
              </button>
            </div>
          )}

          {stage === "reading" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="relative flex h-16 w-16 items-center justify-center">
                <span className="absolute inset-0 animate-pulse-ring rounded-full" />
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lime/15 text-lime">
                  <Icon name="lock" className="h-5 w-5" />
                </span>
              </div>
              <p className="text-center font-mono text-[12px] text-chalk-dim">
                Enclave reading paystubs inside AWS Nitro…
                <br />
                <span className="text-chalk-faint">
                  raw statements stay in the TEE
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FauxField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink-900/60 px-3 py-2">
      <div className="label mb-0.5">{label}</div>
      <div className="font-mono text-[13px] text-chalk">{value}</div>
    </div>
  );
}

function ConsentRow({ endpoint, desc }: { endpoint: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Icon name="check" className="h-3.5 w-3.5 text-teal" />
      <span className="font-mono text-[11px] text-chalk">{endpoint}</span>
      <span className="font-mono text-[10px] text-chalk-faint">— {desc}</span>
    </div>
  );
}

export { AVG_MONTHLY };
