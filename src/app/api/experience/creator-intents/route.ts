import {randomBytes} from "node:crypto";
import {type NextRequest,NextResponse} from "next/server";
import {requireViewer,verifyRequestOrigin,HttpError} from "../../../../lib/social/auth";
import {query,rateLimit} from "../../../../lib/social/db";
import {failure,readJson} from "../../../../lib/social/http";
import {m6DraftWritesEnabled,reviewUnsignedM6Creator} from "../../../../lib/experience/m6-creator";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex"};
export async function GET(req:NextRequest){
 try{
  const actor=(await requireViewer(req)).address;
  const result=await query<{
   id:string;chain_id:number;token_name:string;token_symbol:string;
   metadata_uri:string;initial_supply_units:string;pair_preference:string;
   client_nonce:string;calldata_hash:string;status:string;created_at:Date
  }>(`SELECT id,chain_id,token_name,token_symbol,metadata_uri,initial_supply_units,
    pair_preference,client_nonce,calldata_hash,status,created_at
    FROM social_creator_token_intents WHERE owner=$1 ORDER BY created_at DESC,id DESC LIMIT 40`,[actor]);
  return NextResponse.json({authenticated:true,ownerScoped:true,intents:result.rows,
   deploymentsVerified:0,receiptsClaimed:0},{headers});
 }catch(error){return failure(error);}
}
/** A user explicitly reviews and saves only an UNSIGNED proposal.
 * This never calls an RPC, EVM wallet, factory or financial provider.
 */
export async function POST(req:NextRequest){
 try{
  verifyRequestOrigin(req);
  if(!m6DraftWritesEnabled())
   throw new HttpError(503,"M6 creator plans are disabled until approved current PostgreSQL and Preview origin.");
  const actor=(await requireViewer(req)).address;
  await rateLimit(actor,"creator_m6_draft",5,600);
  const data=await readJson(req);
  const nonce=("0x"+randomBytes(32).toString("hex"));
  const plan=reviewUnsignedM6Creator(data,nonce);
  const saved=await query<{id:string}>(`
   INSERT INTO social_creator_token_intents(owner,token_name,token_symbol,metadata_uri,
     initial_supply_units,pair_preference,client_nonce,calldata_hash)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
  `,[actor,plan.name,plan.symbol,plan.metadataURI,plan.supply,plan.pair,plan.nonce,plan.calldataHash]);
  return NextResponse.json({intentId:saved.rows[0].id,owner:actor,
    status:"prepared",signed:false,plan},{headers});
 }catch(error){return failure(error);}
}
