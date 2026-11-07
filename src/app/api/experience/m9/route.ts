/** Final10 M9: protected read-only source acceptance. No writes or GO path. */
import {type NextRequest,NextResponse} from "next/server";
import {requireViewer} from "../../../../lib/social/auth";
import {socialDb} from "../../../../lib/social/db";
import {assessM9Evidence,type M9Observation} from "../../../../lib/experience/m9-gates";
import {inspectM9OwnerSource} from "../../../../lib/experience/m9-source-inspection";
import {m5FutureTransportAllowed} from "../../../../lib/experience/m5-message-safety";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=45;
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex"};
export async function GET(req:NextRequest){
 if(process.env.VERCEL_ENV==="production")
  return NextResponse.json({error:"M9 source acceptance unavailable on production."},{status:404,headers});
 if([...req.nextUrl.searchParams.keys()].some(k=>k!=="mode")||
    req.nextUrl.searchParams.getAll("mode").length>1)
  return NextResponse.json({error:"Unsupported acceptance query."},{status:400,headers});
 const mode=req.nextUrl.searchParams.get("mode")||"config";
 if(!["config","live"].includes(mode))
  return NextResponse.json({error:"Select config or live."},{status:400,headers});
 const common={
  env:process.env,previewSha:process.env.VERCEL_GIT_COMMIT_SHA,
  previewOrigin:process.env.LOOKE_M9_PREVIEW_ORIGIN
 };
 if(mode==="config")return NextResponse.json({...assessM9Evidence(common),
  mode:"config-only",liveSourceQueries:0,sessionsRead:0,
  independentHumanEvidenceFilesOpened:0,operatorReleaseAuthorized:false},{headers});
 if(process.env.VERCEL_ENV!=="preview"||
    process.env.LOOKE_M9_OPERATOR_READS_ENABLED!=="true")
  return NextResponse.json({error:"Real original-source acceptance is disabled or not protected Preview."},{status:503,headers});
 let wallet:string;
 try{wallet=(await requireViewer(req)).address;}
 catch{return NextResponse.json({error:"Original signed-in wallet session required for M9 read-only acceptance."},{status:401,headers});}
 const checks:Partial<Record<"m3_owner_social_records"|"m5_message_send_disabled"|
  "current_tls_postgresql_schema",M9Observation>>={};
 const mark=(id:keyof typeof checks,source:string,reference:string,note:string)=>{
  checks[id]={id,status:"source_verified_read_only",source,reference,note};
 };
 let backend:{status:string;tableCount?:number;counts?:unknown;tlsVerified?:boolean}={
  status:"unavailable"};
 try{
  const conn=await socialDb().connect();
  try{
   const audit=await inspectM9OwnerSource(conn,wallet,{enforceTLS:true});
   backend={status:audit.status,tableCount:audit.actualSocialTables,counts:audit.counts,tlsVerified:audit.tlsVerified};
   mark("current_tls_postgresql_schema","actual TLS PostgreSQL repeatable-read",
    "verified current social schema with "+audit.actualSocialTables+" tables",
    "Original read-only current schema observed; not a restored backup or operator GO.");
   if(audit.counts.posts>0)mark("m3_owner_social_records",
    "real signed-wallet owner-scoped PostgreSQL rows",
    "owner posts="+audit.counts.posts,
    "Unaltered original visible posts observed; independent social safety review still missing.");
  }finally{conn.release();}
 }catch{backend={status:"blocked_original_tls_source"};}
 if(m5FutureTransportAllowed()===false)mark("m5_message_send_disabled",
  "original M5 source immutable transport guard",
  "M5 transport approved=false",
  "No real messages sent or unreviewed E2EE enabled by M9.");
 const report=assessM9Evidence({...common,observations:checks});
 return NextResponse.json({...report,mode:"live-read-only",
  authenticatedOwnerOnly:true,backend,financialActionsAttempted:0,
  originalAuditorFindingFilesAvailable:false,realIndependentWitnessesVerified:0,
  realRestoreExecutedByEndpoint:false},{headers});
}
