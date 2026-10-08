import { createPublicClient, http, type Address, type Hex, type Transport } from "viem";
import { bsc } from "viem/chains";

export const DEFAULT_BSC_RPC_URL = "https://bsc-dataseed.bnbchain.org";

const CHAIN_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "authorizationState", stateMutability: "view", inputs: [{ name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "uiMultiplier", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

export interface ChainReader {
  balanceOf(token: Address, owner: Address): Promise<bigint>;
  allowance(token: Address, owner: Address, spender: Address): Promise<bigint>;
  authorizationState(token: Address, authorizer: Address, nonce: Hex): Promise<boolean>;
  uiMultiplier(token: Address): Promise<bigint>;
  nativeBalance(address: Address): Promise<bigint>;
  pendingNonce(address: Address): Promise<number>;
  waitForReceipt(hash: Hex, timeoutMs: number): Promise<{ status: "success" | "reverted"; blockNumber: bigint }>;
}

export function createChainReader(options?: { rpcUrl?: string; transport?: Transport; pollMs?: number }): ChainReader {
  const client = createPublicClient({
    chain: bsc,
    transport: options?.transport ?? http(options?.rpcUrl ?? DEFAULT_BSC_RPC_URL),
  });
  const pollMs = options?.pollMs ?? 1000;
  return {
    balanceOf: (token, owner) => client.readContract({ address: token, abi: CHAIN_ABI, functionName: "balanceOf", args: [owner] }),
    allowance: (token, owner, spender) =>
      client.readContract({ address: token, abi: CHAIN_ABI, functionName: "allowance", args: [owner, spender] }),
    authorizationState: (token, authorizer, nonce) =>
      client.readContract({ address: token, abi: CHAIN_ABI, functionName: "authorizationState", args: [authorizer, nonce] }),
    uiMultiplier: (token) => client.readContract({ address: token, abi: CHAIN_ABI, functionName: "uiMultiplier" }),
    nativeBalance: (address) => client.getBalance({ address }),
    async pendingNonce(address) {
      const hex = await client.request({ method: "eth_getTransactionCount", params: [address, "pending"] });
      return Number(BigInt(hex));
    },
    async waitForReceipt(hash, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const receipt = (await client.request({ method: "eth_getTransactionReceipt", params: [hash] })) as
          | { status?: string | null; blockNumber?: string | null }
          | null;
        if (receipt && receipt.blockNumber) {
          return { status: receipt.status === "0x1" ? "success" : "reverted", blockNumber: BigInt(receipt.blockNumber) };
        }
        if (Date.now() >= deadline) {
          throw new Error(`receipt timeout for ${hash}`);
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
    },
  };
}
