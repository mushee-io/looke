/** M6: original, read-only Ultra EVM Testnet factory and creator receipt proof.
 * Provider results are never inferred from a string, env var or wallet input.
 */
import {
 getAddress,isAddress,keccak256,decodeEventLog,decodeFunctionData,
 type Address,type Hash
} from "viem";
import {ULTRA_EVM_TESTNET} from "../ultra";
import {assertAddress,assertHash,assertUltraTestnet,assertConfirmations,
 createUltraPublicClient,type UltraPublicClient} from "../verification";
import {lookeCoinAbi} from "../coin-abi";
import {lookeM6FactoryAbi} from "./m6-factory-abi";
import type {M6Preview} from "./m6-creator";

export type M6FactoryProof={
 verified:true;address:Address;deploymentHash:Hash;codeHash:Hash;
 confirmations:number;creationFeeWei:"0";chainId:18881;
};
export function m6ConfiguredFactory(){
 const address=process.env.LOOKE_M6_FACTORY_ADDRESS||"";
 const deploymentHash=process.env.LOOKE_M6_FACTORY_DEPLOY_TX||"";
 const approvedCodeHash=process.env.LOOKE_M6_APPROVED_FACTORY_CODEHASH||"";
 if(!address||!deploymentHash||!approvedCodeHash)return null;
 assertAddress(address);assertHash(deploymentHash);assertHash(approvedCodeHash);
 return {address:getAddress(address),deploymentHash:deploymentHash as Hash,approvedCodeHash:approvedCodeHash as Hash};
}
export async function verifyM6Factory(
 client:UltraPublicClient,config:NonNullable<ReturnType<typeof m6ConfiguredFactory>>
):Promise<M6FactoryProof>{
 await assertUltraTestnet(client);
 const receipt=await client.getTransactionReceipt({hash:config.deploymentHash});
 if(receipt.status!=="success"||receipt.to!==null||
    !receipt.contractAddress||getAddress(receipt.contractAddress)!==config.address)
  throw new Error("No original successful factory creation receipt for configured M6 address.");
 const [code,latest,fee]=await Promise.all([
  client.getBytecode({address:config.address}),client.getBlockNumber(),
  client.readContract({address:config.address,abi:lookeM6FactoryAbi,functionName:"CREATION_FEE_WEI"})
 ]);
 if(!code||code==="0x"||keccak256(code).toLowerCase()!==config.approvedCodeHash.toLowerCase())
  throw new Error("Current factory runtime bytecode does not match independently pinned approved hash.");
 if(fee!==0n)throw new Error("M6 candidate creation fee does not match zero-fee disclosure.");
 return {verified:true,address:config.address,deploymentHash:config.deploymentHash,
  codeHash:config.approvedCodeHash,confirmations:assertConfirmations(receipt.blockNumber,latest),
  creationFeeWei:"0",chainId:18881};
}
export async function verifyM6CoinReceipt(
 client:UltraPublicClient,proof:M6FactoryProof,owner:string,
 hash:string,expected:M6Preview
){
 assertAddress(owner);assertHash(hash);
 if(expected.chainId!==18881||expected.metadataContentVerified!==false)
  throw new Error("Unexpected reviewed Ultra EVM creator preview.");
 await assertUltraTestnet(client);
 const signer=getAddress(owner);
 const [tx,receipt,latest]=await Promise.all([
  client.getTransaction({hash}),client.getTransactionReceipt({hash}),client.getBlockNumber()
 ]);
 if(receipt.status!=="success"||receipt.transactionHash.toLowerCase()!==hash.toLowerCase()||
    tx.hash.toLowerCase()!==hash.toLowerCase()||
    !receipt.to||getAddress(receipt.to)!==proof.address||
    !tx.to||getAddress(tx.to)!==proof.address||
    getAddress(receipt.from)!==signer||getAddress(tx.from)!==signer||
    tx.value!==0n||receipt.blockHash.toLowerCase()!==tx.blockHash?.toLowerCase())
  throw new Error("Creator transaction is not an original wallet-funded call to the reviewed factory.");
 const calldata=decodeFunctionData({abi:lookeM6FactoryAbi,data:tx.input});
 if(calldata.functionName!=="createCoin")throw new Error("Creator transaction did not call the M6 factory createCoin method.");
 const [name,symbol,metadataURI,supply,pair,nonce]=calldata.args;
 if(name!==expected.name||symbol!==expected.symbol||
    metadataURI!==expected.metadataURI||supply!==BigInt(expected.initialSupply)||
    pair!==(expected.pair==="ULTRA"?0:1))
   throw new Error("Creator call does not match original wallet's reviewed draft.");
 const matches=[] as Array<{coin:Address;creatorNonce:bigint}>;
 for(const log of receipt.logs){
  if(getAddress(log.address)!==proof.address)continue;
  try{
   const d=decodeEventLog({abi:lookeM6FactoryAbi,topics:log.topics,data:log.data,strict:true});
   if(d.eventName!=="CreatorCoinCreated")continue;
   if(getAddress(d.args.creator)!==signer||d.args.name!==name||d.args.symbol!==symbol||
      d.args.metadataURI!==metadataURI||d.args.initialSupply!==supply||
      d.args.preference!==pair||d.args.creatorNonce!==nonce||d.args.feeWei!==0n)
      throw new Error("Original factory emission differs from submitted creator transaction.");
   matches.push({coin:getAddress(d.args.coin),creatorNonce:d.args.creatorNonce});
  }catch(e){
   // An unrecognized event may coexist, but mismatched CreatorCoinCreated
   // events must never silently turn into an accepted event.
   if(e instanceof Error&&e.message.startsWith("Original factory emission"))throw e;
  }
 }
 if(matches.length!==1)throw new Error("Exactly one matching original M6 CreatorCoinCreated event is required.");
 const token=matches[0].coin;
 const [code,creator,totalSupply,balance,storedURI]=await Promise.all([
  client.getBytecode({address:token}),
  client.readContract({address:token,abi:lookeCoinAbi,functionName:"creator"}),
  client.readContract({address:token,abi:lookeCoinAbi,functionName:"totalSupply"}),
  client.readContract({address:token,abi:lookeCoinAbi,functionName:"balanceOf",args:[signer]}),
  client.readContract({address:token,abi:lookeCoinAbi,functionName:"metadataURI"}),
 ]);
 if(!code||code==="0x"||getAddress(creator)!==signer||
    totalSupply!==supply||balance!==supply||storedURI!==metadataURI)
    throw new Error("New coin runtime state is inconsistent with factory and wallet receipts.");
 return {status:"verified" as const,source:"original-ultra-evm-testnet" as const,
  transactionHash:hash,creator:signer,token,creatorNonce:nonce.toString(),
  confirmations:assertConfirmations(receipt.blockNumber,latest),
  initialSupply:totalSupply.toString(),metadataURI,preference:expected.pair,
  creationFeeWei:"0" as const,liquidityCreated:false as const};
}
/** Fixed network client only. Never accept user-supplied RPC or wallet-provided RPC. */
export function m6ReadOnlyClient(){return createUltraPublicClient(ULTRA_EVM_TESTNET.rpcUrls[0]);}
