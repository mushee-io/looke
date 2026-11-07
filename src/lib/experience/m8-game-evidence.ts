/** M8 independently signed game event candidates, QUARANTINED ONLY. */
import {createHash} from "node:crypto";
import {getAddress,isAddress,verifyMessage,type Hex} from "viem";
import {z} from "zod";
export const M8_GAME_CREDIT_ENABLED=false as const;
export const M8_POINTS_CONVERSION_ENABLED=false as const;
export const M8_AIRDROP_ENABLED=false as const;
export const M8_VESTING_CLAIM_ENABLED=false as const;
const nonZeroHash=z.string().regex(/^0x[0-9a-f]{64}$/).refine(s=>!/^0x0{64}$/.test(s));
const account=z.string().refine(s=>isAddress(s)&&!/^0x0{40}$/i.test(s));
const iso=z.string().datetime({offset:false});
const entry=z.object({
 source:z.string().regex(/^[a-z][a-z0-9-]{2,39}$/),
 eventId:z.string().regex(/^[a-zA-Z0-9:_-]{8,96}$/),
 owner:account,sourceIdentityHash:nonZeroHash,sourceRecordHash:nonZeroHash,
 seasonId:z.string().uuid(),points:z.number().int().min(1).max(100_000),
 occurredAt:iso,issuedAt:iso,expiresAt:iso,
 nonce:z.string().regex(/^[0-9a-f]{32}$/),
 issuerSignature:z.string().regex(/^0x[0-9a-fA-F]{130}$/),
 reviewerSignature:z.string().regex(/^0x[0-9a-fA-F]{130}$/)
}).strict();
export function m8ConfiguredGameSource(){
 if(process.env.LOOKE_M8_SOURCE_AUDIT_APPROVED!=="true")return null;
 const source=process.env.LOOKE_M8_SOURCE_SLUG||"";
 const issuer=process.env.LOOKE_M8_SOURCE_ISSUER||"";
 const reviewer=process.env.LOOKE_M8_INDEPENDENT_REVIEWER||"";
 if(!/^[a-z][a-z0-9-]{2,39}$/.test(source)||!isAddress(issuer)||!isAddress(reviewer)||
  /^0x0{40}$/i.test(issuer)||/^0x0{40}$/i.test(reviewer)||getAddress(issuer)===getAddress(reviewer))
   return null;
 return {source,issuer:getAddress(issuer),reviewer:getAddress(reviewer)};
}
export function m8GameStagingEnabled(){
 return process.env.LOOKE_M8_GAME_IMPORT_STAGE_ENABLED==="true"&&
 process.env.LOOKE_M2_IDENTITY_WRITES_ENABLED==="true"&&
 process.env.LOOKE_PUBLIC_BETA_ENABLED!=="true"&&
 (process.env.VERCEL_ENV==="preview"||process.env.NODE_ENV!=="production")&&
 m8ConfiguredGameSource()!==null;
}
export type M8GameImport=z.infer<typeof entry>;
export function m8GameStatement(row:Omit<M8GameImport,"issuerSignature"|"reviewerSignature">,origin:string){
 if(!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/.test(origin)&&origin!=="http://localhost:3000")
   throw Error("Approved exact HTTPS origin required for M8 source signatures.");
 return [
 "Looke Final10 M8 / quarantined game evidence / NO POINTS CREDIT",
 "origin="+origin,"chain=18881","source="+row.source,
 "event="+row.eventId,"owner="+getAddress(row.owner).toLowerCase(),
 "sourceIdentityHash="+row.sourceIdentityHash,
 "sourceRecordHash="+row.sourceRecordHash,
 "season="+row.seasonId.toLowerCase(),"claimedPoints="+row.points,
 "occurredAt="+row.occurredAt,"issuedAt="+row.issuedAt,
 "expiresAt="+row.expiresAt,"nonce="+row.nonce
 ].join("\n");
}
export async function verifyM8GameEvidence(raw:unknown,owner:string,origin:string,now=Date.now()){
 const v=entry.parse(raw);
 const config=m8ConfiguredGameSource();
 if(!config||v.source!==config.source)throw Error("Independent original game-source authorization missing.");
 if(getAddress(v.owner)!==getAddress(owner)||
    getAddress(owner)===config.issuer||getAddress(owner)===config.reviewer)
   throw Error("Game source evidence is not bound to this independent signed-in owner.");
 const [eventMs,issuedMs,expiryMs]=[v.occurredAt,v.issuedAt,v.expiresAt].map(s=>Date.parse(s));
 if(![eventMs,issuedMs,expiryMs,now].every(Number.isFinite)||
    eventMs>issuedMs||eventMs<issuedMs-365*86400_000||
    issuedMs>now+30_000||now-issuedMs>300_000||
    expiryMs<=now||expiryMs-issuedMs>300_000||expiryMs<=issuedMs)
   throw Error("Game event chronology or one-use signature expiry is invalid.");
 const message=m8GameStatement(v,origin);
 const [a,b]=await Promise.all([
  verifyMessage({address:config.issuer,message,signature:v.issuerSignature as Hex}),
  verifyMessage({address:config.reviewer,message,signature:v.reviewerSignature as Hex})
 ]);
 if(!a||!b)throw Error("Original issuer and independent reviewer signed attestations are required.");
 const attestationHash=createHash("sha256").update(message).digest("hex");
 return {owner:getAddress(owner).toLowerCase(),...v,attestationHash,
  status:"quarantined" as const,pointsCredited:0 as const,
  independentlyAuditedOriginalRecord:false as const};
}
