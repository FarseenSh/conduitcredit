/// ConduitCredit — enclave verification gate (Day-1 canary).
///
/// This module proves the make-or-break predicate the whole protocol rests on:
/// an on-chain check ACCEPTS a good enclave signature and REJECTS a bad one.
///
/// Nautilus's `enclave::enclave::verify_signature<T, P>` is, internally, an Ed25519
/// verification over the BCS serialization of `IntentMessage<P>`. Before our own
/// enclave is registered (post-gate, via Marlin Oyster), we prove that exact
/// primitive here with a keypair we control:
///
///     ed25519_verify(sig, pk, BCS(IntentMessage{ intent, timestamp_ms, payload }))
///
/// `assert_verify` succeeds on a good signature and aborts on a bad/tampered one.
///
/// BCS layout is load-bearing: `IntentMessage` / `CreditPayload` mirror the Rust
/// signer field-for-field. `tests/gate_tests.move` cross-checks our serialization
/// against nautilus's canonical weather vector byte-for-byte.
module conduit_credit::enclave_registry;

use std::bcs;
use sui::ed25519;

/// Brand (one-time-witness style) for OUR enclave instance. Post-gate, the
/// registered nautilus object is `Enclave<CONDUIT_ENCLAVE>`.
public struct CONDUIT_ENCLAVE has drop {}

/// Custom intent scope for ConduitCredit (the weather example uses 0; we use 2).
const INTENT_SCOPE_CREDIT: u8 = 2;

/// Mirror of nautilus `enclave::IntentMessage<T>`. BCS is positional — field
/// names are irrelevant to the wire format; the ORDER and TYPES must match.
public struct IntentMessage<T: drop> has copy, drop {
    intent: u8,
    timestamp_ms: u64,
    payload: T,
}

/// The income attestation payload the enclave signs. BCS must mirror the Rust
/// signer exactly: address(32B) ++ u64(LE) ++ vector<u8>(ULEB128 len ++ bytes) ++ u64(LE).
public struct CreditPayload has copy, drop {
    borrower: address,
    income_6mo_avg_usdc: u64,
    data_source: vector<u8>,
    fetch_ts_ms: u64,
}

const E_PK_LEN: u64 = 1;
const E_SIG_LEN: u64 = 2;
const E_BAD_SIGNATURE: u64 = 3;

public fun intent_scope(): u8 { INTENT_SCOPE_CREDIT }

/// Rebuild the exact bytes the enclave signs: BCS(IntentMessage{intent, ts, payload}).
public fun credit_intent_bytes(
    intent: u8,
    timestamp_ms: u64,
    borrower: address,
    income_6mo_avg_usdc: u64,
    data_source: vector<u8>,
    fetch_ts_ms: u64,
): vector<u8> {
    let payload = CreditPayload { borrower, income_6mo_avg_usdc, data_source, fetch_ts_ms };
    let msg = IntentMessage { intent, timestamp_ms, payload };
    bcs::to_bytes(&msg)
}

/// THE GATE, in miniature. Rebuilds the signed message and verifies the Ed25519
/// signature against `pk`. Succeeds (returns) on a good signature; aborts
/// `E_BAD_SIGNATURE` on a bad/tampered one. This is the same Ed25519-over-BCS-
/// IntentMessage check nautilus `verify_signature` performs once our enclave
/// is registered — proven here against a keypair we control (gas-only, no enclave).
public fun assert_verify(
    pk: vector<u8>,
    intent: u8,
    timestamp_ms: u64,
    borrower: address,
    income_6mo_avg_usdc: u64,
    data_source: vector<u8>,
    fetch_ts_ms: u64,
    signature: vector<u8>,
) {
    assert!(pk.length() == 32, E_PK_LEN);
    assert!(signature.length() == 64, E_SIG_LEN);
    let msg = credit_intent_bytes(
        intent, timestamp_ms, borrower, income_6mo_avg_usdc, data_source, fetch_ts_ms,
    );
    assert!(ed25519::ed25519_verify(&signature, &pk, &msg), E_BAD_SIGNATURE);
}
