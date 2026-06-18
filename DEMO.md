# ConduitCredit — 5-minute demo script

> Lead with the borrower + the live underwriting moment in the first 90 seconds. Every claim below is backed by a real testnet transaction (digests in the README).

| Time | On screen | Say / show |
|---|---|---|
| **0:00–0:45** | Slide: *"Maria — $4,200/mo gig income, $0 idle crypto."* | The person and the wall: every Sui money market (Suilend/NAVI/Scallop) needs **130–200% collateral** — they serve capital, not income. **One-sentence thesis:** *prove six months of real income to the chain, privately, and draw a USDC credit line sized to it.* |
| **0:45–1:30** | Slide: *why Sui.* | *"EVM can't verify a Nitro attestation in-contract — it needs an oracle that re-introduces trust. Sui ships the AWS Nitro root CA in the framework (`sui::nitro_attestation`); the per-request check is a cheap Ed25519 `verify_signature`."* The moat, in 45s. |
| **1:30–3:00** | **dApp** → Connect wallet → "Get test dUSDC" → **Link income (Plaid Sandbox)** → **Submit income proof**. | The enclave reads income, signs an attestation; the `attest_income` tx runs **on-chain `verify_signature` → TRUE → a non-transferable `IncomeAttestation` appears** (income $4,200). *Raw bank data never touched the chain.* Then hit **Tamper**: flip one signature byte, resubmit → **tx ABORTS (`E_BAD_SIGNATURE`)**. Accept-good / reject-bad, live — the whole thesis. |
| **3:00–3:50** | dApp → **Open credit line** → **Borrow $1,000** → **Repay**. | `open_credit_line` → limit = $4,200 × 30% = **$1,260**. `borrow` → 1,000 dUSDC lands in Maria's wallet (balance changes). `repay` → line restored; interest accrues to LPs. |
| **3:50–4:30** | dApp lender view → **deposit Junior**, then **Senior**; tranche bars. | 15% junior first-loss buffer sitting beneath the protected 85% senior; pool liquidity + utilization update live. |
| **4:30–5:00** | README: package + Enclave/Pool IDs on Suiscan; the mainnet path. | Real testnet deployment + a credible mainnet path (Plaid production + Marlin Oyster `register_via_nitro`) = the second 50% of the prize. Oracle fallback mentioned as resilience, not a pivot. |

**Reproduce the whole loop headless:** `cd scripts && node demo.mjs` — deposit → attest → open → borrow → repay → reject-forgery, every tx on testnet.

**Demo-day failover (legitimate):** pre-signed attestations verify identically whether the enclave call was live or cached, so a Plaid/RPC hiccup never breaks the live-verify moment.

## The 30-second "why it's hard to fake" for judges
- **Real Sui-native work, live:** `attest_income` calls the real `verify_signature` (Ed25519 over a BCS `IntentMessage`) against a registered `Enclave`; a forged signature aborts on chain (testnet digest `CcK81YQR…`).
- **BCS discipline proven across 3 languages:** the canonical nautilus weather vector and the `CreditPayload` serialize byte-identically in Move, Rust (enclave), and JS — and Rust + JS produce the *same* Ed25519 signature (paired serde tests, all green).
- **Production-ready:** `register_via_nitro` already uses the native `sui::nitro_attestation`; the pool is generic over the coin type, so mainnet swaps to native USDC unchanged.
