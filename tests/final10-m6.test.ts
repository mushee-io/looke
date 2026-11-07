import assert from "node:assert/strict";
import {test} from "node:test";
import {decodeFunctionData} from "viem";
import {m6CreatorFactoryAbi} from "../src/lib/experience/m6-factory-abi";
import {
 reviewUnsignedM6Creator,reviewM6WalletAuthorization,
 M6_WALLET_EXECUTION_ENABLED,M6_OPERATOR_FACTORY_APPROVED
} from "../src/lib/experience/m6-creator";
import {m6DraftWritesEnabled} from "../src/lib/experience/m6-creator-gates";
import {validateM6ExternalConfig} from "../src/lib/experience/m6-proof";

const sender="0x1111111111111111111111111111111111111111";
const nonce="0x"+"1".repeat(64);
const input={
 name:"Ultra Cat",symbol:"ucat",description:"Creator test",
 imageURI:"ipfs://bafybeigdyrzt5sfp7udm7hu76uhmizcmus36cybk6z52v6t37viffyzqku",
 metadataURI:"https://cdn.example.com/creator/metadata.json",
 supply:"1000000.25",pair:"ULTRA"
};
function withEnv(values:Record<string,string|undefined>,fn:()=>void){
 const before=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
 try{for(const [k,v] of Object.entries(values)){if(v===undefined)delete process.env[k];else process.env[k]=v;}fn();}
 finally{for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
test("M6 only ULTRA/LOOKE review preferences, exact 18 decimal supply and zero disclosed app fee",()=>{
 const p=reviewUnsignedM6Creator(input,nonce);
 assert.equal(p.chainId,18881);assert.equal(p.name,"Ultra Cat");
 assert.equal(p.symbol,"UCAT");assert.equal(p.pair,"ULTRA");
 assert.equal(p.supply,"1000000250000000000000000");
 assert.equal(p.applicationFeeWei,"0");assert.equal(p.networkGasFeeWei,null);
 assert.equal(p.reviewedPairContract,null);assert.equal(p.verifiedFactoryAddress,null);
 assert.equal(p.pairLiquidityCreated,false);assert.equal(p.deployable,false);
 assert.equal(p.transactionBroadcast,false);assert.equal(p.walletTransactionPrepared,false);
 assert.equal(M6_WALLET_EXECUTION_ENABLED,false);assert.equal(M6_OPERATOR_FACTORY_APPROVED,false);
 const decoded=decodeFunctionData({abi:m6CreatorFactoryAbi,data:p.calldata});
 assert.equal(decoded.functionName,"createCreatorCoin");
 assert.deepEqual(decoded.args,[p.name,p.symbol,p.metadataURI,BigInt(p.supply),0,nonce]);
 const q=reviewUnsignedM6Creator({...input,pair:"LOOKE"},"0x"+"2".repeat(64));
 assert.equal(decodeFunctionData({abi:m6CreatorFactoryAbi,data:q.calldata}).args[4],1);
 assert.notEqual(q.calldataHash,p.calldataHash);
});
test("M6 denies unsupported pairs, harmful metadata, malformed amounts and nonce replay signatures",()=>{
 const bad=[
  {...input,pair:"ETH"},{...input,pair:"UOS/USDC"},
  {...input,metadataURI:"http://localhost/metadata.json"},
  {...input,metadataURI:"https://127.0.0.1/a.json"},
  {...input,metadataURI:"javascript:alert(1)"},
  {...input,symbol:"X"},
  {...input,supply:"0"},{...input,supply:"-1"},
  {...input,supply:"1e10"},{...input,supply:"1000000001"},
  {...input,supply:"0.0000000000000000001"},
  {...input,supply:"1",creator:sender}
 ];
 for(const x of bad)assert.throws(()=>reviewUnsignedM6Creator(x,nonce),JSON.stringify(x));
 for(const n of ["0x"+"0".repeat(64),"0x12","","0x"+"a".repeat(65)])
  assert.throws(()=>reviewUnsignedM6Creator(input,n));
 const p=reviewUnsignedM6Creator(input,nonce);
 assert.equal(reviewUnsignedM6Creator(input,nonce).calldataHash,p.calldataHash);
 assert.notEqual(reviewUnsignedM6Creator(input,"0x"+"3".repeat(64)).calldataHash,p.calldataHash);
});
test("M6 draft persistence flag defaults closed and cannot allow public beta or production",()=>{
 const flags={LOOKE_M2_IDENTITY_WRITES_ENABLED:"true",LOOKE_M3_SOCIAL_WRITES_ENABLED:"true",
  LOOKE_SOCIAL_WRITES_ENABLED:"false",LOOKE_M6_CREATOR_DRAFT_WRITES_ENABLED:"true",
  LOOKE_PUBLIC_BETA_ENABLED:"false",NODE_ENV:"production",VERCEL_ENV:"preview"};
 withEnv(flags,()=>assert.equal(m6DraftWritesEnabled(),true));
 for(const [key,value]of [
  ["LOOKE_M2_IDENTITY_WRITES_ENABLED","false"],["LOOKE_M3_SOCIAL_WRITES_ENABLED","false"],
  ["LOOKE_M6_CREATOR_DRAFT_WRITES_ENABLED","false"],
  ["LOOKE_PUBLIC_BETA_ENABLED","true"],["VERCEL_ENV","production"]
 ]){
  withEnv({...flags,[key]:value},()=>assert.equal(m6DraftWritesEnabled(),false,key));
 }
});
test("M6 wallet preflight reads only chain/account; blocks wrong chain and switched signer",async()=>{
 const plan=reviewUnsignedM6Creator(input,nonce);
 const actions:string[]=[];
 const provider={request:async({method}:{method:string})=>{
  actions.push(method);
  if(method==="eth_chainId")return "0x49c1";
  if(method==="eth_accounts")return [sender];
  throw new Error("Unexpected wallet action "+method);
 }};
 const result=await reviewM6WalletAuthorization(provider,sender,plan);
 assert.equal(result.owner,sender);
 assert.equal(result.walletAuthorizationRequested,false);
 assert.deepEqual(actions,["eth_chainId","eth_accounts","eth_chainId"]);
 const wrong={request:async({method}:{method:string})=>
  method==="eth_chainId"?"0x4e17":[sender]};
 await assert.rejects(()=>reviewM6WalletAuthorization(wrong,sender,plan),/Ultra EVM Testnet/);
 const switched={request:async({method}:{method:string})=>
  method==="eth_chainId"?"0x49c1":["0x2222222222222222222222222222222222222222"]};
 await assert.rejects(()=>reviewM6WalletAuthorization(switched,sender,plan),/Selected wallet account changed/);
});
test("M6 proof cannot accept user-invented factory/paired asset config",()=>{
 const hash="0x"+"a".repeat(64);
 const good={factoryAddress:"0x1111111111111111111111111111111111111111",
  factoryDeploymentHash:hash,factoryRuntimeHash:hash,
  ultraPairAsset:"0x2222222222222222222222222222222222222222",
  lookePairAsset:"0x3333333333333333333333333333333333333333"};
 assert.deepEqual(validateM6ExternalConfig(good),good);
 for(const invalid of [
  {...good,factoryAddress:"0x0"},{...good,factoryDeploymentHash:"missing"},
  {...good,factoryRuntimeHash:""},{...good,ultraPairAsset:good.lookePairAsset},
  {...good,lookePairAsset:"0x"+"0".repeat(40)}
 ])assert.throws(()=>validateM6ExternalConfig(invalid));
});
