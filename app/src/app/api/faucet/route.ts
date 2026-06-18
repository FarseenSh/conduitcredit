// /api/faucet — mints test dUSDC so anyone can try the app.
//
// Signs SERVER-SIDE with the DEPLOYER keypair (a throwaway testnet key) loaded from the
// sui keystore: entry 0 is base64 of [flag(1B) | secret(32B)] — drop the flag byte and
// Ed25519Keypair.fromSecretKey(secret32). Calls `${PKG}::mock_usdc::mint(treasuryCap,
// amount, recipient)`. The deployer holds the TreasuryCap, so only it can mint. This key
// is server-side ONLY and never reaches the browser.
import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { Transaction } from "@mysten/sui/transactions";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { CONFIG } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 20,000 dUSDC per request (6 dp). Generous enough to LP both tranches AND borrow/repay.
const MINT_AMOUNT = 20_000_000000n;

const KEYSTORE_PATH =
  process.env.SUI_KEYSTORE_PATH ?? "/Users/farseen/conduitcredit/.sui/sui.keystore";

function deployerKeypair(): Ed25519Keypair {
  const ks = JSON.parse(readFileSync(KEYSTORE_PATH, "utf8")) as string[];
  // entry 0: base64([flag | 32-byte secret]); drop flag byte → 32-byte Ed25519 secret.
  const decoded = Buffer.from(ks[0], "base64");
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(decoded.subarray(1)));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { recipient?: string };
    const recipient = body.recipient;
    if (!recipient || !/^0x[0-9a-fA-F]{1,64}$/.test(recipient)) {
      return NextResponse.json(
        { error: "invalid or missing recipient address" },
        { status: 400 }
      );
    }

    const kp = deployerKeypair();
    const client = new SuiClient({ url: getFullnodeUrl("testnet") });

    const tx = new Transaction();
    tx.setGasBudget(20_000_000);
    tx.moveCall({
      target: `${CONFIG.packageId}::mock_usdc::mint`,
      arguments: [
        tx.object(CONFIG.treasuryCap),
        tx.pure.u64(MINT_AMOUNT),
        tx.pure.address(recipient),
      ],
    });

    const res = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: tx,
      options: { showEffects: true },
    });

    const status = res.effects?.status?.status;
    if (status !== "success") {
      return NextResponse.json(
        {
          error: `mint failed: ${res.effects?.status?.error ?? "unknown"}`,
          digest: res.digest,
        },
        { status: 500 }
      );
    }
    await client.waitForTransaction({ digest: res.digest });

    return NextResponse.json({
      digest: res.digest,
      amount: String(MINT_AMOUNT),
      recipient,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `faucet failed: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
