import {NextResponse} from "next/server";
import {probeUltraEvm} from "../../../../lib/ultra-evm-rpc";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=20;
export async function GET(){
 if(process.env.VERCEL_ENV!=="preview")
  return NextResponse.json({error:"Ultra EVM-only diagnostics are Preview-only."},
   {status:404,headers:{"cache-control":"private, no-store"}});
 const [testnet,mainnet]=await Promise.all([
  probeUltraEvm("testnet"),probeUltraEvm("mainnet"),
 ]);
 return NextResponse.json({milestone:"M1",networkPolicy:"ultra-evm-only",
  testnet,mainnet,activeChainId:18881,mainnetTransactionsEnabled:false,
  walletSigningRequested:false,transactionsSent:0,
  publicBetaOpen:false,releaseDecision:"NO_GO"},
  {headers:{"cache-control":"private, no-store","x-robots-tag":"noindex"}});
}
