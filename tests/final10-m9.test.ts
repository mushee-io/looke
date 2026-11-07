import assert from "node:assert/strict";
import {test} from "node:test";
import {assessM9Evidence,m9AllFeatureFlagsClosed,M9_GATE_NAMES,m9BaseBlockers}
 from "../src/lib/experience/m9-gates";
import {compareM9Databases,M9_REQUIRED_TABLES,requireOriginalSeparateTLSRestore,type M9DatabaseDigest}
 from "../src/lib/experience/m9-restore";
import {m9SafeRollbackPlan,inspectM9OwnerSource} from "../src/lib/experience/m9-source-inspection";
const sha="b54131a4e6f04b7888fd47a299157fa1d432000e";
const closed={LOOKE_SOCIAL_WRITES_ENABLED:"false",LOOKE_M4_TRADING_ENABLED:"false",
 LOOKE_PUBLIC_BETA_ENABLED:"false",LOOKE_M2_IDENTITY_WRITES_ENABLED:"false",
 LOOKE_M3_SOCIAL_WRITES_ENABLED:"false",LOOKE_M8_GAME_IMPORT_STAGE_ENABLED:"false"};
test("M9 exact immutable gate IDs and all flags remain closed by default",()=>{
 assert.equal(M9_GATE_NAMES.length,16);
 assert.equal(M9_REQUIRED_TABLES.length,26);
 assert.equal(m9AllFeatureFlagsClosed(closed),true);
 assert.deepEqual(Object.keys(m9BaseBlockers()).sort(),[...M9_GATE_NAMES].sort());
 for(const name of ["LOOKE_M4_TRADING_ENABLED","LOOKE_PUBLIC_BETA_ENABLED",
  "LOOKE_M8_GAME_IMPORT_STAGE_ENABLED","LOOKE_M5_MESSAGE_REQUEST_WRITES_ENABLED",
  "LOOKE_M7_MARKET_REVIEW_WRITES_ENABLED","LOOKE_SOCIAL_WRITES_ENABLED"])
  assert.equal(m9AllFeatureFlagsClosed({...closed,[name]:"true"}),false,name);
 assert.equal(m9AllFeatureFlagsClosed({...closed,LOOKE_M4_MARKETS_JSON:'[{"fake":true}]'}),false);
});
test("M9 every external source status cannot turn into human GO",()=>{
 const observations=Object.fromEntries(M9_GATE_NAMES.map(id=>[id,{id,
  status:"source_verified_read_only",source:"original-test-evidence",
  reference:"test-only-reference",note:"Technical fixture only; no release proof."
 }])) as Parameters<typeof assessM9Evidence>[0]["observations"];
 const report=assessM9Evidence({env:closed,observations,
  previewSha:sha,previewOrigin:"https://looke-test.vercel.app",
  time:new Date("2026-11-07T17:00:00Z")});
 assert.equal(report.gates.length,16);assert.equal(report.technicalChecksPassed,16);
 assert.equal(report.releaseDecision,"NO_GO");assert.equal(report.publicBetaOpen,false);
 assert.equal(report.realWalletTransactionsSent,0);assert.equal(report.independentHumanApprovalsVerified,0);
 assert.equal(report.externalAuditFindingsApproved,false);
 assert.equal(report.signedIndependentRollbackWitness,false);
 assert.equal(report.productionPromotionAllowed,false);assert.equal(report.pointsConversionEnabled,false);
 assert.match(report.technicalDigestSha256,/^[0-9a-f]{64}$/);
 const drift=assessM9Evidence({env:{...closed,LOOKE_M7_MARKET_REVIEW_WRITES_ENABLED:"true"},observations});
 assert.equal(drift.closedFlags,false);assert.equal(drift.technicalChecksPassed,0);
 assert.equal(drift.technicalChecksBlocked,16);
 assert.throws(()=>assessM9Evidence({env:closed,observations:{m3_owner_social_records:{
  id:"m5_message_send_disabled",status:"source_verified_read_only",
  source:"original",reference:"reference",note:"invalid gate"}}}),/identity/);
 assert.throws(()=>assessM9Evidence({env:closed,observations:{hacked:{
  status:"source_verified_read_only"}} as never}),/Unrecognized/);
});
test("M9 restore checks all schema + entire rows, catches drift, no implied witnesses",()=>{
 const list=M9_REQUIRED_TABLES.map(table=>({table,rows:0,rowSha256:"a".repeat(64),
  schemaSha256:"b".repeat(64),complete:true as const}));
 const make=(tables:typeof list):M9DatabaseDigest=>({
  tables,manifestSha256:"c".repeat(64),rowScanComplete:true,tlsObserved:false,
  tableCount:tables.length,source:"read_only_repeatable_read_pg"
 });
 const one=make(list),same=make(list.map(x=>({...x})));
 const matched=compareM9Databases(one,same);
 assert.equal(matched.status,"technical_digests_match");
 assert.equal(matched.originalBackupProvenanceVerified,false);
 assert.equal(matched.independentHumanRestoreWitness,false);
 assert.equal(matched.releaseDecision,"NO_GO");
 for(const tweak of [
  list.slice(1),list.map((x,i)=>i===0?{...x,rows:1}:x),
  list.map((x,i)=>i===0?{...x,rowSha256:"d".repeat(64)}:x),
  list.map((x,i)=>i===0?{...x,schemaSha256:"d".repeat(64)}:x)
 ])assert.equal(compareM9Databases(one,make(tweak)).status,"blocked_drift");
 assert.throws(()=>requireOriginalSeparateTLSRestore(
  "postgres://u:p@db.example/t?sslmode=verify-full",
  "postgres://u:p@db.example/t?sslmode=verify-full"),/independently addressable/);
 assert.throws(()=>requireOriginalSeparateTLSRestore(
  "postgres://u:p@db.example/one",
  "postgres://u:p@db.example/two"),/TLS/);
});
test("M9 Preview rollback rehearsal plans never change or authorize production",()=>{
 const a={previewId:"dpl_DH4CVzbSJ1yZj8MYYAmXyvLU3VA5",
  previewSha:sha,protectedOrigin:"https://looke-test.vercel.app",
  originalProductionAlias:"looke-alpha.vercel.app",
  originalDeployment:"dpl_29EdVrfrJNTC5Q7gkZMcpaxLhQiG"};
 const ok=m9SafeRollbackPlan(a);
 assert.equal(ok.actualRollbackPerformed,false);assert.equal(ok.independentlyWitnessed,false);
 assert.equal(ok.productionChanged,false);assert.equal(ok.releaseDecision,"NO_GO");
 for(const x of [
  {...a,originalDeployment:"dpl_WRONGALIAS1234"},
  {...a,previewSha:"0x123"},
  {...a,protectedOrigin:"http://127.0.0.1"},
  {...a,candidateProductionChange:true}
 ])assert.throws(()=>m9SafeRollbackPlan(x));
});
test("M9 original-source owner audit refuses missing TLS before querying source rows",async()=>{
 const owner="0x"+"a".repeat(40),events:string[]=[];
 const fake={query:async(sql:string)=>{
  events.push(sql);
  if(sql.includes("pg_stat_ssl"))return {rows:[{ssl:false}]};
  throw Error("This must not be called without TLS.");
 }} as never;
 await assert.rejects(()=>inspectM9OwnerSource(fake,owner),/TLS/);
 assert.equal(events.length,1);
 await assert.rejects(()=>inspectM9OwnerSource(fake,"0x"+"0".repeat(40)),/wallet/);
});
