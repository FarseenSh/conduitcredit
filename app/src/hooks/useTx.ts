"use client";

import { useCallback, useState } from "react";
import { useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { useQueryClient } from "@tanstack/react-query";
import type { Transaction } from "@mysten/sui/transactions";
import type {
  SuiTransactionBlockResponse,
  SuiObjectChange,
} from "@mysten/sui/client";

export interface TxOutcome {
  digest: string;
  status: "success" | "failure";
  error?: string;
  objectChanges?: SuiObjectChange[];
  raw: SuiTransactionBlockResponse;
}

export type TxPhase = "idle" | "signing" | "executing" | "success" | "error";

/**
 * Wraps wallet sign+execute with explicit phase tracking and full effects fetch.
 *
 * The connected wallet often returns only a digest, so we re-query the fullnode with
 * showEffects+showObjectChanges to read created object ids and the real status. An
 * on-chain abort (e.g. tamper → E_BAD_SIGNATURE) surfaces as a rejected promise from
 * the wallet; callers that EXPECT a rejection (the tamper demo) pass expectFailure.
 */
export function useTx() {
  const client = useSuiClient();
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [outcome, setOutcome] = useState<TxOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setOutcome(null);
    setError(null);
  }, []);

  const run = useCallback(
    async (
      tx: Transaction,
      opts: { expectFailure?: boolean; invalidate?: string[] } = {}
    ): Promise<TxOutcome> => {
      setError(null);
      setOutcome(null);
      setPhase("signing");
      try {
        const signed = await signAndExecute({ transaction: tx });
        setPhase("executing");
        // Re-fetch with full options for object changes + authoritative status.
        const full = await client.waitForTransaction({
          digest: signed.digest,
          options: { showEffects: true, showObjectChanges: true },
        });
        const status = full.effects?.status?.status ?? "failure";
        const result: TxOutcome = {
          digest: signed.digest,
          status: status === "success" ? "success" : "failure",
          error: full.effects?.status?.error,
          objectChanges: full.objectChanges ?? undefined,
          raw: full,
        };
        setOutcome(result);

        if (result.status === "failure" && !opts.expectFailure) {
          setPhase("error");
          setError(parseMoveAbort(result.error ?? "transaction failed"));
        } else {
          setPhase("success");
        }
        // refresh affected chain reads
        for (const key of opts.invalidate ?? []) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
        return result;
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        // A wallet-rejected execution (on-chain abort) lands here.
        const result: TxOutcome = {
          digest: extractDigest(msg) ?? "",
          status: "failure",
          error: msg,
          raw: {} as SuiTransactionBlockResponse,
        };
        setOutcome(result);
        if (opts.expectFailure) {
          setPhase("success");
        } else {
          setPhase("error");
          setError(parseMoveAbort(msg));
        }
        for (const key of opts.invalidate ?? []) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
        return result;
      }
    },
    [client, queryClient, signAndExecute]
  );

  return { run, reset, phase, outcome, error };
}

/** Map raw Move abort strings to a borrower-legible message. */
export function parseMoveAbort(raw: string): string {
  const codeMap: Record<string, Record<string, string>> = {
    income: {
      "1": "E_BAD_SIGNATURE — the enclave signature did not verify on-chain",
      "2": "E_STALE — the attestation is older than the 10-minute freshness window",
    },
    credit_line: {
      "1": "E_EXPIRED_ATTESTATION — re-attest income (30-day TTL elapsed)",
      "2": "E_NOT_BORROWER — this line belongs to another address",
      "3": "E_OVER_LIMIT — amount exceeds your credit limit",
      "4": "E_WRONG_POOL — line is bound to a different pool",
      "5": "E_BLACKLISTED — borrower banned after a prior default",
      "6": "E_ALREADY_HAS_LINE — you already have an open line (one per borrower)",
      "7": "E_OUTSTANDING_DEBT — repay in full before closing the line",
    },
    credit_pool: {
      "1": "E_ZERO — amount must be greater than zero",
      "2": "E_INSUFFICIENT_LIQUIDITY — pool cash is fully utilized; try less",
      "3": "E_WRONG_POOL — LP token is for a different pool",
      "4": "E_TRANCHE_WIPED — tranche fully written off; no deposits until LPs exit",
    },
    enclave_registry: {
      "3": "E_BAD_SIGNATURE — signature failed Ed25519 verification",
    },
  };
  // MoveAbort(... ::income ...) ... , 1) — pull module + code.
  const modMatch = raw.match(/::(\w+)\b/g);
  const codeMatch = raw.match(/,\s*(\d+)\s*\)/);
  if (modMatch && codeMatch) {
    for (const m of modMatch.reverse()) {
      const mod = m.replace("::", "");
      const code = codeMatch[1];
      if (codeMap[mod]?.[code]) return codeMap[mod][code];
    }
  }
  // generic shortening
  return raw.length > 180 ? raw.slice(0, 180) + "…" : raw;
}

function extractDigest(msg: string): string | undefined {
  const m = msg.match(/[A-HJ-NP-Za-km-z1-9]{43,44}/);
  return m?.[0];
}
