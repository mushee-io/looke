/** M6 server-only draft write switch; never import in client components. */
import {m3SocialWritesEnabled} from "../social/m3-social-access";
export function m6DraftWritesEnabled():boolean{
 return process.env.LOOKE_M6_CREATOR_DRAFT_WRITES_ENABLED==="true" &&
  m3SocialWritesEnabled() &&
  process.env.LOOKE_PUBLIC_BETA_ENABLED!=="true" &&
  (process.env.VERCEL_ENV==="preview" || process.env.NODE_ENV!=="production");
}
