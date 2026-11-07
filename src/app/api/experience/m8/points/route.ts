import {type NextRequest,NextResponse} from "next/server";
import {requireViewer} from "../../../../../lib/social/auth";
import {failure} from "../../../../../lib/social/http";
import {m8OwnerPointsReconciliation} from "../../../../../lib/experience/m8-points-reconcile";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 try{
  const account=(await requireViewer(req)).address;
  const proof=await m8OwnerPointsReconciliation(account);
  return NextResponse.json({authenticated:true,ownerScoped:true,chainId:18881,
   ledger:proof,gamePointConversionEnabled:false,tokenMintingEnabled:false,
   financialTransactionsSent:0,mode:"offchain-source-reconciliation-only"},
   {headers:{"cache-control":"private, no-store","x-robots-tag":"noindex"}});
 }catch(e){return failure(e);}
}
