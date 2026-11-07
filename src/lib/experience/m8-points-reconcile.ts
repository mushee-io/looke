import {createHash} from "node:crypto";
import {getAddress} from "viem";
import {query,socialDb} from "../social/db";
import {lookupEvidence} from "../social/points-evidence";
import {vestingAt,type SourceKind} from "../social/points";
/** Read-only account-scoped reconciliation. Full coverage is required before
 * asserting a reconciled approved-points total. Game reviews NEVER count.
 */
type Ledger={id:string;season_id:string;owner:string;source_kind:SourceKind;
 source_id:string;source_actor:string;activity_at:Date;points:number;
 starts_at:Date;ends_at:Date;points_post:number;points_comment:number;
 points_like_received:number;points_repost_received:number};
export async function m8OwnerPointsReconciliation(owner:string,max=30){
 if(!Number.isInteger(max)||max<1||max>40)throw Error("Invalid bounded reconciliation page.");
 const account=getAddress(owner).toLowerCase();
 const conn=await socialDb().connect();
 try{
  const counts=await conn.query<{status:string;points:string;count:number}>(`
    SELECT status,COALESCE(sum(points),0)::text AS points,count(*)::integer AS count
    FROM social_points_ledger WHERE owner=$1 GROUP BY status`,[account]);
  const result=await conn.query<Ledger>(`
    SELECT l.id,l.season_id,l.owner,l.source_kind,l.source_id,l.source_actor,
     l.activity_at,l.points,s.starts_at,s.ends_at,s.points_post,s.points_comment,
     s.points_like_received,s.points_repost_received
    FROM social_points_ledger l JOIN social_points_seasons s ON s.id=l.season_id
    WHERE l.owner=$1 AND l.status='approved'
    ORDER BY l.reviewed_at DESC,l.id DESC LIMIT $2`,[account,max+1]);
  const approvedCount=counts.rows.find(r=>r.status==="approved")?.count||0;
  const rows=result.rows.slice(0,max);
  const drifts:{ledgerId:string;reason:string}[]=[];
  for(const row of rows){
   const proof=await lookupEvidence(conn,row.source_kind,row.source_id);
   if(!proof){drifts.push({ledgerId:row.id,reason:"original_source_missing_or_ineligible"});continue;}
   const at=new Date(row.activity_at).getTime();
   const expected={
    post:row.points_post,comment:row.points_comment,
    like_received:row.points_like_received,repost_received:row.points_repost_received
   }[row.source_kind];
   if(proof.owner!==row.owner||proof.actor!==row.source_actor||
      new Date(proof.activity_at).getTime()!==at||
      at<new Date(row.starts_at).getTime()||
      at>=new Date(row.ends_at).getTime()||row.points!==expected)
      drifts.push({ledgerId:row.id,reason:"reviewed_points_original_evidence_mismatch"});
  }
  const complete=approvedCount===rows.length;
  const verified=complete&&drifts.length===0;
  const quarantined=await conn.query<{count:number;claimed:string}>(`
    SELECT count(*)::integer AS count,COALESCE(sum(claimed_points),0)::text AS claimed
    FROM social_game_import_candidates_m8 WHERE owner=$1 AND status='quarantined'`,[account]);
  const seasons=await conn.query<{id:string;slug:string;vest_start_at:Date;
   vest_cliff_at:Date;vest_end_at:Date;approved:string}>(`
    SELECT s.id,s.slug,s.vest_start_at,s.vest_cliff_at,s.vest_end_at,
     COALESCE(sum(l.points),0)::text AS approved
    FROM social_points_seasons s JOIN social_points_ledger l ON l.season_id=s.id
    WHERE l.owner=$1 AND l.status='approved'
    GROUP BY s.id ORDER BY s.vest_start_at DESC LIMIT 20`,[account]);
  const statuses=Object.fromEntries(counts.rows.map(r=>[r.status,{points:r.points,entries:r.count}]));
  const reconciledApprovedPoints=verified?(counts.rows.find(r=>r.status==="approved")?.points||"0"):null;
  const canonical=JSON.stringify({account,complete,approvedCount,
   scanned:rows.map(r=>[r.id,r.season_id,r.source_kind,r.source_id,r.points]),
   drifts:drifts.map(x=>[x.ledgerId,x.reason])});
  const reconciliationHash=createHash("sha256").update(canonical).digest("hex");
  return {
   ownerScoped:true,source:"real-social-ledger-postgres",
   reportedSocialPoints:statuses,verifiedApprovedSocialPoints:reconciledApprovedPoints,
   gameImportCandidateCount:quarantined.rows[0].count,
   quarantinedGamePointsClaimed:quarantined.rows[0].claimed,
   creditedGamePoints:"0",unifiedTokenBalance:null,
   reviewCoverage:{approvedEntries:approvedCount,scanned:rows.length,complete,
    issues:drifts,status:drifts.length?"attention":complete?"source_consistent":"incomplete"},
   receipt:{kind:"unsigned-local-reconciliation-digest",sha256:reconciliationHash,
    independentWitnessSigned:false,originalGameSourceReconciled:false},
   vesting:seasons.rows.map(s=>({seasonId:s.id,slug:s.slug,
    informationalOnly:vestingAt({total:s.approved,start:s.vest_start_at,
     cliff:s.vest_cliff_at,end:s.vest_end_at,asOf:new Date()})})),
   pointsConversionEnabled:false,claimEnabled:false,airdropEnabled:false,
   note:"A checksum is NOT an independent operator audit or payout receipt. Quarantined game events are never credited."
  };
 }finally{conn.release();}
}
