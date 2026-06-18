# ConduitCredit — Research Dossier
### Sui Overflow 2026 · DeFi & Payments · Ground-up technical due diligence

> Everything below is sourced to a primary artifact (live Move source, the Sui framework, official Sui/Marlin docs, or a live competitor product). Where the older internal spec (`specs/05-conduitcredit.md`) conflicts with this dossier, **this dossier wins** — it incorporates an Opus re-validation against primary sources that corrected several load-bearing details. Read this as if a hostile judge is checking every claim.

---

## 0. One-sentence real-world thesis (the thing that is 50% of the score)

A gig worker, a stablecoin-salary earner, or an SME with recurring receivables can prove six months of real income to the Sui chain **without publishing their bank statements** — via an AWS Nitro enclave (Nautilus) that reads the income through a bank/payroll API and signs an attestation the chain verifies — and draw a USDC credit line sized to that income from a standalone lending pool, while lenders earn tranched yield. **No Sui protocol offers under-collateralized income credit today; every existing money market requires 130–200% collateral.**

---

## 1. The GO / NO-GO gate verdict

**VERDICT: GO-WITH-FALLBACK (confidence: high).** Confirmed at Opus quality against primary sources; the earlier Sonnet verdict holds.

### What had to be true for GO (and is)
1. **A Move contract can cheaply verify, per request, that a payload was signed inside a genuine AWS Nitro enclave.** — TRUE. `enclave::enclave::verify_signature` exists in live Nautilus source and is a cheap Ed25519 check (§2).
2. **The expensive Nitro attestation verification (PCR/cert-chain) is a one-time on-chain step, not per-request.** — TRUE. Two-phase trust model: one `register_enclave()` that consumes a `NitroAttestationDocument`, then cheap per-request signature checks (§2).
3. **The Sui framework natively verifies Nitro attestations** (no third-party oracle bridge, which would reintroduce trust). — TRUE. `sui::nitro_attestation` is a native module with the AWS Nitro root CA embedded in the framework (§2).
4. **The enclave can be deployed without a team self-managing AWS Nitro.** — TRUE. Marlin Oyster managed enclaves are live and documented in official Sui docs (§4).
5. **The niche is uncontested on Sui** and the model is validated off-Sui. — TRUE. No Sui-native Nautilus income-credit competitor; 3Jane is a live, near-exact off-chain analog proving the model works (§6).

### Why "WITH FALLBACK"
The only material execution risk is live Nitro/Marlin infra reliability on demo day. The mitigation is structural: an **oracle-attested-income fallback** that reuses the *identical* contracts and `verify_signature` pattern, swapping only the income-proof signer (TEE → trusted oracle operator). The product, pool, tranches, and demo are unchanged. This bounds the downside without diluting the RWA narrative.

### The composability constraint that shaped the architecture (verified, not assumed)
ConduitCredit **cannot** have its pool borrow on a user's behalf from Suilend / Scallop / NAVI, because their borrow paths require an `ObligationOwnerCap` / `ObligationKey` owned by the transaction sender; there is no third-party borrow entry and no flash-loan wrapper that legitimately mints *under-collateralized* credit against off-chain income (that product simply does not exist on any Sui money market). **Therefore ConduitCredit is a standalone lending pool.** This is the correct and only viable path — it is a deliberate, verified decision, not a shortcut. ConduitCredit *can* still compose on the **supply side** (idle pool USDC → Suilend/Scallop for base yield), which it does (§3, §5).

> Scope note: an earlier cross-contaminated prompt referenced a "3-leg leverage loop." **ConduitCredit has no leverage loop, no Predict mint, and no flash-loan dependency.** A leverage-loop product would dilute the verified-income RWA moat and should be a separate idea, not folded in here.

---

## 2. Verified real interfaces — Nautilus TEE (the technical moat)

All facts below match live source at **MystenLabs/nautilus**, `move/enclave/sources/enclave.move` (verified at sha `8468381`, `main` branch), plus the Sui framework. Quote these verbatim; do not invent variants.

### 2.1 The per-request verification function (cheap, callable from any Move contract)
```move
// enclave::enclave
public fun verify_signature<T, P: drop>(
    enclave: &Enclave<T>,
    intent_scope: u8,
    timestamp_ms: u64,
    payload: P,
    signature: &vector<u8>,
): bool
```
- Internally builds an `IntentMessage<P>`, BCS-serializes it, and calls `ed25519::ed25519_verify` against the enclave's stored Ed25519 public key. Cheap. Callable per request from any module.
- **This replaces the older spec's hand-rolled `conduit::registry::verify_attestation_signature` + raw `sui::ed25519::ed25519_verify` over canonical JSON.** Use the real Nautilus `verify_signature` over a **BCS** `IntentMessage`. JSON-canonicalization was a mistake in the old spec.

### 2.2 The intent message wire format (BCS, positional)
```move
public struct IntentMessage<T: drop> has copy, drop {
    intent: u8,
    timestamp_ms: u64,
    payload: T,
}
```
- **The third field is named `payload`, not `data`.** (The enclave's JSON *HTTP response* wraps the value under a key called `data`, which is the source of the confusion — but the on-chain Move struct field is `payload`.) BCS is positional, so verification is unaffected by the name; the build team must name it `payload` to keep the layout identical to the Rust signer and avoid drift.
- **Canonical BCS test vector (verbatim, must verify `true` on Day 1):**
  `x"0020b1d110960100000d53616e204672616e636973636f0d00000000000000"`
  Decodes to `intent_scope=0, timestamp_ms=1744038900000, location="San Francisco", temperature=13`. Identical to the Rust `test_serde` in `nautilus-server/app.rs`. This shared vector is the canary that proves Rust↔Move BCS alignment.

### 2.3 The two-phase trust model (one expensive registration, cheap thereafter)
- **Registration (once, expensive):** `register_enclave()` consumes a `NitroAttestationDocument`, calls `load_pk`, verifies `document.to_pcrs() == config.pcrs`, and stores the enclave's Ed25519 pubkey in a **shared `Enclave<T>` object.**
- **Per request (cheap):** `verify_signature()` checks an Ed25519 signature against the stored pubkey. No cert-chain work per request.

### 2.4 Enclave configuration & PCR semantics
```move
public struct EnclaveConfig<T> /* holds */ {
    // Pcrs { pcr0, pcr1, pcr2 } + version
}
```
- `EnclaveConfig<T>` holds `Pcrs(pcr0, pcr1, pcr2)` + a `version`. **PCR0 = enclave image, PCR1 = kernel, PCR2 = application** (confirmed in source comments).
- A `Cap<T>` gates PCR updates (incrementing `version`).
- **Production check:** PCR0/1/2 must be non-zero. Debug-mode enclaves emit all-zero PCRs; the documented weather example yields real values (e.g. `PCR0=911c87d0...`).

### 2.5 The native Sui-framework attestation module
- `sui::nitro_attestation` is a **real native module** in the Sui framework, exposing `NitroAttestationDocument` and on-chain attestation verification (`load_nitro_attestation()`).
- The **AWS Nitro root CA is embedded in the framework** at `crates/sui-types/src/nitro_root_certificate.pem` (sha256 `6eb9688305e4bbca67f44b59c29a0661ae930f09b5945b5d1d9ae01125c8d6c0`, verified to match the AWS-published root). This is *why* the chain can trust an enclave with no oracle bridge — the trust anchor ships in the protocol.

### 2.6 Why this is the moat (state it to judges in the first 60 seconds)
EVM cannot natively verify a Nitro Enclave PCR-pinned attestation in a contract; it needs a third-party oracle, which reintroduces exactly the trust assumption ConduitCredit removes. On Sui, the root CA is in the framework and the per-request check is a cheap on-chain Ed25519 verify. This is the irreplaceable Sui-specific work that earns the 20% Technical score.

---

## 3. Verified real interfaces — supply-side composition & the standalone pool

### 3.1 Supply side composes (idle capital → base yield)
When pool utilization is below threshold (target `util < 80%`), idle USDC can earn base yield by depositing into a live Sui money market:
- **Suilend**: `deposit_liquidity_and_mint_ctokens()` — live on Sui mainnet (LendingMarket / Reserve / Obligation architecture).
- **Scallop**: `mint()`.

These are *supply* (deposit) calls and compose cleanly because depositing liquidity does not require a sender-owned obligation capability.

### 3.2 Borrow side does NOT compose (the reason for a standalone pool)
- Suilend / Scallop / NAVI borrow paths require an `ObligationOwnerCap` / `ObligationKey` **owned by the transaction sender**. A protocol cannot borrow on a third party's behalf. NAVI's relevant entry functions abort.
- There is no flash-loan or wrapper path that legitimately mints *under-collateralized* credit against TEE-attested off-chain income — that product does not exist on Sui to compose with.
- **Conclusion (verified):** ConduitCredit owns its lending pool. This is correct, not a workaround.

---

## 4. Deployment path — Marlin Oyster vs self-managed Nitro

Both are real; **pick one on Day 1** because the on-chain registration code paths differ and switching is rework.

| | Self-managed Nautilus template | Marlin Oyster managed |
|---|---|---|
| PCRs | PCR0/1/2 only | PCR0/1/2 **+ PCR16** (derived from docker-compose contents) |
| Registry | Your own `EnclaveConfig<T>` | **Shared, application-independent** on-chain enclave registry |
| Ops | You manage AWS Nitro directly | Deploy via Docker image + `oyster-cvm` CLI; no direct AWS interaction |
| Guarantees | Full Nitro/PCR | Preserves Nitro/PCR guarantees (documented in official Sui docs: `sui-stack/nautilus/community-dev-tools`) |

**Marlin Oyster on-chain identifiers (verified):**
- Testnet: `REGISTRY_PACKAGE_ID 0x05cd5a306375c49727fc2f1e667df8bcc1f5b52ad07e850074d330afda932761`, `REGISTRY_ID 0x7ebc3f9bc7a0cf0820d241ad767036483b885bbd62636fb9446bb0d99d2ed091`.
- Mainnet: `PACKAGE 0x8df76b79118ffad2bacb55705c84474802ddb3d62199b98db720c5088e161ab8`.

**Recommendation:** Marlin Oyster (lower ops burden, live since Dec 2025), committed Day 1. Either way, the `verify_signature` gate and the credit contracts are identical.

---

## 5. Verified product/protocol design (grounded contracts)

> These are the build seeds from the verified brief. Field/type details are sound; the BCS-layout discipline of §2.2 governs the enclave payload.

### 5.1 Move objects
- **`IncomeAttestation { id: UID, owner: address, income_6mo_avg_usdc: u64, attestation_ts: u64, expiry_ts: u64 (30-day TTL), enclave_id: ID }`** — non-transferable, minted by `attest_income()` *only after* `verify_signature()` passes. The 30-day TTL forces periodic re-underwriting.
- **`CreditPool { liquidity: Balance<USDC>, total_borrowed, total_lp_shares, junior_loss_reserve }`** — shared object.
- **`CreditLine { borrower, credit_limit_usdc, outstanding_usdc, attestation_id, ir_bps, opened_ts }`**.
- **`LPToken<phantom T>`** — fungible LP share.

### 5.2 The enclave payload (Rust signer ↔ Move must match by BCS position)
- **`CreditPayload { borrower, income_6mo_avg_usdc, data_source, fetch_ts_ms }`** — the enclave fetches Plaid **`/identity/get`** + **`/income/verification/paystubs`**, computes the 6-month average, and signs `IntentMessage<CreditPayload> { intent: 2, timestamp_ms, payload }`.
- **Intent scope = `2`** (distinct from the weather example's `0`).
- Paired Move+Rust serde tests are mandatory (§2.2) — layout drift is the #1 failure mode.

### 5.3 Underwriting & rate math (benchmarked, §6)
- `credit_limit = (income_6mo_avg_usdc * LTV_bps) / 10000`, **`LTV_bps = 3000`** default (range 25–40% of the 6-month income average).
- `ir_bps = BASE_IR_BPS (800) + RISK_PREMIUM_BPS (200–500)` → 10–13% APR band.

### 5.4 Tranches & default handling
- **Junior tranche = 15% first-loss; senior = 85%** (mirrors 3Jane's USD3/sUSD3 structure, §6). Junior absorbs expected loss first; senior is protected.
- `declare_default(borrower)` after `MAX_TERM_DAYS` → emits `DefaultEvent`, writes off bad debt against the **junior loss reserve first**, and sets a `blacklist: Table<address, bool>` entry.
- Idle capital (`util < 80%`) routes to Suilend supply for base yield (§3.1).

### 5.5 Demo flow (the live underwriting loop must be real, not stubbed)
`connect wallet → Plaid Sandbox (mock OAuth) → submit income proof (enclave actually fetches /identity/get + /income/verification/paystubs and signs) → attest_income() → open_credit_line() → borrow() → repay()`; plus LP `deposit` / `withdraw`. Plaid **Sandbox** mock OAuth is acceptable, but the enclave must genuinely call Plaid so the TEE story is real. Pre-caching a set of valid signed attestations as a demo-day failover is legitimate (the signature verifies regardless of whether the enclave call was live or cached).

---

## 6. The live competitive field (verified)

### 6.1 Off-Sui validation — the model demonstrably works
- **3Jane (live mainnet, since Nov 2025):** extends USDC credit lines underwritten against a "Jane Score" + **verified on-chain/CEX/bank assets**; idle depositor USDC parked in Aave for yield; structured as a merchant cash advance on future receivables; **senior/junior tranches `USD3` (senior) + `sUSD3` (junior)**. This is a **near-exact off-chain analog** of ConduitCredit's income+asset-verified credit lines, senior/junior tranching, and idle-yield design — strong evidence the model works at scale. ConduitCredit's differentiation: TEE-verified *income* (not just a reputation score), on Sui, with the credit instrument as a first-class Move object.
- **Huma Finance ($16M Morpho vault, Jun 16, 2026):** PayFi credit against cross-border payment receivables; recent dated proof that lender demand for income/receivables-backed credit is activating *now*. Huma is EVM, institutional, off-chain underwriting committee — ConduitCredit is the individual-level, TEE-underwritten, Sui-native version.

### 6.2 On-Sui — uncontested
- **No Sui-native Nautilus income-credit competitor exists** (verified across multiple searches).
- **Shell Finance** uses Nautilus on Sui — but for **dark-pool order matching**, which is orthogonal. "TEE as a credit oracle" ≠ "TEE as a matching engine."
- Suilend / NAVI / Scallop are all live and strictly over-collateralized; none reads income, none offers under-collateralized credit, none exposes a third-party borrow path (§3.2).

### 6.3 The benched DeFi challenger (do not pivot to it)
"FlowPay" (generic earned-wage access) shares the RWA lane but lacks the Nautilus TEE moat that wins the 20% Technical score. Pivoting to it kills the verified-income story. The correct fallback is **oracle-attested income with identical contracts** (§1, §7).

---

## 7. Honest risks (what a skeptical judge will push on)

| Risk | Severity | Mitigation |
|---|---|---|
| **Live enclave flaky on demo day** (RPC/Plaid latency, attestation serialization). | High | Two-phase model makes per-request cheap; pre-cache valid signed attestations as failover; oracle-attested fallback keeps identical contracts. |
| **Rust↔Move BCS layout drift** on `CreditPayload`. | High (silent) | Field name `payload`; intent scope `2`; paired Move+Rust serde tests mirroring nautilus `test_serde`; assert the canonical weather vector verifies `true` Day 1. |
| **Wrong enclave path chosen, then switched.** | Medium | Decide Marlin Oyster vs self-managed Day 1; PCR16 + shared registry differ from self-managed. |
| **PCR churn** from late `allowed_endpoints.yaml` / image changes forcing re-registration. | Medium | Freeze the endpoint whitelist + image Day 1; keys via AWS Secrets Manager, not in the binary. |
| **Debug-mode enclave** (all-zero PCRs) mistaken for production. | Low | Assert PCR0/1/2 non-zero before trusting an attestation. |
| **"Is under-collateralized lending safe?"** judge skepticism. | Medium (narrative) | Benchmarked params: LTV 25–40% of 6-mo income avg; junior 15% first-loss absorbs expected loss; IR 800bps + 200–500bps risk premium; default benchmarks ~3–8% net loss prime verified-income, 15–25% gig/1099. Frame conservatively. |
| **Plaid Sandbox ≠ production data.** | Low (demo), Medium (mainnet) | Sandbox is fine for the demo if the enclave genuinely calls Plaid; production Plaid is the mainnet path (second 50% of prize). |
| **Composability over-claim.** | Medium | Do **not** claim third-party borrow composition into Suilend/Scallop/NAVI (blocked, §3.2). Claim only supply-side idle-yield composition, which is real. |
| **Unindexed CN-region field** (~40–70 teams of unknown quality). | Irreducible | Caps win probability below ~45%; nothing more to research until submissions go public. |

---

## 8. Source-of-truth interface summary (quote these verbatim)

- `enclave::enclave::verify_signature<T, P: drop>(enclave: &Enclave<T>, intent_scope: u8, timestamp_ms: u64, payload: P, signature: &vector<u8>): bool` — MystenLabs/nautilus `enclave.move` @ `main` (sha `8468381`). Cheap Ed25519 over BCS `IntentMessage`.
- `IntentMessage<T: drop> { intent: u8, timestamp_ms: u64, payload: T }` — field is **`payload`**.
- Canonical BCS test vector: `x"0020b1d110960100000d53616e204672616e636973636f0d00000000000000"`.
- `sui::nitro_attestation` native module; `load_nitro_attestation()`; AWS Nitro root CA embedded at `crates/sui-types/src/nitro_root_certificate.pem` (sha256 `6eb9688305e4bbca67f44b59c29a0661ae930f09b5945b5d1d9ae01125c8d6c0`).
- `EnclaveConfig<T>` → `Pcrs(pcr0, pcr1, pcr2)` + version; `Cap<T>` gates updates; PCR0=image, PCR1=kernel, PCR2=application.
- Suilend `deposit_liquidity_and_mint_ctokens()` / Scallop `mint()` — supply-side composition only.
- Marlin Oyster Testnet `REGISTRY_PACKAGE_ID 0x05cd5a306375c49727fc2f1e667df8bcc1f5b52ad07e850074d330afda932761`, `REGISTRY_ID 0x7ebc3f9bc7a0cf0820d241ad767036483b885bbd62636fb9446bb0d99d2ed091`; Mainnet `PACKAGE 0x8df76b79118ffad2bacb55705c84474802ddb3d62199b98db720c5088e161ab8`.

> Corrections applied vs `specs/05-conduitcredit.md`: use real `enclave::enclave::verify_signature` over **BCS** (not a custom JSON-signature verifier); struct field **`payload`** not `data`; **standalone pool** (borrow-side composition into Suilend/Scallop/NAVI is blocked, not available); supply-side composition only; LTV `3000` bps default with 25–40% band; junior 15% first-loss / senior 85%.
