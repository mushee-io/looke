/** Final10 M9: evidence-classification only. Technical verification cannot
 * become an external security audit, an authenticated human or a launch GO.
 */
import {createHash} from "node:crypto";
import {m30ReleaseFlagsClosed,M30_EXPECTED_PRODUCTION} from "../beta/m30-operator-readiness";
export const M9_GATE_NAMES=[
 "m2_original_wallet_sessions","m3_owner_social_records","m4_moderated_media_and_host",
 "m5_message_send_disabled","m6_factory_creator_receipts","m7_ultra_looke_market_proofs",
 "m8_finalized_wallet_portfolio","m8_social_points_reconciliation","m8_game_import_quarantine",
 "current_tls_postgresql_schema","full_separate_tls_restore","independent_external_security_audit",
 "original_human_security_operator_witness","protected_preview_sso_and_sha",
 "production_alias_pinned","independent_rollback_rehearsal"
] as const;
export type M9GateId=typeof M9_GATE_NAMES[number];
export type M9Observation={id:M9GateId;source:string;
 status:"source_verified_read_only"|"blocked";reference?:string;note:string};
const closedFlags=[
 "LOOKE_M2_IDENTITY_WRITES_ENABLED","LOOKE_M3_SOCIAL_WRITES_ENABLED",
 "LOOKE_M4_CREATOR_MEDIA_WRITES_ENABLED","LOOKE_M5_MESSAGE_REQUEST_WRITES_ENABLED",
 "LOOKE_M6_CREATOR_PREVIEW_WRITES_ENABLED","LOOKE_M7_MARKET_REVIEW_WRITES_ENABLED",
 "LOOKE_M7_OPERATOR_SOURCE_APPROVED","LOOKE_M8_GAME_IMPORT_STAGE_ENABLED",
 "LOOKE_M8_SOURCE_AUDIT_APPROVED","LOOKE_M4_TRADING_ENABLED","LOOKE_PUBLIC_BETA_ENABLED",
 "LOOKE_POINTS_ACCOUNTING_ENABLED","LOOKE_MEDIA_UPLOADS_ENABLED",
 "LOOKE_SOCIAL_WRITES_ENABLED","LOOKE_M20_INDEX_WRITES_ENABLED",
 "LOOKE_M23_ACCEPTANCE_WRITES_ENABLED","LOOKE_M24_INCIDENT_WRITES_ENABLED",
 "LOOKE_M25_REVIEW_WRITES_ENABLED","LOOKE_M26_WITNESS_WRITES_ENABLED",
 "LOOKE_M6_EVIDENCE_ENABLED"
] as const;
export function m9AllFeatureFlagsClosed(env:Record<string,string|undefined>){
 return m30ReleaseFlagsClosed(env)&&closedFlags.every(k=>env[k]!=="true")&&
  (!env.LOOKE_M4_MARKETS_JSON||env.LOOKE_M4_MARKETS_JSON==="[]");
}
export function m9BaseBlockers(){
 return {
  m2_original_wallet_sessions:"Actual authorized owner and consumed challenge audit with independent signer witness is unavailable.",
  m3_owner_social_records:"Real current wallet-bound PostgreSQL posts and social writes not independently accepted.",
  m4_moderated_media_and_host:"Original Cloudinary provider receipts, owner and moderated SQL references not fully independently verified.",
  m5_message_send_disabled:"Read-only message-transport guard must remain disabled until external cryptographic review.",
  m6_factory_creator_receipts:"Original audited factory deployment and issuer transaction receipts on Ultra EVM 18881 unavailable.",
  m7_ultra_looke_market_proofs:"Original independently audited ULTRA/LOOKE quote contracts, V2 pool/router, reserves and receipts unavailable.",
  m8_finalized_wallet_portfolio:"Actual owned-wallet snapshot at a canonical finalized 18881 block not evidenced.",
  m8_social_points_reconciliation:"Complete current approved social ledger and independent anti-sybil human review missing.",
  m8_game_import_quarantine:"Original game provider records, issuer, reviewer and real player identity audit missing; game events remain quarantined.",
  current_tls_postgresql_schema:"Operator-approved distinct current TLS social_* PostgreSQL source unavailable.",
  full_separate_tls_restore:"Independently created restored TLS PostgreSQL backup and full current-schema digests unavailable.",
  independent_external_security_audit:"Original auditor files, independent findings, fixes and retest references unavailable.",
  original_human_security_operator_witness:"Two verified independent real human reviewers have not approved this release.",
  protected_preview_sso_and_sha:"Real immutable READY deployment plus actual signed-out SSO challenge need checking.",
  production_alias_pinned:"Actual Vercel control plane pin not verified by this runtime.",
  independent_rollback_rehearsal:"Real authorized Preview rollback and independently witnessed disaster-recovery drill unverified."
 } satisfies Record<M9GateId,string>;
}
export function assessM9Evidence(input:{
 env:Record<string,string|undefined>;observations?:Partial<Record<M9GateId,M9Observation>>;
 previewSha?:string;previewOrigin?:string;time?:Date;
}){
 const flagsClosed=m9AllFeatureFlagsClosed(input.env);
 const blockers=m9BaseBlockers(),obs=input.observations||{};
 const sourceNames=new Set(M9_GATE_NAMES);
 const unknown=Object.keys(obs).filter(k=>!sourceNames.has(k as M9GateId));
 if(unknown.length)throw Error("Unrecognized independent acceptance gate.");
 const gates=M9_GATE_NAMES.map(id=>{
  const value=obs[id];
  if(value?.id&&value.id!==id)throw Error("M9 gate identity is not canonical.");
  const verified=value?.status==="source_verified_read_only"&&
    typeof value.source==="string"&&value.source.length>=8&&
    typeof value.reference==="string"&&value.reference.length>=8&&
    typeof value.note==="string"&&value.note.length>=8&&
    flagsClosed;
  return {id,status:verified?"technical_source_verified":"blocked" as "technical_source_verified"|"blocked",
   source:verified?value!.source:"original evidence missing",
   reference:verified?value!.reference:null,
   note:verified?value!.note:blockers[id],
   independentHumanApproved:false as const};
 });
 const sha=input.previewSha&&/^[a-f0-9]{40}$/.test(input.previewSha)?input.previewSha:null;
 const origin=input.previewOrigin&&/^https:\/\/[a-z0-9.-]+\.vercel\.app$/.test(input.previewOrigin)?
   input.previewOrigin:null;
 const technicalDigest=createHash("sha256").update(JSON.stringify({
  sha,origin,closed:flagsClosed,
  gates:gates.map(g=>[g.id,g.status,g.reference])
 })).digest("hex");
 return {
  milestone:"Final10_M9" as const,chainId:18881 as const,
  inspectedAt:(input.time??new Date()).toISOString(),previewSha:sha,
  previewOrigin:origin,expectedProductionDeployment:M30_EXPECTED_PRODUCTION,
  closedFlags:flagsClosed,gates,technicalChecksPassed:gates.filter(g=>g.status==="technical_source_verified").length,
  technicalChecksBlocked:gates.filter(g=>g.status==="blocked").length,
  missingOriginalEvidence:gates.filter(g=>g.status==="blocked").map(g=>g.id),
  technicalDigestSha256:technicalDigest,
  digestIsHumanSignature:false as const,
  realWalletTransactionsSent:0 as const,
  independentHumanApprovalsVerified:0 as const,
  externalAuditFindingsApproved:false as const,
  backupRestorationPerformed:false as const,backupProvenanceVerified:false as const,
  signedIndependentRollbackWitness:false as const,
  testFixturesNotOriginalEvidence:true as const,
  liveTokenIssuanceEnabled:false as const,financialTransactionsEnabled:false as const,
  pointsConversionEnabled:false as const,privateMessagingEnabled:false as const,
  productionPromotionAllowed:false as const,publicBetaOpen:false as const,
  releaseDecision:"NO_GO" as const,
  note:"No constellation of technical booleans, CI green checks, original record hashes or reviewer wallet public keys can authorize this release. Independent auditors and verified humans must act outside this API."
 };
}
