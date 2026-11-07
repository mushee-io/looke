/** Final10 M3: separate opt-in social write gate, never a financial release switch.
 * Only explicitly allowed public/social operations can run under the M3 flag.
 * Master social writes retain their preexisting historical behavior.
 */
import { identityWritesEnabled, writesEnabled } from "./auth";

export function m3SocialWritesEnabled():boolean{
  return process.env.LOOKE_M3_SOCIAL_WRITES_ENABLED==="true" && identityWritesEnabled();
}
const allowedM3Actions=new Set([
  "post","comment","follow","unfollow","block","unblock","report"
]);
export function m3SocialActionAllowed(action:unknown):boolean{
  return typeof action==="string" && allowedM3Actions.has(action);
}
export function canWriteSocialAction(action:unknown):boolean{
  return writesEnabled() || (m3SocialWritesEnabled() && m3SocialActionAllowed(action));
}
/** M3 is text-only; creator token references and hosted uploads belong to M4/M6. */
export function requireM3TextOnlyPost(input:{
  asset:unknown;media:unknown;mediaUploadId:unknown
}):void {
  if(writesEnabled())return;
  if(!m3SocialWritesEnabled())throw new Error("M3 social writes have not been authorized.");
  if(input.asset!==null || input.media!==null || input.mediaUploadId!=null)
    throw new M3TextOnlyError();
}
export class M3TextOnlyError extends Error{
  constructor(){super("M3 permits moderated text posts only; media and token references remain disabled.");}
}
