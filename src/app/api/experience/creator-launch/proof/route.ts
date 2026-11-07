import {type NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {requireViewer} from "../../../../../lib/social/auth";
import {query} from "../../../../../lib/social/db";
import {failure} from "../../../../../lib/social/http";
import {m6ConfiguredFactory,m6ReadOnlyClient,verifyM6Factory,verifyM6CoinReceipt}
 from "../../../../../lib/experience/m6-chain-proof";
import {validateM6CreatorPreview} from "../../../../../lib/experience/m6-creator";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex"};
/** On-chain proof only if original operator-allowlisted factory receipt+runtime hash
 * and the exact owner-created transaction exist. NEVER broadcasts a transaction.
 */
export async function GET(req:NextRequest){
 try{
  const account=(await requireViewer(req)).address;
  const hash=req.nextUrl.searchParams.get("hash");
  const id=req.nextUrl.searchParams.get("id");
  const config=m6ConfiguredFactory();
  if(!config)return NextResponse.json({status:"blocked",reason:"Missing original M6 factory deployment hash, address and independently approved runtime hash.",
   transactionsSent:0,liquidityCreated:false},{headers});
  const client=m6ReadOnlyClient();
  const factory=await verifyM6Factory(client,config);
  if(hash===null||id===null)return NextResponse.json({status:"factory-only",factory,
   creatorTxVerified:false,financialActionsEnabled:false,liquidityCreated:false},{headers});
  const previewId=z.string().uuid().parse(id);
  const row=await query<{
   name:string;symbol:string;metadata_uri:string;supply_tokens:string;
   quote_preference:"ULTRA"|"LOOKE";client_nonce:string;expires_at:Date
  }>(`SELECT name,symbol,metadata_uri,supply_tokens,quote_preference,
      client_nonce,expires_at FROM social_creator_deployment_previews
    WHERE id=$1 AND owner=$2`,[previewId,account]);
  if(row.rowCount!==1)return NextResponse.json({status:"not-found",reason:"No wallet-owned original deployment preview."},{status:404,headers});
  const input=row.rows[0];
  // Revalidate original values and always bind chain evidence to owner.
  const expected=validateM6CreatorPreview({
   name:input.name,symbol:input.symbol,pair:input.quote_preference,
   supplyTokens:input.supply_tokens,metadataURI:input.metadata_uri,clientNonce:input.client_nonce
  });
  const verified=await verifyM6CoinReceipt(client,factory,account,hash,expected);
  return NextResponse.json({status:"verified-read-only",factory,coin:verified,
   walletAuthorization:"historical on-chain signer only",transactionsSent:0,
   financialActionsEnabled:false,liquidityCreated:false},{headers});
 }catch(error){return failure(error);}
}
