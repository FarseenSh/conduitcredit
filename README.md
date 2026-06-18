# ConduitCredit

> **On-chain USDC credit lines underwritten by TEE-verified off-chain income.**
> A gig worker, stablecoin-salary earner, or SME proves six months of real income to the Sui chain — **without publishing their bank statements** — via an AWS Nitro enclave the chain verifies natively, and draws a USDC credit line sized to that income. Lenders earn tranched yield.

---

## The person, and the wall

**Maria** drives for a rideshare platform and picks up freelance design work. Over six months she has averaged **$4,200/month** in verifiable, recurring income — pay deposits and paystubs any payroll/bank API can read. She needs $1,000 to bridge a slow month. **She has income, but no idle crypto.**

Every money market on Sui — Suilend, NAVI, Scallop — demands **130–200% over-collateralization**. To borrow $1,000 Maria would have to already own ~$1,500–$2,000 of crypto to lock up. By design they only serve people who *already* have capital. They are structurally incapable of serving someone whose creditworthiness lives in their **income stream**, not their balance sheet — the gig/1099 workers, stablecoin-salary earners, and SMEs with receivables that make up a large, underserved market.

**ConduitCredit underwrites income, not collateral.**

## Why this needs Sui (the moat)

The blocker has always been trust: *how does a smart contract trust an off-chain income number without the borrower publishing raw statements, and without a trusted middleman?* On EVM the only answer is a third-party oracle that re-reads and re-signs the data — reintroducing exactly the trust you were removing, and leaking data through the operator.

Sui's **Nautilus** + the native **`sui::nitro_attestation`** module let a Move contract *cheaply verify, per request, that a payload was signed inside a genuine AWS Nitro enclave* — with the **AWS Nitro root CA embedded directly in the Sui framework**. The trust anchor ships in the protocol. An enclave reads Maria's income, computes the average inside hardware no one can tamper with, never exposes the raw statements, and signs an attestation the chain verifies natively. **No oracle, no data leak, no middleman.** This has no EVM-native equivalent.

The whole technical thesis in miniature: **`verify_signature` accepts a good enclave signature and rejects a bad one.**

---

## It's live on testnet — and proven end-to-end

The full underwriting loop runs on Sui testnet today. `scripts/demo.mjs` executes it and every transaction succeeds, including the security guarantee:

| Step | What happens | Testnet digest |
|---|---|---|
| Senior LP deposit | 5,000 dUSDC → protected tranche | `3LQihMcyVn2inPcPCZXtaFTJzr3HrUfRwpCeKZo9iKcw` |
| Junior LP deposit | 2,000 dUSDC → first-loss tranche | `4KBnBK6XqRDYL3ZczphkdppgtrJBBEjicHzLCmHhHUDh` |
| **attest_income** | enclave-signed income → **on-chain `verify_signature` ✓** → `IncomeAttestation` minted | `545A1Fkhx8V2cZL28mcRCcLxdEuvdrW7B3Fh2HqKCaPs` |
| open_credit_line | limit = $4,200 × 30% = **$1,260** | `4CUxfHg4qeP8iEgFv3bDU2dWCbeYC29RqGxWycAmzcrU` |
| borrow | 1,000 dUSDC lands in the wallet | `6T75ygy1J1P3G7HgwcBMJCTe1sNYtJze2hfSRnSpNyVM` |
| repay | principal back, interest to LPs | `7Cj98yzVomuKGsyPuSdeejAD9octTBNQYJg7tnbKv78a` |
| **forged attestation** | tampered signature → **chain ABORTS** (`income::attest_income` `E_BAD_SIGNATURE`) | `HZEeVqB8t31t6Es9VPEUVmP1iTgxXyhfMKrt5yMUDNRW` |

The TEE-verified-income loop is **live, not mocked.**

---

## Deployed on Sui testnet

| Object | ID |
|---|---|
| **Package** | `0x771c790bfee4ada67f37bd375b7ab4f3c877fd46d78488b372a7d66b93a482ee` |
| **Enclave** (registered Ed25519 key) | `0xa6b3a7dc9df2dba145218e9cd00e8ea8c7bd714e2889c79de1196a3a08d24695` |
| **CreditPool\<dUSDC\>** (shared) | `0xb0e01adfe7acb231ba43388464869c653ea53fb7ac09a3d05c432d3f437a19ec` |
| **Blacklist** (shared) | `0x900506ce90879fd43488fa71ec6d32a6f281d67c1b937e04fa5d6338b7434422` |
| dUSDC type | `0x771c790b…::mock_usdc::MOCK_USDC` |
| AdminCap / KeeperCap / TreasuryCap | see `config/deployment.testnet.json` |

Day-1 gate canary (the standalone `verify_signature` proof) also remains published at `0xdb062506575fb08f0596eb28ad4a444693838e362147099ba784d93535b28692`.

---

## How it works

```
 BORROWER browser (Next.js + dapp-kit)
   │  link income (Plaid) → "submit proof"
   ▼
 ATTESTER / NAUTILUS ENCLAVE (AWS Nitro via Marlin Oyster)
   - reads Plaid /identity/get + /income/verification/paystubs
   - computes 6-mo average INSIDE the enclave (raw data never leaves)
   - BCS-serializes IntentMessage<CreditPayload>{intent:2,…} & Ed25519-signs
   │  { data, signature }
   ▼
 SUI (Move package conduit_credit)
   enclave_registry  — register ONCE (native Nitro attestation, AWS root CA in
                       framework) → shared Enclave{pk,pcrs}; verify per request
   income            — attest_income: verify_signature ✓ → non-transferable
                       IncomeAttestation (30-day TTL)
   credit_line       — open (limit = income×LTV) / borrow / repay (+interest)
   credit_pool       — standalone pool; share-price junior/senior tranches;
                       junior-first loss; idle-yield ready
   defaults          — keeper write-off (junior-first) + blacklist
```

**Two-phase trust:** the expensive step (verify a Nitro attestation's cert chain + PCRs against the AWS root CA in the framework) happens **once** at `register_enclave`; every per-borrower `attest_income` is a **cheap Ed25519 `verify_signature`** against the stored pubkey.

**Tranches (share-price vault model):** lenders pick **Senior** (protected, 85%) or **Junior** (first-loss, 15%, higher yield). Repaid interest raises tranche share prices (junior weighted higher); defaults shrink junior assets first, then senior — loss and yield socialize pro-rata automatically.

**Standalone pool — deliberate, not a shortcut.** Suilend/Scallop/NAVI borrow paths require a sender-owned `ObligationOwnerCap`; no protocol can borrow under-collateralized on a third party's behalf. So ConduitCredit owns its pool. It composes only on the *supply* side (idle USDC → base yield), which is real.

---

## Repository layout

```
contracts/   Move package `conduit_credit` (6 modules) + tests (10 passing)
  sources/   enclave_registry · income · credit_pool · credit_line · defaults · mock_usdc · registry
  tests/     gate_tests (BCS/ed25519 canary) · protocol_tests (full lifecycle)
enclave/     Rust nautilus-server (production Nitro signer) + paired BCS serde test
scripts/     attester.mjs (enclave signer) · demo.mjs (e2e runner) · setup.mjs · sign.mjs · gate_call.mjs
app/         Next.js dApp (@mysten/dapp-kit) — borrower + lender flows
config/      deployment.testnet.json — single source of truth for all IDs
```

## Run it

```bash
# Move contracts
sui move test  --path contracts            # 10/10 pass (gate + full lifecycle)
sui move build --path contracts

# End-to-end loop on testnet (uses config/deployment.testnet.json)
cd scripts && pnpm install
node demo.mjs                               # deposit → attest → open → borrow → repay → reject-forgery

# dApp
cd app && pnpm install && pnpm dev          # http://localhost:3000
```

> **Isolation note:** this project uses a dedicated Sui CLI config at `./.sui` (gitignored — it holds the keystore) so it never collides with other local Sui work. Prefix `sui` commands with `SUI_CONFIG_DIR=$PWD/.sui` or `source scripts/sui-env.sh`.

---

## Underwriting parameters

- `credit_limit = income_6mo_avg × LTV_BPS / 10000`, **LTV = 30%** (25–40% band).
- `ir = BASE(800 bps) + RISK_PREMIUM(300 bps)` → **11% APR**.
- Attestation **30-day TTL** (forces periodic re-underwriting); payload freshness < 10 min.
- Tranches: **junior 15% first-loss / senior 85% protected** (mirrors 3Jane's USD3/sUSD3); default term 90 days.

## Mainnet path (the 50/50 prize is credible)

Every Move module, the `verify_signature` gate, and the BCS contract are **mainnet-ready as-is**. The pool is generic over the coin type, so mainnet uses native USDC unchanged. Only two switches are needed, neither of which touches the contracts:

1. **Plaid Sandbox → Production** — swap the API host + production keys (both already whitelisted in the enclave's `allowed_endpoints.yaml`, so no PCR churn).
2. **Operator-fallback → real Nitro via Marlin Oyster** — deploy the `enclave/` image with `oyster-cvm`, then call `enclave_registry::register_via_nitro` (already implemented, using the native `sui::nitro_attestation`) against Oyster's mainnet registry.

**Resilience without diluting the story:** the income-proof *source* can swap from TEE-signed to a trusted-oracle-operator-signed attestation using the **identical `verify_signature` pattern** — every contract, tranche, and the demo stay the same (`register_via_operator` is exactly this path).

## Security & privacy

- **Raw bank/payroll statements never touch the chain** — only the enclave-signed 6-month average does.
- **No keys, `.env`, or raw income data are committed.** The Sui keystore lives in gitignored `./.sui`; production Plaid/enclave keys live in AWS Secrets Manager, fetched at runtime inside the enclave (never baked into the image / PCRs).
- BCS layout is pinned byte-for-byte across Rust (enclave), Move (chain), and the JS signer by paired serde tests — the canonical nautilus weather vector `0020b1d1…` verifies identically on all sides.

## License

Apache-2.0.
