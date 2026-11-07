import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** M1 Ultra EVM-only launch: legacy chain API is not a live product surface.
 * Original native source code stays in git history, not behind a wallet button.
 */
export function GET(){
 return NextResponse.json({
  status:"retired",network:"Ultra EVM Testnet",chainId:18881,
  releaseDecision:"NO_GO",nativeWalletActionsEnabled:false,
  error:"Legacy collectible API is not supported in Looke's Ultra EVM-only launch.",
 },{status:410,headers:{"cache-control":"private, no-store"}});
}
