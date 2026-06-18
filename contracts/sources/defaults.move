/// ConduitCredit — default handling: write off bad debt junior-first, ban the borrower.
///
/// Depends one-way on `credit_line`, `credit_pool`, and `registry` (no cycle): a line
/// past `MAX_TERM_MS` is written off against the junior tranche first (then senior),
/// the borrower is blacklisted, and a `DefaultEvent` is emitted.
module conduit_credit::defaults;

use sui::clock::Clock;
use sui::event;
use conduit_credit::credit_pool::{Self, CreditPool};
use conduit_credit::credit_line::{Self, CreditLine};
use conduit_credit::registry::{Self, KeeperCap, Blacklist};

const MAX_TERM_MS: u64 = 90 * 24 * 60 * 60 * 1000; // 90-day term
const E_NOT_OVERDUE: u64 = 1;
const E_WRONG_POOL: u64 = 2;

public struct DefaultEvent has copy, drop {
    borrower: address,
    bad_debt: u64,
    ts: u64,
}

/// Keeper-callable. Writes off the outstanding principal against the junior loss
/// reserve first, marks the line defaulted, bans the borrower, and emits the event.
public entry fun declare_default<T>(
    _: &KeeperCap,
    pool: &mut CreditPool<T>,
    line: &mut CreditLine,
    bl: &mut Blacklist,
    clock: &Clock,
) {
    assert!(credit_line::pool_id(line) == object::id(pool), E_WRONG_POOL);
    let now = clock.timestamp_ms();
    assert!(now > credit_line::opened_ts(line) + MAX_TERM_MS, E_NOT_OVERDUE);

    let borrower = credit_line::borrower(line);
    let bad_debt = credit_line::outstanding(line);
    credit_pool::write_off(pool, bad_debt); // junior-first
    credit_line::mark_defaulted(line);
    registry::ban(bl, borrower);
    event::emit(DefaultEvent { borrower, bad_debt, ts: now });
}
