# ConduitCredit

**Maria drives for a rideshare platform and picks up freelance design work. Over six months she has averaged $4,200/month in verifiable, recurring income — but she owns no idle crypto to post as collateral.** Every money market on Sui (Suilend, NAVI, Scallop) demands 130–200% over-collateralization, so they can only serve people who *already* have capital. ConduitCredit serves people who have **income, not idle assets**.

ConduitCredit issues **on-chain USDC credit lines underwritten by TEE-verified off-chain income**. An AWS Nitro enclave (Nautilus) reads Maria's payroll/bank data, proves the income to the Sui chain **without publishing her raw statements**, and a USDC credit line is sized to that income. Lenders fund a standalone pool split into junior (first-loss, high-yield) and senior (protected) tranches.

**Why Sui:** EVM cannot natively verify a Nitro Enclave PCR-pinned attestation in a contract — it needs a third-party oracle that re-introduces the trust assumption we remove. On Sui the AWS Nitro root CA ships in the framework (`sui::nitro_attestation`) and the per-request check is a cheap on-chain Ed25519 `verify_signature`. The whole technical thesis in miniature: **`verify_signature` accepts a good enclave signature and rejects a bad one.**

---

## Status — Day-1 gate

This repo is being built gate-first. The make-or-break first gate is the verification primitive that the entire protocol rests on:

- [ ] **Local:** `sui move test` proves accept-good / reject-bad and pins our BCS layout to nautilus's canonical vector byte-for-byte.
- [ ] **Testnet (gas only):** a published canary proves the same accept/reject on-chain.

Once green, the credit logic (pool, credit line, tranches, default) and the live Marlin Oyster enclave follow.

### Deployment IDs (testnet)
- Package ID: _pending gate_
- Enclave deployment path: **Marlin Oyster** (managed Nitro; shared registry + PCR16) — committed Day-1.

### Layout
```
contracts/   Move package (conduit_credit)
scripts/     offline Ed25519 signer + isolated Sui config wrapper
app/         Next.js dApp (post-gate)
enclave/     Rust nautilus-server (post-gate)
```

### Mainnet path (the 2nd 50% of the prize)
All Move modules, the `verify_signature` gate, and the BCS contract are mainnet-ready as-is. Mainnet requires only Plaid sandbox→production keys + Marlin Oyster testnet→mainnet re-registration; contracts deploy unchanged.
