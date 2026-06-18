/// ConduitCredit — shared borrower registry (blacklist) + keeper capability.
///
/// Kept in its own module so `credit_line` (which checks the blacklist on open) and
/// `defaults` (which writes to it on default) both depend on it WITHOUT forming a
/// dependency cycle.
module conduit_credit::registry;

use sui::table::{Self, Table};

/// Held by the keeper/admin; gates `defaults::declare_default`. Minted at publish.
public struct KeeperCap has key, store { id: UID }

/// Shared set of borrowers banned after a default — no new credit lines open for them.
public struct Blacklist has key {
    id: UID,
    banned: Table<address, bool>,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(Blacklist { id: object::new(ctx), banned: table::new(ctx) });
    transfer::public_transfer(KeeperCap { id: object::new(ctx) }, ctx.sender());
}

public fun is_banned(bl: &Blacklist, who: address): bool {
    bl.banned.contains(who)
}

public(package) fun ban(bl: &mut Blacklist, who: address) {
    if (!bl.banned.contains(who)) bl.banned.add(who, true);
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(ctx) }
