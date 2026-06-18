# ConduitCredit — Hackathon Context & Day-1 Checklist
### Sui Overflow 2026 · DeFi & Payments Track ($30,000 first prize)

> This is the operating manual for the build. Everything here is rules-of-the-game + a tailored Day-1 testnet checklist. The product research, the GO/NO-GO gate, and the verified Move/SDK interfaces live in `01-RESEARCH.md`. Read both before writing a line of Move.

---

## 0. Who uses this, and why (lead with it — it is 50% of the score)

**ConduitCredit issues on-chain USDC credit lines underwritten by TEE-verified off-chain income.** The borrower is a real person with provable, recurring income but no posted collateral: a gig/1099 worker, a crypto-native or fiat salary earner, an SME with recurring receivables. Today, every Sui money market (Suilend, NAVI, Scallop) demands 130–200% over-collateralization — which means they only serve people who *already* have capital. ConduitCredit serves the people who have *income* but not *idle assets*: it reads their last six months of pay via a bank/payroll data API *inside an AWS Nitro enclave (Nautilus)*, proves to the chain that the income is real without leaking the raw statements, and opens a USDC credit line sized to that income. Lenders fund a standalone USDC pool, split into a junior (first-loss, high-yield) and senior (protected, lower-yield) tranche.

The Real-World Application criterion is **half the total score**. Every document, the demo, and the README must open with this paragraph — the named borrower, the named pain, the named market — before any mention of Move objects or enclaves.

---

## 1. The hackathon (authoritative facts)

| Field | Value |
|---|---|
| Event | Sui Overflow 2026 — Sui's flagship global online hackathon. Theme: **"Build What Matters."** |
| Format | Fully online: submissions, judging, and Demo Day all virtual. |
| Prize pool | $1,000,000+ headline across all tracks; $250k+ post-hackathon value (audit credits, mentorship). |
| Build period | **May 7 – June 21, 2026.** |
| **Submission deadline** | **June 21, 2026, 6:00 PM Pacific Time.** Hard. You may keep editing after, but post-deadline changes are not guaranteed to be judged. |
| Shortlist announced | July 8, 2026. |
| **Demo Day (our track)** | **July 21, 2026** — DeFi & Payments + DeepBook present this day. (Agentic Web + Walrus present July 20.) |
| Winners announced | August 27, 2026 (winners pitch at Sui Basecamp 2026). |
| Register | DeepSurge: https://www.deepsurge.xyz/hackathons/b587dc0c-4cb8-4e63-ada5-519df38103bf |
| Submit | DeepSurge → Overflow 2026 → "Submit Project." |
| Handbook | https://mystenlabs.notion.site/overflow-2026-handbook (authoritative; the landing page mixes in stale 2024/2025 content). |

---

## 2. Our track: DeFi & Payments ($30k core)

**Track mandate (verbatim intent):** *Build programmable payment systems and financial applications on Sui that move, manage, and transform money intelligently — creating more seamless, automated, and composable financial experiences beyond traditional DeFi.*

**The problem the track names:** Payments and DeFi are disconnected — payments are static transfers, DeFi is complex and siloed, users orchestrate everything manually. On Sui, assets are objects, transactions bundle multi-step logic atomically (PTBs), and Move enforces ownership at the type level → **programmable money.**

**Where ConduitCredit lands in the track's own idea bank:** the "Trust-Minimized Finance" bucket names *"programmable loans"* and *"payment-linked credit systems"* explicitly. ConduitCredit is exactly that: a payment-linked credit system where verified income — not posted tokens — is the underwriting basis, and repayment is a programmable financial action.

**What a top-tier entry looks like (per the track):** clear financial use case, correct asset/ownership handling, working end-to-end flows, thoughtful user abstraction, novel PTB use, strong composability, excellent UX, **real-world applicability.**

### Prizes (per core track)
| Place | Prize |
|---|---|
| 1st | **$30,000** |
| 2nd | $15,000 |
| 3rd | $10,000 |
| 4th | $7,500 |

### Judging weights (core tracks)
| Criterion | Weight | What it measures |
|---|---|---|
| **Real-World Application** | **50%** | Meaningful problem, market relevance, long-term value. *Lead with who-uses-this-and-why.* |
| **Product & UX** | **20%** | Quality, usability, polish. |
| **Technical Implementation** | **20%** | Technical quality, reliability, *meaningful* Sui integration. The Nautilus TEE underwriting loop is what scores here — it must be live, not mocked. |
| **Presentation & Vision** | **10%** | Clarity, storytelling, long-term vision. |

### Judges
DeFi & Payments is judged by the **Mysten Labs / Sui Foundation** panel (not a named external sponsor like DeepBook's Tashtanov/Block Scholes or Walrus's team). Implication: the judges are Sui engineers and ecosystem leads who reward (a) a real-world problem told in one sentence, and (b) Sui primitives doing genuine, irreplaceable work — here, on-chain verification of a Nitro attestation via `sui::nitro_attestation` and per-request `enclave::enclave::verify_signature`, which has no EVM-native equivalent. Generic lending clones will not place; the TEE-verified-income angle is the moat.

---

## 3. Submission requirements (DeFi & Payments)

| Item | Requirement |
|---|---|
| Project Name | ConduitCredit. |
| Description | What it does + why it matters (lead with the borrower). |
| Logo | 1:1 ratio, JPG/PNG. |
| **Public GitHub repo** | **Must be public during judging.** See §5 on commit history. |
| **Demo video** | **Required, ≤ 5 minutes**, YouTube preferred. Content past 5:00 is not considered. Lead with the borrower + the live underwriting moment in the first 90 seconds. |
| Website | Optional, strongly recommended (the live testnet dApp). |
| Deployment | **Testnet or mainnet by shortlist/Demo Day.** Testnet is sufficient to be judged; mainnet unlocks the second half of the prize (§4). |
| Package ID | Required if deployed on-chain — publish the testnet package ID + key object IDs in the README. |
| Track checkbox | Tick the **Core Track** checkbox (applies to Agentic Web + DeFi & Payments). |

---

## 4. The 50/50 prize rule (build a credible mainnet path now)

Prizes split to reward continued development:
- **50% on winner announcement** (Aug 27, 2026).
- **50% after a successful mainnet deployment** that meets the Sui team's minimum functional requirements.
- If already on mainnet by the announcement → **100% upfront.**

**Action:** keep the contracts mainnet-ready from commit #1. The standalone pool, `CreditPool`/`CreditLine`/`IncomeAttestation` contracts, and the Nautilus verification path are all mainnet-deployable as-is. The only mainnet gating concern is the income data source (Plaid sandbox → Plaid production) and a self-managed-Nitro vs Marlin-Oyster decision (see `01-RESEARCH.md` §4). Document the mainnet path in the README to make the second 50% credible to judges.

---

## 5. Eligibility, team, KYC, and the repo-history rule (disqualifiers)

- **Team ≥ 2 members.** No maximum. List everyone on the DeepSurge submission. The POC/team leader creates the project and adds teammates.
- **≥ 1 member must pass KYC** to receive any prize. Identify who, and start KYC early.
- **No participants from OFAC-sanctioned regions.**
- **New work only.** The project must be built during May 7 – June 21, 2026. Pre-existing projects are eligible *only* with explicit written Sui Foundation permission disclosed in video + description + judging — and using pre-existing work **forfeits finalist eligibility.** ConduitCredit is a fresh build; keep it that way. (Generic frontend boilerplate / UI libraries / tooling you have rights to are fine; the protocol must be new.)
- **REAL commit history from commit #1.** *"You must use version control throughout. Repos with single commits of large files without proper history are assumed unqualified."* **A squashed or single-commit repo is disqualified.** Initialize the public repo on Day 1 with a real first commit and commit continuously through June 21. Do not import a large pre-built tree in one commit.
- **AI-assisted coding is allowed and expected** — judging is on product/technical/real-world quality, not hand-written line count.
- **One primary track per project.** ConduitCredit is DeFi & Payments only.

---

## 6. Demo Day (if shortlisted — July 21)

- ≥ 1 team member must attend the assigned session live (Zoom; streamed on YouTube).
- **5 minutes presentation + up to 2 minutes Q&A. Timing strictly enforced.**
- Cover: the problem, the solution, technical implementation, *why Sui*, roadmap.
- Absence after a second call → forfeit. Join early.
- English encouraged; subtitled/narrated video acceptable if not comfortable presenting live.

---

## 7. TAILORED DAY-1 TESTNET CHECKLIST

> The single highest-risk dependency is the Nautilus enclave gate. Prove it works **before** writing any credit logic. Do these in order. Each step has an explicit pass/fail assertion.

### A. Decide the enclave path (BLOCKING — pick one, do not defer)
There are **two different on-chain registration code paths**, and switching later is rework:
1. **Self-managed Nautilus template** — your own `EnclaveConfig<T>` with PCR0/PCR1/PCR2 only, registered via the MystenLabs/nautilus flow.
2. **Marlin Oyster managed enclave** — uses Oyster's *shared* on-chain enclave registry and adds **PCR16** (derived from docker-compose contents) on top of PCR0/1/2. Deploys via Docker image + `oyster-cvm` CLI, no direct AWS interaction.
   - Oyster **Testnet**: `REGISTRY_PACKAGE_ID 0x05cd5a306375c49727fc2f1e667df8bcc1f5b52ad07e850074d330afda932761`, `REGISTRY_ID 0x7ebc3f9bc7a0cf0820d241ad767036483b885bbd62636fb9446bb0d99d2ed091`.
   - Oyster **Mainnet**: `PACKAGE 0x8df76b79118ffad2bacb55705c84474802ddb3d62199b98db720c5088e161ab8`.
- **Recommendation:** Marlin Oyster for lower ops burden, but commit to it Day 1 because PCR16 and the shared-registry call path differ from self-managed.

### B. Stand up the shared Nautilus gate FIRST (the make-or-break)
3. Deploy the **`nautilus` weather-example enclave** (from MystenLabs/nautilus) to your chosen path (Marlin Oyster or self-managed Nitro).
4. **Register on testnet:** run the one-time expensive attestation registration that consumes a `NitroAttestationDocument`, verifies PCRs, and stores the enclave's Ed25519 pubkey in a shared `Enclave<T>` object.
5. **Assert the gate:** call `enclave::enclave::verify_signature<T, P: drop>(...)` with the **canonical BCS test vector** and assert it returns `true`:
   - Hex payload (scope=0, ts=1744038900000, "San Francisco", temp=13): `x"0020b1d110960100000d53616e204672616e636973636f0d00000000000000"`
   - This vector is shared with the Rust `test_serde` in `nautilus-server/app.rs`. If Move verification returns `true`, the gate is real and BCS layout is aligned. **If this fails, stop and fix before anything else.**
6. **Confirm PCRs are production, not debug:** PCR0/1/2 must be non-zero (debug-mode enclaves emit all-zero PCRs). The documented weather example yields real non-trivial values (e.g. `PCR0=911c87d0...`).

### C. Freeze the enclave's external surface Day 1 (PCR churn)
7. **Finalize `allowed_endpoints.yaml` at BUILD time** — whitelist the Plaid endpoints the enclave will hit (`/identity/get`, `/income/verification/paystubs`). *Any* change to this file churns the PCRs and forces re-registration, so lock it Day 1.
8. **API keys go in AWS Secrets Manager** — never baked into the binary or the image (they would land in the PCRs). Plaid keys are fetched at runtime inside the enclave.

### D. Define the credit payload BCS contract (the #1 silent-failure source)
9. Define `CreditPayload` as a Move struct whose BCS field order/types **exactly mirror** the Rust signer. Use a **custom intent scope = `2`** (distinct from the weather example's `0`).
10. The on-chain Move struct field must be named **`payload`** (not `data`): `IntentMessage<T: drop> { intent: u8, timestamp_ms: u64, payload: T }`. (The enclave's *JSON HTTP response* wraps it as `data`, but BCS is positional and the Move struct field is `payload`. Matching Rust↔Move field order is what matters.)
11. Write **paired Move + Rust serde tests** (mirroring nautilus's `test_serde`) to catch layout drift. This is the most common Nautilus integration failure.

### E. Minimal credit stub that proves the loop
12. Build a minimal `CreditPool` stub whose `borrow()`/`attest_income()` calls `verify_signature()` against a hardcoded `Enclave` object: **reject a bad signature, accept a good one.** That single accept/reject assertion is the whole technical thesis in miniature.

### F. Repo & team hygiene (do alongside)
13. Initialize the **public GitHub repo with a real commit #1** (small, hand-authored). Commit continuously. No squashing.
14. Confirm **team ≥ 2** registered on DeepSurge; nominate and start **KYC** for ≥ 1 member.
15. Create the DeepSurge submission shell early so you can edit it through June 21.

### Day-1 done means:
`verify_signature()` returns `true` for the canonical vector on testnet **and** your stub `borrow()` accepts a good signature / rejects a bad one. If both hold, the rest of ConduitCredit is conventional Move + a Next.js dApp.

---

## 8. Fallback posture (keep it ready, do not pivot)

If AWS Nitro / Marlin infra slips and the live enclave cannot be made reliable in time, the **oracle-attested-income fallback** keeps every contract identical — `CreditPool`, `CreditLine`, `IncomeAttestation`, the tranches, the LTV/IR math, the demo flow — and changes only the income-proof *source* from a TEE-signed attestation to a trusted oracle-operator-signed attestation using the **same `verify_signature` pattern**. This preserves the RWA + yield story. **Do NOT pivot to a generic earned-wage-access "FlowPay" — that kills the verified-income technical moat that wins the 20% Technical score.**
