import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {accountingEnabled,dailyLimits,operatorAction,sourceKind,vestingAt} from "../src/lib/social/points";
import {utcActivityDay} from "../src/lib/social/points-evidence";
function source(file:string){return readFileSync(resolve(file),"utf8");}
test("M19 Points are fail-closed without an independently enabled accounting flag",()=>{
 const old=process.env.LOOKE_POINTS_ACCOUNTING_ENABLED;
 try{
  delete process.env.LOOKE_POINTS_ACCOUNTING_ENABLED;
  assert.equal(accountingEnabled(),false);
  process.env.LOOKE_POINTS_ACCOUNTING_ENABLED="yes";
  assert.equal(accountingEnabled(),false);
  process.env.LOOKE_POINTS_ACCOUNTING_ENABLED="true";
  assert.equal(accountingEnabled(),true);
 }finally{if(old===undefined)delete process.env.LOOKE_POINTS_ACCOUNTING_ENABLED;
 else process.env.LOOKE_POINTS_ACCOUNTING_ENABLED=old;}
});
test("Only supported social sources and exact reviewed operator actions are accepted",()=>{
 const id="11111111-1111-4111-8111-111111111111";
 assert.equal(operatorAction.parse({action:"queue",seasonId:id,kind:"post",sourceId:id}).action,"queue");
 assert.equal(operatorAction.parse({action:"review",entryId:id,decision:"approved",reason:"Source evidence checked"}).action,"review");
 assert.deepEqual(sourceKind.options,["post","comment","like_received","repost_received"]);
 for(const action of ["mint","claim","transfer","create_season","issue_tokens"]){
  assert.throws(()=>operatorAction.parse({action,seasonId:id,kind:"post",sourceId:id}));
 }
 assert.throws(()=>operatorAction.parse({action:"review",entryId:id,decision:"approved",reason:"short"}));
 assert.throws(()=>operatorAction.parse({action:"queue",seasonId:id,kind:"post",sourceId:id,owner:"0x00"}));
 assert.throws(()=>operatorAction.parse({action:"queue",seasonId:id,kind:"follow",sourceId:id}));
});
test("UTC activity day and bounded anti-farming policies are deterministic",()=>{
 assert.equal(utcActivityDay(new Date("2026-11-05T23:55:00.000Z")),"2026-11-05");
 assert.equal(utcActivityDay(new Date("2026-11-06T00:00:00.000Z")),"2026-11-06");
 assert.deepEqual(dailyLimits,{post:2,comment:5,like_received:5,repost_received:3});
});
test("Vesting uses exact integer arithmetic with no claimable token representations",()=>{
 const base={total:"101",start:"2026-01-01T00:00:00.000Z",
  cliff:"2026-02-01T00:00:00.000Z",end:"2026-05-01T00:00:00.000Z"};
 assert.deepEqual(vestingAt({...base,asOf:"2026-01-15T00:00:00Z"}),
  {total:"101",unlocked:"0",scheduled:"101",claimable:false,unit:"LOOKE_POINTS"});
 const at=vestingAt({...base,asOf:"2026-03-01T00:00:00Z"});
 assert.equal(BigInt(at.total),BigInt(at.unlocked)+BigInt(at.scheduled));
 assert.equal(at.claimable,false);
 assert.equal(at.unit,"LOOKE_POINTS");
 assert.deepEqual(vestingAt({...base,asOf:"2027-01-01T00:00:00Z"}),
  {total:"101",unlocked:"101",scheduled:"0",claimable:false,unit:"LOOKE_POINTS"});
 const huge=vestingAt({...base,total:"9007199254740993000",asOf:"2026-03-01T00:00:00Z"});
 assert.equal(BigInt(huge.unlocked)+BigInt(huge.scheduled),9007199254740993000n);
 assert.throws(()=>vestingAt({...base,total:"-1",asOf:"2026-01-01"}),/Invalid/);
 assert.throws(()=>vestingAt({...base,cliff:"2025-01-01",asOf:"2026-01-01"}),/Invalid/);
});
test("Account dashboard and operator queue cannot offer any mint, claim or payout route",()=>{
 const user=source("src/app/api/social/points/route.ts");
 const operator=source("src/app/api/social/points/operator/route.ts");
 const sql=source("db/migrations/006_evidence_points_and_vesting.sql");
 const home=source("src/app/feed/page.tsx");
 assert.match(user,/requireViewer\(request\)/);
 assert.match(user,/l\.owner=\$1/);
 assert.match(user,/claimingEnabled:false/);
 assert.match(user,/tokensIssued:false/);
 assert.match(operator,/assertModerator\(reviewer\)/);
 assert.match(operator,/verifyRequestOrigin\(req\)/);
 assert.match(operator,/accountingEnabled\(\)/);
 assert.match(operator,/FOR UPDATE/);
 assert.match(operator,/pg_advisory_xact_lock/);
 assert.match(operator,/lookupEvidence/);
 assert.match(sql,/UNIQUE\(source_kind,source_id\)/);
 assert.match(sql,/social_points_counterparty_daily_m19/);
 assert.match(home,/PointsDashboard/);
 for(const file of [user,operator]){
  assert.ok(!file.includes("eth_sendTransaction"));
  assert.ok(!file.includes("mintToken("));
  assert.ok(!file.includes("claimRewards("));
 }
});
