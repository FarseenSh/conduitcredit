/// ConduitCredit — the standalone USDC lending pool with junior/senior tranches.
///
/// Standalone (not composed into Suilend/Scallop/NAVI) because their borrow paths
/// require a sender-owned `ObligationOwnerCap`; no protocol can borrow under-
/// collateralized on a third party's behalf. So ConduitCredit owns its pool.
///
/// Accounting uses a per-tranche SHARE-PRICE (vault) model:
///   - deposits mint shares at the current price (tranche_assets / tranche_shares);
///   - repaid interest is added to tranche assets (junior weighted higher) → share
///     price rises → LPs earn yield, junior more;
///   - defaults shrink assets JUNIOR-FIRST → junior share price drops first, senior
///     is protected. Loss/yield are socialised pro-rata automatically by share price.
///
/// Invariant: liquidity (cash) + total_borrowed == senior_assets + junior_assets.
module conduit_credit::credit_pool;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};

/// Tranche marker types for `LPToken<Tranche>`.
public struct Senior has drop {}
public struct Junior has drop {}

public struct CreditPool<phantom T> has key {
    id: UID,
    liquidity: Balance<T>,   // cash on hand
    total_borrowed: u64,     // principal currently lent out
    senior_assets: u64,      // USDC claim backing the senior tranche
    senior_shares: u64,
    junior_assets: u64,      // junior is first-loss
    junior_shares: u64,
}

public struct LPToken<phantom Tranche> has key, store {
    id: UID,
    pool_id: ID,
    shares: u64,
}

/// Junior earns this multiple of senior's per-unit yield (higher risk → higher reward).
const JUNIOR_YIELD_WEIGHT: u64 = 3;

const E_ZERO: u64 = 1;
const E_INSUFFICIENT_LIQUIDITY: u64 = 2;
const E_WRONG_POOL: u64 = 3;

public entry fun create_pool<T>(ctx: &mut TxContext) {
    transfer::share_object(CreditPool<T> {
        id: object::new(ctx),
        liquidity: balance::zero<T>(),
        total_borrowed: 0,
        senior_assets: 0,
        senior_shares: 0,
        junior_assets: 0,
        junior_shares: 0,
    });
}

// ─────────────────────────────── LP deposit / withdraw ───────────────────────────────

public entry fun deposit_senior<T>(pool: &mut CreditPool<T>, c: Coin<T>, ctx: &mut TxContext) {
    let amt = c.value();
    assert!(amt > 0, E_ZERO);
    let shares = mint_shares(pool.senior_assets, pool.senior_shares, amt);
    pool.liquidity.join(c.into_balance());
    pool.senior_assets = pool.senior_assets + amt;
    pool.senior_shares = pool.senior_shares + shares;
    let pool_id = object::id(pool);
    transfer::public_transfer(
        LPToken<Senior> { id: object::new(ctx), pool_id, shares }, ctx.sender(),
    );
}

public entry fun deposit_junior<T>(pool: &mut CreditPool<T>, c: Coin<T>, ctx: &mut TxContext) {
    let amt = c.value();
    assert!(amt > 0, E_ZERO);
    let shares = mint_shares(pool.junior_assets, pool.junior_shares, amt);
    pool.liquidity.join(c.into_balance());
    pool.junior_assets = pool.junior_assets + amt;
    pool.junior_shares = pool.junior_shares + shares;
    let pool_id = object::id(pool);
    transfer::public_transfer(
        LPToken<Junior> { id: object::new(ctx), pool_id, shares }, ctx.sender(),
    );
}

public entry fun withdraw_senior<T>(pool: &mut CreditPool<T>, t: LPToken<Senior>, ctx: &mut TxContext) {
    let LPToken { id, pool_id, shares } = t;
    assert!(pool_id == object::id(pool), E_WRONG_POOL);
    id.delete();
    let amount = redeem_amount(pool.senior_assets, pool.senior_shares, shares);
    assert!(pool.liquidity.value() >= amount, E_INSUFFICIENT_LIQUIDITY);
    pool.senior_assets = pool.senior_assets - amount;
    pool.senior_shares = pool.senior_shares - shares;
    transfer::public_transfer(coin::from_balance(pool.liquidity.split(amount), ctx), ctx.sender());
}

public entry fun withdraw_junior<T>(pool: &mut CreditPool<T>, t: LPToken<Junior>, ctx: &mut TxContext) {
    let LPToken { id, pool_id, shares } = t;
    assert!(pool_id == object::id(pool), E_WRONG_POOL);
    id.delete();
    let amount = redeem_amount(pool.junior_assets, pool.junior_shares, shares);
    assert!(pool.liquidity.value() >= amount, E_INSUFFICIENT_LIQUIDITY);
    pool.junior_assets = pool.junior_assets - amount;
    pool.junior_shares = pool.junior_shares - shares;
    transfer::public_transfer(coin::from_balance(pool.liquidity.split(amount), ctx), ctx.sender());
}

// ─────────────────────────── called only by sibling modules ───────────────────────────

public(package) fun take_for_borrow<T>(pool: &mut CreditPool<T>, amt: u64, ctx: &mut TxContext): Coin<T> {
    assert!(pool.liquidity.value() >= amt, E_INSUFFICIENT_LIQUIDITY);
    pool.total_borrowed = pool.total_borrowed + amt;
    coin::from_balance(pool.liquidity.split(amt), ctx)
}

public(package) fun return_from_repay<T>(pool: &mut CreditPool<T>, principal: u64, interest: u64, c: Coin<T>) {
    pool.total_borrowed = pool.total_borrowed - principal;
    distribute_interest(pool, interest);
    pool.liquidity.join(c.into_balance());
}

/// Junior-first write-off: junior assets absorb the loss before senior is touched.
public(package) fun write_off<T>(pool: &mut CreditPool<T>, bad_debt: u64) {
    pool.total_borrowed = pool.total_borrowed - bad_debt;
    let from_junior = if (bad_debt <= pool.junior_assets) bad_debt else pool.junior_assets;
    pool.junior_assets = pool.junior_assets - from_junior;
    let remainder = bad_debt - from_junior;
    if (remainder > 0) {
        pool.senior_assets = if (remainder <= pool.senior_assets) pool.senior_assets - remainder else 0;
    };
}

fun distribute_interest<T>(pool: &mut CreditPool<T>, interest: u64) {
    if (interest == 0) return;
    let jw = pool.junior_assets * JUNIOR_YIELD_WEIGHT;
    let sw = pool.senior_assets;
    let tw = jw + sw;
    if (tw == 0) {
        // No LP principal to credit (only possible with no LPs); keep cash, exit.
        return
    };
    let jcut = (((interest as u128) * (jw as u128)) / (tw as u128)) as u64;
    let scut = interest - jcut;
    pool.junior_assets = pool.junior_assets + jcut;
    pool.senior_assets = pool.senior_assets + scut;
}

fun mint_shares(assets: u64, shares: u64, amount: u64): u64 {
    if (shares == 0 || assets == 0) amount
    else (((amount as u128) * (shares as u128)) / (assets as u128)) as u64
}

fun redeem_amount(assets: u64, shares_total: u64, shares: u64): u64 {
    if (shares_total == 0) 0
    else (((shares as u128) * (assets as u128)) / (shares_total as u128)) as u64
}

// ─────────────────────────────────── views ───────────────────────────────────

public fun liquidity_value<T>(pool: &CreditPool<T>): u64 { pool.liquidity.value() }
public fun total_borrowed<T>(pool: &CreditPool<T>): u64 { pool.total_borrowed }
public fun senior_assets<T>(pool: &CreditPool<T>): u64 { pool.senior_assets }
public fun senior_shares<T>(pool: &CreditPool<T>): u64 { pool.senior_shares }
public fun junior_assets<T>(pool: &CreditPool<T>): u64 { pool.junior_assets }
public fun junior_shares<T>(pool: &CreditPool<T>): u64 { pool.junior_shares }
public fun total_assets<T>(pool: &CreditPool<T>): u64 { pool.senior_assets + pool.junior_assets }
public fun lp_shares<Tranche>(t: &LPToken<Tranche>): u64 { t.shares }

public fun utilization_bps<T>(pool: &CreditPool<T>): u64 {
    let ta = pool.senior_assets + pool.junior_assets;
    if (ta == 0) 0 else (((pool.total_borrowed as u128) * 10000) / (ta as u128)) as u64
}
