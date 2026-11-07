import assert from "node:assert/strict";
import {after,test} from "node:test";
import {randomBytes} from "node:crypto";
import {NextRequest} from "next/server";
import {privateKeyToAccount} from "viem/accounts";
import {bytesToHex} from "viem";
import {COOKIE_NAME} from "../src/lib/social/auth";
import {query,socialDb} from "../src/lib/social/db";
import {POST as authPost} from "../src/app/api/social/auth/route";
import {GET as portfolioGet} from "../src/app/api/experience/m8/portfolio/route";
import {GET as pointsGet} from "../src/app/api/experience/m8/points/route";
import {GET as gameGet,POST as gamePost} from "../src/app/api/experience/m8/game-imports/route";
import {m8GameStatement} from "../src/lib/experience/m8-game-evidence";
const origin="http://localhost:3000";
process.env.LOOKE_SOCIAL_APP_ORIGIN=origin;
process.env.VERCEL_ENV="preview";
process.env.LOOKE_SOCIAL_WRITES_ENABLED="false";
process.env.LOOKE_M2_IDENTITY_WRITES_ENABLED="true";
process.env.LOOKE_M3_SOCIAL_WRITES_ENABLED="true";
process.env.LOOKE_M8_SOURCE_AUDIT_APPROVED="true";
process.env.LOOKE_M8_GAME_IMPORT_STAGE_ENABLED="true";
process.env.LOOKE_M8_SOURCE_SLUG="ultra-rush";
process.env.LOOKE_PUBLIC_BETA_ENABLED="false";
process.env.LOOKE_M7_OPERATOR_SOURCE_APPROVED="false";
process.env.LOOKE_POINTS_ACCOUNTING_ENABLED="false";
const wallets=Array.from({length:4},()=>privateKeyToAccount(bytesToHex(randomBytes(32))));
const addresses=wallets.map(x=>x.address.toLowerCase()),cookies:string[]=[];
process.env.LOOKE_M8_SOURCE_ISSUER=wallets[2].address;
process.env.LOOKE_M8_INDEPENDENT_REVIEWER=wallets[3].address;
let seasonId:string;
function req(path:string,method:"GET"|"POST"="GET",i?:number,data?:Record<string,unknown>,usedOrigin=origin){
 return new NextRequest(origin+path,{method,headers:{
  ...(i!==undefined&&cookies[i]?{cookie:COOKIE_NAME+"="+cookies[i]}:{}),
  ...(method==="POST"?{"content-type":"application/json",origin:usedOrigin}:{})
 },...(data?{body:JSON.stringify(data)}:{})});
}
async function sign(i:number){
 const result=await authPost(req("/api/social/auth","POST",undefined,
  {action:"challenge",address:wallets[i].address}));
 assert.equal(result.status,200);
 const challenge=await result.json() as {challengeId:string;message:string};
 const sig=await wallets[i].signMessage({message:challenge.message});
 const auth=await authPost(req("/api/social/auth","POST",undefined,
  {action:"verify",challengeId:challenge.challengeId,signature:sig}));
 assert.equal(auth.status,200);
 const c=auth.cookies.get(COOKIE_NAME)?.value;assert.ok(c);cookies[i]=c;
}
async function signedGame(ownerIndex:number,changes:Record<string,unknown>={}){
 const ts=Date.now();
 const base={
  source:"ultra-rush",eventId:"game-run-001",owner:wallets[ownerIndex].address,
  sourceIdentityHash:"0x"+"a".repeat(64),sourceRecordHash:"0x"+"b".repeat(64),
  seasonId,points:25,occurredAt:new Date(ts-3600_000).toISOString(),
  issuedAt:new Date(ts-10_000).toISOString(),expiresAt:new Date(ts+240_000).toISOString(),
  nonce:randomBytes(16).toString("hex"),...changes
 };
 const message=m8GameStatement(base as Parameters<typeof m8GameStatement>[0],origin);
 return {...base,issuerSignature:await wallets[2].signMessage({message}),
  reviewerSignature:await wallets[3].signMessage({message})};
}
after(async()=>{
 await query("DELETE FROM social_game_import_candidates_m8 WHERE owner=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_game_source_identities_m8 WHERE owner=ANY($1::text[])",[addresses]);
 if(seasonId)await query("DELETE FROM social_points_seasons WHERE id=$1",[seasonId]);
 await query("DELETE FROM social_rate_windows WHERE actor=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_auth_challenges WHERE address=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_profiles WHERE address=ANY($1::text[])",[addresses]);
 await socialDb().end();
});
test("M8 signed wallet accounts, real social season and NO-GO portfolio",async()=>{
 for(let i=0;i<4;i++)await sign(i);
 const now=new Date();
 const start=new Date(now.getTime()-86400_000),end=new Date(now.getTime()+86400_000);
 const vestStart=new Date(now.getTime()+2*86400_000),
  cliff=new Date(now.getTime()+3*86400_000),vestEnd=new Date(now.getTime()+5*86400_000);
 const s=await query<{id:string}>(`
  INSERT INTO social_points_seasons(slug,title,state,starts_at,ends_at,
  vest_start_at,vest_cliff_at,vest_end_at)
  VALUES($1,'Verified-source CI season','active',$2,$3,$4,$5,$6)
  RETURNING id`,
  ["m8-test-"+randomBytes(6).toString("hex"),start,end,vestStart,cliff,vestEnd]);
 seasonId=s.rows[0].id;
 assert.equal((await portfolioGet(req("/api/experience/m8/portfolio"))).status,401);
 const blocked=await portfolioGet(req("/api/experience/m8/portfolio","GET",0));
 assert.equal(blocked.status,503);
 const data=await blocked.json() as {verifiedHoldings:null;transactionsSent:number};
 assert.equal(data.verifiedHoldings,null);assert.equal(data.transactionsSent,0);
 const analytics=await portfolioGet(req("/api/experience/m8/portfolio?mode=creator","GET",0));
 assert.equal(analytics.status,200);
 const actual=await analytics.json() as {socialActivity:{posts:number};profits:null};
 assert.equal(actual.socialActivity.posts,0);assert.equal(actual.profits,null);
});
test("M8 correct original issuer and independent reviewer signatures quarantine only; no points credit",async()=>{
 const data=await signedGame(0);
 const before=await pointsGet(req("/api/experience/m8/points","GET",0));
 assert.equal(before.status,200);
 assert.equal((await gameGet(req("/api/experience/m8/game-imports"))).status,401);
 assert.equal((await gamePost(req("/api/experience/m8/game-imports","POST",undefined,data))).status,401);
 assert.equal((await gamePost(req("/api/experience/m8/game-imports","POST",0,data,"https://evil.example"))).status,403);
 const inserted=await gamePost(req("/api/experience/m8/game-imports","POST",0,data));
 assert.equal(inserted.status,200);
 const created=await inserted.json() as {status:string;pointsCredited:number;originalGameSourceAuditedByThisAPI:boolean};
 assert.equal(created.status,"quarantined");assert.equal(created.pointsCredited,0);
 assert.equal(created.originalGameSourceAuditedByThisAPI,false);
 const stored=await query<{owner:string;status:string;claimed_points:number}>(
  "SELECT owner,status,claimed_points FROM social_game_import_candidates_m8 WHERE source_event_id=$1",["game-run-001"]);
 assert.equal(stored.rows[0].owner,addresses[0]);assert.equal(stored.rows[0].status,"quarantined");
 assert.equal(stored.rows[0].claimed_points,25);
 const own=await gameGet(req("/api/experience/m8/game-imports","GET",0));
 assert.equal((await own.json() as {records:{source_event_id:string}[]}).records[0].source_event_id,"game-run-001");
 const other=await gameGet(req("/api/experience/m8/game-imports","GET",1));
 assert.equal((await other.json() as {records:unknown[]}).records.length,0);
 const points=await pointsGet(req("/api/experience/m8/points","GET",0));
 assert.equal(points.status,200);
 const proof=await points.json() as {ledger:{
  creditedGamePoints:string;gameImportCandidateCount:number;verifiedApprovedSocialPoints:string|null;
  receipt:{independentWitnessSigned:boolean};pointsConversionEnabled:boolean
 }};
 assert.equal(proof.ledger.creditedGamePoints,"0");assert.equal(proof.ledger.gameImportCandidateCount,1);
 assert.equal(proof.ledger.verifiedApprovedSocialPoints,"0");
 assert.equal(proof.ledger.receipt.independentWitnessSigned,false);
 assert.equal(proof.ledger.pointsConversionEnabled,false);
});
test("M8 tamper, replay, cross-wallet identity and event duplicate attacks fail closed",async()=>{
 const original=await signedGame(0,{eventId:"game-run-001"});
 assert.equal((await gamePost(req("/api/experience/m8/game-imports","POST",0,original))).status,409);
 const wrongWallet=await signedGame(1,{eventId:"game-run-002"});
 assert.equal((await gamePost(req("/api/experience/m8/game-imports","POST",1,wrongWallet))).status,409);
 const another=await signedGame(1,{eventId:"game-run-001",sourceIdentityHash:"0x"+"c".repeat(64),
  sourceRecordHash:"0x"+"d".repeat(64)});
 assert.equal((await gamePost(req("/api/experience/m8/game-imports","POST",1,another))).status,409);
 const tamper=await signedGame(0,{eventId:"game-run-003"});
 assert.equal((await gamePost(req("/api/experience/m8/game-imports","POST",0,
  {...tamper,points:999999}))).status,400);
 // A test fixture's quarantined row cannot become approved, paid or minted.
 await assert.rejects(()=>query("UPDATE social_game_import_candidates_m8 SET status='approved' WHERE source_event_id=$1",["game-run-001"]),/check constraint/i);
 assert.equal((await query("SELECT count(*)::int AS n FROM social_points_ledger WHERE owner=$1",[addresses[0]])).rows[0].n,0);
});
test("M8 stage flag disabled keeps owner-only read-only records; no upload with source disabled",async()=>{
 const old=process.env.LOOKE_M8_GAME_IMPORT_STAGE_ENABLED;
 try{
  process.env.LOOKE_M8_GAME_IMPORT_STAGE_ENABLED="false";
  const data=await signedGame(0,{eventId:"game-run-004"});
  assert.equal((await gamePost(req("/api/experience/m8/game-imports","POST",0,data))).status,503);
  assert.equal((await gameGet(req("/api/experience/m8/game-imports","GET",0))).status,200);
  assert.equal((await pointsGet(req("/api/experience/m8/points","GET",0))).status,200);
 }finally{process.env.LOOKE_M8_GAME_IMPORT_STAGE_ENABLED=old;}
});
