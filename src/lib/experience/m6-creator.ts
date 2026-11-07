import {encodeFunctionData,keccak256,parseUnits,type Hex} from "viem";
import {z} from "zod";
import {validateM4TokenDraft} from "./m4-metadata";
import {m6CreatorFactoryAbi} from "./m6-factory-abi";
import {assertActiveUltraEvmAccount} from "../social/m2-identity";
import type {UltraEvmWalletProvider} from "../ultra-evm-wallet";

/** This milestone creates only an unsigned review payload; never sends a wallet
 * request, creates liquidity, issues a coin, or claims factory verification.
 */
export const M6_WALLET_EXECUTION_ENABLED=false as const;
export const M6_OPERATOR_FACTORY_APPROVED=false as const;
export const M6_APPLICATION_FEE_WEI=0n;
export const M6_MAX_SUPPLY=1_000_000_000n*10n**18n;
const draftSchema=z.object({
 name:z.string().min(1).max(80),
 symbol:z.string().min(1).max(24),
 description:z.string().max(500).default(""),
 imageURI:z.string().max(700).default(""),
 metadataURI:z.string().max(700).min(1),
 supply:z.string().trim().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/),
 pair:z.enum(["ULTRA","LOOKE"])
}).strict();
export type M6DraftInput=z.input<typeof draftSchema>;
export function reviewUnsignedM6Creator(input:unknown,nonce:unknown){
 const form=draftSchema.parse(input);
 const validated=validateM4TokenDraft({
  name:form.name,symbol:form.symbol,description:form.description,
  imageURI:form.imageURI,metadataURI:form.metadataURI,pair:form.pair
 });
 if(!validated.metadataURI)throw new Error("Published metadata URI is required.");
 if(typeof nonce!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(nonce) ||
   /^0x0{64}$/i.test(nonce))throw new Error("One-use nonzero 32-byte nonce required.");
 const amount=parseUnits(form.supply,18);
 if(amount<=0n||amount>M6_MAX_SUPPLY)
  throw new Error("Fixed token supply must be greater than zero and at most one billion tokens.");
 const preference=form.pair==="ULTRA"?0:1;
 const data=encodeFunctionData({
  abi:m6CreatorFactoryAbi,functionName:"createCreatorCoin",
  args:[validated.name,validated.symbol,validated.metadataURI,amount,preference,nonce as Hex]
 });
 return {
  chainId:18881 as const,name:validated.name,symbol:validated.symbol,
  description:validated.description,imageURI:validated.imageURI,
  metadataURI:validated.metadataURI,pair:form.pair,
  supply:amount.toString(),nonce:nonce.toLowerCase() as Hex,
  calldata:data,calldataHash:keccak256(data),
  applicationFeeWei:"0" as const,networkGasFeeWei:null,
  reviewedPairContract:null,verifiedFactoryAddress:null,
  pairLiquidityCreated:false as const,metadataSourceVerified:false as const,
  walletTransactionPrepared:false as const,transactionBroadcast:false as const,
  userWalletApprovalRequired:true as const,deployable:false as const,
  warning:"Review only. Both pair assets and factory bytecode must be independently verified. No network gas estimate, liquidity or token deployment is claimed."
 };
}

/** Explicit, READ-ONLY wallet preflight for a user-reviewed proposal.
 * Only eth_chainId and eth_accounts are called; no approvals, signatures,
 * private keys, transfers or transaction broadcast. Actual deployment is
 * separately blocked until signed consent and independent factory review.
 */
export async function reviewM6WalletAuthorization(
 wallet:UltraEvmWalletProvider,expectedOwner:string,plan:ReturnType<typeof reviewUnsignedM6Creator>
){
 const owner=await assertActiveUltraEvmAccount(wallet,expectedOwner);
 if(plan.chainId!==18881||!plan.calldata||plan.deployable!==false)
  throw new Error("A validated, unsigned Ultra EVM Testnet proposal is required.");
 return {owner,chainId:18881 as const,calldataHash:plan.calldataHash,
  networkGasFeeWei:null,applicationFeeWei:"0" as const,
  walletAuthorizationRequested:false as const,transactionBroadcast:false as const,
  message:"Preflight only. No wallet signature or financial action is requested."};
}
