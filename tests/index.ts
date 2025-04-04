import * as anchor from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";
import type { Program } from "@project-serum/anchor";
import { SolanaProvider } from "@saberhq/solana-contrib";
import { createMint } from "@saberhq/token-utils";
import type { Lockup } from "../target/types/lockup";
import type { MintProxy } from "../target/types/mint_proxy";

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

      const mintProxyState = mintProxyProgram?.state?.address();
      if (!mintProxyState) {
        throw new Error("Mint proxy state not found");
      }

      const [PROXY_MINT_AUTHORITY, bump] =
        anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("SaberMintProxy", "utf-8"),
            mintProxyProgram?.state?.address().toBuffer(),
          ],
          mintProxyProgram.programId
        );

      console.log("PROXY_MINT_AUTHORITY", PROXY_MINT_AUTHORITY.toBase58());

      const mint = await createMint(solanaProvider, payer.publicKey, 9);

      const createMintProxyTx = await mintProxyProgram?.state?.rpc
        .new(bump, new anchor.BN(100).mul(new anchor.BN(10 ** 9)), {
          accounts: {
            mintAuthority: payer.publicKey,
            proxyMintAuthority: PROXY_MINT_AUTHORITY,
            owner: payer.publicKey,
            tokenMint: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
          signers: [payer.payer],
        })
        .then((tx) => {
          console.log("createMintProxyTx", tx);
        });

      const createLockupTx = await lockupProgram?.state?.rpc
        .new({
          accounts: {
            auth: {
              owner: payer.publicKey,
            },
            mintProxyState: mintProxyState,
            mintProxyProgram: mintProxyProgram.programId,
          },
          signers: [payer.payer],
        })
        .then((tx) => {
          console.log("createLockupTx", tx);
        });
    } catch (error) {
      console.log("Error", error);
    }
  });
});
