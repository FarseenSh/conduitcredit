// /api/plaid-income — reads the borrower's last months of income from Plaid (Sandbox)
// and returns the computed average monthly income. The dApp uses this number as the
// borrower's income before the enclave signs the attestation. If Plaid isn't configured
// (no keys) or the read fails, it returns { configured: false } so the UI falls back to
// representative income — the demo never dead-ends.
//
// In production this read happens INSIDE the Nitro enclave; here it's the testnet stand-in.
import { NextResponse } from "next/server";
import { plaidConfigured, fetchSandboxMonthlyIncome } from "@/lib/plaid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // the sandbox historical-sync poll can take a few seconds

export async function POST() {
  if (!plaidConfigured()) {
    return NextResponse.json({ configured: false });
  }
  try {
    const income = await fetchSandboxMonthlyIncome();
    return NextResponse.json({ configured: true, ...income });
  } catch (e) {
    // Surface the reason but keep a 200 so the client falls back gracefully.
    return NextResponse.json({ configured: false, error: (e as Error).message });
  }
}
