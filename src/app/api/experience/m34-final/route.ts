import { NextRequest, NextResponse } from "next/server";
import { GET as m33GET } from "../m33-live/route";
import { GET as mediaGET } from "../media/route";
import { GET as messagingGET } from "../messaging/readiness/route";
import { assessM34Acceptance } from "../../../../lib/beta/m34-final-acceptance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;
const headers = {"cache-control":"private, no-store","x-robots-tag":"noindex"};

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview")
    return NextResponse.json({error:"Preview-only acceptance diagnostics."},{status:404,headers});
  const params = request.nextUrl.searchParams;
  if (params.getAll("mode").length > 1 || [...params.keys()].some(k => k !== "mode"))
    return NextResponse.json({error:"Invalid acceptance query."},{status:400,headers});
  const mode = params.get("mode") || "config";
  if (mode !== "config" && mode !== "live")
    return NextResponse.json({error:"Select config or live."},{status:400,headers});

  const [media,messaging] = await Promise.all([
    Promise.resolve(mediaGET(new NextRequest(new URL('/api/experience/media',request.url)))).then(r=>r.json() as Promise<unknown>).catch(()=>null),
    Promise.resolve(messagingGET()).then(r=>r.json() as Promise<unknown>).catch(()=>null),
  ]);
  let source:unknown = undefined;
  let sourceStatus = 0;
  if(mode === "live") {
    try {
      const response = await m33GET(new NextRequest(new URL("/api/experience/m33-live?mode=live", request.url)));
      sourceStatus = response.status;
      if(response.ok) source = await response.json();
    } catch { sourceStatus = 503; }
  }
  const report = assessM34Acceptance({
    flags:process.env,live:source,media,messaging,
    deploymentSha:process.env.VERCEL_GIT_COMMIT_SHA
  });
  return NextResponse.json({...report,requestedMode:mode,
    underlyingM33ReadAttempted:mode==="live",
    underlyingM33HTTPStatus:sourceStatus,
    originalHumanDocumentsVerified:false},{headers});
}
