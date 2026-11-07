import {type NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {address,uuid} from "../../../../../lib/social/validation";
import {requireViewer,verifyRequestOrigin,HttpError} from "../../../../../lib/social/auth";
import {m5RequestsEnabled} from "../../../../../lib/experience/m5-message-safety";
import {query,rateLimit} from "../../../../../lib/social/db";
import {failure,readJson} from "../../../../../lib/social/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex"};
const write=z.discriminatedUnion("action",[
 z.object({action:z.literal("request"),target:address}).strict(),
 z.object({action:z.enum(["accept","decline","cancel"]),requestId:uuid}).strict()
]);

/** Owner-only real request *metadata*: never message body or key material. */
export async function GET(req:NextRequest){
 try{
  const actor=(await requireViewer(req)).address;
  const result=await query<{
   id:string;requester:string;recipient:string;status:string;created_at:Date;
   updated_at:Date;other_handle:string;other_name:string;
  }>(`
   SELECT r.id,r.requester,r.recipient,r.status,r.created_at,r.updated_at,
      p.handle AS other_handle,p.display_name AS other_name
   FROM social_dm_requests r
   JOIN social_profiles p ON p.address=CASE WHEN r.requester=$1 THEN r.recipient ELSE r.requester END
   WHERE (r.requester=$1 OR r.recipient=$1) AND p.suspended=false
     AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
       (b.blocker=$1 AND b.blocked=p.address) OR (b.blocked=$1 AND b.blocker=p.address))
     AND NOT EXISTS (SELECT 1 FROM social_mutes m WHERE
       (m.muter=$1 AND m.muted=p.address) OR (m.muted=$1 AND m.muter=p.address))
   ORDER BY r.updated_at DESC,r.id DESC LIMIT 50
  `,[actor]);
  return NextResponse.json({
   authenticated:true,transportEnabled:false,requests:result.rows.map(r=>({
    id:r.id,direction:r.requester===actor?"outgoing":"incoming",
    peerHandle:r.other_handle,peerName:r.other_name,
    status:r.status,createdAt:r.created_at,updatedAt:r.updated_at
   }))
  },{headers});
 }catch(error){return failure(error);}
}
export async function POST(req:NextRequest){
 try{
  verifyRequestOrigin(req);
  if(!m5RequestsEnabled())throw new HttpError(503,"Private message requests are disabled pending independent operator approval.");
  const actor=(await requireViewer(req)).address;
  const v=write.parse(await readJson(req));
  await rateLimit(actor,"dm_request_action",8,600);
  if(v.action==="request"){
   if(actor===v.target)throw new HttpError(400,"Cannot request your own wallet.");
   // Atomic permission check and unique unordered pair: cross-direction replay
   // is rejected, and even an accepted request does not enable DMs.
   const inserted=await query<{id:string}>(`
     INSERT INTO social_dm_requests(requester,recipient)
     SELECT $1,p.address FROM social_profiles p
     WHERE p.address=$2 AND p.suspended=false
       AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE
         (b.blocker=$1 AND b.blocked=$2) OR (b.blocker=$2 AND b.blocked=$1))
       AND NOT EXISTS(SELECT 1 FROM social_mutes m WHERE
         (m.muter=$1 AND m.muted=$2) OR (m.muter=$2 AND m.muted=$1))
     ON CONFLICT DO NOTHING RETURNING id
   `,[actor,v.target]);
   if(inserted.rowCount!==1)
     throw new HttpError(409,"Request unavailable, blocked, muted or already exists.");
   return NextResponse.json({ok:true,requestId:inserted.rows[0].id,status:"pending",transportEnabled:false},{headers});
  }
  const state=v.action==="accept"?"accepted":v.action==="decline"?"declined":"canceled";
  const result=await query<{id:string}>(`
    UPDATE social_dm_requests r SET status=$3,resolved_at=now(),updated_at=now()
    WHERE r.id=$1 AND (($4='cancel' AND r.requester=$2) OR ($4 IN ('accept','decline') AND r.recipient=$2)) AND r.status='pending'
      AND EXISTS(SELECT 1 FROM social_profiles a WHERE a.address=r.requester AND a.suspended=false)
      AND EXISTS(SELECT 1 FROM social_profiles b WHERE b.address=r.recipient AND b.suspended=false)
      AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE
        (b.blocker=r.requester AND b.blocked=r.recipient) OR
        (b.blocker=r.recipient AND b.blocked=r.requester))
      AND NOT EXISTS(SELECT 1 FROM social_mutes m WHERE
        (m.muter=r.requester AND m.muted=r.recipient) OR
        (m.muter=r.recipient AND m.muted=r.requester))
    RETURNING r.id
  `,[v.requestId,actor,state,v.action]);
  if(result.rowCount!==1)throw new HttpError(409,"Request is not pending, accessible or authorized.");
  return NextResponse.json({ok:true,requestId:result.rows[0].id,status:state,transportEnabled:false},{headers});
 }catch(error){return failure(error);}
}
