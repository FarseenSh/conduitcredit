/// Testnet stand-in for USDC (6 decimals). The pool/credit modules are generic over
/// the coin type, so mainnet swaps this for native USDC with ZERO contract changes.
module conduit_credit::mock_usdc;

use sui::coin::{Self, TreasuryCap};

public struct MOCK_USDC has drop {}

#[allow(deprecated_usage)]
fun init(witness: MOCK_USDC, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"dUSDC",
        b"ConduitCredit Test USDC",
        b"Testnet stand-in for USDC (6 dp). Mainnet uses native USDC unchanged.",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}

/// Admin (TreasuryCap holder) mints test USDC to fund LPs and borrowers in the demo.
public entry fun mint(
    treasury: &mut TreasuryCap<MOCK_USDC>, amount: u64, recipient: address, ctx: &mut TxContext,
) {
    transfer::public_transfer(coin::mint(treasury, amount, ctx), recipient);
}
