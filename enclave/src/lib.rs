//! ConduitCredit Nautilus enclave — the production income-attestation signer.
//!
//! This is the off-chain half of the TEE underwriting loop. In production it runs INSIDE
//! an AWS Nitro enclave (Marlin Oyster): it reads payroll/bank data via Plaid (keys from
//! AWS Secrets Manager), computes the 6-month average, and Ed25519-signs an
//! `IntentMessage<CreditPayload>{ intent: 2, timestamp_ms, payload }`. The Sui chain
//! verifies that signature via `enclave_registry::verify_signature`; the raw statements
//! never leave the enclave.
//!
//! BCS layout is LOAD-BEARING and mirrors the Move structs field-for-field. The tests prove
//! byte-identical parity with (a) nautilus's canonical weather vector and (b) the JS signer
//! (`scripts/sign.mjs`) — same bytes AND the same Ed25519 signature across all three.

use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};

/// Custom intent scope for ConduitCredit (the weather example uses 0; we use 2).
pub const INTENT_SCOPE_CREDIT: u8 = 2;

/// Mirror of Move `enclave_registry::IntentMessage<T>` — positional BCS.
#[derive(Serialize)]
pub struct IntentMessage<T> {
    pub intent: u8,
    pub timestamp_ms: u64,
    pub payload: T,
}

/// Mirror of Move `CreditPayload`.
///
/// `borrower` is a fixed `[u8; 32]` → a Sui address serializes as 32 RAW BCS bytes with NO
/// length prefix (do NOT use `Vec<u8>` here, which would add a ULEB128 prefix and silently
/// break verification). `data_source` is `Vec<u8>` → ULEB128 length prefix + bytes.
#[derive(Serialize, Deserialize, Clone)]
pub struct CreditPayload {
    pub borrower: [u8; 32],
    pub income_6mo_avg_usdc: u64,
    pub data_source: Vec<u8>,
    pub fetch_ts_ms: u64,
}

/// Deterministic demo enclave key. In production the key is generated INSIDE the Nitro
/// enclave and never leaves it; only its public key is registered on chain. This demo key's
/// public key equals the operator key registered on testnet (`enclaveSignerPk`).
pub fn enclave_signing_key() -> SigningKey {
    let seed: [u8; 32] = std::array::from_fn(|i| ((i * 7 + 3) & 0xff) as u8);
    SigningKey::from_bytes(&seed)
}

pub struct SignedAttestation {
    pub bcs_message: Vec<u8>,
    pub signature: [u8; 64],
    pub public_key: [u8; 32],
}

/// Compute the attested 6-month average income from the per-month net deposits the enclave
/// read (the last 6 monthly payroll/bank inflows from Plaid). This is the underwriting
/// computation that happens INSIDE the TEE — the enclave signs the *result*, never the raw
/// monthly statements. Base units (6-dp USDC), rounded half-up; empty input → 0.
pub fn average_6mo_income(monthly_net_usdc: &[u64]) -> u64 {
    if monthly_net_usdc.is_empty() {
        return 0;
    }
    let sum: u128 = monthly_net_usdc.iter().map(|&m| m as u128).sum();
    let n = monthly_net_usdc.len() as u128;
    ((sum + n / 2) / n) as u64 // round half-up
}

/// Sign `IntentMessage<CreditPayload>{ intent: 2, timestamp_ms, payload }` with the enclave key.
pub fn sign_credit_attestation(payload: CreditPayload, timestamp_ms: u64) -> SignedAttestation {
    let msg = IntentMessage { intent: INTENT_SCOPE_CREDIT, timestamp_ms, payload };
    let bytes = bcs::to_bytes(&msg).expect("bcs serialize");
    let sk = enclave_signing_key();
    let sig = sk.sign(&bytes);
    SignedAttestation {
        bcs_message: bytes,
        signature: sig.to_bytes(),
        public_key: sk.verifying_key().to_bytes(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Serialize)]
    struct WeatherResponse {
        location: String,
        temperature: u64,
    }

    /// Canonical nautilus weather vector — proves our BCS of {u8, u64, {String, u64}}
    /// matches upstream nautilus AND the Move side byte-for-byte.
    #[test]
    fn weather_vector_matches_canonical() {
        let m = IntentMessage {
            intent: 0u8,
            timestamp_ms: 1_744_038_900_000,
            payload: WeatherResponse { location: "San Francisco".into(), temperature: 13 },
        };
        assert_eq!(
            hex::encode(bcs::to_bytes(&m).unwrap()),
            "0020b1d110960100000d53616e204672616e636973636f0d00000000000000"
        );
    }

    /// The CreditPayload BCS message, the public key, AND the Ed25519 signature must all be
    /// byte-identical to the JS signer (scripts/sign.mjs / fixture.json). RFC 8032 Ed25519 is
    /// deterministic, so the signatures match across Rust and JS — and the message verifies
    /// on chain against the registered enclave key.
    #[test]
    fn credit_payload_matches_js_signer_and_move() {
        let mut borrower = [0u8; 32];
        borrower[30] = 0xca;
        borrower[31] = 0xfe; // 0x…cafe
        let payload = CreditPayload {
            borrower,
            income_6mo_avg_usdc: 4_200_000000,
            data_source: b"plaid".to_vec(),
            fetch_ts_ms: 1_744_038_900_000,
        };
        let signed = sign_credit_attestation(payload, 1_744_038_900_000);
        assert_eq!(
            hex::encode(&signed.bcs_message),
            "0220b1d11096010000000000000000000000000000000000000000000000000000000000000000cafe00ea56fa0000000005706c61696420b1d11096010000"
        );
        assert_eq!(
            hex::encode(signed.public_key),
            "755c4cb9256ca7cdc4acfdc6cfeeda849017e5b9f9514e99191bd67e0b0d4276"
        );
        assert_eq!(
            hex::encode(signed.signature),
            "c91dae2e44265c3e4ebe915960dc6e2a62456abfc5d49711ef4a922b0da97e88f530d6a54a2b4591a8b06fa12711e4d12721dae94ee7bd248977ec0d9c82b703"
        );
    }

    /// The enclave's own income computation (the work done inside the TEE before signing).
    #[test]
    fn averages_six_months_of_income() {
        let months = [
            4_000_000000u64, 4_500_000000, 3_800_000000,
            4_200_000000, 4_600_000000, 4_100_000000,
        ];
        assert_eq!(average_6mo_income(&months), 4_200_000000); // mean is exact → matches the fixture
        assert_eq!(average_6mo_income(&[1, 2]), 2);            // 1.5 rounds half-up
        assert_eq!(average_6mo_income(&[]), 0);                // no data → 0
    }
}
