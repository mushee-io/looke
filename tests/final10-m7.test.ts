import assert from "node:assert/strict";
import {test} from "node:test";
import {getAddress,decodeFunctionData,type Address} from "viem";
import {type SwapQuote,type MarketSnapshot,v2RouterAbi} from "../src/lib/trading";
import {
 parseM7Manifest,quoteTokenAllowlist,assertM7MarketIdentity,
 m7ReviewEnabled,m7UnsignedSwapData,prepareM7WalletReview,
 assertM7HistoricalProof,M7_EXECUTION_APPROVED,M7_APPROVALS_APPROVED,
 M7_LIQUIDITY_APPROVED,M7_PUBLIC_BETA
} from "../src/lib/experience/m7-market-policy";
import {validateM6CreatorPreview} from "../src/lib/experience/m6-creator";
const addr=(n:string)=>getAddress("0x"+n.repeat(40));
const owner=addr("1"),base=addr("2"),ultra=addr("3"),looke=addr("4"),router=addr("5"),pair=addr("6"),factory=addr("7");
const hash="0x"+"a".repeat(64),previewId="00000000-0000-4000-8000-000000000010";
const meta="ipfs://bafybeigdyrzt5sfp7udm7hu76uhmizcmus36cybk6z52v6t37viffyzqku";
const reviewed=validateM6CreatorPreview({name:"Ultra Creator",symbol:"UCAT",pair:"ULTRA",
 metadataURI:meta,supplyTokens:"1000",clientNonce:"a".repeat(32)});
const market:MarketSnapshot={id:"ucat-ultra",baseToken:base,quoteToken:ultra,
 pair,router,factory,baseSymbol:"UCAT",quoteSymbol:"UOS",
 baseDecimals:18,quoteDecimals:18,reserveBase:"100",reserveQuote:"500",
 blockNumber:"100",poolPrice:"5"};
const now=Date.parse("2026-11-07T17:00:00.000Z");
const quote:SwapQuote={market,direction:"buy",inputToken:ultra,outputToken:base,
 inputSymbol:"UOS",outputSymbol:"UCAT",inputDecimals:18,outputDecimals:18,
 inputAmount:"1",amountIn:"1000000000000000000",amountOut:"200000000000000000",
 minOut:"199000000000000000",minOutFormatted:"0.199",quotedOutFormatted:"0.2",
 quotedAt:now-1000,slippageBps:50,blockNumber:"100"};
function withFlags(data:Record<string,string>,fn:()=>void){
 const old=Object.fromEntries(Object.keys(data).map(k=>[k,process.env[k]]));
 try{for(const [k,v]of Object.entries(data))process.env[k]=v;fn();}
 finally{for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
test("M7 source manifest strictly controls allowed originals, no synthetic token records",()=>{
 assert.deepEqual(parseM7Manifest(undefined),[]);
 const input={marketId:"ucat-ultra",creator:owner,previewId,creationTxHash:hash};
 assert.deepEqual(parseM7Manifest(JSON.stringify([input]))[0],{...input,creator:owner.toLowerCase()});
 for(const bad of [
  [input,input],[{...input,marketId:"../wrong"}],
  [{...input,creator:"0x"+"0".repeat(40)}],
  [{...input,creationTxHash:"0x"+"0".repeat(64)}],
  [{...input,price:"5"}],
  Array(9).fill({...input,marketId:"unique"})
 ])assert.throws(()=>parseM7Manifest(JSON.stringify(bad)));
});
test("M7 exact contract address quote binding; ULTRA/LOOKE are not inferred from symbols",()=>{
 const quotes=quoteTokenAllowlist({ultra,looke});assert.ok(quotes);
 assert.deepEqual(assertM7MarketIdentity(market,reviewed,base,quotes),{
  marketId:market.id,baseToken:base,quoteToken:ultra,quotePreference:"ULTRA",chainId:18881
 });
 assert.equal(quoteTokenAllowlist({ultra}),null);
 assert.throws(()=>quoteTokenAllowlist({ultra,looke:ultra}),/distinct/);
 assert.throws(()=>assertM7MarketIdentity({...market,quoteToken:looke},reviewed,base,quotes),/do not match/);
 assert.throws(()=>assertM7MarketIdentity({...market,reserveBase:"0"},reviewed,base,quotes),/liquidity/);
 assert.throws(()=>assertM7MarketIdentity(market,reviewed,owner,quotes),/do not match/);
 assert.throws(()=>assertM7MarketIdentity(market,{...reviewed,pair:"LOOKE"},base,quotes),/do not match/);
});
test("M7 unsigned swap calldata binds recipient, path, amounts, slippage and deadline",()=>{
 const doc=m7UnsignedSwapData(quote,owner,Math.floor(now/1000)+180,now);
 assert.equal(doc.from,owner);assert.equal(doc.to,router);assert.equal(doc.value,"0x0");
 assert.equal(doc.tradeSubmitted,false);assert.equal(doc.approvalSubmitted,false);
 assert.equal(doc.gasEstimate,"not verified");
 const decoded=decodeFunctionData({abi:v2RouterAbi,data:doc.data});
 assert.equal(decoded.functionName,"swapExactTokensForTokens");
 if(decoded.functionName!=="swapExactTokensForTokens")throw Error("Unexpected");
 const [amountIn,minOut,path,recipient,deadline]=decoded.args;
 assert.equal(amountIn,BigInt(quote.amountIn));assert.equal(minOut,BigInt(quote.minOut));
 assert.deepEqual(path,[ultra,base]);assert.equal(recipient,owner);
 assert.equal(deadline,BigInt(Math.floor(now/1000)+180));
 for(const invalid of [
  {...quote,slippageBps:999},
  {...quote,quotedAt:now-60_000},
  {...quote,quotedAt:now+10_000},
  {...quote,amountIn:"0"},
  {...quote,amountOut:"1"},
  {...quote,inputToken:looke},
  {...quote,direction:"sell" as const},
 ])assert.throws(()=>m7UnsignedSwapData(invalid,owner,Math.floor(now/1000)+180,now));
 for(const seconds of [Math.floor(now/1000)-2,Math.floor(now/1000)+20,Math.floor(now/1000)+1000])
  assert.throws(()=>m7UnsignedSwapData(quote,owner,seconds,now),/deadline/);
});
test("M7 account and chain switching fail closed; never request wallet approval/signature",async()=>{
 const calls:string[]=[];
 const wallet={request:async({method}:{method:string})=>{
  calls.push(method);return method==="eth_chainId"?"0x49c1":[owner];
 }};
 const result=await prepareM7WalletReview(wallet,owner,quote,Math.floor(now/1000)+180,now);
 assert.equal(result.tradeSubmitted,false);assert.deepEqual(calls,["eth_chainId","eth_accounts","eth_chainId"]);
 assert.ok(!calls.some(x=>/sendTransaction|sign|approve/.test(x)));
 await assert.rejects(()=>prepareM7WalletReview(wallet,base,quote,Math.floor(now/1000)+180,now),/account changed/);
 const wrong={request:async({method}:{method:string})=>method==="eth_chainId"?"0x4e17":[owner]};
 await assert.rejects(()=>prepareM7WalletReview(wrong,owner,quote,Math.floor(now/1000)+180,now),/Testnet/);
});
test("M7 past receipt is not verified unless it matches owner's original review and confirmation time",()=>{
 const intent={marketId:market.id,owner,direction:"buy" as const,
  amountIn:quote.amountIn,minimumOutput:quote.minOut,router,pair,
  quotedAt:new Date(now-1000),expiresAt:new Date(now+180_000)};
 const proof={marketId:market.id,direction:"buy" as const,account:owner,
  router,pair,inputAmount:quote.amountIn,minimumOutput:quote.minOut,
  actualOutput:quote.amountOut};
 assert.equal(assertM7HistoricalProof(intent,proof,Math.floor((now+50_000)/1000)),true);
 for(const p of [
  {...proof,account:base},{...proof,router:factory},{...proof,pair:router},
  {...proof,inputAmount:"2"},{...proof,minimumOutput:"1"},
  {...proof,actualOutput:"1"},{...proof,direction:"sell" as const}
 ])assert.throws(()=>assertM7HistoricalProof(intent,p,Math.floor((now+50_000)/1000)));
 assert.throws(()=>assertM7HistoricalProof(intent,proof,Math.floor((now+190_000)/1000)),/unexpired/);
});
test("M7 all operational actions remain NO-GO even with review metadata flag",()=>{
 assert.equal(M7_EXECUTION_APPROVED,false);assert.equal(M7_APPROVALS_APPROVED,false);
 assert.equal(M7_LIQUIDITY_APPROVED,false);assert.equal(M7_PUBLIC_BETA,false);
 const flags={LOOKE_M7_MARKET_REVIEW_WRITES_ENABLED:"true",
  LOOKE_M2_IDENTITY_WRITES_ENABLED:"true",LOOKE_M3_SOCIAL_WRITES_ENABLED:"true",
  LOOKE_PUBLIC_BETA_ENABLED:"false",VERCEL_ENV:"preview",NODE_ENV:"production"};
 withFlags(flags,()=>assert.equal(m7ReviewEnabled(),true));
 for(const [name,value] of [
  ["LOOKE_M7_MARKET_REVIEW_WRITES_ENABLED","false"],
  ["LOOKE_M2_IDENTITY_WRITES_ENABLED","false"],
  ["LOOKE_M3_SOCIAL_WRITES_ENABLED","false"],
  ["LOOKE_PUBLIC_BETA_ENABLED","true"],["VERCEL_ENV","production"]
 ])withFlags({...flags,[name]:value},()=>assert.equal(m7ReviewEnabled(),false,name));
});
