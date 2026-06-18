"use client";

import { useSuiClient, useCurrentAccount } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import {
  readPool,
  readOwnedCreditLines,
  readOwnedAttestations,
  readOwnedLpTokens,
  totalUsdc,
} from "@/lib/protocol";

/** Live pool state (refetches on the global interval). */
export function usePool() {
  const client = useSuiClient();
  return useQuery({
    queryKey: ["pool"],
    queryFn: () => readPool(client),
  });
}

/** Connected wallet's total dUSDC balance. */
export function useUsdcBalance() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  return useQuery({
    queryKey: ["usdc-balance", account?.address],
    enabled: !!account,
    queryFn: () => totalUsdc(client, account!.address),
  });
}

export function useOwnedAttestations() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  return useQuery({
    queryKey: ["attestations", account?.address],
    enabled: !!account,
    queryFn: () => readOwnedAttestations(client, account!.address),
  });
}

export function useOwnedCreditLines() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  return useQuery({
    queryKey: ["credit-lines", account?.address],
    enabled: !!account,
    queryFn: () => readOwnedCreditLines(client, account!.address),
  });
}

export function useOwnedLpTokens() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  return useQuery({
    queryKey: ["lp-tokens", account?.address],
    enabled: !!account,
    queryFn: () => readOwnedLpTokens(client, account!.address),
  });
}
