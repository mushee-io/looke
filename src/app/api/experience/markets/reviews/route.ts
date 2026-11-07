import {type NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {HttpError,requireViewer,verifyRequestOrigin} from "../../../../../lib/social/auth";
import {failure,readJson} from "../../../../../lib/social/http";
import {query,rateLimit} from "../../../../../lib/social/db";
import {m7ReviewEnabled,m7UnsignedSwapData} from "../../../../../lib/experience/m7-market-policy";
import {m7VerifiedQuote} from "../../../../../lib/experience/m7-market-sources";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex"};
const request=z.object({
 marketId:z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/),
 direction:z.enum(["buy","sell"]),
 amount:z.string().min(1).max(48),
 slippageBps:z.number().int().min(1).max(300),
 deadlineSeconds:z.number().int().positive(),
 clientNonce:z.string().regex(/^[0-9a-f]{32}$/)
}).strict();
/** Never exposes another wallet's review, even when id is known. */
export async function GET(req:NextRequest){
 try{
  const owner=(await requireViewer(req)).address;
  const id=req.nextUrl.searchParams.get("id");
  if(id!==null)z.string().uuid().parse(id);
  const result=await query<{
   id:string;market_id:string;direction:string;quote_preference:string;
   amount_in:string;minimum_output:string;quoted_output:string;slippage_bps:number;
   quoted_at:Date;expires_at:Date;status:string
  }>(`SELECT id,market_id,direction,quote_preference,amount_in,minimum_output,
     quoted_output,slippage_bps,quoted_at,expires_at,status
     FROM social_market_review_intents
     WHERE owner=$1 AND ($2::uuid IS NULL OR id=$2::uuid)
     ORDER BY created_at DESC LIMIT 25`,[owner,id]);
  return NextResponse.json({ownerScoped:true,reviewOnly:true,
   tradeBroadcastEnabled:false,allowanceChangesEnabled:false,reviews:result.rows},{headers});
 }catch(error){return failure(error);}
}
export async function POST(req:NextRequest){
 try{
  verifyRequestOrigin(req);
  if(!m7ReviewEnabled())throw new HttpError(503,"M7 owner trade reviews are disabled pending original source and human approval.");
  const owner=(await requireViewer(req)).address;
  const params=request.parse(await readJson(req));
  await rateLimit(owner,"m7_market_review",5,600);
  const {source,quote}=await m7VerifiedQuote(params.marketId,params.direction,params.amount,params.slippageBps);
  const now=Date.now();
  const unsigned=m7UnsignedSwapData(quote,owner,params.deadlineSeconds,now);
  const result=await query<{id:string}>(`INSERT INTO social_market_review_intents
   (owner,client_nonce,market_id,direction,base_token,quote_token,router,pair,
    quote_preference,amount_in,minimum_output,quoted_output,slippage_bps,quote_block,
    quoted_at,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
   RETURNING id`,[
    owner,params.clientNonce,quote.market.id,params.direction,
    quote.market.baseToken.toLowerCase(),quote.market.quoteToken.toLowerCase(),
    quote.market.router.toLowerCase(),quote.market.pair.toLowerCase(),
    source.marketIdentity.quotePreference,quote.amountIn,quote.minOut,quote.amountOut,
    quote.slippageBps,quote.blockNumber,new Date(quote.quotedAt),
    new Date(params.deadlineSeconds*1000)
   ]);
  return NextResponse.json({status:"unsigned-review-only",reviewId:result.rows[0].id,
   verifiedMarketId:source.snapshot.id,source:"verified-original-ultra-testnet",
   quote,unsigned,allowanceRequired:"not verified",gasEstimate:"not verified",
   walletChainVerifiedByServer:false,
   clientWalletMustRecheck:18881,transactionsSent:0,approvalsSent:0,
   note:"No wallet signature or transaction requested. No swap may execute in M7."},{headers});
 }catch(error){return failure(error);}
}
