import assert from "node:assert/strict";
import {test} from "node:test";
import {getAddress, type Address,type Hash} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {m8GameStatement,verifyM8GameEvidence,m8GameStagingEnabled,
 M8_GAME_CREDIT_ENABLED,M8_POINTS_CONVERSION_ENABLED,
 M8_AIRDROP_ENABLED,M8_VESTING_CLAIM_ENABLED} from "../src/lib/experience/m8-game-evidence";
import {m8MarketAssetList,m8ReadConfirmedBalances,m8ReadConfirmedTransfers}
 from "../src/lib/experience/m8-portfolio";
import type {UltraPublicClient} from "../src/lib/verification";
const account=privateKeyToAccount(("0x"+"1".repeat(64)) as Hash);
const issuer=privateKeyToAccount(("0x"+"2".repeat(64)) as Hash);
const reviewer=privateKeyToAccount(("0x"+"3".repeat(64)) as Hash);
const stranger=privateKeyToAccount(("0x"+"4".repeat(64)) as Hash);
const addr=(x:string)=>getAddress("0x"+x.repeat(40));
const token=addr("7"),quote=addr("8"),blockHash=("0x"+"a".repeat(64)) as Hash;
function withEnv(vars:Record<string,string|undefined>,fn:()=>void|Promise<void>){
 const before=Object.fromEntries(Object.keys(vars).map(k=>[k,process.env[k]]));
 const restore=()=>{for(const [k,v]of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v;};
 for(const [k,v]of Object.entries(vars))if(v===undefined)delete process.env[k];else process.env[k]=v;
 return Promise.resolve().then(fn).finally(restore);
}
const env={
 LOOKE_M8_SOURCE_AUDIT_APPROVED:"true",
 LOOKE_M8_SOURCE_SLUG:"ultra-rush",
 LOOKE_M8_SOURCE_ISSUER:issuer.address,
 LOOKE_M8_INDEPENDENT_REVIEWER:reviewer.address,
 LOOKE_M8_GAME_IMPORT_STAGE_ENABLED:"true",
 LOOKE_M2_IDENTITY_WRITES_ENABLED:"true",
 LOOKE_PUBLIC_BETA_ENABLED:"false",VERCEL_ENV:"preview"
};
const at="2026-11-07T17:20:00.000Z",now=Date.parse(at);
const claim={source:"ultra-rush",eventId:"game-proof-001",owner:account.address,
 sourceIdentityHash:("0x"+"a".repeat(64)),sourceRecordHash:("0x"+"b".repeat(64)),
 seasonId:"10000000-0000-4000-8000-000000000001",points:80,
 occurredAt:"2026-11-07T16:00:00.000Z",issuedAt:"2026-11-07T17:19:00.000Z",
 expiresAt:"2026-11-07T17:23:00.000Z",nonce:"c".repeat(32)};
test("M8 double independent signatures bind game event to precise owner/origin, but never credit points",async()=>{
 await withEnv(env,async()=>{
  const statement=m8GameStatement(claim,"http://localhost:3000");
  const original={...claim,issuerSignature:await issuer.signMessage({message:statement}),
   reviewerSignature:await reviewer.signMessage({message:statement})};
  const result=await verifyM8GameEvidence(original,account.address,"http://localhost:3000",now);
  assert.equal(result.status,"quarantined");assert.equal(result.pointsCredited,0);
  assert.equal(result.independentlyAuditedOriginalRecord,false);
  assert.match(result.attestationHash,/^[0-9a-f]{64}$/);
  await assert.rejects(()=>verifyM8GameEvidence({...original,points:81},account.address,"http://localhost:3000",now),/attestation/);
  await assert.rejects(()=>verifyM8GameEvidence(original,stranger.address,"http://localhost:3000",now),/signed-in owner/);
  await assert.rejects(()=>verifyM8GameEvidence(original,account.address,"https://evil.example",now),/attestation/);
  await assert.rejects(()=>verifyM8GameEvidence(original,account.address,"http://localhost:3000",now+60_0000),/expiry/);
  await assert.rejects(()=>verifyM8GameEvidence({...original,reviewerSignature:original.issuerSignature},account.address,"http://localhost:3000",now),/attestation/);
 });
 assert.equal(M8_GAME_CREDIT_ENABLED,false);
 assert.equal(M8_POINTS_CONVERSION_ENABLED,false);
 assert.equal(M8_AIRDROP_ENABLED,false);
 assert.equal(M8_VESTING_CLAIM_ENABLED,false);
});
test("M8 staging gate denies missing independent source, public beta and production",async()=>{
 await withEnv(env,async()=>assert.equal(m8GameStagingEnabled(),true));
 for(const [key,value] of [
  ["LOOKE_M8_GAME_IMPORT_STAGE_ENABLED","false"],
  ["LOOKE_M8_SOURCE_AUDIT_APPROVED","false"],
  ["LOOKE_M8_INDEPENDENT_REVIEWER",issuer.address],
  ["LOOKE_M2_IDENTITY_WRITES_ENABLED","false"],
  ["LOOKE_PUBLIC_BETA_ENABLED","true"],
  ["VERCEL_ENV","production"],
 ]){
  await withEnv({...env,NODE_ENV:"production",[key]:value},async()=>assert.equal(m8GameStagingEnabled(),false,key));
 }
});
test("M8 deduplicates only explicitly source-verified market tokens; no guessed quote balances",()=>{
 const a=m8MarketAssetList([
  {snapshot:{id:"creator-ultra",baseToken:token,quoteToken:quote}},
  {snapshot:{id:"creator-looke",baseToken:token,quoteToken:addr("9")}}
 ]);
 assert.equal(a.length,3);assert.deepEqual(a[0].marketIds,["creator-ultra","creator-looke"]);
 assert.throws(()=>m8MarketAssetList([]),/independently verified/);
 assert.throws(()=>m8MarketAssetList([{snapshot:{id:"bad",baseToken:token,quoteToken:addr("0")}}]),/Zero/);
});
test("M8 confirmed balances use exact same finalized block, genuine zeros and no fictitious value",async()=>{
 const assets=m8MarketAssetList([{snapshot:{id:"creator-ultra",baseToken:token,quoteToken:quote}}]);
 let chain=18881,code="0x60016000";
 const calls:string[]=[];
 const client={
  getChainId:async()=>chain,getBlockNumber:async()=>100n,
  getBlock:async({blockNumber}:{blockNumber:bigint})=>({hash:blockHash,timestamp:BigInt(Math.floor(now/1000)),number:blockNumber}),
  getBytecode:async({blockNumber}:{blockNumber:bigint})=>{calls.push("code:"+blockNumber);return code;},
  readContract:async({functionName,address,blockNumber}:{functionName:string;address:Address;blockNumber:bigint})=>{
   calls.push(functionName+":"+blockNumber);
   if(functionName==="decimals")return 18;
   if(functionName==="symbol")return address===token?"CREATOR":"UOS";
   if(functionName==="balanceOf")return address===token?0n:50n*10n**18n;
   throw Error("Unexpected");
  }
 } as unknown as UltraPublicClient;
 const result=await m8ReadConfirmedBalances(client,account.address,assets,now);
 assert.equal(result.blockNumber,"98");assert.equal(result.assets[0].balanceTokens,"0");
 assert.equal(result.assets[1].balanceTokens,"50");
 assert.equal(result.assets[0].fiatValue,null);assert.equal(result.allHoldingsDiscovered,false);
 assert.ok(calls.every(x=>x.endsWith(":98")));
 chain=19991;
 await assert.rejects(()=>m8ReadConfirmedBalances(client,account.address,assets,now),/18881/);
 chain=18881;code="0x";
 await assert.rejects(()=>m8ReadConfirmedBalances(client,account.address,assets,now),/evidence/);
});
test("M8 bounded transfer logs accept only original receipt and canonical block",async()=>{
 const assets=m8MarketAssetList([{snapshot:{id:"creator-ultra",baseToken:token,quoteToken:quote}}]);
 const txHash=("0x"+"d".repeat(64)) as Hash;
 let wrongBlock=false,wrongSigner=false;
 const log={address:token,transactionHash:txHash,logIndex:0,blockNumber:98n,
  blockHash, args:{from:wrongSigner?stranger.address:issuer.address,to:account.address,value:8n}};
 const client={
  getChainId:async()=>18881,getBlockNumber:async()=>100n,
  getLogs:async({address,args}:{address:Address;args:Record<string,Address>})=>
   address===token&&Boolean(args.to)?[{...log,args:{...log.args,from:wrongSigner?stranger.address:issuer.address}}]:[],
  getTransactionReceipt:async()=>({status:"success",blockNumber:98n,
   transactionHash:txHash,blockHash:wrongBlock?("0x"+"e".repeat(64)):blockHash,
   logs:[{address:token,logIndex:0,transactionHash:txHash}]}),
  getBlock:async()=>({hash:blockHash,timestamp:BigInt(Math.floor(now/1000))})
 } as unknown as UltraPublicClient;
 const activity=await m8ReadConfirmedTransfers(client,account.address,assets,now);
 assert.equal(activity.transfers.length,1);assert.equal(activity.transfers[0].direction,"received");
 assert.equal(activity.completeHistory,false);
 wrongBlock=true;
 await assert.rejects(()=>m8ReadConfirmedTransfers(client,account.address,assets,now),/canonical/);
});
