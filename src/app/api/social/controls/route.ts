import {type NextRequest,NextResponse} from "next/server";
import {HttpError,requireViewer,verifyRequestOrigin,writesEnabled} from "../../../../lib/social/auth";
import {query,rateLimit} from "../../../../lib/social/db";
import {failure,readJson} from "../../../../lib/social/http";
import {controlWrite} from "../../../../lib/social/m18";
import {m3SocialWritesEnabled} from "../../../../lib/social/m3-social-access";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store"};
const defaultPreferences={follows:true,comments:true,likes:true,reposts:true};

export async function GET(req:NextRequest){
 try{
  const actor=(await requireViewer(req)).address;
  const [prefs,mutes]=await Promise.all([
   query<{
    follows:boolean;comments:boolean;likes:boolean;reposts:boolean;
   }>(`SELECT follows,comments,likes,reposts
     FROM social_notification_preferences WHERE owner=$1`,[actor]),
   query<{address:string;handle:string;display_name:string;created_at:Date}>(`
     SELECT m.muted AS address,p.handle,p.display_name,m.created_at
     FROM social_mutes m JOIN social_profiles p ON p.address=m.muted
     WHERE m.muter=$1 ORDER BY m.created_at DESC LIMIT 100`,[actor]),
  ]);
  return NextResponse.json({
   authenticated:true,ownerScoped:true,
   preferences:prefs.rows[0]??defaultPreferences,mutes:mutes.rows,
  },{headers});
 }catch(error){return failure(error);}
}

export async function POST(req:NextRequest){
 try{
  verifyRequestOrigin(req);
  if(!writesEnabled()&&!m3SocialWritesEnabled())throw new HttpError(503,"Creator controls are disabled until review.");
  const actor=(await requireViewer(req)).address;
  const input=controlWrite.parse(await readJson(req));
  await rateLimit(actor,"controls",45,600);
  if(input.action==="preferences"){
   const p=input.preferences;
   await query(`
    INSERT INTO social_notification_preferences(owner,follows,comments,likes,reposts,updated_at)
    VALUES($1,$2,$3,$4,$5,now())
    ON CONFLICT(owner) DO UPDATE SET
      follows=EXCLUDED.follows,comments=EXCLUDED.comments,
      likes=EXCLUDED.likes,reposts=EXCLUDED.reposts,updated_at=now()
   `,[actor,p.follows,p.comments,p.likes,p.reposts]);
   return NextResponse.json({ok:true,ownerScoped:true,preferences:p},{headers});
  }
  if(input.target===actor)throw new HttpError(400,"Cannot mute your own wallet.");
  if(input.action==="mute"){
   const r=await query(`
    INSERT INTO social_mutes(muter,muted)
    SELECT $1,$2 WHERE EXISTS(
      SELECT 1 FROM social_profiles WHERE address=$2 AND suspended=false)
    ON CONFLICT DO NOTHING RETURNING muted
   `,[actor,input.target]);
   if(!r.rowCount){
    const exists=await query("SELECT 1 FROM social_profiles WHERE address=$1 AND suspended=false",[input.target]);
    if(!exists.rowCount)throw new HttpError(404,"Creator not found.");
   }
  }else{
   await query("DELETE FROM social_mutes WHERE muter=$1 AND muted=$2",[actor,input.target]);
  }
  return NextResponse.json({ok:true,ownerScoped:true,muted:input.action==="mute"},{headers});
 }catch(error){return failure(error);}
}
