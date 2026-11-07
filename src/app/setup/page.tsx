"use client";
import {useState} from "react";
import Link from "next/link";
import {encodeFunctionData,getAddress,isAddress,parseUnits,type Address,type Hash} from "viem";
import {testnetTxUrl,testnetAddressUrl} from "../../lib/ultra";
import {erc20Abi,v2FactoryAbi,v2PairAbi,v2RouterAbi} from "../../lib/trading";
import {createUltraPublicClient,verifyFactoryDeployment} from "../../lib/verification";
type Wallet={request:(x:{method:string;params?:unknown[]})=>Promise<unknown>};
const client=createUltraPublicClient();
const nonzero=(s:string):Address=>{if(!isAddress(s)||/^0x0{40}$/i.test(s))throw Error("Enter a nonzero contract address.");return getAddress(s);};
const error=(e:unknown)=>e instanceof Error?e.message:"Ultra Testnet RPC / wallet failure.";
const factoryAbi=[...v2FactoryAbi,{type:"function",name:"createPair",stateMutability:"nonpayable",inputs:[{name:"tokenA",type:"address"},{name:"tokenB",type:"address"}],outputs:[{name:"pair",type:"address"}]}] as const;
const routerAbi=[...v2RouterAbi,{type:"function",name:"addLiquidity",stateMutability:"nonpayable",inputs:[{name:"tokenA",type:"address"},{name:"tokenB",type:"address"},{name:"amountADesired",type:"uint256"},{name:"amountBDesired",type:"uint256"},{name:"amountAMin",type:"uint256"},{name:"amountBMin",type:"uint256"},{name:"to",type:"address"},{name:"deadline",type:"uint256"}],outputs:[{name:"amountA",type:"uint256"},{name:"amountB",type:"uint256"},{name:"liquidity",type:"uint256"}]}] as const;
type ContractSet={factory:Address;router:Address;base:Address;quote:Address;pair:Address|null;symbolA:string;symbolB:string;decA:number;decB:number};
async function operator():Promise<{wallet:Wallet;account:Address}>{
 const wallet=(window as Window&{ethereum?:Wallet}).ethereum;
 if(!wallet)throw Error("Install an injected wallet.");
 if(await client.getChainId()!==18881 || String(await wallet.request({method:"eth_chainId"})).toLowerCase()!=="0x49c1")throw Error("Ultra EVM Testnet chain 18881 required.");
 const accounts=await wallet.request({method:"eth_requestAccounts"}) as string[];
 return {wallet,account:nonzero(accounts?.[0]||"")};
}
async function send(to:Address,data:Hash){
 const {wallet,account}=await operator();
 const raw=await wallet.request({method:"eth_sendTransaction",params:[{from:account,to,data}]});
 if(typeof raw!=="string"||!/^0x[\da-fA-F]{64}$/.test(raw))throw Error("Wallet returned no valid hash.");
 const hash=raw as Hash;
 const receipt=await client.waitForTransactionReceipt({hash,confirmations:2,timeout:120000});
 if(receipt.status!=="success"||!receipt.to||getAddress(receipt.to)!==to)throw Error("Transaction did not confirm at the intended contract: "+hash);
 return hash;
}
export default function TestnetSetup(){
 const [factory,setFactory]=useState(""),[router,setRouter]=useState(""),[base,setBase]=useState(""),[quote,setQuote]=useState("");
 const [a,setA]=useState(""),[b,setB]=useState(""),[marketId,setMarketId]=useState("looke-ultra");
 const [checked,setChecked]=useState<ContractSet|null>(null),[status,setStatus]=useState(""),[tx,setTx]=useState(""),[registry,setRegistry]=useState(""),[busy,setBusy]=useState(false);
 const [factoryCode,setFactoryCode]=useState<`0x${string}`|null>(null),[deployedFactory,setDeployedFactory]=useState<{address:Address;hash:Hash}|null>(null);
 const reset=(fn:()=>void)=>{fn();setChecked(null);setRegistry("");setStatus("");};
 async function importFactoryArtifact(file:File|undefined){
  setFactoryCode(null);setDeployedFactory(null);
  if(!file)return;
  try{
   if(file.size>5_000_000)throw Error("Unexpectedly large compiled artifact.");
   const item=JSON.parse(await file.text()) as {contractName?:string;abi?:Array<{name?:string}>;bytecode?:{object?:string;linkReferences?:Record<string,unknown>}};
   const binary=item.bytecode?.object;
   if((item.contractName!==undefined&&item.contractName!=="LookeCoinFactory")||!item.abi?.some(x=>x.name==="coinCount")||!item.abi.some(x=>x.name==="createCoin")||
    !binary||!/^0x(?:[0-9a-fA-F]{2}){100,}$/.test(binary)||Object.keys(item.bytecode?.linkReferences||{}).length)
    throw Error("Compile the reviewed LookeCoinFactory.sol with Solidity 0.8.24. Invalid, linked or unrecognized artifact.");
   setFactoryCode(binary as `0x${string}`);
   setStatus("Artifact loaded locally. Inspect source and bytecode in your compiler before signing deployment.");
  }catch(e){setStatus(error(e));}
 }
 async function deployFactory(){
  if(!factoryCode||busy)return;
  setBusy(true);setDeployedFactory(null);setStatus("");
  try{
   const {wallet,account}=await operator();
   const raw=await wallet.request({method:"eth_sendTransaction",params:[{from:account,data:factoryCode}]});
   if(typeof raw!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(raw))throw Error("Wallet returned no valid deployment hash.");
   const hash=raw as Hash;setTx(hash);
   const receipt=await client.waitForTransactionReceipt({hash,confirmations:2,timeout:120000});
   if(receipt.status!=="success"||receipt.to!==null||!receipt.contractAddress)
     throw Error("Factory deployment transaction was not successful. Inspect the explorer.");
   const deployed=getAddress(receipt.contractAddress);
   await verifyFactoryDeployment(client,deployed,hash);
   setDeployedFactory({address:deployed,hash});
   setStatus("Factory deployment independently verified on Ultra EVM Testnet. Copy both original identifiers to Vercel Preview and redeploy.");
  }catch(e){setStatus(error(e));}finally{setBusy(false);}
 }

 async function verify(){setBusy(true);setStatus("");setChecked(null);setRegistry("");try{
  if(await client.getChainId()!==18881)throw Error("Wrong RPC chain.");
  const f=nonzero(factory),r=nonzero(router),t=nonzero(base),q=nonzero(quote);
  if(new Set([f,r,t,q].map(x=>x.toLowerCase())).size!==4)throw Error("All four contract addresses must be distinct.");
  const code=await Promise.all([f,r,t,q].map(address=>client.getBytecode({address})));
  if(code.some(x=>!x||x==="0x"))throw Error("Contract code is missing on Ultra Testnet.");
  const [rf,existing,symbolA,symbolB,decA,decB,creator]=await Promise.all([
   client.readContract({address:r,abi:v2RouterAbi,functionName:"factory"}),
   client.readContract({address:f,abi:v2FactoryAbi,functionName:"getPair",args:[t,q]}),
   client.readContract({address:t,abi:erc20Abi,functionName:"symbol"}),
   client.readContract({address:q,abi:erc20Abi,functionName:"symbol"}),
   client.readContract({address:t,abi:erc20Abi,functionName:"decimals"}),
   client.readContract({address:q,abi:erc20Abi,functionName:"decimals"}),
   client.readContract({address:t,abi:[{type:"function",name:"creator",stateMutability:"view",inputs:[],outputs:[{type:"address"}]}] as const,functionName:"creator"})
  ]);
  if(getAddress(rf)!==f||!isAddress(creator)||/^0x0{40}$/i.test(creator)||decA>18||decB>18)throw Error("Creator, token decimals, or router factory verification failed.");
  if(!/^[A-Za-z0-9_.-]{1,24}$/.test(symbolA)||!/^[A-Za-z0-9_.-]{1,24}$/.test(symbolB))throw Error("Invalid symbol.");
  const pair=existing==="0x0000000000000000000000000000000000000000"?null:getAddress(existing);
  if(pair){const [pc,pf,t0,t1]=await Promise.all([client.getBytecode({address:pair}),client.readContract({address:pair,abi:v2PairAbi,functionName:"factory"}),client.readContract({address:pair,abi:v2PairAbi,functionName:"token0"}),client.readContract({address:pair,abi:v2PairAbi,functionName:"token1"})]);
   if(!pc||pc==="0x"||getAddress(pf)!==f||new Set([getAddress(t0),getAddress(t1)]).size!==2||![t,q].every(x=>[getAddress(t0),getAddress(t1)].includes(x)))throw Error("Pair/factory/token provenance mismatch.");
  }
  setChecked({factory:f,router:r,base:t,quote:q,pair,symbolA,symbolB,decA,decB});
  setStatus(pair?"Existing V2 pair verified.":"Contracts verified. Pair must be created by a wallet signature.");
 }catch(e){setStatus(error(e));}finally{setBusy(false);}}
 async function createPair(){if(!checked||checked.pair||busy)return;setBusy(true);try{
  const data=encodeFunctionData({abi:factoryAbi,functionName:"createPair",args:[checked.base,checked.quote]});
  const hash=await send(checked.factory,data);setTx(hash);setStatus("Pair creation confirmed. Reverify before funding.");
  setChecked(null);
 }catch(e){setStatus(error(e));}finally{setBusy(false);}}
 async function approve(token:"base"|"quote"){if(!checked||busy)return;setBusy(true);try{
  const {account}=await operator();const t=token==="base"?checked.base:checked.quote;
  const amount=parseUnits(token==="base"?a:b,token==="base"?checked.decA:checked.decB);
  if(amount<=0n)throw Error("Amount must be positive.");
  const [bal,allow]=await Promise.all([client.readContract({address:t,abi:erc20Abi,functionName:"balanceOf",args:[account]}),client.readContract({address:t,abi:erc20Abi,functionName:"allowance",args:[account,checked.router]})]);
  if(bal<amount)throw Error("Insufficient wallet token balance.");
  if(allow>=amount){setStatus("Existing router allowance already covers amount.");return;}
  const value=allow>0n?0n:amount;
  const data=encodeFunctionData({abi:erc20Abi,functionName:"approve",args:[checked.router,value]});
  const hash=await send(t,data);setTx(hash);
  setStatus(value===0n?"Old allowance zeroed; approve again for exact new amount.":"Exact router approval confirmed.");
 }catch(e){setStatus(error(e));}finally{setBusy(false);}}
 async function fund(){if(!checked?.pair||busy)return;setBusy(true);try{
  const {account}=await operator(),ca=checked;const va=parseUnits(a,ca.decA),vb=parseUnits(b,ca.decB);
  if(va<=0n||vb<=0n)throw Error("Enter two positive amounts.");
  const [ba,bb,aa,ab,pair,reserves,t0]=await Promise.all([
   client.readContract({address:ca.base,abi:erc20Abi,functionName:"balanceOf",args:[account]}),
   client.readContract({address:ca.quote,abi:erc20Abi,functionName:"balanceOf",args:[account]}),
   client.readContract({address:ca.base,abi:erc20Abi,functionName:"allowance",args:[account,ca.router]}),
   client.readContract({address:ca.quote,abi:erc20Abi,functionName:"allowance",args:[account,ca.router]}),
   client.readContract({address:ca.factory,abi:v2FactoryAbi,functionName:"getPair",args:[ca.base,ca.quote]}),
   client.readContract({address:ca.pair!,abi:v2PairAbi,functionName:"getReserves"}),
   client.readContract({address:ca.pair!,abi:v2PairAbi,functionName:"token0"})
  ]);
  if(getAddress(pair)!==ca.pair||ba<va||bb<vb||aa<va||ab<vb)throw Error("Pair changed or balance/allowance insufficient.");
  const ra=getAddress(t0)===ca.base?reserves[0]:reserves[1],rb=getAddress(t0)===ca.base?reserves[1]:reserves[0];
  if(ra>0n&&rb>0n){const left=va*rb,right=vb*ra,diff=left>right?left-right:right-left;if(diff*100n>left)throw Error("Deposits differ by >1% from existing pool ratio.");}
  const data=encodeFunctionData({abi:routerAbi,functionName:"addLiquidity",args:[ca.base,ca.quote,va,vb,va*99n/100n,vb*99n/100n,account,BigInt(Math.floor(Date.now()/1000)+300)]});
  const hash=await send(ca.router,data);setTx(hash);setStatus("Liquidity transaction confirmed. Verify reserves and generate manifest.");
 }catch(e){setStatus(error(e));}finally{setBusy(false);}}
 async function manifest(){if(!checked?.pair||busy)return;setBusy(true);try{const ca=checked;
 const [pair,rf,reserves]=await Promise.all([
  client.readContract({address:ca.factory,abi:v2FactoryAbi,functionName:"getPair",args:[ca.base,ca.quote]}),
  client.readContract({address:ca.router,abi:v2RouterAbi,functionName:"factory"}),
  client.readContract({address:ca.pair!,abi:v2PairAbi,functionName:"getReserves"})
 ]);
 if(getAddress(pair)!==ca.pair||getAddress(rf)!==ca.factory||reserves[0]<=0n||reserves[1]<=0n)throw Error("Verified two-sided reserves are absent.");
 if(!/^[a-z0-9][a-z0-9-]{0,31}$/.test(marketId))throw Error("Invalid market ID.");
 setRegistry(JSON.stringify([{id:marketId,baseToken:ca.base,quoteToken:ca.quote,pair:ca.pair,router:ca.router,factory:ca.factory}],null,2));
 setStatus("Two-sided on-chain reserves verified. Set this JSON in the Preview LOOKE_M4_MARKETS_JSON environment variable and redeploy.");
 }catch(e){setStatus(error(e));}finally{setBusy(false);}}
 const inputStyle={display:"block" as const,width:"100%",padding:10};
 return <main style={{maxWidth:780,margin:"3rem auto",padding:20,fontFamily:"system-ui",lineHeight:1.6}}>
 <Link href="/">← Looke home</Link><h1>Ultra EVM Testnet launch</h1>
 <p>Deploy <code>LookeCoinFactory.sol</code> with an injected wallet in Remix, then configure its address and original deployment transaction as <code>NEXT_PUBLIC_LOOKE_FACTORY_ADDRESS</code> and <code>NEXT_PUBLIC_LOOKE_FACTORY_DEPLOY_TX</code>. Trading needs an existing genuine V2-compatible factory and router on chain 18881.</p>
 <p><strong>Wallet-only actions:</strong> each pair creation, approval and liquidity deposit needs your confirmation. No private keys, synthetic tokens, or automatic transactions.</p>
 <section><h2>Deploy Looke creator coin factory</h2>
 <p>Build <code>contracts/LookeCoinFactory.sol</code> using the reviewed Foundry project. Upload its local compiler artifact from <code>out/LookeCoinFactory.sol/LookeCoinFactory.json</code>. The source stays on your computer; only your wallet signs the deployment to chain 18881.</p>
 <label>Foundry compiled artifact JSON <input type="file" accept=".json" onChange={e=>void importFactoryArtifact(e.target.files?.[0])}/></label>
 <p><button type="button" disabled={busy||!factoryCode} onClick={()=>void deployFactory()}>Deploy factory using my own Testnet wallet</button></p>
 {deployedFactory&&<p><strong>Factory verified:</strong> <a href={testnetAddressUrl(deployedFactory.address)} target="_blank" rel="noreferrer">{deployedFactory.address}</a>
 <br/>Set <code>NEXT_PUBLIC_LOOKE_FACTORY_ADDRESS</code> = <code>{deployedFactory.address}</code>
 <br/>Set <code>NEXT_PUBLIC_LOOKE_FACTORY_DEPLOY_TX</code> = <code>{deployedFactory.hash}</code></p>}
 </section><p>Need a compatible V2 factory, router, and wrapped Testnet UOS? <Link href="/setup/dex">Deploy the infrastructure through your wallet →</Link></p><hr/><h2>Set up a real V2 liquidity market</h2>
 <form onSubmit={e=>{e.preventDefault();void verify();}}>
 {([[ "V2 factory",factory,setFactory ],[ "V2 router",router,setRouter ],[ "Creator ERC-20 token",base,setBase ],[ "Quote ERC-20 token",quote,setQuote ]] as const).map(([title,value,setValue])=><label key={title}>{title}<input style={inputStyle} value={value} onChange={e=>reset(()=>setValue(e.target.value))} placeholder="0x…" required/></label>)}
 <button disabled={busy}>1. Verify on-chain contracts</button></form>
 {checked&&<section><h2>{checked.symbolA}/{checked.symbolB}</h2><p>Factory <a href={testnetAddressUrl(checked.factory)} target="_blank" rel="noreferrer">View contract</a></p>
 <p>Pair: {checked.pair?<a href={testnetAddressUrl(checked.pair)} target="_blank" rel="noreferrer">{checked.pair}</a>:"Not yet deployed"}</p>
 {!checked.pair?<button disabled={busy} onClick={()=>void createPair()}>2. Create pair with my wallet</button>:<>
 <label>{checked.symbolA} amount<input style={inputStyle} value={a} onChange={e=>setA(e.target.value)}/></label>
 <button disabled={busy} onClick={()=>void approve("base")}>3. Approve {checked.symbolA}</button>
 <label>{checked.symbolB} amount<input style={inputStyle} value={b} onChange={e=>setB(e.target.value)}/></label>
 <button disabled={busy} onClick={()=>void approve("quote")}>4. Approve {checked.symbolB}</button>
 <p><button disabled={busy} onClick={()=>void fund()}>5. Deposit real liquidity with wallet</button></p>
 <label>Market ID<input style={inputStyle} value={marketId} onChange={e=>setMarketId(e.target.value)}/></label>
 <button disabled={busy} onClick={()=>void manifest()}>6. Verify reserves and generate market registry</button>
 </>}</section>}
 {status&&<p role="status">{status}</p>}{tx&&<p>Last transaction: <a href={testnetTxUrl(tx)} target="_blank" rel="noreferrer">{tx}</a></p>}
 {registry&&<section><h2>LOOKE_M4_MARKETS_JSON</h2><textarea readOnly rows={12} style={{width:"100%"}} value={registry}/></section>}
 <p><Link href="/trade">Open trading terminal →</Link></p>
 </main>;
}