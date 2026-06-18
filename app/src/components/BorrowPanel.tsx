"use client";

import { useMemo, useState } from "react";
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useQueryClient } from "@tanstack/react-query";
import {
  Icon,
  ObjLink,
  Spinner,
  Stat,
  TxResult,
  AmountField,
  Bar,
  GasNote,
  ConnectPrompt,
} from "./ui";
import { AttestCard } from "./AttestCard";
import { PlaidModal, AVG_MONTHLY } from "./PlaidModal";
import {
  useUsdcBalance,
  useOwnedAttestations,
  useOwnedCreditLines,
} from "@/hooks/useChainData";
import { useTx } from "@/hooks/useTx";
import {
  buildOpenCreditLineTx,
  buildBorrowTx,
  buildRepayTx,
  biggestUsdcCoin,
  createdId,
  type CreditLineState,
  type AttestationState,
} from "@/lib/protocol";
import { Transaction } from "@mysten/sui/transactions";
import { CONFIG, TYPES, LTV_BPS, APR_BPS } from "@/lib/config";
import { fmtUsd, toUsdc, toBase, bpsToPct, fmtNum } from "@/lib/format";

/**
 * The borrower centerpiece. A linear, legible stepper that takes Maria from
 * "no funds, no proof" to a live USDC credit line she can draw and repay —
 * each step gated on the previous one's on-chain result.
 */
export function BorrowPanel() {
  const account = useCurrentAccount();

  // step state
  const [linkedMonthly, setLinkedMonthly] = useState<number | null>(null);
  const [plaidOpen, setPlaidOpen] = useState(false);
  const [freshAttId, setFreshAttId] = useState<string | null>(null);

  // chain reads
  const { data: balance } = useUsdcBalance();
  const { data: attestations } = useOwnedAttestations();
  const { data: lines } = useOwnedCreditLines();

  // The freshest non-expired attestation (or the one just minted via onAttested).
  const usableAtt = useMemo(
    () => pickFreshAttestation(attestations, freshAttId),
    [attestations, freshAttId]
  );

  // A borrower's active line: prefer one with a balance, else the most recent.
  const line = useMemo(() => pickActiveLine(lines), [lines]);

  if (!account) {
    return (
      <ConnectPrompt message="Connect a Sui wallet to play Maria — get test funds, link income, prove it inside the enclave, and draw a credit line.">
        <ConnectButton connectText="Connect Wallet" />
      </ConnectPrompt>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* ── left rail: the four setup steps ── */}
      <div className="space-y-5 lg:col-span-7">
        <FundStep balance={balance} />
        <LinkStep
          linkedMonthly={linkedMonthly}
          onOpen={() => setPlaidOpen(true)}
        />
        {(linkedMonthly !== null || usableAtt) && (
          <ProveStep
            monthly={linkedMonthly ?? AVG_MONTHLY}
            onAttested={(id) => setFreshAttId(id)}
          />
        )}
      </div>

      {/* ── right rail: open / manage the line ── */}
      <div className="space-y-5 lg:col-span-5">
        {!line && (
          <OpenLineStep attestation={usableAtt} hasFunds={(balance ?? 0n) > 0n} />
        )}
        {line && <LineCard line={line} />}
      </div>

      <PlaidModal
        open={plaidOpen}
        onClose={() => setPlaidOpen(false)}
        onLinked={(avg) => setLinkedMonthly(avg)}
      />
    </div>
  );
}

// ─────────────────────────── step shell ───────────────────────────

function StepCard({
  n,
  title,
  done,
  active = true,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`panel p-5 ${active ? "" : "opacity-60"}`}>
      <div className="mb-4 flex items-center gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[12px] font-semibold ${
            done
              ? "border-lime/40 bg-lime/15 text-lime"
              : "border-line bg-ink-800 text-chalk-dim"
          }`}
        >
          {done ? <Icon name="check" className="h-3.5 w-3.5" /> : n}
        </span>
        <h3 className="font-display text-[15px] font-semibold tracking-tight text-chalk">
          {title}
        </h3>
        {done && <span className="ml-auto stamp-ok">done</span>}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────── step 1 — funds ───────────────────────────

function FundStep({ balance }: { balance?: bigint }) {
  const account = useCurrentAccount();
  const invalidate = useInvalidate();
  const [loading, setLoading] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasFunds = (balance ?? 0n) > 0n;

  async function getFunds() {
    if (!account) return;
    setError(null);
    setDigest(null);
    setLoading(true);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipient: account.address }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "faucet failed");
      setDigest(json.digest as string);
      invalidate(["usdc-balance"]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <StepCard n={1} title="Get test funds" done={hasFunds}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="label mb-1">wallet balance</div>
          <div className="data text-2xl font-semibold text-chalk">
            {balance === undefined ? "—" : fmtUsd(balance)}
          </div>
        </div>
        <button onClick={getFunds} disabled={loading} className="btn-primary">
          {loading ? (
            <>
              <Spinner />
              minting…
            </>
          ) : (
            <>
              <Icon name="wallet" className="h-4 w-4" />
              Get test dUSDC
            </>
          )}
        </button>
      </div>
      {digest && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-lime/30 bg-lime/[0.06] px-3 py-2 text-[11px]">
          <Icon name="check" className="h-3.5 w-3.5 text-lime" />
          <span className="label">minted 20,000 dUSDC · tx</span>
          <ObjLink id={digest} kind="tx" />
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-lg border border-amber/40 bg-amber/[0.06] px-3 py-2 font-mono text-[11px] text-amber">
          faucet error: {error}
        </div>
      )}
      <GasNote className="mt-3" />
    </StepCard>
  );
}

// ─────────────────────────── step 2 — link income ───────────────────────────

function LinkStep({
  linkedMonthly,
  onOpen,
}: {
  linkedMonthly: number | null;
  onOpen: () => void;
}) {
  const linked = linkedMonthly !== null;
  return (
    <StepCard n={2} title="Link income (Plaid Sandbox)" done={linked}>
      <p className="mb-4 font-mono text-[11.5px] leading-relaxed text-chalk-dim">
        The enclave reads six months of payroll + gig deposits inside AWS Nitro.
        Raw statements never leave the TEE — only the{" "}
        <span className="text-lime">6-month average</span> is signed.
      </p>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="label mb-1">6-mo average income</div>
          <div className="data text-2xl font-semibold text-chalk">
            {fmtUsd((linkedMonthly ?? AVG_MONTHLY) * 1e6, { decimals: 0 })}
            <span className="ml-1 text-[13px] font-normal text-chalk-faint">
              /mo
            </span>
          </div>
          {!linked && (
            <div className="mt-0.5 font-mono text-[10px] text-chalk-faint">
              preview — link to confirm
            </div>
          )}
        </div>
        <button onClick={onOpen} className={linked ? "btn-ghost" : "btn-primary"}>
          <Icon name="lock" className="h-4 w-4" />
          {linked ? "Re-link income" : "Link income"}
        </button>
      </div>
    </StepCard>
  );
}

// ─────────────────────────── step 3 — prove (hosts AttestCard) ───────────────

function ProveStep({
  monthly,
  onAttested,
}: {
  monthly: number;
  onAttested: (id: string) => void;
}) {
  return (
    <StepCard n={3} title="Prove income inside the enclave" active>
      <p className="mb-4 font-mono text-[11.5px] leading-relaxed text-chalk-dim">
        Submit the enclave-signed average so the chain runs{" "}
        <span className="text-chalk">verify_signature</span>. Flip the tamper
        toggle to watch a forged proof get rejected on-chain — the whole thesis,
        live.
      </p>
      <AttestCard incomeMonthlyUsdc={monthly} onAttested={onAttested} />
    </StepCard>
  );
}

// ─────────────────────────── step 4 — open line ───────────────────────────

function OpenLineStep({
  attestation,
  hasFunds,
}: {
  attestation: AttestationState | null;
  hasFunds: boolean;
}) {
  const { run, phase, outcome } = useTx();
  const [createdLineId, setCreatedLineId] = useState<string | undefined>();

  const limit = attestation
    ? (attestation.income * BigInt(LTV_BPS)) / 10000n
    : 0n;

  async function open() {
    if (!attestation) return;
    const tx = buildOpenCreditLineTx(attestation.id);
    const res = await run(tx, { invalidate: ["credit-lines"] });
    if (res.status === "success") {
      setCreatedLineId(createdId(res.objectChanges, TYPES.creditLine));
    }
  }

  const busy = phase === "signing" || phase === "executing";

  return (
    <div className="panel grain overflow-hidden p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-ink-800 font-mono text-[12px] font-semibold text-chalk-dim">
          4
        </span>
        <h3 className="font-display text-[15px] font-semibold tracking-tight text-chalk">
          Draw a credit line
        </h3>
      </div>

      {!attestation ? (
        <div className="rounded-lg border border-dashed border-line bg-ink-900/40 px-4 py-8 text-center">
          <Icon
            name="shield"
            className="mx-auto mb-2 h-6 w-6 text-chalk-faint"
          />
          <p className="font-mono text-[11.5px] leading-relaxed text-chalk-dim">
            Prove your income in step&nbsp;3 first. A valid, unexpired
            attestation unlocks the credit line.
          </p>
        </div>
      ) : (
        <>
          {/* the underwriting preview, before signing */}
          <div className="rounded-lg border border-lime/25 bg-lime/[0.04] p-4">
            <div className="label mb-3 text-lime/80">
              underwrite · sized to verified income
            </div>
            <div className="space-y-2.5 font-mono text-[12.5px]">
              <PreviewRow
                k="6-mo avg income"
                v={fmtUsd(attestation.income, { decimals: 0 })}
              />
              <PreviewRow
                k={`LTV (${bpsToPct(LTV_BPS, 0)})`}
                v={`× ${LTV_BPS / 100}%`}
              />
              <div className="my-1 h-px bg-lime/15" />
              <PreviewRow
                k="credit limit"
                v={fmtUsd(limit, { decimals: 0 })}
                accent
              />
              <PreviewRow k="APR" v={bpsToPct(APR_BPS)} />
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-lime/15 pt-2.5 text-[10.5px]">
              <span className="label">attestation</span>
              <ObjLink id={attestation.id} />
            </div>
          </div>

          <button
            onClick={open}
            disabled={busy}
            className="btn-primary mt-4 w-full"
          >
            {busy ? (
              <>
                <Spinner />
                opening line…
              </>
            ) : (
              <>
                <Icon name="bolt" className="h-4 w-4" />
                Open credit line
              </>
            )}
          </button>
          {!hasFunds && (
            <p className="mt-2 text-center font-mono text-[10.5px] text-chalk-faint">
              tip: grab test dUSDC in step 1 before you borrow
            </p>
          )}
          <TxResult
            outcome={outcome}
            successTitle="Credit line opened"
            failTitle="Could not open line"
            createdLabel="CreditLine"
            createdId={createdLineId}
          />
        </>
      )}
    </div>
  );
}

function PreviewRow({
  k,
  v,
  accent,
}: {
  k: string;
  v: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-chalk-faint">{k}</span>
      <span className={accent ? "text-lg font-bold text-lime" : "text-chalk"}>
        {v}
      </span>
    </div>
  );
}

// ─────────────────────────── step 5 — borrow / repay ───────────────────────────

function LineCard({ line }: { line: CreditLineState }) {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { run, phase, outcome, reset } = useTx();
  const { data: balance } = useUsdcBalance();

  const [mode, setMode] = useState<"borrow" | "repay">("borrow");
  const [amount, setAmount] = useState("");
  const [lastAction, setLastAction] = useState<"borrow" | "repay" | "close" | null>(
    null
  );
  const [busyKind, setBusyKind] = useState<"borrow" | "repay" | "close" | null>(
    null
  );

  const available = line.creditLimit - line.outstanding;
  const totalOwed = line.outstanding + line.accruedInterest;
  const utilPct =
    line.creditLimit === 0n
      ? 0
      : Number((line.outstanding * 10000n) / line.creditLimit) / 100;
  const closable = line.outstanding === 0n && line.accruedInterest === 0n;

  const amt = parseFloat(amount) || 0;
  const amtBase = amt > 0 ? toBase(amt) : 0n;
  const overBorrow = mode === "borrow" && amtBase > available;
  const overRepay =
    mode === "repay" && balance !== undefined && amtBase > balance;
  const canSubmit = amt > 0 && !overBorrow && !overRepay && busyKind === null;

  async function doBorrow() {
    setBusyKind("borrow");
    setLastAction("borrow");
    const tx = buildBorrowTx(line.id, amtBase);
    await run(tx, { invalidate: ["credit-lines", "usdc-balance", "pool"] });
    setBusyKind(null);
    setAmount("");
  }

  async function doRepay() {
    if (!account) return;
    setBusyKind("repay");
    setLastAction("repay");
    const coin = await biggestUsdcCoin(client, account.address);
    if (!coin) {
      setBusyKind(null);
      return;
    }
    const tx = buildRepayTx(line.id, coin.id, amtBase);
    await run(tx, { invalidate: ["credit-lines", "usdc-balance", "pool"] });
    setBusyKind(null);
    setAmount("");
  }

  async function doClose() {
    setBusyKind("close");
    setLastAction("close");
    const tx = new Transaction();
    tx.moveCall({
      target: `${CONFIG.packageId}::credit_line::close_credit_line`,
      arguments: [tx.object(line.id), tx.object(CONFIG.blacklist)],
    });
    await run(tx, { invalidate: ["credit-lines"] });
    setBusyKind(null);
  }

  function fillMax() {
    if (mode === "borrow") setAmount(String(toUsdc(available)));
    else setAmount(String(toUsdc(totalOwed))); // repay clamps to what's owed on-chain
  }

  const busy = phase === "signing" || phase === "executing";

  return (
    <div className="panel overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between border-b border-line bg-ink-900/50 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-lime/40 bg-lime/15 text-lime">
            <Icon name="check" className="h-3.5 w-3.5" />
          </span>
          <div className="leading-none">
            <div className="font-display text-[14px] font-semibold text-chalk">
              Maria&apos;s credit line
            </div>
            <div className="mt-1 font-mono text-[10px] text-chalk-faint">
              <ObjLink id={line.id} />
            </div>
          </div>
        </div>
        <span className="chip">
          {bpsToPct(line.irBps)} APR
        </span>
      </div>

      {/* numbers */}
      <div className="grid grid-cols-2 gap-4 px-5 py-4">
        <Stat label="Credit limit" value={fmtUsd(line.creditLimit, { decimals: 0 })} />
        <Stat
          label="Available"
          value={fmtUsd(available)}
          accent="lime"
        />
        <Stat label="Outstanding" value={fmtUsd(line.outstanding)} />
        <Stat
          label="Accrued interest"
          value={fmtUsd(line.accruedInterest)}
          accent={line.accruedInterest > 0n ? "amber" : "default"}
        />
      </div>

      {/* utilization */}
      <div className="px-5 pb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="label">utilization</span>
          <span className="data text-[12px] text-chalk-dim">
            {fmtNum(utilPct, 1)}%
          </span>
        </div>
        <Bar pct={utilPct} color={utilPct > 80 ? "amber" : "lime"} />
      </div>

      {/* borrow / repay controls */}
      <div className="border-t border-line p-5">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-ink-900/60 p-1">
          <TabBtn active={mode === "borrow"} onClick={() => { setMode("borrow"); setAmount(""); reset(); }}>
            Borrow
          </TabBtn>
          <TabBtn active={mode === "repay"} onClick={() => { setMode("repay"); setAmount(""); reset(); }}>
            Repay
          </TabBtn>
        </div>

        <AmountField
          label={mode === "borrow" ? "draw amount" : "repay amount"}
          value={amount}
          onChange={setAmount}
          onMax={fillMax}
          max={
            mode === "borrow"
              ? fmtUsd(available, { decimals: 2 })
              : fmtUsd(totalOwed, { decimals: 2 })
          }
          disabled={busyKind !== null}
          accent={mode === "borrow" ? "lime" : "teal"}
        />

        {overBorrow && (
          <p className="mt-1.5 font-mono text-[10.5px] text-amber">
            exceeds available credit ({fmtUsd(available)})
          </p>
        )}
        {overRepay && (
          <p className="mt-1.5 font-mono text-[10.5px] text-amber">
            more than your wallet balance ({fmtUsd(balance ?? 0n)})
          </p>
        )}

        <button
          onClick={mode === "borrow" ? doBorrow : doRepay}
          disabled={!canSubmit}
          className={`mt-3 w-full ${mode === "borrow" ? "btn-primary" : "btn-ghost"}`}
        >
          {busy && busyKind !== "close" ? (
            <>
              <Spinner />
              {busyKind === "borrow" ? "drawing…" : "repaying…"}
            </>
          ) : mode === "borrow" ? (
            <>
              <Icon name="arrow" className="h-4 w-4" />
              Borrow dUSDC
            </>
          ) : (
            <>
              <Icon name="check" className="h-4 w-4" />
              Repay dUSDC
            </>
          )}
        </button>

        {lastAction !== "close" && (
          <TxResult
            outcome={outcome}
            successTitle={lastAction === "repay" ? "Repayment confirmed" : "Draw confirmed"}
            failTitle="Transaction reverted"
          />
        )}

        {/* close line — only when fully repaid */}
        {closable && (
          <div className="mt-4 border-t border-line pt-4">
            <button
              onClick={doClose}
              disabled={busyKind !== null}
              className="w-full font-mono text-[11px] uppercase tracking-[0.12em] text-chalk-faint transition-colors hover:text-rose"
            >
              {busyKind === "close" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="h-3.5 w-3.5" />
                  closing…
                </span>
              ) : (
                "Close this line (fully repaid)"
              )}
            </button>
            {lastAction === "close" && (
              <TxResult outcome={outcome} successTitle="Line closed" failTitle="Could not close" />
            )}
          </div>
        )}
      </div>

      <p className="border-t border-line px-5 py-3 font-mono text-[10px] leading-relaxed text-chalk-faint">
        Drawn USDC flows from the tranched pool. Interest accrues at{" "}
        {bpsToPct(line.irBps)} APR and is split to lenders — junior first.
      </p>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md py-2 font-mono text-[12px] font-medium uppercase tracking-[0.1em] transition-colors ${
        active
          ? "bg-ink-700 text-chalk"
          : "text-chalk-faint hover:text-chalk-dim"
      }`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────── helpers ───────────────────────────

/** Invalidate react-query reads so balances / lines / pool refresh after a tx. */
function useInvalidate() {
  const qc = useQueryClient();
  return (keys: string[]) => {
    for (const k of keys) qc.invalidateQueries({ queryKey: [k] });
  };
}

/** newest, unexpired attestation; falls back to the just-minted id if present. */
function pickFreshAttestation(
  atts: AttestationState[] | undefined,
  freshId: string | null
): AttestationState | null {
  if (!atts || atts.length === 0) return null;
  const now = Date.now();
  const valid = atts.filter((a) => a.expiryTs > now);
  const pool = valid.length ? valid : atts;
  // prefer the explicitly-minted one if it's in the set
  const fresh = freshId ? pool.find((a) => a.id === freshId) : undefined;
  if (fresh) return fresh;
  return [...pool].sort((a, b) => b.attestationTs - a.attestationTs)[0];
}

/** a borrower's active line: one with a balance, else the most recently opened. */
function pickActiveLine(
  lines: CreditLineState[] | undefined
): CreditLineState | null {
  if (!lines || lines.length === 0) return null;
  const withBalance = lines.find(
    (l) => l.outstanding > 0n || l.accruedInterest > 0n
  );
  if (withBalance) return withBalance;
  return [...lines].sort((a, b) => b.openedTs - a.openedTs)[0];
}
