"use client";

import {useState} from "react";
import Link from "next/link";
import {
  createPublicClient, decodeEventLog, encodeDeployData, getAddress, http, isAddress,
  type Abi, type Address, type Hash, type Hex,
} from "viem";
import {ULTRA_EVM_TESTNET, testnetAddressUrl, testnetTxUrl} from "../../../lib/ultra";

const TOTAL = 100_000_000n * 10n ** 18n;
const client = createPublicClient({
  transport: http(ULTRA_EVM_TESTNET.rpcUrls[0], {timeout: 20_000}),
  pollingInterval: 2_000,
});
const tokenAbi = [
  {type:"function",name:"name",stateMutability:"view",inputs:[],outputs:[{type:"string"}]},
  {type:"function",name:"symbol",stateMutability:"view",inputs:[],outputs:[{type:"string"}]},
  {type:"function",name:"decimals",stateMutability:"view",inputs:[],outputs:[{type:"uint8"}]},
  {type:"function",name:"totalSupply",stateMutability:"view",inputs:[],outputs:[{type:"uint256"}]},
  {type:"function",name:"balanceOf",stateMutability:"view",inputs:[{name:"owner",type:"address"}],outputs:[{type:"uint256"}]},
  {type:"event",name:"Transfer",anonymous:false,inputs:[
    {name:"from",type:"address",indexed:true},{name:"to",type:"address",indexed:true},
    {name:"value",type:"uint256",indexed:false},
  ]},
] as const;

type Wallet = {request:(x:{method:string;params?:unknown[]})=>Promise<unknown>};
type Artifact = {abi:Abi;bytecode:Hex};
type Proof = {address:Address;hash:Hash;treasury:Address;block:string};
const message = (error:unknown):string=>error instanceof Error?error.message:"Ultra Testnet transaction failed.";

function safeAddress(value:string):Address{
 if(!isAddress(value)||/^0x0{40}$/i.test(value))throw Error("A nonzero EVM address is required.");
 return getAddress(value);
}
function injected():Wallet {
 const wallet=(window as Window & {ethereum?:Wallet}).ethereum;
 if(!wallet)throw Error("Connect an injected EVM wallet such as MetaMask.");
 return wallet;
}
async function walletOnTestnet():Promise<{wallet:Wallet;account:Address}>{
 const wallet=injected();
 const chain=await client.getChainId();
 if(chain!==18881)throw Error("The RPC is not Ultra EVM Testnet 18881.");
 const walletChain=String(await wallet.request({method:"eth_chainId"})).toLowerCase();
 if(walletChain!=="0x49c1")throw Error("Switch the wallet to Ultra EVM Testnet 18881.");
 const accounts=await wallet.request({method:"eth_requestAccounts"}) as string[];
 const account=safeAddress(accounts?.[0]||"");
 const current=await wallet.request({method:"eth_accounts"}) as string[];
 if(!current?.[0]||safeAddress(current[0])!==account)throw Error("Wallet account changed.");
 return {wallet,account};
}
async function verifyOriginalDeployment(address:Address,hash:Hash,treasury:Address,expectedData?:Hex):Promise<Proof>{
 if(await client.getChainId()!==18881)throw Error("Verification RPC must be Ultra EVM Testnet 18881.");
 const receipt=await client.getTransactionReceipt({hash});
 if(receipt.status!=="success"||receipt.to!==null||!receipt.contractAddress||
    getAddress(receipt.contractAddress)!==address)
   throw Error("This is not the original successful deployment receipt for the given contract.");
 const [code,tx,head]=await Promise.all([
   client.getBytecode({address}),client.getTransaction({hash}),client.getBlockNumber(),
 ]);
 if(!code||code==="0x")throw Error("Contract runtime bytecode is missing.");
 if(tx.to!==null)throw Error("The source transaction was not contract creation.");
 if(expectedData&&tx.input.toLowerCase()!==expectedData.toLowerCase())
   throw Error("Original transaction bytecode/constructor differs from the approved artifact.");
 if(head<receipt.blockNumber+1n)throw Error("Await two Testnet confirmations.");
 const [name,symbol,decimals,supply,recipientBalance]=await Promise.all([
   client.readContract({address,abi:tokenAbi,functionName:"name"}),
   client.readContract({address,abi:tokenAbi,functionName:"symbol"}),
   client.readContract({address,abi:tokenAbi,functionName:"decimals"}),
   client.readContract({address,abi:tokenAbi,functionName:"totalSupply"}),
   client.readContract({address,abi:tokenAbi,functionName:"balanceOf",args:[treasury]}),
 ]);
 if(name!=="Looke"||symbol!=="LOOKE"||decimals!==18||supply!==TOTAL)
   throw Error("Wrong name, symbol, decimals or total supply; not the official 100M LOOKE contract.");
 // At creation, one Transfer from zero to the selected treasury must allocate
 // exactly 100M. This remains true even after legitimate later transfers.
 let initialMints=0;
 for(const log of receipt.logs){
  if(getAddress(log.address)!==address)continue;
  try{
   const event=decodeEventLog({abi:tokenAbi,eventName:"Transfer",topics:log.topics,data:log.data,strict:true});
   if(event.eventName==="Transfer"&&event.args.from==="0x0000000000000000000000000000000000000000"){
    if(getAddress(event.args.to)!==treasury||event.args.value!==TOTAL)
      throw Error("Initial supply emitted to a different treasury or amount.");
    initialMints++;
   }
  }catch(error){
   if(error instanceof Error&&error.message.startsWith("Initial supply emitted"))throw error;
  }
 }
 if(initialMints!==1)throw Error("Expected one and only one original 100M LOOKE mint event.");
 // The initial recipient owns all supply immediately after deployment.
 // This condition can change after transfers, so do not require it when
 // inspecting an older deployment from the explorer.
 return {address,hash,treasury,block:receipt.blockNumber.toString()};
}

export default function OfficialLookeDeployment(){
 const [artifact,setArtifact]=useState<Artifact|null>(null);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [proof,setProof]=useState<Proof|null>(null);
 const [broadcastHash,setBroadcastHash]=useState<Hash|null>(null);
 const [connected,setConnected]=useState<Address|null>(null);
 const [selectedTreasury,setSelectedTreasury]=useState("");
 const [confirmIntent,setConfirmIntent]=useState(false);

 async function connect(){
  setBusy(true);setStatus("");
  try{
   const {account}=await walletOnTestnet();
   setConnected(account);setSelectedTreasury(account);
   setStatus("Wallet connected on Ultra EVM Testnet 18881. Verify the token source and artifact before deployment.");
  }catch(e){setStatus(message(e));}finally{setBusy(false);}
 }
 async function load(file:File|undefined){
  setArtifact(null);setProof(null);setConfirmIntent(false);
  if(!file)return;
  try{
   if(file.size>5_000_000)throw Error("Compiled artifact unexpectedly large.");
   const parsed=JSON.parse(await file.text()) as {
     contractName?:string;abi?:Abi;bytecode?:{object?:string;linkReferences?:Record<string,unknown>}
   };
   const names=(parsed.abi||[]).filter(x=>x.type==="function").map(x=>(x as {name:string}).name);
   const data=parsed.bytecode?.object;
   if(parsed.contractName&&parsed.contractName!=="LookeEcosystemToken")
     throw Error("Expected the LookeEcosystemToken compiled artifact.");
   if(!["name","symbol","decimals","totalSupply","balanceOf","transfer","approve","transferFrom"].every(x=>names.includes(x)))
     throw Error("The compiled artifact is not the expected fixed-supply ERC-20 interface.");
   if(!data||!/^0x(?:[0-9a-fA-F]{2}){150,}$/.test(data)||
      Object.keys(parsed.bytecode?.linkReferences||{}).length)
     throw Error("Invalid, empty or linked creation bytecode. Compile reviewed source with Foundry.");
   const constructor=(parsed.abi||[]).find(x=>x.type==="constructor") as {inputs?:Array<{type:string}>}|undefined;
   if(!constructor||constructor.inputs?.length!==1||constructor.inputs[0].type!=="address")
     throw Error("The official token constructor must accept only one treasury address.");
   if(names.some(x=>["mint","burn","pause","blacklist","setTax","upgradeTo","owner"].includes(x)))
     throw Error("Unexpected issuance or privileged method in this artifact.");
   setArtifact({abi:parsed.abi!,bytecode:data as Hex});
   setStatus("Artifact parsed locally. Verify it was compiled from the reviewed LookeEcosystemToken.sol source.");
  }catch(e){setStatus(message(e));}
 }
 async function deploy(){
  if(!artifact||!confirmIntent||busy)return;
  setBusy(true);setProof(null);setBroadcastHash(null);setStatus("");
  try{
   const {wallet,account}=await walletOnTestnet();
   if(!connected||account!==connected)throw Error("Wallet account changed since review. Reconnect.");
   const treasury=safeAddress(selectedTreasury);
   if(treasury!==account)throw Error("For this Testnet flow the initial 100M LOOKE recipient must be the connected wallet.");
   const data=encodeDeployData({abi:artifact.abi,bytecode:artifact.bytecode,args:[treasury]});
   const chainNow=await wallet.request({method:"eth_chainId"});
   if(String(chainNow).toLowerCase()!=="0x49c1")throw Error("Wallet switched off Ultra EVM Testnet.");
   const raw=await wallet.request({method:"eth_sendTransaction",params:[{from:account,data}]});
   if(typeof raw!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(raw))
     throw Error("Wallet did not submit a valid deployment transaction hash.");
   const hash=raw as Hash;
   setBroadcastHash(hash);
   setStatus("Deployment submitted. Checking two confirmations, original bytecode and fixed 100M supply.");
   const receipt=await client.waitForTransactionReceipt({hash,confirmations:2,timeout:120_000});
   if(receipt.status!=="success"||receipt.to!==null||!receipt.contractAddress)
     throw Error("Deployment reverted or receipt is not contract creation.");
   const address=getAddress(receipt.contractAddress);
   const verified=await verifyOriginalDeployment(address,hash,treasury,data);
   const balance=await client.readContract({address,abi:tokenAbi,functionName:"balanceOf",args:[treasury]});
   if(balance!==TOTAL)throw Error("Initial recipient did not receive exactly 100 million LOOKE.");
   setProof(verified);
   setStatus("Verified: 100,000,000 LOOKE minted exactly once to your Ultra Testnet wallet.");
  }catch(e){setStatus(broadcastHash?"Deployment was submitted; do not retry before checking the original explorer receipt. "+message(e):message(e));}
  finally{setBusy(false);}
 }
 return <main style={{maxWidth:800,margin:"3rem auto",padding:"0 20px 48px",fontFamily:"system-ui",lineHeight:1.65}}>
  <Link href="/setup">← Ultra Testnet setup</Link>
  <h1>Deploy official LOOKE token</h1>
  <p>Official ecosystem token, separate from creator tokens. This screen is restricted to <strong>Ultra EVM Testnet — 18881</strong>.</p>
  <section style={{border:"1px solid #888",borderRadius:12,padding:18}}>
   <h2>Fixed token parameters</h2>
   <p><strong>Name:</strong> Looke<br/><strong>Symbol:</strong> LOOKE<br/><strong>Decimals:</strong> 18<br/><strong>Initial and maximum supply:</strong> 100,000,000 LOOKE</p>
   <p>All 100 million units are initially allocated to your connected Testnet wallet. No future mint, administrator, tax, blacklist or pausing functionality exists.</p>
  </section>
  <h2>1. Connect Ultra Testnet wallet</h2>
  <button disabled={busy} onClick={()=>void connect()}>{connected?"Reconnect / verify wallet":"Connect wallet on chain 18881"}</button>
  {connected&&<p>Connected: <code>{connected}</code></p>}
  <h2>2. Compile and review the official contract</h2>
  <p>Use the repository source <code>contracts/LookeEcosystemToken.sol</code>, Solidity 0.8.24 and optimizer 200. Run <code>forge build</code> locally and select <code>out/LookeEcosystemToken.sol/LookeEcosystemToken.json</code>. The artifact is read in your browser; it is not uploaded to a server.</p>
  <label>Compiled contract artifact <input type="file" accept=".json" onChange={e=>void load(e.target.files?.[0])}/></label>
  <p>{artifact?"Artifact ready for source review.":"A reviewed compiled artifact is required."}</p>
  <h2>3. Review treasury and submit through your wallet</h2>
  <label>Initial treasury recipient (connected wallet only)
   <input style={{width:"100%",display:"block",padding:10}} value={selectedTreasury} onChange={e=>{setSelectedTreasury(e.target.value);setConfirmIntent(false);}} placeholder="0x…"/>
  </label>
  <label style={{display:"block",marginTop:15}}><input type="checkbox" checked={confirmIntent} onChange={e=>setConfirmIntent(e.target.checked)}/> I authorize ONE Testnet deployment of the official LOOKE fixed-supply token to my selected wallet and will inspect the wallet transaction before signing.</label>
  <p><button disabled={!artifact||!connected||busy||!confirmIntent||Boolean(proof)} onClick={()=>void deploy()}>
   {busy?"Checking wallet and chain…":"Deploy 100 million LOOKE (wallet approval)"}
  </button></p>
  {status&&<p role="status">{status}</p>}
  {broadcastHash&&<p>Submitted transaction: <a href={testnetTxUrl(broadcastHash)} target="_blank" rel="noreferrer">{broadcastHash}</a></p>}
  {proof&&<section style={{border:"1px solid #888",borderRadius:12,padding:18}}>
   <h2>Verified Testnet deployment</h2>
   <p>LOOKE token: <a href={testnetAddressUrl(proof.address)} target="_blank" rel="noreferrer">{proof.address}</a></p>
   <p>Original transaction: <a href={testnetTxUrl(proof.hash)} target="_blank" rel="noreferrer">{proof.hash}</a></p>
   <p>Treasury: <code>{proof.treasury}</code></p>
   <p>Deployment block: {proof.block}</p>
   <p>To use LOOKE as a quote token or community asset, configure its verified address separately. No pool or liquidity is created by this token deployment.</p>
  </section>}
  <p><Link href="/setup">Create and fund an actual V2 market after deployment →</Link></p>
 </main>;
