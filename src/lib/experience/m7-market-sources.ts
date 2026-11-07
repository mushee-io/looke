import "server-only";
/** M7 only returns markets when original Ultra-18881 creator issuance AND
 * independent operator allowlisted V2 pool+quote token sources are checked.
 * Empty configuration means explicit NO-GO, never synthetic prices.
 */
import {getAddress} from "viem";
import {registeredMarkets,verifiedMarket,recentSwaps,quotedTrade} from "../trading-server";
import {exactOnChainHolders} from "../ops/m13-metrics";
import {query} from "../social/db";
import {m6ReadOnlyClient,m6ConfiguredFactory,verifyM6Factory,verifyM6CoinReceipt} from "./m6-chain-proof";
import {validateM6CreatorPreview} from "./m6-creator";
import {parseM7Manifest,quoteTokenAllowlist,assertM7MarketIdentity} from "./m7-market-policy";
import {assertConfirmations} from "../verification";

export function m7SourceConfig(){
 if(process.env.LOOKE_M7_OPERATOR_SOURCE_APPROVED!=="true")return null;
 const manifest=parseM7Manifest(process.env.LOOKE_M7_MARKET_PROOFS_JSON);
 const quotes=quoteTokenAllowlist({
  ultra:process.env.LOOKE_M7_ULTRA_QUOTE_TOKEN,looke:process.env.LOOKE_M7_LOOKE_QUOTE_TOKEN
 });
 const factory=m6ConfiguredFactory();
 const registered=registeredMarkets();
 if(!manifest.length||!quotes||!factory||!registered.length)return null;
 if(manifest.some(m=>!registered.some(x=>x.id===m.marketId)))
  throw Error("M7 manifests include unknown market identifiers.");
 return {manifest,quotes,factory,registered};
}
export async function m7VerifiedMarket(id:string){
 if(!/^[a-z0-9][a-z0-9-]{0,31}$/.test(id))throw Error("Invalid market id.");
 const config=m7SourceConfig();
 if(!config)throw Error("Original M6 factory/creator receipts, ULTRA/LOOKE quote token addresses and independently reviewed market provenance are not configured.");
 const entry=config.manifest.find(x=>x.marketId===id);
 if(!entry)throw Error("Market not included in independently reviewed M7 creator evidence.");
 const [snapshot,previewRow]=await Promise.all([
  verifiedMarket(id),
  query<{name:string;symbol:string;metadata_uri:string;supply_tokens:string;
   client_nonce:string;quote_preference:"ULTRA"|"LOOKE"}>(
   `SELECT name,symbol,metadata_uri,supply_tokens,client_nonce,quote_preference
    FROM social_creator_deployment_previews WHERE id=$1 AND owner=$2
    AND status='prepared'`,[entry.previewId,entry.creator])
 ]);
 if(previewRow.rowCount!==1)throw Error("Missing original owner-scoped M6 signed creator draft.");
 const p=previewRow.rows[0];
 const reviewed=validateM6CreatorPreview({
  name:p.name,symbol:p.symbol,metadataURI:p.metadata_uri,
  supplyTokens:p.supply_tokens,pair:p.quote_preference,clientNonce:p.client_nonce
 });
 const client=m6ReadOnlyClient();
 const factory=await verifyM6Factory(client,config.factory);
 const creation=await verifyM6CoinReceipt(client,factory,entry.creator,entry.creationTxHash,reviewed);
 const marketIdentity=assertM7MarketIdentity(snapshot,reviewed,creation.token,config.quotes);
 const receipt=await client.getTransactionReceipt({hash:entry.creationTxHash as `0x${string}`});
 const [block,head]=await Promise.all([
  client.getBlock({blockNumber:receipt.blockNumber}),client.getBlockNumber()
 ]);
 if(!block.hash||block.hash.toLowerCase()!==receipt.blockHash.toLowerCase())
  throw Error("Creator receipt does not match an original canonical Ultra Testnet block.");
 assertConfirmations(receipt.blockNumber,head,2);
 const finalized=head>2n?head-2n:0n;
 const holders=finalized>=receipt.blockNumber
  ?await exactOnChainHolders(snapshot.baseToken,receipt.blockNumber,finalized):null;
 return {snapshot,marketIdentity,creation,holderCount:holders,
  source:"original-ultra-evm-testnet-contract-reads" as const,
  originBlock:receipt.blockNumber.toString(),originTime:new Date(Number(block.timestamp)*1000).toISOString(),
  indexCoverage:"only-configured-verified-markets" as const};
}
export async function m7VerifiedMarketFeed(){
 const config=m7SourceConfig();
 if(!config)return {status:"blocked" as const,chainId:18881 as const,
  markets:[] as unknown[],errors:["Original factory, market receipts, reviewed ULTRA/LOOKE quote tokens and source approval not configured."],
  tradesSubmitted:0,marketsInvented:0};
 const results=await Promise.allSettled(config.manifest.map(m=>m7VerifiedMarket(m.marketId)));
 const markets:Awaited<ReturnType<typeof m7VerifiedMarket>>[]=[],errors:string[]=[];
 results.forEach((r,i)=>{if(r.status==="fulfilled")markets.push(r.value);
 else errors.push(config.manifest[i].marketId+": original on-chain provenance or database proof unavailable.");});
 return {status:markets.length?"verified":"blocked",chainId:18881 as const,
  markets,errors,tradesSubmitted:0,marketsInvented:0};
}
export async function m7VerifiedMarketActivity(id:string,interval:300|900|3600){
 await m7VerifiedMarket(id);
 return recentSwaps(id,interval);
}
export async function m7VerifiedQuote(id:string,side:"buy"|"sell",amount:string,slippage:number){
 const source=await m7VerifiedMarket(id);
 const quote=await quotedTrade(id,side,amount,slippage);
 if(quote.market.id!==source.snapshot.id||
   quote.market.pair.toLowerCase()!==source.snapshot.pair.toLowerCase()||
   quote.market.router.toLowerCase()!==source.snapshot.router.toLowerCase()||
   getAddress(quote.market.quoteToken)!==getAddress(source.snapshot.quoteToken))
  throw Error("Fresh quote is not from the original verified market.");
 return {source,quote};
}
