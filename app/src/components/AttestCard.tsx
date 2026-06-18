"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { Icon, ObjLink, Spinner } from "./ui";
import { useTx } from "@/hooks/useTx";
import { buildAttestIncomeTx, createdId, type Attestation } from "@/lib/protocol";
import { TYPES, CONFIG } from "@/lib/config";
import { fmtUsd, shorten } from "@/lib/format";

type Verdict = {
  kind: "true" | "abort";
  digest: string;
  attestationId?: string;
  error?: string;
};

/**
 * The technical heart: fetch the enclave signature (/api/attest) then submit
 * attest_income so the chain runs verify_signature. A "Tamper" toggle flips one
 * signature byte → on-chain ABORT (E_BAD_SIGNATURE). Accept good / reject bad, live.
 */
export function AttestCard({
  incomeMonthlyUsdc,
  onAttested,
}: {
  incomeMonthlyUsdc: number;
  onAttested: (attestationId: string) => void;
}) {
  const account = useCurrentAccount();
  const { run, phase } = useTx();
  const [att, setAtt] = useState<Attestation | null>(null);
  const [signing, setSigning] = useState(false);
  const [tamper, setTamper] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // income_6mo_avg_usdc is a 6-mo AVERAGE of monthly income, in 6-dp base units.
  const income6moBase = BigInt(Math.round(incomeMonthlyUsdc * 1e6));

  async function fetchSignature(): Promise<Attestation | null> {
    if (!account) return null;
    setApiError(null);
    setSigning(true);
    try {
      const res = await fetch("/api/attest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          borrower: account.address,
          income6moUsdc: income6moBase.toString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "attest failed");
      setAtt(json as Attestation);
      return json as Attestation;
    } catch (e) {
      setApiError((e as Error).message);
      return null;
    } finally {
      setSigning(false);
    }
  }

  async function submit() {
    setVerdict(null);
    // always sign fresh so the freshness window (<10m) is satisfied
    const signed = await fetchSignature();
    if (!signed) return;
    const tx = buildAttestIncomeTx(signed, { tamper });
    const outcome = await run(tx, {
      expectFailure: tamper,
      invalidate: ["attestations"],
    });
    if (!tamper && outcome.status === "success") {
      const id = createdId(outcome.objectChanges, TYPES.attestation);
      setVerdict({ kind: "true", digest: outcome.digest, attestationId: id });
      if (id) onAttested(id);
    } else {
      setVerdict({
        kind: "abort",
        digest: outcome.digest,
        error: outcome.error,
      });
    }
  }

  const busy = signing || phase === "signing" || phase === "executing";

  return (
    <div className="space-y-5">
      {/* the payload the enclave signs */}
      <div className="rounded-lg border border-line bg-ink-900/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="label flex items-center gap-1.5">
            <Icon name="key" className="h-3.5 w-3.5 text-teal" />
            IntentMessage&lt;CreditPayload&gt; · intent scope = 2
          </span>
          <span className="chip">Ed25519 / BCS</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 font-mono text-[12px]">
          <PayloadRow k="borrower" v={account ? shorten(account.address) : "—"} />
          <PayloadRow
            k="income_6mo_avg_usdc"
            v={fmtUsd(income6moBase, { decimals: 0 })}
            accent
          />
          <PayloadRow k="data_source" v="plaid" />
          <PayloadRow k="fetch_ts_ms" v="now (fresh < 10m)" />
        </dl>
        {att && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="label mb-1">enclave signature (64 bytes)</div>
            <div
              className={`break-all rounded bg-ink-950/60 px-2.5 py-2 font-mono text-[10.5px] leading-relaxed ${
                tamper ? "text-amber" : "text-lime/90"
              }`}
            >
              {tamper
                ? flipByte0(att.signature_hex)
                : att.signature_hex}
            </div>
            {tamper && (
              <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10.5px] text-amber">
                <Icon name="bolt" className="h-3 w-3" />
                byte[0] flipped — this no longer matches the enclave pubkey
              </div>
            )}
          </div>
        )}
      </div>

      {/* tamper toggle — the money shot control */}
      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-line bg-ink-850/60 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Icon
            name="bolt"
            className={`h-4 w-4 ${tamper ? "text-amber" : "text-chalk-faint"}`}
          />
          <div>
            <div className="font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-chalk">
              Tamper with the signature
            </div>
            <div className="font-mono text-[10.5px] text-chalk-faint">
              flip one byte → the chain must abort E_BAD_SIGNATURE
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setTamper((t) => !t);
            setVerdict(null);
          }}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            tamper ? "bg-amber/80" : "bg-ink-600"
          }`}
          aria-pressed={tamper}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-ink-950 transition-transform ${
              tamper ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </label>

      <button
        onClick={submit}
        disabled={!account || busy}
        className={tamper ? "btn-amber w-full" : "btn-primary w-full"}
      >
        {busy ? (
          <>
            <Spinner />
            {signing ? "enclave signing…" : "verifying on-chain…"}
          </>
        ) : (
          <>
            <Icon name="lock" className="h-4 w-4" />
            {tamper
              ? "Submit tampered proof (expect abort)"
              : "Submit income proof → on-chain verify_signature"}
          </>
        )}
      </button>

      {apiError && (
        <div className="rounded-lg border border-amber/40 bg-amber/[0.06] px-3.5 py-2.5 font-mono text-[11px] text-amber">
          enclave error: {apiError}
        </div>
      )}

      {/* the verdict — the make-or-break visual */}
      {verdict && <VerdictPanel verdict={verdict} />}
    </div>
  );
}

function PayloadRow({
  k,
  v,
  accent,
}: {
  k: string;
  v: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-wider text-chalk-faint">{k}</dt>
      <dd className={accent ? "text-lime" : "text-chalk"}>{v}</dd>
    </div>
  );
}

function VerdictPanel({ verdict }: { verdict: Verdict }) {
  const ok = verdict.kind === "true";
  return (
    <div
      className={`animate-fade-up overflow-hidden rounded-xl border p-5 ${
        ok
          ? "border-lime/40 bg-lime/[0.07] shadow-glow"
          : "border-amber/50 bg-amber/[0.07] shadow-glow-amber"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-full ${
            ok ? "bg-lime/20 text-lime" : "bg-amber/20 text-amber"
          }`}
        >
          <Icon name={ok ? "check" : "x"} className="h-6 w-6" />
        </span>
        <div>
          <div className="label">
            sui::ed25519::ed25519_verify(sig, enclave.pk, bcs)
          </div>
          <div
            className={`font-display text-2xl font-bold tracking-tight ${
              ok ? "text-lime" : "text-amber"
            }`}
          >
            {ok ? "→ TRUE · attestation minted" : "→ ABORT · E_BAD_SIGNATURE"}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-current/15 pt-3.5">
        {ok && verdict.attestationId && (
          <Row label="IncomeAttestation">
            <ObjLink id={verdict.attestationId} />
          </Row>
        )}
        {verdict.digest && (
          <Row label="Tx digest">
            <ObjLink id={verdict.digest} kind="tx" />
          </Row>
        )}
        <Row label="Enclave">
          <ObjLink id={CONFIG.enclave} label={`${shorten(CONFIG.enclave)} (registered pk)`} />
        </Row>
      </div>

      <p
        className={`mt-4 font-mono text-[11px] leading-relaxed ${
          ok ? "text-lime-soft/80" : "text-amber-soft/90"
        }`}
      >
        {ok ? (
          <>
            <Icon name="shield" className="mr-1 inline h-3 w-3" />
            Raw bank statements never touched the chain — only the enclave-signed
            6-month average did. The contract trusts the signature, not us.
          </>
        ) : (
          <>
            <Icon name="shield" className="mr-1 inline h-3 w-3" />
            The forged attestation was rejected on-chain. A bad signature can
            never mint credit. This is the whole technical thesis in miniature.
          </>
        )}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="label w-32 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function flipByte0(hex: string): string {
  const clean = hex.replace(/^0x/, "");
  const b0 = parseInt(clean.slice(0, 2), 16) ^ 0x01;
  return b0.toString(16).padStart(2, "0") + clean.slice(2);
}
