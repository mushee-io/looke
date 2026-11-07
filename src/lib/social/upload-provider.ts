import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import type {MediaKind,MediaReference} from "./media";
import {m4MediaWritesEnabled} from "./m4-creator";

/** Provider-backed direct uploads. Secrets are never exposed in the browser. */
export const uploadDraft=z.object({
  kind:z.enum(["image","video"]),
  mime:z.enum(["image/png","image/jpeg","image/webp","image/gif","video/mp4","video/webm"]),
  bytes:z.number().int().positive().max(20_000_000),
}).strict().superRefine((v,ctx)=>{
  if((v.kind==="image"&&!v.mime.startsWith("image/"))||
    (v.kind==="video"&&!v.mime.startsWith("video/"))||
    (v.kind==="image"&&v.bytes>5_000_000))
    ctx.addIssue({code:"custom",message:"Upload kind, MIME and maximum file size do not match."});
});
export type UploadDraft=z.infer<typeof uploadDraft>;
export const uploadId=z.string().uuid();
const FORMATS:Record<MediaKind,string>={
 image:"png,jpg,jpeg,webp,gif",
 video:"mp4,webm",
};
export type UploadProviderConfig={
 cloudName:string;apiKey:string;apiSecret:string;
};
export function uploadEnabled():boolean{
 return process.env.LOOKE_MEDIA_UPLOADS_ENABLED==="true" &&
   (process.env.LOOKE_SOCIAL_WRITES_ENABLED==="true" || m4MediaWritesEnabled());
}
export function uploadConfig():UploadProviderConfig{
 const cloudName=process.env.LOOKE_CLOUDINARY_CLOUD_NAME??"";
 const apiKey=process.env.LOOKE_CLOUDINARY_API_KEY??"";
 const apiSecret=process.env.LOOKE_CLOUDINARY_API_SECRET??"";
 if(!/^[a-zA-Z0-9_-]{2,60}$/.test(cloudName)||
   !/^[0-9]{5,30}$/.test(apiKey)||apiSecret.length<20)
   throw new Error("Signed media provider is not configured.");
 return {cloudName,apiKey,apiSecret};
}
export function createUploadPublicId(owner:string):string{
 if(!/^0x[0-9a-f]{40}$/.test(owner))
   throw new Error("Authenticated normalized EVM wallet required.");
 return "looke/social/"+owner+"/"+randomUUID();
}
export function signatureFor(params:Record<string,string>,secret:string):string{
 const canonical=Object.entries(params).filter(([key])=>key!=="file"&&key!=="api_key"&&key!=="signature")
   .sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>key+"="+value).join("&");
 return createHash("sha1").update(canonical+secret).digest("hex");
}
export function createUploadAuthorization(
 config:UploadProviderConfig,owner:string,draft:UploadDraft,epochSeconds:number
){
 const validated=uploadDraft.parse(draft);
 if(!Number.isSafeInteger(epochSeconds)||epochSeconds<1)throw new Error("Invalid time.");
 const publicId=createUploadPublicId(owner);
 const folder="looke/social/"+owner;
 const params={
   timestamp:String(epochSeconds),
   folder,public_id:publicId.split("/").at(-1)!,
   overwrite:"false",
   unique_filename:"false",
   allowed_formats:FORMATS[validated.kind],
 };
 const signature=signatureFor(params,config.apiSecret);
 return {
   publicId,parameters:params,signature,apiKey:config.apiKey,
   uploadUrl:`https://api.cloudinary.com/v1_1/${config.cloudName}/${validated.kind}/upload`,
 };
}
export type ProviderAsset={
 public_id:string;asset_id:string;resource_type:string;
 secure_url:string;bytes:number;format:string;type:string;
 created_at?:string;version?:number;
};
export function verifyProviderAsset(input:{
 config:UploadProviderConfig;asset:ProviderAsset;publicId:string;
 draft:UploadDraft;expectedOwner:string;
}):MediaReference{
 const {config,asset,publicId,draft,expectedOwner}=input;
 const expectedPrefix="looke/social/"+expectedOwner+"/";
 if(!publicId.startsWith(expectedPrefix)||asset.public_id!==publicId||
   !/^[a-zA-Z0-9_-]{12,}$/.test(asset.asset_id??"")||
   asset.type!=="upload"||asset.resource_type!==draft.kind||
   !Number.isSafeInteger(asset.bytes)||asset.bytes!==draft.bytes||
   asset.bytes>(draft.kind==="image"?5_000_000:20_000_000))
   throw new Error("Provider asset does not match the signed, wallet-scoped upload.");
 const allowed=(draft.kind==="image"?["png","jpg","jpeg","webp","gif"]:["mp4","webm"]);
 const expectedFormat=draft.mime==="image/jpeg"?"jpg":draft.mime.split("/")[1];
 if(!allowed.includes(asset.format)||asset.format!==expectedFormat)
   throw new Error("Provider file format differs from the authorized upload.");
 let u:URL;
 try{u=new URL(asset.secure_url);}catch{throw new Error("Provider returned an invalid media URL.");}
 const root="/"+config.cloudName+"/"+draft.kind+"/upload/";
 const tail=u.pathname.startsWith(root)?u.pathname.slice(root.length):"";
 if(u.origin!=="https://res.cloudinary.com"||u.username||u.password||
   u.search||u.hash||u.port||
   !/^v[1-9][0-9]*\//.test(tail)||
   !tail.endsWith("/"+publicId+"."+asset.format)||
   tail.slice(tail.indexOf("/")+1)!==publicId+"."+asset.format)
   throw new Error("Provider media URL has an unapproved source, version, asset path or format.");
 return {url:u.href,kind:draft.kind};
}
/** A server-to-server authenticated inspection; browser result alone is never proof. */
export async function fetchProviderAsset(
 config:UploadProviderConfig,kind:MediaKind,publicId:string
):Promise<ProviderAsset>{
 const url=`https://api.cloudinary.com/v1_1/${config.cloudName}/resources/${kind}/upload/${encodeURIComponent(publicId)}`;
 const res=await fetch(url,{
   headers:{authorization:"Basic "+Buffer.from(config.apiKey+":"+config.apiSecret).toString("base64")},
   cache:"no-store",redirect:"error",signal:AbortSignal.timeout(9000),
 });
 if(!res.ok)throw new Error("Provider did not confirm this uploaded media asset.");
 return await res.json() as ProviderAsset;
}

/** For M4 signed upload confirmation, compare original provider creation receipt
 * to the DB-authorized time window. This is server-to-server metadata verification,
 * not a cryptographic provider signature or independent human approval.
 */
export function verifyM4ProviderReceipt(asset:ProviderAsset,issuedAt:Date,expiresAt:Date):void{
 const timestamp=typeof asset.created_at==="string"?Date.parse(asset.created_at):NaN;
 const lower=new Date(issuedAt).getTime()-120_000;
 const upper=new Date(expiresAt).getTime()+120_000;
 if(!Number.isFinite(timestamp)||timestamp<lower||timestamp>upper||
   !Number.isSafeInteger(asset.version)||Number(asset.version)<1)
   throw new Error("Provider receipt timestamp/version does not match the authorized upload window.");
}
