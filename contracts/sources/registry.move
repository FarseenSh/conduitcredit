/// ConduitCredit — shared borrower registry: blacklist + one-line-per-borrower book.
///
/// Kept in its own module so `credit_line` (which checks both on open) and `defaults`
/// (which writes both on default) depend on it WITHOUT forming a dependency cycle.
///
/// `active_lines` enforces the core lending invariant — a borrower may hold at most ONE
/// open credit line at a time — so a reusable attestation can never be parlayed into
/// multiple lines and over-borrowed beyond a single income-sized limit.
module conduit_credit::registry;

use sui::table::{Self, Table};

/// Held by the keeper/admin; gates `defaults::declare_default`. Minted at publish.
public struct KeeperCap has key, store { id: UID }

/// Shared registry: banned borrowers + each borrower's single active credit line.
public struct Blacklist has key {
    id: UID,
    banned: Table<address, bool>,
    active_lines: Table<address, ID>,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(Blacklist {
        id: object::new(ctx),
        banned: table::new(ctx),
        active_lines: table::new(ctx),
    });
    transfer::public_transfer(KeeperCap { id: object::new(ctx) }, ctx.sender());
}

public fun is_banned(bl: &Blacklist, who: address): bool {
    bl.banned.contains(who)
}

public fun has_active_line(bl: &Blacklist, who: address): bool {
    bl.active_lines.contains(who)
}

public(package) fun ban(bl: &mut Blacklist, who: address) {
    if (!bl.banned.contains(who)) bl.banned.add(who, true);
}

public(package) fun register_line(bl: &mut Blacklist, who: address, line: ID) {
    bl.active_lines.add(who, line);
}

public(package) fun clear_line(bl: &mut Blacklist, who: address) {
    if (bl.active_lines.contains(who)) { bl.active_lines.remove(who); };
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(ctx) }
