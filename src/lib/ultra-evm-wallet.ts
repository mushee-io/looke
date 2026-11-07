/** Looke M1: EVM-only wallet connection. Ultra Native, Base and BNB do not
 * participate in the active application. Never sends on-chain transactions.
 */
import {getAddress,isAddress} from "viem";
import {isLookeTestnetChain,ULTRA_EVM_TESTNET} from "./ultra";

export type UltraEvmWalletProvider={
 request:(args:{method:string;params?:unknown[]})=>Promise<unknown>;
 on?:(event:string,listener:(...args:unknown[])=>void)=>void;
 removeListener?:(event:string,listener:(...args:unknown[])=>void)=>void;
};
function chainErrorCode(value:unknown):number|null{
 if(typeof value!=="object"||value===null)return null;
 const code=(value as {code?:unknown}).code;
 return typeof code==="number"?code:null;
}
export async function requireUltraEvmTestnet(wallet:UltraEvmWalletProvider){
 const actual=await wallet.request({method:"eth_chainId"});
 if(!isLookeTestnetChain(actual))
  throw new Error("Ultra EVM Testnet (18881) is required. Base, BNB and Mainnet operations are blocked.");
}
export async function ensureUltraEvmTestnet(wallet:UltraEvmWalletProvider){
 if(isLookeTestnetChain(await wallet.request({method:"eth_chainId"})))return;
 try{
  await wallet.request({method:"wallet_switchEthereumChain",params:[{chainId:ULTRA_EVM_TESTNET.chainIdHex}]});
 }catch(error){
  if(chainErrorCode(error)!==4902)throw error;
  await wallet.request({method:"wallet_addEthereumChain",params:[{
   chainId:ULTRA_EVM_TESTNET.chainIdHex,
   chainName:ULTRA_EVM_TESTNET.chainName,
   rpcUrls:[...ULTRA_EVM_TESTNET.rpcUrls],
   blockExplorerUrls:[ULTRA_EVM_TESTNET.explorer],
   nativeCurrency:ULTRA_EVM_TESTNET.nativeCurrency,
  }]});
  if(!isLookeTestnetChain(await wallet.request({method:"eth_chainId"}))){
   await wallet.request({method:"wallet_switchEthereumChain",
    params:[{chainId:ULTRA_EVM_TESTNET.chainIdHex}]});
  }
 }
 await requireUltraEvmTestnet(wallet); // reject ignored switches and changed providers
}
export async function connectUltraEvmWallet(wallet:UltraEvmWalletProvider):Promise<string>{
 const requested=await wallet.request({method:"eth_requestAccounts"});
 if(!Array.isArray(requested)||typeof requested[0]!=="string"||
    !isAddress(requested[0])||/^0x0{40}$/i.test(requested[0]))
  throw new Error("Connect a valid nonzero Ultra EVM account.");
 const initial=getAddress(requested[0]);
 await ensureUltraEvmTestnet(wallet);
 const granted=await wallet.request({method:"eth_accounts"});
 if(!Array.isArray(granted)||!granted.some(a=>typeof a==="string"&&
   isAddress(a)&&getAddress(a)===initial))
  throw new Error("Wallet authorization changed during network switching. Reconnect.");
 await requireUltraEvmTestnet(wallet);
 return initial;
}
