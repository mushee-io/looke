/** M2 Ultra EVM-only owner-bound identity; no transactions. */
import { getAddress, isAddress } from "viem";
import { requireUltraEvmTestnet, type UltraEvmWalletProvider } from "../ultra-evm-wallet";
import { handle } from "./validation";
const reserved = new Set(["admin","administrator","support","security","moderator",
  "official","staff","help","team","system","root","looke","looke_io",
  "looke_social","looke_support","ultra","ultra_io","ultra_support"]);
export function handlePolicy(value:string) {
  const normalized=handle.parse(value);
  return {handle:normalized,reserved:reserved.has(normalized) ||
    normalized.startsWith("looke_") || normalized.startsWith("ultra_")};
}
/** Verify selected account both before and after signing; fail closed on any chain switch. */
export async function assertActiveUltraEvmAccount(wallet:UltraEvmWalletProvider,expected:string):Promise<string>{
  if(!isAddress(expected)||/^0x0{40}$/i.test(expected))throw new Error("A valid nonzero EVM account is required.");
  await requireUltraEvmTestnet(wallet);
  const accounts=await wallet.request({method:"eth_accounts"});
  if(!Array.isArray(accounts)||typeof accounts[0]!=="string"||
     !isAddress(accounts[0])||getAddress(accounts[0])!==getAddress(expected))
    throw new Error("Selected wallet account changed. Reconnect and sign in again.");
  await requireUltraEvmTestnet(wallet);
  return getAddress(expected);
}
