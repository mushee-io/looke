/** Final10 M7: market-source allowlist and unsigned reviews. No swaps or approval calls. */
import {encodeFunctionData,getAddress,isAddress,type Address} from "viem";
import {z} from "zod";
import {type SwapQuote,validateSlippage,QUOTE_MAX_AGE_MS,v2RouterAbi,type MarketSnapshot} from "../trading";
import {assertActiveUltraEvmAccount} from "../social/m2-identity";
import {type UltraEvmWalletProvider} from "../ultra-evm-wallet";
import type {M6Preview} from "./m6-creator";

export const M7_EXECUTION_APPROVED=false as const;
export const M7_APPROVALS_APPROVED=false as const;
export const M7_LIQUIDITY_APPROVED=false as const;
export const M7_PUBLIC_BETA=false as const;
const id=z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/);
const addr=z.string().refine(v=>isAddress(v)&&!/^0x0{40}$/i.test(v),"Nonzero EVM address required");
const hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine(v=>!/^0x0{64}$/i.test(v),"Nonzero hash required");
const manifest=z.object({
 marketId:id, creator:addr, previewId:z.string().uuid(),
 creationTxHash:hash
}).strict();
export type M7Manifest=ReturnType<typeof parseM7Manifest>[number];
export function parseM7Manifest(raw:string|undefined){
 if(!raw?.trim())return [];
 const entries=z.array(manifest).max(8).parse(JSON.parse(raw));
 if(new Set(entries.map(x=>x.marketId)).size!==entries.length)
  throw Error("Duplicate M7 market source.");
 return entries.map(x=>({...x,creator:getAddress(x.creator).toLowerCase()}));
}
export function quoteTokenAllowlist(input:{ultra?:string;looke?:string}):{ULTRA:Address;LOOKE:Address}|null{
 if(!input.ultra||!input.looke)return null;
 const u=addr.parse(input.ultra),l=addr.parse(input.looke);
 if(getAddress(u)===getAddress(l))throw Error("ULTRA and LOOKE quote contracts must be distinct.");
 return {ULTRA:getAddress(u),LOOKE:getAddress(l)};
}
export function assertM7MarketIdentity(
 m:MarketSnapshot,preview:M6Preview,token:Address,quotes:NonNullable<ReturnType<typeof quoteTokenAllowlist>>,
){
 if(preview.chainId!==18881||getAddress(m.baseToken)!==getAddress(token)||
    getAddress(m.quoteToken)!==getAddress(quotes[preview.pair]))
  throw Error("Verified creator and ULTRA/LOOKE quote token do not match the allowlist.");
 if(BigInt(m.blockNumber)<1n||!Number.isFinite(Number(m.poolPrice))||
   Number(m.poolPrice)<=0||Number(m.reserveBase)<=0||Number(m.reserveQuote)<=0)
  throw Error("Market lacks positive on-chain liquidity evidence.");
 return {marketId:m.id,baseToken:m.baseToken,quoteToken:m.quoteToken,
  quotePreference:preview.pair as "ULTRA"|"LOOKE",chainId:18881 as const};
}
export function m7ReviewEnabled(){
 return process.env.LOOKE_M7_MARKET_REVIEW_WRITES_ENABLED==="true" &&
    process.env.LOOKE_M2_IDENTITY_WRITES_ENABLED==="true" &&
    process.env.LOOKE_M3_SOCIAL_WRITES_ENABLED==="true" &&
    process.env.LOOKE_PUBLIC_BETA_ENABLED!=="true" &&
    (process.env.VERCEL_ENV==="preview"||process.env.NODE_ENV!=="production");
}
/** Generated calldata is a review artifact, not a signature or tx broadcast.
 * Fee/gas and allowances remain unverified until a separate audited wallet flow.
 */
export function m7UnsignedSwapData(
 quote:SwapQuote,owner:string,deadlineSeconds:number,nowMs:number
){
 if(!isAddress(owner)||/^0x0{40}$/i.test(owner))throw Error("Wallet owner required.");
 validateSlippage(quote.slippageBps);
 if(!Number.isSafeInteger(deadlineSeconds)||
   deadlineSeconds<=Math.floor(nowMs/1000)+60 ||
   deadlineSeconds>Math.floor(nowMs/1000)+600)
  throw Error("Swap deadline must be 1–10 minutes in the future.");
 if(!Number.isSafeInteger(quote.quotedAt)||
   quote.quotedAt>nowMs+2000||nowMs-quote.quotedAt>QUOTE_MAX_AGE_MS)
  throw Error("Stale or future-dated quote.");
 if(quote.direction!=="buy"&&quote.direction!=="sell")throw Error("Invalid direction.");
 if(BigInt(quote.amountIn)<=0n||BigInt(quote.minOut)<=0n||
   BigInt(quote.amountOut)<BigInt(quote.minOut))
  throw Error("Invalid original quote amounts.");
 const path=quote.direction==="buy"
  ?[quote.market.quoteToken,quote.market.baseToken]
  :[quote.market.baseToken,quote.market.quoteToken];
 if(getAddress(quote.inputToken)!==getAddress(path[0])||
   getAddress(quote.outputToken)!==getAddress(path[1]))
  throw Error("Quote path mismatches side and market.");
 const from=getAddress(owner);
 return {from,to:getAddress(quote.market.router),chainId:18881 as const,value:"0x0" as const,
  data:encodeFunctionData({abi:v2RouterAbi,functionName:"swapExactTokensForTokens",
   args:[BigInt(quote.amountIn),BigInt(quote.minOut),path,from,BigInt(deadlineSeconds)]}),
  tradeSubmitted:false as const,approvalSubmitted:false as const,
  platformFee:"not verified" as const,gasEstimate:"not verified" as const};
}
export async function prepareM7WalletReview(
 wallet:UltraEvmWalletProvider,owner:string,quote:SwapQuote,deadlineSeconds:number,nowMs:number
){
 await assertActiveUltraEvmAccount(wallet,owner);
 return m7UnsignedSwapData(quote,owner,deadlineSeconds,nowMs);
}
export type M7OriginalIntent={marketId:string;owner:string;direction:"buy"|"sell";
 amountIn:string;minimumOutput:string;router:string;pair:string;quotedAt:Date;expiresAt:Date};
export function assertM7HistoricalProof(
 intent:M7OriginalIntent,proof:{marketId:string;direction:"buy"|"sell";account:string;
 router:string;pair:string;inputAmount:string;minimumOutput:string;actualOutput:string},
 confirmedBlockTimeSeconds:number,
){
 if(proof.marketId!==intent.marketId||proof.direction!==intent.direction||
   getAddress(proof.account)!==getAddress(intent.owner)||
   getAddress(proof.router)!==getAddress(intent.router)||
   getAddress(proof.pair)!==getAddress(intent.pair)||
   BigInt(proof.inputAmount)!==BigInt(intent.amountIn)||
   BigInt(proof.minimumOutput)<BigInt(intent.minimumOutput)||
   BigInt(proof.actualOutput)<BigInt(intent.minimumOutput)||
   confirmedBlockTimeSeconds*1000<intent.quotedAt.getTime()||
   confirmedBlockTimeSeconds*1000>intent.expiresAt.getTime())
  throw Error("Historical wallet swap proof does not match this unexpired signed-in owner review.");
 return true;
}
