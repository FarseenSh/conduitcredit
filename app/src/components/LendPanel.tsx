"use client";

import { useState } from "react";
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  Icon,
  ObjLink,
  Spinner,
  Stat,
  TxResult,
  AmountField,
  GasNote,
  ConnectPrompt,
} from "./ui";
import {
  usePool,
  useUsdcBalance,
  useOwnedLpTokens,
} from "@/hooks/useChainData";
import { useTx } from "@/hooks/useTx";
import {
  buildDepositTx,
  buildWithdrawTx,
  biggestUsdcCoin,
  type PoolState,
  type LpPosition,
} from "@/lib/protocol";
import { fmtUsd, toUsdc, toBase, fmtNum } from "@/lib/format";
import { JUNIOR_YIELD_WEIGHT } from "@/lib/config";

/**
 * Lenders fund a standalone pool split into two tranches. Junior absorbs the
 * first loss and earns ~3× the per-unit yield; senior sits behind that buffer.
 */
export function LendPanel() {
  const account = useCurrentAccount();
  const { data: pool } = usePool();
  const { data: balance } = useUsdcBalance();
  const { data: lps } = useOwnedLpTokens();

  if (!account) {
    return (
      <ConnectPrompt message="Connect a Sui wallet to provide liquidity. Pick the junior tranche for first-loss yield, or senior for protection.">
        <ConnectButton connectText="Connect Wallet" />
      </ConnectPrompt>
    );
  }

  const juniorLp = lps?.find((l) => l.tranche === "junior") ?? null;
  const seniorLp = lps?.find((l) => l.tranche === "senior") ?? null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <TrancheCard
          tranche="junior"
          pool={pool}
          balance={balance}
          position={juniorLp}
        />
        <TrancheCard
          tranche="senior"
          pool={pool}
          balance={balance}
          position={seniorLp}
        />
      </div>

      <WaterfallNote />
    </div>
  );
}

// ─────────────────────────── tranche card ───────────────────────────

function TrancheCard({
  tranche,
  pool,
  balance,
  position,
}: {
  tranche: "senior" | "junior";
  pool?: PoolState;
  balance?: bigint;
  position: LpPosition | null;
}) {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { run, phase, outcome, reset } = useTx();

  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"deposit" | "withdraw" | null>(null);
  const [action, setAction] = useState<"deposit" | "withdraw" | null>(null);
  const [noCoin, setNoCoin] = useState(false);

  const isJunior = tranche === "junior";
  const accent: "amber" | "teal" = isJunior ? "amber" : "teal";

  const assets = pool
    ? isJunior
      ? pool.juniorAssets
      : pool.seniorAssets
    : 0n;
  const shares = pool
    ? isJunior
      ? pool.juniorShares
      : pool.seniorShares
    : 0n;

  // This LP's redeemable value = shares × assets/shares (matches on-chain pro-rata).
  const positionValue =
    position && shares > 0n ? (position.shares * assets) / shares : 0n;

  const amt = parseFloat(amount) || 0;
  const amtBase = amt > 0 ? toBase(amt) : 0n;
  const overDeposit = balance !== undefined && amtBase > balance;
  const canDeposit = amt > 0 && !overDeposit && busy === null;

  async function deposit() {
    if (!account) return;
    setNoCoin(false);
    setBusy("deposit");
    setAction("deposit");
    const coin = await biggestUsdcCoin(client, account.address);
    if (!coin) {
      setNoCoin(true);
      setBusy(null);
      return;
    }
    const tx = buildDepositTx(tranche, coin.id, amtBase);
    await run(tx, { invalidate: ["lp-tokens", "usdc-balance", "pool"] });
    setBusy(null);
    setAmount("");
  }

  async function withdraw() {
    if (!position) return;
    setBusy("withdraw");
    setAction("withdraw");
    const tx = buildWithdrawTx(tranche, position.id);
    await run(tx, { invalidate: ["lp-tokens", "usdc-balance", "pool"] });
    setBusy(null);
  }

  const busyPhase = phase === "signing" || phase === "executing";

  return (
    <div className="panel overflow-hidden">
      {/* header band */}
      <div
        className={`flex items-center justify-between border-b px-5 py-4 ${
          isJunior
            ? "border-amber/20 bg-amber/[0.05]"
            : "border-teal/20 bg-teal/[0.05]"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              isJunior
                ? "bg-amber/15 text-amber"
                : "bg-teal/15 text-teal"
            }`}
          >
            <Icon name={isJunior ? "bolt" : "shield"} className="h-[18px] w-[18px]" />
          </span>
          <div className="leading-none">
            <div className="font-display text-base font-semibold text-chalk">
              {isJunior ? "Junior" : "Senior"} tranche
            </div>
            <div
              className={`mt-1 font-mono text-[10.5px] ${
                isJunior ? "text-amber-soft/80" : "text-teal"
              }`}
            >
              {isJunior
                ? `first-loss · ~${JUNIOR_YIELD_WEIGHT}× yield weight`
                : "protected by the junior buffer"}
            </div>
          </div>
        </div>
        <span
          className={`chip ${
            isJunior ? "border-amber/30 text-amber" : "border-teal/30 text-teal"
          }`}
        >
          {isJunior ? "higher yield" : "lower risk"}
        </span>
      </div>

      {/* live tranche stats */}
      <div className="grid grid-cols-2 gap-4 px-5 py-4">
        <Stat
          label="Tranche assets"
          value={pool ? fmtUsd(assets, { decimals: 0 }) : "—"}
          accent={accent}
        />
        <Stat
          label="Shares issued"
          value={pool ? fmtNum(toUsdc(shares), 0) : "—"}
          sub="1 share ≈ 1 dUSDC at par"
        />
      </div>

      {/* your position */}
      {position && position.shares > 0n && (
        <div className="mx-5 mb-4 rounded-lg border border-line bg-ink-900/50 p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">your position</span>
            <ObjLink id={position.id} />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="data text-xl font-semibold text-chalk">
                {fmtUsd(positionValue)}
              </div>
              <div className="mt-0.5 font-mono text-[10.5px] text-chalk-faint">
                {fmtNum(toUsdc(position.shares), 2)} shares
              </div>
            </div>
            <button
              onClick={withdraw}
              disabled={busy !== null}
              className="btn-ghost text-[12px]"
            >
              {busy === "withdraw" && busyPhase ? (
                <>
                  <Spinner className="h-3.5 w-3.5" />
                  withdrawing…
                </>
              ) : (
                "Withdraw all"
              )}
            </button>
          </div>
        </div>
      )}

      {/* deposit form */}
      <div className="border-t border-line p-5">
        <AmountField
          label={`deposit to ${isJunior ? "junior" : "senior"}`}
          value={amount}
          onChange={(v) => {
            setAmount(v);
            if (outcome) reset();
          }}
          onMax={() =>
            balance !== undefined && setAmount(String(toUsdc(balance)))
          }
          max={balance !== undefined ? fmtUsd(balance, { decimals: 2 }) : undefined}
          disabled={busy !== null}
          accent={accent}
        />
        {overDeposit && (
          <p className="mt-1.5 font-mono text-[10.5px] text-amber">
            exceeds wallet balance ({fmtUsd(balance ?? 0n)})
          </p>
        )}
        {balance === 0n && (
          <p className="mt-1.5 font-mono text-[10.5px] text-chalk-faint">
            no dUSDC yet —{" "}
            <a href="#borrow" className="link-ext">
              grab some from the faucet
            </a>
          </p>
        )}
        <button
          onClick={deposit}
          disabled={!canDeposit}
          className={`mt-3 w-full ${isJunior ? "btn-amber" : "btn-ghost"}`}
        >
          {busy === "deposit" && busyPhase ? (
            <>
              <Spinner />
              depositing…
            </>
          ) : (
            <>
              <Icon name="arrow" className="h-4 w-4" />
              Deposit to {isJunior ? "junior" : "senior"}
            </>
          )}
        </button>

        {noCoin && (
          <p className="mt-2 font-mono text-[10.5px] text-amber">
            no dUSDC coin found in your wallet — use the faucet first.
          </p>
        )}

        <TxResult
          outcome={outcome}
          successTitle={
            action === "withdraw" ? "Withdrawal confirmed" : "Deposit confirmed"
          }
          failTitle="Transaction reverted"
        />
        <GasNote className="mt-3" />
      </div>
    </div>
  );
}

// ─────────────────────────── waterfall explainer ───────────────────────────

function WaterfallNote() {
  return (
    <div className="panel-tight grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
      <div className="flex items-center gap-3 sm:flex-col sm:items-start">
        <span className="label">loss waterfall</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FlowStep
          n="1"
          color="lime"
          title="Interest in"
          body="Borrowers pay 11% APR on drawn USDC. Yield is shared per-unit, weighted 3× to junior."
        />
        <FlowStep
          n="2"
          color="amber"
          title="Junior absorbs first"
          body="If a borrower defaults, losses hit the junior tranche before anything touches senior."
        />
        <FlowStep
          n="3"
          color="teal"
          title="Senior protected"
          body="Senior only takes a loss once the entire junior buffer is exhausted — a real safety cushion."
        />
      </div>
    </div>
  );
}

function FlowStep({
  n,
  color,
  title,
  body,
}: {
  n: string;
  color: "lime" | "amber" | "teal";
  title: string;
  body: string;
}) {
  const dot =
    color === "amber"
      ? "border-amber/40 bg-amber/15 text-amber"
      : color === "teal"
        ? "border-teal/40 bg-teal/15 text-teal"
        : "border-lime/40 bg-lime/15 text-lime";
  return (
    <div className="rounded-lg border border-line bg-ink-900/40 p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[10px] font-semibold ${dot}`}
        >
          {n}
        </span>
        <span className="font-mono text-[11.5px] font-medium uppercase tracking-[0.08em] text-chalk">
          {title}
        </span>
      </div>
      <p className="font-mono text-[10.5px] leading-relaxed text-chalk-dim">
        {body}
      </p>
    </div>
  );
}
