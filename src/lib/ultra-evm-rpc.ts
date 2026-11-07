/** M1 Ultra EVM RPC status. Official fixed endpoints, read-only requests only.
 * No arbitrary wallet/RPC URL, no transaction, no mainnet action.
 */
import {ULTRA_EVM_MAINNET,ULTRA_EVM_TESTNET} from "./ultra";
export type EvmProbe={chainId:number;name:string;rpc:string;explorer:string;
 status:"verified"|"unavailable";observedChainId:number|null;latestBlock:string|null;
 writesAllowed:false};
export async function probeUltraEvm(
 which:"testnet"|"mainnet",fetcher:typeof fetch=fetch
):Promise<EvmProbe>{
 const network=which==="testnet"?ULTRA_EVM_TESTNET:ULTRA_EVM_MAINNET;
 const base={chainId:network.chainId,name:network.chainName,rpc:network.rpcUrls[0],
  explorer:network.explorer,writesAllowed:false as const};
 try{
  async function call(method:"eth_chainId"|"eth_blockNumber"){
   const response=await fetcher(network.rpcUrls[0],{
    method:"POST",redirect:"error",cache:"no-store",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,params:[]}),
    signal:AbortSignal.timeout(7000),
   });
   if(!response.ok)throw Error("RPC status is not successful.");
   const data=await response.json() as {result?:unknown;error?:unknown;jsonrpc?:string};
   if(data.error||data.jsonrpc!=="2.0"||typeof data.result!=="string"||
      !/^0x[0-9a-f]+$/i.test(data.result))
     throw Error("RPC result invalid.");
   return data.result;
  }
  const chain=Number.parseInt(await call("eth_chainId"),16);
  if(chain!==network.chainId)throw Error("Wrong chain returned by RPC.");
  const blockHex=await call("eth_blockNumber");
  const block=BigInt(blockHex);
  if(block<=0n)throw Error("No observed blocks.");
  return {...base,status:"verified" as const,observedChainId:chain,latestBlock:block.toString()};
 }catch{
  return {...base,status:"unavailable" as const,observedChainId:null,latestBlock:null};
 }
}
