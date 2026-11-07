/** M4 media is completely separate from the M3 text and the historical
 * master social-write switch. Live activation requires original approved
 * provider/database/moderator/operator evidence, not CI fixtures.
 */
import {m3SocialWritesEnabled} from "./m3-social-access";
export function m4MediaWritesEnabled():boolean{
 return process.env.LOOKE_M4_CREATOR_MEDIA_WRITES_ENABLED==="true" &&
   process.env.LOOKE_MEDIA_UPLOADS_ENABLED==="true" &&
   process.env.LOOKE_PUBLIC_BETA_ENABLED!=="true" &&
   (process.env.VERCEL_ENV==="preview" || process.env.NODE_ENV!=="production") &&
   m3SocialWritesEnabled();
}
/** A separately enrolled moderator must approve/reject each uploaded asset. */
export function m4ModerationWritesEnabled():boolean{
 return m4MediaWritesEnabled() && process.env.LOOKE_M4_MEDIA_MODERATION_WRITES_ENABLED==="true";
}
export function m4AllowsModerationAction(action:unknown):boolean{
 return m4ModerationWritesEnabled() && (action==="approve_media"||action==="reject_media");
}
