import assert from "node:assert/strict";
import {after,test} from "node:test";
import {randomBytes} from "node:crypto";
import {NextRequest} from "next/server";
import {privateKeyToAccount} from "viem/accounts";
import {bytesToHex} from "viem";
import {query,socialDb} from "../src/lib/social/db";
import {COOKIE_NAME} from "../src/lib/social/auth";
import {inspectM5Envelope} from "../src/lib/experience/m5-message-safety";
import {POST as authPost} from "../src/app/api/social/auth/route";
import {GET as requestsGet,POST as requestsPost} from "../src/app/api/experience/messaging/requests/route";
import {GET as notificationGet} from "../src/app/api/experience/notifications/route";
import {POST as controlsPost} from "../src/app/api/social/controls/route";
import {POST as socialPost} from "../src/app/api/social/route";
import {GET as readiness} from "../src/app/api/experience/messaging/readiness/route";

// CI ONLY: ephemeral local signed wallets + disposable PostgreSQL. No real
// user, key server, Cloudinary, Ultra RPC, message, ciphertext or live delivery.
process.env.LOOKE_SOCIAL_APP_ORIGIN="http://localhost:3000";
process.env.LOOKE_PUBLIC_BETA_ENABLED="false";
process.env.LOOKE_SOCIAL_WRITES_ENABLED="false";
process.env.LOOKE_M2_IDENTITY_WRITES_ENABLED="true";
process.env.LOOKE_M3_SOCIAL_WRITES_ENABLED="true";
process.env.LOOKE_M5_MESSAGE_REQUEST_WRITES_ENABLED="true";
const wallets=Array.from({length:3},()=>privateKeyToAccount(bytesToHex(randomBytes(32))));
const addresses=wallets.map(x=>x.address.toLowerCase()),tokens:string[]=[];
const server="http://localhost:3000";
function req(path:string,method:"GET"|"POST"="GET",index?:number,body?:Record<string,unknown>,origin=server){
 return new NextRequest(server+path,{
  method,
  headers:{...(index!==undefined&&tokens[index]?{cookie:COOKIE_NAME+"="+tokens[index]}:{}),
   ...(method==="POST"?{origin,"content-type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
}
async function sign(i:number){
 const issued=await authPost(req("/api/social/auth","POST",undefined,
  {action:"challenge",address:wallets[i].address}));
 assert.equal(issued.status,200);
 const challenge=await issued.json() as {challengeId:string;message:string};
 const signature=await wallets[i].signMessage({message:challenge.message});
 const auth=await authPost(req("/api/social/auth","POST",undefined,
  {action:"verify",challengeId:challenge.challengeId,signature}));
 assert.equal(auth.status,200);
 const token=auth.cookies.get(COOKIE_NAME)?.value;assert.ok(token);tokens[i]=token;
}
const create=(i:number,data:Record<string,unknown>)=>requestsPost(req("/api/experience/messaging/requests","POST",i,data));
const list=(i?:number)=>requestsGet(req("/api/experience/messaging/requests","GET",i));
after(async()=>{
 await query("DELETE FROM social_rate_windows WHERE actor=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_auth_challenges WHERE address=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_profiles WHERE address=ANY($1::text[])",[addresses]);
 await socialDb().end();
});
test("M5 signed sessions required, invalid origin and spoofed payload denied",async()=>{
 for(let i=0;i<3;i++)await sign(i);
 assert.equal((await list()).status,401);
 assert.equal((await create(0,{action:"request",target:addresses[0]})).status,400);
 assert.equal((await requestsPost(req("/api/experience/messaging/requests","POST",0,
  {action:"request",target:addresses[1]},"https://attacker.example"))).status,403);
 assert.equal((await requestsPost(req("/api/experience/messaging/requests","POST",undefined,
  {action:"request",target:addresses[1]}))).status,401);
 assert.equal((await create(0,{action:"request",target:addresses[1],sender:addresses[2]})).status,400);
});
test("M5 genuine PostgreSQL owner-controlled incoming request; duplicates, spoof and self rejected",async()=>{
 const result=await create(0,{action:"request",target:addresses[1]});
 assert.equal(result.status,200);
 const data=await result.json() as {requestId:string;status:string;transportEnabled:boolean};
 assert.equal(data.status,"pending");assert.equal(data.transportEnabled,false);
 assert.equal((await create(0,{action:"request",target:addresses[1]})).status,409);
 assert.equal((await create(1,{action:"request",target:addresses[0]})).status,409);
 const rows=await query<{requester:string;recipient:string}>(
  "SELECT requester,recipient FROM social_dm_requests WHERE id=$1",[data.requestId]);
 assert.equal(rows.rows[0].requester,addresses[0]);
 assert.equal(rows.rows[0].recipient,addresses[1]);
 const a=await list(0),b=await list(1),c=await list(2);
 assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(c.status,200);
 assert.deepEqual((await a.json() as {requests:{id:string;direction:string}[]}).requests.map(x=>x.direction),["outgoing"]);
 assert.deepEqual((await b.json() as {requests:{id:string;direction:string}[]}).requests.map(x=>x.direction),["incoming"]);
 assert.equal((await c.json() as {requests:unknown[]}).requests.length,0);
 // Request-derived notification exists only for actual recipient and omits message content.
 const n1=await notificationGet(req("/api/experience/notifications","GET",1));
 const e1=(await n1.json() as {events:{id:string;text:string}[]}).events;
 assert.equal(e1.filter(x=>x.id==="request:"+data.requestId).length,1);
 assert.match(e1.find(x=>x.id==="request:"+data.requestId)?.text||"",/messaging disabled/);
 const n0=await notificationGet(req("/api/experience/notifications","GET",0));
 assert.equal((await n0.json() as {events:{id:string}[]}).events.filter(x=>x.id==="request:"+data.requestId).length,0);
 const aAccept=await create(0,{action:"accept",requestId:data.requestId});
 assert.equal(aAccept.status,409);
 const bAccept=await create(1,{action:"accept",requestId:data.requestId,recipient:addresses[2]});
 assert.equal(bAccept.status,400);
 const accepted=await create(1,{action:"accept",requestId:data.requestId});
 assert.equal(accepted.status,200);
 assert.equal((await accepted.json() as {transportEnabled:boolean}).transportEnabled,false);
 assert.equal((await create(1,{action:"accept",requestId:data.requestId})).status,409);
 const msg=await socialPost(req("/api/social","POST",1,
  {action:"message",recipient:addresses[0],body:"plaintext prohibited"}));
 assert.equal(msg.status,501);
 const table=await query<{n:number}>("SELECT count(*)::int AS n FROM social_dm_envelopes");
 assert.equal(table.rows[0].n,0);
 const after=await notificationGet(req("/api/experience/notifications","GET",1));
 assert.equal((await after.json() as {events:{id:string}[]}).events.filter(x=>x.id==="request:"+data.requestId).length,0);
});
test("M5 block/mute suppress request initiation, recipient visibility and request notifications",async()=>{
 // B mutes C. C cannot request B in either direction, including pending spam.
 const mute=await controlsPost(req("/api/social/controls","POST",1,
  {action:"mute",target:addresses[2]}));
 assert.equal(mute.status,200);
 assert.equal((await create(2,{action:"request",target:addresses[1]})).status,409);
 assert.equal((await create(1,{action:"request",target:addresses[2]})).status,409);
 const blocked=await socialPost(req("/api/social","POST",2,
  {action:"block",target:addresses[0]}));
 assert.equal(blocked.status,200);
 assert.equal((await create(0,{action:"request",target:addresses[2]})).status,409);
 assert.equal((await create(2,{action:"request",target:addresses[0]})).status,409);
 assert.equal((await list(2)).status,200);
});
test("M5 operator flag off closes requests but not read-only no-message readiness",async()=>{
 const before=process.env.LOOKE_M5_MESSAGE_REQUEST_WRITES_ENABLED;
 try{
  process.env.LOOKE_M5_MESSAGE_REQUEST_WRITES_ENABLED="false";
  assert.equal((await create(0,{action:"request",target:addresses[2]})).status,503);
  const read=await readiness();
  assert.equal(read.status,200);
  const info=await read.json() as {transport:string;messagesSent:number;requestMetadataConfigured:boolean;liveMessagingEnabled:boolean};
  assert.equal(info.transport,"disabled");
  assert.equal(info.messagesSent,0);
  assert.equal(info.requestMetadataConfigured,false);
  assert.equal(info.liveMessagingEnabled,false);
 }finally{process.env.LOOKE_M5_MESSAGE_REQUEST_WRITES_ENABLED=before;}
});
test("M5 nonce replay registry and key-version tables reject duplicates without storing plaintext",async()=>{
 const pubA=Buffer.alloc(32,3).toString("base64"),pubB=Buffer.alloc(32,4).toString("base64");
 await query("INSERT INTO social_dm_key_versions(owner,key_version,public_key) VALUES ($1,1,$2),($3,1,$4)",
  [addresses[0],pubA,addresses[1],pubB]);
 await assert.rejects(()=>query("INSERT INTO social_dm_key_versions(owner,key_version,public_key) VALUES($1,1,$2)",
  [addresses[0],pubA]),/duplicate|unique/i);
 const envelope={version:1,algorithm:"x25519-xsalsa20-poly1305",
  senderKeyVersion:1,recipientKeyVersion:1,
  nonce:Buffer.alloc(24,7).toString("base64"),ciphertext:Buffer.alloc(64,3).toString("base64")};
 const inspected=inspectM5Envelope(envelope,addresses[0],addresses[1]);
 const args=[inspected.sender,inspected.recipient,1,1,inspected.nonceDigest];
 const sql="INSERT INTO social_dm_nonce_registry(sender,recipient,sender_key_version,recipient_key_version,nonce_digest) VALUES($1,$2,$3,$4,$5)";
 await query(sql,args);
 await assert.rejects(()=>query(sql,args),/duplicate|unique/i);
 const bad=await query<{nonce_digest:string}>(
  "SELECT nonce_digest FROM social_dm_nonce_registry WHERE sender=$1 AND recipient=$2",[addresses[0],addresses[1]]);
 assert.equal(bad.rowCount,1);
 assert.ok(!JSON.stringify(bad.rows).includes(envelope.ciphertext));
 assert.equal((await query("SELECT id FROM social_dm_envelopes")).rowCount,0);
});
