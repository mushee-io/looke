import assert from "node:assert/strict";
import {test} from "node:test";
import {getAddress,keccak256,encodeFunctionData,encodeEventTopics,
 encodeAbiParameters,type Address,type Hash} from "viem";
import {validateM6CreatorPreview,m6PreviewEnabled,
 prepareM6WalletReview,M6_FINANCIAL_TRANSACTIONS_ENABLED,
 M6_FACTORY_DEPLOYMENT_APPROVED,M6_LIQUIDITY_PROVISION_ENABLED} from "../src/lib/experience/m6-creator";
import {verifyM6Factory,verifyM6CoinReceipt,m6ConfiguredFactory}
 from "../src/lib/experience/m6-chain-proof";
import {lookeM6FactoryAbi} from "../src/lib/experience/m6-factory-abi";
import type {UltraPublicClient} from "../src/lib/verification";
const owner=getAddress("0x"+"1".repeat(40)),other=getAddress("0x"+"2".repeat(40));
const factory=getAddress("0x"+"3".repeat(40)),coin=getAddress("0x"+"4".repeat(40));
const hash=("0x"+"5".repeat(64)) as Hash,deploymentHash=("0x"+"6".repeat(64)) as Hash;
const metadata="ipfs://bafybeigdyrzt5sfp7udm7hu76uhmizcmus36cybk6z52v6t37viffyzqku";
const fields={name:"Ultra Creator",symbol:"UCRT",metadataURI:metadata,
 pair:"ULTRA" as const,supplyTokens:"2500",clientNonce:"a".repeat(32)};
const originalEnv=Object.fromEntries(["LOOKE_M6_FACTORY_ADDRESS","LOOKE_M6_FACTORY_DEPLOY_TX","LOOKE_M6_APPROVED_FACTORY_CODEHASH"].map(k=>[k,process.env[k]]));
function withFlags(values:Record<string,string|undefined>,run:()=>void){
 const prev=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
 try{for(const [k,v]of Object.entries(values))if(v===undefined)delete process.env[k];else process.env[k]=v;run();}
 finally{for(const [k,v]of Object.entries(prev))if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
test("M6 strict immutable metadata, fixed-supply bounds, pair allowlist and no fictitious fees",()=>{
 const a=validateM6CreatorPreview(fields);
 assert.equal(a.chainId,18881);assert.equal(a.initialSupply,(2500n*10n**18n).toString());
 assert.equal(a.feeDisclosure.creationFeeWei,"0");assert.equal(a.reviewOnly,true);
 assert.equal(a.deployable,false);assert.equal(a.metadataContentVerified,false);
 assert.match(a.feeDisclosure.swapsAndLiquidity,/NOT created/);
 assert.equal(validateM6CreatorPreview({...fields,pair:"LOOKE"}).pair,"LOOKE");
 for(const bad of [
  {...fields,pair:"ETH"},{...fields,pair:"BNB"},{...fields,supplyTokens:"0"},
  {...fields,supplyTokens:"0001"},{...fields,supplyTokens:"1.5"},
  {...fields,supplyTokens:"1000000000001"},{...fields,supplyTokens:"-1"},
  {...fields,metadataURI:"https://cdn.example.com/metadata.json"},
  {...fields,metadataURI:"http://127.0.0.1/metadata.json"},
  {...fields,metadataURI:"ipfs://../../../etc/passwd"},
  {...fields,clientNonce:"abcdef"}, {...fields,symbol:"TOO_LONG_SYMBOL"}
 ])assert.throws(()=>validateM6CreatorPreview(bad));
});
test("M6 release configuration requires M2+M3 and protected Preview, never permits transaction",()=>{
 const env={LOOKE_M6_CREATOR_PREVIEW_WRITES_ENABLED:"true",
 LOOKE_M2_IDENTITY_WRITES_ENABLED:"true",LOOKE_M3_SOCIAL_WRITES_ENABLED:"true",
 LOOKE_SOCIAL_WRITES_ENABLED:"false",LOOKE_PUBLIC_BETA_ENABLED:"false",VERCEL_ENV:"preview"};
 withFlags(env,()=>assert.equal(m6PreviewEnabled(),true));
 for(const [k,v]of [
  ["LOOKE_M6_CREATOR_PREVIEW_WRITES_ENABLED","false"],
  ["LOOKE_M2_IDENTITY_WRITES_ENABLED","false"],
  ["LOOKE_M3_SOCIAL_WRITES_ENABLED","false"],
  ["LOOKE_PUBLIC_BETA_ENABLED","true"],
  ["VERCEL_ENV","production"]
 ]){
  withFlags({...env,NODE_ENV:"production",[k]:v},()=>assert.equal(m6PreviewEnabled(),false,k));
 }
 assert.equal(M6_FINANCIAL_TRANSACTIONS_ENABLED,false);
 assert.equal(M6_FACTORY_DEPLOYMENT_APPROVED,false);
 assert.equal(M6_LIQUIDITY_PROVISION_ENABLED,false);
 withFlags(Object.fromEntries(Object.keys(originalEnv).map(k=>[k,undefined])),()=>{
  assert.equal(m6ConfiguredFactory(),null);
 });
});
test("M6 unsigned calldata requires selected Testnet wallet; never requests a transaction",async()=>{
 const preview=validateM6CreatorPreview(fields),calls:string[]=[];
 const wallet={request:async({method}:{method:string})=>{
  calls.push(method);return method==="eth_chainId"?"0x49c1":[owner];
 }};
 const unsigned=await prepareM6WalletReview(wallet,owner,preview,{address:factory,verified:true},3n);
 assert.equal(unsigned.from,owner);assert.equal(unsigned.to,factory);
 assert.equal(unsigned.value,"0x0");assert.equal(unsigned.feeWei,"0");
 assert.equal(unsigned.broadcasted,false);assert.equal(unsigned.chainId,18881);
 assert.ok(unsigned.data.startsWith("0x"));assert.deepEqual(calls,["eth_chainId","eth_accounts","eth_chainId"]);
 assert.ok(!calls.some(m=>/sendTransaction|personal_sign|signTypedData|approve|permit/.test(m)));
 await assert.rejects(()=>prepareM6WalletReview(wallet,other,preview,{address:factory,verified:true},3n),/account changed/);
 const mainnet={request:async({method}:{method:string})=>method==="eth_chainId"?"0x4e17":[owner]};
 await assert.rejects(()=>prepareM6WalletReview(mainnet,owner,preview,{address:factory,verified:true},3n),/Testnet/);
});
test("M6 original factory and coin proofs reject mismatched hash, chain, fee, wallet, liquidity fiction",async()=>{
 const runtimeCode="0x6001600055" as const,approvedCodeHash=keccak256(runtimeCode);
 const preview=validateM6CreatorPreview(fields),supply=BigInt(preview.initialSupply);
 const config={address:factory,deploymentHash,approvedCodeHash};
 const factoryReceipt={status:"success",to:null,contractAddress:factory,blockNumber:90n};
 const calldata=encodeFunctionData({abi:lookeM6FactoryAbi,functionName:"createCoin",
  args:[preview.name,preview.symbol,preview.metadataURI,supply,0,0n]});
 const topics=encodeEventTopics({abi:lookeM6FactoryAbi,eventName:"CreatorCoinCreated",
  args:{creator:owner,coin,creatorNonce:0n}});
 const nonIndexed=[
  {name:"preference",type:"uint8"},
  {name:"initialSupply",type:"uint256"},{name:"feeWei",type:"uint256"}
 ] as const;
 const data=encodeAbiParameters(nonIndexed,[0,supply,0n]);
 const coinReceipt={status:"success",transactionHash:hash,to:factory,from:owner,
  blockHash:hash,blockNumber:91n,logs:[{address:factory,topics,data}]};
 const tx={hash,to:factory,from:owner,value:0n,input:calldata,blockHash:hash};
 let chain=18881,liveFee=0n;
 const client={
  getChainId:async()=>chain,
  getTransactionReceipt:async({hash:h}:{hash:Hash})=>h===deploymentHash?factoryReceipt:coinReceipt,
  getTransaction:async()=>tx,getBlockNumber:async()=>95n,
  getBytecode:async({address}:{address:Address})=>address===factory?runtimeCode:"0x60006000",
  readContract:async({functionName}:{functionName:string})=>{
   if(functionName==="CREATION_FEE_WEI")return liveFee;
   if(functionName==="creator")return owner;
   if(functionName==="name")return preview.name;
   if(functionName==="symbol")return preview.symbol;
   if(functionName==="totalSupply"||functionName==="balanceOf")return supply;
   if(functionName==="metadataURI")return metadata;
   throw Error("Unexpected contract probe "+functionName);
  }
 } as unknown as UltraPublicClient;
 const proof=await verifyM6Factory(client,config);
 assert.equal(proof.codeHash,approvedCodeHash);assert.equal(proof.creationFeeWei,"0");
 const coinProof=await verifyM6CoinReceipt(client,proof,owner,hash,preview);
 assert.equal(coinProof.token,coin);assert.equal(coinProof.creatorNonce,"0");
 assert.equal(coinProof.liquidityCreated,false);assert.equal(coinProof.confirmations,5);
 await assert.rejects(()=>verifyM6Factory(client,{...config,approvedCodeHash:hash}),/runtime bytecode/);
 await assert.rejects(()=>verifyM6CoinReceipt(client,proof,other,hash,preview),/original wallet-funded/);
 await assert.rejects(()=>verifyM6CoinReceipt(client,proof,owner,hash,{...preview,pair:"LOOKE"}),/reviewed draft/);
 chain=19991;
 await assert.rejects(()=>verifyM6Factory(client,config),/expected Ultra EVM Testnet/);
 chain=18881;liveFee=1n;
 await assert.rejects(()=>verifyM6Factory(client,config),/fee/);
});
