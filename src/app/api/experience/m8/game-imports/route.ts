import {type NextRequest,NextResponse} from "next/server";
import {HttpError,requireViewer,socialOrigin,verifyRequestOrigin} from "../../../../../lib/social/auth";
import {rateLimit,socialDb,query} from "../../../../../lib/social/db";
import {failure,readJson} from "../../../../../lib/social/http";
import {m8ConfiguredGameSource,m8GameStagingEnabled,verifyM8GameEvidence} from "../../../../../lib/experience/m8-game-evidence";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex"};
export async function GET(req:NextRequest){
 try{
  const owner=(await requireViewer(req)).address;
  const history=await query<{id:string;source:string;source_event_id:string;
   source_record_hash:string;season_id:string;claimed_points:number;occurred_at:Date;
   attestation_hash:string;status:string;created_at:Date}>(`
   SELECT id,source,source_event_id,source_record_hash,season_id,claimed_points,
     occurred_at,attestation_hash,status,created_at
   FROM social_game_import_candidates_m8 WHERE owner=$1
   ORDER BY created_at DESC,id DESC LIMIT 25`,[owner]);
  return NextResponse.json({authenticated:true,ownerScoped:true,
   source:"quarantined-independently-attested-game-candidates",
   sourceOriginalAuditComplete:false,pointsCredited:"0",
   conversionEnabled:false,airdropEnabled:false,
   records:history.rows},{headers});
 }catch(e){return failure(e);}
}
export async function POST(req:NextRequest){
 try{
  verifyRequestOrigin(req);
  if(!m8GameStagingEnabled())throw new HttpError(503,"Independent game source review, audited live source and staging approvals are missing.");
  const owner=(await requireViewer(req)).address;
  const v=await verifyM8GameEvidence(await readJson(req),owner,socialOrigin());
  const source=m8ConfiguredGameSource();
  if(!source)throw new HttpError(503,"Missing independently reviewed issuer and reviewer sources.");
  await rateLimit(owner,"m8_quarantine",5,600);
  const db=await socialDb().connect();
  try{
   await db.query("BEGIN");
   const season=await db.query<{id:string}>(`
    SELECT id FROM social_points_seasons
    WHERE id=$1 AND state IN ('active','closed') AND starts_at<=$2 AND ends_at>$2
    FOR SHARE`,[v.seasonId,new Date(v.occurredAt)]);
   if(season.rowCount!==1)throw new HttpError(409,"No original approved Points season matches the game event time.");
   await db.query(`
    INSERT INTO social_game_source_identities_m8(source,source_identity_hash,owner)
    VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [v.source,v.sourceIdentityHash,owner]);
   const identity=await db.query<{owner:string;source_identity_hash:string}>(`
    SELECT owner,source_identity_hash FROM social_game_source_identities_m8
    WHERE source=$1 AND source_identity_hash=$2 FOR UPDATE`,[v.source,v.sourceIdentityHash]);
   if(identity.rows.length!==1||identity.rows[0].owner!==owner)
    throw new HttpError(409,"Source identity belongs to another owner or has not been independently bound.");
   const sameOwner=await db.query<{source_identity_hash:string}>(`
    SELECT source_identity_hash FROM social_game_source_identities_m8 WHERE source=$1 AND owner=$2`,
    [v.source,owner]);
   if(sameOwner.rowCount!==1||sameOwner.rows[0].source_identity_hash!==v.sourceIdentityHash)
    throw new HttpError(409,"Conflicting game identity assigned to this wallet.");
   const result=await db.query<{id:string}>(`
    INSERT INTO social_game_import_candidates_m8
      (owner,source,source_identity_hash,source_event_id,source_record_hash,
       season_id,claimed_points,occurred_at,issuer,reviewer,attestation_hash,client_nonce)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[
     owner,v.source,v.sourceIdentityHash,v.eventId,v.sourceRecordHash,v.seasonId,
     v.points,new Date(v.occurredAt),source.issuer.toLowerCase(),source.reviewer.toLowerCase(),
     v.attestationHash,v.nonce
    ]);
   await db.query("COMMIT");
   return NextResponse.json({id:result.rows[0].id,status:"quarantined",
    verifiedIndependentSignatures:true,originalGameSourceAuditedByThisAPI:false,
    pointsCredited:0,tokenCreditsIssued:0,convertible:false,
    note:"Review candidate only. Operator must verify the original game database record and sybil controls independently; no ledger credit or reward exists."},{headers});
  }catch(e){await db.query("ROLLBACK");throw e;}finally{db.release();}
 }catch(e){return failure(e);}
}
