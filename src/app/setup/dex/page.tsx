"use client";
import {useState} from "react";
import Link from "next/link";
import {createPublicClient,encodeDeployData,encodeFunctionData,getAddress,http,isAddress,parseEther,type Abi,type Address,type Hex,type Hash} from "viem";
import {ULTRA_EVM_TESTNET,testnetAddressUrl,testnetTxUrl} from "../../../lib/ultra";
import {v2FactoryAbi,v2RouterAbi,erc20Abi} from "../../../lib/trading";
type Kind="wrapped"|"factory"|"router";
type Artifact={abi:Abi;bytecode:Hex;contractName:string};
type Wallet={request:(args:{method:string;params?:unknown[]})=>Promise<unknown>};
const client=createPublicClient({transport:http(ULTRA_EVM_TESTNET.rpcUrls[0],{timeout:20000})});
const addr=(a:string)=>{if(!isAddress(a)||/^0x0{40}$/i.test(a))throw Error("Nonzero EVM address required.");return getAddress(a);};
function explain(e:unknown){return e instanceof Error?e.message:"Ultra Testnet request failed.";}
async function owner(){const wallet=(window as Window&{ethereum?:Wallet}).ethereum;if(!wallet)throw Error("Install a supported wallet.");
 if(await client.getChainId()!==18881||String(await wallet.request({method:"eth_chainId"})).toLowerCase()!=="0x49c1")throw Error("Connect Ultra EVM Testnet 18881.");
 const accounts=await wallet.request({method:"eth_requestAccounts"}) as string[];return {wallet,address:addr(accounts?.[0]||"")};}
const expected:Record<Kind,{name:string;functions:string[]}>={wrapped:{name:"WETH9",functions:["deposit","withdraw","balanceOf","decimals"]},factory:{name:"UniswapV2Factory",functions:["getPair","createPair","feeToSetter"]},router:{name:"UniswapV2Router02",functions:["addLiquidity","swapExactTokensForTokens","factory","WETH"]}};
export default function DexSetup(){
 const [artifacts,setArtifacts]=useState<Partial<Record<Kind,Artifact>>>({});
 const [wrapped,setWrapped]=useState(""),[factory,setFactory]=useState(""),[router,setRouter]=useState("");
 const [wrapAmount,setWrapAmount]=useState(""),[message,setMessage]=useState(""),[lastTx,setLastTx]=useState("");
 const [busy,setBusy]=useState(false);
 async function load(kind:Kind,file:File|undefined){setMessage("");if(!file)return;
 try{if(file.size>5_000_000)throw Error("Artifact is too large.");
 const item=JSON.parse(await file.text()) as {contractName?:string;abi?:Abi;bytecode?:{object?:string;linkReferences?:Record<string,unknown>}};
 const names=(item.abi||[]).filter(x=>x.type==="function").map(x=>(x as {name:string}).name);
 const bytecode=item.bytecode?.object;
 if(item.contractName&&item.contractName!==expected[kind].name)throw Error("Wrong compiled contract name.");
 if(!expected[kind].functions.every(name=>names.includes(name))||!bytecode||!/^0x(?:[0-9a-fA-F]{2}){150,}$/.test(bytecode)||
 Object.keys(item.bytecode?.linkReferences||{}).length)throw Error("Invalid or linked compiled contract artifact.");
 setArtifacts(old=>({...old,[kind]:{abi:item.abi!,bytecode:bytecode as Hex,contractName:expected[kind].name}}));
 setMessage(expected[kind].name+" artifact parsed locally. Confirm exact official source and compiler settings before signing.");
 }catch(e){setMessage(explain(e));}}
 async function deploy(kind:Kind){const artifact=artifacts[kind];if(!artifact||busy)return;
 setBusy(true);setMessage("");setLastTx("");
 try{
 const {wallet,address}=await owner();
 const args:readonly Address[]=kind==="wrapped"?[]:kind==="factory"?[address]:[addr(factory),addr(wrapped)];
 if(kind==="router"){const f=addr(factory),w=addr(wrapped);if(f===w)throw Error("Wrapped token and factory cannot match.");
 const [fc,wc,feeToSetter,balance]=await Promise.all([
 client.getBytecode({address:f}),client.getBytecode({address:w}),
 client.readContract({address:f,abi:[{type:"function",name:"feeToSetter",stateMutability:"view",inputs:[],outputs:[{type:"address"}]}] as const,functionName:"feeToSetter"}),
 client.readContract({address:w,abi:erc20Abi,functionName:"decimals"})]);
 if(!fc||fc==="0x"||!wc||wc==="0x"||!isAddress(feeToSetter)||balance!==18)throw Error("Factory/wrapped deployment prerequisites unverified.");
 }
 const data=encodeDeployData({abi:artifact.abi,bytecode:artifact.bytecode,args});
 const raw=await wallet.request({method:"eth_sendTransaction",params:[{from:address,data}]});
 if(typeof raw!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(raw))throw Error("No valid wallet-submitted transaction hash.");
 const hash=raw as Hash;setLastTx(hash);
 const receipt=await client.waitForTransactionReceipt({hash,confirmations:2,timeout:120000});
 if(receipt.status!=="success"||receipt.to!==null||!receipt.contractAddress)throw Error("Contract creation not confirmed. Inspect Testnet explorer.");
 const deployed=getAddress(receipt.contractAddress);
 const code=await client.getBytecode({address:deployed});if(!code||code==="0x")throw Error("Runtime code missing after deployment.");
 if(kind==="wrapped"){const [d,s]=await Promise.all([
 client.readContract({address:deployed,abi:erc20Abi,functionName:"decimals"}),
 client.readContract({address:deployed,abi:erc20Abi,functionName:"symbol"})]);
 if(d!==18||!/^[A-Za-z0-9_.-]{2,24}$/.test(s))throw Error("Wrapped ERC20 state verification failed.");
 setWrapped(deployed);
 }
 if(kind==="factory"){const setter=await client.readContract({address:deployed,abi:[{type:"function",name:"feeToSetter",stateMutability:"view",inputs:[],outputs:[{type:"address"}]}] as const,functionName:"feeToSetter"});
 if(getAddress(setter)!==address)throw Error("V2 factory fee controller does not match deploying wallet.");
 setFactory(deployed);
 }
 if(kind==="router"){const [f,w]=await Promise.all([
 client.readContract({address:deployed,abi:v2RouterAbi,functionName:"factory"}),
 client.readContract({address:deployed,abi:[{type:"function",name:"WETH",stateMutability:"view",inputs:[],outputs:[{type:"address"}]}] as const,functionName:"WETH"})]);
 if(getAddress(f)!==addr(factory)||getAddress(w)!==addr(wrapped))throw Error("Router factory/WETH constructor wiring mismatched.");
 setRouter(deployed);
 }
 setMessage(kind+" deployment verified at "+deployed+". Keep the original explorer receipt.");
 }catch(e){setMessage(explain(e));}finally{setBusy(false);}
 }
 async function wrap(){setBusy(true);setMessage("");setLastTx("");try{const {wallet,address}=await owner(),target=addr(wrapped);
 const value=parseEther(wrapAmount);if(value<=0n)throw Error("Enter a positive Testnet UOS amount.");
 const [code,before]=await Promise.all([client.getBytecode({address:target}),client.readContract({address:target,abi:erc20Abi,functionName:"balanceOf",args:[address]})]);
 if(!code||code==="0x")throw Error("Wrapped token not deployed.");
 const data=encodeFunctionData({abi:[{type:"function",name:"deposit",stateMutability:"payable",inputs:[],outputs:[]}] as const,functionName:"deposit"});
 const raw=await wallet.request({method:"eth_sendTransaction",params:[{from:address,to:target,data,value:"0x"+value.toString(16)}]});
 if(typeof raw!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(raw))throw Error("Missing wallet transaction hash.");
 const hash=raw as Hash;setLastTx(hash);
 const receipt=await client.waitForTransactionReceipt({hash,confirmations:2,timeout:120000});
 if(receipt.status!=="success"||!receipt.to||getAddress(receipt.to)!==target)throw Error("Wrap transaction not confirmed.");
 const after=await client.readContract({address:target,abi:erc20Abi,functionName:"balanceOf",args:[address]});
 if(after<before+value)throw Error("Wrapped token balance did not increase as expected.");
 setMessage("User-approved Testnet UOS wrap confirmed. Wrapped ERC20 balance increased.");
 }catch(e){setMessage(explain(e));}finally{setBusy(false);}}
 return <main style={{maxWidth:800,margin:"3rem auto",padding:20,fontFamily:"system-ui",lineHeight:1.7}}>
 <Link href="/setup">← Back to liquidity setup</Link><h1>Deploy Ultra EVM Testnet V2 infrastructure</h1>
 <p>Only chain <strong>18881</strong>. This page accepts locally compiled artifacts for independently reviewed standard WETH9, Uniswap V2 Factory and Router02 contracts. Each deployment requires its own wallet confirmation. Looke never receives your private key.</p>
 <p><strong>Important:</strong> Official V2 periphery uses a specific pair-init-code hash. Compile core, periphery and dependencies at the correct original compiler versions and independently verify the pair hash. Mismatched bytecode can make an apparently deployed router unusable. This tool cannot certify the security of uploaded bytecode.</p>
 {(["wrapped","factory","router"] as Kind[]).map((kind,index)=><section key={kind} style={{borderTop:"1px solid #777",paddingTop:16,marginTop:20}}>
 <h2>{index+1}. {expected[kind].name}</h2>
 <label>Official compiled artifact JSON <input type="file" accept=".json" onChange={e=>void load(kind,e.target.files?.[0])}/></label>
 {kind==="router"&&<p>Verified V2 factory: <input aria-label="V2 factory address" value={factory} onChange={e=>setFactory(e.target.value)} placeholder="0x…" style={{width:"100%"}}/>
 Wrapped token: <input aria-label="wrapped token address" value={wrapped} onChange={e=>setWrapped(e.target.value)} placeholder="0x…" style={{width:"100%"}}/></p>}
 <p><button type="button" disabled={busy||!artifacts[kind]} onClick={()=>void deploy(kind)}>Deploy {expected[kind].name} via my Testnet wallet</button></p>
 </section>)}
 <section><h2>Wrapped Testnet UOS</h2><p>Deposit native Testnet UOS into the verified WETH9-compatible wrapper for ERC20/ERC20 liquidity. Wallet gas and deposit amounts are shown before signature.</p>
 <label>Wrapped token address <input value={wrapped} onChange={e=>setWrapped(e.target.value)} style={{width:"100%"}}/></label>
 <label>Testnet UOS to wrap <input value={wrapAmount} onChange={e=>setWrapAmount(e.target.value)} placeholder="0.1" /></label>
 <p><button disabled={busy} onClick={()=>void wrap()}>Wrap with wallet confirmation</button></p></section>
 <section><h2>Verify addresses and fund real pairs</h2>
 <p>V2 factory: {factory&&isAddress(factory)?<a href={testnetAddressUrl(factory)} target="_blank" rel="noreferrer">{factory}</a>:"Not confirmed"}</p>
 <p>V2 router: {router&&isAddress(router)?<a href={testnetAddressUrl(router)} target="_blank" rel="noreferrer">{router}</a>:"Not confirmed"}</p>
 <p>Wrapped quote ERC-20: {wrapped&&isAddress(wrapped)?<a href={testnetAddressUrl(wrapped)} target="_blank" rel="noreferrer">{wrapped}</a>:"Not confirmed"}</p>
 <p><Link href="/setup">Continue to pair creation and liquidity funding →</Link></p>
 </section>
 {message&&<p role="status">{message}</p>}{lastTx&&<p>Last submitted transaction: <a href={testnetTxUrl(lastTx)} target="_blank" rel="noreferrer">{lastTx}</a></p>}
 </main>;
}