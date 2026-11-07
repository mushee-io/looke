import assert from "node:assert/strict";
import {after,test,mock} from "node:test";
import {randomBytes} from "node:crypto";
import {NextRequest} from "next/server";
import {privateKeyToAccount} from "viem/accounts";
import {bytesToHex} from "viem";
import {query,socialDb} from "../src/lib/social/db";
import {COOKIE_NAME} from "../src/lib/social/auth";
import {POST as authPost} from "../src/app/api/social/auth/route";
import {GET as uploadGET,POST as uploadPOST} from "../src/app/api/experience/media/route";
import {GET as socialGET,POST as socialPOST} from "../src/app/api/social/route";
import {POST as draftPOST} from "../src/app/api/experience/creator-draft/route";

// DISPOSABLE local CI PostgreSQL, fixture wallets and mocked provider only.
// Not evidence of any live Cloudinary account, real users or moderator approval.
process.env.LOOKE_SOCIAL_APP_ORIGIN="http://localhost:3000";
process.env.LOOKE_PUBLIC_BETA_ENABLED="false";
process.env.LOOKE_SOCIAL_WRITES_ENABLED="false";
process.env.LOOKE_M2_IDENTITY_WRITES_ENABLED="true";
process.env.LOOKE_M3_SOCIAL_WRITES_ENABLED="true";
process.env.LOOKE_M4_CREATOR_MEDIA_WRITES_ENABLED="true";
process.env.LOOKE_M4_MEDIA_MODERATION_WRITES_ENABLED="true";
process.env.LOOKE_MEDIA_UPLOADS_ENABLED="true";
process.env.LOOKE_CLOUDINARY_CLOUD_NAME="looke-ci";
process.env.LOOKE_CLOUDINARY_API_KEY="12345678901234";
process.env.LOOKE_CLOUDINARY_API_SECRET="ci-placeholder-only-no-real-provider-key-12345";

const wallets=Array.from({length:3},()=>privateKeyToAccount(bytesToHex(randomBytes(32))));
const address=wallets.map(w=>w.address.toLowerCase());
process.env.LOOKE_SOCIAL_MODERATORS=address[2];
const tokens:string[]=[];
let intent="",postId="",receiptAssetId="";
function req(endpoint:string,method:"GET"|"POST"="GET",index?:number,payload?:Record<string,unknown>,origin="http://localhost:3000"){
 return new NextRequest("http://localhost:3000"+endpoint,{
  method,
  headers:{
   ...(index!==undefined&&tokens[index]?{cookie:COOKIE_NAME+"="+tokens[index]}:{}),
   ...(method==="POST"?{"content-type":"application/json",origin}:{})
  },
  ...(payload?{body:JSON.stringify(payload)}:{})
 });
}
async function sign(index:number){
 const challenge=await authPost(req("/api/social/auth","POST",undefined,
  {action:"challenge",address:wallets[index].address}));
 assert.equal(challenge.status,200);
 const issued=await challenge.json() as {challengeId:string;message:string};
 const signature=await wallets[index].signMessage({message:issued.message});
 const res=await authPost(req("/api/social/auth","POST",undefined,
  {action:"verify",challengeId:issued.challengeId,signature}));
 assert.equal(res.status,200);
 const token=res.cookies.get(COOKIE_NAME)?.value;
 assert.ok(token);tokens[index]=token;
}
const social=(index:number,action:string,data:Record<string,unknown>={})=>
 socialPOST(req("/api/social","POST",index,{action,...data}));
const upload=(index:number,action:string,data:Record<string,unknown>={})=>
 uploadPOST(req("/api/experience/media","POST",index,{action,...data}));

after(async()=>{
 mock.restoreAll();
 await query("DELETE FROM social_moderation_audit WHERE moderator=ANY($1::text[])",[address]);
 await query("DELETE FROM social_rate_windows WHERE actor=ANY($1::text[])",[address]);
 await query("DELETE FROM social_auth_challenges WHERE address=ANY($1::text[])",[address]);
 await query("DELETE FROM social_profiles WHERE address=ANY($1::text[])",[address]);
 await socialDb().end();
});
test("M4 signs three distinct test-wallet sessions; rejects unapproved image and cross-origin authorization",async()=>{
 for(let i=0;i<3;i++)await sign(i);
 const anonymous=await uploadPOST(req("/api/experience/media","POST",undefined,
  {action:"authorize",kind:"image",mime:"image/png",bytes:1024}));
 assert.equal(anonymous.status,401);
 const wrongOrigin=await uploadPOST(req("/api/experience/media","POST",0,
  {action:"authorize",kind:"image",mime:"image/png",bytes:1024},"https://evil.example"));
 assert.equal(wrongOrigin.status,403);
 for(const bad of [
  {action:"authorize",kind:"video",mime:"image/png",bytes:1024},
  {action:"authorize",kind:"image",mime:"image/png",bytes:5_000_001},
  {action:"authorize",kind:"image",mime:"image/svg+xml",bytes:1024}
 ]){
  const response=await uploadPOST(req("/api/experience/media","POST",0,bad));
  assert.equal(response.status,400);
 }
});
test("M4 real PostgreSQL owner upload authorization and mocked authenticated provider receipt",async()=>{
 const authorized=await upload(0,"authorize",{kind:"image",mime:"image/png",bytes:1024});
 assert.equal(authorized.status,200);
 const data=await authorized.json() as {intentId:string;uploadUrl:string;apiKey:string;fields:Record<string,string>};
 intent=data.intentId;
 assert.match(data.uploadUrl,/^https:\/\/api\.cloudinary\.com\/v1_1\/looke-ci\/image\/upload$/);
 assert.equal(data.fields.overwrite,"false");
 assert.match(data.fields.signature,/^[0-9a-f]{40}$/);
 assert.ok(!JSON.stringify(data).includes(process.env.LOOKE_CLOUDINARY_API_SECRET!));
 const stored=await query<{id:string;owner:string;public_id:string;issued_at:Date;expires_at:Date;state:string}>(
  "SELECT id,owner,public_id,issued_at,expires_at,state FROM social_media_uploads WHERE id=$1",[intent]);
 assert.equal(stored.rows[0].owner,address[0]);
 assert.equal(stored.rows[0].state,"issued");
 const wrong=await upload(1,"confirm",{intentId:intent});
 assert.equal(wrong.status,404);
 const asset={
  public_id:stored.rows[0].public_id,asset_id:"ci-m4-fixture-provider-asset-123456",
  resource_type:"image",type:"upload",format:"png",bytes:1024,
  secure_url:"https://res.cloudinary.com/looke-ci/image/upload/v123/"+stored.rows[0].public_id+".png",
  created_at:new Date(new Date(stored.rows[0].issued_at).getTime()+500).toISOString(),
  version:1794068000
 };
 receiptAssetId=asset.asset_id;
 // Authenticated server-side provider fetch is replaced only in isolated CI.
 let providerRequests=0;
 const stub=mock.method(globalThis,"fetch",async(input:unknown,init?:RequestInit)=>{
  providerRequests++;
  assert.match(String(input),/^https:\/\/api\.cloudinary\.com\/v1_1\/looke-ci\/resources\/image\/upload\//);
  assert.ok(String(init?.headers&& (init.headers as Record<string,string>).authorization).startsWith("Basic "));
  return new Response(JSON.stringify(asset),{status:200,headers:{"content-type":"application/json"}});
 });
 try{
  const confirmed=await upload(0,"confirm",{intentId:intent});
  assert.equal(confirmed.status,200);
  const proof=await confirmed.json() as {confirmed:boolean;evidence:{assetId:string};moderation:string};
  assert.equal(proof.confirmed,true);
  assert.equal(proof.evidence.assetId,receiptAssetId);
  assert.equal(proof.moderation,"pending-after-post");
  assert.equal(providerRequests,1);
  const idempotent=await upload(0,"confirm",{intentId:intent});
  assert.equal(idempotent.status,200);
  assert.equal(providerRequests,1);
 }finally{stub.mock.restore();}
 const ownerEvidence=await uploadGET(req("/api/experience/media?intentId="+encodeURIComponent(intent),"GET",0));
 assert.equal(ownerEvidence.status,200);
 const ev=await ownerEvidence.json() as {providerVerified:boolean;evidence:{provider_asset_id:string;owner?:string;state:string}};
 assert.equal(ev.providerVerified,true);
 assert.equal(ev.evidence.provider_asset_id,receiptAssetId);
 assert.equal(ev.evidence.state,"verified");
 const other=await uploadGET(req("/api/experience/media?intentId="+encodeURIComponent(intent),"GET",1));
 assert.equal(other.status,404);
 const guest=await uploadGET(req("/api/experience/media?intentId="+encodeURIComponent(intent)));
 assert.equal(guest.status,401);
});
test("M4 one-use upload attaches only to the original wallet, initially hidden from feed",async()=>{
 const hijack=await social(1,"post",{body:"Trying to steal media",mediaUploadId:intent});
 assert.equal(hijack.status,409);
 const posted=await social(0,"post",{body:"M4 CI-only moderated image",mediaUploadId:intent,author:address[1]});
 assert.equal(posted.status,200);
 const details=await posted.json() as {post:{id:string;media_status:string}};
 postId=details.post.id;
 assert.equal(details.post.media_status,"pending");
 const record=await query<{owner:string;state:string;post_id:string}>(
  "SELECT owner,state,post_id FROM social_media_uploads WHERE id=$1",[intent]);
 assert.equal(record.rows[0].owner,address[0]);
 assert.equal(record.rows[0].state,"attached");
 assert.equal(record.rows[0].post_id,postId);
 const privateFeed=await socialGET(req("/api/social?action=feed","GET",0));
 assert.equal(privateFeed.status,200);
 assert.ok(!(await privateFeed.json() as {posts:{id:string}[]}).posts.some(p=>p.id===postId));
 const publicFeed=await socialGET(req("/api/social?action=feed"));
 assert.ok(!(await publicFeed.json() as {posts:{id:string}[]}).posts.some(p=>p.id===postId));
 assert.equal((await social(0,"post",{body:"Replay upload",mediaUploadId:intent})).status,409);
 assert.equal((await social(0,"post",{body:"Forbidden token reference",
  asset:{assetType:"token",assetChain:"ultra-evm",assetId:address[1]}})).status,403);
 assert.equal((await social(0,"post",{body:"Raw URL forbidden",
  media:{url:"https://res.cloudinary.com/looke-ci/image/upload/v3/fake.png",kind:"image"}})).status,403);
});
test("M4 only authorized moderator can approve original attached provider proof, with audit",async()=>{
 const outsider=await social(1,"moderate",{operation:"approve_media",targetId:postId,reason:"Not authorized moderator"});
 assert.equal(outsider.status,403);
 const wrongAction=await social(2,"moderate",{operation:"suspend_profile",targetId:address[0],reason:"Not an M4 operation"});
 assert.equal(wrongAction.status,503);
 const approved=await social(2,"moderate",{operation:"approve_media",targetId:postId,
  reason:"Reviewed genuine provider evidence in disposable CI"});
 assert.equal(approved.status,200);
 const result=await approved.json() as {audited:boolean;auditId:string};
 assert.equal(result.audited,true);assert.match(result.auditId,/^[0-9a-f-]{36}$/i);
 const visible=await socialGET(req("/api/social?action=feed"));
 assert.ok((await visible.json() as {posts:{id:string}[]}).posts.some(p=>p.id===postId));
 const receipt=await uploadGET(req("/api/experience/media?intentId="+encodeURIComponent(intent),"GET",0));
 const proof=await receipt.json() as {evidence:{moderation_action:string;media_status:string;post_id:string}};
 assert.equal(proof.evidence.moderation_action,"approve_media");
 assert.equal(proof.evidence.media_status,"approved");
 assert.equal(proof.evidence.post_id,postId);
 const second=await social(2,"moderate",{operation:"approve_media",targetId:postId,reason:"No duplicate approval"});
 assert.equal(second.status,409); // A second moderation request has no pending provider-backed post.
});
test("M4 separate feature gate leaves token issuance, financial action and media writes disabled",async()=>{
 const token=await draftPOST(req("/api/experience/creator-draft","POST",0,{
  name:"Moonbeds",symbol:"MOON",pair:"ULTRA",description:"Testnet local draft",imageURI:"",
  metadataURI:"https://cdn.example.com/moonbeds/metadata.json"
 }));
 assert.equal(token.status,200);
 const draft=await token.json() as {owner:string;reviewed:{reviewOnly:boolean;deployable:boolean;chainId:number}};
 assert.equal(draft.owner,address[0]);assert.equal(draft.reviewed.reviewOnly,true);
 assert.equal(draft.reviewed.deployable,false);assert.equal(draft.reviewed.chainId,18881);
 const anonDraft=await draftPOST(req("/api/experience/creator-draft","POST",undefined,
  {name:"Moonbeds",symbol:"MOON",pair:"ULTRA"}));
 assert.equal(anonDraft.status,401);
 const env=process.env.LOOKE_M4_CREATOR_MEDIA_WRITES_ENABLED;
 try{
  process.env.LOOKE_M4_CREATOR_MEDIA_WRITES_ENABLED="false";
  assert.equal((await upload(0,"authorize",{kind:"image",mime:"image/png",bytes:1024})).status,503);
  assert.equal((await social(0,"post",{body:"Blocked media",mediaUploadId:intent})).status,403);
  assert.equal((await social(2,"moderate",{operation:"approve_media",targetId:postId,
   reason:"Should be closed"})).status,503);
 }finally{process.env.LOOKE_M4_CREATOR_MEDIA_WRITES_ENABLED=env;}
 const count=await query<{n:number}>("SELECT count(*)::integer AS n FROM social_posts WHERE media_url IS NOT NULL");
 assert.equal(count.rows[0].n,1);
});
