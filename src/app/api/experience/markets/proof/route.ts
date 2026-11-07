import {type NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {requireViewer} from "../../../../../lib/social/auth";
import {failure} from "../../../../../lib/social/http";
import {query} from "../../../../../lib/social/db";
import {m7VerifiedMarket} from "../../../../../lib/experience/m7-market-sources";
import {assertM7HistoricalProof} from "../../../../../lib/experience/m7-market-policy";
import {verifySubmittedSwap} from "../../../../../lib/ops/m11-trades";
import {m6ReadOnlyClient} from "../../../../../lib/experience/m6-chain-proof";
import {assertUltraTestnet,assertHash,assertConfirmations} from "../../../../../lib/verification";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex"};
/** Verify independently wallet-submitted historical transactions ONLY.
 * Not a wallet action or finance broadcast endpoint.
 */
export async function GET(req:NextRequest){
 try{
  const owner=(await requireViewer(req)).address;
  const id=z.string().uuid().parse(req.nextUrl.searchParams.get("reviewId"));
  const txHash=z.string().parse(req.nextUrl.searchParams.get("txHash"));
  assertHash(txHash);
  const result=await query<{
   market_id:string;direction:"buy"|"sell";amount_in:string;minimum_output:string;
   router:string;pair:string;quoted_at:Date;expires_at:Date
  }>(`SELECT market_id,direction,amount_in,minimum_output,router,pair,quoted_at,expires_at
    FROM social_market_review_intents WHERE id=$1 AND owner=$2 AND status='review'`,[id,owner]);
  if(!result.rows.length)return NextResponse.json({status:"not-found",reason:"No original wallet-owned unsigned market review."},{status:404,headers});
  const row=result.rows[0];
  await m7VerifiedMarket(row.market_id);
  const verified=await verifySubmittedSwap({marketId:row.market_id,direction:row.direction,txHash,wallet:owner});
  const client=m6ReadOnlyClient();
  await assertUltraTestnet(client);
  const receipt=await client.getTransactionReceipt({hash:txHash});
  const [block,head]=await Promise.all([
   client.getBlock({blockNumber:receipt.blockNumber}),client.getBlockNumber()
  ]);
  if(!block.hash||block.hash.toLowerCase()!==receipt.blockHash.toLowerCase())
   throw Error("Historical trade receipt is not on a canonical block.");
  assertConfirmations(receipt.blockNumber,head);
  assertM7HistoricalProof({
   marketId:row.market_id,owner,direction:row.direction,amountIn:row.amount_in,
   minimumOutput:row.minimum_output,router:row.router,pair:row.pair,
   quotedAt:row.quoted_at,expiresAt:row.expires_at
  },verified,Number(block.timestamp));
  return NextResponse.json({status:"verified-historical-only",evidence:verified,
   originalReviewId:id,createdByLooke:false,transactionsSentByLooke:0,
   approvalsSentByLooke:0},{headers});
 }catch(error){return failure(error);}
}
