/** M8: read-only, owner-scoped ERC-20 balances and bounded transfer activity.
 * Assets must already pass M6/M7 original-source validation before these calls.
 * No token estimates, private keys, wallet requests, approvals or transactions.
 */
import {formatUnits,getAddress,isAddress,type Address,type Hash} from "viem";
import {erc20Abi} from "../trading";
import {assertUltraTestnet,assertConfirmations,type UltraPublicClient} from "../verification";
export type M8Asset={token:Address;marketIds:string[];kind:"creator"|"quote"};
export function m8MarketAssetList(markets:{snapshot:{id:string;baseToken:Address;quoteToken:Address}}[]):M8Asset[]{
 if(markets.length<1||markets.length>8)throw Error("Only 1–8 independently verified markets are supported.");
 const items=new Map<string,M8Asset>();
 for(const m of markets){
  if(!/^[a-z0-9][a-z0-9-]{0,31}$/.test(m.snapshot.id))throw Error("Market has invalid identifier.");
  for(const [token,kind] of [[m.snapshot.baseToken,"creator"],[m.snapshot.quoteToken,"quote"]] as const){
   if(!isAddress(token)||/^0x0{40}$/i.test(token))throw Error("Zero/unverified ERC-20 address.");
   const addr=getAddress(token),key=addr.toLowerCase(),old=items.get(key);
   if(old){old.marketIds.push(m.snapshot.id);continue;}
   items.set(key,{token:addr,kind,marketIds:[m.snapshot.id]});
  }
 }
 return [...items.values()];
}
export async function m8ReadConfirmedBalances(client:UltraPublicClient,owner:string,assets:M8Asset[],now=Date.now()){
 if(!isAddress(owner)||/^0x0{40}$/i.test(owner))throw Error("Signed-in wallet required.");
 if(!Number.isFinite(now)||assets.length<1||assets.length>16)throw Error("Missing approved token manifests.");
 await assertUltraTestnet(client);
 const head=await client.getBlockNumber();
 if(head<3n)throw Error("No finalized Ultra EVM Testnet block.");
 const finalized=head-2n;
 const block=await client.getBlock({blockNumber:finalized});
 if(!block.hash||Math.abs(now-Number(block.timestamp)*1000)>10*60_000)
  throw Error("Canonical Ultra EVM Testnet block missing or stale.");
 const wallet=getAddress(owner);
 const tokens=await Promise.all(assets.map(async a=>{
  const [code,decimals,symbol,balance]=await Promise.all([
   client.getBytecode({address:a.token,blockNumber:finalized}),
   client.readContract({address:a.token,abi:erc20Abi,functionName:"decimals",blockNumber:finalized}),
   client.readContract({address:a.token,abi:erc20Abi,functionName:"symbol",blockNumber:finalized}),
   client.readContract({address:a.token,abi:erc20Abi,functionName:"balanceOf",args:[wallet],blockNumber:finalized})
  ]);
  if(!code||code==="0x"||decimals>18||!(/^[A-Za-z0-9_.-]{1,24}$/).test(symbol)||
     typeof balance!=="bigint"||balance<0n)
    throw Error("ERC-20 balance evidence missing, malformed or inconsistent.");
  return {token:a.token,kind:a.kind,marketIds:a.marketIds,symbol,
   decimals,balanceBaseUnits:balance.toString(),
   balanceTokens:formatUnits(balance,decimals),
   fiatValue:null,quoteValue:null,sourceBlock:finalized.toString()};
 }));
 return {chainId:18881 as const,account:wallet,blockNumber:finalized.toString(),
  blockHash:block.hash,observedAt:new Date(Number(block.timestamp)*1000).toISOString(),
  assets:tokens,allHoldingsDiscovered:false,priceValuationVerified:false,
  transactionsSent:0,approvalTransactionsSent:0,
  note:"Balances are genuine at one finalized block ONLY for explicitly verified market assets. Unlisted assets and monetary values are unknown, not zero."};
}
export async function m8ReadConfirmedTransfers(client:UltraPublicClient,owner:string,assets:M8Asset[],now=Date.now()){
 if(!isAddress(owner)||/^0x0{40}$/i.test(owner)||assets.length<1||assets.length>16)
  throw Error("Invalid scoped owner or original verified assets.");
 await assertUltraTestnet(client);
 const head=await client.getBlockNumber();
 if(head<3n)throw Error("No finalized chain available.");
 const to=head-2n,from=to>299n?to-299n:0n,account=getAddress(owner);
 const results: Array<{
  token:Address;txHash:Hash;logIndex:number;blockNumber:bigint;
  blockHash:Hash;from:Address;to:Address;value:bigint
 }>=[];
 for(const asset of assets){
  for(const key of ["from","to"] as const){
   const logs=await client.getLogs({address:asset.token,event:erc20Abi[5],
    args:{[key]:account},fromBlock:from,toBlock:to});
   if(results.length+logs.length>60)throw Error("Transfer scan cap exceeded. Activity unavailable; no partial count claimed.");
   for(const log of logs){
    if(!log.transactionHash||log.blockNumber===null||!log.blockHash||
       log.logIndex===null||!log.args.from||!log.args.to||log.args.value===undefined)
      throw Error("Original Transfer log lacks canonical event identity.");
    const entry={
     token:asset.token,txHash:log.transactionHash,logIndex:log.logIndex,
     blockNumber:log.blockNumber,blockHash:log.blockHash,
     from:getAddress(log.args.from),to:getAddress(log.args.to),value:log.args.value
    };
    if(entry.from!==account&&entry.to!==account)throw Error("Cross-owner transfer was injected.");
    if(!results.some(x=>x.txHash===entry.txHash&&x.logIndex===entry.logIndex&&x.token===entry.token))
     results.push(entry);
   }
  }
 }
 const checked=await Promise.all(results.map(async item=>{
  const [receipt,block]=await Promise.all([
   client.getTransactionReceipt({hash:item.txHash}),
   client.getBlock({blockNumber:item.blockNumber})
  ]);
  assertConfirmations(item.blockNumber,head);
  if(receipt.status!=="success"||receipt.blockNumber!==item.blockNumber||
     receipt.blockHash.toLowerCase()!==item.blockHash.toLowerCase()||
     block.hash?.toLowerCase()!==item.blockHash.toLowerCase()||
     receipt.transactionHash.toLowerCase()!==item.txHash.toLowerCase()||
     !receipt.logs.some(l=>l.logIndex===item.logIndex&&
       getAddress(l.address)===item.token&&l.transactionHash===item.txHash))
    throw Error("Transfer log is not present in original canonical confirmed transaction.");
  if(Math.abs(now-Number(block.timestamp)*1000)>365*86400_000)
   throw Error("Original Transfer block timestamp outside approved bounded evidence window.");
  return {token:item.token,transactionHash:item.txHash,logIndex:item.logIndex,
   direction:item.from===account&&item.to===account?"self":
      item.to===account?"received":"sent",
   from:item.from,to:item.to,amountBaseUnits:item.value.toString(),
   timestamp:new Date(Number(block.timestamp)*1000).toISOString(),
   blockNumber:item.blockNumber.toString(),blockHash:item.blockHash};
 }));
 return {chainId:18881 as const,owner:account,fromBlock:from.toString(),
  throughBlock:to.toString(),transfers:checked.sort((a,b)=>
   Number(BigInt(b.blockNumber)-BigInt(a.blockNumber))||b.logIndex-a.logIndex).slice(0,40),
  completeHistory:false,blockRangeComplete:true,source:"canonical-finalized-erc20-transfers",
  claimableRewards:false,txBroadcasted:false};
}
