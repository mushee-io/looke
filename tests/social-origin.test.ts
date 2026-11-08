import assert from "node:assert/strict";
import {test} from "node:test";
import {NextRequest} from "next/server";
import {socialAllowedOrigins,verifyRequestOrigin} from "../src/lib/social/auth";

test("wallet requests accept only the explicitly configured Looke Testnet aliases",()=>{
  const prevPrimary=process.env.LOOKE_SOCIAL_APP_ORIGIN;
  const prevAdditional=process.env.LOOKE_SOCIAL_ADDITIONAL_ORIGINS;
  const alpha="https://looke-alpha.vercel.app";
  const testnet="https://looke-git-testnet-mushee-ios-projects.vercel.app";
  try {
    process.env.LOOKE_SOCIAL_APP_ORIGIN=alpha;
    process.env.LOOKE_SOCIAL_ADDITIONAL_ORIGINS=testnet;
    assert.deepEqual(socialAllowedOrigins(),[alpha,testnet]);
    for(const origin of [alpha,testnet]){
      const req=new NextRequest(origin+"/api/social/auth",{
        method:"POST",headers:{origin,"content-type":"application/json"},
        body:JSON.stringify({action:"challenge"}),
      });
      assert.equal(verifyRequestOrigin(req),origin);
    }
    const untrusted=new NextRequest(alpha+"/api/social/auth",{
      method:"POST",headers:{origin:"https://impostor.example","content-type":"application/json"},
      body:"{}",
    });
    assert.throws(()=>verifyRequestOrigin(untrusted),/Request origin does not match Looke/);
    const absent=new NextRequest(alpha+"/api/social/auth",{
      method:"POST",headers:{"content-type":"application/json"},body:"{}",
    });
    assert.throws(()=>verifyRequestOrigin(absent),/Request origin does not match Looke/);
    const badType=new NextRequest(alpha+"/api/social/auth",{
      method:"POST",headers:{origin:alpha,"content-type":"text/plain"},body:"{}",
    });
    assert.throws(()=>verifyRequestOrigin(badType),/JSON content type required/);
  }finally{
    if(prevPrimary===undefined)delete process.env.LOOKE_SOCIAL_APP_ORIGIN;
    else process.env.LOOKE_SOCIAL_APP_ORIGIN=prevPrimary;
    if(prevAdditional===undefined)delete process.env.LOOKE_SOCIAL_ADDITIONAL_ORIGINS;
    else process.env.LOOKE_SOCIAL_ADDITIONAL_ORIGINS=prevAdditional;
  }
});

test("malformed additional social origin does not silently become trusted",()=>{
  const prevPrimary=process.env.LOOKE_SOCIAL_APP_ORIGIN;
  const prevAdditional=process.env.LOOKE_SOCIAL_ADDITIONAL_ORIGINS;
  try{
    process.env.LOOKE_SOCIAL_APP_ORIGIN="https://looke-alpha.vercel.app";
    process.env.LOOKE_SOCIAL_ADDITIONAL_ORIGINS="https://evil.example/path";
    assert.throws(()=>socialAllowedOrigins(),/Invalid social application origin/);
  }finally{
    if(prevPrimary===undefined)delete process.env.LOOKE_SOCIAL_APP_ORIGIN;
    else process.env.LOOKE_SOCIAL_APP_ORIGIN=prevPrimary;
    if(prevAdditional===undefined)delete process.env.LOOKE_SOCIAL_ADDITIONAL_ORIGINS;
    else process.env.LOOKE_SOCIAL_ADDITIONAL_ORIGINS=prevAdditional;
  }
});
