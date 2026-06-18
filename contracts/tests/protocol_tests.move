#[test_only]
#[allow(implicit_const_copy)]
/// Full-protocol lifecycle tests (test_scenario): attest accept/reject, deposit →
/// open → borrow → repay with tranche yield ordering, and default → junior-first
/// loss → blacklist. Signature fixtures come from scripts/sign.mjs.
module conduit_credit::protocol_tests;

use sui::test_scenario::{Self as ts};
use sui::clock::{Self};
use sui::coin::{Self, Coin};
use conduit_credit::enclave_registry;
use conduit_credit::income::{Self, IncomeAttestation};
use conduit_credit::credit_pool::{Self, CreditPool, Senior, Junior, LPToken};
use conduit_credit::credit_line::{Self, CreditLine};
use conduit_credit::registry::{Self, Blacklist, KeeperCap};
use conduit_credit::defaults;

/// Test stablecoin type for the generic pool.
public struct USD has drop {}

const PK: vector<u8> = x"755c4cb9256ca7cdc4acfdc6cfeeda849017e5b9f9514e99191bd67e0b0d4276";
const GOOD_SIG: vector<u8> = x"c91dae2e44265c3e4ebe915960dc6e2a62456abfc5d49711ef4a922b0da97e88f530d6a54a2b4591a8b06fa12711e4d12721dae94ee7bd248977ec0d9c82b703";
const TAMPERED_SIG: vector<u8> = x"c81dae2e44265c3e4ebe915960dc6e2a62456abfc5d49711ef4a922b0da97e88f530d6a54a2b4591a8b06fa12711e4d12721dae94ee7bd248977ec0d9c82b703";
const INCOME: u64 = 4200000000;       // $4,200.000000
const FETCH_TS: u64 = 1744038900000;
const TS_SIG: u64 = 1744038900000;
const DAY_MS: u64 = 86400000;

const ADMIN: address = @0xAD;
const BORROWER: address = @0xcafe;    // matches the signed CreditPayload.borrower
const ALICE: address = @0xA11CE;      // senior LP
const BOB: address = @0xB0B;          // junior LP

#[test]
fun test_full_lifecycle() {
    let mut sc = ts::begin(ADMIN);
    registry::init_for_testing(ts::ctx(&mut sc));
    credit_pool::create_pool<USD>(ts::ctx(&mut sc));
    let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
    clock.set_for_testing(FETCH_TS);
    let enclave = enclave_registry::new_operator_enclave_for_testing(PK, ts::ctx(&mut sc));

    // Senior LP deposits 1000; Junior LP deposits 1000.
    ts::next_tx(&mut sc, ALICE);
    {
        let mut pool = ts::take_shared<CreditPool<USD>>(&sc);
        credit_pool::deposit_senior(&mut pool, coin::mint_for_testing<USD>(1_000_000000, ts::ctx(&mut sc)), ts::ctx(&mut sc));
        ts::return_shared(pool);
    };
    ts::next_tx(&mut sc, BOB);
    {
        let mut pool = ts::take_shared<CreditPool<USD>>(&sc);
        credit_pool::deposit_junior(&mut pool, coin::mint_for_testing<USD>(1_000_000000, ts::ctx(&mut sc)), ts::ctx(&mut sc));
        ts::return_shared(pool);
    };

    // Underwrite: enclave-signed income → non-transferable attestation to BORROWER.
    ts::next_tx(&mut sc, ADMIN);
    income::attest_income(&enclave, BORROWER, INCOME, b"plaid", FETCH_TS, TS_SIG, GOOD_SIG, &clock, ts::ctx(&mut sc));

    // Borrower opens a line: limit = 4200 * 30% = 1260.
    ts::next_tx(&mut sc, BORROWER);
    {
        let att = ts::take_from_sender<IncomeAttestation>(&sc);
        let pool = ts::take_shared<CreditPool<USD>>(&sc);
        let mut bl = ts::take_shared<Blacklist>(&sc);
        credit_line::open_credit_line(&att, &pool, &mut bl, &clock, ts::ctx(&mut sc));
        ts::return_shared(pool);
        ts::return_shared(bl);
        ts::return_to_sender(&sc, att);
    };

    // Borrow 500.
    ts::next_tx(&mut sc, BORROWER);
    {
        let mut line = ts::take_from_sender<CreditLine>(&sc);
        assert!(credit_line::credit_limit(&line) == 1_260_000000, 1);
        let mut pool = ts::take_shared<CreditPool<USD>>(&sc);
        credit_line::borrow(&mut pool, &mut line, 500_000000, &clock, ts::ctx(&mut sc));
        assert!(credit_line::outstanding(&line) == 500_000000, 2);
        assert!(credit_pool::total_borrowed(&pool) == 500_000000, 3);
        ts::return_shared(pool);
        ts::return_to_sender(&sc, line);
    };
    // Borrower received the USDC.
    ts::next_tx(&mut sc, BORROWER);
    {
        let drawn = ts::take_from_sender<Coin<USD>>(&sc);
        assert!(coin::value(&drawn) == 500_000000, 4);
        ts::return_to_sender(&sc, drawn);
    };

    // 60 days pass; borrower repays principal + interest.
    clock.set_for_testing(FETCH_TS + 60 * DAY_MS);
    ts::next_tx(&mut sc, BORROWER);
    {
        let mut line = ts::take_from_sender<CreditLine>(&sc);
        let mut pool = ts::take_shared<CreditPool<USD>>(&sc);
        credit_line::repay(&mut pool, &mut line, coin::mint_for_testing<USD>(600_000000, ts::ctx(&mut sc)), &clock, ts::ctx(&mut sc));
        assert!(credit_line::outstanding(&line) == 0, 5);
        // Interest distributed: both tranches earn, junior earns MORE (3x weight).
        assert!(credit_pool::senior_assets(&pool) > 1_000_000000, 6);
        assert!(credit_pool::junior_assets(&pool) > credit_pool::senior_assets(&pool), 7);
        ts::return_shared(pool);
        ts::return_to_sender(&sc, line);
    };

    // Senior LP withdraws principal + yield.
    ts::next_tx(&mut sc, ALICE);
    {
        let mut pool = ts::take_shared<CreditPool<USD>>(&sc);
        let lp = ts::take_from_sender<LPToken<Senior>>(&sc);
        credit_pool::withdraw_senior(&mut pool, lp, ts::ctx(&mut sc));
        ts::return_shared(pool);
    };
    ts::next_tx(&mut sc, ALICE);
    {
        let out = ts::take_from_sender<Coin<USD>>(&sc);
        assert!(coin::value(&out) >= 1_000_000000, 8);
        ts::return_to_sender(&sc, out);
    };

    enclave_registry::destroy_enclave_for_testing(enclave);
    clock.destroy_for_testing();
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = income::E_BAD_SIGNATURE)]
fun test_attest_rejects_tampered_signature() {
    let mut sc = ts::begin(ADMIN);
    let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
    clock.set_for_testing(FETCH_TS);
    let enclave = enclave_registry::new_operator_enclave_for_testing(PK, ts::ctx(&mut sc));
    // tampered signature → abort before any attestation is minted
    income::attest_income(&enclave, BORROWER, INCOME, b"plaid", FETCH_TS, TS_SIG, TAMPERED_SIG, &clock, ts::ctx(&mut sc));
    enclave_registry::destroy_enclave_for_testing(enclave);
    clock.destroy_for_testing();
    ts::end(sc);
}

#[test]
fun test_default_writes_off_junior_first() {
    let mut sc = ts::begin(ADMIN);
    registry::init_for_testing(ts::ctx(&mut sc));
    credit_pool::create_pool<USD>(ts::ctx(&mut sc));
    let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
    clock.set_for_testing(FETCH_TS);
    let enclave = enclave_registry::new_operator_enclave_for_testing(PK, ts::ctx(&mut sc));

    ts::next_tx(&mut sc, ALICE);
    {
        let mut pool = ts::take_shared<CreditPool<USD>>(&sc);
        credit_pool::deposit_senior(&mut pool, coin::mint_for_testing<USD>(1_000_000000, ts::ctx(&mut sc)), ts::ctx(&mut sc));
        ts::return_shared(pool);
    };
    ts::next_tx(&mut sc, BOB);
    {
        let mut pool = ts::take_shared<CreditPool<USD>>(&sc);
        credit_pool::deposit_junior(&mut pool, coin::mint_for_testing<USD>(1_000_000000, ts::ctx(&mut sc)), ts::ctx(&mut sc));
        ts::return_shared(pool);
    };

    ts::next_tx(&mut sc, ADMIN);
    income::attest_income(&enclave, BORROWER, INCOME, b"plaid", FETCH_TS, TS_SIG, GOOD_SIG, &clock, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, BORROWER);
    {
        let att = ts::take_from_sender<IncomeAttestation>(&sc);
        let pool = ts::take_shared<CreditPool<USD>>(&sc);
        let mut bl = ts::take_shared<Blacklist>(&sc);
        credit_line::open_credit_line(&att, &pool, &mut bl, &clock, ts::ctx(&mut sc));
        ts::return_shared(pool);
        ts::return_shared(bl);
        ts::return_to_sender(&sc, att);
    };
    ts::next_tx(&mut sc, BORROWER);
    {
        let mut line = ts::take_from_sender<CreditLine>(&sc);
        let mut pool = ts::take_shared<CreditPool<USD>>(&sc);
        credit_line::borrow(&mut pool, &mut line, 500_000000, &clock, ts::ctx(&mut sc));
        ts::return_shared(pool);
        ts::return_to_sender(&sc, line);
    };

    // Past the 90-day term → keeper declares default.
    clock.set_for_testing(FETCH_TS + 91 * DAY_MS);
    ts::next_tx(&mut sc, ADMIN);
    {
        let kc = ts::take_from_sender<KeeperCap>(&sc);
        let mut pool = ts::take_shared<CreditPool<USD>>(&sc);
        let mut bl = ts::take_shared<Blacklist>(&sc);
        let mut line = ts::take_from_address<CreditLine>(&sc, BORROWER);
        defaults::declare_default(&kc, &mut pool, &mut line, &mut bl, &clock);
        // Junior absorbed the 500 loss first; senior fully protected.
        assert!(credit_pool::junior_assets(&pool) == 500_000000, 1);
        assert!(credit_pool::senior_assets(&pool) == 1_000_000000, 2);
        assert!(registry::is_banned(&bl, BORROWER), 3);
        ts::return_shared(pool);
        ts::return_shared(bl);
        ts::return_to_address(BORROWER, line);
        ts::return_to_sender(&sc, kc);
    };

    enclave_registry::destroy_enclave_for_testing(enclave);
    clock.destroy_for_testing();
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = credit_line::E_ALREADY_HAS_LINE)]
/// One attestation must yield at most ONE line: a second open with the same
/// (by-reference) attestation aborts, so the income-sized limit can't be multiplied.
fun test_one_line_per_borrower() {
    let mut sc = ts::begin(ADMIN);
    registry::init_for_testing(ts::ctx(&mut sc));
    credit_pool::create_pool<USD>(ts::ctx(&mut sc));
    let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
    clock.set_for_testing(FETCH_TS);
    let enclave = enclave_registry::new_operator_enclave_for_testing(PK, ts::ctx(&mut sc));

    ts::next_tx(&mut sc, ADMIN);
    income::attest_income(&enclave, BORROWER, INCOME, b"plaid", FETCH_TS, TS_SIG, GOOD_SIG, &clock, ts::ctx(&mut sc));

    // First line opens fine and claims the borrower's single slot.
    ts::next_tx(&mut sc, BORROWER);
    {
        let att = ts::take_from_sender<IncomeAttestation>(&sc);
        let pool = ts::take_shared<CreditPool<USD>>(&sc);
        let mut bl = ts::take_shared<Blacklist>(&sc);
        credit_line::open_credit_line(&att, &pool, &mut bl, &clock, ts::ctx(&mut sc));
        ts::return_shared(pool);
        ts::return_shared(bl);
        ts::return_to_sender(&sc, att);
    };
    // Second open with the SAME attestation → E_ALREADY_HAS_LINE (no over-borrow).
    ts::next_tx(&mut sc, BORROWER);
    {
        let att = ts::take_from_sender<IncomeAttestation>(&sc);
        let pool = ts::take_shared<CreditPool<USD>>(&sc);
        let mut bl = ts::take_shared<Blacklist>(&sc);
        credit_line::open_credit_line(&att, &pool, &mut bl, &clock, ts::ctx(&mut sc));
        ts::return_shared(pool);
        ts::return_shared(bl);
        ts::return_to_sender(&sc, att);
    };
    enclave_registry::destroy_enclave_for_testing(enclave);
    clock.destroy_for_testing();
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = credit_line::E_BLACKLISTED)]
fun test_blacklist_blocks_open() {
    let mut sc = ts::begin(ADMIN);
    registry::init_for_testing(ts::ctx(&mut sc));
    credit_pool::create_pool<USD>(ts::ctx(&mut sc));
    let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
    clock.set_for_testing(FETCH_TS);
    let enclave = enclave_registry::new_operator_enclave_for_testing(PK, ts::ctx(&mut sc));

    ts::next_tx(&mut sc, ADMIN);
    income::attest_income(&enclave, BORROWER, INCOME, b"plaid", FETCH_TS, TS_SIG, GOOD_SIG, &clock, ts::ctx(&mut sc));

    // Ban directly (registry::ban is public(package), callable from same-package tests).
    ts::next_tx(&mut sc, ADMIN);
    {
        let mut bl = ts::take_shared<Blacklist>(&sc);
        registry::ban(&mut bl, BORROWER);
        ts::return_shared(bl);
    };

    // Banned borrower opens with a still-valid attestation → E_BLACKLISTED.
    ts::next_tx(&mut sc, BORROWER);
    {
        let att = ts::take_from_sender<IncomeAttestation>(&sc);
        let pool = ts::take_shared<CreditPool<USD>>(&sc);
        let mut bl = ts::take_shared<Blacklist>(&sc);
        credit_line::open_credit_line(&att, &pool, &mut bl, &clock, ts::ctx(&mut sc));
        ts::return_shared(pool);
        ts::return_shared(bl);
        ts::return_to_sender(&sc, att);
    };
    enclave_registry::destroy_enclave_for_testing(enclave);
    clock.destroy_for_testing();
    ts::end(sc);
}
