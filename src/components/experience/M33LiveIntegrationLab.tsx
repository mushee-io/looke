"use client";
import {useCallback,useEffect,useState} from "react";
import "./m31.css";

type Source={status:string;verified:boolean;latestBlock?:string;irreversibleBlock?:number;
 currentTables?:number;requiredTables?:number};
type M33Info={milestone:"M33";mode:"config"|"live"|"proof";flagsClosed:boolean;
 releaseDecision:"NO_GO";postgresConfigured:boolean;cloudinaryConfigured:boolean;
 evm?:Source;native?:Source;postgres?:Source;hostedMedia?:{status:string;assetVerified:false};
 error?:string;proof?:{kind:string;verified:boolean;network?:string;reference?:string;
 blockOrConfirmations?:number;details?:Record<string,string|number>};};
type Kind="factory"|"coin";
export function M33LiveIntegrationLab(){
 const [result,setResult]=useState<M33Info|null>(null);
 const [proof,setProof]=useState<M33Info|null>(null);
 const [kind,setKind]=useState<Kind>("factory");
 const [address,setAddress]=useState("");
 const [tx,setTx]=useState("");
 const [working,setWorking]=useState<"live"|"proof"|null>(null);
 const [message,setMessage]=useState("Checking protected Preview configuration…");
 const config=useCallback(async()=>{
  try{
   const r=await fetch("/api/experience/m33-live?mode=config",{cache:"no-store",credentials:"same-origin"});
   const x=await r.json() as M33Info;
   if(!r.ok)throw Error(x.error||"Integration console unavailable.");
   setResult(x);setMessage("");
  }catch(e){setMessage(e instanceof Error?e.message:"Configuration unavailable.");}
 },[]);
 useEffect(()=>{void config();},[config]);
 async function runLive(){
  setWorking("live");setMessage("");setProof(null);
  try{
   const r=await fetch("/api/experience/m33-live?mode=live",{cache:"no-store",credentials:"same-origin"});
   const x=await r.json() as M33Info;
   if(!r.ok)throw Error(x.error||"Independent RPC inspection unavailable.");
   setResult(x);
  }catch(e){setMessage(e instanceof Error?e.message:"Live check unavailable.");}
  finally{setWorking(null);}
 }
 async function verify(){
  setWorking("proof");setProof(null);setMessage("");
  try{
   const p=new URLSearchParams({mode:"proof",kind});
   p.set("address",address.trim());p.set("tx",tx.trim());
   const r=await fetch("/api/experience/m33-live?"+p.toString(),
    {cache:"no-store",credentials:"same-origin"});
   const x=await r.json() as M33Info;
   setProof(x);
   if(!r.ok)setMessage(x.error||"No independently verified receipt or owner proof found.");
  }catch(e){setMessage(e instanceof Error?e.message:"Proof lookup failed.");}
  finally{setWorking(null);}
 }
 return <section className="social-card lk-m31">
  <header><small>M33 / REAL INTEGRATIONS · PROTECTED TESTNET</small>
   <h2>Live Ultra proof and integration console</h2>
   <p>Run actual chain-head reads, check current PostgreSQL source compatibility or independently verify exact Ultra EVM factory and creator-coin proofs. No wallet signing, generated trades, migration or public beta.</p>
  </header>
  <div className="lk-m31-metrics">
   <div><small>Launch decision</small><strong>NO-GO</strong></div>
   <div><small>Feature flags</small><strong>{result?.flagsClosed?"Closed":"Not proven closed"}</strong></div>
   <div><small>Current PostgreSQL</small><strong>{result?.postgres?.status||"Not checked"}</strong></div>
   <div><small>Cloudinary</small><strong>{result?.hostedMedia?.status||"Not verified"}</strong></div>
  </div>
  <button type="button" disabled={working!==null||!result?.flagsClosed} onClick={()=>void runLive()}>
   {working==="live"?"Contacting Ultra EVM Testnet…":"Run live RPC + PostgreSQL checks"}
  </button>
  {result?.mode==="live"&&<div className="lk-m31-grid">
   <article><strong>Ultra EVM Testnet · chain 18881</strong>
    <p>{result.evm?.verified?"Live independently confirmed":"No valid current RPC evidence"}.
     {result.evm?.latestBlock?" Observed block: "+result.evm.latestBlock:""}</p></article>
   <article><strong>Actual current social database</strong>
    <p>{result.postgres?.status||"Not checked"}. {result.postgres?.currentTables??0}/19 required tables observed.
    A schema is not an actual creator profile or approved write.</p></article>
   <article><strong>Actual hosted media</strong><p>{result.hostedMedia?.status}.
    An authenticated asset, owner and moderation decision have not been verified by this check.</p></article>
  </div>}
  <h3>Independently verify a real on-chain asset</h3>
  <p>Use actual Ultra EVM factory addresses and transaction hashes. The server checks canonical Testnet receipts instead of accepting a pasted claim.</p>
  <div className="lk-m31-grid">
   <article><strong>Verification type</strong>
    <select aria-label="Asset proof type" value={kind} onChange={e=>{setKind(e.target.value as Kind);setProof(null);}}>
     <option value="factory">EVM factory deployment</option><option value="coin">EVM creator coin creation</option>
    </select></article>
   <article><label>Looke factory address<input aria-label="Looke factory address" value={address}
     onChange={e=>setAddress(e.target.value)} placeholder="0x…" maxLength={42}/></label></article>
   <article><label>{kind==="factory"?"Factory deployment transaction":"Coin creation transaction"}<input
     aria-label="Ultra EVM transaction hash" value={tx} onChange={e=>setTx(e.target.value)}
     placeholder="0x…" maxLength={66}/></label></article>
  </div>
  <button type="button" disabled={working!==null||!result?.flagsClosed} onClick={()=>void verify()}>
   {working==="proof"?"Checking actual on-chain receipt…":"Verify exact Testnet evidence"}
  </button>
  {message&&<p role="status">{message}</p>}
  {proof?.proof&&<div className="lk-m31-grid">
   <article><strong>{proof.proof.verified?"Verified against source":"Not independently verified"}</strong>
    <p>{proof.proof.verified?proof.proof.network+" · "+proof.proof.reference:
     "No proof accepted. No wallet ownership or asset creation claimed."}</p>
    {proof.proof.blockOrConfirmations!==undefined&&
     <p>Confirmations: {proof.proof.blockOrConfirmations}</p>}
    {proof.proof.details&&Object.entries(proof.proof.details).map(([label,value])=>
     <p key={label}>{label}: {String(value)}</p>)}
   </article>
  </div>}
  <p className="lk-m31-warning">M33 cannot certify a person, security auditor, restored backup, moderated upload or public release. Current independent external evidence, human approvals, original Testnet transactions and anti-sybil Points checks must be verified separately. All write controls and public beta stay disabled.</p>
 </section>;
}
