/** Final10 M9: non-mutating bounded full-row/schema digests for EVERY
 * current social_* table. Matching rows are NOT a human-verified backup.
 */
import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {requiredM31Tables} from "../beta/m31-source-compatibility";
import {validateFullRestorePair} from "../beta/m24-full-restore";
const additions=["social_dm_requests","social_dm_key_versions","social_dm_nonce_registry",
 "social_creator_deployment_previews","social_market_review_intents",
 "social_game_source_identities_m8","social_game_import_candidates_m8"] as const;
export const M9_REQUIRED_TABLES=[...requiredM31Tables,...additions] as const;
export type M9TableDigest={table:string;rows:number;rowSha256:string;schemaSha256:string;complete:true};
export type M9DatabaseDigest={tables:M9TableDigest[];manifestSha256:string;
 rowScanComplete:true;tlsObserved:boolean;tableCount:number;source:"read_only_repeatable_read_pg"};
type DB=Pick<PoolClient,"query">;
const allowed=/^social_[a-z0-9_]{2,62}$/;
export async function digestM9Database(db:DB,options:{
 enforceTLS?:boolean;pageSize?:number;maxRowsPerTable?:number
}={}):Promise<M9DatabaseDigest>{
 const pageSize=options.pageSize??100,maxRows=options.maxRowsPerTable??100000;
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>500||
    !Number.isInteger(maxRows)||maxRows<1||maxRows>1000000)
  throw Error("Invalid bounded full source verification limits.");
 const ssl=await db.query<{ssl:boolean}>("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()");
 const tlsObserved=ssl.rows[0]?.ssl===true;
 if(options.enforceTLS!==false&&!tlsObserved)
  throw Error("Original PostgreSQL source and independently restored copy must use actual TLS.");
 await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
 try{
  const mode=await db.query<{transaction_read_only:string}>("SHOW transaction_read_only");
  if(mode.rows[0]?.transaction_read_only!=="on")throw Error("PostgreSQL read-only snapshot not established.");
  const t=await db.query<{table_name:string}>(
   "SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema()"+
   " AND table_type='BASE TABLE' AND left(table_name,7)='social_' ORDER BY table_name");
  const names=t.rows.map(x=>x.table_name);
  if(!names.length||names.length>120||
     names.some(n=>!allowed.test(n))||new Set(names).size!==names.length||
     M9_REQUIRED_TABLES.some(n=>!names.includes(n)))
    throw Error("Current full social_* schema is absent, incomplete or untrusted.");
  const tables:M9TableDigest[]=[];
  for(const table of names){
   const schema=await db.query<{column_name:string;data_type:string;
    udt_name:string;is_nullable:string;ordinal_position:number;column_default:string|null}>(
    "SELECT column_name,data_type,udt_name,is_nullable,ordinal_position,column_default"+
    " FROM information_schema.columns WHERE table_schema=current_schema()"+
    " AND table_name=$1 ORDER BY ordinal_position",[table]);
   if(!schema.rows.length)throw Error("Original table schema unavailable.");
   const sh=createHash("sha256").update(JSON.stringify(schema.rows)).digest("hex");
   const h=createHash("sha256");
   let offset=0;
   while(true){
    // Every name originates in the DB metadata and is vetted by strict regex.
    const rows=await db.query<{record:string}>(
     'SELECT to_jsonb(t)::text AS record FROM "'+table+
     '" t ORDER BY to_jsonb(t)::text LIMIT $1 OFFSET $2',[pageSize,offset]);
    for(const r of rows.rows){
     if(typeof r.record!=="string")throw Error("Malformed PostgreSQL canonical record.");
     h.update(Buffer.byteLength(r.record).toString()+"\\0"+r.record+"\\n");
    }
    offset+=rows.rows.length;
    if(offset>maxRows)throw Error("Full source exceeds row cap; cannot report complete integrity.");
    if(rows.rows.length<pageSize)break;
   }
   tables.push({table,rows:offset,rowSha256:h.digest("hex"),schemaSha256:sh,complete:true});
  }
  await db.query("COMMIT");
  return {tables,manifestSha256:createHash("sha256").update(JSON.stringify(tables)).digest("hex"),
   rowScanComplete:true,tlsObserved,tableCount:tables.length,
   source:"read_only_repeatable_read_pg"};
 }catch(e){await db.query("ROLLBACK");throw e;}
}
export function compareM9Databases(primary:M9DatabaseDigest,restored:M9DatabaseDigest){
 const names=new Set([...primary.tables.map(x=>x.table),...restored.tables.map(x=>x.table)]);
 const differences=[...names].flatMap(table=>{
  const a=primary.tables.find(x=>x.table===table),
    b=restored.tables.find(x=>x.table===table);
  if(!a||!b)return [{table,reason:"missing_on_one_source"}];
  if(a.schemaSha256!==b.schemaSha256)return [{table,reason:"schema_drift"}];
  if(a.rows!==b.rows)return [{table,reason:"count_drift"}];
  if(a.rowSha256!==b.rowSha256)return [{table,reason:"original_row_digest_drift"}];
  return [];
 });
 if(M9_REQUIRED_TABLES.some(t=>!names.has(t))||
    primary.tables.length!==restored.tables.length||
    !primary.rowScanComplete||!restored.rowScanComplete)
  differences.push({table:"overall",reason:"incomplete_required_schema_or_snapshot"});
 const matched=differences.length===0&&primary.manifestSha256===restored.manifestSha256;
 return {status:matched?"technical_digests_match":"blocked_drift" as "technical_digests_match"|"blocked_drift",
  tableCount:primary.tables.length,differences,
  entireSocialSchemaPresent:matched,allCurrentRowsHashed:matched,
  originalBackupProvenanceVerified:false as const,
  commonSnapshotCutoffVerified:false as const,
  independentHumanRestoreWitness:false as const,
  productionDatabaseModified:false as const,
  releaseDecision:"NO_GO" as const,
  note:"Matching exhaustive bounded JSON digests across PostgreSQL snapshots cannot prove genuine backup provenance, same recovery point, independent TLS host, operator witnessing or a real recovery drill."};
}
export function requireOriginalSeparateTLSRestore(a:string|undefined,b:string|undefined){
 return validateFullRestorePair(a,b);
}
