import assert from "node:assert/strict";
import {after,test} from "node:test";
import {randomBytes} from "node:crypto";
import {NextRequest} from "next/server";
import {privateKeyToAccount} from "viem/accounts";
import {bytesToHex} from "viem";
import {Pool} from "pg";
import {COOKIE_NAME} from "../src/lib/social/auth";
import {query,socialDb} from "../src/lib/social/db";
import {POST as authPOST} from "../src/app/api/social/auth/route";
import {GET as m9GET} from "../src/app/api/experience/m9/route";
import {inspectM9OwnerSource} from "../src/lib/experience/m9-source-inspection";
import {digestM9Database,compareM9Databases,M9_REQUIRED_TABLES}
 from "../src/lib/experience/m9-restore";
const origin="http://localhost:3000";
process.env.LOOKE_SOCIAL_APP_ORIGIN=origin;
process.env.VERCEL_ENV="preview";
process.env.LOOKE_M2_IDENTITY_WRITES_ENABLED="true"; // ephemeral CI sign-in only
process.env.LOOKE_M3_SOCIAL_WRITES_ENABLED="false";
process.env.LOOKE_SOCIAL_WRITES_ENABLED="false";
process.env.LOOKE_M9_OPERATOR_READS_ENABLED="false";
process.env.LOOKE_PUBLIC_BETA_ENABLED="false";
process.env.LOOKE_M4_TRADING_ENABLED="false";
process.env.LOOKE_POINTS_ACCOUNTING_ENABLED="false";
process.env.LOOKE_M8_GAME_IMPORT_STAGE_ENABLED="false";
const wallets=[0,1].map(()=>privateKeyToAccount(bytesToHex(randomBytes(32))));
const addresses=wallets.map(x=>x.address.toLowerCase());
const sessions:string[]=[];
const restored=new Pool({connectionString:process.env.LOOKE_M9_TEST_RESTORE_URL||process.env.DATABASE_URL,
 max:1,connectionTimeoutMillis:8000});
function req(path:string,method:"GET"|"POST"="GET",i?:number,body?:Record<string,unknown>){
 return new NextRequest(origin+path,{method,headers:{
  ...(i!==undefined&&sessions[i]?{cookie:COOKIE_NAME+"="+sessions[i]}:{}),
  ...(method==="POST"?{"content-type":"application/json",origin}:{})
 },...(body?{body:JSON.stringify(body)}:{})});
}
async function sign(i:number){
 const a=await authPOST(req("/api/social/auth","POST",undefined,
  {action:"challenge",address:wallets[i].address}));
 assert.equal(a.status,200);
 const ch=await a.json() as {challengeId:string;message:string};
 const sig=await wallets[i].signMessage({message:ch.message});
 const b=await authPOST(req("/api/social/auth","POST",undefined,
  {action:"verify",challengeId:ch.challengeId,signature:sig}));
 assert.equal(b.status,200);
 const token=b.cookies.get(COOKIE_NAME)?.value;assert.ok(token);
 sessions[i]=token;
}
after(async()=>{
 await query("DELETE FROM social_posts WHERE author=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_rate_windows WHERE actor=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_auth_challenges WHERE address=ANY($1::text[])",[addresses]);
 await query("DELETE FROM social_profiles WHERE address=ANY($1::text[])",[addresses]);
 await Promise.allSettled([socialDb().end(),restored.end()]);
});
test("M9 full actual disposable PostgreSQL source and separate disposable copy match; not a real restored backup",async()=>{
 assert.ok(process.env.LOOKE_M9_TEST_RESTORE_URL,"Isolated CI-only restore DATABASE URL required.");
 const a=await socialDb().connect(),b=await restored.connect();
 try{
  const [p,r]=await Promise.all([
   digestM9Database(a,{enforceTLS:false,pageSize:20,maxRowsPerTable:5000}),
   digestM9Database(b,{enforceTLS:false,pageSize:20,maxRowsPerTable:5000})
  ]);
  assert.ok(p.tableCount>=M9_REQUIRED_TABLES.length);
  assert.equal(p.tableCount,r.tableCount);
  assert.equal(p.tlsObserved,false);assert.equal(r.tlsObserved,false);
  const comparison=compareM9Databases(p,r);
  assert.equal(comparison.status,"technical_digests_match");
  assert.equal(comparison.independentHumanRestoreWitness,false);
  assert.equal(comparison.originalBackupProvenanceVerified,false);
  assert.equal(comparison.releaseDecision,"NO_GO");
 }finally{a.release();b.release();}
});
test("M9 two authentically signed ephemeral wallets, original consumed challenges, owner isolation",async()=>{
 for(let i=0;i<2;i++)await sign(i);
 const source=await socialDb().connect();
 try{
  const own=await inspectM9OwnerSource(source,wallets[0].address,{enforceTLS:false});
  const other=await inspectM9OwnerSource(source,wallets[1].address,{enforceTLS:false});
  assert.equal(own.readOnly,true);
  assert.equal(own.status,"original_read_only_snapshot");
  assert.equal(own.counts.sessions,1);assert.equal(own.counts.consumed_challenges,1);
  assert.equal(other.counts.sessions,1);assert.equal(other.counts.consumed_challenges,1);
  assert.equal(own.counts.posts,0);assert.equal(own.counts.approved_media,0);
  assert.equal(own.counts.game_quarantine,0);
  assert.equal(own.counts.deployment_drafts,0);assert.equal(own.counts.market_review_drafts,0);
  assert.equal(own.sourceGameEventsValidated,false);assert.equal(own.fullAntiSybilApproved,false);
  assert.equal(own.walletSessionSignatureIndependentlyWitnessed,false);
 }finally{source.release();}
 assert.equal((await m9GET(req("/api/experience/m9?mode=config","GET"))).status,200);
 const config=await m9GET(req("/api/experience/m9?mode=config"));
 const data=await config.json() as {releaseDecision:string;liveSourceQueries:number;
  originalAuditorFindingFilesAvailable?:boolean};
 assert.equal(data.releaseDecision,"NO_GO");assert.equal(data.liveSourceQueries,0);
 // Live gate OFF by default; even a valid CI wallet cannot self-approve.
 const blocked=await m9GET(req("/api/experience/m9?mode=live","GET",0));
 assert.equal(blocked.status,503);
 process.env.LOOKE_M9_OPERATOR_READS_ENABLED="true";
 try{
  const unauth=await m9GET(req("/api/experience/m9?mode=live"));
  assert.equal(unauth.status,401);
  const result=await m9GET(req("/api/experience/m9?mode=live","GET",0));
  assert.equal(result.status,200);
  const current=await result.json() as {releaseDecision:string;backend:{status:string};
   realIndependentWitnessesVerified:number;financialActionsAttempted:number};
  assert.equal(current.backend.status,"blocked_original_tls_source");
  assert.equal(current.releaseDecision,"NO_GO");
  assert.equal(current.realIndependentWitnessesVerified,0);
  assert.equal(current.financialActionsAttempted,0);
 }finally{process.env.LOOKE_M9_OPERATOR_READS_ENABLED="false";}
});
test("M9 no fake restore claims: real signed-in local source drift differs from separate test database",async()=>{
 const a=await socialDb().connect(),b=await restored.connect();
 try{
  const [p,r]=await Promise.all([
   digestM9Database(a,{enforceTLS:false,pageSize:25,maxRowsPerTable:5000}),
   digestM9Database(b,{enforceTLS:false,pageSize:25,maxRowsPerTable:5000})
  ]);
  assert.equal(compareM9Databases(p,r).status,"blocked_drift");
  assert.equal(p.tables.find(x=>x.table==="social_profiles")?.rows,2);
  assert.equal(r.tables.find(x=>x.table==="social_profiles")?.rows,0);
 }finally{a.release();b.release();}
});
test("M9 read-only PostgreSQL snapshot enforces SQL-level no writes",async()=>{
 const db=await socialDb().connect();
 try{
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const mode=await db.query<{transaction_read_only:string}>("SHOW transaction_read_only");
  assert.equal(mode.rows[0].transaction_read_only,"on");
  await assert.rejects(()=>db.query(`INSERT INTO social_profiles(address,handle)
   VALUES($1,$2)`,[addresses[0],"m9_unauthorized"]),/read-only transaction/i);
  await db.query("ROLLBACK");
 }finally{db.release();}
});
