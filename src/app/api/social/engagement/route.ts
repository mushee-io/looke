import {type NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {HttpError,requireViewer,verifyRequestOrigin,writesEnabled} from "../../../../lib/social/auth";
import {query,rateLimit,socialDb} from "../../../../lib/social/db";
import {failure,readJson} from "../../../../lib/social/http";
import {activityKind,engagementMutation,mutations,summaryFromRows} from "../../../../lib/social/engagement";
import {m3SocialWritesEnabled} from "../../../../lib/social/m3-social-access";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"cache-control":"private, no-store"};
function reply(body:unknown){return NextResponse.json(body,{headers:noStore});}

/** Only the signed-in wallet can read its saved, liked, and reposted activity. */
export async function GET(req:NextRequest){
 try{
  const actor=(await requireViewer(req)).address;
  const view=z.enum(["activity","following"]).parse(req.nextUrl.searchParams.get("view")||"activity");
  if(view==="following"){
   const rows=await query(`
     SELECT f.followed AS address,p.handle,p.display_name,p.avatar_url,f.created_at
     FROM social_follows f JOIN social_profiles p ON p.address=f.followed
     WHERE f.follower=$1 AND p.suspended=false
       AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE
         (b.blocker=$1 AND b.blocked=f.followed) OR
         (b.blocked=$1 AND b.blocker=f.followed))
     ORDER BY f.created_at DESC LIMIT 40`,[actor]);
   return reply({authenticated:true,view,profiles:rows.rows});
  }
  const kind=activityKind.parse(req.nextUrl.searchParams.get("kind")||"all");
  const rows=await query(`
   WITH activity AS (
     SELECT id,post_id,created_at,'likes'::text AS kind FROM social_post_likes WHERE actor=$1
     UNION ALL SELECT id,post_id,created_at,'reposts'::text FROM social_post_reposts WHERE actor=$1
     UNION ALL SELECT id,post_id,created_at,'bookmarks'::text FROM social_post_bookmarks WHERE actor=$1
   )
   SELECT a.id AS event_id,a.kind,a.created_at,p.id AS post_id,
     p.body,pr.handle,pr.display_name,pr.address AS author,
     CASE WHEN p.media_status='approved' THEN p.media_url ELSE NULL END AS media_url,
     CASE WHEN p.media_status='approved' THEN p.media_kind ELSE NULL END AS media_kind
   FROM activity a
   JOIN social_posts p ON p.id=a.post_id
   JOIN social_profiles pr ON pr.address=p.author
   WHERE p.hidden=false AND p.deleted_at IS NULL AND pr.suspended=false
     AND (p.media_url IS NULL OR p.media_status='approved')
     AND ($2::text='all' OR a.kind=$2)
     AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE
       (b.blocker=$1 AND b.blocked=p.author) OR
       (b.blocked=$1 AND b.blocker=p.author))
   ORDER BY a.created_at DESC,a.id DESC LIMIT 40`,[actor,kind]);
  return reply({authenticated:true,view,kind,events:rows.rows,source:"real-postgres"});
 }catch(error){return failure(error);}
}

/** Separate authorized writes; no balances, token operations or messages. */
export async function POST(req:NextRequest){
 try{
  verifyRequestOrigin(req);
  if(!writesEnabled()&&!m3SocialWritesEnabled())throw new HttpError(503,"Creator engagement is disabled until social moderation is approved.");
  const actor=(await requireViewer(req)).address;
  const data=engagementMutation.parse(await readJson(req));
  await rateLimit(actor,"engagement",90,600);
  const rule=mutations[data.action];
  const conn=await socialDb().connect();
  try{
   await conn.query("BEGIN");
   if(rule.add){
    const found=await conn.query<{author:string}>(`
     SELECT p.author FROM social_posts p
     JOIN social_profiles pr ON pr.address=p.author
     WHERE p.id=$1 AND p.hidden=false AND p.deleted_at IS NULL AND pr.suspended=false
       AND (p.media_url IS NULL OR p.media_status='approved')
       AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE
         (b.blocker=$2 AND b.blocked=p.author) OR (b.blocked=$2 AND b.blocker=p.author))
     FOR SHARE OF p`,[data.postId,actor]);
    if(found.rowCount!==1)throw new HttpError(404,"This post is not available for engagement.");
    if(!rule.allowSelf&&found.rows[0].author===actor)
     throw new HttpError(403,"Creators cannot like or repost their own content.");
   }
   // The table name is chosen only from a static map, never from user data.
   const statement=rule.add
    ?`INSERT INTO ${rule.table}(actor,post_id) VALUES($1,$2) ON CONFLICT(actor,post_id) DO NOTHING RETURNING id`
    :`DELETE FROM ${rule.table} WHERE actor=$1 AND post_id=$2 RETURNING id`;
   const changed=await conn.query(statement,[actor,data.postId]);
   const current=await conn.query<{
    like_count:number;repost_count:number;liked_by_me:boolean;
    reposted_by_me:boolean;bookmarked_by_me:boolean;
   }>(`
    SELECT
      (SELECT count(*)::integer FROM social_post_likes WHERE post_id=$1) AS like_count,
      (SELECT count(*)::integer FROM social_post_reposts WHERE post_id=$1) AS repost_count,
      EXISTS(SELECT 1 FROM social_post_likes WHERE post_id=$1 AND actor=$2) AS liked_by_me,
      EXISTS(SELECT 1 FROM social_post_reposts WHERE post_id=$1 AND actor=$2) AS reposted_by_me,
      EXISTS(SELECT 1 FROM social_post_bookmarks WHERE post_id=$1 AND actor=$2) AS bookmarked_by_me
   `,[data.postId,actor]);
   await conn.query("COMMIT");
   return reply({ok:true,changed:changed.rowCount===1,postId:data.postId,
     engagement:summaryFromRows(current.rows[0])});
  }catch(error){await conn.query("ROLLBACK");throw error;}finally{conn.release();}
 }catch(error){return failure(error);}
}
