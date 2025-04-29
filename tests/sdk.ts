import * as anchor from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";
import type { Program } from "@project-serum/anchor";
import type { Lockup } from "../target/types/lockup";
import type { MintProxy } from "../target/types/mint_proxy";

/**
 * Saber Periphery SDK
 * @class
 * @description - The Periphery class is used to interact with the Periphery program
 */
export default class Periphery {
  lockupProgram: Program<Lockup>;
  mintProxyProgram: Program<MintProxy>;

  constructor() {
    this.lockupProgram = (anchor.workspace as WorkspaceType).Lockup;
    this.mintProxyProgram = (anchor.workspace as WorkspaceType).MintProxy;
  }

  /**
   * Initialize the periphery
   * @param payer - The payer of the transaction
   * @param mint - The mint of the token
   * @param hardCap - The hard cap of the token
   * @returns - The instructions to initialize the periphery
   */
  initialize(
    payer: anchor.web3.PublicKey,
    mint: anchor.web3.PublicKey,
    hardCap: anchor.BN
  ) {
    try {
      const mintProxyState = this.mintProxyProgram?.state?.address();
      if (!mintProxyState) {
        throw new Error("Mint proxy state not found");
      }

      const [PROXY_MINT_AUTHORITY, bump] =
        anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("SaberMintProxy", "utf-8"),
            this.mintProxyProgram.state?.address()?.toBuffer() ||
              Buffer.alloc(0),
          ],
          this.mintProxyProgram.programId
        );

      const createMintProxyInstruction =
        this.mintProxyProgram?.state?.instruction.new(bump, hardCap, {
          accounts: {
            mintAuthority: payer,
            proxyMintAuthority: PROXY_MINT_AUTHORITY,
            owner: payer,
            tokenMint: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        });

      const createLockupInstruction =
        this.lockupProgram?.state?.instruction.new({
          accounts: {
            auth: {
              owner: payer,
            },
            mintProxyState: mintProxyState,
            mintProxyProgram: this.mintProxyProgram.programId,
          },
        });

      return {
        createMintProxyInstruction,
        createLockupInstruction,
        PROXY_MINT_AUTHORITY,
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Add a minter to the periphery
   * @param owner - The owner of the periphery
   * @param minter - The minter to add
   * @param payer - The payer of the transaction
   * @param allowance - The allowance of the minter
   * @returns - The instructions to add a minter to the periphery
   */
  addMinter(
    owner: anchor.web3.PublicKey,
    minter: anchor.web3.PublicKey,
    payer: anchor.web3.PublicKey,
    allowance: anchor.BN
  ) {
    try {
      const [minterInfo] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("anchor"), minter.toBuffer()],
        this.mintProxyProgram.programId
      );

      const addMinterInstruction =
        this.mintProxyProgram?.state?.instruction.minterAdd(allowance, {
          accounts: {
            auth: {
              owner: owner,
            },
            minter: minter,
            minterInfo,
            payer: payer,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            systemProgram: anchor.web3.SystemProgram.programId,
          },
        });

      return {
        addMinterInstruction,
        minterInfo,
      };
    } catch (error) {
      console.error("Error adding minter", error);
      throw error;
    }
  }

  /**
   * Create a release
   * @param owner - The owner of the periphery
   * @param beneficiary - The beneficiary of the release
   * @param mint - The mint of the token
   * @param payer - The payer of the transaction
   * @param releaseAmount - The amount of the release
   * @param startTs - The start time of the release
   * @param endTs - The end time of the release
   * @returns - The instructions to create a release
   */
  createRelease(
    owner: anchor.web3.PublicKey,
    beneficiary: anchor.web3.PublicKey,
    mint: anchor.web3.PublicKey,
    payer: anchor.web3.PublicKey,
    releaseAmount: anchor.BN,
    startTs: anchor.BN,
    endTs: anchor.BN
  ) {
    try {
      // Create release account PDA
      const [release] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("anchor"), beneficiary.toBuffer()],
        this.lockupProgram.programId
      );

      // Create a minterInfo PDA for the release account
      const [releaseMinterInfo] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("anchor"), release.toBuffer()],
        this.mintProxyProgram.programId
      );

      // Add the release account as an authorized minter
      const addReleaseMinterInstruction =
        this.mintProxyProgram?.state?.instruction.minterAdd(releaseAmount, {
          accounts: {
            auth: {
              owner: owner,
            },
            minter: release,
            minterInfo: releaseMinterInfo,
            payer: payer,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            systemProgram: anchor.web3.SystemProgram.programId,
          },
        });

      // Create the release
      const createReleaseInstruction =
        this.lockupProgram?.state?.instruction.createRelease(
          releaseAmount,
          startTs,
          endTs,
          {
            accounts: {
              auth: {
                owner: owner,
              },
              minterInfo: releaseMinterInfo,
              beneficiary,
              release,
              mint,
              mintProxyProgram: this.mintProxyProgram.programId,
              payer: payer,
              systemProgram: anchor.web3.SystemProgram.programId,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            },
          }
        );

      return {
        addReleaseMinterInstruction,
        createReleaseInstruction,
        release,
        releaseMinterInfo,
      };
    } catch (error) {
      console.error("Error creating release", error);
      throw error;
    }
  }

  /**
   * Withdraw with amount
   * @param beneficiary - The beneficiary of the withdrawal
   * @param release - The release to withdraw from
   * @param tokenAccount - The token account to withdraw to
   * @param mint - The mint of the token
   * @param minterInfo - The minter info of the release
   * @param amount - The amount to withdraw
   * @returns - The instructions to withdraw with amount
   */
  withdrawWithAmount(
    beneficiary: anchor.web3.PublicKey,
    release: anchor.web3.PublicKey,
    tokenAccount: anchor.web3.PublicKey,
    mint: anchor.web3.PublicKey,
    minterInfo: anchor.web3.PublicKey,
    amount: anchor.BN
  ) {
    try {
      const mintProxyState = this.mintProxyProgram?.state?.address();
      if (!mintProxyState) {
        throw new Error("Mint proxy state not found");
      }

      const [PROXY_MINT_AUTHORITY] =
        anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("SaberMintProxy", "utf-8"),
            this.mintProxyProgram?.state?.address().toBuffer(),
          ],
          this.mintProxyProgram.programId
        );

      const withdrawWithAmountInstruction =
        this.lockupProgram?.state?.instruction.withdrawWithAmount(amount, {
          accounts: {
            proxyMintAuthority: PROXY_MINT_AUTHORITY,
            tokenMint: mint,
            beneficiary,
            release,
            tokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            unusedClock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            minterInfo,
            mintProxyProgram: this.mintProxyProgram.programId,
            mintProxyState,
          },
        });

      return {
        withdrawWithAmountInstruction,
        PROXY_MINT_AUTHORITY,
      };
    } catch (error) {
      console.error("Error withdrawing with amount", error);
      throw error;
    }
  }

  /**
   * Withdraw
   * @param beneficiary - The beneficiary of the withdrawal
   * @param release - The release to withdraw from
   * @param tokenAccount - The token account to withdraw to
   * @param mint - The mint of the token
   * @param minterInfo - The minter info of the release
   * @returns - The instructions to withdraw
   */
  withdraw(
    beneficiary: anchor.web3.PublicKey,
    release: anchor.web3.PublicKey,
    tokenAccount: anchor.web3.PublicKey,
    mint: anchor.web3.PublicKey,
    minterInfo: anchor.web3.PublicKey
  ) {
    try {
      const mintProxyState = this.mintProxyProgram?.state?.address();
      if (!mintProxyState) {
        throw new Error("Mint proxy state not found");
      }

      const [PROXY_MINT_AUTHORITY] =
        anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("SaberMintProxy", "utf-8"),
            this.mintProxyProgram?.state?.address().toBuffer(),
          ],
          this.mintProxyProgram.programId
        );

      const withdrawInstruction =
        this.lockupProgram?.state?.instruction.withdraw({
          accounts: {
            proxyMintAuthority: PROXY_MINT_AUTHORITY,
            tokenMint: mint,
            beneficiary,
            release,
            tokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            unusedClock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            minterInfo,
            mintProxyProgram: this.mintProxyProgram.programId,
            mintProxyState,
          },
        });

      return {
        withdrawInstruction,
        PROXY_MINT_AUTHORITY,
      };
    } catch (error) {
      console.error("Error withdrawing", error);
      throw error;
    }
  }

  /**
   * Calculate available withdrawal
   * @param release - The release to calculate the available withdrawal for
   * @returns - The instructions to calculate the available withdrawal
   */
  async calculateAvailableWithdrawal(release: anchor.web3.PublicKey) {
    try {
      const calculateAvailableInstruction = await this.lockupProgram.methods
        .availableForWithdrawal()
        .accounts({
          release,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .instruction();

      return {
        calculateAvailableInstruction,
      };
    } catch (error) {
      console.error("Error calculating available withdrawal", error);
      throw error;
    }
  }

  /**
   * Revoke release
   * @param owner - The owner of the periphery
   * @param release - The release to revoke
   * @param payer - The payer of the transaction
   * @returns - The instructions to revoke a release
   */
  revokeRelease(
    owner: anchor.web3.PublicKey,
    release: anchor.web3.PublicKey,
    payer: anchor.web3.PublicKey
  ) {
    try {
      const revokeReleaseInstruction =
        this.lockupProgram?.state?.instruction.revokeRelease({
          accounts: {
            auth: {
              owner: owner,
            },
            release,
            payer: payer,
          },
        });

      return {
        revokeReleaseInstruction,
      };
    } catch (error) {
      console.error("Error revoking release", error);
      throw error;
    }
  }

  /**
   * Transfer ownership
   * @param currentOwner - The current owner of the periphery
   * @param newOwner - The new owner of the periphery
   * @returns - The instructions to transfer ownership
   */
  transferOwnership(
    currentOwner: anchor.web3.PublicKey,
    newOwner: anchor.web3.PublicKey
  ) {
    try {
      const transferOwnershipInstruction =
        this.lockupProgram?.state?.instruction.transferOwnership(newOwner, {
          accounts: {
            owner: currentOwner,
          },
        });

      return {
        transferOwnershipInstruction,
      };
    } catch (error) {
      console.error("Error transferring ownership", error);
      throw error;
    }
  }

  /**
   * Accept ownership
   * @param newOwner - The new owner of the periphery
   * @returns - The instructions to accept ownership
   */
  acceptOwnership(newOwner: anchor.web3.PublicKey) {
    try {
      const acceptOwnershipInstruction =
        this.lockupProgram?.state?.instruction.acceptOwnership({
          accounts: {
            owner: newOwner,
          },
        });

      return {
        acceptOwnershipInstruction,
      };
    } catch (error) {
      console.error("Error accepting ownership", error);
      throw error;
    }
  }
}
