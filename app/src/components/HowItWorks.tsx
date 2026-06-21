"use client";

import { Icon, ObjLink, Code } from "./ui";
import { CONFIG, LTV_BPS } from "@/lib/config";

/**
 * The moat, in three steps: read inside the TEE → sign an IntentMessage the
 * chain verifies natively → size a credit line against the proven income.
 * The punchline: an EVM chain can't verify a Nitro attestation without
 * re-introducing a trusted oracle. Sui can, in the framework.
 */
export function HowItWorks() {
  return (
    <div className="space-y-8">
      <div className="grid gap-5 lg:grid-cols-3">
        <Step
          n="01"
          icon="lock"
          accent="teal"
          title="Read income inside AWS Nitro"
          lead="The enclave pulls 6 months of payroll + bank data via Plaid."
          body={
            <>
              Raw statements are decrypted and averaged{" "}
              <span className="text-chalk">inside the TEE</span> — they never
              leave it, never touch the chain, never touch our servers. The
              requestable endpoints are frozen into the enclave&apos;s PCR
              measurements at build time.{" "}
              <span className="text-chalk-faint">
                (Plaid Sandbox in the demo; production keys, already whitelisted,
                on mainnet.)
              </span>
            </>
          }
          foot={
            <div className="flex flex-wrap gap-1.5">
              <code className="chip">/identity/get</code>
              <code className="chip">/income/.../paystubs</code>
            </div>
          }
        />
        <Step
          n="02"
          icon="key"
          accent="lime"
          title="Sign a proof the chain verifies natively"
          lead="The enclave Ed25519-signs an IntentMessage<CreditPayload>."
          body={
            <>
              Intent scope <span className="text-lime">= 2</span>, BCS-encoded.
              On-chain, <Code accent="lime">enclave::verify_signature</Code>{" "}
              checks it against a{" "}
              <span className="text-chalk">registered Enclave</span> object. The
              native <Code accent="lime">sui::nitro_attestation</Code> path
              (AWS root CA in the framework) binds that key to a real Nitro
              attestation — proven in our suite against a genuine AWS attestation.
              The live demo verifies against the operator-registered key (the
              documented fallback); <span className="text-chalk">identical
              downstream</span>.
            </>
          }
          foot={
            <div className="flex items-center gap-2 text-[10.5px]">
              <span className="label">registered enclave · operator (testnet)</span>
              <ObjLink id={CONFIG.enclave} />
            </div>
          }
        />
        <Step
          n="03"
          icon="chart"
          accent="amber"
          title="Size & fund the credit line"
          lead={`Credit limit = 6-mo average income × ${LTV_BPS / 100}%.`}
          body={
            <>
              A USDC <span className="text-chalk">CreditLine</span> opens at{" "}
              <span className="text-chalk">11% APR</span>, drawn from a
              standalone pool split{" "}
              <span className="text-amber">junior</span> (first-loss) /{" "}
              <span className="text-teal">senior</span> (protected). Interest
              accrues to lenders, weighted to junior.
            </>
          }
          foot={
            <div className="flex items-center gap-2 text-[10.5px]">
              <span className="label">credit pool</span>
              <ObjLink id={CONFIG.pool} />
            </div>
          }
        />
      </div>

      {/* the moat callout */}
      <div className="panel grain relative overflow-hidden p-6 lg:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-lime/10 blur-[100px]" />
        <div className="relative grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <div className="mb-3 flex items-center gap-2">
              <Icon name="shield" className="h-4 w-4 text-lime" />
              <span className="label text-lime/80">why this is hard to fake</span>
            </div>
            <h3 className="text-balance font-display text-2xl font-bold leading-tight tracking-tight text-chalk lg:text-[1.75rem]">
              An EVM chain can&apos;t verify a Nitro attestation without
              re-introducing a{" "}
              <span className="text-amber">trusted oracle</span>. Sui does it{" "}
              <span className="text-grad-lime">natively</span>.
            </h3>
            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-chalk-dim">
              The whole security model collapses to one line:{" "}
              <Code accent="lime">borrow()</Code> accepts a good enclave
              signature and rejects a bad one. No middleman re-signs the income;
              the chain checks the cryptography itself. Flip a byte in the proof
              and the transaction aborts —{" "}
              <a href="#borrow" className="link-ext">
                try the tamper toggle
              </a>
              .
            </p>
          </div>

          <div className="lg:col-span-5">
            <Compare />
          </div>
        </div>
      </div>

      {/* mainnet path */}
      <div className="panel-tight flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 sm:w-44 sm:shrink-0">
          <Icon name="bolt" className="h-4 w-4 text-teal" />
          <span className="label">mainnet path</span>
        </div>
        <p className="font-mono text-[11.5px] leading-relaxed text-chalk-dim">
          Swap Plaid Sandbox → <span className="text-chalk">production</span>,
          and the demo signer → a real Marlin Oyster enclave registered with{" "}
          <Code accent="teal">register_via_nitro</Code>. The pool is generic
          over the coin type, so it moves from dUSDC to{" "}
          <span className="text-chalk">native USDC</span> (also 6-dp) with{" "}
          <span className="text-lime">no contract change</span>. Every object,
          tranche, and the demo stay identical.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────── step card ───────────────────────────

function Step({
  n,
  icon,
  accent,
  title,
  lead,
  body,
  foot,
}: {
  n: string;
  icon: "lock" | "key" | "chart";
  accent: "teal" | "lime" | "amber";
  title: string;
  lead: string;
  body: React.ReactNode;
  foot: React.ReactNode;
}) {
  const ring =
    accent === "amber"
      ? "text-amber"
      : accent === "lime"
        ? "text-lime"
        : "text-teal";
  const chipBg =
    accent === "amber"
      ? "bg-amber/15"
      : accent === "lime"
        ? "bg-lime/15"
        : "bg-teal/15";
  const numColor =
    accent === "amber"
      ? "text-amber/40"
      : accent === "lime"
        ? "text-lime/40"
        : "text-teal/40";
  return (
    <div className="panel flex flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${chipBg} ${ring}`}
        >
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <span className={`font-mono text-2xl font-bold ${numColor}`}>{n}</span>
      </div>
      <h3 className="font-display text-[17px] font-semibold leading-snug tracking-tight text-chalk">
        {title}
      </h3>
      <p className={`mt-1.5 font-mono text-[11px] ${ring}`}>{lead}</p>
      <p className="mt-3 flex-1 text-[13px] leading-relaxed text-chalk-dim">
        {body}
      </p>
      <div className="mt-4 border-t border-line pt-3.5">{foot}</div>
    </div>
  );
}

// ─────────────────────────── EVM vs Sui compare ───────────────────────────

function Compare() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber/25 bg-amber/[0.05] p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber/20 text-amber">
            <Icon name="x" className="h-3 w-3" />
          </span>
          <span className="font-mono text-[11.5px] font-semibold uppercase tracking-[0.1em] text-amber">
            EVM
          </span>
        </div>
        <p className="font-mono text-[10.5px] leading-relaxed text-amber-soft/90">
          No native attestation verify. You bolt on an off-chain oracle that
          re-signs the income — re-introducing exactly the trusted third party
          DeFi exists to remove.
        </p>
      </div>
      <div className="rounded-xl border border-lime/30 bg-lime/[0.06] p-4 shadow-glow">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lime/20 text-lime">
            <Icon name="check" className="h-3 w-3" />
          </span>
          <span className="font-mono text-[11.5px] font-semibold uppercase tracking-[0.1em] text-lime">
            Sui
          </span>
        </div>
        <p className="font-mono text-[10.5px] leading-relaxed text-lime-soft/90">
          <Code accent="lime">sui::nitro_attestation</Code> +{" "}
          <Code accent="lime">ed25519_verify</Code> in the framework. The
          contract trusts the AWS hardware root, not us. One cheap on-chain
          check per request.
        </p>
      </div>
    </div>
  );
}
