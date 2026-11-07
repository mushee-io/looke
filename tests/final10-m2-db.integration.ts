import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { bytesToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { COOKIE_NAME, viewer } from "../src/lib/social/auth";
import { query, socialDb } from "../src/lib/social/db";
import { GET as authGet, POST as authPost } from "../src/app/api/social/auth/route";
import { GET as socialGet, POST as socialPost } from "../src/app/api/social/route";
process.env.LOOKE_SOCIAL_APP_ORIGIN="http://localhost:3000";
process.env.LOOKE_M2_IDENTITY_WRITES_ENABLED="true";
process.env.LOOKE_SOCIAL_WRITES_ENABLED="false";
const wallets=[0,1].map(()=>privateKeyToAccount(bytesToHex(randomBytes(32))));
const addresses=wallets.map(w=>w.address.toLowerCase());
const ownHandle="m"+addresses[0].slice(2,14);
function req(endpoint:string,method="GET",token?:string,body?:Record<string,unknown>){
 return new NextRequest("http://localhost:3000"+endpoint,{
  method,headers:{...(token?{cookie:COOKIE_NAME+"="+token}:{}),
   ...(method==="POST"?{origin:"http://localhost:3000","content-type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
}
async function signIn(index:number){
 const challengeRes=await authPost(req("/api/social/auth","POST",undefined,{action:"challenge",address:wallets[index].address}));
 assert.equal(challengeRes.status,200);
 const issued=await challengeRes.json() as {challengeId:string;message:string};
 assert.match(issued.message,/Ultra EVM Testnet \(18881\)/);
 const signature=await wallets[index].signMessage({message:issued.message});
 const signed=await authPost(req("/api/social/auth","POST",undefined,{action:"verify",challengeId:issued.challengeId,signature}));
 assert.equal(signed.status,200);
 const token=signed.cookies.get(COOKIE_NAME)?.value;
 assert.match(token||"",/^[0-9a-f]{64}$/);
 const replay=await authPost(req("/api/social/auth","POST",undefined,{action:"verify",challengeId:issued.challengeId,signature}));
 assert.equal(replay.status,401);
 return token!;
}
after(async()=>{
 await query("DELETE FROM social_auth_challenges WHERE address=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_profiles WHERE address=ANY($1::text[])",[addresses]);
 await socialDb().end();
});
test("M2 two wallets have isolated server sessions and unique handles",async()=>{
 const tokenA=await signIn(0),tokenB=await signIn(1);
 assert.equal((await viewer(req("/api/social/auth","GET",tokenA)))?.address,addresses[0]);
 assert.equal((await viewer(req("/api/social/auth","GET",tokenB)))?.address,addresses[1]);
 const editA=await socialPost(req("/api/social","POST",tokenA,{
  action:"profile",address:addresses[1],handle:ownHandle,
  displayName:"Creator One",bio:"Ultra Testnet profile",avatarUrl:""
 }));
 assert.equal(editA.status,200);
 const owner=await socialGet(req("/api/social?action=handle-status&handle="+ownHandle,"GET",tokenA));
 assert.equal((await owner.json()).available,true);
 const taken=await socialGet(req("/api/social?action=handle-status&handle="+ownHandle,"GET",tokenB));
 assert.equal((await taken.json()).available,false);
 const reserved=await socialGet(req("/api/social?action=handle-status&handle=looke_support","GET",tokenB));
 assert.equal((await reserved.json()).reason,"reserved");
 const hijack=await socialPost(req("/api/social","POST",tokenB,{
  action:"profile",address:addresses[0],handle:ownHandle,
  displayName:"Impersonator",bio:"",avatarUrl:""
 }));
 assert.equal(hijack.status,409);
 const actual=await query<{display_name:string;handle:string}>(
  "SELECT display_name,handle FROM social_profiles WHERE address=$1",[addresses[0]]);
 assert.equal(actual.rows[0].display_name,"Creator One");
 assert.equal(actual.rows[0].handle,ownHandle);
 const blocked=await socialPost(req("/api/social","POST",tokenA,{action:"post",body:"Do not publish before M3"}));
 assert.equal(blocked.status,503);
 const logout=await authPost(req("/api/social/auth","POST",tokenA,{action:"logout"}));
 assert.equal(logout.status,200);
 assert.equal(await viewer(req("/api/social/auth","GET",tokenA)),null);
 const who=await authGet(req("/api/social/auth","GET",tokenB));
 assert.equal((await who.json()).user.address,addresses[1]);
});
test("M2 anonymous/forged sessions cannot modify profiles",async()=>{
 for(const token of [undefined,"f".repeat(64)]){
  const result=await socialPost(req("/api/social","POST",token,{
   action:"profile",handle:"newcreator",displayName:"Sneak",bio:"",avatarUrl:""
  }));
  assert.equal(result.status,401);
 }
});
