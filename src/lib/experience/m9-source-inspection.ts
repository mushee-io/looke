/** Independent M9 source inspection uses a real signed-in wallet address and
 * a read-only PostgreSQL repeatable-read transaction. It NEVER signs a wallet,
 * provisions a DB, imports source data or changes release state.
 */
import {getAddress,isAddress} from "viem";
import type {PoolClient} from "pg";
import {inspectM31Schema} from "../beta/m31-source-compatibility";
import {M9_REQUIRED_TABLES} from "./m9-restore";
const addr=/^0x[0-9a-f]{40}$/;
type DB=Pick<PoolClient,"query">;
export async function inspectM9OwnerSource(db:DB,owner:string,options:{enforceTLS?:boolean}={}){
 if(!isAddress(owner)||/^0x0{40}$/i.test(owner))throw Error("Signed-in owner wallet required.");
 const account=getAddress(owner).toLowerCase();
 const ssl=await db.query<{ssl:boolean}>("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()");
 const tls=ssl.rows[0]?.ssl===true;
 if(options.enforceTLS!==false&&!tls)throw Error("Original real TLS PostgreSQL required.");
 await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
 try{
  const mode=await db.query<{transaction_read_only:string}>("SHOW transaction_read_only");
  if(mode.rows[0]?.transaction_read_only!=="on")throw Error("Read-only session unavailable.");
  const schema=await inspectM31Schema(db,false);
  const present=await db.query<{table_name:string}>(
   "SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema()"+
   " AND table_type='BASE TABLE' AND left(table_name,7)='social_' ORDER BY table_name");
  const found=present.rows.map(x=>x.table_name);
  const missing=M9_REQUIRED_TABLES.filter(t=>!found.includes(t));
  if(!schema.schemaCompatible||missing.length)throw Error("Original current M2–M8 source tables are incomplete.");
  const counts=await db.query<{sessions:number;consumed_challenges:number;
   posts:number;approved_media:number;message_requests:number;deployment_drafts:number;
   market_review_drafts:number;game_quarantine:number;approved_social_points:number}>(`
   SELECT
   (SELECT count(*)::integer FROM social_sessions s WHERE s.address=$1 AND s.expires_at>now()) AS sessions,
   (SELECT count(*)::integer FROM social_auth_challenges c WHERE c.address=$1 AND c.used_at IS NOT NULL) AS consumed_challenges,
   (SELECT count(*)::integer FROM social_posts p WHERE p.author=$1 AND p.hidden=false AND p.deleted_at IS NULL
     AND (p.media_url IS NULL OR p.media_status='approved')) AS posts,
   (SELECT count(*)::integer FROM social_media_uploads u JOIN social_posts p ON p.id=u.post_id
    WHERE u.owner=$1 AND p.author=$1 AND p.media_status='approved' AND u.state='attached') AS approved_media,
   (SELECT count(*)::integer FROM social_dm_requests d WHERE d.requester=$1 OR d.recipient=$1) AS message_requests,
   (SELECT count(*)::integer FROM social_creator_deployment_previews c WHERE c.owner=$1 AND c.status='prepared') AS deployment_drafts,
   (SELECT count(*)::integer FROM social_market_review_intents r WHERE r.owner=$1 AND r.status='review') AS market_review_drafts,
   (SELECT count(*)::integer FROM social_game_import_candidates_m8 g WHERE g.owner=$1 AND g.status='quarantined') AS game_quarantine,
   (SELECT count(*)::integer FROM social_points_ledger l WHERE l.owner=$1 AND l.status='approved') AS approved_social_points
   `,[account]);
  await db.query("COMMIT");
  return {status:"original_read_only_snapshot" as const,owner:account,
   tlsVerified:tls,readOnly:true as const,schemaCompatible:true as const,
   requiredTables:M9_REQUIRED_TABLES.length,actualSocialTables:found.length,
   counts:counts.rows[0],walletSessionSignatureIndependentlyWitnessed:false as const,
   tokenIssuanceProof:false as const,mediaProviderOriginalApproved:false as const,
   sourceGameEventsValidated:false as const,
   fullAntiSybilApproved:false as const,
   dataChanged:false as const,releaseDecision:"NO_GO" as const,
   note:"Actual rows and one live session are not independent signed human security evidence; no samples or users are invented."};
 }catch(e){await db.query("ROLLBACK");throw e;}
}
export function m9SafeRollbackPlan(input:{
 previewId:string;previewSha:string;protectedOrigin:string;
 originalProductionAlias:string;originalDeployment:string;
 candidateProductionChange?:boolean;
}){
 if(!/^dpl_[A-Za-z0-9]{8,64}$/.test(input.previewId)||
    !/^[0-9a-f]{40}$/.test(input.previewSha)||
    !new RegExp("^https://looke-[a-z0-9-]+[.]vercel[.]app$").test(input.protectedOrigin)||
    input.originalProductionAlias!=="looke-alpha.vercel.app"||
    input.originalDeployment!=="dpl_29EdVrfrJNTC5Q7gkZMcpaxLhQiG"||
    input.candidateProductionChange===true)
  throw Error("Rehearsal requires exact protected Preview, immutable SHA and unchanged production alias.");
 return {rehearsalKind:"read_only_dry_run" as const,
  expectedCurrentAliasDeployment:input.originalDeployment,previewDeploymentId:input.previewId,
  previewCommit:input.previewSha,protectedPreview:input.protectedOrigin,
  actualAliasControlPlaneChecked:false as const,
  actualRollbackPerformed:false as const,
  independentlyWitnessed:false as const,productionChanged:false as const,
  instructions:["Verify actual Vercel Preview target and SSO challenge from independent control plane.",
   "Obtain original independently signed human security and operator reviews.",
   "Rehearse restore and verify original row/schema digests on a separate TLS endpoint.",
   "Record human-observed Preview rollback with before/after deployment identifiers.",
   "Never run alias mutation or production rollback from this diagnostic."],
  releaseDecision:"NO_GO" as const};
}
