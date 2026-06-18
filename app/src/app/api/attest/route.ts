// /api/attest — the off-chain half of the TEE underwriting loop.
//
// PORTED from scripts/attester.mjs. In production this runs INSIDE the AWS Nitro
// enclave (Marlin Oyster): it reads payroll/bank data via Plaid (keys from AWS
// Secrets Manager), computes the 6-month average, and Ed25519-signs an
// `IntentMessage<CreditPayload>{ intent: 2, timestamp_ms, payload }` whose pubkey is
// registered on chain. The raw statements never leave the enclave — only the signed
// average. The signing key is a deterministic demo key whose pubkey == the registered
// operator enclave's pubkey. It is server-side ONLY and is never exposed to the browser.
import { NextResponse } from "next/server";
import * as ed from "@noble/ed25519";
import { bcs } from "@mysten/bcs";

// Node runtime: @noble/ed25519 + Buffer + a private key must never touch the edge/browser.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTENT_SCOPE_CREDIT = 2;
const Address32 = bcs.fixedArray(32, bcs.u8());
const IntentMessage = <T>(P: ReturnType<typeof bcs.struct> | typeof Address32 | T) =>
  bcs.struct("IntentMessage", {
    intent: bcs.u8(),
    timestamp_ms: bcs.u64(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: P as any,
  });
const CreditPayload = bcs.struct("CreditPayload", {
  borrower: Address32,
  income_6mo_avg_usdc: bcs.u64(),
  data_source: bcs.vector(bcs.u8()),
  fetch_ts_ms: bcs.u64(),
});

// Deterministic demo enclave key (throwaway; the real key lives in the Nitro enclave +
// AWS Secrets Manager). Its pubkey == the registered operator enclave's pubkey.
function enclaveSecret(): Uint8Array {
  const s = new Uint8Array(32);
  for (let i = 0; i < 32; i++) s[i] = (i * 7 + 3) & 0xff;
  return s;
}

const addrBytes = (a: string): number[] =>
  Array.from(Buffer.from(a.replace(/^0x/, "").padStart(64, "0"), "hex"));

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      borrower?: string;
      income6moUsdc?: number | string;
      dataSource?: string;
    };
    const borrower = body.borrower;
    const income6moUsdc = body.income6moUsdc;
    const dataSource = body.dataSource ?? "plaid";

    if (!borrower || !/^0x[0-9a-fA-F]{1,64}$/.test(borrower)) {
      return NextResponse.json(
        { error: "invalid or missing borrower address" },
        { status: 400 }
      );
    }
    if (income6moUsdc === undefined || Number(income6moUsdc) <= 0) {
      return NextResponse.json(
        { error: "invalid or missing income6moUsdc (base units, 6 dp)" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const ts = BigInt(now);
    const secret = enclaveSecret();
    const pk = await ed.getPublicKeyAsync(secret);

    const payload = {
      borrower: addrBytes(borrower),
      income_6mo_avg_usdc: BigInt(income6moUsdc),
      data_source: Array.from(Buffer.from(dataSource)),
      fetch_ts_ms: ts,
    };

    const msg = IntentMessage(CreditPayload)
      .serialize({ intent: INTENT_SCOPE_CREDIT, timestamp_ms: ts, payload })
      .toBytes();
    const signature = await ed.signAsync(msg, secret);

    return NextResponse.json({
      borrower,
      income_6mo_avg_usdc: String(income6moUsdc),
      data_source: dataSource,
      fetch_ts_ms: now,
      timestamp_ms: now,
      signature_hex: Buffer.from(signature).toString("hex"),
      pk_hex: Buffer.from(pk).toString("hex"),
      // metadata for the UI to render the cryptographic "what the enclave signed"
      intent_scope: INTENT_SCOPE_CREDIT,
      signed_message_hex: Buffer.from(msg).toString("hex"),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `attest failed: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
