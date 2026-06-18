/// ConduitCredit — enclave registry + the per-request verification gate.
///
/// The whole technical thesis: an on-chain check ACCEPTS a good enclave signature
/// and REJECTS a bad one. `verify_signature` is a cheap Ed25519 check over the BCS
/// serialization of `IntentMessage<P>` — the exact construction nautilus uses.
///
/// Trust is two-phase:
///   - register ONCE (expensive): either a real AWS Nitro attestation verified on
///     chain via the native `sui::nitro_attestation` module (root CA embedded in the
///     Sui framework — no oracle), or, as the documented fallback, an admin-registered
///     operator key. Both produce a shared `Enclave` holding the Ed25519 pubkey.
///   - verify per request (cheap): `verify_signature` / `verify_credit`.
///
/// BCS layout is load-bearing: `IntentMessage` / `CreditPayload` mirror the offline
/// signer field-for-field. `tests/gate_tests.move` pins it to nautilus's canonical
/// weather vector byte-for-byte.
module conduit_credit::enclave_registry;

use std::bcs;
use sui::ed25519;
use sui::clock::Clock;
use sui::nitro_attestation::{Self, NitroAttestationDocument};

/// Brand for OUR enclave instance (mirrors nautilus's `Enclave<T>` witness pattern).
public struct CONDUIT_ENCLAVE has drop {}

/// Custom intent scope for ConduitCredit (the weather example uses 0; we use 2).
const INTENT_SCOPE_CREDIT: u8 = 2;
const MODE_NITRO: u8 = 0;
const MODE_OPERATOR: u8 = 1;

/// Gates operator registration + PCR updates. Minted to the deployer at publish.
public struct AdminCap has key, store { id: UID }

/// A registered enclave: the Ed25519 pubkey `verify_signature` checks against, plus
/// the PCR measurements (non-zero = production). `mode` records how the key was bound:
/// 0 = real Nitro attestation, 1 = operator fallback.
public struct Enclave has key {
    id: UID,
    pk: vector<u8>,
    pcr0: vector<u8>,
    pcr1: vector<u8>,
    pcr2: vector<u8>,
    mode: u8,
}

/// Mirror of nautilus `enclave::IntentMessage<T>` (positional BCS — order + types match).
public struct IntentMessage<T: drop> has copy, drop {
    intent: u8,
    timestamp_ms: u64,
    payload: T,
}

/// The income attestation payload the enclave signs.
public struct CreditPayload has copy, drop {
    borrower: address,
    income_6mo_avg_usdc: u64,
    data_source: vector<u8>,
    fetch_ts_ms: u64,
}

const E_PK_LEN: u64 = 1;
const E_SIG_LEN: u64 = 2;
const E_BAD_SIGNATURE: u64 = 3;
const E_NO_ENCLAVE_KEY: u64 = 4;

fun init(ctx: &mut TxContext) {
    transfer::public_transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

public fun intent_scope(): u8 { INTENT_SCOPE_CREDIT }
public fun pk(e: &Enclave): vector<u8> { e.pk }
public fun mode(e: &Enclave): u8 { e.mode }
public fun pcr0(e: &Enclave): vector<u8> { e.pcr0 }

// ─────────────────────────────── registration ───────────────────────────────

/// PRODUCTION (the moat): verify a real AWS Nitro attestation on chain — the native
/// `sui::nitro_attestation` module checks the cert chain against the AWS root CA that
/// ships in the Sui framework — then bind the enclave's pubkey + PCRs. No oracle, no
/// trusted bridge. PTB: `doc = nitro_attestation::load_nitro_attestation(bytes, clock)`
/// then `register_via_nitro(doc, ctx)`.
public fun register_via_nitro(doc: NitroAttestationDocument, ctx: &mut TxContext) {
    let pk_opt = nitro_attestation::public_key(&doc);
    assert!(pk_opt.is_some(), E_NO_ENCLAVE_KEY);
    let pk = *pk_opt.borrow();
    let (p0, p1, p2) = extract_pcrs(&doc);
    transfer::share_object(Enclave {
        id: object::new(ctx), pk, pcr0: p0, pcr1: p1, pcr2: p2, mode: MODE_NITRO,
    });
}

/// FALLBACK (documented): an admin registers a known operator/enclave Ed25519 pubkey.
/// Identical `verify_signature` pattern — switching to `register_via_nitro` changes
/// only the income-proof source (TEE-signed vs operator-signed), nothing downstream.
public entry fun register_via_operator(
    _: &AdminCap,
    pk: vector<u8>,
    pcr0: vector<u8>,
    pcr1: vector<u8>,
    pcr2: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(pk.length() == 32, E_PK_LEN);
    transfer::share_object(Enclave {
        id: object::new(ctx), pk, pcr0, pcr1, pcr2, mode: MODE_OPERATOR,
    });
}

fun extract_pcrs(doc: &NitroAttestationDocument): (vector<u8>, vector<u8>, vector<u8>) {
    let entries = nitro_attestation::pcrs(doc);
    let mut p0: vector<u8> = vector[];
    let mut p1: vector<u8> = vector[];
    let mut p2: vector<u8> = vector[];
    let mut i = 0;
    let n = entries.length();
    while (i < n) {
        let e = entries.borrow(i);
        let idx = nitro_attestation::index(e);
        if (idx == 0) p0 = *nitro_attestation::value(e)
        else if (idx == 1) p1 = *nitro_attestation::value(e)
        else if (idx == 2) p2 = *nitro_attestation::value(e);
        i = i + 1;
    };
    (p0, p1, p2)
}

// ─────────────────────────────── verification ───────────────────────────────

/// The per-request gate: Ed25519 over BCS(IntentMessage{intent, ts, payload}).
public fun verify_signature<P: drop>(
    enclave: &Enclave, intent: u8, timestamp_ms: u64, payload: P, signature: &vector<u8>,
): bool {
    let msg = bcs::to_bytes(&IntentMessage { intent, timestamp_ms, payload });
    ed25519::ed25519_verify(signature, &enclave.pk, &msg)
}

/// Verify a `CreditPayload` (intent scope = 2) against the registered enclave key.
public fun verify_credit(
    enclave: &Enclave,
    timestamp_ms: u64,
    borrower: address,
    income_6mo_avg_usdc: u64,
    data_source: vector<u8>,
    fetch_ts_ms: u64,
    signature: &vector<u8>,
): bool {
    let payload = CreditPayload { borrower, income_6mo_avg_usdc, data_source, fetch_ts_ms };
    verify_signature(enclave, INTENT_SCOPE_CREDIT, timestamp_ms, payload, signature)
}

// ───────────────────────── standalone canary (Day-1 gate) ─────────────────────────

/// Rebuild the exact bytes the enclave signs (used by the gate tests + on-chain canary).
public fun credit_intent_bytes(
    intent: u8,
    timestamp_ms: u64,
    borrower: address,
    income_6mo_avg_usdc: u64,
    data_source: vector<u8>,
    fetch_ts_ms: u64,
): vector<u8> {
    let payload = CreditPayload { borrower, income_6mo_avg_usdc, data_source, fetch_ts_ms };
    bcs::to_bytes(&IntentMessage { intent, timestamp_ms, payload })
}

/// Self-contained gate (no Enclave object): succeeds on a good signature, aborts on a
/// bad one. Proves the primitive against a keypair we control, gas-only.
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

#[test_only]
public fun new_operator_enclave_for_testing(pk: vector<u8>, ctx: &mut TxContext): Enclave {
    Enclave { id: object::new(ctx), pk, pcr0: b"t", pcr1: b"t", pcr2: b"t", mode: MODE_OPERATOR }
}

#[test_only]
public fun destroy_enclave_for_testing(e: Enclave) {
    let Enclave { id, pk: _, pcr0: _, pcr1: _, pcr2: _, mode: _ } = e;
    id.delete();
}
