# ConduitCredit — Build-Ready Engineering Spec
### Sui Overflow 2026 · DeFi & Payments · v1.0 (build manual)

> **Real-world thesis (open every artifact with this):** *A gig worker, stablecoin-salary earner, or SME can prove six months of real income to the Sui chain without publishing their bank statements — via an AWS Nitro enclave the chain natively verifies — and draw a USDC credit line sized to that income from a standalone pool, while lenders earn tranched yield.*
>
> This document is the implementation contract. Every Move signature, BCS layout, PTB command order, and on-chain ID below is consistent with `01-RESEARCH.md` §2/§3/§4/§8 and `02-PRD.md` §F. Where this conflicts with the older `specs/05-conduitcredit.md`, the research dossier wins. **Do not invent Nautilus interface variants** — `verify_signature`, `IntentMessage`, and the canonical test vector are quoted verbatim from MystenLabs/nautilus `enclave.move` @ `main` (sha `8468381`).

---

## 1. Architecture overview (components + how they connect)

```
                          ┌──────────────────────────────────────────────────────────┐
                          │  BORROWER BROWSER  (Next.js dApp + @mysten/dapp-kit)       │
                          │  connect wallet → Plaid Link (Sandbox OAuth) → public_token │
                          └───────────────┬──────────────────────────┬────────────────┘
                                          │ (1) public_token          │ (5) signs+submits PTBs
                                          ▼                            ▼
        ┌─────────────────────────────────────────────┐    ┌──────────────────────────────┐
        │  ATTESTER BACKEND (Next.js API route, thin)  │    │  SUI TESTNET (Move packages)   │
        │  - exchanges public_token→access_token       │    │                                │
        │  - forwards a SIGNED REQUEST to the enclave   │    │  pkg conduit_credit::           │
        │    (does NOT see raw statements)              │    │   ├ enclave_registry  (Enclave) │
        └───────────────┬──────────────────────────────┘    │   ├ income            (Attest.) │
                        │ (2) {access_token, borrower_addr}  │   ├ credit_pool       (Pool/LP) │
                        ▼                                    │   ├ credit_line       (Line)    │
   ┌────────────────────────────────────────────┐           │   └ tranche / default           │
   │  NAUTILUS ENCLAVE (AWS Nitro via Marlin      │           │                                │
   │  Oyster CVM) — nautilus-server (Rust/axum)   │           │  dep enclave::enclave           │
   │  - fetches Plaid /identity/get +             │  (4)      │  dep sui::nitro_attestation     │
   │    /income/verification/paystubs            │  signed   │  (native, AWS root CA embedded) │
   │    (keys from AWS Secrets Manager, runtime)  │  payload  │                                │
   │  - computes 6-mo avg income                  │ ────────► │  Suilend (supply-side only,     │
   │  - BCS-serializes IntentMessage<CreditPayload│           │   idle-yield, stretch)          │
   │    {intent:2,...}> & Ed25519-signs it        │           └──────────────────────────────┘
   │  - returns {data: CreditPayload, signature}  │
   └─────────────────────┬────────────────────────┘
                         │ (3) one-time at deploy:
                         │   register_enclave() consumes NitroAttestationDocument,
                         │   verifies PCRs, stores Ed25519 pubkey in shared Enclave<T>
                         ▼
   ┌────────────────────────────────────────────┐
   │  KEEPER (off-chain cron, optional)           │
   │  - sweeps idle USDC → Suilend deposit         │
   │  - calls declare_default() past MAX_TERM_DAYS │
   └────────────────────────────────────────────┘
```

**Trust flow in one line:** the *expensive* trust step (`register_enclave`, cert-chain + PCR check against the framework-embedded AWS root CA) happens **once** at deploy; every per-borrower `attest_income` is a **cheap Ed25519 `verify_signature`** against the stored pubkey. The backend never sees raw bank statements; the enclave does, inside hardware, and emits only a signed average.

**Package layout (single published package `conduit_credit`, multiple modules):**

| Module | Responsibility | Key deps |
|---|---|---|
| `enclave_registry` | Wraps the Nautilus `Enclave<CONDUIT_ENCLAVE>` object + the witness type `CONDUIT_ENCLAVE` | `enclave::enclave`, `sui::nitro_attestation` |
| `income` | `CreditPayload`, `IncomeAttestation`, `attest_income()` (calls `verify_signature`) | `enclave_registry` |
| `credit_pool` | `CreditPool`, `LPToken`, `deposit`/`withdraw`, junior/senior tranche accounting | `sui::balance`, `usdc` |
| `credit_line` | `CreditLine`, `open_credit_line`/`borrow`/`repay`, rate math | `income`, `credit_pool` |
| `default` | `declare_default`, bad-debt write-off, blacklist | `credit_pool`, `credit_line` |

---

## 2. Move module sketches (real signatures from 01-RESEARCH §2/§8)

> The Nautilus dependency is added in `Move.toml` pointing at MystenLabs/nautilus `move/enclave`. The two interfaces we consume **verbatim** (do not re-declare them — we *import* them):
> ```move
> // enclave::enclave  (DO NOT redefine — import)
> public fun verify_signature<T, P: drop>(
>     enclave: &Enclave<T>, intent_scope: u8, timestamp_ms: u64, payload: P, signature: &vector<u8>,
> ): bool
> public struct IntentMessage<T: drop> has copy, drop { intent: u8, timestamp_ms: u64, payload: T }
> ```

### 2.1 `enclave_registry` — the one-time gate

```move
module conduit_credit::enclave_registry {
    use enclave::enclave::{Self, Enclave, EnclaveConfig, Cap};
    use sui::nitro_attestation::NitroAttestationDocument;

    /// One-time witness / phantom type that brands OUR enclave instance.
    /// Enclave<CONDUIT_ENCLAVE> is the shared object verify_signature checks against.
    public struct CONDUIT_ENCLAVE has drop {}

    /// Custom intent scope for ConduitCredit (weather example uses 0; we use 2).
    const INTENT_SCOPE_CREDIT: u8 = 2;
    public fun intent_scope(): u8 { INTENT_SCOPE_CREDIT }

    /// init: create EnclaveConfig<CONDUIT_ENCLAVE> + Cap<CONDUIT_ENCLAVE>.
    /// PCR0/1/2 are set post-deploy via the Cap (they must be NON-ZERO = production).
    fun init(otw: CONDUIT_ENCLAVE, ctx: &mut TxContext) {
        // enclave::create_enclave_config<CONDUIT_ENCLAVE>(otw, pcr0, pcr1, pcr2, name, ctx)
        // → shares EnclaveConfig, transfers Cap to deployer. (uses the nautilus helper)
        enclave::create_enclave_config(
            otw,
            b"conduit-credit-enclave",
            x"", x"", x"",          // pcr0/1/2 — overwritten by update_pcrs Cap call after image build
            ctx,
        );
    }

    /// ONE-TIME, EXPENSIVE: consume the Nitro attestation doc, verify PCRs against config,
    /// extract the Ed25519 pubkey, share a verified Enclave<CONDUIT_ENCLAVE>.
    /// Thin wrapper over enclave::register_enclave — exists so our package owns the entry.
    public entry fun register(
        config: &EnclaveConfig<CONDUIT_ENCLAVE>,
        doc: NitroAttestationDocument,
        ctx: &mut TxContext,
    ) {
        let enclave_obj = enclave::register_enclave<CONDUIT_ENCLAVE>(config, doc, ctx);
        transfer::public_share_object(enclave_obj); // shared so attest_income can &-borrow it
    }
}
```

### 2.2 `income` — the payload + the verification gate (M2/M3)

```move
module conduit_credit::income {
    use enclave::enclave::{Self, Enclave};
    use conduit_credit::enclave_registry::{CONDUIT_ENCLAVE, intent_scope};
    use sui::clock::Clock;

    const E_BAD_SIGNATURE: u64 = 1;
    const E_STALE: u64 = 2;
    const ATTESTATION_TTL_MS: u64 = 30 * 24 * 60 * 60 * 1000; // 30-day re-underwrite TTL
    const MAX_FETCH_AGE_MS: u64 = 10 * 60 * 1000;             // payload must be fresh (<10m)

    /// BCS LAYOUT IS LOAD-BEARING. Field ORDER + TYPES must mirror the Rust signer exactly.
    /// has copy,drop so it can be passed by value into verify_signature (P: drop).
    public struct CreditPayload has copy, drop {
        borrower: address,
        income_6mo_avg_usdc: u64,
        data_source: vector<u8>,   // b"plaid"
        fetch_ts_ms: u64,
    }

    /// Non-transferable: `key` only, no `store` → cannot be transferred/wrapped by users.
    public struct IncomeAttestation has key {
        id: UID,
        owner: address,
        income_6mo_avg_usdc: u64,
        attestation_ts: u64,
        expiry_ts: u64,
        enclave_id: ID,
    }

    public fun income(a: &IncomeAttestation): u64 { a.income_6mo_avg_usdc }
    public fun expiry(a: &IncomeAttestation): u64 { a.expiry_ts }
    public fun owner(a: &IncomeAttestation): address { a.owner }

    /// THE GATE. Rebuilds CreditPayload from positional args, calls the REAL Nautilus
    /// verify_signature over a BCS IntentMessage{intent:2, timestamp_ms, payload}.
    /// On true → mint non-transferable IncomeAttestation to borrower. On false → abort.
    public entry fun attest_income(
        enclave: &Enclave<CONDUIT_ENCLAVE>,
        borrower: address,
        income_6mo_avg_usdc: u64,
        data_source: vector<u8>,
        fetch_ts_ms: u64,
        timestamp_ms: u64,        // the IntentMessage.timestamp_ms the enclave signed
        signature: vector<u8>,    // Ed25519 sig over BCS(IntentMessage<CreditPayload>)
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // freshness: reject replayed/old enclave payloads
        assert!(sui::clock::timestamp_ms(clock) <= fetch_ts_ms + MAX_FETCH_AGE_MS, E_STALE);

        let payload = CreditPayload { borrower, income_6mo_avg_usdc, data_source, fetch_ts_ms };

        // ← the irreplaceable Sui-native work: cheap on-chain Ed25519 over BCS IntentMessage
        let ok = enclave::verify_signature<CONDUIT_ENCLAVE, CreditPayload>(
            enclave,
            intent_scope(),      // = 2
            timestamp_ms,
            payload,             // moved by value (copy,drop)
            &signature,
        );
        assert!(ok, E_BAD_SIGNATURE);

        let now = sui::clock::timestamp_ms(clock);
        let att = IncomeAttestation {
            id: object::new(ctx),
            owner: borrower,
            income_6mo_avg_usdc,
            attestation_ts: now,
            expiry_ts: now + ATTESTATION_TTL_MS,
            enclave_id: object::id(enclave),
        };
        transfer::transfer(att, borrower); // key-only → recipient cannot re-transfer
    }
}
```

### 2.3 `credit_pool` — standalone pool + tranched LP (M5/M6)

```move
module conduit_credit::credit_pool {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use usdc::usdc::USDC;

    const TRANCHE_SENIOR: u8 = 0;
    const TRANCHE_JUNIOR: u8 = 1;
    const JUNIOR_BPS: u64 = 1500; // 15% first-loss target

    public struct CreditPool has key {
        id: UID,
        liquidity: Balance<USDC>,
        total_borrowed: u64,
        senior_shares: u64,
        junior_shares: u64,
        junior_loss_reserve: u64,   // junior principal that absorbs default first
        accrued_interest: u64,      // distributed to LPs on withdraw
    }

    /// Fungible LP share. phantom T = tranche marker type (Senior / Junior).
    public struct Senior has drop {}
    public struct Junior has drop {}
    public struct LPToken<phantom T> has key, store {
        id: UID,
        shares: u64,
    }

    /// LP deposits USDC into a chosen tranche; mints LPToken<T> pro-rata.
    public entry fun deposit_senior(pool: &mut CreditPool, c: Coin<USDC>, ctx: &mut TxContext) {
        let amt = coin::value(&c);
        balance::join(&mut pool.liquidity, coin::into_balance(c));
        pool.senior_shares = pool.senior_shares + amt; // 1:1 share model for MVP clarity
        transfer::public_transfer(LPToken<Senior>{ id: object::new(ctx), shares: amt }, tx_context::sender(ctx));
    }
    public entry fun deposit_junior(pool: &mut CreditPool, c: Coin<USDC>, ctx: &mut TxContext) {
        let amt = coin::value(&c);
        balance::join(&mut pool.liquidity, coin::into_balance(c));
        pool.junior_shares = pool.junior_shares + amt;
        pool.junior_loss_reserve = pool.junior_loss_reserve + amt; // junior backs first-loss
        transfer::public_transfer(LPToken<Junior>{ id: object::new(ctx), shares: amt }, tx_context::sender(ctx));
    }

    public entry fun withdraw_senior(pool: &mut CreditPool, t: LPToken<Senior>, ctx: &mut TxContext) {
        let LPToken { id, shares } = t; object::delete(id);
        // utilization-gated: only available (non-borrowed) liquidity is withdrawable
        let out = balance::split(&mut pool.liquidity, shares);
        pool.senior_shares = pool.senior_shares - shares;
        transfer::public_transfer(coin::from_balance(out, ctx), tx_context::sender(ctx));
    }
    // withdraw_junior symmetric; reduces junior_shares + junior_loss_reserve.

    // === called only by sibling modules (friend) ===
    public(package) fun take_for_borrow(pool: &mut CreditPool, amt: u64, ctx: &mut TxContext): Coin<USDC> {
        pool.total_borrowed = pool.total_borrowed + amt;
        coin::from_balance(balance::split(&mut pool.liquidity, amt), ctx)
    }
    public(package) fun return_from_repay(pool: &mut CreditPool, principal: u64, interest: u64, c: Coin<USDC>) {
        pool.total_borrowed = pool.total_borrowed - principal;
        pool.accrued_interest = pool.accrued_interest + interest;
        balance::join(&mut pool.liquidity, coin::into_balance(c));
    }
    public(package) fun write_off(pool: &mut CreditPool, bad_debt: u64) {
        // junior absorbs FIRST
        let from_junior = if (bad_debt <= pool.junior_loss_reserve) bad_debt else pool.junior_loss_reserve;
        pool.junior_loss_reserve = pool.junior_loss_reserve - from_junior;
        pool.junior_shares = pool.junior_shares - from_junior;
        let remainder = bad_debt - from_junior; // only this hits senior
        if (remainder > 0) { pool.senior_shares = pool.senior_shares - remainder; };
        pool.total_borrowed = pool.total_borrowed - bad_debt;
    }
}
```

### 2.4 `credit_line` — open / borrow / repay with rate math (M4)

```move
module conduit_credit::credit_line {
    use conduit_credit::income::{Self, IncomeAttestation};
    use conduit_credit::credit_pool::{Self, CreditPool};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use usdc::usdc::USDC;

    const LTV_BPS: u64 = 3000;            // 30% of 6-mo avg income (band 25–40%)
    const BASE_IR_BPS: u64 = 800;         // 8%
    const RISK_PREMIUM_BPS: u64 = 300;    // 2–5% band; 3% default
    const MS_PER_YEAR: u64 = 365 * 24 * 60 * 60 * 1000;

    const E_EXPIRED_ATTESTATION: u64 = 10;
    const E_OVER_LIMIT: u64 = 11;
    const E_NOT_BORROWER: u64 = 12;

    public struct CreditLine has key {
        id: UID,
        borrower: address,
        credit_limit_usdc: u64,
        outstanding_usdc: u64,
        attestation_id: ID,
        ir_bps: u64,
        opened_ts: u64,
        last_accrual_ts: u64,
    }

    /// Consumes the attestation by REFERENCE (it stays non-transferable in the borrower's wallet).
    public entry fun open_credit_line(
        att: &IncomeAttestation, clock: &Clock, ctx: &mut TxContext,
    ) {
        let now = sui::clock::timestamp_ms(clock);
        assert!(now < income::expiry(att), E_EXPIRED_ATTESTATION);
        assert!(income::owner(att) == tx_context::sender(ctx), E_NOT_BORROWER);

        let limit = (income::income(att) * LTV_BPS) / 10000;
        let line = CreditLine {
            id: object::new(ctx),
            borrower: tx_context::sender(ctx),
            credit_limit_usdc: limit,
            outstanding_usdc: 0,
            attestation_id: object::id(att),
            ir_bps: BASE_IR_BPS + RISK_PREMIUM_BPS,
            opened_ts: now,
            last_accrual_ts: now,
        };
        transfer::transfer(line, tx_context::sender(ctx)); // key-only, owner-scoped
    }

    public entry fun borrow(
        pool: &mut CreditPool, line: &mut CreditLine, amount: u64, _clock: &Clock, ctx: &mut TxContext,
    ) {
        assert!(line.borrower == tx_context::sender(ctx), E_NOT_BORROWER);
        assert!(line.outstanding_usdc + amount <= line.credit_limit_usdc, E_OVER_LIMIT);
        line.outstanding_usdc = line.outstanding_usdc + amount;
        let c = credit_pool::take_for_borrow(pool, amount, ctx);
        transfer::public_transfer(c, tx_context::sender(ctx));
    }

    public entry fun repay(
        pool: &mut CreditPool, line: &mut CreditLine, mut payment: Coin<USDC>, clock: &Clock, ctx: &mut TxContext,
    ) {
        let now = sui::clock::timestamp_ms(clock);
        let elapsed = now - line.last_accrual_ts;
        let interest = (line.outstanding_usdc * line.ir_bps * elapsed) / (10000 * MS_PER_YEAR);
        let pay = coin::value(&payment);
        let principal_paid = if (pay > interest) pay - interest else 0;
        let principal_applied = if (principal_paid > line.outstanding_usdc) line.outstanding_usdc else principal_paid;
        line.outstanding_usdc = line.outstanding_usdc - principal_applied;
        line.last_accrual_ts = now;
        credit_pool::return_from_repay(pool, principal_applied, interest, payment);
    }
}
```

### 2.5 `default` — write-off + blacklist (M7)

```move
module conduit_credit::default {
    use conduit_credit::credit_pool::{Self, CreditPool};
    use conduit_credit::credit_line::CreditLine;
    use sui::table::{Self, Table};
    use sui::clock::Clock;
    use sui::event;

    const MAX_TERM_MS: u64 = 90 * 24 * 60 * 60 * 1000;
    const E_NOT_OVERDUE: u64 = 20;

    public struct Blacklist has key { id: UID, banned: Table<address, bool> }
    public struct DefaultEvent has copy, drop { borrower: address, bad_debt: u64, ts: u64 }

    /// Admin/keeper-callable. Writes off outstanding against junior reserve first, bans borrower.
    public entry fun declare_default(
        pool: &mut CreditPool, line: &CreditLine, bl: &mut Blacklist, clock: &Clock,
    ) {
        let now = sui::clock::timestamp_ms(clock);
        let (borrower, outstanding, opened) = credit_line_view(line);
        assert!(now > opened + MAX_TERM_MS, E_NOT_OVERDUE);
        credit_pool::write_off(pool, outstanding); // junior-first, then senior
        if (!table::contains(&bl.banned, borrower)) { table::add(&mut bl.banned, borrower, true); };
        event::emit(DefaultEvent { borrower, bad_debt: outstanding, ts: now });
    }
    // credit_line_view: public(package) getter exposed from credit_line module.
}
```

---

## 3. The exact PTB constructions (TypeScript, @mysten/sui)

> All PTBs use `@mysten/sui/transactions::Transaction`. `PKG` is the published `conduit_credit` package ID (testnet → mainnet toggle in §7). Shared objects (`Enclave`, `CreditPool`, `Blacklist`, `Clock@0x6`) go in by ID; owned objects (`CreditLine`, `IncomeAttestation`, USDC coins) by the wallet's object refs.

### 3.1 `attest_income` — the underwriting gate (the make-or-break PTB)

```ts
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";

// `att` is the enclave HTTP response: { data: CreditPayload, signature: number[] (Ed25519, 64B) }
// NOTE: the enclave JSON wraps the payload under "data"; the Move struct field is "payload".
// BCS is positional → only field ORDER/TYPES matter, which match CreditPayload exactly.
async function attestIncome(att: EnclaveResponse) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::income::attest_income`,
    arguments: [
      tx.object(ENCLAVE_ID),                                   // &Enclave<CONDUIT_ENCLAVE> (shared)
      tx.pure.address(att.data.borrower),
      tx.pure.u64(att.data.income_6mo_avg_usdc),
      tx.pure(bcs.vector(bcs.u8()).serialize([...Buffer.from("plaid")])), // data_source
      tx.pure.u64(att.data.fetch_ts_ms),
      tx.pure.u64(att.timestamp_ms),                           // IntentMessage.timestamp_ms signed
      tx.pure(bcs.vector(bcs.u8()).serialize(att.signature)),  // Ed25519 signature bytes
      tx.object("0x6"),                                        // Clock
    ],
  });
  return tx; // → signAndExecute via dapp-kit; on success an IncomeAttestation lands in the wallet
}
```

**Day-1 canary (proves Rust↔Move BCS alignment before any credit logic):** call `enclave::verify_signature` with the weather vector and assert `true`:
```ts
// payload bytes x"...San Francisco..."; whole IntentMessage BCS = canonical vector
// x"0020b1d110960100000d53616e204672616e636973636f0d00000000000000"
// intent_scope=0, ts=1744038900000, location="San Francisco", temp=13 → MUST verify true.
```

### 3.2 The full happy-path PTB chain (attest → open → borrow)

These are three sequential signed PTBs (each produces an owned object the next consumes), shown as one orchestration:

```ts
// (1) ATTEST — mints IncomeAttestation (PTB in §3.1). Wait for the attestation objectId.
const attId = await getCreatedObjectId(attestResult, `${PKG}::income::IncomeAttestation`);

// (2) OPEN CREDIT LINE — consumes attestation by reference, mints CreditLine.
const txOpen = new Transaction();
txOpen.moveCall({
  target: `${PKG}::credit_line::open_credit_line`,
  arguments: [ txOpen.object(attId), txOpen.object("0x6") ], // &IncomeAttestation, Clock
});
const lineId = await getCreatedObjectId(openResult, `${PKG}::credit_line::CreditLine`);

// (3) BORROW — atomic: draw USDC from pool, transfer to borrower.
const txBorrow = new Transaction();
txBorrow.moveCall({
  target: `${PKG}::credit_line::borrow`,
  arguments: [
    txBorrow.object(POOL_ID),       // &mut CreditPool (shared)
    txBorrow.object(lineId),        // &mut CreditLine (owned)
    txBorrow.pure.u64(1_000_000_000), // 1000 USDC (6dp → 1e9? use USDC's 6dp: 1000*1e6)
    txBorrow.object("0x6"),
  ],
});
```

### 3.3 `repay` PTB (coin handling)

```ts
const txRepay = new Transaction();
// split the exact repayment off the borrower's gas/USDC coin
const [payCoin] = txRepay.splitCoins(txRepay.object(borrowerUsdcCoinId), [txRepay.pure.u64(repayAmount)]);
txRepay.moveCall({
  target: `${PKG}::credit_line::repay`,
  arguments: [ txRepay.object(POOL_ID), txRepay.object(lineId), payCoin, txRepay.object("0x6") ],
});
```

### 3.4 LP deposit / withdraw PTB

```ts
const txDep = new Transaction();
const [depCoin] = txDep.splitCoins(txDep.object(lpUsdcCoinId), [txDep.pure.u64(amount)]);
txDep.moveCall({
  target: `${PKG}::credit_pool::deposit_junior`, // or deposit_senior
  arguments: [ txDep.object(POOL_ID), depCoin ],
});
// withdraw: tx.object(LPTokenId) → withdraw_junior / withdraw_senior, returns USDC + yield.
```

### 3.5 `register_enclave` PTB (one-time, deploy step)

```ts
// Run ONCE after the enclave is live and PCRs are set on EnclaveConfig.
// `attestationDocBytes` = the CBOR Nitro attestation document fetched from the enclave.
const txReg = new Transaction();
const doc = txReg.moveCall({
  target: `0x...nitro::load_nitro_attestation`, // sui::nitro_attestation native
  arguments: [ txReg.pure(bcs.vector(bcs.u8()).serialize(attestationDocBytes)), txReg.object("0x6") ],
});
txReg.moveCall({
  target: `${PKG}::enclave_registry::register`,
  arguments: [ txReg.object(ENCLAVE_CONFIG_ID), doc ],
});
// → shares an Enclave<CONDUIT_ENCLAVE>; record its objectId as ENCLAVE_ID for all attest PTBs.
```

> **No hot-potato in the borrow path** — ConduitCredit owns its pool, so `borrow` mutates a shared `CreditPool` and transfers a `Coin<USDC>`; there is no third-party flash-loan receipt to consume. The closest thing to a hot-potato discipline here is the **`IntentMessage`/attestation gate**: the signed payload is the unforgeable "ticket" that `attest_income` consumes to mint the attestation. (We deliberately do **not** route borrow through Suilend/Scallop — their borrow needs a sender-owned `ObligationOwnerCap`, which is exactly why the pool is standalone; see §6.)

---

## 4. Keeper / backend / enclave spec

### 4.1 Enclave (`nautilus-server`, Rust/axum, deployed via Marlin Oyster CVM)

**Decided Day-1: Marlin Oyster managed enclave** (lower ops; PCR0/1/2 **+ PCR16** from docker-compose; shared on-chain registry). Testnet `REGISTRY_PACKAGE_ID 0x05cd5a306375c49727fc2f1e667df8bcc1f5b52ad07e850074d330afda932761`, `REGISTRY_ID 0x7ebc3f9bc7a0cf0820d241ad767036483b885bbd62636fb9446bb0d99d2ed091`; mainnet `PACKAGE 0x8df76b79118ffad2bacb55705c84474802ddb3d62199b98db720c5088e161ab8`.

**The Rust signer (BCS layout MUST mirror the Move `CreditPayload` field-for-field, in order):**
```rust
#[derive(Serialize, Deserialize, Clone)]   // serde → BCS via bcs crate
struct CreditPayload {
    borrower: SuiAddress,        // 32 bytes, == Move address
    income_6mo_avg_usdc: u64,    // LE u64
    data_source: Vec<u8>,        // ULEB128 len + bytes  (b"plaid")
    fetch_ts_ms: u64,
}
// IntentMessage reuses the nautilus-server template type:
//   IntentMessage<T> { intent: u8, timestamp_ms: u64, payload: T }
// sign_payload(): bcs::to_bytes(&IntentMessage{ intent: 2, timestamp_ms, payload }) → ed25519 sign.
const INTENT_SCOPE_CREDIT: u8 = 2;   // distinct from weather example's 0
```

**Endpoint:** `POST /attest_income { access_token, borrower_addr }` →
1. Fetch Plaid `/identity/get` + `/income/verification/paystubs` (Plaid client_id/secret from **AWS Secrets Manager at runtime** — never baked into the image, or they'd land in the PCRs).
2. Compute `income_6mo_avg_usdc` (sum last-6-mo net deposits / 6; floor).
3. Build `IntentMessage<CreditPayload>{ intent:2, timestamp_ms:now, payload }`, BCS-serialize, Ed25519-sign with the enclave key.
4. Return `{ data: CreditPayload, timestamp_ms, signature: [u8;64] }`. **Raw statements never leave the enclave.**

**`allowed_endpoints.yaml` — FROZEN Day-1** (any change churns PCRs → forced re-registration):
```yaml
endpoints:
  - "production.plaid.com/identity/get"
  - "production.plaid.com/income/verification/paystubs"
  - "sandbox.plaid.com/identity/get"
  - "sandbox.plaid.com/income/verification/paystubs"
```

**Paired serde test (mandatory — the #1 silent-failure guard, M9):** a Rust `test_serde` produces BCS for a fixed `CreditPayload` and the weather `IntentMessage`; a Move `#[test]` calls `verify_signature` over the identical bytes and asserts `true`. The canonical weather vector `x"0020b1d1109601...0d00000000000000"` must verify `true` on both sides Day-1.

### 4.2 Attester backend (Next.js API route, thin, untrusted)
- `/api/plaid/exchange` — swaps Plaid `public_token` → `access_token` (server-side, holds no income logic).
- `/api/attest` — forwards `{ access_token, borrower_addr }` to the enclave; relays the signed response to the browser. **Sees no raw statements; cannot forge a signature** (it lacks the enclave key).

### 4.3 Keeper (off-chain cron, optional; Stretch for idle-yield)
- **Default sweep:** every N min, scan `CreditLine`s past `MAX_TERM_MS`; submit `declare_default` PTB.
- **Idle-yield sweep (Stretch):** when pool `utilization < 80%`, route surplus USDC → Suilend `deposit_liquidity_and_mint_ctokens()` (supply-side only — composes because deposit needs no sender-owned obligation cap); harvest back when a `borrow` needs liquidity.

---

## 5. The 5-minute demo script (exact click-path + what the judge sees)

| Time | Click-path | What the judge sees |
|---|---|---|
| **0:00–0:45** | Slide: "Maria — $4,200/mo gig income, $0 idle crypto." | The borrower + the wall: *every Sui money market needs 130–200% collateral; they serve capital, not income.* One-sentence thesis on screen. |
| **0:45–1:30** | Slide: why Sui. | *"EVM can't verify a Nitro attestation in-contract — it needs an oracle that re-introduces trust. Sui ships the AWS Nitro root CA in the framework (`sui::nitro_attestation`); the per-request check is a cheap Ed25519 `verify_signature`."* The moat, stated in 45s. |
| **1:30–3:00** | dApp: **Connect wallet → Plaid Link (Sandbox OAuth) → "Submit income proof."** Network panel shows the enclave call. Then sign the **`attest_income`** PTB. | The enclave **genuinely calls Plaid**, signs, returns. On-chain `verify_signature()` returns **true** → a non-transferable `IncomeAttestation` (income=$4,200) appears in the wallet. *Raw bank data never touched the chain.* Then flip ONE byte of the signature and re-submit → **transaction aborts (E_BAD_SIGNATURE)**. Accept-good / reject-bad = the whole technical thesis, live. |
| **3:00–3:50** | dApp: **"Open credit line"** → **"Borrow $1,000."** | `open_credit_line` mints `CreditLine` with limit $4,200 × 30% = **$1,260**. `borrow($1,000)` → 1000 USDC lands in Maria's wallet (show balance change). `repay()` → line restored; interest accrues to LPs. |
| **3:50–4:30** | dApp lender view: **deposit Junior**, then **deposit Senior**; show tranche bars. | 15% junior first-loss buffer sitting beneath the protected 85% senior. (If stretch shipped: idle USDC → Suilend supply, base yield ticking.) |
| **4:30–5:00** | Show the README: testnet **package ID + Enclave/Pool/Config object IDs**; PCR0/1/2 non-zero. State mainnet path. | Credible deployment + the second-50%-of-prize mainnet path (production Plaid). Oracle fallback mentioned as resilience, not pivot. |

**Demo-day failover (legitimate):** pre-cache valid enclave-signed attestations — `verify_signature` returns `true` regardless of whether the call was live or cached, so a Plaid/RPC hiccup never breaks the live-verify moment.

---

## 6. Competitive kill-shots (vs named competitors)

| Competitor | Their position | ConduitCredit kill-shot |
|---|---|---|
| **Suilend / NAVI / Scallop** (live Sui money markets) | 130–200% over-collateralized; serve people who already hold capital. Borrow needs a sender-owned `ObligationOwnerCap`/`ObligationKey`. | They are *structurally incapable* of income-based credit — no income read, no under-collateralized path, no third-party borrow. ConduitCredit underwrites the *income stream*, not the balance sheet. We compose with them only on the **supply side** (idle yield), which is real and verified. |
| **3Jane** (EVM mainnet, Nov 2025) | USDC credit lines vs a "Jane Score" + verified assets; USD3/sUSD3 tranches; idle USDC in Aave. | Proves the model works at scale — but it's a *reputation score* off-chain underwriting + EVM. ConduitCredit verifies *income inside a TEE the chain natively checks*, with the credit instrument as a first-class Move object. We are the Sui-native, privacy-preserving, TEE-underwritten version of a validated model. |
| **Huma Finance** ($16M Morpho vault, Jun 16 2026) | PayFi receivables credit; institutional, off-chain underwriting committee, EVM. | Dated proof lender demand is activating *now* — but it's committee-underwritten and institutional. ConduitCredit is individual-level and trust-minimized: no committee, the enclave + chain are the underwriter. |
| **Shell Finance** (Nautilus on Sui) | Uses Nautilus — for **dark-pool order matching**. | Orthogonal. "TEE as a credit oracle" ≠ "TEE as a matching engine." We are the *only* Sui-native Nautilus income-credit protocol — the niche is uncontested. |
| **"FlowPay"** (generic earned-wage access, the benched challenger) | Same RWA lane, no TEE. | Lacks the Nautilus moat that wins the 20% Technical score. We do **not** pivot to it; our fallback is *oracle-attested income with identical contracts*, which preserves the verified-income story. |

---

## 7. Credible mainnet path (unlocks the 2nd 50% of the prize)

**What is already mainnet-ready as-is:** every Move module (`enclave_registry`, `income`, `credit_pool`, `credit_line`, `default`), the `verify_signature` gate, the BCS contract, and the Marlin Oyster registration flow. Marlin Oyster has a live mainnet registry (`PACKAGE 0x8df76b79118ffad2bacb55705c84474802ddb3d62199b98db720c5088e161ab8`).

**The only two mainnet gates:**
1. **Plaid Sandbox → Production** — swap the API host + production keys (already whitelisted in `allowed_endpoints.yaml`, so no PCR churn). This is the single real-data dependency.
2. **Marlin Oyster testnet → mainnet registry** — re-register the same enclave image against the mainnet `PACKAGE`.

**Testnet → mainnet package-ID toggle (single source of truth):**
```ts
// config/network.ts
export const NETWORK = process.env.NEXT_PUBLIC_NETWORK as "testnet" | "mainnet";
export const IDS = {
  testnet: {
    PKG: "0x<conduit_pkg_testnet>",
    ENCLAVE_ID: "0x<enclave_obj_testnet>",
    ENCLAVE_CONFIG_ID: "0x<config_testnet>",
    POOL_ID: "0x<pool_testnet>",
    USDC_TYPE: "0x<usdc_testnet>::usdc::USDC",
    OYSTER_REGISTRY: "0x7ebc3f9bc7a0cf0820d241ad767036483b885bbd62636fb9446bb0d99d2ed091",
    OYSTER_REGISTRY_PKG: "0x05cd5a306375c49727fc2f1e667df8bcc1f5b52ad07e850074d330afda932761",
    PLAID_HOST: "https://sandbox.plaid.com",
  },
  mainnet: {
    PKG: "0x<conduit_pkg_mainnet>",
    ENCLAVE_ID: "0x<enclave_obj_mainnet>",
    ENCLAVE_CONFIG_ID: "0x<config_mainnet>",
    POOL_ID: "0x<pool_mainnet>",
    USDC_TYPE: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC", // native USDC mainnet
    OYSTER_REGISTRY_PKG: "0x8df76b79118ffad2bacb55705c84474802ddb3d62199b98db720c5088e161ab8",
    PLAID_HOST: "https://production.plaid.com",
  },
}[NETWORK];
```
README publishes the testnet package ID + `ENCLAVE_ID`/`POOL_ID`/`ENCLAVE_CONFIG_ID` and states: "Mainnet requires only Plaid-production keys + mainnet Oyster re-registration; all contracts deploy unchanged." That sentence is what makes the second 50% credible to the judges.

---

## 8. Day-1 de-risk checklist (do in order; each has a pass/fail assertion)

1. **[BLOCKING] Pick the enclave path = Marlin Oyster.** Commit Day-1; PCR16 + shared-registry call path differ from self-managed, switching later is rework. ✅ when `oyster-cvm` deploys the weather example.
2. **Stand up the Nautilus weather example on Oyster testnet; run `register_enclave`.** ✅ when a shared `Enclave<T>` exists with the enclave's Ed25519 pubkey stored.
3. **Assert the canonical gate.** Call `enclave::verify_signature` with `x"0020b1d110960100000d53616e204672616e636973636f0d00000000000000"` → **must return `true`**. ❌ → STOP and fix BCS before anything else.
4. **Confirm PCR0/1/2 are non-zero** (debug enclaves emit all-zero). ✅ e.g. `PCR0=911c87d0...`.
5. **Freeze `allowed_endpoints.yaml`** (the 4 Plaid endpoints, sandbox+production) + the docker image. Any later edit churns PCRs/PCR16 → forced re-registration.
6. **Plaid keys → AWS Secrets Manager**, fetched at runtime *inside* the enclave. Never in the binary/image.
7. **Define `CreditPayload` (Move) ⇄ `CreditPayload` (Rust) with identical field order/types; intent scope = 2; field named `payload`.** Write the paired Rust `test_serde` + Move `#[test]`. ✅ when both serialize byte-identical BCS and the Move side verifies `true`.
8. **Build the minimal `attest_income` stub** against a hardcoded `Enclave`: feed a real enclave-signed `CreditPayload` → mints `IncomeAttestation`; flip one signature byte → **aborts `E_BAD_SIGNATURE`**. ✅ accept-good/reject-bad is the technical thesis in miniature.
9. **Initialize the public GitHub repo with a small, hand-authored commit #1.** Commit continuously through June 21. ❌ squashed/single-commit repo = disqualified.
10. **Confirm team ≥ 2 on DeepSurge; start KYC for ≥ 1 member; create the submission shell** (editable through June 21).

**Day-1 done =** the canonical weather vector verifies `true` on testnet **and** the stub `attest_income` accepts a good signature / rejects a bad one. If both hold, the rest is conventional Move + a Next.js dApp.
