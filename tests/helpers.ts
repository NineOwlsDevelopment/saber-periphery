import type * as anchor from "@project-serum/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  Program as SerumProgram,
  AnchorProvider as SerumProvider,
  type Idl,
} from "@project-serum/anchor";
import { RPC_URL } from "./constants";

export const getSerumProgram = <T extends Idl>(
  wallet: anchor.Wallet,
  idl: string,
  address: string
): SerumProgram<T> => {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const parsedIdl = JSON.parse(idl) as T;
    const provider = new SerumProvider(connection, wallet, {
      commitment: "confirmed",
    });
    const program = new SerumProgram<T>(
      parsedIdl,
      new PublicKey(address),
      provider
    );

    return program;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
