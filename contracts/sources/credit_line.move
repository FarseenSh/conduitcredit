/// ConduitCredit — the revolving credit line: open / borrow / repay with interest.
///
/// `open_credit_line` sizes the limit to a fraction (LTV) of the attested 6-month
/// income, binds the line to one pool, and refuses blacklisted borrowers. `borrow`
/// draws USDC from the pool up to the limit; `repay` accrues interest, pays interest
/// first then principal, and returns funds to LPs.
module conduit_credit::credit_line;

use conduit_credit::income::{Self, IncomeAttestation};
use conduit_credit::credit_pool::{Self, CreditPool};
use conduit_credit::registry::{Self, Blacklist};
use sui::coin::{Self, Coin};
use sui::clock::Clock;

const LTV_BPS: u64 = 3000;          // 30% of 6-mo avg income (25–40% band)
const BASE_IR_BPS: u64 = 800;       // 8%
const RISK_PREMIUM_BPS: u64 = 300;  // +3% → 11% APR
const MS_PER_YEAR: u64 = 365 * 24 * 60 * 60 * 1000;

const E_EXPIRED_ATTESTATION: u64 = 1;
const E_NOT_BORROWER: u64 = 2;
const E_OVER_LIMIT: u64 = 3;
const E_WRONG_POOL: u64 = 4;
const E_BLACKLISTED: u64 = 5;
const E_ALREADY_HAS_LINE: u64 = 6;  // one active line per borrower (anti over-borrow)
const E_OUTSTANDING_DEBT: u64 = 7;  // can't close a line that still owes

public struct CreditLine has key {
    id: UID,
    borrower: address,
    pool_id: ID,
    credit_limit: u64,
    outstanding: u64,
    accrued_interest: u64,
    attestation_id: ID,
    ir_bps: u64,
    opened_ts: u64,
    last_accrual_ts: u64,
}

/// Consumes the attestation BY REFERENCE (it stays non-transferable in the wallet),
/// binds the line to `pool`, and mints an owner-scoped `CreditLine` to the borrower.
public entry fun open_credit_line<T>(
    att: &IncomeAttestation,
    pool: &CreditPool<T>,
    bl: &mut Blacklist,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now = clock.timestamp_ms();
    let me = ctx.sender();
    assert!(income::owner(att) == me, E_NOT_BORROWER);
    assert!(now < income::expiry(att), E_EXPIRED_ATTESTATION);
    assert!(!registry::is_banned(bl, me), E_BLACKLISTED);
    // One income attestation → at most ONE open line. Without this a borrower could
    // re-open the same (by-reference) attestation N times and over-borrow N×limit.
    assert!(!registry::has_active_line(bl, me), E_ALREADY_HAS_LINE);

    let limit = (((income::income(att) as u128) * (LTV_BPS as u128)) / 10000) as u64;
    let line = CreditLine {
        id: object::new(ctx),
        borrower: me,
        pool_id: object::id(pool),
        credit_limit: limit,
        outstanding: 0,
        accrued_interest: 0,
        attestation_id: object::id(att),
        ir_bps: BASE_IR_BPS + RISK_PREMIUM_BPS,
        opened_ts: now,
        last_accrual_ts: now,
    };
    registry::register_line(bl, me, object::id(&line)); // claim the borrower's single slot
    transfer::transfer(line, me); // key-only, owner-scoped
}

fun accrue(line: &mut CreditLine, now: u64) {
    let elapsed = now - line.last_accrual_ts;
    if (elapsed > 0 && line.outstanding > 0) {
        let interest = (((line.outstanding as u128) * (line.ir_bps as u128) * (elapsed as u128))
            / (10000u128 * (MS_PER_YEAR as u128))) as u64;
        line.accrued_interest = line.accrued_interest + interest;
    };
    line.last_accrual_ts = now;
}

public entry fun borrow<T>(
    pool: &mut CreditPool<T>, line: &mut CreditLine, amount: u64, clock: &Clock, ctx: &mut TxContext,
) {
    assert!(line.borrower == ctx.sender(), E_NOT_BORROWER);
    assert!(line.pool_id == object::id(pool), E_WRONG_POOL);
    accrue(line, clock.timestamp_ms());
    assert!(line.outstanding + amount <= line.credit_limit, E_OVER_LIMIT);
    line.outstanding = line.outstanding + amount;
    let c = credit_pool::take_for_borrow(pool, amount, ctx);
    transfer::public_transfer(c, ctx.sender());
}

/// Repay: interest first, then principal. Overpayment beyond debt is refunded.
public entry fun repay<T>(
    pool: &mut CreditPool<T>, line: &mut CreditLine, mut payment: Coin<T>, clock: &Clock, ctx: &mut TxContext,
) {
    assert!(line.pool_id == object::id(pool), E_WRONG_POOL);
    accrue(line, clock.timestamp_ms());

    let pay = payment.value();
    let interest_paid = if (pay >= line.accrued_interest) line.accrued_interest else pay;
    line.accrued_interest = line.accrued_interest - interest_paid;
    let after_interest = pay - interest_paid;
    let principal_paid = if (after_interest > line.outstanding) line.outstanding else after_interest;
    line.outstanding = line.outstanding - principal_paid;

    let to_pool = principal_paid + interest_paid;
    let pool_coin = payment.split(to_pool, ctx);
    credit_pool::return_from_repay(pool, principal_paid, interest_paid, pool_coin);

    if (payment.value() > 0) transfer::public_transfer(payment, ctx.sender())
    else payment.destroy_zero();
}

/// Voluntarily close a fully-repaid line, freeing the borrower's single-line slot so
/// they can re-attest (e.g. after an income change) and open a fresh, resized line.
public entry fun close_credit_line(line: CreditLine, bl: &mut Blacklist, ctx: &mut TxContext) {
    assert!(line.borrower == ctx.sender(), E_NOT_BORROWER);
    assert!(line.outstanding == 0 && line.accrued_interest == 0, E_OUTSTANDING_DEBT);
    registry::clear_line(bl, line.borrower);
    let CreditLine {
        id, borrower: _, pool_id: _, credit_limit: _, outstanding: _, accrued_interest: _,
        attestation_id: _, ir_bps: _, opened_ts: _, last_accrual_ts: _,
    } = line;
    object::delete(id);
}

// views
public fun borrower(line: &CreditLine): address { line.borrower }
public fun credit_limit(line: &CreditLine): u64 { line.credit_limit }
public fun outstanding(line: &CreditLine): u64 { line.outstanding }
public fun accrued_interest(line: &CreditLine): u64 { line.accrued_interest }
public fun ir_bps(line: &CreditLine): u64 { line.ir_bps }
public fun opened_ts(line: &CreditLine): u64 { line.opened_ts }
public fun pool_id(line: &CreditLine): ID { line.pool_id }

// for the defaults module (same package)
public(package) fun mark_defaulted(line: &mut CreditLine) {
    line.outstanding = 0;
    line.accrued_interest = 0;
}
