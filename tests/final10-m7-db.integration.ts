import assert from "node:assert/strict";
import {after,test} from "node:test";
import {randomBytes} from "node:crypto";
import {NextRequest} from "next/server";
import {privateKeyToAccount} from "viem/accounts";
import {bytesToHex} from "viem";
import {COOKIE_NAME} from "../src/lib/social/auth";
import {query,socialDb} from "../src/lib/social/db";
import {POST as authPost} from "../src/app/api/social/auth/route";
import {GET as marketGet} from "../src/app/api/experience/markets/route";
import {GET as reviewGet,POST as reviewPost} from "../src/app/api/experience/markets/reviews/route";
import {GET as proofGet} from "../src/app/api/experience/markets/proof/route";
// Genuine disposable PostgreSQL and ephemeral signed wallets. THESE ARE TEST
// FIXTURES, never claimed to be operator sources, trades, pools or real users.
const server="http://localhost:3000";
process.env.LOOKE_SOCIAL_APP_ORIGIN=server;
process.env.VERCEL_ENV="preview";
process.env.LOOKE_SOCIAL_WRITES_ENABLED="false";
process.env.LOOKE_M2_IDENTITY_WRITES_ENABLED="true";
process.env.LOOKE_M3_SOCIAL_WRITES_ENABLED="true";
process.env.LOOKE_M6_CREATOR_PREVIEW_WRITES_ENABLED="false";
process.env.LOOKE_M7_MARKET_REVIEW_WRITES_ENABLED="true";
process.env.LOOKE_M7_OPERATOR_SOURCE_APPROVED="false";
process.env.LOOKE_PUBLIC_BETA_ENABLED="false";
delete process.env.LOOKE_M7_MARKET_PROOFS_JSON;
delete process.env.LOOKE_M7_ULTRA_QUOTE_TOKEN;
delete process.env.LOOKE_M7_LOOKE_QUOTE_TOKEN;
const wallets=Array.from({length:2},()=>privateKeyToAccount(bytesToHex(randomBytes(32))));
const addresses=wallets.map(w=>w.address.toLowerCase()),tokens:string[]=[];
const nonce=randomBytes(16).toString("hex");
let ownId="";
function req(path:string,method:"GET"|"POST"="GET",index?:number,payload?:Record<string,unknown>,origin=server){
 return new NextRequest(server+path,{
  method,headers:{...(index!==undefined&&tokens[index]?{cookie:COOKIE_NAME+"="+tokens[index]}:{}),
   ...(method==="POST"?{"content-type":"application/json",origin}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{})
 });
}
async function sign(i:number){
 const issued=await authPost(req("/api/social/auth","POST",undefined,{action:"challenge",address:wallets[i].address}));
 assert.equal(issued.status,200);
 const data=await issued.json() as {challengeId:string;message:string};
 const signature=await wallets[i].signMessage({message:data.message});
 const authenticated=await authPost(req("/api/social/auth","POST",undefined,{
  action:"verify",challengeId:data.challengeId,signature
 }));
 assert.equal(authenticated.status,200);
 const cookie=authenticated.cookies.get(COOKIE_NAME)?.value;assert.ok(cookie);
 tokens[i]=cookie;
}
after(async()=>{
 await query("DELETE FROM social_rate_windows WHERE actor=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_auth_challenges WHERE address=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_profiles WHERE address=ANY($1::text[])",[addresses]);
 await socialDb().end();
});
test("M7 no original factory/pair sources yields explicit NO-GO, zero invented liquidity",async()=>{
 for(let i=0;i<2;i++)await sign(i);
 const response=await marketGet(req("/api/experience/markets"));
 assert.equal(response.status,200);
 const data=await response.json() as {status:string;markets:unknown[];tradesSubmitted:number;marketsInvented:number};
 assert.equal(data.status,"blocked");assert.deepEqual(data.markets,[]);
 assert.equal(data.marketsInvented,0);assert.equal(data.tradesSubmitted,0);
 const item=await marketGet(req("/api/experience/markets?mode=market&id=ucat-ultra"));
 assert.equal(item.status,503);
 const activity=await marketGet(req("/api/experience/markets?mode=activity&id=ucat-ultra"));
 assert.equal(activity.status,503);
});
test("M7 wallet-only reviews reject invalid origin, spoofed owner and absent original market sources",async()=>{
 const payload={marketId:"ucat-ultra",direction:"buy",amount:"1",slippageBps:50,
  deadlineSeconds:Math.floor(Date.now()/1000)+180,clientNonce:nonce};
 assert.equal((await reviewGet(req("/api/experience/markets/reviews"))).status,401);
 assert.equal((await reviewPost(req("/api/experience/markets/reviews","POST",undefined,payload))).status,401);
 assert.equal((await reviewPost(req("/api/experience/markets/reviews","POST",0,payload,"https://evil.example"))).status,403);
 assert.equal((await reviewPost(req("/api/experience/markets/reviews","POST",0,{...payload,owner:addresses[1]}))).status,400);
 assert.equal((await reviewPost(req("/api/experience/markets/reviews","POST",0,{...payload,slippageBps:500}))).status,400);
 assert.equal((await reviewPost(req("/api/experience/markets/reviews","POST",0,payload))).status,503);
 assert.equal((await query("SELECT id FROM social_market_review_intents")).rowCount,0);
});
test("M7 PostgreSQL review-only constraints enforce one-use nonces and private owner reads",async()=>{
 // CI-only direct fixture insertion tests database controls; never a real
 // verified market, no successful trade-review POST and no transaction.
 const sql=`INSERT INTO social_market_review_intents
 (owner,client_nonce,market_id,direction,base_token,quote_token,router,pair,
 quote_preference,amount_in,minimum_output,quoted_output,slippage_bps,quote_block,quoted_at,expires_at)
 VALUES($1,$2,'ucat-ultra','buy',$3,$4,$5,$6,'ULTRA','1000','950','1000',50,'180',
 $7,$8) RETURNING id`;
 const now=new Date(),expiry=new Date(now.getTime()+180_000);
 const sample=["0x"+"3".repeat(40),"0x"+"4".repeat(40),"0x"+"5".repeat(40),"0x"+"6".repeat(40)];
 const args=[addresses[0],nonce,...sample,now,expiry];
 const created=await query<{id:string}>(sql,args);
 ownId=created.rows[0].id;
 assert.ok(ownId);
 await assert.rejects(()=>query(sql,args),/duplicate|unique/i);
 const second=await query(sql,[addresses[1],nonce,...sample,now,expiry]);
 assert.equal(second.rowCount,1); // unique nonce is per-wallet, not global
 const own=await reviewGet(req("/api/experience/markets/reviews?id="+ownId,"GET",0));
 assert.equal(own.status,200);
 const userA=await own.json() as {reviews:{id:string;status:string}[];tradeBroadcastEnabled:boolean};
 assert.equal(userA.reviews[0].id,ownId);assert.equal(userA.reviews[0].status,"review");
 assert.equal(userA.tradeBroadcastEnabled,false);
 const other=await reviewGet(req("/api/experience/markets/reviews?id="+ownId,"GET",1));
 assert.equal((await other.json() as {reviews:unknown[]}).reviews.length,0);
 // Wrong owner cannot provide a transaction hash and use this private review as proof.
 const proof=await proofGet(req("/api/experience/markets/proof?reviewId="+ownId+"&txHash=0x"+"a".repeat(64),"GET",1));
 assert.equal(proof.status,404);
 const same=await query<{status:string}>("SELECT status FROM social_market_review_intents WHERE id=$1",[ownId]);
 assert.equal(same.rows[0].status,"review");
 await assert.rejects(()=>query(sql,[addresses[0],randomBytes(16).toString("hex"),
  sample[0],sample[1],sample[2],sample[3],now,new Date(now.getTime()+60*60_000)]),/check constraint/i);
 await assert.rejects(()=>query(`INSERT INTO social_market_review_intents
 (owner,client_nonce,market_id,direction,base_token,quote_token,router,pair,quote_preference,
 amount_in,minimum_output,quoted_output,slippage_bps,quote_block,quoted_at,expires_at)
 VALUES($1,$2,'ucat-ultra','buy',$3,$4,$5,$6,'ETH','1000','950','1000',50,'180',$7,$8)`,[
 addresses[0],randomBytes(16).toString("hex"),...sample,now,expiry
 ]),/check constraint/i);
});
test("M7 review writes disabled by default and proof cannot broadcast",async()=>{
 const before=process.env.LOOKE_M7_MARKET_REVIEW_WRITES_ENABLED;
 try{
  process.env.LOOKE_M7_MARKET_REVIEW_WRITES_ENABLED="false";
  const response=await reviewPost(req("/api/experience/markets/reviews","POST",0,{
   marketId:"ucat-ultra",direction:"buy",amount:"1",slippageBps:50,
   deadlineSeconds:Math.floor(Date.now()/1000)+180,clientNonce:randomBytes(16).toString("hex")
  }));
  assert.equal(response.status,503);
  const read=await reviewGet(req("/api/experience/markets/reviews","GET",0));
  assert.equal(read.status,200);
  assert.equal((await read.json() as {allowanceChangesEnabled:boolean}).allowanceChangesEnabled,false);
 }finally{process.env.LOOKE_M7_MARKET_REVIEW_WRITES_ENABLED=before;}
});
