import {type NextRequest,NextResponse} from "next/server";
import {requireViewer} from "../../../../lib/social/auth";
import {query} from "../../../../lib/social/db";
import {failure} from "../../../../lib/social/http";
import {m8MarketAssetList,m8ReadConfirmedBalances,m8ReadConfirmedTransfers}
 from "../../../../lib/experience/m8-portfolio";
import {m6ReadOnlyClient} from "../../../../lib/experience/m6-chain-proof";
import type {MarketSnapshot} from "../../../../lib/trading";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex"};
/** Final10 M8: no user-supplied wallet/addresses. Wallet session sets owner.
 * All holdings and activity depend on independently verified M6/M7 sources.
 */
export async function GET(req:NextRequest){
 try{
  const account=(await requireViewer(req)).address;
  const mode=req.nextUrl.searchParams.get("mode")||"holdings";
  if(!["holdings","activity","creator"].includes(mode))
   return NextResponse.json({error:"Unsupported verified portfolio mode."},{status:400,headers});
  if(mode==="creator"){
   const result=await query<{posts:number;followers:number;likes:number;reposts:number}>(`
     SELECT
      (SELECT count(*)::integer FROM social_posts p WHERE p.author=$1
        AND p.hidden=false AND p.deleted_at IS NULL
        AND (p.media_url IS NULL OR p.media_status='approved')) AS posts,
      (SELECT count(*)::integer FROM social_follows f WHERE f.followed=$1
        AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE
          (b.blocker=$1 AND b.blocked=f.follower) OR (b.blocker=f.follower AND b.blocked=$1))) AS followers,
      (SELECT count(*)::integer FROM social_post_likes l JOIN social_posts p
        ON p.id=l.post_id WHERE p.author=$1 AND p.hidden=false AND p.deleted_at IS NULL) AS likes,
      (SELECT count(*)::integer FROM social_post_reposts r JOIN social_posts p
        ON p.id=r.post_id WHERE p.author=$1 AND p.hidden=false AND p.deleted_at IS NULL) AS reposts
   `,[account]);
   return NextResponse.json({ownerScoped:true,
    socialActivity:{...result.rows[0],source:"real-owner-filtered-postgresql"},
    creatorTokenStats:null,verifiedMarketExposure:null,impressions:null,profits:null,
    notes:"Source-backed on-platform counts only. On-chain token analytics unavailable without approved original market proofs."},{headers});
  }
  const {m7VerifiedMarketFeed}=await import("../../../../lib/experience/m7-market-sources");
  const feed=await m7VerifiedMarketFeed();
  if(feed.status!=="verified")return NextResponse.json({status:"blocked",
   ownerScoped:true,verifiedHoldings:null,verifiedTransferActivity:null,
   reason:"No independently proven Ultra EVM Testnet M6 creator issuer and M7 market/token source.",transactionsSent:0},
   {status:503,headers});
  const trusted=feed.markets as {snapshot:MarketSnapshot}[];
  const assets=m8MarketAssetList(trusted);
  const chain=m6ReadOnlyClient();
  const value=mode==="holdings"
   ?await m8ReadConfirmedBalances(chain,account,assets)
   :await m8ReadConfirmedTransfers(chain,account,assets);
  return NextResponse.json({ownerScoped:true,status:"source-backed-read-only",
   allAssetsIndexed:false,allMarketHistoryAvailable:false,
   platformRewardsCredited:false,estimatedFiatWorth:null,
   result:value},{headers});
 }catch(e){return failure(e);}
}
