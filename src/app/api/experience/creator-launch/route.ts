import {type NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {HttpError,requireViewer,verifyRequestOrigin} from "../../../../lib/social/auth";
import {query,rateLimit} from "../../../../lib/social/db";
import {failure,readJson} from "../../../../lib/social/http";
import {m6PreviewEnabled,validateM6CreatorPreview} from "../../../../lib/experience/m6-creator";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex"};
const resultRow=z.string().uuid();
/** A signed-in wallet can see only its OWN original, never synthetic, previews. */
export async function GET(req:NextRequest){
 try{
  const actor=(await requireViewer(req)).address;
  const id=req.nextUrl.searchParams.get("id");
  if(id!==null)resultRow.parse(id);
  const q=await query<{
   id:string;name:string;symbol:string;metadata_uri:string;supply_tokens:string;
   quote_preference:string;created_at:Date;expires_at:Date;status:string
  }>(`SELECT id,name,symbol,metadata_uri,supply_tokens,
      quote_preference,created_at,expires_at,status
    FROM social_creator_deployment_previews WHERE owner=$1
      AND ($2::uuid IS NULL OR id=$2::uuid)
    ORDER BY created_at DESC LIMIT 25`,[actor,id]);
  return NextResponse.json({authenticated:true,ownerScoped:true,previews:q.rows,
   transactionsSent:0,liveDeploymentEnabled:false},{headers});
 }catch(error){return failure(error);}
}
/** Immutable review-only draft; may NOT submit a token transaction. */
export async function POST(req:NextRequest){
 try{
  verifyRequestOrigin(req);
  if(!m6PreviewEnabled())throw new HttpError(503,"Creator token deployment preview is disabled pending authorized data and human acceptance.");
  const actor=(await requireViewer(req)).address;
  const input=await readJson(req);
  let v:ReturnType<typeof validateM6CreatorPreview>;
  try{v=validateM6CreatorPreview(input);}
  catch(error){
    if(error instanceof Error && error.name!=="ZodError")
      throw new HttpError(400,"Invalid creator token supply or immutable metadata.");
    throw error;
  }
  await rateLimit(actor,"m6_creator_preview",5,600);
  const rows=await query<{id:string;expires_at:Date}>(`
    INSERT INTO social_creator_deployment_previews
      (owner,client_nonce,name,symbol,metadata_uri,supply_tokens,quote_preference)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,expires_at
  `,[actor,v.clientNonce,v.name,v.symbol,v.metadataURI,v.supplyTokens,v.pair]);
  return NextResponse.json({owner:actor,previewId:rows.rows[0].id,
   expiresAt:rows.rows[0].expires_at,reviewed:v,
   executionEnabled:false,walletActionRequested:false,
   note:"Unsigned creator preview only. No verified factory, real receipt, token pair, liquidity, approval or gas estimate is implied."},
   {headers});
 }catch(error){return failure(error);}
}
