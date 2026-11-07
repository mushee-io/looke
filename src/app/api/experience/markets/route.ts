import {type NextRequest,NextResponse} from "next/server";
import {m7VerifiedMarket,m7VerifiedMarketFeed,m7VerifiedMarketActivity}
 from "../../../../lib/experience/m7-market-sources";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"no-store","x-robots-tag":"noindex"};
/** Only on-chain proven Ultra EVM Testnet markets. Unknown means BLOCKED. */
export async function GET(req:NextRequest){
 try{
  const id=req.nextUrl.searchParams.get("id");
  const mode=req.nextUrl.searchParams.get("mode")||"markets";
  if(!["markets","activity","market"].includes(mode))
   return NextResponse.json({error:"Unsupported market lookup."},{status:400,headers});
  if(mode==="markets")return NextResponse.json(await m7VerifiedMarketFeed(),{headers});
  if(!id||!/^[a-z0-9][a-z0-9-]{0,31}$/.test(id))
   return NextResponse.json({error:"A verified market ID is required."},{status:400,headers});
  if(mode==="activity"){
   const raw=req.nextUrl.searchParams.get("interval")||"900";
   if(!["300","900","3600"].includes(raw))
    return NextResponse.json({error:"Unsupported candle interval."},{status:400,headers});
   const activity=await m7VerifiedMarketActivity(id,Number(raw) as 300|900|3600);
   return NextResponse.json({...activity,source:"observed-bounded-real-swap-logs",
    allHistoryComplete:false,missingCandlesFilled:false,tradingEnabled:false},{headers});
  }
  const market=await m7VerifiedMarket(id);
  return NextResponse.json({...market,tradingEnabled:false},{headers});
 }catch(error){
  return NextResponse.json({status:"blocked",
    error:"Actual signed creator issuance, verified market/liquidity and supported Ultra EVM Testnet sources unavailable.",
    detail:error instanceof Error?error.message:"Original source unavailable.",
    marketsInvented:0,tradesSubmitted:0},{status:503,headers});
 }
}
