import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { socialDb } from "../src/lib/social/db";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Social migrations are not automatic.");
  const db=socialDb();
  for(const filename of ["001_social_foundation.sql","002_social_media_review.sql","003_signed_media_and_notification_state.sql","004_creator_engagement.sql","005_creator_insights_and_moderation.sql","006_evidence_points_and_vesting.sql","007_durable_creator_index_and_review.sql","008_controlled_beta_acceptance.sql","009_independent_release_review.sql","010_operator_release_evidence.sql","011_dual_role_release_witness.sql","012_private_message_foundations.sql"]){
    const sql=await readFile(resolve("db/migrations",filename),"utf8");
    await db.query(sql);
    console.log("Applied Looke social migration "+filename);
  }
  await db.end();
}
main().catch(error => { console.error(error); process.exitCode=1; });
