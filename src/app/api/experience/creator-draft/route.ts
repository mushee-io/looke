import {type NextRequest,NextResponse} from "next/server";
import {requireViewer,verifyRequestOrigin} from "../../../../lib/social/auth";
import {failure,readJson} from "../../../../lib/social/http";
import {validateM4TokenDraft} from "../../../../lib/experience/m4-metadata";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Read-only draft review. No database writes, signature request, approvals,
 * URI fetch, storage pinning, token issuance or liquidity action.
 */
export async function POST(req:NextRequest){
 try{
  verifyRequestOrigin(req);
  const actor=(await requireViewer(req)).address;
  const reviewed=validateM4TokenDraft(await readJson(req));
  return NextResponse.json({reviewed,owner:actor,
    note:"Local draft review only. URL contents, liquidity, metadata hosting and token deployment are not verified."},
    {headers:{"cache-control":"private, no-store"}});
 }catch(error){return failure(error);}
}
