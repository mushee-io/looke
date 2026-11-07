import {type NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {requireViewer,verifyRequestOrigin,HttpError} from "../../../../lib/social/auth";
import {readJson,failure} from "../../../../lib/social/http";
import {reviewUnsignedM6Creator} from "../../../../lib/experience/m6-creator";
import {verifyM6OnChainCreation} from "../../../../lib/experience/m6-proof";
import {createUltraPublicClient} from "../../../../lib/verification";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const proof=z.object({
 transactionHash:z.string().regex(/^0x[0-9a-fA-F]{64}$/),
 nonce:z.string().regex(/^0x[0-9a-fA-F]{64}$/),
 draft:z.object({
  name:z.string(),symbol:z.string(),description:z.string().default(""),
  imageURI:z.string().default(""),metadataURI:z.string(),
  supply:z.string(),pair:z.enum(["ULTRA","LOOKE"])
 }).strict()
}).strict();
const headers={"cache-control":"private, no-store"};
export async function POST(req:NextRequest){
 try{
  verifyRequestOrigin(req);
  const actor=(await requireViewer(req)).address;
  const input=proof.parse(await readJson(req));
  // A deployment cannot be attested using an arbitrary user-supplied factory.
  // Each original factory deploy receipt, artifact hash and both pair tokens
  // must be independently provisioned by an operator. Missing => NO-GO.
  const cfg={
   factoryAddress:process.env.LOOKE_M6_FACTORY_ADDRESS||"",
   factoryDeploymentHash:process.env.LOOKE_M6_FACTORY_DEPLOY_TX||"",
   factoryRuntimeHash:process.env.LOOKE_M6_FACTORY_RUNTIME_HASH||"",
   ultraPairAsset:process.env.LOOKE_M6_ULTRA_PAIR_ADDRESS||"",
   lookePairAsset:process.env.LOOKE_M6_LOOKE_PAIR_ADDRESS||""
  };
  if(Object.values(cfg).some(v=>!v))
   throw new HttpError(503,"Current original factory/pair bytecode evidence is missing. No token deployment is claimed.");
  const plan=reviewUnsignedM6Creator(input.draft,input.nonce);
  const receipt=await verifyM6OnChainCreation(createUltraPublicClient(),input.transactionHash,actor,plan,cfg);
  return NextResponse.json({verified:true,proof:receipt},{headers});
 }catch(error){return failure(error);}
}
