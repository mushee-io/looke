/** Explicit, read-only original TLS restore *comparison*; not backup restore.
 * Command cannot run without --live + a distinct TLS-verified restored URL.
 * Never runs automatically on Vercel, never modifies either DB.
 */
import {Pool} from "pg";
import {digestM9Database,compareM9Databases,requireOriginalSeparateTLSRestore}
 from "../src/lib/experience/m9-restore";
async function main(){
 if(!process.argv.includes("--live"))throw Error("Explicit --live required for actual current-source restore comparison.");
 if(process.env.VERCEL_ENV==="production")throw Error("Production restoration commands forbidden.");
 const primary=process.env.DATABASE_URL;
 const restore=process.env.LOOKE_M9_RESTORED_DATABASE_URL;
 requireOriginalSeparateTLSRestore(primary,restore);
 const make=(url:string)=>new Pool({connectionString:url,max:1,
  connectionTimeoutMillis:8000,statement_timeout:60000});
 const a=make(primary!),b=make(restore!);
 try{
  const inspect=async(p:Pool)=>{
   const conn=await p.connect();
   try{return await digestM9Database(conn,{enforceTLS:true,maxRowsPerTable:100000});}
   finally{conn.release();}
  };
  const [source,copied]=await Promise.all([inspect(a),inspect(b)]);
  const result=compareM9Databases(source,copied);
  console.log(JSON.stringify({
   milestone:"FINAL10_M9",mode:"independent-original-read-only-pg-digest",
   sourceTables:source.tableCount,restoredTables:copied.tableCount,
   sourceDigestSha256:source.manifestSha256,restoredDigestSha256:copied.manifestSha256,
   tlsOnBothEndpoints:source.tlsObserved&&copied.tlsObserved,
   result,
   actualBackupRestoredByCommand:false,independentHumanRestoreWitness:false,
   sourceMigrationPerformed:false,
   releaseDecision:"NO_GO",productionAliasChanged:false
  },null,2));
  if(result.status!=="technical_digests_match")process.exitCode=2;
 }finally{await Promise.allSettled([a.end(),b.end()]);}
}
main().catch(e=>{
 console.error("M9 independent original TLS source audit BLOCKED:",
  e instanceof Error?e.message:"unknown");
 process.exitCode=2;
});
