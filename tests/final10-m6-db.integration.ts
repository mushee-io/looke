import assert from "node:assert/strict";
import {after,test} from "node:test";
import {randomBytes} from "node:crypto";
import {NextRequest} from "next/server";
import {privateKeyToAccount} from "viem/accounts";
import {bytesToHex,decodeFunctionData} from "viem";
import {query,socialDb} from "../src/lib/social/db";
import {COOKIE_NAME} from "../src/lib/social/auth";
import {POST as authPOST} from "../src/app/api/social/auth/route";
import {GET as intentGET,POST as intentPOST} from "../src/app/api/experience/creator-intents/route";
import {POST as proofPOST} from "../src/app/api/experience/creator-proof/route";
import {m6CreatorFactoryAbi} from "../src/lib/experience/m6-factory-abi";

// M6 signed CI wallets and ephemeral PostgreSQL ONLY; no private key sent to
// any chain/provider, no token deployments, no original hosted social database.
process.env.LOOKE_SOCIAL_APP_ORIGIN="http://localhost:3000";
process.env.LOOKE_PUBLIC_BETA_ENABLED="false";
process.env.LOOKE_SOCIAL_WRITES_ENABLED="false";
process.env.LOOKE_M2_IDENTITY_WRITES_ENABLED="true";
process.env.LOOKE_M3_SOCIAL_WRITES_ENABLED="true";
process.env.LOOKE_M6_CREATOR_DRAFT_WRITES_ENABLED="true";
const wallets=[0,1].map(()=>privateKeyToAccount(bytesToHex(randomBytes(32))));
const owners=wallets.map(w=>w.address.toLowerCase()),tokens:string[]=[];
const draft={name:"Ultra Demo Coin",symbol:"ULDC",pair:"ULTRA",
 description:"Real disposable wallet-owned unsigned draft",
 imageURI:"ipfs://bafybeigdyrzt5sfp7udm7hu76uhmizcmus36cybk6z52v6t37viffyzqku",
 metadataURI:"https://assets.example.com/creator/metadata.json",
 supply:"5000.75"};
function req(url:string,method:"GET"|"POST"="GET",index?:number,payload?:Record<string,unknown>,
 origin="http://localhost:3000"){
 return new NextRequest("http://localhost:3000"+url,{
  method,headers:{...(index!==undefined&&tokens[index]?{cookie:COOKIE_NAME+"="+tokens[index]}:{}),
   ...(method==="POST"?{"content-type":"application/json",origin}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{})
 });
}
async function sign(index:number){
 const challenge=await authPOST(req("/api/social/auth","POST",undefined,
  {action:"challenge",address:wallets[index].address}));
 assert.equal(challenge.status,200);
 const data=await challenge.json() as {challengeId:string;message:string};
 const signature=await wallets[index].signMessage({message:data.message});
 const response=await authPOST(req("/api/social/auth","POST",undefined,
  {action:"verify",challengeId:data.challengeId,signature}));
 assert.equal(response.status,200);
 const token=response.cookies.get(COOKIE_NAME)?.value;assert.ok(token);
 tokens[index]=token;
}
after(async()=>{
 await query("DELETE FROM social_rate_windows WHERE actor=ANY($1::text[])",[owners]);
 await query("DELETE FROM social_auth_challenges WHERE address=ANY($1::text[])",[owners]);
 await query("DELETE FROM social_profiles WHERE address=ANY($1::text[])",[owners]);
 await socialDb().end();
});
test("M6 signed wallet and exact origin required; never accept owner spoof",async()=>{
 await sign(0);await sign(1);
 const anonymous=await intentPOST(req("/api/experience/creator-intents","POST",undefined,draft));
 assert.equal(anonymous.status,401);
 const anonymousRead=await intentGET(req("/api/experience/creator-intents"));
 assert.equal(anonymousRead.status,401);
 const badOrigin=await intentPOST(req("/api/experience/creator-intents","POST",0,draft,"https://evil.example"));
 assert.equal(badOrigin.status,403);
 const spoof=await intentPOST(req("/api/experience/creator-intents","POST",0,{...draft,owner:owners[1]}));
 assert.equal(spoof.status,400);
});
test("M6 only persists an unsigned, unspent, one-use-nonce draft owned by actual wallet",async()=>{
 const response=await intentPOST(req("/api/experience/creator-intents","POST",0,draft));
 assert.equal(response.status,200);
 const result=await response.json() as {
  owner:string;intentId:string;status:string;signed:boolean;plan:{
   calldata:string;calldataHash:string;chainId:number;nonce:string;pair:string;
   supply:string;applicationFeeWei:string;networkGasFeeWei:null;
   walletTransactionPrepared:boolean;transactionBroadcast:boolean;deployable:boolean;
  }};
 assert.equal(result.owner,owners[0]);
 assert.equal(result.status,"prepared");assert.equal(result.signed,false);
 assert.equal(result.plan.chainId,18881);assert.equal(result.plan.pair,"ULTRA");
 assert.equal(result.plan.applicationFeeWei,"0");assert.equal(result.plan.networkGasFeeWei,null);
 assert.equal(result.plan.transactionBroadcast,false);assert.equal(result.plan.deployable,false);
 assert.match(result.plan.calldataHash,/^0x[0-9a-f]{64}$/);
 assert.match(result.plan.nonce,/^0x[0-9a-f]{64}$/);
 const decoded=decodeFunctionData({abi:m6CreatorFactoryAbi,data:result.plan.calldata as `0x${string}`});
 assert.equal(decoded.functionName,"createCreatorCoin");
 assert.equal(decoded.args[3].toString(),result.plan.supply);
 const stored=await query<{
  owner:string;status:string;chain_id:number;pair_preference:string;
  app_fee_wei:string;client_nonce:string;calldata_hash:string
 }>("SELECT owner,status,chain_id,pair_preference,app_fee_wei,client_nonce,calldata_hash FROM social_creator_token_intents WHERE id=$1",[result.intentId]);
 assert.equal(stored.rows[0].owner,owners[0]);assert.equal(stored.rows[0].status,"prepared");
 assert.equal(stored.rows[0].chain_id,18881);assert.equal(stored.rows[0].pair_preference,"ULTRA");
 assert.equal(stored.rows[0].app_fee_wei,"0");assert.equal(stored.rows[0].client_nonce,result.plan.nonce);
 assert.equal(stored.rows[0].calldata_hash,result.plan.calldataHash);
 const a=await intentGET(req("/api/experience/creator-intents","GET",0));
 const b=await intentGET(req("/api/experience/creator-intents","GET",1));
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal((await a.json() as {intents:{id:string}[]}).intents.some(x=>x.id===result.intentId),true);
 assert.equal((await b.json() as {intents:{id:string}[]}).intents.length,0);
 await assert.rejects(()=>query(`
  INSERT INTO social_creator_token_intents(owner,token_name,token_symbol,metadata_uri,
    initial_supply_units,pair_preference,client_nonce,calldata_hash)
  VALUES($1,'Duplicate','DUP','ipfs://valid',1000,'ULTRA',$2,$3)
 `,[owners[0],result.plan.nonce,result.plan.calldataHash]),/duplicate|unique/i);
 const schema=await query<{column_name:string}>(
  "SELECT column_name FROM information_schema.columns WHERE table_name='social_creator_token_intents'");
 assert.ok(!schema.rows.some(r=>["tx_hash","transaction_hash","coin_address","contract_address","wallet_private_key"].includes(r.column_name)));
});
test("M6 malicious metadata, wrong pairs, invalid amounts and unverified receipts are denied",async()=>{
 for(const bad of [
  {...draft,pair:"USDC"},
  {...draft,metadataURI:"http://localhost:8080/metadata.json"},
  {...draft,metadataURI:"javascript:alert(1)"},
  {...draft,supply:"0"},
  {...draft,supply:"1000000001"},
  {...draft,supply:"1e9"},
  {...draft,supply:"0.1234567890123456789"}
 ]){
  await query("DELETE FROM social_rate_windows WHERE actor=$1 AND category='creator_m6_draft'",[owners[0]]);
  const r=await intentPOST(req("/api/experience/creator-intents","POST",0,bad));
  assert.equal(r.status,400,JSON.stringify(bad));
 }
 // Separate explicit rate-limit check (no rate bypass in production).
 await query("DELETE FROM social_rate_windows WHERE actor=$1 AND category='creator_m6_draft'",[owners[0]]);
 for(let attempt=0;attempt<5;attempt++){
  const denied=await intentPOST(req("/api/experience/creator-intents","POST",0,{...draft,pair:"ETH"}));
  assert.equal(denied.status,400);
 }
 const throttled=await intentPOST(req("/api/experience/creator-intents","POST",0,{...draft,pair:"ETH"}));
 assert.equal(throttled.status,429);
 const proof=await proofPOST(req("/api/experience/creator-proof","POST",0,{
  transactionHash:"0x"+"a".repeat(64),nonce:"0x"+"1".repeat(64),draft
 }));
 assert.equal(proof.status,503);
 const claims=await query<{n:number}>("SELECT count(*)::integer AS n FROM social_creator_token_intents WHERE owner=$1",[owners[0]]);
 assert.equal(claims.rows[0].n,1);
});
test("M6 draft feature flag fail-closes without affecting genuine owner-only history",async()=>{
 const before=process.env.LOOKE_M6_CREATOR_DRAFT_WRITES_ENABLED;
 try{
  process.env.LOOKE_M6_CREATOR_DRAFT_WRITES_ENABLED="false";
  assert.equal((await intentPOST(req("/api/experience/creator-intents","POST",0,draft))).status,503);
  assert.equal((await intentGET(req("/api/experience/creator-intents","GET",0))).status,200);
 }finally{process.env.LOOKE_M6_CREATOR_DRAFT_WRITES_ENABLED=before;}
});
