# ConduitCredit — Product Requirements Document
### Sui Overflow 2026 · DeFi & Payments Track ($30,000) · v1.0

> Source-of-truth: this PRD is built only on confirmed ground from `01-RESEARCH.md` (the Opus re-validation) and `00-HACKATHON-CONTEXT.md`. Where the older `specs/05-conduitcredit.md` conflicts, the research dossier wins. Every interface quoted here is verified against live source (MystenLabs/nautilus `enclave.move` @ `main`, sha `8468381`; the Sui framework `sui::nitro_attestation`). No interface is invented.

---

## A. Problem & why now (Real-World Application — 50% of the score)

**The person.** Maria drives for a rideshare platform and picks up freelance design work. Over the last six months she has averaged $4,200/month in verifiable, recurring income — pay deposits and paystubs that any payroll/bank data API can read. She needs $1,000 to bridge a slow month and cover a vehicle repair. She has income but no idle capital.

**The wall she hits.** Every money market on Sui — Suilend, NAVI, Scallop — requires 130–200% over-collateralization. To borrow $1,000 she would have to *already own* ~$1,500–$2,000 of crypto to lock up. These protocols, by design, only serve people who already have capital. They are structurally incapable of serving someone whose creditworthiness lives in their **income stream**, not their balance sheet. This is the same wall that excludes gig/1099 workers, stablecoin-salary earners, and SMEs with recurring receivables — a large, underserved, real population.

**Why income can't be used today — the trust problem.** The obvious fix is "underwrite the loan against verified income." The blocker has always been: *how does a smart contract trust an off-chain income number without the borrower publishing their raw bank statements, and without inserting a trusted middleman?* On EVM the only answer is a third-party oracle that re-reads the data and re-signs it — which reintroduces exactly the trust assumption you were trying to remove, and leaks data through the oracle operator.

**Why now — the unlock is Sui-specific and newly available.** Sui's Nautilus framework + the native `sui::nitro_attestation` module let a Move contract *cheaply verify, per request, that a payload was signed inside a genuine AWS Nitro enclave* — with the **AWS Nitro root CA embedded directly in the Sui framework** (`crates/sui-types/src/nitro_root_certificate.pem`). The trust anchor ships in the protocol. That means: an enclave reads Maria's six months of income through a payroll API, computes the average *inside hardware she nor we can tamper with*, never exposes the raw statements, and signs an attestation the chain verifies natively — **no oracle, no data leak, no trusted middleman.** Marlin Oyster's managed enclave deployment went live December 2025, removing the need to self-manage AWS Nitro. This capability did not exist as a usable, on-chain-verifiable primitive until recently — *that* is the why-now.

**Market proof the model works.** Off-Sui, the exact shape is already live at scale: **3Jane** (mainnet since Nov 2025) extends USDC credit lines underwritten against verified assets/income with senior/junior tranches (`USD3` / `sUSD3`). **Huma Finance** opened a **$16M Morpho vault for receivables-backed credit on Jun 16, 2026** — dated proof that lender demand for income/receivables-backed credit is activating right now. ConduitCredit is the individual-level, **TEE-underwritten, Sui-native** version of a model the market has already validated. On Sui, the niche is **uncontested**: no Sui protocol offers under-collateralized income credit, and the one Sui protocol using Nautilus (Shell Finance) uses it for dark-pool matching — orthogonal.

**One-sentence thesis (open every artifact with this):** *A gig worker, stablecoin-salary earner, or SME can prove six months of real income to the Sui chain without publishing their bank statements — via an AWS Nitro enclave that the chain natively verifies — and draw a USDC credit line sized to that income from a standalone pool, while lenders earn tranched yield.*

---

## B. Target users & core job-to-be-done

| User | Who they are | Job-to-be-done | What ConduitCredit gives them |
|---|---|---|---|
| **Borrower** | Gig/1099 worker, stablecoin-salary earner, SME with recurring receivables. Has provable income, little idle crypto. | "Get a USDC credit line sized to my real income, without locking up capital I don't have and without publishing my bank statements." | A revolving USDC credit line = 25–40% of 6-month average income, opened against a privacy-preserving TEE attestation. |
| **Lender — Senior** | Risk-averse capital seeking protected, predictable yield. | "Earn USDC yield on a downside-protected position." | Senior tranche: 85% of pool, first 15% of losses absorbed beneath them, lower yield. |
| **Lender — Junior** | Yield-seeking capital willing to take first-loss for higher return. | "Earn higher yield by underwriting expected credit loss." | Junior tranche: 15% first-loss buffer, higher yield, absorbs defaults before senior. |

**Primary JTBD (borrower):** *"When I have real, recurring income but no idle crypto to post as collateral, I want to convert that income into spendable USDC credit — provably and privately — so I can cover near-term needs without selling assets or over-collateralizing."*

---

## C. The product & its decided direction

ConduitCredit is **on-chain USDC credit lines backed by TEE-verified off-chain income streams**, served from a **standalone USDC lending pool** with junior/senior tranches.

**Decided architectural facts (verified, not assumptions):**

1. **Standalone pool — deliberate, not a shortcut.** Suilend / Scallop / NAVI borrow paths require an `ObligationOwnerCap` / `ObligationKey` *owned by the transaction sender*; a protocol cannot borrow on a third party's behalf (NAVI's relevant entry funcs abort). No flash-loan or wrapper path legitimately mints under-collateralized credit against off-chain income. **Therefore ConduitCredit owns its lending pool.** This is the only viable path and is the correct decision.
2. **Supply-side composition is real and used.** Idle pool USDC (utilization < 80%) earns base yield via **Suilend `deposit_liquidity_and_mint_ctokens()`** or **Scallop `mint()`** — supply (deposit) calls that compose cleanly because depositing does not require a sender-owned obligation cap. We claim *only* supply-side composition. We do **not** claim third-party borrow composition.
3. **The TEE underwriting loop is the technical moat and must be live, not mocked.** Per-request verification uses the real `enclave::enclave::verify_signature` over a **BCS** `IntentMessage` — not a hand-rolled JSON-signature verifier (that was a mistake in the old spec).
4. **Fallback preserves everything but the income source.** If live Nitro/Marlin infra is flaky on demo day, an **oracle-attested-income fallback** swaps only the signer (TEE → trusted oracle operator) using the *identical* `verify_signature` pattern and identical contracts/tranches/math/demo. We do **not** pivot to a generic earned-wage-access product ("FlowPay") — that kills the verified-income moat that wins the 20% Technical score.

**Why Sui (state in the first 60 seconds to judges):** EVM cannot natively verify a Nitro Enclave PCR-pinned attestation in a contract — it needs a third-party oracle, reintroducing the exact trust assumption ConduitCredit removes. On Sui the root CA is in the framework and the per-request check is a cheap on-chain Ed25519 verify. This is the irreplaceable Sui-specific work.

---

## D. Feature set — MVP vs Stretch

### MVP (must ship for judging; testnet-deployed)

| # | Feature | Detail |
|---|---|---|
| M1 | **Live Nautilus enclave + on-chain registration** | Enclave deployed (Marlin Oyster managed, decided Day 1). One-time `register_enclave()` consumes a `NitroAttestationDocument`, verifies PCRs, stores the enclave Ed25519 pubkey in a shared `Enclave<T>`. |
| M2 | **Per-request signature verification gate** | `attest_income()` and `borrow()` call `enclave::enclave::verify_signature<T, P: drop>(...)`. Reject bad signature; accept good. This single accept/reject is the technical thesis in miniature. |
| M3 | **Income attestation minting** | Enclave fetches Plaid `/identity/get` + `/income/verification/paystubs`, computes 6-month average, signs `IntentMessage<CreditPayload>{ intent: 2, timestamp_ms, payload }`. `attest_income()` mints a non-transferable `IncomeAttestation` after `verify_signature()` passes. 30-day TTL. |
| M4 | **Credit line lifecycle** | `open_credit_line()` sizes `credit_limit = (income_6mo_avg_usdc * LTV_bps)/10000`, `LTV_bps = 3000`. `borrow()` draws USDC up to limit; `repay()` pays down `outstanding_usdc`. Interest `ir_bps = BASE_IR_BPS(800) + RISK_PREMIUM_BPS(200–500)`. |
| M5 | **Lending pool + LP deposit/withdraw** | `CreditPool` shared object holds `Balance<USDC>`. LPs `deposit` → mint `LPToken<T>`; `withdraw` → burn. |
| M6 | **Junior/senior tranches** | Junior = 15% first-loss; senior = 85% protected. Tranche selection at deposit. |
| M7 | **Default handling** | `declare_default(borrower)` after `MAX_TERM_DAYS` → emits `DefaultEvent`, writes off bad debt against `junior_loss_reserve` first, sets `blacklist: Table<address, bool>`. |
| M8 | **End-to-end dApp** | Next.js: connect wallet → Plaid Sandbox OAuth → submit income proof → attest → open line → borrow → repay; LP deposit/withdraw + tranche view. |
| M9 | **Paired Rust↔Move BCS serde tests** | Mirror nautilus `test_serde`; assert canonical weather vector verifies `true`; assert `CreditPayload` layout matches. Guards the #1 silent failure. |

### Stretch (post-MVP / mainnet path; do not block the demo)

- **Idle-capital base yield**: route `util < 80%` USDC to Suilend `deposit_liquidity_and_mint_ctokens()` / Scallop `mint()`; harvest back on draw.
- **Dynamic risk premium**: scale `RISK_PREMIUM_BPS` by income volatility / data source (W-2 vs 1099).
- **Re-underwriting UX**: auto-prompt at TTL expiry; partial-limit decay as attestation ages.
- **Production Plaid** (sandbox → production) — unlocks the second 50% of the prize on mainnet.
- **Multi-source income** (multiple payroll providers; CEX/bank asset blending à la 3Jane "Jane Score").
- **Secondary market** for LP tranche tokens.

---

## E. Core user flows (step-by-step)

### Flow 1 — Borrower: from income to credit (the live underwriting loop)
1. **Connect wallet** to the dApp.
2. **Link income source** via Plaid Sandbox (mock OAuth) — borrower authorizes read access to payroll/bank data.
3. **Submit income proof.** dApp triggers the enclave. The enclave **genuinely calls** Plaid `/identity/get` + `/income/verification/paystubs` (keys fetched from AWS Secrets Manager *inside* the enclave — never in the binary/PCRs), computes the 6-month income average, and signs `IntentMessage<CreditPayload>{ intent: 2, timestamp_ms, payload: CreditPayload{ borrower, income_6mo_avg_usdc, data_source, fetch_ts_ms } }`.
4. **`attest_income(enclave, payload, signature, ...)`** — contract calls `verify_signature(enclave, 2, timestamp_ms, payload, &signature)`. On `true`, mints a non-transferable `IncomeAttestation{ income_6mo_avg_usdc, attestation_ts, expiry_ts (+30d), enclave_id }` to the borrower. On `false`, abort.
5. **`open_credit_line(attestation)`** — mints `CreditLine{ credit_limit_usdc = income_6mo_avg_usdc * 3000 / 10000, outstanding_usdc: 0, ir_bps, opened_ts }`.
6. **`borrow(credit_line, amount)`** — `amount + outstanding_usdc ≤ credit_limit_usdc`; transfers USDC from `CreditPool.liquidity` to borrower; increments `outstanding_usdc` and `total_borrowed`.
7. **`repay(credit_line, payment)`** — reduces `outstanding_usdc` + accrued interest; returns USDC (principal + interest) to the pool. Interest accrues to LPs.

### Flow 2 — Lender: provide capital, choose risk
1. Connect wallet → choose **Senior** (protected, lower yield) or **Junior** (first-loss, higher yield).
2. **`deposit(pool, usdc, tranche)`** → mints `LPToken<T>` proportional to `total_lp_shares`. Junior deposits credit `junior_loss_reserve`.
3. Earn yield from borrower interest (and, stretch, idle-capital base yield).
4. **`withdraw(pool, lp_token)`** → burns `LPToken`, returns USDC + accrued yield, subject to available liquidity (utilization-gated).

### Flow 3 — Default / write-off
1. A `CreditLine` passes `MAX_TERM_DAYS` unpaid.
2. **`declare_default(borrower)`** → emits `DefaultEvent`; writes off `outstanding_usdc` against `junior_loss_reserve` **first** (junior absorbs before senior); sets `blacklist[borrower] = true` so no new lines open.

---

## F. On-chain data model (objects + fields from the verified brief)

**Move objects (verified):**

```move
// Non-transferable; minted by attest_income() ONLY after verify_signature() passes. 30-day TTL.
public struct IncomeAttestation has key {
    id: UID,
    owner: address,
    income_6mo_avg_usdc: u64,
    attestation_ts: u64,
    expiry_ts: u64,        // attestation_ts + 30 days
    enclave_id: ID,
}

// Shared object — the standalone lending pool.
public struct CreditPool has key {
    liquidity: Balance<USDC>,
    total_borrowed: u64,
    total_lp_shares: u64,
    junior_loss_reserve: u64,
}

public struct CreditLine has key {
    // borrower, credit_limit_usdc, outstanding_usdc, attestation_id, ir_bps, opened_ts
    id: UID,
    borrower: address,
    credit_limit_usdc: u64,
    outstanding_usdc: u64,
    attestation_id: ID,
    ir_bps: u64,
    opened_ts: u64,
}

// Fungible LP share.
public struct LPToken<phantom T> has store { /* value */ }
```

**Enclave payload (Rust signer ↔ Move struct must match by BCS *position*; field name `payload`, intent scope `2`):**

```move
public struct CreditPayload has copy, drop {
    borrower: address,
    income_6mo_avg_usdc: u64,
    data_source: vector<u8>,   // e.g. "plaid"
    fetch_ts_ms: u64,
}
```

**Verified Nautilus interfaces (quote verbatim; do not invent variants):**

- `enclave::enclave::verify_signature<T, P: drop>(enclave: &Enclave<T>, intent_scope: u8, timestamp_ms: u64, payload: P, signature: &vector<u8>): bool` — cheap Ed25519 over a BCS `IntentMessage`. Callable per request from any module.
- `IntentMessage<T: drop> { intent: u8, timestamp_ms: u64, payload: T }` — third field is **`payload`** (the enclave's JSON HTTP response wraps it as `data`; BCS is positional, so the Move field is `payload`).
- Canonical BCS test vector (must verify `true` Day 1): `x"0020b1d110960100000d53616e204672616e636973636f0d00000000000000"`.
- `EnclaveConfig<T>` → `Pcrs(pcr0, pcr1, pcr2)` + version; `Cap<T>` gates updates; PCR0=image, PCR1=kernel, PCR2=application. **Production check: PCR0/1/2 must be non-zero** (debug enclaves emit all-zero).
- `sui::nitro_attestation` native module; `load_nitro_attestation()`; AWS Nitro root CA embedded at `crates/sui-types/src/nitro_root_certificate.pem` (sha256 `6eb9688305e4bbca67f44b59c29a0661ae930f09b5945b5d1d9ae01125c8d6c0`).
- Two-phase trust: one expensive `register_enclave()` (consumes `NitroAttestationDocument`, verifies `document.to_pcrs() == config.pcrs`, stores pubkey in shared `Enclave<T>`) → cheap per-request `verify_signature()`.

**Marlin Oyster on-chain identifiers (deployment path, decided Day 1):**
- Testnet: `REGISTRY_PACKAGE_ID 0x05cd5a306375c49727fc2f1e667df8bcc1f5b52ad07e850074d330afda932761`, `REGISTRY_ID 0x7ebc3f9bc7a0cf0820d241ad767036483b885bbd62636fb9446bb0d99d2ed091`.
- Mainnet: `PACKAGE 0x8df76b79118ffad2bacb55705c84474802ddb3d62199b98db720c5088e161ab8`.

**Underwriting & rate constants:**
- `credit_limit = (income_6mo_avg_usdc * LTV_bps) / 10000`, `LTV_bps = 3000` (25–40% band).
- `ir_bps = BASE_IR_BPS(800) + RISK_PREMIUM_BPS(200–500)` → 10–13% APR.
- Tranches: junior 15% first-loss / senior 85% protected (mirrors 3Jane `USD3`/`sUSD3`).

---

## G. Demo narrative (≤ 5 min video; lead with the borrower in the first 90s)

1. **0:00–0:90 — The person and the wall.** Maria: real $4,200/mo income, no idle crypto. Every Sui money market demands 130–200% collateral. State the one-sentence thesis. Name the moat: *the chain natively verifies a Nitro enclave attestation — EVM can't do this without an oracle.*
2. **0:90–2:30 — The live underwriting loop (the make-or-break, must be real).** Connect wallet → Plaid Sandbox OAuth → submit income proof. Show the enclave *genuinely* calling Plaid and signing. `attest_income()` → on-chain `verify_signature()` returns `true` → non-transferable `IncomeAttestation` minted. Show that the raw bank data never touched the chain.
3. **2:30–3:30 — Credit in hand.** `open_credit_line()` → $4,200 × 30% = $1,260 limit. `borrow($1,000)` → USDC lands in Maria's wallet. `repay()` → line restored. Show interest accruing to LPs.
4. **3:30–4:15 — The lender side.** Senior vs junior tranche deposit; show 15% first-loss buffer protecting senior; show idle-yield path (if stretch shipped).
5. **4:15–5:00 — Why Sui, robustness, roadmap.** Native attestation + root CA in framework; two-phase trust; oracle fallback for resilience; mainnet path (production Plaid) = credible second-50% of prize. Show testnet package ID + object IDs.

**Demo-day failover (legitimate):** pre-cache valid signed attestations — the signature verifies regardless of whether the enclave call was live or cached. The oracle-attested fallback keeps every contract identical.

---

## H. Success metrics

**Judging-aligned (the only metrics that win the prize):**
- **Real-World Application (50%):** named borrower + named pain + validated market (3Jane live, Huma $16M Jun-2026) articulated in the first paragraph of repo/video/description.
- **Technical (20%):** the Nautilus TEE loop is **live, not mocked** — on-chain `verify_signature()` returns `true` for a real enclave-signed `CreditPayload` and `false` for a tampered one, demonstrated on testnet.
- **Product & UX (20%):** end-to-end flow (attest → borrow → repay; LP deposit/withdraw) works in the dApp with no dead ends.
- **Presentation (10%):** thesis told in one sentence; why-Sui clear in 60s.

**Functional acceptance (build health):**
- Day-1 gate: canonical weather vector verifies `true` on testnet; stub `borrow()` accepts good sig / rejects bad. (If this fails, stop and fix before anything else.)
- Paired Rust↔Move serde tests pass (no BCS drift on `CreditPayload`).
- PCR0/1/2 non-zero (production, not debug).
- Full happy path executes on testnet: attest → open → borrow → repay; deposit → withdraw; declare_default writes off against junior reserve first.
- Public GitHub repo with **real, continuous commit history from commit #1** (squashed/single-commit repos are disqualified).

---

## I. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Live enclave flaky on demo day (RPC/Plaid latency, attestation serialization). | High | Two-phase model makes per-request cheap; pre-cache valid signed attestations as failover; oracle-attested fallback keeps identical contracts. |
| Rust↔Move BCS layout drift on `CreditPayload`. | High (silent) | Field name `payload`; intent scope `2`; paired Move+Rust serde tests mirroring nautilus `test_serde`; assert canonical weather vector verifies `true` Day 1. |
| Wrong enclave path chosen, then switched. | Medium | Decide **Marlin Oyster vs self-managed Day 1**; PCR16 + shared registry differ from self-managed. |
| PCR churn from late `allowed_endpoints.yaml` / image changes forcing re-registration. | Medium | Freeze the endpoint whitelist (`/identity/get`, `/income/verification/paystubs`) + image Day 1; keys via AWS Secrets Manager, not in the binary. |
| Debug-mode enclave (all-zero PCRs) mistaken for production. | Low | Assert PCR0/1/2 non-zero before trusting an attestation. |
| "Is under-collateralized lending safe?" judge skepticism. | Medium (narrative) | Benchmarked params: LTV 25–40% of 6-mo income avg; junior 15% first-loss; IR 800 + 200–500 bps; default benchmarks ~3–8% net loss prime verified-income, 15–25% gig/1099. Frame conservatively. |
| Plaid Sandbox ≠ production data. | Low (demo), Medium (mainnet) | Sandbox is fine if the enclave genuinely calls Plaid; production Plaid is the mainnet path (second 50% of prize). |
| Composability over-claim. | Medium | Claim **only** supply-side idle-yield composition (real); never claim third-party borrow composition into Suilend/Scallop/NAVI (blocked). |
| Unindexed CN-region field (~40–70 teams of unknown quality). | Irreducible | Caps win probability below ~45%; nothing actionable until submissions go public. |

---

## J. How this wins its track (argument against the rubric)

DeFi & Payments is judged by the **Mysten Labs / Sui Foundation** panel — Sui engineers who reward (a) a real-world problem in one sentence and (b) Sui primitives doing genuine, irreplaceable work. The track's own idea bank explicitly names *"payment-linked credit systems"* under Trust-Minimized Finance — ConduitCredit is exactly that.

- **Real-World Application (50%) — strongest leg.** A named, large, underserved population (gig/1099, stablecoin-salary, SME receivables) locked out by universal 130–200% over-collateralization. Market validated *off-Sui* by 3Jane (live mainnet, exact tranche template) and Huma ($16M vault dated Jun 16, 2026), *uncontested on-Sui*. Long-term value is obvious: income-based credit is one of the largest real financial primitives that DeFi has never been able to underwrite trustlessly.
- **Technical Implementation (20%) — the moat.** Native on-chain verification of an AWS Nitro attestation via `sui::nitro_attestation` + per-request `enclave::enclave::verify_signature`, with the root CA in the framework. **This has no EVM-native equivalent** — EVM needs a trust-reintroducing oracle. A generic lending clone scores nothing here; the TEE-verified-income loop is the irreplaceable Sui work, and it is *live, not mocked*.
- **Product & UX (20%).** Complete, legible end-to-end flow (attest → borrow → repay; tranche-aware LP deposit/withdraw), privacy-preserving by construction (raw statements never touch the chain), with a real testnet deployment and published package/object IDs.
- **Presentation & Vision (10%).** A single-sentence thesis, a 60-second why-Sui, a credible mainnet path (production Plaid) that makes the second 50% of the prize believable, and a structural fallback that signals engineering maturity without diluting the story.

**Net:** ConduitCredit pairs the rubric's heaviest leg (a genuine, validated, uncontested real-world use case) with its hardest-to-fake leg (irreplaceable Sui-native TEE verification). Generic lending clones cannot place; the verified-income-via-Nautilus angle is the moat.
