"use client";

import { ReactNode, useState } from "react";
import { shorten } from "@/lib/format";
import { suiscanTx, suiscanObject } from "@/lib/config";
import type { TxOutcome } from "@/hooks/useTx";

// ─────────────────────────── icons (inline, no dep) ───────────────────────────

export function Icon({
  name,
  className = "h-4 w-4",
}: {
  name:
    | "check"
    | "x"
    | "shield"
    | "lock"
    | "arrow"
    | "external"
    | "copy"
    | "spinner"
    | "bolt"
    | "wallet"
    | "chart"
    | "key";
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "check":
      return (
        <svg {...common}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case "key":
      return (
        <svg {...common}>
          <circle cx="7.5" cy="15.5" r="4.5" />
          <path d="m10.7 12.3 8.8-8.8M16 7l2 2M19 4l2 2" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "external":
      return (
        <svg {...common}>
          <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      );
    case "copy":
      return (
        <svg {...common}>
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case "spinner":
      return (
        <svg {...common} className={`${className} animate-spin`}>
          <path d="M21 12a9 9 0 1 1-6.2-8.5" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
          <path d="M21 12H17a2 2 0 0 0 0 4h4v-4Z" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M3 3v18h18M7 14l4-4 3 3 5-6" />
        </svg>
      );
  }
}

// ─────────────────────────── copy + external ───────────────────────────

export function Mono({
  value,
  copy = true,
  className = "",
}: {
  value: string;
  copy?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="font-mono text-[12.5px] text-chalk-dim">
        {shorten(value)}
      </span>
      {copy && (
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="text-chalk-faint transition-colors hover:text-lime"
          aria-label="copy"
        >
          {copied ? (
            <Icon name="check" className="h-3.5 w-3.5 text-lime" />
          ) : (
            <Icon name="copy" className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </span>
  );
}

export function ObjLink({
  id,
  label,
  kind = "object",
}: {
  id: string;
  label?: string;
  kind?: "object" | "tx";
}) {
  const href = kind === "tx" ? suiscanTx(id) : suiscanObject(id);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="link-ext inline-flex items-center gap-1"
    >
      {label ?? shorten(id)}
      <Icon name="external" className="h-3 w-3" />
    </a>
  );
}

// ─────────────────────────── section heading ───────────────────────────

export function SectionTag({
  index,
  children,
}: {
  index: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="font-mono text-xs text-lime/70">{index}</span>
      <span className="h-px flex-1 bg-line" />
      <span className="label text-chalk-dim">{children}</span>
    </div>
  );
}

// ─────────────────────────── stat ───────────────────────────

export function Stat({
  label,
  value,
  sub,
  accent = "default",
  size = "md",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "default" | "lime" | "amber" | "teal";
  size?: "md" | "lg";
}) {
  const color =
    accent === "lime"
      ? "text-lime"
      : accent === "amber"
        ? "text-amber"
        : accent === "teal"
          ? "text-teal"
          : "text-chalk";
  return (
    <div>
      <div className="label mb-1.5">{label}</div>
      <div
        className={`data font-semibold ${color} ${
          size === "lg" ? "text-3xl" : "text-xl"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 font-mono text-[11px] text-chalk-faint">{sub}</div>}
    </div>
  );
}

// ─────────────────────────── tx result card ───────────────────────────

export function TxResult({
  outcome,
  successTitle,
  failTitle,
  createdLabel,
  createdId,
  expectFailure = false,
}: {
  outcome: TxOutcome | null;
  successTitle: string;
  failTitle?: string;
  createdLabel?: string;
  createdId?: string;
  expectFailure?: boolean;
}) {
  if (!outcome) return null;
  const ok = expectFailure
    ? outcome.status === "failure"
    : outcome.status === "success";

  return (
    <div
      className={`mt-4 animate-fade-up rounded-lg border p-3.5 ${
        ok
          ? "border-lime/30 bg-lime/[0.06]"
          : "border-amber/40 bg-amber/[0.06]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full ${
            ok ? "bg-lime/20 text-lime" : "bg-amber/20 text-amber"
          }`}
        >
          <Icon name={ok ? "check" : "x"} className="h-3 w-3" />
        </span>
        <span
          className={`font-mono text-[13px] font-semibold uppercase tracking-[0.08em] ${
            ok ? "text-lime" : "text-amber"
          }`}
        >
          {ok ? successTitle : failTitle ?? "Transaction failed"}
        </span>
      </div>
      <div className="mt-2.5 space-y-1.5 pl-7">
        {createdId && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="label">{createdLabel ?? "Object"}</span>
            <ObjLink id={createdId} />
          </div>
        )}
        {outcome.digest && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="label">Digest</span>
            <ObjLink id={outcome.digest} kind="tx" />
          </div>
        )}
        {!ok && outcome.error && (
          <div className="mt-1 font-mono text-[11px] leading-relaxed text-amber-soft/90">
            {outcome.error.length > 200
              ? outcome.error.slice(0, 200) + "…"
              : outcome.error}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── misc ───────────────────────────

export function Spinner({ className }: { className?: string }) {
  return <Icon name="spinner" className={className ?? "h-4 w-4"} />;
}

export function Divider() {
  return <div className="my-5 h-px bg-line" />;
}

// ─────────────────────────── inline code token ───────────────────────────

/** A short inline mono code identifier (renders in full — unlike Mono, which truncates ids). */
export function Code({
  children,
  accent,
}: {
  children: ReactNode;
  accent?: "lime" | "teal" | "amber";
}) {
  const color =
    accent === "lime"
      ? "text-lime"
      : accent === "teal"
        ? "text-teal"
        : accent === "amber"
          ? "text-amber"
          : "text-chalk";
  return (
    <code
      className={`rounded bg-ink-900/80 px-1 py-0.5 font-mono text-[0.9em] ${color}`}
    >
      {children}
    </code>
  );
}

// ─────────────────────────── section wrapper ───────────────────────────

/**
 * Standard section frame: consistent max-width + padding + vertical rhythm,
 * a SectionTag heading, a display title, optional grid texture, fade-up entrance.
 */
export function SectionWrap({
  id,
  tag,
  title,
  intro,
  texture = false,
  children,
}: {
  id: string;
  tag: string;
  title: ReactNode;
  intro?: ReactNode;
  texture?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className="relative scroll-mt-16 overflow-hidden">
      {texture && (
        <div className="grid-texture pointer-events-none absolute inset-0 opacity-25" />
      )}
      <div className="relative mx-auto max-w-7xl animate-fade-up px-5 py-16 lg:px-8 lg:py-24">
        <SectionTag index={tag.split(" / ")[0]}>{tag.split(" / ")[1] ?? tag}</SectionTag>
        <h2 className="max-w-3xl text-balance font-display text-3xl font-bold tracking-tightest text-chalk sm:text-4xl lg:text-[2.9rem] lg:leading-[1.05]">
          {title}
        </h2>
        {intro && (
          <p className="mt-4 max-w-2xl text-balance text-[15px] leading-relaxed text-chalk-dim">
            {intro}
          </p>
        )}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

// ─────────────────────────── labeled amount input ───────────────────────────

/**
 * A mono dUSDC amount field with a unit suffix and an optional MAX shortcut.
 * Controlled by the caller; `onMax` (when given) fills the field to its ceiling.
 */
export function AmountField({
  label,
  value,
  onChange,
  onMax,
  max,
  placeholder = "0.00",
  unit = "dUSDC",
  disabled = false,
  accent = "lime",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onMax?: () => void;
  max?: string;
  placeholder?: string;
  unit?: string;
  disabled?: boolean;
  accent?: "lime" | "amber" | "teal";
}) {
  const ring =
    accent === "amber"
      ? "focus-within:border-amber/50 focus-within:shadow-glow-amber"
      : accent === "teal"
        ? "focus-within:border-teal/50"
        : "focus-within:border-lime/50 focus-within:shadow-glow";
  const maxColor =
    accent === "amber" ? "text-amber" : accent === "teal" ? "text-teal" : "text-lime";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label">{label}</span>
        {max !== undefined && (
          <span className="font-mono text-[10.5px] text-chalk-faint">
            max {max}
          </span>
        )}
      </div>
      <div
        className={`flex items-center gap-2 rounded-lg border border-line bg-ink-900/60 px-3.5 py-2.5 transition-all ${
          disabled ? "opacity-50" : ring
        }`}
      >
        <input
          inputMode="decimal"
          disabled={disabled}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "" || /^\d*\.?\d*$/.test(v)) onChange(v);
          }}
          placeholder={placeholder}
          className="w-full bg-transparent font-mono text-[15px] tabular-nums text-chalk placeholder:text-chalk-faint focus:outline-none disabled:cursor-not-allowed"
        />
        {onMax && (
          <button
            type="button"
            onClick={onMax}
            disabled={disabled}
            className={`shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${maxColor} transition-colors hover:border-current/40 disabled:cursor-not-allowed`}
          >
            max
          </button>
        )}
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-chalk-faint">
          {unit}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────── animated bar ───────────────────────────

/** A single thin progress/utilization bar with a smooth width transition. */
export function Bar({
  pct,
  color = "lime",
  className = "",
  height = "h-2",
}: {
  pct: number;
  color?: "lime" | "amber" | "teal";
  className?: string;
  height?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const fill =
    color === "amber"
      ? "bg-amber"
      : color === "teal"
        ? "bg-teal"
        : "bg-grad-lime";
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-ink-700 ${height} ${className}`}
    >
      <div
        className={`h-full rounded-full ${fill} transition-[width] duration-700 ease-out`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// ─────────────────────────── gas hint ───────────────────────────

/** Subtle note where a user may hit an "insufficient gas" wallet error. */
export function GasNote({ className = "" }: { className?: string }) {
  return (
    <p className={`font-mono text-[10.5px] leading-relaxed text-chalk-faint ${className}`}>
      <Icon name="bolt" className="mr-1 inline h-3 w-3 text-teal" />
      Your wallet pays gas in testnet SUI.{" "}
      <a
        href="https://faucet.sui.io/?network=testnet"
        target="_blank"
        rel="noreferrer"
        className="link-ext"
      >
        Get testnet SUI
        <Icon name="external" className="ml-0.5 inline h-2.5 w-2.5" />
      </a>
    </p>
  );
}

// ─────────────────────────── connect prompt ───────────────────────────

/** Empty-state shown inside a panel when no wallet is connected. */
export function ConnectPrompt({
  message = "Connect a Sui wallet to begin.",
  children,
}: {
  message?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-line bg-ink-900/40 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-800 text-chalk-faint">
        <Icon name="wallet" className="h-5 w-5" />
      </span>
      <p className="max-w-xs font-mono text-[12px] leading-relaxed text-chalk-dim">
        {message}
      </p>
      {children}
    </div>
  );
}
