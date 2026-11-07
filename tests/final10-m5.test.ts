import assert from "node:assert/strict";
import {test} from "node:test";
import {inspectM5Envelope,assertM5KeyRotation,m5RequestsEnabled,m5FutureTransportAllowed,
 M5_TRANSPORT_APPROVED,M5_KEY_REGISTRATION_APPROVED,M5_RECOVERY_AUDITED}
 from "../src/lib/experience/m5-message-safety";
import {validateEnvelope,DM_SECURITY_GATES} from "../src/lib/experience/dm-envelope";
import {keyRegistrationStatement,verifyKeyRegistrationSignature} from "../src/lib/experience/key-registration";
import {privateKeyToAccount} from "viem/accounts";
const a="0x"+"1".repeat(40),b="0x"+"2".repeat(40);
function withEnv(vars:Record<string,string|undefined>,fn:()=>void){
 const before=Object.fromEntries(Object.keys(vars).map(k=>[k,process.env[k]]));
 try{for(const [k,v]of Object.entries(vars)){if(v===undefined)delete process.env[k];else process.env[k]=v;}fn();}
 finally{for(const [k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
const flags={LOOKE_PUBLIC_BETA_ENABLED:"false",LOOKE_SOCIAL_WRITES_ENABLED:"false",
 LOOKE_M2_IDENTITY_WRITES_ENABLED:"true",LOOKE_M3_SOCIAL_WRITES_ENABLED:"true",
 LOOKE_M5_MESSAGE_REQUEST_WRITES_ENABLED:"true",VERCEL_ENV:"preview"};
test("M5 request-flag fail-closed policy does not activate live messaging",()=>{
 withEnv(flags,()=>{
  assert.equal(m5RequestsEnabled(),true);
  assert.equal(m5FutureTransportAllowed(),false);
  assert.equal(M5_TRANSPORT_APPROVED,false);
  assert.equal(M5_KEY_REGISTRATION_APPROVED,false);
  assert.equal(M5_RECOVERY_AUDITED,false);
  assert.equal(DM_SECURITY_GATES.liveMessagingEnabled,false);
  assert.equal(DM_SECURITY_GATES.clientKeyRegistration,false);
 });
 for(const [name,value]of [
  ["LOOKE_M5_MESSAGE_REQUEST_WRITES_ENABLED","false"],
  ["LOOKE_M2_IDENTITY_WRITES_ENABLED","false"],
  ["LOOKE_M3_SOCIAL_WRITES_ENABLED","false"],
  ["LOOKE_PUBLIC_BETA_ENABLED","true"],
  ["VERCEL_ENV","production"]
 ]){
  withEnv({...flags,NODE_ENV:"production",[name]:value},()=>{
   assert.equal(m5RequestsEnabled(),false,name);
   assert.equal(m5FutureTransportAllowed(),false);
  });
 }
});
test("M5 encrypted envelope offline validation rejects plaintext, noncanonical nonces and self-send",()=>{
 const nonce=Buffer.alloc(24,4).toString("base64");
 const ciphertext=Buffer.alloc(72,7).toString("base64");
 const envelope={version:1,algorithm:"x25519-xsalsa20-poly1305" as const,
  senderKeyVersion:1,recipientKeyVersion:2,nonce,ciphertext};
 const checked=inspectM5Envelope(envelope,a,b);
 assert.equal(checked.sender,a);assert.equal(checked.recipient,b);
 assert.match(checked.nonceDigest,/^[0-9a-f]{64}$/);
 assert.equal(checked.nonceDigest,inspectM5Envelope({...envelope},a,b).nonceDigest);
 assert.notEqual(checked.nonceDigest,inspectM5Envelope({...envelope,nonce:Buffer.alloc(24,5).toString("base64")},a,b).nonceDigest);
 assert.throws(()=>inspectM5Envelope(envelope,a,a),/Self-messaging/);
 for(const bad of [
  {...envelope,plaintext:"a private message"},
  {...envelope,algorithm:"none"},
  {...envelope,nonce:"not_base64"},
  {...envelope,ciphertext:Buffer.alloc(2).toString("base64")},
  {...envelope,senderKeyVersion:0},
  {...envelope,recipientKeyVersion:0},
  {...envelope,nonce:nonce.slice(0,-1)+"A"},
  {...envelope,ciphertext:ciphertext.slice(0,-2)+"x="},
 ]){
  assert.throws(()=>inspectM5Envelope(bad,a,b));
 }
 assert.equal(validateEnvelope(envelope).ciphertext,ciphertext);
});
test("M5 key rotation and origin-signed offline registration reject rollback",async()=>{
 const publicKey=Buffer.alloc(32,3).toString("base64");
 assert.deepEqual(assertM5KeyRotation(a,null,1,publicKey),
  {keyVersion:1,identityVerified:false,recoveryReviewed:false});
 assert.equal(assertM5KeyRotation(a,1,2,publicKey).keyVersion,2);
 for(const [prev,next,pub]of [[2,2,publicKey],[2,4,publicKey],[4,1,publicKey],[null,0,publicKey],[null,1,"AA"] ] as const)
  assert.throws(()=>assertM5KeyRotation(a,prev,next,pub));
 const key=("0x"+"1".repeat(64)) as `0x${string}`;
 const signer=privateKeyToAccount(key);
 const issued="2026-11-07T15:55:00Z",expires="2026-11-07T16:05:00Z";
 const bind={address:signer.address,origin:"https://looke-protected-preview.example",
  publicKey,version:1,nonce:"a".repeat(32),issuedAt:issued,expiresAt:expires};
 const msg=keyRegistrationStatement(bind);
 const sig=await signer.signMessage({message:msg});
 assert.equal(await verifyKeyRegistrationSignature(bind,sig,Date.parse(issued)+60_000,bind.origin),true);
 assert.equal(await verifyKeyRegistrationSignature(bind,sig,Date.parse(issued)+60_000,"https://evil.example"),false);
 assert.equal(await verifyKeyRegistrationSignature(bind,sig,Date.parse(expires),bind.origin),false);
 // Signed key assertions are offline-only: no key registration route exists.
 assert.equal(M5_KEY_REGISTRATION_APPROVED,false);
});
