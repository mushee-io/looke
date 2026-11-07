import assert from "node:assert/strict";
import {test} from "node:test";
import {m3SocialActionAllowed,m3SocialWritesEnabled,canWriteSocialAction,requireM3TextOnlyPost,M3TextOnlyError}
  from "../src/lib/social/m3-social-access";
function withEnv(values:Record<string,string|undefined>,fn:()=>void){
  const old=new Map(Object.keys(values).map(k=>[k,process.env[k]]));
  try{for(const [k,v]of Object.entries(values))if(v===undefined)delete process.env[k];else process.env[k]=v;fn();}
  finally{for(const [k,v]of old)if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
const base={LOOKE_SOCIAL_WRITES_ENABLED:"false",LOOKE_M2_IDENTITY_WRITES_ENABLED:"true",
  LOOKE_M3_SOCIAL_WRITES_ENABLED:"true"};
test("M3 fail-closed default; M2 identity switch is not a social release switch",()=>{
  withEnv({...base,LOOKE_M3_SOCIAL_WRITES_ENABLED:undefined},()=>{
    assert.equal(m3SocialWritesEnabled(),false);
    assert.equal(canWriteSocialAction("post"),false);
  });
  withEnv({...base,LOOKE_M2_IDENTITY_WRITES_ENABLED:"false"},()=>{
    assert.equal(m3SocialWritesEnabled(),false);
  });
});
test("M3 only enables bounded social operations, never moderation, media or financial routes",()=>{
  withEnv(base,()=>{
    for(const action of ["post","comment","follow","unfollow","block","unblock","report"])
      assert.equal(canWriteSocialAction(action),true,action);
    for(const action of ["moderate","message","conversation","mint","trade","swap",
      "token","points","upload","claim","launch","transfer",null,{},[]]){
      assert.equal(m3SocialActionAllowed(action),false,String(action));
      assert.equal(canWriteSocialAction(action),false,String(action));
    }
  });
});
test("M3 text-only policy denies uploaded media and asset references without master writes",()=>{
  withEnv(base,()=>{
    assert.doesNotThrow(()=>requireM3TextOnlyPost({asset:null,media:null,mediaUploadId:null}));
    for(const fields of [
      {asset:{assetType:"token"},media:null,mediaUploadId:null},
      {asset:null,media:{url:"https://cdn.example/image.png"},mediaUploadId:null},
      {asset:null,media:null,mediaUploadId:"123"},
    ])assert.throws(()=>requireM3TextOnlyPost(fields),(err:unknown)=>err instanceof M3TextOnlyError);
  });
});
