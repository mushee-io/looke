/** Final10 M6 creator token PREVIEW only. No wallet signature, tx signing,
 * gas spend, private key, liquidity, ERC-20 approval or transaction broadcast.
 */
import {z} from "zod";
import {encodeFunctionData,parseUnits,getAddress} from "viem";
import {validateM4TokenDraft} from "./m4-metadata";
import {identityWritesEnabled} from "../social/auth";
import {m3SocialWritesEnabled} from "../social/m3-social-access";
import {assertActiveUltraEvmAccount,type UltraEvmWalletProvider} from "../ultra-evm-wallet";
import {lookeM6FactoryAbi} from "./m6-factory-abi";

const preview=z.object({
 name:z.string(),symbol:z.string(),pair:z.enum(["ULTRA","LOOKE"]),
 description:z.string().default(""),imageURI:z.string().default(""),
 metadataURI:z.string(),supplyTokens:z.string().regex(/^[1-9][0-9]{0,12}$/),
 clientNonce:z.string().regex(/^[0-9a-f]{32}$/)
}).strict();
export const M6_FINANCIAL_TRANSACTIONS_ENABLED=false as const;
export const M6_FACTORY_DEPLOYMENT_APPROVED=false as const;
export const M6_LIQUIDITY_PROVISION_ENABLED=false as const;
export function m6PreviewEnabled():boolean{
 return process.env.LOOKE_M6_CREATOR_PREVIEW_WRITES_ENABLED==="true"
   && identityWritesEnabled() && m3SocialWritesEnabled()
   && process.env.LOOKE_PUBLIC_BETA_ENABLED!=="true"
   && (process.env.VERCEL_ENV==="preview" || process.env.NODE_ENV!=="production");
}
export function validateM6CreatorPreview(input:unknown){
 const v=preview.parse(input);
 const meta=validateM4TokenDraft({
  name:v.name,symbol:v.symbol,pair:v.pair,description:v.description,
  imageURI:v.imageURI,metadataURI:v.metadataURI
 });
 if(!/^(ipfs:\/\/|ar:\/\/)/.test(meta.metadataURI) || meta.metadataURI.length>240)
   throw new Error("M6 requires immutable IPFS or Arweave metadata; no mutable HTTPS URI.");
 const tokens=BigInt(v.supplyTokens);
 if(tokens>1_000_000_000_000n)throw new Error("Creator token supply exceeds 1 trillion tokens.");
 const baseUnits=parseUnits(tokens.toString(),18);
 return {
  name:meta.name,symbol:meta.symbol,pair:meta.pair,
  metadataURI:meta.metadataURI,
  supplyTokens:tokens.toString(),
  initialSupply:baseUnits.toString(),
  clientNonce:v.clientNonce,chainId:18881 as const,
  reviewOnly:true as const,deployable:false as const,
  metadataContentVerified:false as const,
  feeDisclosure:{
   creationFeeWei:"0",networkGas:"unverified; determined by wallet at explicit approval",
   swapsAndLiquidity:"NOT created; ULTRA/LOOKE is a preference only"
  }
 };
}
export type M6Preview=ReturnType<typeof validateM6CreatorPreview>;

/** Build calldata only for a previously independently verified factory.
 * It is never broadcast here. The caller must then require a distinct explicit
 * wallet-approved UI transaction, outside M6's release gates.
 */
export async function prepareM6WalletReview(
 wallet:UltraEvmWalletProvider,expectedOwner:string,
 reviewed:M6Preview,verifiedFactory:{address:`0x${string}`;verified:true},
 onchainNonce:bigint,
):Promise<{to:`0x${string}`;from:`0x${string}`;data:`0x${string}`;value:"0x0";chainId:18881;broadcasted:false;feeWei:"0"}>{
 const account=await assertActiveUltraEvmAccount(wallet,expectedOwner);
 if(reviewed.chainId!==18881||!verifiedFactory.verified||onchainNonce<0n)
   throw new Error("Unverified Ultra EVM Testnet deployment context.");
 const to=getAddress(verifiedFactory.address);
 const data=encodeFunctionData({abi:lookeM6FactoryAbi,functionName:"createCoin",
  args:[reviewed.name,reviewed.symbol,reviewed.metadataURI,
    BigInt(reviewed.initialSupply),reviewed.pair==="ULTRA"?0:1,onchainNonce]});
 return {to,from:account,data,value:"0x0",chainId:18881,broadcasted:false,feeWei:"0"};
}
