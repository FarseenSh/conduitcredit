#[test_only]
#[allow(implicit_const_copy)]
/// THE DAY-1 GATE (local, gas-free). Proves the make-or-break predicate:
///   - our BCS layout matches nautilus's canonical weather vector byte-for-byte,
///   - our Move serialization matches the offline Rust/JS signer exactly,
///   - a good Ed25519 signature is ACCEPTED and a tampered one is REJECTED.
/// Fixture values come from `scripts/sign.mjs` (a deterministic throwaway key).
module conduit_credit::gate_tests;

use std::bcs;
use sui::ed25519;
use conduit_credit::enclave_registry;

// --- Fixture (scripts/sign.mjs → scripts/fixture.json) ---
const PK: vector<u8> = x"755c4cb9256ca7cdc4acfdc6cfeeda849017e5b9f9514e99191bd67e0b0d4276";
const GOOD_SIG: vector<u8> = x"c91dae2e44265c3e4ebe915960dc6e2a62456abfc5d49711ef4a922b0da97e88f530d6a54a2b4591a8b06fa12711e4d12721dae94ee7bd248977ec0d9c82b703";
const TAMPERED_SIG: vector<u8> = x"c81dae2e44265c3e4ebe915960dc6e2a62456abfc5d49711ef4a922b0da97e88f530d6a54a2b4591a8b06fa12711e4d12721dae94ee7bd248977ec0d9c82b703";
const EXPECTED_MSG: vector<u8> = x"0220b1d11096010000000000000000000000000000000000000000000000000000000000000000cafe00ea56fa0000000005706c61696420b1d11096010000";
const CANONICAL_WEATHER: vector<u8> = x"0020b1d110960100000d53616e204672616e636973636f0d00000000000000";

const INTENT: u8 = 2;
const TS: u64 = 1744038900000;
const BORROWER: address = @0xcafe;
const INCOME: u64 = 4200000000;
const FETCH_TS: u64 = 1744038900000;

// Local mirror of nautilus's weather IntentMessage — cross-checks that Move's
// BCS of {u8, u64, {String, u64}} equals the upstream canonical vector exactly.
public struct WeatherResponse has copy, drop { location: vector<u8>, temperature: u64 }
public struct IntentMessageW has copy, drop { intent: u8, timestamp_ms: u64, payload: WeatherResponse }

#[test]
fun bcs_matches_canonical_weather_vector() {
    let wm = IntentMessageW {
        intent: 0,
        timestamp_ms: 1744038900000,
        payload: WeatherResponse { location: b"San Francisco", temperature: 13 },
    };
    assert!(bcs::to_bytes(&wm) == CANONICAL_WEATHER, 100);
}

#[test]
fun credit_bcs_matches_offline_signer() {
    let got = enclave_registry::credit_intent_bytes(INTENT, TS, BORROWER, INCOME, b"plaid", FETCH_TS);
    assert!(got == EXPECTED_MSG, 101);
}

#[test]
fun accepts_good_signature() {
    let msg = enclave_registry::credit_intent_bytes(INTENT, TS, BORROWER, INCOME, b"plaid", FETCH_TS);
    assert!(ed25519::ed25519_verify(&GOOD_SIG, &PK, &msg), 102);
}

#[test]
fun rejects_tampered_signature() {
    let msg = enclave_registry::credit_intent_bytes(INTENT, TS, BORROWER, INCOME, b"plaid", FETCH_TS);
    assert!(!ed25519::ed25519_verify(&TAMPERED_SIG, &PK, &msg), 103);
}

#[test]
fun assert_verify_accepts_good() {
    // The real gate entry must NOT abort on a good signature.
    enclave_registry::assert_verify(PK, INTENT, TS, BORROWER, INCOME, b"plaid", FETCH_TS, GOOD_SIG);
}

#[test]
#[expected_failure(abort_code = enclave_registry::E_BAD_SIGNATURE)]
fun assert_verify_rejects_tampered() {
    // The real gate entry must abort on a tampered signature.
    enclave_registry::assert_verify(PK, INTENT, TS, BORROWER, INCOME, b"plaid", FETCH_TS, TAMPERED_SIG);
}
