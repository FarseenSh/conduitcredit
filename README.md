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
| Senior LP deposit | 5,000 dUSDC → protected tranche | `CXyixgqSXV9KnxVfw66udXAk8EdJHrmhsFsDJPC7jjxV` |
| Junior LP deposit | 2,000 dUSDC → first-loss tranche | `EQfpJXrqG39zsqZxwH7fSQw8MoGPLHZgQqiYtwR2qcsm` |
| **attest_income** | enclave-signed income → **on-chain `verify_signature` ✓** → `IncomeAttestation` minted | `CJr8Ad8t1HdaTF2jPPJ1mKY5WE3d6Eu8d7HMFwWZWo4D` |
| open_credit_line | limit = $4,200 × 30% = **$1,260** | `EdfnLj7djrYnd5QnRsWGWzgEyyd6s5enJiyQhmPiG1Ma` |
| borrow | 1,000 dUSDC lands in the wallet | `DH6pbHZsjSdJLGhjj4CxhNPgkFCNdJf4svaM43ptWckr` |
| repay | principal back, interest to LPs | `5MsMA3LjLFkQkEwsjpC2wKtqckcbSBqZsGv7AA9jnHKr` |
| close_credit_line | line repaid in full → one-line slot freed | `Ginc2K8spYw4HcaLDQZQraWAv1faen2D6w3BqUMCi23q` |
| **forged attestation** | tampered signature → **chain ABORTS** (`income::attest_income` `E_BAD_SIGNATURE`) | `FNoV6aosjkurRnC4oxsq74hzL1zQpSuHaaFafHsx8cUw` |

Every `verify_signature` runs **live on testnet — not mocked**: the chain itself accepts the good signature and **aborts the forged one** (`E_BAD_SIGNATURE`, digest above). On testnet the enclave key is bound through the **operator fallback** (`register_via_operator`) — the documented resilience path. The native **AWS-Nitro** registration (`register_via_nitro`) is fully implemented and proven against a *real* AWS attestation in `contracts/tests/nitro_tests.move`, and is the one-switch mainnet step (see [Mainnet path](#mainnet-path-the-5050-prize-is-credible)). Same `verify_signature` either way — only the key's *origin* changes.

---

## Deployed on Sui testnet

| Object | ID |
|---|---|
| **Package** | `0x7888afef9c138ba74649bae2d68f98b7a854f4ac6a2c0975f5d0a1ce39f2406d` |
| **Enclave** (registered Ed25519 key) | `0x7670a951bec571857ab204ede863b0ae527cf103fea97139c28d7d867857362e` |
| **CreditPool\<dUSDC\>** (shared) | `0xca88fdb21fe1ae77c21009305399bd2a4f7f064d4ff05d9a95074ffc02fdb4aa` |
| **Blacklist** (shared) | `0xfb471409478c7f953d64da510a6b2068f489dcf72d35f8dedc650bf7dc948fe1` |
| **EnclaveConfig** (pinned PCR measurements) | `0xba9fbcf203a9ca74e29655f92e672d0a0f6a4f07116296158d7916de4afedb08` |
| dUSDC type | `0x7888afef…::mock_usdc::MOCK_USDC` |
| Publish tx | `FZFGCLE6V3zpZG4KXXwsZvk7iWadJjMBGTfzePShisFH` |
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
   credit_line       — open (limit = income×LTV) / borrow / repay / close;
                       ONE active line per borrower (anti over-borrow)
   credit_pool       — standalone pool; share-price junior/senior tranches;
                       junior-first loss; wiped-tranche guard; idle-yield ready
   defaults          — keeper write-off (junior-first) + blacklist
   registry          — shared borrower book: blacklist + one-line-per-borrower
```

**Two-phase trust:** the expensive step (verify a Nitro attestation's cert chain + PCRs against the AWS root CA in the framework) happens **once** at `register_enclave`; every per-borrower `attest_income` is a **cheap Ed25519 `verify_signature`** against the stored pubkey.

**Tranches (share-price vault model):** lenders pick **Senior** (protected, 85%) or **Junior** (first-loss, 15%, higher yield). Repaid interest raises tranche share prices (junior weighted higher); defaults shrink junior assets first, then senior — loss and yield socialize pro-rata automatically.

**Standalone pool — deliberate, not a shortcut.** Suilend/Scallop/NAVI borrow paths require a sender-owned `ObligationOwnerCap`; no protocol can borrow under-collateralized on a third party's behalf. So ConduitCredit owns its pool. It composes only on the *supply* side (idle USDC → base yield), which is real.

---

## Repository layout

```
contracts/   Move package `conduit_credit` (7 modules) + tests (14 passing)
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
sui move test  --path contracts            # 14/14 pass (gate + lifecycle + real Nitro attestation)
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
2. **Operator-fallback → real Nitro via Marlin Oyster** — deploy the `enclave/` image with `oyster-cvm`, pin its PCR0/1/2 via `set_expected_pcrs`, then call `enclave_registry::register_via_nitro` (already implemented and tested against a real attestation, using the native `sui::nitro_attestation`). PCR pinning makes registration permissionless yet trustless — only the canonical image's key is accepted.

**Resilience without diluting the story:** the income-proof *source* can swap from TEE-signed to a trusted-oracle-operator-signed attestation using the **identical `verify_signature` pattern** — every contract, tranche, and the demo stay the same (`register_via_operator` is exactly this path).

## Security & privacy

- **Raw bank/payroll statements never touch the chain** — only the enclave-signed 6-month average does.
- **No keys, `.env`, or raw income data are committed.** The Sui keystore lives in gitignored `./.sui`; production Plaid/enclave keys live in AWS Secrets Manager, fetched at runtime inside the enclave (never baked into the image / PCRs).
- BCS layout is pinned byte-for-byte across Rust (enclave), Move (chain), and the JS signer by paired serde tests — the canonical nautilus weather vector `0020b1d1…` verifies identically on all sides.
- **The production Nitro path is verified, not just written.** `contracts/tests/nitro_tests.move` drives `register_via_nitro` against a *real* AWS-signed Nitro attestation: the native `sui::nitro_attestation` validates the COSE signature + X.509 chain to the AWS root CA in the framework, and the registry asserts the attested **PCR measurements equal the pinned canonical image** (the `EnclaveConfig` object) — so only *our* enclave's key can register, never an attacker's own Nitro enclave. A wrong-PCR attestation is rejected (negative test).

## License

Apache-2.0.
