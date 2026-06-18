/// ConduitCredit — income attestation minting (the gated underwriting entry).
///
/// `attest_income` calls the real `enclave_registry::verify_credit` over a BCS
/// `IntentMessage<CreditPayload>`; on a good signature it mints a NON-TRANSFERABLE
/// `IncomeAttestation` (key only, no store) to the borrower. The raw bank/payroll
/// statements never touch the chain — only the enclave-signed 6-month average does.
module conduit_credit::income;

use conduit_credit::enclave_registry::{Self, Enclave};
use sui::clock::Clock;

const ATTESTATION_TTL_MS: u64 = 30 * 24 * 60 * 60 * 1000; // 30-day re-underwrite TTL
const MAX_FETCH_AGE_MS: u64 = 10 * 60 * 1000;             // payload must be fresh (<10m)

const E_BAD_SIGNATURE: u64 = 1;
const E_STALE: u64 = 2;

/// Non-transferable: `key` only (no `store`) → the borrower cannot move or wrap it.
public struct IncomeAttestation has key {
    id: UID,
    owner: address,
    income_6mo_avg_usdc: u64,
    data_source: vector<u8>,
    attestation_ts: u64,
    expiry_ts: u64,
    enclave_id: ID,
}

public fun income(a: &IncomeAttestation): u64 { a.income_6mo_avg_usdc }
public fun owner(a: &IncomeAttestation): address { a.owner }
public fun expiry(a: &IncomeAttestation): u64 { a.expiry_ts }
public fun data_source(a: &IncomeAttestation): vector<u8> { a.data_source }
public fun enclave_id(a: &IncomeAttestation): ID { a.enclave_id }

/// THE UNDERWRITING GATE. Verifies the enclave signature over the CreditPayload and,
/// on success, mints a 30-day non-transferable attestation to the borrower. A bad
/// signature aborts `E_BAD_SIGNATURE`; a stale fetch aborts `E_STALE`.
public entry fun attest_income(
    enclave: &Enclave,
    borrower: address,
    income_6mo_avg_usdc: u64,
    data_source: vector<u8>,
    fetch_ts_ms: u64,
    timestamp_ms: u64,      // the IntentMessage.timestamp_ms the enclave signed
    signature: vector<u8>,  // Ed25519 over BCS(IntentMessage<CreditPayload>)
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now = clock.timestamp_ms();
    assert!(now <= fetch_ts_ms + MAX_FETCH_AGE_MS, E_STALE);

    let ok = enclave_registry::verify_credit(
        enclave, timestamp_ms, borrower, income_6mo_avg_usdc, data_source, fetch_ts_ms, &signature,
    );
    assert!(ok, E_BAD_SIGNATURE);

    let att = IncomeAttestation {
        id: object::new(ctx),
        owner: borrower,
        income_6mo_avg_usdc,
        data_source,
        attestation_ts: now,
        expiry_ts: now + ATTESTATION_TTL_MS,
        enclave_id: object::id(enclave),
    };
    transfer::transfer(att, borrower); // key-only → recipient cannot re-transfer
}
