"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {connectUltraEvmWallet} from "../../lib/ultra-evm-wallet";
import {isLookeTestnetChain} from "../../lib/ultra";
import type { BetaReadiness } from "../../lib/beta/readiness";
import "./beta.css";

type WalletProvider = {request:(args:{method:string;params?:unknown[]})=>Promise<unknown>};
type EvidenceType = "factory"|"coin";
type Result = {verified:boolean;readOnly:boolean;proof?:Record<string,unknown>;error?:string};
function wallet(){return typeof window==="undefined"?null:((window as Window&{ethereum?:WalletProvider}).ethereum??null);}
function message(error:unknown){return error instanceof Error?error.message:"Verification unavailable.";}

export default function TestnetBetaPage(){
  const [readiness,setReadiness]=useState<BetaReadiness|null>(null);
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(true);
  const [walletAccount,setWalletAccount]=useState("");
  const [evmNetwork,setEvmNetwork]=useState("");
  const [proofType,setProofType]=useState<EvidenceType>("factory");
  const [factory,setFactory]=useState("");
  const [txHash,setTxHash]=useState("");
  const [checking,setChecking]=useState(false);
  const [proof,setProof]=useState<Result|null>(null);

  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const res=await fetch("/api/beta/readiness",{cache:"no-store"});
      if(!res.ok)throw new Error("Readiness endpoint is unavailable.");
      const data=await res.json() as BetaReadiness;
      setReadiness(data);
      setNotice("");
    }catch(error){setReadiness(null);setNotice(message(error));}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{void refresh();},[refresh]);

  async function checkEvmWallet(){
    setNotice("");
    const injected=wallet();
    if(!injected){setNotice("An injected EVM wallet extension is required.");return;}
    try{
      const account=await connectUltraEvmWallet(injected);
      const chain=String(await injected.request({method:"eth_chainId"}));
      if(!isLookeTestnetChain(chain))throw Error("Ultra EVM Testnet 18881 required.");
      setWalletAccount(account);setEvmNetwork(chain);
      setNotice("Ultra EVM Testnet wallet verified. No wallet transaction or token approval was requested.");
    }catch(error){setWalletAccount("");setEvmNetwork("");setNotice(message(error));}
  }

  async function verifyProof(e:FormEvent){
    e.preventDefault();setChecking(true);setProof(null);setNotice("");
    const params=new URLSearchParams({kind:proofType});
    params.set("address",factory);params.set("tx",txHash);
    try{
      const res=await fetch(`/api/beta/evidence?${params}`,{cache:"no-store"});
      const result=await res.json() as Result;
      setProof(result);
      if(!res.ok || !result.verified)setNotice(result.error||"Evidence could not be verified.");
    }catch(error){setNotice(message(error));}
    finally{setChecking(false);}
  }

  return <main className="beta-shell">
    <header className="beta-header"><Link href="/" className="beta-logo">✳ looke<span>.</span><small> / testnet beta</small></Link>
      <div className="beta-status"><i/> PUBLIC TESTNET ACCESS OPEN</div>
      <button type="button" className="beta-refresh" onClick={()=>void refresh()} disabled={loading}>{loading?"Checking…":"Refresh checks ↻"}</button>
    </header>
    <section className="beta-hero">
      <span className="beta-kicker">M6 / DEPLOYMENT, ACCEPTANCE & SAFETY</span>
      <h1>Explore on Testnet.<br/><em>Verify on-chain.</em></h1>
      <p>Ultra EVM-only Testnet verification. No invented activity, fake wallets or automatic transactions. Public Testnet access is owner-authorized. Technical checks do not establish external security certification.</p>
      <div className="beta-hero-meta"><span>ULTRA EVM · 18881</span><span>ULTRA EVM MAINNET · 19991 (DISABLED)</span><span>STAGING FIRST</span></div>
    </section>
    <div className="beta-layout">
      <section className="beta-left">
        <div className="beta-card">
          <div className="beta-card-title"><div><span className="beta-eyebrow">BETA RELEASE CONTROLS</span><h2>Launch readiness</h2></div>
            <span className="beta-closed">PUBLIC ACCESS GO · AUDIT PENDING</span></div>
          <p className="beta-muted">Technical verification of real sources remains independent of public Testnet visitor access.</p>
          <div className="beta-progress"><span>{readiness?.summary.passed??0} / {readiness?.summary.total??12} verified gates</span>
            <div><span style={{width:`${readiness?readiness.summary.passed/readiness.summary.total*100:0}%`}}/></div></div>
          <div className="beta-gates">{(readiness?.gates||[]).map(item=><div key={item.id} className="beta-gate">
            <span className={item.status==="passed"?"beta-mark pass":"beta-mark"}>{item.status==="passed"?"✓":"×"}</span>
            <div><strong>{item.id.replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase())}</strong><p>{item.detail}</p></div>
            <span className="beta-gate-status">{item.status==="passed"?"Verified":"Blocked"}</span>
          </div>)}</div>
          {readiness?.publicBetaOpen&&<div className="beta-signed">This deployment reports an independently verified and signed Ultra Testnet beta release. Check the individual acceptance evidence before participating.</div>}
          {!readiness?.publicBetaOpen&&<div className="beta-locked">Public Testnet viewing is open by owner authorization. Missing independent evidence remains explicitly unverified; financial execution is not approved.</div>}
        </div>
        <div className="beta-card">
          <div className="beta-card-title"><div><span className="beta-eyebrow">READ-ONLY WALLET ACCEPTANCE</span><h2>Check your Ultra EVM wallet</h2></div><span className="beta-tag">NO SIGNING</span></div>
          <p className="beta-muted">Connect to inspect account and selected network. This check never asks for a financial transaction, NFT operation or approval. Browser-only results are not official operator acceptance evidence.</p>
          <div className="beta-wallets">
            <div><span>Ultra EVM Testnet · EVM extension</span><strong>{walletAccount||"Not connected"}</strong>
              <small>{evmNetwork?isLookeTestnetChain(evmNetwork)?"Network 18881 confirmed in wallet":"Wrong EVM network":"No wallet chain checked"}</small>
              <button type="button" onClick={()=>void checkEvmWallet()}>Check EVM wallet ↗</button></div>
          </div>
        </div>
        <div className="beta-card">
          <div className="beta-card-title"><div><span className="beta-eyebrow">INDEPENDENT CHAIN EVIDENCE</span><h2>Verify a real transaction</h2></div><span className="beta-tag">READ-ONLY RPC</span></div>
          <p className="beta-muted">Supply real Ultra EVM Testnet identifiers. The server checks deployment receipts or creator-token state; it does not create tokens.</p>
          <form className="beta-form" onSubmit={e=>void verifyProof(e)}>
            <label>Evidence type<select value={proofType} onChange={e=>{setProofType(e.target.value as EvidenceType);setProof(null);}}>
              <option value="factory">Ultra EVM factory deployment</option><option value="coin">Wallet-created creator coin</option>
            </select></label>
            <label>Looke EVM factory contract address<input value={factory} onChange={e=>setFactory(e.target.value)} placeholder="0x… factory address" required/></label>
            <label>Genuine Ultra EVM Testnet transaction hash<input value={txHash} onChange={e=>setTxHash(e.target.value)} placeholder="0x… transaction receipt" required/></label>
            <button disabled={checking}>{checking?"Checking actual chain…":"Verify on Testnet ↗"}</button>
          </form>
          {proof?.verified?<div className="beta-proof"><strong>Chain evidence verified</strong><pre>{JSON.stringify(proof.proof,null,2)}</pre></div>:null}
          {proof && !proof.verified?<div className="beta-locked">No verified proof was produced; the attempted verification is not beta acceptance.</div>:null}
        </div>
      </section>
      <aside className="beta-right">
        <div className="beta-side-card"><span className="beta-eyebrow">INTEGRATION STATUS</span><h3>Ultra EVM, one platform.</h3>
          <p>Looke focuses on Ultra EVM Testnet (18881), with Mainnet (19991) reserved for future authorized launch. Social requires PostgreSQL and wallet-authenticated accounts.</p>
          <Link href="/trade">Creator trading terminal ↗</Link><Link href="/social">Looke social network ↗</Link>
        </div>
        <div className="beta-side-card"><span className="beta-eyebrow">RELEASE RULES</span><h3>Nothing goes live by accident.</h3>
          <p>No wallet transaction can be initiated from this dashboard. Production opening requires operator authorization, security review, real evidence and a revision-bound wallet signature.</p>
          <p>Public Testnet Preview access is open; wallet-scoped actions still require authentication and user approval.</p>
        </div>
      </aside>
    </div>
    {notice&&<div className="beta-notice" role="status">{notice}</div>}
    <footer className="beta-footer">LOOKE Ultra EVM · Public Testnet access OPEN · independent security reviews pending · <Link href="/">Back to Looke ↗</Link></footer>
  </main>;
}
