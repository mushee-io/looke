import assert from "node:assert/strict";
import {after,test} from "node:test";
import {randomBytes} from "node:crypto";
import {NextRequest} from "next/server";
import {privateKeyToAccount} from "viem/accounts";
import {bytesToHex} from "viem";
import {query,socialDb} from "../src/lib/social/db";
import {COOKIE_NAME} from "../src/lib/social/auth";
import {POST as authPost} from "../src/app/api/social/auth/route";
import {GET as socialGet,POST as socialPost} from "../src/app/api/social/route";
import {GET as activityGet,POST as activityPost} from "../src/app/api/social/engagement/route";
import {GET as notificationGet,POST as notificationPost} from "../src/app/api/experience/notifications/route";
import {POST as controlsPost} from "../src/app/api/social/controls/route";

// ONLY DISPOSABLE CI POSTGRESQL. Random test private keys never leave this process.
// No original production account, external RPC, key, trade, token or provider.
process.env.LOOKE_SOCIAL_APP_ORIGIN="http://localhost:3000";
process.env.LOOKE_SOCIAL_WRITES_ENABLED="false";
process.env.LOOKE_M2_IDENTITY_WRITES_ENABLED="true";
process.env.LOOKE_M3_SOCIAL_WRITES_ENABLED="true";
process.env.LOOKE_PUBLIC_BETA_ENABLED="false";
const wallets=Array.from({length:3},()=>privateKeyToAccount(bytesToHex(randomBytes(32))));
const addresses=wallets.map(w=>w.address.toLowerCase());
const sessions:string[]=[];
const body="M3 real disposable owner-scoped text post";
let postId="";
function request(path:string,method:"GET"|"POST"="GET",token?:string,payload?:Record<string,unknown>,origin="http://localhost:3000"){
 return new NextRequest("http://localhost:3000"+path,{method,
  headers:{...(token?{cookie:COOKIE_NAME+"="+token}:{}),
   ...(method==="POST"?{"content-type":"application/json",origin}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{})
 });
}
async function sign(index:number){
 const challenge=await authPost(request("/api/social/auth","POST",undefined,
   {action:"challenge",address:wallets[index].address}));
 assert.equal(challenge.status,200,"M2 identity must work before social writes");
 const issued=await challenge.json() as {challengeId:string;message:string};
 const sig=await wallets[index].signMessage({message:issued.message});
 const verified=await authPost(request("/api/social/auth","POST",undefined,
   {action:"verify",challengeId:issued.challengeId,signature:sig}));
 assert.equal(verified.status,200);
 const token=verified.cookies.get(COOKIE_NAME)?.value;
 assert.ok(token);sessions[index]=token;
 return token;
}
const social=(index:number,action:string,fields:Record<string,unknown>={})=>
 socialPost(request("/api/social","POST",sessions[index],{action,...fields}));
const engage=(index:number,action:string,id=postId)=>
 activityPost(request("/api/social/engagement","POST",sessions[index],{action,postId:id}));
after(async()=>{
 await query("DELETE FROM social_rate_windows WHERE actor=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_auth_challenges WHERE address=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_profiles WHERE address=ANY($1::text[])",[addresses]);
 await socialDb().end();
});

test("M3 creates exactly two independent wallet sessions, not anonymous writes",async()=>{
 for(let i=0;i<3;i++)await sign(i);
 const guest=await socialPost(request("/api/social","POST",undefined,{action:"post",body:"no cookie"}));
 assert.equal(guest.status,401);
 const origin=await socialPost(request("/api/social","POST",sessions[1],
  {action:"post",body:"cross origin"},"https://phish.example"));
 assert.equal(origin.status,403);
});
test("M3 persists real wallet-owned plain text posts; rejects media, coin and moderation bypass",async()=>{
 const created=await social(0,"post",{body,author:addresses[1]});
 assert.equal(created.status,200);
 const createdPayload=await created.json() as {post:{id:string}};
 postId=createdPayload.post.id;
 const owner=await query<{author:string;asset_chain:string|null;media_url:string|null}>(
  "SELECT author,asset_chain,media_url FROM social_posts WHERE id=$1",[postId]);
 assert.equal(owner.rows[0].author,addresses[0]);
 assert.equal(owner.rows[0].asset_chain,null);
 assert.equal(owner.rows[0].media_url,null);
 const feed=await socialGet(request("/api/social?action=feed"));
 assert.equal(feed.status,200);
 const posts=(await feed.json() as {posts:{id:string;body:string;author:string}[]}).posts;
 assert.ok(posts.some(p=>p.id===postId&&p.author===addresses[0]&&p.body===body));
 for(const fields of [
  {asset:{assetType:"token",assetChain:"ultra-evm",assetId:addresses[2]}},
  {mediaUploadId:"12e777b9-0581-4d35-90b0-d6947482ebec"},
  {media:{url:"https://example.org/a.png",kind:"image"}}
 ]){
  const r=await social(0,"post",{body:"not authorized",...fields});
  assert.equal(r.status,403);
 }
 const financial=await social(0,"moderate",{operation:"hide_post",targetId:postId,reason:"pretend moderation"});
 assert.equal(financial.status,503);
 const forbiddenMessage=await social(0,"message",{body:"plaintext"});
 assert.equal(forbiddenMessage.status,501);
 const rows=await query("SELECT id FROM social_posts WHERE author=$1",[addresses[0]]);
 assert.equal(rows.rowCount,1);
});
test("M3 signed follows and replies create only real owner-scoped notifications",async()=>{
 const follow=await social(1,"follow",{target:addresses[0],follower:addresses[2]});
 assert.equal(follow.status,200);
 const r=await query<{follower:string;followed:string}>(
  "SELECT follower,followed FROM social_follows WHERE followed=$1",[addresses[0]]);
 assert.equal(r.rows[0].follower,addresses[1]);
 const comment=await social(1,"comment",{postId,body:"Actual wallet-owned reply",author:addresses[2]});
 assert.equal(comment.status,200);
 const reply=await query<{author:string}>(
  "SELECT author FROM social_comments WHERE post_id=$1",[postId]);
 assert.equal(reply.rows[0].author,addresses[1]);
 const notify0=await notificationGet(request("/api/experience/notifications","GET",sessions[0]));
 assert.equal(notify0.status,200);
 const data=await notify0.json() as {events:{type:string;postId:string|null}[];unreadCount:number};
 assert.ok(data.events.some(x=>x.type==="Follows"));
 assert.ok(data.events.some(x=>x.type==="Comments"&&x.postId===postId));
 const notify1=await notificationGet(request("/api/experience/notifications","GET",sessions[1]));
 assert.equal((await notify1.json() as {events:unknown[]}).events.length,0);
 const notify2=await notificationGet(request("/api/experience/notifications","GET",sessions[2]));
 assert.equal((await notify2.json() as {events:unknown[]}).events.length,0);
});
test("M3 likes and reposts reject self-engagement and deduplicate",async()=>{
 assert.equal((await engage(0,"like")).status,403);
 const first=await engage(1,"like");
 assert.equal(first.status,200);
 assert.equal((await first.json() as {engagement:{like_count:number}}).engagement.like_count,1);
 const repeat=await engage(1,"like");
 assert.equal((await repeat.json() as {changed:boolean}).changed,false);
 assert.equal((await engage(1,"repost")).status,200);
 assert.equal((await engage(1,"bookmark")).status,200);
 const activity=await activityGet(request("/api/social/engagement?view=activity","GET",sessions[1]));
 assert.equal(activity.status,200);
 const kinds=(await activity.json() as {events:{kind:string;post_id:string}[]}).events;
 assert.ok(kinds.some(x=>x.kind==="likes"&&x.post_id===postId));
 assert.ok(kinds.some(x=>x.kind==="reposts"&&x.post_id===postId));
 assert.ok(kinds.some(x=>x.kind==="bookmarks"&&x.post_id===postId));
 const owner=await notificationGet(request("/api/experience/notifications","GET",sessions[0]));
 const e=(await owner.json() as {events:{type:string;postId:string|null}[]}).events;
 assert.ok(e.some(x=>x.type==="Likes"&&x.postId===postId));
 assert.ok(e.some(x=>x.type==="Reposts"&&x.postId===postId));
 const following=await socialGet(request("/api/social?action=feed&scope=following","GET",sessions[1]));
 assert.ok((await following.json() as {posts:{id:string}[]}).posts.some(p=>p.id===postId));
});
test("M3 private read receipts and account controls never modify another wallet",async()=>{
 const mark=await notificationPost(request("/api/experience/notifications","POST",sessions[0],
  {action:"mark_read",owner:addresses[1]}));
 assert.equal(mark.status,200);
 const state=await query<{owner:string}>("SELECT owner FROM social_notification_reads",[ ]);
 assert.deepEqual(state.rows.map(x=>x.owner),[addresses[0]]);
 const second=await notificationGet(request("/api/experience/notifications","GET",sessions[0]));
 assert.equal((await second.json() as {unreadCount:number}).unreadCount,0);
 const preference=await controlsPost(request("/api/social/controls","POST",sessions[1],{
  action:"preferences",preferences:{follows:true,comments:true,likes:false,reposts:true},
  owner:addresses[0]
 }));
 assert.equal(preference.status,200);
 const saved=await query<{owner:string;likes:boolean}>(
  "SELECT owner,likes FROM social_notification_preferences");
 assert.deepEqual(saved.rows.map(x=>x.owner),[addresses[1]]);
 assert.equal(saved.rows[0].likes,false);
});
test("M3 blocking filters feed/notifications and prevents reply; flag off closes writes",async()=>{
 const blocked=await social(0,"block",{target:addresses[1]});
 assert.equal(blocked.status,200);
 const reply=await social(1,"comment",{postId,body:"Blocked"});
 assert.ok([403,404].includes(reply.status));
 const unseen=await socialGet(request("/api/social?action=feed","GET",sessions[1]));
 assert.ok(!(await unseen.json() as {posts:{id:string}[]}).posts.some(x=>x.id===postId));
 const notification=await notificationGet(request("/api/experience/notifications","GET",sessions[0]));
 assert.ok(!(await notification.json() as {events:{type:string}[]}).events.some(x=>x.type==="Likes"));
 const was=process.env.LOOKE_M3_SOCIAL_WRITES_ENABLED;
 try{
  process.env.LOOKE_M3_SOCIAL_WRITES_ENABLED="false";
  assert.equal((await social(0,"post",{body:"must not persist"})).status,503);
  assert.equal((await engage(1,"like")).status,503);
  assert.equal((await notificationPost(request("/api/experience/notifications","POST",sessions[0],
   {action:"mark_read"}))).status,503);
 }finally{process.env.LOOKE_M3_SOCIAL_WRITES_ENABLED=was;}
});
