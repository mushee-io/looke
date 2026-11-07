import { createHash, randomBytes, randomUUID } from "node:crypto";
import { verifyMessage } from "viem";
import { type NextRequest, NextResponse } from "next/server";
import { query, rateLimit } from "./db";
import { address, signInMessage } from "./validation";

type ViewerRow = {address:string;handle:string;suspended:boolean};
export const COOKIE_NAME=process.env.NODE_ENV==="production"?"__Host-looke_social":"looke_social_dev";
const SEVEN_DAYS_MS=7*24*3600*1000;

export function socialOrigin() {
  const raw=process.env.LOOKE_SOCIAL_APP_ORIGIN || (process.env.NODE_ENV==="production"?"":"http://localhost:3000");
  if(!raw)throw new Error("LOOKE_SOCIAL_APP_ORIGIN must be configured in production.");
  const url=new URL(raw);
  if(url.origin!==raw || !["https:","http:"].includes(url.protocol) || (process.env.NODE_ENV==="production" && url.protocol!=="https:")) {
    throw new Error("Invalid social application origin.");
  }
  return raw;
}
export function verifyRequestOrigin(req:NextRequest){
  if(req.headers.get("origin")!==socialOrigin())throw new HttpError(403,"Request origin does not match Looke.");
  const type=req.headers.get("content-type")||"";
  if(!type.toLowerCase().startsWith("application/json"))throw new HttpError(415,"JSON content type required.");
}

export function writesEnabled() {return process.env.LOOKE_SOCIAL_WRITES_ENABLED==="true";}
export function identityWritesEnabled() {return process.env.LOOKE_M2_IDENTITY_WRITES_ENABLED==="true" || writesEnabled();}
export function identityConfigured() {
 return Boolean(process.env.DATABASE_URL && process.env.LOOKE_SOCIAL_APP_ORIGIN && identityWritesEnabled());
}

export class HttpError extends Error { constructor(public status:number,message:string){super(message);} }

export async function viewer(req:NextRequest):Promise<ViewerRow|null>{
  const token=req.cookies.get(COOKIE_NAME)?.value;
  if(!token || !/^[0-9a-f]{64}$/.test(token))return null;
  const hash=createHash("sha256").update(token).digest("hex");
  const result=await query<ViewerRow>(`
    SELECT p.address,p.handle,p.suspended FROM social_sessions s
    JOIN social_profiles p ON p.address=s.address
    WHERE s.token_hash=$1 AND s.expires_at>now() LIMIT 1`,[hash]);
  return result.rows[0]??null;
}
export async function requireViewer(req:NextRequest):Promise<ViewerRow>{
  const v=await viewer(req);
  if(!v)throw new HttpError(401,"Sign in with your wallet first.");
  if(v.suspended)throw new HttpError(403,"This profile is suspended.");
  return v;
}
export async function createChallenge(wallet:string){
  if(!identityWritesEnabled())throw new HttpError(503,"Looke wallet identity is disabled pending approved database and origin setup.");
  const addr=address.parse(wallet);
  await rateLimit(addr,"challenge",5,300);
  const id=randomUUID();
  const nonce=randomBytes(16).toString("hex");
  const issued=new Date(), expires=new Date(issued.getTime()+5*60_000);
  const message=signInMessage({
    origin:socialOrigin(),address:addr,nonce,
    issued:issued.toISOString(),expires:expires.toISOString(),
  });
  await query(`INSERT INTO social_auth_challenges(id,address,message,expires_at) VALUES($1,$2,$3,$4)`,[id,addr,message,expires]);
  return {challengeId:id,message,expiresAt:expires.toISOString(),network:"Ultra EVM Testnet (18881)"};
}
export async function verifyChallenge(id:string,signature:string){
  if(!identityWritesEnabled())throw new HttpError(503,"Looke wallet identity is disabled.");
  const result=await query<{address:string;message:string}>(`
    SELECT address,message FROM social_auth_challenges
    WHERE id=$1 AND used_at IS NULL AND expires_at>now() LIMIT 1`,[id]);
  const data=result.rows[0];
  if(!data)throw new HttpError(401,"Sign-in challenge expired or has already been used.");
  const valid=await verifyMessage({address:data.address as `0x${string}`,message:data.message,signature:signature as `0x${string}`});
  if(!valid)throw new HttpError(401,"Signature does not match the challenged wallet.");
  const consumed=await query(`
    UPDATE social_auth_challenges SET used_at=now()
    WHERE id=$1 AND used_at IS NULL AND expires_at>now() RETURNING address`,[id]);
  if(consumed.rowCount!==1)throw new HttpError(409,"Sign-in challenge already consumed.");
  const addr=data.address;
  const defaultHandle="u"+addr.slice(2,17);
  await query(`INSERT INTO social_profiles(address,handle,display_name)
    VALUES($1,$2,$3) ON CONFLICT(address) DO NOTHING`,[addr,defaultHandle,"Looke Creator"]);
  const profile=await query<ViewerRow>(`SELECT address,handle,suspended FROM social_profiles WHERE address=$1`,[addr]);
  const user=profile.rows[0];
  if(!user || user.suspended)throw new HttpError(403,"This profile cannot sign in.");
  const token=randomBytes(32).toString("hex");
  const hash=createHash("sha256").update(token).digest("hex");
  await query(`INSERT INTO social_sessions(token_hash,address,expires_at) VALUES($1,$2,$3)`,
    [hash,addr,new Date(Date.now()+SEVEN_DAYS_MS)]);
  return {token,user};
}
export function sessionResponse(token:string,user:ViewerRow){
  const res=NextResponse.json({authenticated:true,user},{headers:{"cache-control":"no-store"}});
  res.cookies.set({
    name:COOKIE_NAME,value:token,httpOnly:true,secure:process.env.NODE_ENV==="production",
    sameSite:"strict",path:"/",maxAge:7*24*3600,
  });
  return res;
}
export async function logout(req:NextRequest){
  const token=req.cookies.get(COOKIE_NAME)?.value;
  if(token && /^[0-9a-f]{64}$/.test(token)){
    await query("DELETE FROM social_sessions WHERE token_hash=$1",
      [createHash("sha256").update(token).digest("hex")]);
  }
  const res=NextResponse.json({authenticated:false});
  res.cookies.set({name:COOKIE_NAME,value:"",maxAge:0,path:"/",httpOnly:true,
    secure:process.env.NODE_ENV==="production",sameSite:"strict"});
  return res;
}
