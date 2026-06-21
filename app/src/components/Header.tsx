"use client";

import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { shorten } from "@/lib/format";
import { CONFIG, suiscanAccount } from "@/lib/config";

const NAV = [
  { href: "#borrow", label: "Borrow" },
  { href: "#lend", label: "Lend" },
  { href: "#pool", label: "Pool" },
  { href: "#how", label: "How it works" },
];

export function Header() {
  const account = useCurrentAccount();
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <a href="#top" className="group flex items-center gap-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center">
            <svg viewBox="0 0 512 512" className="h-8 w-8" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="hdr-g" x1="120" y1="150" x2="392" y2="372" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#BEF264" />
                  <stop offset="1" stopColor="#2DD4BF" />
                </linearGradient>
              </defs>
              <rect width="512" height="512" rx="120" fill="#0B0F0E" />
              <path d="M350 190 A122 122 0 1 0 350 322" stroke="url(#hdr-g)" strokeWidth="56" strokeLinecap="round" fill="none" />
              <circle cx="356" cy="256" r="42" fill="#0B0F0E" />
              <circle cx="356" cy="256" r="23" fill="#BEF264" />
            </svg>
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[15px] font-bold tracking-tightest text-chalk">
              ConduitCredit
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-chalk-faint">
              income · not collateral
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="font-mono text-[12px] uppercase tracking-[0.1em] text-chalk-dim transition-colors hover:text-lime"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {account && (
            <a
              href={suiscanAccount(account.address)}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-md border border-line bg-ink-800/60 px-2.5 py-1.5 sm:flex"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_8px_rgba(182,255,58,0.8)]" />
              <span className="font-mono text-[11px] text-chalk-dim">
                {shorten(account.address)}
              </span>
            </a>
          )}
          <span className="hidden rounded border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-teal lg:inline">
            testnet
          </span>
          <div className="conduit-connect">
            <ConnectButton connectText="Connect Wallet" />
          </div>
        </div>
      </div>
      <style jsx global>{`
        .conduit-connect button {
          background: #b6ff3a !important;
          color: #06090a !important;
          border-radius: 8px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.08em !important;
          padding: 9px 16px !important;
          transition: filter 0.2s ease !important;
        }
        .conduit-connect button:hover {
          filter: brightness(1.1) !important;
        }
      `}</style>
    </header>
  );
}
