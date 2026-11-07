import {createHash} from "node:crypto";
import {getAddress,isAddress} from "viem";
import {validateEnvelope,type SealedEnvelope} from "./dm-envelope";
import {identityWritesEnabled} from "../social/auth";
import {m3SocialWritesEnabled} from "../social/m3-social-access";

/** Request metadata only; this NEVER permits message transport or key uploads.
 * Default false. Only an explicitly approved protected Preview can enable.
 */
export function m5RequestsEnabled():boolean{
 return process.env.LOOKE_M5_MESSAGE_REQUEST_WRITES_ENABLED==="true"
   && identityWritesEnabled() && m3SocialWritesEnabled()
   && process.env.LOOKE_PUBLIC_BETA_ENABLED!=="true"
   && (process.env.VERCEL_ENV==="preview" || process.env.NODE_ENV!=="production");
}
export const M5_TRANSPORT_APPROVED=false as const;
export const M5_KEY_REGISTRATION_APPROVED=false as const;
export const M5_RECOVERY_AUDITED=false as const;
export function m5FutureTransportAllowed():false{return false;}

/** Enforce canonical encoding so two spellings cannot bypass nonce deduplication.
 * Offline validation only; presence of an envelope is NOT an authenticity proof.
 */
function canonicalBytes(s:string,size:number):Buffer{
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(s)||s.length%4!==0)
   throw new Error("Envelope bytes must use canonical padded base64.");
 const bytes=Buffer.from(s,"base64");
 if(bytes.length!==size||bytes.toString("base64")!==s)
   throw new Error("Noncanonical or wrong-length envelope field.");
 return bytes;
}
function wallet(value:string):string{
 if(!isAddress(value)||/^0x0{40}$/i.test(value))
   throw new Error("Nonzero EVM account required.");
 return getAddress(value).toLowerCase();
}
export function inspectM5Envelope(input:unknown,sender:string,recipient:string):{
  envelope:SealedEnvelope;sender:string;recipient:string;nonceDigest:string;
} {
 const a=wallet(sender),b=wallet(recipient);
 if(a===b)throw new Error("Self-messaging forbidden.");
 const v=validateEnvelope(input);
 // A 24-byte nonce and 48–8192 byte sealed payload are validated but NEVER persisted here.
 const nonce=canonicalBytes(v.nonce,24);
 const ciphertext=Buffer.from(v.ciphertext,"base64");
 if(ciphertext.toString("base64")!==v.ciphertext)
   throw new Error("Noncanonical encrypted payload.");
 const nonceDigest=createHash("sha256").update(nonce).digest("hex");
 return {envelope:v,sender:a,recipient:b,nonceDigest};
}
/** A future key rotation must not silently downgrade or reuse a version.
 * Existing keys are retained for future audited device recovery; this does
 * not register, publish, revoke or encrypt any key.
 */
export function assertM5KeyRotation(owner:string,previous:number|null,next:number,publicKey:string){
 wallet(owner);
 if(!Number.isSafeInteger(next)||next<1||next>10000||
   (previous!==null&&(!Number.isSafeInteger(previous)||previous<1||next!==previous+1)))
   throw new Error("Key rotation requires the next monotonically increasing version.");
 canonicalBytes(publicKey,32);
 return {keyVersion:next,identityVerified:false as const,recoveryReviewed:false as const};
}
