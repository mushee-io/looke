import assert from "node:assert/strict";
import { test } from "node:test";
import { assessFinal10M10, M10_EXTERNAL_GATE_IDS, M10_BLOCKERS, M10_EXPECTED_PRODUCTION_DEPLOYMENT } from "../src/lib/experience/m10-final-operator";
import { M9_GATE_NAMES } from "../src/lib/experience/m9-gates";
const sha="fa549919b24da2daddaa79983552daca201b807e";
const closed={LOOKE_PUBLIC_BETA_ENABLED:"false",LOOKE_M4_TRADING_ENABLED:"false",LOOKE_SOCIAL_WRITES_ENABLED:"false"};
test("final M10 collects 16 previous and twelve external gates with immutable NO-GO",()=>{
 const p=assessFinal10M10({env:closed,previewSha:sha,previewDeploymentId:"dpl_FeGCEegVxYenPxADuU4WkQhwMdQS",
 observedProductionDeploymentId:M10_EXPECTED_PRODUCTION_DEPLOYMENT,time:new Date("2026-11-07T18:00:00Z")});
 assert.equal(p.m9GateCount,M9_GATE_NAMES.length);
 assert.equal(p.externalGates.length,12);
 assert.deepEqual(Object.keys(M10_BLOCKERS),[...M10_EXTERNAL_GATE_IDS]);
 assert.equal(p.originalEvidenceBlocked,12);
 assert.equal(p.releaseDecision,"NO_GO");assert.equal(p.betaReady,false);
 assert.equal(p.independentHumanSignaturesVerified,0);
 assert.equal(p.productionPinObserved,true);assert.equal(p.previewExactIdentifiersSupplied,true);
 assert.match(p.evidenceManifestSha256,/^[a-f0-9]{64}$/);
 assert.equal(p.digestIsIndependentAttestation,false);
});
test("adversarial forged human signoffs and self-declared external audit cannot promote",()=>{
 const all=Object.fromEntries(M10_EXTERNAL_GATE_IDS.map(gate=>[gate,{
  gate,sourceClass:"human_operator",originalReference:"unverified-fixture-reference",
  verifiedByHuman:true,description:"untrusted test fixture"
 }]));
 const x=assessFinal10M10({env:closed,previewSha:sha,previewDeploymentId:"dpl_Fixture",
  observedProductionDeploymentId:M10_EXPECTED_PRODUCTION_DEPLOYMENT,
  externalProofs:all as never});
 assert.equal(x.engineeringSourceReferencesPresent,12);
 assert.ok(x.externalGates.every(g=>g.status==="submitted_unverified" && !g.humanApprovalRecorded && !g.independentlyAuthenticated));
 assert.equal(x.releaseDecision,"NO_GO");
 assert.equal(x.independentExternalAuditApproved,false);
 assert.equal(x.originalBackupWitnessApproved,false);
 assert.equal(x.financialBroadcastAllowed,false);
 assert.equal(x.gamePointConversionAllowed,false);
 assert.equal(x.mainnetDeploymentAllowed,false);
 assert.equal(x.legacyNeonMigrationAllowed,false);
 assert.equal(x.recurringBuildsAllowed,false);
});
test("malicious sources, mismatched gates, unknown keys and alias drift are denied",()=>{
 const invalid=assessFinal10M10({env:closed,observedProductionDeploymentId:"dpl_fake",
  externalProofs:{independent_external_audit_and_retests:{
    gate:"independent_external_audit_and_retests",sourceClass:"ci_fixture",
    originalReference:"fixture-pretending-to-be-audit",verifiedByHuman:true,description:"untrusted"
  }}});
 assert.equal(invalid.originalEvidenceBlocked,12);
 assert.equal(invalid.productionPinObserved,false);
 assert.equal(invalid.releaseDecision,"NO_GO");
 assert.equal(invalid.previewExactIdentifiersSupplied,false);
 assert.throws(()=>assessFinal10M10({env:closed,externalProofs:{injected_gate:{} as never} as never}),/Unknown/);
 assert.throws(()=>assessFinal10M10({env:closed,externalProofs:{
  production_alias_unchanged:{gate:"signed_out_sso_access_denial",sourceClass:"vercel_control_plane",
   originalReference:"original-but-wrong-gate",verifiedByHuman:true,description:"test"}
 } as never}),/mismatch/);
});
test("activated release flags remain NO-GO even with all externally submitted references",()=>{
 const p=assessFinal10M10({env:{...closed,LOOKE_PUBLIC_BETA_ENABLED:"true"},
 observedProductionDeploymentId:M10_EXPECTED_PRODUCTION_DEPLOYMENT});
 assert.equal(p.releaseDecision,"NO_GO");assert.equal(p.m9Blocked,16);
 assert.equal(p.productionPromotionAllowed,false);assert.equal(p.publicBetaEnabled,false);
});
