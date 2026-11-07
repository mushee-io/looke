import assert from "node:assert/strict";
import {after,test} from "node:test";
import {randomBytes} from "node:crypto";
import {NextRequest} from "next/server";
import {privateKeyToAccount} from "viem/accounts";
import {bytesToHex} from "viem";
import {COOKIE_NAME} from "../src/lib/social/auth";
import {query,socialDb} from "../src/lib/social/db";
import {POST as authPost} from "../src/app/api/social/auth/route";
import {GET as previewGet,POST as previewPost} from "../src/app/api/experience/creator-launch/route";
import {GET as proofGet} from "../src/app/api/experience/creator-launch/proof/route";
const server="http://localhost:3000";
process.env.LOOKE_SOCIAL_APP_ORIGIN=server;
process.env.LOOKE_SOCIAL_WRITES_ENABLED="false";
process.env.LOOKE_M2_IDENTITY_WRITES_ENABLED="true";
process.env.LOOKE_M3_SOCIAL_WRITES_ENABLED="true";
process.env.LOOKE_M4_CREATOR_MEDIA_WRITES_ENABLED="false";
process.env.LOOKE_M5_MESSAGE_REQUEST_WRITES_ENABLED="false";
process.env.LOOKE_M6_CREATOR_PREVIEW_WRITES_ENABLED="true";
process.env.LOOKE_PUBLIC_BETA_ENABLED="false";
delete process.env.LOOKE_M6_FACTORY_ADDRESS;
delete process.env.LOOKE_M6_FACTORY_DEPLOY_TX;
delete process.env.LOOKE_M6_APPROVED_FACTORY_CODEHASH;
const wallets=Array.from({length:2},()=>privateKeyToAccount(bytesToHex(randomBytes(32))));
const addresses=wallets.map(w=>w.address.toLowerCase()),tokens:string[]=[];
const metadata="ipfs://bafybeigdyrzt5sfp7udm7hu76uhmizcmus36cybk6z52v6t37viffyzqku";
const clientNonce=randomBytes(16).toString("hex");
let firstId="";
function req(path:string,method:"GET"|"POST"="GET",index?:number,body?:Record<string,unknown>,origin=server){
 return new NextRequest(server+path,{
  method,headers:{...(index!==undefined&&tokens[index]?{cookie:COOKIE_NAME+"="+tokens[index]}:{}),
   ...(method==="POST"?{"content-type":"application/json",origin}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
}
async function sign(i:number){
 const challengeRes=await authPost(req("/api/social/auth","POST",undefined,
  {action:"challenge",address:wallets[i].address}));
 assert.equal(challengeRes.status,200);
 const issued=await challengeRes.json() as {challengeId:string;message:string};
 const sig=await wallets[i].signMessage({message:issued.message});
 const checked=await authPost(req("/api/social/auth","POST",undefined,
  {action:"verify",challengeId:issued.challengeId,signature:sig}));
 assert.equal(checked.status,200);
 const token=checked.cookies.get(COOKIE_NAME)?.value;
 assert.ok(token);tokens[i]=token;
}
const draft=(i:number,patch:Record<string,unknown>={})=>previewPost(req("/api/experience/creator-launch","POST",i,{
 name:"Ultra Community",symbol:"UCOM",supplyTokens:"2500",metadataURI:metadata,
 pair:"ULTRA",clientNonce,...patch
}));
after(async()=>{
 await query("DELETE FROM social_rate_windows WHERE actor=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_auth_challenges WHERE address=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_profiles WHERE address=ANY($1::text[])",[addresses]);
 await socialDb().end();
});
test("M6 two individually signed ephemeral wallets; anonymous, spoof and origin denial",async()=>{
 for(let i=0;i<2;i++)await sign(i);
 assert.equal((await previewGet(req("/api/experience/creator-launch"))).status,401);
 assert.equal((await previewPost(req("/api/experience/creator-launch","POST",undefined,{
  name:"Ultra Community",symbol:"UCOM",supplyTokens:"10",metadataURI:metadata,
  pair:"ULTRA",clientNonce
 }))).status,401);
 assert.equal((await previewPost(req("/api/experience/creator-launch","POST",0,{
  name:"Ultra Community",symbol:"UCOM",supplyTokens:"10",metadataURI:metadata,
  pair:"ULTRA",clientNonce
 },"https://attacker.example"))).status,403);
 assert.equal((await draft(0,{owner:addresses[1]})).status,400);
 assert.equal((await draft(0,{pair:"ETH"})).status,400);
 assert.equal((await draft(0,{supplyTokens:"1000000000001"})).status,400);
 assert.equal((await draft(0,{metadataURI:"http://localhost/admin"})).status,400);
});
test("M6 original PostgreSQL owner-scoped one-use preview; no token, tx or liquidity claims",async()=>{
 const created=await draft(0);
 assert.equal(created.status,200);
 const payload=await created.json() as {
  owner:string;previewId:string;reviewed:{reviewOnly:boolean;deployable:boolean;initialSupply:string;
   feeDisclosure:{creationFeeWei:string;swapsAndLiquidity:string}};executionEnabled:boolean;walletActionRequested:boolean
 };
 firstId=payload.previewId;
 assert.equal(payload.owner,addresses[0]);
 assert.equal(payload.reviewed.reviewOnly,true);assert.equal(payload.reviewed.deployable,false);
 assert.equal(payload.reviewed.feeDisclosure.creationFeeWei,"0");
 assert.match(payload.reviewed.feeDisclosure.swapsAndLiquidity,/NOT created/);
 assert.equal(payload.executionEnabled,false);assert.equal(payload.walletActionRequested,false);
 assert.equal((await draft(0)).status,409);
 const stored=await query<{owner:string;status:string;symbol:string;quote_preference:string;client_nonce:string}>(
  "SELECT owner,status,symbol,quote_preference,client_nonce FROM social_creator_deployment_previews WHERE id=$1",[firstId]);
 assert.equal(stored.rows[0].owner,addresses[0]);assert.equal(stored.rows[0].status,"prepared");
 assert.equal(stored.rows[0].quote_preference,"ULTRA");
 assert.equal(stored.rows[0].client_nonce,clientNonce);
 const other=await draft(1,{pair:"LOOKE"});assert.equal(other.status,200);
 const own=await previewGet(req("/api/experience/creator-launch?id="+firstId,"GET",0));
 assert.equal((await own.json() as {previews:{id:string}[]}).previews[0].id,firstId);
 const unauthorized=await previewGet(req("/api/experience/creator-launch?id="+firstId,"GET",1));
 assert.equal((await unauthorized.json() as {previews:{id:string}[]}).previews.length,0);
 const all=await query<{owner:string;status:string}>(
  "SELECT owner,status FROM social_creator_deployment_previews WHERE client_nonce=$1",[clientNonce]);
 assert.equal(all.rowCount,2);
 assert.ok(all.rows.every(x=>x.status==="prepared"));
 // Never count CI preview rows as actual tokens or token transactions.
 assert.equal((await query("SELECT count(*)::integer AS n FROM social_creator_deployment_previews WHERE status<>'prepared'")).rows[0].n,0);
});
test("M6 read-only chain-proof API fails closed without original factory evidence",async()=>{
 const unknown=await proofGet(req("/api/experience/creator-launch/proof?hash=0x"+"a".repeat(64)+"&id="+firstId,"GET",0));
 assert.equal(unknown.status,200);
 const result=await unknown.json() as {status:string;transactionsSent:number;liquidityCreated:boolean};
 assert.equal(result.status,"blocked");assert.equal(result.transactionsSent,0);
 assert.equal(result.liquidityCreated,false);
 const anonymous=await proofGet(req("/api/experience/creator-launch/proof","GET"));
 assert.equal(anonymous.status,401);
});
test("M6 preview gate defaults off regardless of wallet state or token UI",async()=>{
 const old=process.env.LOOKE_M6_CREATOR_PREVIEW_WRITES_ENABLED;
 try{process.env.LOOKE_M6_CREATOR_PREVIEW_WRITES_ENABLED="false";
  assert.equal((await draft(0,{clientNonce:randomBytes(16).toString("hex")})).status,503);
  const get=await previewGet(req("/api/experience/creator-launch","GET",0));
  assert.equal(get.status,200);const data=await get.json() as {transactionsSent:number;liveDeploymentEnabled:boolean};
  assert.equal(data.transactionsSent,0);assert.equal(data.liveDeploymentEnabled,false);
 }finally{process.env.LOOKE_M6_CREATOR_PREVIEW_WRITES_ENABLED=old;}
});
