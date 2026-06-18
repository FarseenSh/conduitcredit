# ConduitCredit

**Maria drives for a rideshare platform and picks up freelance design work. Over six months she has averaged $4,200/month in verifiable, recurring income — but she owns no idle crypto to post as collateral.** Every money market on Sui (Suilend, NAVI, Scallop) demands 130–200% over-collateralization, so they can only serve people who *already* have capital. ConduitCredit serves people who have **income, not idle assets**.

ConduitCredit issues **on-chain USDC credit lines underwritten by TEE-verified off-chain income**. An AWS Nitro enclave (Nautilus) reads Maria's payroll/bank data, proves the income to the Sui chain **without publishing her raw statements**, and a USDC credit line is sized to that income. Lenders fund a standalone pool split into junior (first-loss, high-yield) and senior (protected) tranches.

**Why Sui:** EVM cannot natively verify a Nitro Enclave PCR-pinned attestation in a contract — it needs a third-party oracle that re-introduces the trust assumption we remove. On Sui the AWS Nitro root CA ships in the framework (`sui::nitro_attestation`) and the per-request check is a cheap on-chain Ed25519 `verify_signature`. The whole technical thesis in miniature: **`verify_signature` accepts a good enclave signature and rejects a bad one.**

---

## Status — Day-1 gate

This repo is built gate-first. The make-or-break first gate — the verification primitive the entire protocol rests on — is **GREEN on testnet**:

- [x] **Local (`sui move test`, 6/6 pass):** our BCS layout matches nautilus's canonical weather vector byte-for-byte *and* the offline signer; a good Ed25519 signature is accepted, a tampered one rejected.
- [x] **Testnet (gas only, no test-USDC):** the published canary `enclave_registry::assert_verify` accepts the good signature (tx success) and aborts on a tampered one (`E_BAD_SIGNATURE`).

`enclave_registry::assert_verify` reconstructs `BCS(IntentMessage{ intent: 2, timestamp_ms, CreditPayload })` and Ed25519-verifies it — the exact primitive nautilus `enclave::verify_signature` runs once our enclave is registered. Next: register ConduitCredit's own enclave via Marlin Oyster, then the credit logic (pool, credit line, tranches, default) + dApp.

### Deployment (testnet)
| Item | Value |
|---|---|
| Package ID | `0xdb062506575fb08f0596eb28ad4a444693838e362147099ba784d93535b28692` |
| Deployer / signer | `0xfae8332571a32b75913eee73c83000c45b1fbfe79fd3f6f84197bf35271b75c2` |
| Publish tx | `CvsN3NspxKWYCjwaPhWo5sziZCGHuMSpukwbqb15hGat` |
| Gate — accept good → success | `DNjZ2oCpohUF5Cc6ybuPFAYQ3sdSbZNqpgMrRNYhEtmB` |
| Gate — reject tampered → abort `E_BAD_SIGNATURE` | `EuKFwz9pZonBYcybDfziQbtNtkMas6Jk83rBNZ33ynvT` |
| Enclave path | **Marlin Oyster** (managed Nitro; shared registry + PCR16) — committed Day-1 |

Reproduce: `cd scripts && pnpm install && node sign.mjs` (fixture) → `sui move test --path contracts` (local gate, 6/6) → `PKG=<id> node gate_call.mjs` (on-chain accept/reject).

### Layout
```
contracts/   Move package (conduit_credit)
scripts/     offline Ed25519 signer + isolated Sui config wrapper
app/         Next.js dApp (post-gate)
enclave/     Rust nautilus-server (post-gate)
```

### Mainnet path (the 2nd 50% of the prize)
All Move modules, the `verify_signature` gate, and the BCS contract are mainnet-ready as-is. Mainnet requires only Plaid sandbox→production keys + Marlin Oyster testnet→mainnet re-registration; contracts deploy unchanged.
