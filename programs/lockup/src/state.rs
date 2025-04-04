use anchor_lang::prelude::*;

#[state]
pub struct Lockup {
    /// Owner that controls/creates the lockup.
    pub owner: Pubkey,
    /// Next owner.
    pub pending_owner: Pubkey,
}

#[derive(Accounts)]
pub struct Auth<'info> {
    pub owner: Signer<'info>,
}
