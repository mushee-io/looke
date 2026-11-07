/** Final10 M10: engineering evidence inventory, NOT an operator sign-off.
 * This module is deliberately incapable of deciding GO, writing data, or releasing.
 */
import { createHash } from "node:crypto";
import { M9_GATE_NAMES, assessM9Evidence, type M9GateId, type M9Observation } from "./m9-gates";

export const M10_EXTERNAL_GATE_IDS = [
  "original_chain_and_factory_receipts",
  "verified_ultra_looke_market_reserves",
  "original_wallet_portfolio_finality",
  "moderated_media_provider_receipts",
  "private_messaging_independent_security_review",
  "original_game_points_and_anti_sybil_review",
  "independent_external_audit_and_retests",
  "two_distinct_human_operator_security_signoffs",
  "original_tls_backup_and_separate_restore_witness",
  "signed_out_sso_access_denial",
  "incident_rollback_independent_witness",
  "production_alias_unchanged"
] as const;
export type M10ExternalGate = typeof M10_EXTERNAL_GATE_IDS[number];
export type M10Proof = { gate: M10ExternalGate; sourceClass: string; originalReference: string; verifiedByHuman: boolean; description: string };
export const M10_BLOCKERS: Record<M10ExternalGate,string> = {
  original_chain_and_factory_receipts: "Require independently checked Ultra EVM 18881 factory, creator-token deployment, chain IDs and original transaction receipts.",
  verified_ultra_looke_market_reserves: "Require genuine ULTRA/LOOKE pair, router, token provenance, live reserves and indexed trade receipts; never infer liquidity.",
  original_wallet_portfolio_finality: "Require original owner-approved wallet proofs and canonical finalized block balances, not synthetic RPC fixtures.",
  moderated_media_provider_receipts: "Require original provider media IDs, ownership and moderator decision receipts crosschecked to current social_* rows.",
  private_messaging_independent_security_review: "Messaging transport and E2EE remain disabled pending original third-party cryptographic security review.",
  original_game_points_and_anti_sybil_review: "Require issuer-signed original game events, owner reconciliation, independent anti-sybil review; no conversion.",
  independent_external_audit_and_retests: "Require actual externally authored audit files, finding IDs, remediations, independent retests and authenticated auditor identities.",
  two_distinct_human_operator_security_signoffs: "Require two genuine independent named human security/operator sign-offs outside CI; a public key or test signature is not approval.",
  original_tls_backup_and_separate_restore_witness: "Require actual operator-approved TLS sources, distinct externally restored backup, full schema/row digest and human-witnessed recovery.",
  signed_out_sso_access_denial: "Require signed-out HTTP challenge evidence from immutable protected Preview, independently observed; READY alone does not prove SSO.",
  incident_rollback_independent_witness: "Require independent documented incident exercise, safely witnessed recovery and rollback without changing production alias here.",
  production_alias_unchanged: "Recheck actual Vercel control plane immediately before any operator decision; do not change production here."
};
export const M10_EXPECTED_PRODUCTION_DEPLOYMENT = "dpl_29EdVrfrJNTC5Q7gkZMcpaxLhQiG";
const sha40 = /^[a-f0-9]{40}$/;
const externalGateSet = new Set<string>(M10_EXTERNAL_GATE_IDS);
const allowedSources = new Set(["ultra_evm_rpc","original_postgresql_tls","original_media_provider","original_game_issuer","external_security_auditor","human_operator","vercel_control_plane","external_backup_operator"]);
export function assessFinal10M10(input:{
  env: Record<string,string|undefined>;
  m9Observations?: Partial<Record<M9GateId,M9Observation>>;
  externalProofs?: Partial<Record<M10ExternalGate,M10Proof>>;
  previewSha?: string; previewDeploymentId?: string;
  observedProductionDeploymentId?: string;
  time?: Date;
}) {
  const m9=assessM9Evidence({env:input.env,observations:input.m9Observations,
    previewSha:input.previewSha,time:input.time});
  const proofs=input.externalProofs ?? {};
  for(const key of Object.keys(proofs)) if(!externalGateSet.has(key))
    throw new Error("Unknown M10 external evidence gate");
  const gates=M10_EXTERNAL_GATE_IDS.map(gate=>{
    const proof=proofs[gate];
    if(proof && proof.gate!==gate)throw new Error("M10 source gate mismatch");
    // Engineering may INVENTORY an original reference but cannot authenticate an external human
    // or transform a supplied reference into a signed approval.
    const originalReference=typeof proof?.originalReference==="string" && proof.originalReference.length>=12
      && allowedSources.has(proof.sourceClass) ? proof.originalReference : null;
    return {gate,status:originalReference?"submitted_unverified":"blocked" as "submitted_unverified"|"blocked",
      sourceClass:originalReference?proof!.sourceClass:null,originalReference,
      independentlyAuthenticated:false as const,
      humanApprovalRecorded:false as const,
      blocker:M10_BLOCKERS[gate]};
  });
  const productionPinObserved=input.observedProductionDeploymentId===M10_EXPECTED_PRODUCTION_DEPLOYMENT;
  const exactPreview=!!input.previewSha && sha40.test(input.previewSha)
    && !!input.previewDeploymentId && /^dpl_[A-Za-z0-9]+$/.test(input.previewDeploymentId);
  const digest=createHash("sha256").update(JSON.stringify({
    chainId:18881,previewSha:input.previewSha??null,
    previewDeploymentId:input.previewDeploymentId??null,
    productionPinObserved,m9Digest:m9.technicalDigestSha256,
    external:gates.map(g=>[g.gate,g.status,g.sourceClass,g.originalReference])
  })).digest("hex");
  return {
    milestone:"Final10_M10" as const,chainId:18881 as const,
    inspectedAt:(input.time??new Date()).toISOString(),
    m9GateCount:M9_GATE_NAMES.length,m9Blocked:m9.technicalChecksBlocked,
    engineeringSourceReferencesPresent:gates.filter(g=>g.status==="submitted_unverified").length,
    originalEvidenceBlocked:gates.filter(g=>g.status==="blocked").length,
    externalGates:gates,previewExactIdentifiersSupplied:exactPreview,
    productionPinObserved,expectedProductionDeploymentId:M10_EXPECTED_PRODUCTION_DEPLOYMENT,
    evidenceManifestSha256:digest,digestIsIndependentAttestation:false as const,
    independentExternalAuditApproved:false as const,
    originalBackupWitnessApproved:false as const,
    independentHumanSignaturesVerified:0 as const,
    betaReady:false as const,releaseDecision:"NO_GO" as const,
    productionPromotionAllowed:false as const,
    mainnetDeploymentAllowed:false as const,publicBetaEnabled:false as const,
    financialBroadcastAllowed:false as const,tokenIssuanceAllowed:false as const,
    gamePointConversionAllowed:false as const,
    legacyNeonMigrationAllowed:false as const,recurringBuildsAllowed:false as const,
    operatorAction:"Supply and independently validate original external evidence outside CI. Obtain verified human reviews and explicit owner approval before any separately authorized release action." as const
  };
}
