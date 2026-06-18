import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { BorrowPanel } from "@/components/BorrowPanel";
import { LendPanel } from "@/components/LendPanel";
import { PoolPanel } from "@/components/PoolPanel";
import { HowItWorks } from "@/components/HowItWorks";
import { SectionWrap, ObjLink, Icon } from "@/components/ui";
import { CONFIG } from "@/lib/config";

export default function Page() {
  return (
    <>
      <Header />
      <main>
        <Hero />

        <SectionWrap
          id="borrow"
          tag="01 / borrow"
          title={
            <>
              Underwrite Maria&apos;s income —{" "}
              <span className="text-grad-lime">no collateral</span>
            </>
          }
          intro="Step through it as the borrower: claim test funds, link six months of income, prove it inside the enclave, and draw a USDC credit line sized to what you actually earn."
        >
          <BorrowPanel />
        </SectionWrap>

        <SectionWrap
          id="lend"
          tag="02 / lend"
          title="Fund the pool — pick your tranche"
          intro="Provide the USDC that Maria draws. Choose junior for first-loss, higher-yield exposure, or senior to sit behind that buffer. Withdraw your share any time."
          texture
        >
          <LendPanel />
        </SectionWrap>

        <SectionWrap
          id="pool"
          tag="03 / pool"
          title="Live pool & tranche health"
          intro="Every number below is read straight from the shared CreditPool object on testnet and refreshes every few seconds — and the moment you borrow, repay, or deposit."
        >
          <PoolPanel />
        </SectionWrap>

        <SectionWrap
          id="how"
          tag="04 / how"
          title="Why this is hard to fake"
          intro="The Sui primitive doing the irreplaceable work: on-chain verification of an AWS Nitro attestation. Here is the whole loop, and why an EVM clone can't copy it."
          texture
        >
          <HowItWorks />
        </SectionWrap>
      </main>
      <Footer />
    </>
  );
}

function Footer() {
  return (
    <footer className="relative mt-8 border-t border-line bg-ink-950">
      <div className="grid-texture pointer-events-none absolute inset-0 opacity-30" />
      <div className="relative mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          {/* brand + thesis */}
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-grad-lime">
                <Icon name="shield" className="h-4 w-4 text-ink-950" />
              </span>
              <span className="font-display text-[15px] font-bold tracking-tightest text-chalk">
                ConduitCredit
              </span>
            </div>
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-chalk-dim">
              On-chain USDC credit lines underwritten by income verified inside
              an AWS Nitro enclave. We underwrite{" "}
              <span className="text-lime">income, not collateral</span> — for
              the people every over-collateralized money market turns away.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-ink-850/60 py-1.5 pl-2 pr-3.5">
              <span className="flex h-5 items-center gap-1.5 rounded-full bg-lime/15 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-lime">
                <Icon name="bolt" className="h-3 w-3" /> live on Sui testnet
              </span>
              <span className="font-mono text-[11px] text-chalk-dim">
                DeFi &amp; Payments · Sui Overflow 2026
              </span>
            </div>
          </div>

          {/* on-chain addresses */}
          <div className="lg:col-span-4">
            <div className="label mb-3">deployed on testnet</div>
            <dl className="space-y-2.5">
              <AddrRow label="Package" id={CONFIG.packageId} />
              <AddrRow label="CreditPool" id={CONFIG.pool} />
              <AddrRow label="Enclave" id={CONFIG.enclave} />
              <AddrRow label="dUSDC type" id={CONFIG.packageId} />
            </dl>
          </div>

          {/* mainnet note */}
          <div className="lg:col-span-3">
            <div className="label mb-3">production-ready</div>
            <p className="font-mono text-[11px] leading-relaxed text-chalk-dim">
              Contracts are mainnet-ready from commit #1. The path to
              production: Plaid sandbox → production, demo signer → Marlin Oyster
              enclave, dUSDC → native USDC. The pool is generic over the coin
              type — no contract change.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
          <p className="font-mono text-[10.5px] text-chalk-faint">
            Maria is a composite of the gig &amp; 1099 workers with provable
            income and no idle crypto. The borrower comes first.
          </p>
          <p className="font-mono text-[10.5px] text-chalk-faint">
            Built for Sui Overflow 2026 · verified income, not collateral
          </p>
        </div>
      </div>
    </footer>
  );
}

function AddrRow({ label, id }: { label: string; id: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="font-mono text-[11px] text-chalk-faint">{label}</dt>
      <dd>
        <ObjLink id={id} />
      </dd>
    </div>
  );
}
