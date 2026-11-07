import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {ULTRA_EVM_MAINNET,ULTRA_EVM_TESTNET,isUltraEvmChainId,isLookeTestnetChain} from "../src/lib/ultra";
import {connectUltraEvmWallet,ensureUltraEvmTestnet,requireUltraEvmTestnet,type UltraEvmWalletProvider} from "../src/lib/ultra-evm-wallet";
import {probeUltraEvm} from "../src/lib/ultra-evm-rpc";

const owner="0x1111111111111111111111111111111111111111";
function wallet(start:string,options:{missing?:boolean;refuse?:boolean;ignore?:boolean;changed?:boolean}={}){
 let chain=start;
 const methods:string[]=[];
 const provider:UltraEvmWalletProvider={request:async({method,params})=>{
  methods.push(method);
  if(method==="eth_chainId")return chain;
  if(method==="eth_requestAccounts")return [owner];
  if(method==="eth_accounts")return [options.changed?"0x2222222222222222222222222222222222222222":owner];
  if(method==="wallet_switchEthereumChain"){
   if(options.refuse)throw Object.assign(Error("User rejected"),{code:4001});
   if(options.missing&&methods.filter(x=>x==="wallet_switchEthereumChain").length===1)
    throw Object.assign(Error("Chain unrecognized"),{code:4902});
   if(!options.ignore)chain=(params?.[0] as {chainId:string}).chainId;
   return null;
  }
  if(method==="wallet_addEthereumChain"){
   assert.equal((params?.[0] as {chainId:string}).chainId,"0x49c1");
   return null;
  }
  throw Error("Forbidden wallet call "+method);
 }};
 return {provider,methods,getChain:()=>chain};
}
test("M1 canonical network registry accepts only Ultra EVM 18881 and 19991",()=>{
 assert.equal(ULTRA_EVM_TESTNET.chainId,18881);
 assert.equal(ULTRA_EVM_TESTNET.chainIdHex,"0x49c1");
 assert.equal(ULTRA_EVM_MAINNET.chainId,19991);
 assert.equal(ULTRA_EVM_MAINNET.chainIdHex,"0x4e17");
 assert.equal(ULTRA_EVM_MAINNET.rpcUrls[0],"https://evm.ultra.eosusa.io");
 assert.equal(ULTRA_EVM_TESTNET.explorer,"https://evmexplorer.testnet.ultra.io");
 for(const id of ["0x49c1","0x4e17"])assert.equal(isUltraEvmChainId(id),true);
 for(const id of ["0x2105","0x38","0x1","0x89","native","0x49c1junk"])assert.equal(isUltraEvmChainId(id),false);
 assert.equal(isLookeTestnetChain("0x4e17"),false);
 assert.equal(isLookeTestnetChain("0x49C1"),true);
});
test("M1 explicitly switches away from Base, BNB and Ultra EVM Mainnet without any financial calls",async()=>{
 for(const chain of ["0x2105","0x38","0x4e17"]){
  const x=wallet(chain);
  const a=await connectUltraEvmWallet(x.provider);
  assert.equal(a,owner);assert.equal(x.getChain(),"0x49c1");
  assert.equal(x.methods.filter(s=>s==="wallet_switchEthereumChain").length,1);
  assert.ok(x.methods.every(s=>["eth_requestAccounts","eth_chainId","eth_accounts","wallet_switchEthereumChain"].includes(s)));
  await requireUltraEvmTestnet(x.provider);
 }
});
test("M1 unknown EVM Testnet is added only after EIP-1193 error 4902 and chain is rechecked",async()=>{
 const x=wallet("0x1",{missing:true});
 await ensureUltraEvmTestnet(x.provider);
 assert.equal(x.getChain(),"0x49c1");
 assert.equal(x.methods.includes("wallet_addEthereumChain"),true);
 assert.equal(x.methods.filter(m=>m==="wallet_switchEthereumChain").length,2);
});
test("M1 rejects denied, ignored or changed wallet approvals rather than claiming connection",async()=>{
 const denied=wallet("0x38",{refuse:true});
 await assert.rejects(()=>connectUltraEvmWallet(denied.provider),/User rejected/);
 assert.equal(denied.methods.includes("wallet_addEthereumChain"),false);
 const ignored=wallet("0x2105",{ignore:true});
 await assert.rejects(()=>connectUltraEvmWallet(ignored.provider),/Ultra EVM Testnet/);
 const changed=wallet("0x49c1",{changed:true});
 await assert.rejects(()=>connectUltraEvmWallet(changed.provider),/authorization changed/);
 const invalid=wallet("0x1");invalid.provider.request=async({method})=>{
  if(method==="eth_requestAccounts")return ["0x0000000000000000000000000000000000000000"];
  throw Error("Should not request signature or transaction");
 };
 await assert.rejects(()=>connectUltraEvmWallet(invalid.provider),/nonzero/);
});
test("M1 RPC probes authenticate actual fixed Ultra EVM chain ID and positive block source",async()=>{
 const methods:string[]=[];
 const fake=async(url:RequestInfo|URL,options?:RequestInit)=>{
  assert.ok(String(url)==="https://evm.test.ultra.eosusa.io"||String(url)==="https://evm.ultra.eosusa.io");
  assert.equal(options?.method,"POST");assert.equal(options?.redirect,"error");
  const body=JSON.parse(String(options?.body)) as {method:string};
  methods.push(body.method);
  return new Response(JSON.stringify({jsonrpc:"2.0",result:body.method==="eth_chainId"?
   (String(url).includes(".test.")?"0x49c1":"0x4e17"):"0x64"}),{status:200});
 };
 for(const env of ["testnet","mainnet"] as const){
  const result=await probeUltraEvm(env,fake as typeof fetch);
  assert.equal(result.status,"verified");
  assert.equal(result.latestBlock,"100");
  assert.equal(result.writesAllowed,false);
 }
 assert.equal(methods.length,4);
 assert.ok(methods.every(s=>s==="eth_chainId"||s==="eth_blockNumber"));
 const wrong=await probeUltraEvm("testnet",(async()=>
  new Response(JSON.stringify({jsonrpc:"2.0",result:"0x38"}),{status:200})) as typeof fetch);
 assert.equal(wrong.status,"unavailable");
 assert.equal(wrong.observedChainId,null);
});
test("M1 public app removes all native wallet/Uniq routes and Base/BNB active selections",()=>{
 for(const p of ["src/app/page.tsx","src/app/social/page.tsx","src/app/beta/page.tsx",
  "src/components/discover/DiscoverDashboard.tsx",
  "src/components/experience/M33LiveIntegrationLab.tsx",
  "src/components/experience/LookeViews.tsx"]){
  const text=readFileSync(p,"utf8");
  assert.equal(text.includes('href="/uniqs"'),false,p);
  assert.equal(text.includes("UltraWalletSDK"),false,p);
  assert.equal(text.includes('value="uniq"'),false,p);
  assert.equal(text.includes('href="/base"'),false,p);
  assert.equal(text.includes('href="/bnb"'),false,p);
 }
 const legacy=readFileSync("src/app/api/uniqs/route.ts","utf8");
 assert.ok(legacy.includes("410"));
 assert.equal(legacy.includes("getNativeTestnetInfo"),false);
 for(const p of [".env.example","deployment/staging.env.example"]){
  assert.equal(readFileSync(p,"utf8").includes("ULTRA_NATIVE_TESTNET_RPC_URL="),false);
 }
});
