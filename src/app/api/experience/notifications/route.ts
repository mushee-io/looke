import {type NextRequest,NextResponse} from "next/server";
import {viewer,requireViewer,verifyRequestOrigin,writesEnabled,HttpError} from "../../../../lib/social/auth";
import {query,rateLimit} from "../../../../lib/social/db";
import {readJson} from "../../../../lib/social/http";
import {failure} from "../../../../lib/social/http";
import {m3SocialWritesEnabled} from "../../../../lib/social/m3-social-access";

export const runtime="nodejs";
export const dynamic="force-dynamic";

/**
 * Read-only, actual signed-in account notifications.
 * Existing follows, comments, likes and reposts of visible owned posts only.
 * No fabricated trade, mention, subscription or message notifications.
 */
export async function GET(request:NextRequest){
  try{
    const current=await viewer(request);
    if(!current||current.suspended)
      return NextResponse.json({authenticated:false,events:[]},{
        headers:{"cache-control":"no-store"},
      });
    type FollowRow={follower:string;handle:string;display_name:string;created_at:string};
    type CommentRow={id:string;handle:string;display_name:string;created_at:string;post_id:string};
    type ReactionRow={id:string;handle:string;display_name:string;created_at:string;post_id:string};
    const [follows,comments,likes,reposts,seen,prefs]=await Promise.all([
      query<FollowRow>(`
        SELECT f.follower,p.handle,p.display_name,f.created_at
        FROM social_follows f
        JOIN social_profiles p ON p.address=f.follower
        WHERE f.followed=$1 AND p.suspended=false
          AND NOT EXISTS(SELECT 1 FROM social_mutes m
            WHERE m.muter=$1 AND m.muted=f.follower)
          AND NOT EXISTS (
            SELECT 1 FROM social_blocks b
            WHERE (b.blocker=$1 AND b.blocked=f.follower)
               OR (b.blocked=$1 AND b.blocker=f.follower)
          )
        ORDER BY f.created_at DESC LIMIT 30
      `,[current.address]),
      query<CommentRow>(`
        SELECT c.id,p.handle,p.display_name,c.created_at,c.post_id
        FROM social_comments c
        JOIN social_profiles p ON p.address=c.author
        JOIN social_posts post ON post.id=c.post_id
        WHERE post.author=$1 AND c.author<>$1
          AND NOT EXISTS(SELECT 1 FROM social_mutes m
            WHERE m.muter=$1 AND m.muted=c.author)
          AND c.hidden=false AND p.suspended=false
          AND post.hidden=false AND post.deleted_at IS NULL
          AND (post.media_url IS NULL OR post.media_status='approved')
          AND NOT EXISTS (
            SELECT 1 FROM social_blocks b
            WHERE (b.blocker=$1 AND b.blocked=c.author)
               OR (b.blocked=$1 AND b.blocker=c.author)
          )
        ORDER BY c.created_at DESC LIMIT 30
      `,[current.address]),
      query<ReactionRow>(`
        SELECT l.id,pr.handle,pr.display_name,l.created_at,l.post_id
        FROM social_post_likes l
        JOIN social_posts post ON post.id=l.post_id
        JOIN social_profiles pr ON pr.address=l.actor
        WHERE post.author=$1 AND l.actor<>$1
          AND NOT EXISTS(SELECT 1 FROM social_mutes m
            WHERE m.muter=$1 AND m.muted=l.actor)
          AND pr.suspended=false AND post.hidden=false AND post.deleted_at IS NULL
          AND (post.media_url IS NULL OR post.media_status='approved')
          AND NOT EXISTS(SELECT 1 FROM social_blocks b
            WHERE (b.blocker=$1 AND b.blocked=l.actor) OR
                  (b.blocked=$1 AND b.blocker=l.actor))
        ORDER BY l.created_at DESC LIMIT 30
      `,[current.address]),
      query<ReactionRow>(`
        SELECT r.id,pr.handle,pr.display_name,r.created_at,r.post_id
        FROM social_post_reposts r
        JOIN social_posts post ON post.id=r.post_id
        JOIN social_profiles pr ON pr.address=r.actor
        WHERE post.author=$1 AND r.actor<>$1
          AND NOT EXISTS(SELECT 1 FROM social_mutes m
            WHERE m.muter=$1 AND m.muted=r.actor)
          AND pr.suspended=false AND post.hidden=false AND post.deleted_at IS NULL
          AND (post.media_url IS NULL OR post.media_status='approved')
          AND NOT EXISTS(SELECT 1 FROM social_blocks b
            WHERE (b.blocker=$1 AND b.blocked=r.actor) OR
                  (b.blocked=$1 AND b.blocker=r.actor))
        ORDER BY r.created_at DESC LIMIT 30
      `,[current.address]),
      query<{last_seen_at:Date}>(`
        SELECT last_seen_at FROM social_notification_reads WHERE owner=$1 LIMIT 1
      `,[current.address]),
      query<{follows:boolean;comments:boolean;likes:boolean;reposts:boolean}>(`
        SELECT follows,comments,likes,reposts FROM social_notification_preferences
        WHERE owner=$1
      `,[current.address]),
    ]);
    const lastSeen=seen.rows[0]?new Date(seen.rows[0].last_seen_at).getTime():0;
    const allowed=prefs.rows[0]??{follows:true,comments:true,likes:true,reposts:true};
    const events=[
      ...(allowed.follows?follows.rows:[]).map(row=>({
        id:"follow:"+row.follower,type:"Follows" as const,
        actorHandle:row.handle,actorName:row.display_name,
        text:"started following you",timestamp:row.created_at,postId:null,
      })),
      ...(allowed.comments?comments.rows:[]).map(row=>({
        id:"comment:"+row.id,type:"Comments" as const,
        actorHandle:row.handle,actorName:row.display_name,
        text:"commented on your post",timestamp:row.created_at,postId:row.post_id,
      })),
      ...(allowed.likes?likes.rows:[]).map(row=>({
        id:"like:"+row.id,type:"Likes" as const,
        actorHandle:row.handle,actorName:row.display_name,
        text:"liked your post",timestamp:row.created_at,postId:row.post_id,
      })),
      ...(allowed.reposts?reposts.rows:[]).map(row=>({
        id:"repost:"+row.id,type:"Reposts" as const,
        actorHandle:row.handle,actorName:row.display_name,
        text:"reposted your post",timestamp:row.created_at,postId:row.post_id,
      })),
    ].sort((a,b)=>new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime())
      .slice(0,40).map(e=>({
      ...e,unread:new Date(e.timestamp).getTime()>lastSeen,
    }));
    return NextResponse.json({authenticated:true,events,
      unreadCount:events.filter(e=>e.unread).length,
      lastSeen:seen.rows[0]?.last_seen_at??null,
    },{
      headers:{"cache-control":"private, no-store"},
    });
  }catch(error){return failure(error);}
}

/** A user may mark only their own genuine notification history read. */
export async function POST(request:NextRequest){
 try{
   verifyRequestOrigin(request);
   if(!writesEnabled()&&!m3SocialWritesEnabled())throw new HttpError(503,"Notification write state is disabled.");
   const actor=(await requireViewer(request)).address;
   const input=await readJson(request);
   if(input.action!=="mark_read")throw new HttpError(400,"Unknown notification action.");
   await rateLimit(actor,"notification_read",30,600);
   await query(`
     INSERT INTO social_notification_reads(owner,last_seen_at,updated_at)
     VALUES($1,now(),now())
     ON CONFLICT(owner) DO UPDATE SET
       last_seen_at=GREATEST(social_notification_reads.last_seen_at,EXCLUDED.last_seen_at),
       updated_at=now()
   `,[actor]);
   return NextResponse.json({ok:true,ownerScoped:true},{
     headers:{"cache-control":"private, no-store"},
   });
 }catch(error){return failure(error);}
}
