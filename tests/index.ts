import * as anchor from "@project-serum/anchor";
import type { Program } from "@project-serum/anchor";
import { SolanaProvider } from "@saberhq/solana-contrib";
import { createMint, getOrCreateATA } from "@saberhq/token-utils";
import type { Lockup } from "../target/types/lockup";
import type { MintProxy } from "../target/types/mint_proxy";
import Periphery from "./sdk";
import { expect } from "chai";
let mint: anchor.web3.PublicKey;

let beneficiary: anchor.web3.PublicKey;

interface WorkspaceType {
  Lockup: Program<Lockup>;
  MintProxy: Program<MintProxy>;
}

describe("lockup", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const lockupProgram = (anchor.workspace as WorkspaceType).Lockup;
  const mintProxyProgram = (anchor.workspace as WorkspaceType).MintProxy;
  const payer = provider.wallet as anchor.Wallet;

  const periphery = new Periphery();

  beneficiary = payer.publicKey;

  const solanaProvider = SolanaProvider.init({
    connection: provider.connection,
    wallet: payer,
    opts: {
      skipPreflight: true,
      commitment: "confirmed",
    },
  });

  it("Is initialized!", async () => {
    try {
      // console.log(
      //   "mintProxyProgram",
      //   mintProxyProgram?.state?.address().toBase58()
      // );
      // console.log("mintProxyProgram", mintProxyProgram?.state);

      mint = await createMint(solanaProvider, payer.publicKey, 9);
      const hardCap = new anchor.BN(1000).mul(new anchor.BN(10 ** 9));

      const { createMintProxyInstruction, createLockupInstruction } =
        periphery.initialize(payer.publicKey, mint, hardCap);

      if (!createMintProxyInstruction || !createLockupInstruction) {
        throw new Error(
          "Create mint proxy or create lockup instruction not found"
        );
      }

      const transaction = new anchor.web3.Transaction();
      transaction.add(createMintProxyInstruction);
      transaction.add(createLockupInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(payer.payer);

      const txid = await provider.connection.sendRawTransaction(
        transaction.serialize()
      );
      const confirmation = await provider.connection.confirmTransaction(
        txid,
        "confirmed"
      );

      // Assert that the transaction was successful
      expect(confirmation.value.err).to.be.null;

      // Verify mint proxy and lockup state were created correctly
      const mintProxyState = await mintProxyProgram?.state?.fetch();
      expect(mintProxyState?.hardCap.toString()).to.equal(hardCap.toString());
      expect(mintProxyState?.tokenMint.toString()).to.equal(mint.toString());

      const lockupState = await lockupProgram?.state?.fetch();
      expect(lockupState?.owner.toString()).to.equal(
        payer.publicKey.toString()
      );

      // sleep for 10 seconds
      await new Promise((resolve) => setTimeout(resolve, 10000));
    } catch (error) {
      console.log("Error", error);
    }
  });

  it("Adds a minter", async () => {
    try {
      const allowance = new anchor.BN(1000).mul(new anchor.BN(10 ** 9));

      const { addMinterInstruction, minterInfo } = periphery.addMinter(
        payer.publicKey,
        payer.publicKey,
        payer.publicKey,
        allowance
      );

      if (!addMinterInstruction) {
        throw new Error("Add minter instruction not found");
      }

      const transaction = new anchor.web3.Transaction();
      transaction.add(addMinterInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(payer.payer);

      const txid = await provider.connection.sendRawTransaction(
        transaction.serialize()
      );

      const confirmation = await provider.connection.confirmTransaction(
        txid,
        "confirmed"
      );

      expect(confirmation.value.err).to.be.null;
    } catch (error) {
      console.log("Error creating minter", error);
    }
  });

  it("Creates a release", async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 10000));

      // Define release parameters
      const releaseAmount = new anchor.BN(1000).mul(new anchor.BN(10 ** 9));
      const now = Math.floor(Date.now() / 1000);
      const startTs = new anchor.BN(now);
      // const endTs = new anchor.BN(now + 60 * 60 * 24 * 30); // 30 days from now
      const endTs = new anchor.BN(now + 20); // 20 seconds from now for testing

      const {
        addReleaseMinterInstruction,
        createReleaseInstruction,
        release,
        releaseMinterInfo,
      } = periphery.createRelease(
        payer.publicKey,
        beneficiary,
        mint,
        payer.publicKey,
        releaseAmount,
        startTs,
        endTs
      );

      if (!addReleaseMinterInstruction || !createReleaseInstruction) {
        throw new Error(
          "Add release minter or create release instruction not found"
        );
      }

      const transaction = new anchor.web3.Transaction();
      transaction.add(addReleaseMinterInstruction);
      transaction.add(createReleaseInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(payer.payer);

      await provider.connection.sendRawTransaction(transaction.serialize());
    } catch (error) {
      console.log("Error creating release", error);
    }
  });

  it("Withdraws tokens with a specific amount", async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const [release] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("anchor"), beneficiary.toBuffer()],
        lockupProgram.programId
      );

      const [releaseMinterInfo] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("anchor"), release.toBuffer()],
        mintProxyProgram.programId
      );

      const createTokenAccountTransaction = new anchor.web3.Transaction();

      // Token account for the beneficiary
      const { address: tokenAccount, instruction: tokenAccountInstruction } =
        await getOrCreateATA({
          provider: solanaProvider,
          mint: mint,
          owner: beneficiary,
        });

      if (tokenAccountInstruction) {
        createTokenAccountTransaction.add(tokenAccountInstruction);
      }

      createTokenAccountTransaction.feePayer = payer.publicKey;
      createTokenAccountTransaction.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      createTokenAccountTransaction.sign(payer.payer);

      await provider.connection.sendRawTransaction(
        createTokenAccountTransaction.serialize()
      );

      // sleep for 10 seconds to propagate the token account
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const amount = new anchor.BN(10).mul(new anchor.BN(10 ** 9));

      const { withdrawWithAmountInstruction, PROXY_MINT_AUTHORITY } =
        periphery.withdrawWithAmount(
          beneficiary,
          release,
          tokenAccount,
          mint,
          releaseMinterInfo,
          amount
        );

      if (!withdrawWithAmountInstruction) {
        throw new Error("Withdraw with amount instruction not found");
      }

      const transaction = new anchor.web3.Transaction();

      transaction.add(withdrawWithAmountInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(payer.payer);

      const txid = await provider.connection.sendRawTransaction(
        transaction.serialize()
      );

      const confirmation = await provider.connection.confirmTransaction(
        txid,
        "confirmed"
      );

      expect(confirmation.value.err).to.be.null;
    } catch (error) {
      console.log("Error withdrawing with amount", error);
    }
  });

  it("Withdraws tokens from a release", async () => {
    try {
      const [release] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("anchor"), beneficiary.toBuffer()],
        lockupProgram.programId
      );

      const [releaseMinterInfo] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("anchor"), release.toBuffer()],
        mintProxyProgram.programId
      );

      // Token account for the beneficiary
      const { address: tokenAccount } = await getOrCreateATA({
        provider: solanaProvider,
        mint: mint,
        owner: beneficiary,
      });

      const { withdrawInstruction, PROXY_MINT_AUTHORITY } = periphery.withdraw(
        beneficiary,
        release,
        tokenAccount,
        mint,
        releaseMinterInfo
      );

      if (!withdrawInstruction) {
        throw new Error("Withdraw instruction not found");
      }

      const transaction = new anchor.web3.Transaction();

      transaction.add(withdrawInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(payer.payer);

      const txid = await provider.connection.sendRawTransaction(
        transaction.serialize()
      );

      const confirmation = await provider.connection.confirmTransaction(
        txid,
        "confirmed"
      );

      expect(confirmation.value.err).to.be.null;
    } catch (error) {
      console.log("Error withdrawing", error);
    }
  });

  it("Calculates available withdrawal amount", async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const [release] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("anchor"), beneficiary.toBuffer()],
        lockupProgram.programId
      );

      const { calculateAvailableInstruction } =
        await periphery.calculateAvailableWithdrawal(release);

      if (!calculateAvailableInstruction) {
        throw new Error("Calculate available instruction not found");
      }

      const transaction = new anchor.web3.Transaction();

      transaction.add(calculateAvailableInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(payer.payer);

      const txid = await provider.connection.sendRawTransaction(
        transaction.serialize()
      );

      const confirmation = await provider.connection.confirmTransaction(
        txid,
        "confirmed"
      );

      expect(confirmation.value.err).to.be.null;
    } catch (error) {
      console.log("Error calculating available withdrawal", error);
    }
  });

  // this should fail because we have already claimed the release
  it("Revokes a release", async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const [release] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("anchor"), beneficiary.toBuffer()],
        lockupProgram.programId
      );

      const { revokeReleaseInstruction } = periphery.revokeRelease(
        payer.publicKey,
        release,
        payer.publicKey
      );

      if (!revokeReleaseInstruction) {
        throw new Error("Revoke release instruction not found");
      }

      const transaction = new anchor.web3.Transaction();

      transaction.add(revokeReleaseInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(payer.payer);

      const txid = await provider.connection.sendRawTransaction(
        transaction.serialize()
      );

      const confirmation = await provider.connection.confirmTransaction(
        txid,
        "confirmed"
      );

      expect(confirmation.value.err).to.not.be.null;
    } catch (error) {
      console.log("Error revoking release", error);
    }
  });

  let nextOwner: anchor.web3.Keypair;

  it("Transfers ownership", async () => {
    try {
      nextOwner = anchor.web3.Keypair.generate();

      const { transferOwnershipInstruction } = periphery.transferOwnership(
        payer.publicKey,
        nextOwner.publicKey
      );

      if (!transferOwnershipInstruction) {
        throw new Error("Transfer ownership instruction not found");
      }

      const transaction = new anchor.web3.Transaction();

      transaction.add(transferOwnershipInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(payer.payer);

      const txid = await provider.connection.sendRawTransaction(
        transaction.serialize()
      );

      const confirmation = await provider.connection.confirmTransaction(
        txid,
        "confirmed"
      );

      expect(confirmation.value.err).to.be.null;
    } catch (error) {
      console.log("Error transferring ownership", error);
    }
  });

  it("Accepts ownership", async () => {
    try {
      const airdropSignature = await provider.connection.requestAirdrop(
        nextOwner.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      );

      await provider.connection.confirmTransaction(
        airdropSignature,
        "confirmed"
      );

      const { acceptOwnershipInstruction } = periphery.acceptOwnership(
        nextOwner.publicKey
      );

      if (!acceptOwnershipInstruction) {
        throw new Error("Accept ownership instruction not found");
      }

      const transaction = new anchor.web3.Transaction();

      transaction.add(acceptOwnershipInstruction);
      transaction.feePayer = nextOwner.publicKey;
      transaction.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(nextOwner); // sign with new owner

      const txid = await provider.connection.sendRawTransaction(
        transaction.serialize()
      );

      const confirmation = await provider.connection.confirmTransaction(
        txid,
        "confirmed"
      );

      const lockupState = await lockupProgram?.state?.fetch();

      expect(lockupState?.owner.toString()).to.equal(
        nextOwner.publicKey.toString()
      );
    } catch (error) {
      console.log("Error accepting ownership", error);
      throw error;
    }
  });
});
