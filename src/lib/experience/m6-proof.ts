/** Ultra EVM M6 proof verification. All RPC operations are READ ONLY.
 * No factory address, fee, pool, token, receipt or tx is assumed to exist.
 */
import {
 decodeEventLog,decodeFunctionData,getAddress,keccak256,
 type Address,type Hash,type Hex
} from "viem";
import {m6CreatorFactoryAbi} from "./m6-factory-abi";
import {
 assertAddress,assertHash,assertConfirmations,assertUltraTestnet,
 verifyFactoryDeployment,type UltraPublicClient
} from "../verification";
import {lookeCoinAbi} from "../coin-abi";
import type {reviewUnsignedM6Creator} from "./m6-creator";

type Proposal=ReturnType<typeof reviewUnsignedM6Creator>;
export type M6ExternalConfig={
 factoryAddress:string;factoryDeploymentHash:string;factoryRuntimeHash:string;
 ultraPairAsset:string;lookePairAsset:string;
};
export function validateM6ExternalConfig(cfg:M6ExternalConfig){
 assertAddress(cfg.factoryAddress);
 assertHash(cfg.factoryDeploymentHash);
 assertAddress(cfg.ultraPairAsset);assertAddress(cfg.lookePairAsset);
 if(getAddress(cfg.ultraPairAsset)===getAddress(cfg.lookePairAsset))
  throw new Error("Pair contracts cannot be identical.");
 if(!/^0x[0-9a-fA-F]{64}$/.test(cfg.factoryRuntimeHash))
  throw new Error("Independent factory runtime bytecode hash missing.");
 return cfg;
}
export async function verifyM6OnChainCreation(
 client:UltraPublicClient,transactionHash:string,creator:string,plan:Proposal,cfg:M6ExternalConfig
){
 validateM6ExternalConfig(cfg);
 assertHash(transactionHash);assertAddress(creator);
 if(plan.chainId!==18881||plan.deployable!==false||plan.applicationFeeWei!=="0")
  throw new Error("Untrusted deployment proposal.");
 await assertUltraTestnet(client);
 const factory=getAddress(cfg.factoryAddress);
 const signedOwner=getAddress(creator);
 const verified=await verifyFactoryDeployment(client,factory,cfg.factoryDeploymentHash);
 if(keccak256(verified.runtimeCode).toLowerCase()!==cfg.factoryRuntimeHash.toLowerCase())
  throw new Error("Factory bytecode differs from the independently approved artifact.");
 const [ultra,looke,ultraCode,lookeCode,receipt,tx,latest]=await Promise.all([
  client.readContract({address:factory,abi:m6CreatorFactoryAbi,functionName:"ultraPairAsset"}),
  client.readContract({address:factory,abi:m6CreatorFactoryAbi,functionName:"lookePairAsset"}),
  client.getBytecode({address:getAddress(cfg.ultraPairAsset)}),
  client.getBytecode({address:getAddress(cfg.lookePairAsset)}),
  client.getTransactionReceipt({hash:transactionHash as Hash}),
  client.getTransaction({hash:transactionHash as Hash}),
  client.getBlockNumber()
 ]);
 if(getAddress(ultra)!==getAddress(cfg.ultraPairAsset)||
   getAddress(looke)!==getAddress(cfg.lookePairAsset)||
   !ultraCode||ultraCode==="0x"||!lookeCode||lookeCode==="0x")
  throw new Error("Pair asset identities or bytecodes are unverified.");
 if(receipt.status!=="success"||tx.value!==0n||
   !receipt.to||getAddress(receipt.to)!==factory||
   !tx.to||getAddress(tx.to)!==factory||
   getAddress(receipt.from)!==signedOwner||getAddress(tx.from)!==signedOwner||
   receipt.transactionHash.toLowerCase()!==transactionHash.toLowerCase())
  throw new Error("Transaction was not a successful zero-value creator-authorized factory call.");
 const decoded=decodeFunctionData({abi:m6CreatorFactoryAbi,data:tx.input as Hex});
 if(decoded.functionName!=="createCreatorCoin")
  throw new Error("Transaction did not call the reviewed creator factory method.");
 const [name,symbol,metadataURI,amount,pref,nonce]=decoded.args;
 if(name!==plan.name||symbol!==plan.symbol||metadataURI!==plan.metadataURI||
   amount.toString()!==plan.supply||Number(pref)!==(plan.pair==="ULTRA"?0:1)||
   String(nonce).toLowerCase()!==plan.nonce.toLowerCase()||
   tx.input.toLowerCase()!==plan.calldata.toLowerCase())
  throw new Error("Actual wallet call differs from its reviewed unsigned M6 proposal.");
 const matching=[] as Array<{
  creator:Address;coin:Address;pairAsset:Address;pairPreference:number;nonce:Hex;
  name:string;symbol:string;metadataURI:string;initialSupply:bigint
 }>;
 for(const log of receipt.logs){
  if(getAddress(log.address)!==factory)continue;
  try{
   const event=decodeEventLog({abi:m6CreatorFactoryAbi,data:log.data,topics:log.topics,strict:true});
   if(event.eventName!=="M6CoinCreated")continue;
   matching.push(event.args);
  }catch{/* Other factory events are irrelevant, not proof. */}
 }
 if(matching.length!==1)throw new Error("Exactly one authentic factory event required.");
 const event=matching[0];
 const expectedPair=getAddress(plan.pair==="ULTRA"?cfg.ultraPairAsset:cfg.lookePairAsset);
 if(getAddress(event.creator)!==signedOwner||getAddress(event.pairAsset)!==expectedPair||
    Number(event.pairPreference)!==(plan.pair==="ULTRA"?0:1)||
    event.nonce.toLowerCase()!==plan.nonce.toLowerCase()||
    event.name!==plan.name||event.symbol!==plan.symbol||
    event.metadataURI!==plan.metadataURI||event.initialSupply.toString()!==plan.supply)
  throw new Error("Factory event is not bound to the reviewed owner, nonce, pair and supply.");
 const code=await client.getBytecode({address:event.coin});
 if(!code||code==="0x")throw new Error("Created token runtime bytecode missing.");
 const textAbi=[
  {type:"function",name:"name",stateMutability:"view",inputs:[],outputs:[{type:"string"}]},
  {type:"function",name:"symbol",stateMutability:"view",inputs:[],outputs:[{type:"string"}]}
 ] as const;
 const [owner,supply,balance,uri,actualName,actualSymbol]=await Promise.all([
  client.readContract({address:event.coin,abi:lookeCoinAbi,functionName:"creator"}),
  client.readContract({address:event.coin,abi:lookeCoinAbi,functionName:"totalSupply"}),
  client.readContract({address:event.coin,abi:lookeCoinAbi,functionName:"balanceOf",args:[signedOwner]}),
  client.readContract({address:event.coin,abi:lookeCoinAbi,functionName:"metadataURI"}),
  client.readContract({address:event.coin,abi:textAbi,functionName:"name"}),
  client.readContract({address:event.coin,abi:textAbi,functionName:"symbol"})
 ]);
 if(getAddress(owner)!==signedOwner||supply!==event.initialSupply||
   balance!==event.initialSupply||uri!==event.metadataURI||
   actualName!==event.name||actualSymbol!==event.symbol)
  throw new Error("Actual token contract state does not match the reviewed event.");
 const confirmations=assertConfirmations(receipt.blockNumber,latest,2);
 return {
  status:"verified-ultra-evm-testnet" as const,
  chainId:18881 as const,transactionHash:receipt.transactionHash,
  factoryAddress:factory,coinAddress:getAddress(event.coin),creator:signedOwner,
  pairPreference:plan.pair,pairReference:expectedPair,nonce:plan.nonce,
  onChainSupply:supply.toString(),confirmations,
  applicationFeeWei:"0" as const,liquidityCreatedOrVerified:false as const,
  broadcastByLooke:false as const,
  note:"A real wallet-signed factory receipt and token state were verified read-only. No pool, liquidity, trading or independent audit is implied."
 };
}
