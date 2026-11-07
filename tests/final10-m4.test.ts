import assert from "node:assert/strict";
import {test} from "node:test";
import {m4MediaWritesEnabled,m4ModerationWritesEnabled,m4AllowsModerationAction}
 from "../src/lib/social/m4-creator";
import {uploadDraft,createUploadAuthorization,verifyProviderAsset,verifyM4ProviderReceipt,uploadEnabled}
 from "../src/lib/social/upload-provider";
import {validateM4TokenDraft} from "../src/lib/experience/m4-metadata";
const config={cloudName:"looke-ci",apiKey:"12345678901234",apiSecret:"ci-not-real-cloudinary-secret-placeholder-1234"};
const wallet="0x"+"a".repeat(40);
const file={kind:"image" as const,mime:"image/png" as const,bytes:1024};
function withEnv(vars:Record<string,string|undefined>,fn:()=>void){
 const old=Object.fromEntries(Object.keys(vars).map(k=>[k,process.env[k]]));
 try{for(const [k,v] of Object.entries(vars)){if(v===undefined)delete process.env[k];else process.env[k]=v;}fn();}
 finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
const base={
 NODE_ENV:"test",VERCEL_ENV:"preview",LOOKE_PUBLIC_BETA_ENABLED:"false",
 LOOKE_SOCIAL_WRITES_ENABLED:"false",LOOKE_M2_IDENTITY_WRITES_ENABLED:"true",
 LOOKE_M3_SOCIAL_WRITES_ENABLED:"true",LOOKE_M4_CREATOR_MEDIA_WRITES_ENABLED:"true",
 LOOKE_MEDIA_UPLOADS_ENABLED:"true",LOOKE_M4_MEDIA_MODERATION_WRITES_ENABLED:"true"
};
test("M4 defaults closed and never turns on without M2/M3, correct preview and media consent",()=>{
 for(const [key,value] of [
  ["LOOKE_M4_CREATOR_MEDIA_WRITES_ENABLED","false"],
  ["LOOKE_M2_IDENTITY_WRITES_ENABLED","false"],
  ["LOOKE_M3_SOCIAL_WRITES_ENABLED","false"],
  ["LOOKE_MEDIA_UPLOADS_ENABLED","false"],
  ["LOOKE_PUBLIC_BETA_ENABLED","true"],
  ["VERCEL_ENV","production"],
 ]){
  withEnv({...base,[key]:value,NODE_ENV:"production"},()=>{
   assert.equal(m4MediaWritesEnabled(),false,key);
   assert.equal(uploadEnabled(),false,key);
  });
 }
 withEnv({...base,LOOKE_M4_MEDIA_MODERATION_WRITES_ENABLED:"false"},()=>{
  assert.equal(m4MediaWritesEnabled(),true);
  assert.equal(m4ModerationWritesEnabled(),false);
  assert.equal(m4AllowsModerationAction("approve_media"),false);
 });
 withEnv(base,()=>{
  assert.equal(m4MediaWritesEnabled(),true);
  assert.equal(uploadEnabled(),true);
  for(const op of ["approve_media","reject_media"])assert.equal(m4AllowsModerationAction(op),true);
  for(const op of ["suspend_profile","hide_post","restore_post","mint","swap","send","claim"])
   assert.equal(m4AllowsModerationAction(op),false);
 });
});
test("M4 signed owner upload and provider receipt check reject tampering and stale records",()=>{
 const issued=new Date("2026-11-07T14:00:00Z");
 const expires=new Date(issued.getTime()+900_000);
 const authorization=createUploadAuthorization(config,wallet,uploadDraft.parse(file),Math.floor(issued.getTime()/1000));
 assert.equal(authorization.parameters.folder,"looke/social/"+wallet);
 assert.equal(authorization.parameters.overwrite,"false");
 assert.ok(!JSON.stringify(authorization).includes(config.apiSecret));
 const asset={
  public_id:authorization.publicId,asset_id:"ciresourceassetid123456789",
  resource_type:"image",format:"png",type:"upload",bytes:1024,
  created_at:new Date(issued.getTime()+45_000).toISOString(),
  version:1794060000,
  secure_url:"https://res.cloudinary.com/looke-ci/image/upload/v123/"+authorization.publicId+".png"
 };
 assert.deepEqual(verifyProviderAsset({config,asset,publicId:authorization.publicId,draft:file,expectedOwner:wallet}),
   {url:asset.secure_url,kind:"image"});
 assert.doesNotThrow(()=>verifyM4ProviderReceipt(asset,issued,expires));
 for(const tampered of [
  {...asset,created_at:"2026-01-01T00:00:00Z"},
  {...asset,created_at:"2026-11-10T00:00:00Z"},
  {...asset,created_at:"not-a-date"},
  {...asset,version:0},
 ])assert.throws(()=>verifyM4ProviderReceipt(tampered,issued,expires));
 for(const tampered of [
  {...asset,bytes:1023},
  {...asset,secure_url:"https://evil.example/image/upload/v123/"+authorization.publicId+".png"},
  {...asset,secure_url:"https://res.cloudinary.com/looke-ci/image/upload/v123/another/"+authorization.publicId+".png"},
  {...asset,secure_url:"https://res.cloudinary.com/looke-ci/image/upload/v123/"+authorization.publicId+".png?raw=1"},
  {...asset,public_id:"looke/social/"+("0x"+"b".repeat(40))+"/fake"}
 ])assert.throws(()=>verifyProviderAsset({config,asset:tampered,publicId:authorization.publicId,draft:file,expectedOwner:wallet}));
 assert.throws(()=>verifyProviderAsset({config,asset,publicId:authorization.publicId,draft:file,
  expectedOwner:"0x"+"b".repeat(40)}));
});
test("M4 creator token drafts are validated but never deployable, fetched, minted or paired",()=>{
 const fields={name:"  Moonbeds  ",symbol:"moon",pair:"ULTRA",description:"An Ultra community draft",
  imageURI:"ipfs://bafybeigdyrzt5sfp7udm7hu76uhmizcmus36cybk6z52v6t37viffyzqku",
  metadataURI:"https://cdn.example.com/metadata/1.json"};
 const r=validateM4TokenDraft(fields);
 assert.equal(r.name,"Moonbeds");assert.equal(r.symbol,"MOON");
 assert.equal(r.pair,"ULTRA");assert.equal(r.chainId,18881);
 assert.equal(r.reviewOnly,true);assert.equal(r.deployable,false);
 assert.equal(r.metadataSourceVerified,false);
 for(const changed of [
  {...fields,pair:"ETH"}, {...fields,metadataURI:"javascript:alert(1)"},
  {...fields,metadataURI:"http://localhost/metadata.json"},
  {...fields,metadataURI:"https://user:pass@cdn.example.com/path"},
  {...fields,metadataURI:"https://127.0.0.1/file.json"},
  {...fields,imageURI:"file:///etc/passwd"},
  {...fields,description:"x".repeat(600)}
 ])assert.throws(()=>validateM4TokenDraft(changed));
});
