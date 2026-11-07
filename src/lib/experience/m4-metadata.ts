import {z} from "zod";
import {validateQuickTokenDraft} from "./validation";

/** Validate a NON-ISSUING draft. Neither URI nor image is fetched/pinned here. */
const draft=z.object({
  name:z.string().min(1).max(80),
  symbol:z.string().min(1).max(24),
  pair:z.enum(["ULTRA","LOOKE"]),
  description:z.string().max(500).default(""),
  imageURI:z.string().max(700).default(""),
  metadataURI:z.string().max(700).default(""),
}).strict();

function safeMetadataURI(raw:string):string{
 const value=raw.trim();
 if(!value)return "";
 if(/[\u0000-\u001f\u007f\\]/.test(value))throw new Error("Invalid control characters in metadata URI.");
 if(value.startsWith("ipfs://")){
   if(!/^ipfs:\/\/(?:bafy[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{44})(?:\/[a-zA-Z0-9_.\/-]{1,300})?$/.test(value) ||
       value.includes(".."))throw new Error("Invalid content-addressed IPFS URI.");
   return value;
 }
 if(value.startsWith("ar://")){
   if(!/^ar:\/\/[a-zA-Z0-9_-]{43}(?:\/[a-zA-Z0-9_.\/-]{1,300})?$/.test(value)||
     value.includes(".."))throw new Error("Invalid Arweave URI.");
   return value;
 }
 let u:URL;
 try{u=new URL(value);}catch{throw new Error("Metadata must be a valid IPFS, Arweave or HTTPS URI.");}
 if(u.protocol!=="https:" || u.username||u.password||u.port||u.hash||
    u.hostname.length>253||!u.hostname.includes(".")||
    /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.test|.*\.invalid)$/i.test(u.hostname)||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(u.hostname)||
    u.hostname.startsWith("[") || u.search)
   throw new Error("Metadata URI must use a public HTTPS hostname with no credentials or query.");
 return u.href;
}
export function validateM4TokenDraft(input:unknown){
 const fields=draft.parse(input);
 const basic=validateQuickTokenDraft(fields.name,fields.symbol,fields.pair);
 const description=fields.description.trim();
 if(/[\u0000-\u0008\u000b-\u001f\u007f]/.test(description))
   throw new Error("Description contains invalid control characters.");
 return {
  ...basic,description,
  imageURI:safeMetadataURI(fields.imageURI),
  metadataURI:safeMetadataURI(fields.metadataURI),
  chainId:18881 as const,reviewOnly:true as const,
  metadataSourceVerified:false as const,deployable:false as const,
 };
}
