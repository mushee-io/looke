"use client";

import {useEffect,useState,type ChangeEvent} from "react";
import Link from "next/link";
import {formatEther,isAddress} from "viem";
import {createUltraPublicClient} from "../../lib/verification";
import {shortAddress,ULTRA_EVM_TESTNET} from "../../lib/ultra";
import {validateQuickTokenDraft} from "../../lib/experience/validation";

export type CoinQuickDraft={name:string;symbol:string;pair:"ULTRA"|"LOOKE"};
type OverlayCommon={onClose:()=>void};
function useEscape(onClose:()=>void){
  useEffect(()=>{function close(e:KeyboardEvent){if(e.key==="Escape")onClose();}
    window.addEventListener("keydown",close);
    return ()=>window.removeEventListener("keydown",close);
  },[onClose]);
}
export function CreateCoinModal({onClose,onReview}:{onReview:(coin:CoinQuickDraft)=>void}&OverlayCommon){
  const [mode,setMode]=useState<"Pair"|"Post"|"Text"|"AI">("Pair");
  const [name,setName]=useState("");
  const [symbol,setSymbol]=useState("");
  const [pair,setPair]=useState<"LOOKE"|"ULTRA">("ULTRA");
  const [imageUrl,setImageUrl]=useState("");
  const [error,setError]=useState("");
  useEscape(onClose);
  useEffect(()=>()=>{if(imageUrl)URL.revokeObjectURL(imageUrl);},[imageUrl]);
  function selectImage(e:ChangeEvent<HTMLInputElement>){
    const image=e.target.files?.[0];
    if(!image)return;
    if(!["image/jpeg","image/png","image/gif"].includes(image.type)||image.size>5_000_000){
      setError("Upload a PNG, JPEG or GIF smaller than 5 MB.");return;
    }
    setError("");setImageUrl(URL.createObjectURL(image));
  }
  function submit(){
    try{setError("");onReview(validateQuickTokenDraft(name,symbol,pair));}
    catch(error){setError(error instanceof Error?error.message:"Invalid token draft.");}
  }
  return <div className="lk-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="lk-create-modal" role="dialog" aria-modal="true" aria-label="Create on Looke">
      <button className="lk-modal-x" type="button" aria-label="Close create dialog" onClick={onClose}>×</button>
      <div className="lk-create-tabs" role="tablist" aria-label="Creation type">
        {(["Pair","Post","Text","AI"] as const).map(t=><button key={t} type="button" role="tab" aria-selected={mode===t}
          className={mode===t?"lk-create-tab active":"lk-create-tab"} onClick={()=>setMode(t)}>
          {t}{t==="Pair"&&<sup>NEW</sup>}</button>)}
      </div>
      {mode==="Pair"?<div className="lk-create-body">
        <div className="lk-create-field"><label htmlFor="lk-image">TOKEN IMAGE</label>
          <div className="lk-image-picker">
            <label className="lk-image-uploader" htmlFor="lk-image">{imageUrl?
              /* Blob preview is browser-local and never uploaded to the server. */
              <img src={imageUrl} alt="Your selected token preview"/>:
              <span aria-hidden="true">↥</span>}</label>
            <input id="lk-image" type="file" accept="image/png,image/jpeg,image/gif" onChange={selectImage}/>
            <span>PNG, JPEG or GIF · preview only, maximum 5 MB</span>
          </div>
        </div>
        <label className="lk-create-field" htmlFor="lk-symbol"><span>TICKER</span>
          <input id="lk-symbol" placeholder="$Ticker" maxLength={12} value={symbol}
            onChange={e=>setSymbol(e.target.value)} autoComplete="off"/></label>
        <label className="lk-create-field" htmlFor="lk-name"><span>NAME</span>
          <input id="lk-name" placeholder="Name" maxLength={64} value={name}
            onChange={e=>setName(e.target.value)} autoComplete="off"/></label>
        <div className="lk-create-field"><label>PAIR WITH</label>
          <div className="lk-pair-search"><span aria-hidden="true">⌕</span> Choose a Looke-supported pair</div>
          <div className="lk-pair-options" role="group" aria-label="Choose token pairing">
            {(["ULTRA","LOOKE"] as const).map(token=><button key={token} type="button"
              onClick={()=>setPair(token)} aria-pressed={pair===token}
              className={pair===token?"lk-pair active":"lk-pair"}>
              <span className={"lk-pair-icon "+token.toLowerCase()}>{token==="ULTRA"?"◆":"L"}</span>
              {token==="ULTRA"?"$ULTRA":"$LOOKE"} {pair===token?"✓":""}</button>)}
          </div>
        </div>
        {error&&<p className="lk-error" role="alert">{error}</p>}
        <p className="lk-note">Only ULTRA or LOOKE may be selected. Pair liquidity and token contracts have not been approved for execution. A local image is not uploaded or minted.</p>
        <button type="button" className="lk-wide-action" onClick={submit}>Review token draft <span>↗</span></button>
      </div>:<div className="lk-creation-alternate">
        <span className="lk-alternate-glyph">{mode==="AI"?"✧":"✎"}</span>
        <h3>{mode==="AI"?"AI creation is not activated":mode==="Post"?"Share a creator post":"Write something worth sharing"}</h3>
        <p>{mode==="AI"?"We'll enable this only with a reviewed model integration. No generated content is claimed.":"Open the existing Looke social composer to prepare a public post. Publishing still requires an authenticated account and enabled social writes."}</p>
        {mode==="AI"?<button disabled type="button" className="lk-wide-action">Unavailable</button>:
          <Link href="/social" className="lk-wide-action" onClick={onClose}>Go to post editor ↗</Link>}
      </div>}
    </section>
  </div>;
}

type WalletAction="none"|"deposit"|"send"|"receive";
export function WalletModal({address,onClose,onConnect,onTrade,correctNetwork}:{
  address:string;onClose:()=>void;onConnect:()=>void;onTrade:()=>void;correctNetwork:boolean;
}){
  const [tab,setTab]=useState<"Holdings"|"Tokens"|"Activity">("Holdings");
  const [action,setAction]=useState<WalletAction>("none");
  const [balance,setBalance]=useState<string|null>(null);
  const [balanceStatus,setBalanceStatus]=useState("Loading actual Ultra Testnet balance…");
  const [copyStatus,setCopyStatus]=useState("");
  useEscape(onClose);
  useEffect(()=>{
    let alive=true;
    if(!isAddress(address)||!correctNetwork){setBalance(null);setBalanceStatus("Connect an Ultra EVM Testnet wallet.");return;}
    const client=createUltraPublicClient();
    void Promise.all([client.getChainId(),client.getBalance({address:address as `0x${string}`})])
      .then(([chain,raw])=>{
        if(!alive)return;
        if(chain!==ULTRA_EVM_TESTNET.chainId)throw new Error("Wrong network.");
        setBalance(formatEther(raw));setBalanceStatus("");
      }).catch(()=>{if(alive){setBalance(null);setBalanceStatus("Verified balance is currently unavailable.");}});
    return ()=>{alive=false;};
  },[address,correctNetwork]);
  async function copyAddress(){
    if(!isAddress(address))return;
    try{await navigator.clipboard.writeText(address);setCopyStatus("Copied wallet address");}
    catch{setCopyStatus("Clipboard unavailable. Select your address instead.");}
  }
  return <div className="lk-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="lk-wallet-modal" role="dialog" aria-modal="true" aria-label="Looke wallet">
      <div className="lk-wallet-title"><strong>looke<span>.</span></strong>
        <button type="button" aria-label="Close wallet" onClick={onClose}>×</button></div>
      <div className="lk-wallet-account"><div>
        <strong>{address?shortAddress(address):"Wallet not connected"}</strong>
        <button className="lk-address-copy" type="button" onClick={()=>void copyAddress()} disabled={!isAddress(address)}>
          {address?shortAddress(address):"Connect to continue"} ⧉</button>
        </div><span className="lk-profile-avatar">◉</span></div>
      <p className="lk-wallet-value-caption">Estimated wallet value</p>
      <div className="lk-wallet-value">— <small>USD</small></div>
      <p className="lk-wallet-fiat-note">No verified USD price feed configured. Wallet value is not estimated.</p>
      {!correctNetwork&&address&&<div className="lk-wallet-alert">Switch to Ultra EVM Testnet (18881).
        <button type="button" onClick={onConnect}>Switch network</button></div>}
      <div className="lk-wallet-actions">
        {([["deposit","＋","Deposit"],["swap","⇄","Swap"],["send","↗","Send"],["receive","↓","Receive"]] as const)
          .map(([key,glyph,label])=><button key={key} type="button"
            onClick={()=>{if(key==="swap"){onTrade();return;}setAction(key);}}
            disabled={!address&&key!=="deposit"}><span>{glyph}</span>{label}</button>)}
      </div>
      {action!=="none"&&<div className="lk-wallet-action-detail">
        {action==="send"?
          <p>Sending is not enabled here until a reviewed, wallet-approved transfer flow is implemented. No transaction has been prepared.</p>:
          <><p>{action==="receive"?"Receive Ultra Testnet assets to your verified wallet address.":"Use the official Ultra Testnet faucet or transfer test assets to your wallet. Verify the chain before sending."}</p>
            {address&&<button className="lk-wallet-address" onClick={()=>void copyAddress()} type="button">{address} ⧉</button>}</>}
      </div>}
      {copyStatus&&<div className="lk-copy-status" role="status">{copyStatus}</div>}
      <div className="lk-wallet-tabs" role="tablist" aria-label="Wallet details">
        {(["Holdings","Tokens","Activity"] as const).map(t=><button key={t} type="button"
          role="tab" aria-selected={tab===t} className={tab===t?"active":""}
          onClick={()=>setTab(t)}>{t}</button>)}
      </div>
      <div className="lk-wallet-tab-body">
        {tab==="Holdings"&&<><div className="lk-wallet-balances-heading"><strong>Balances</strong><span>Ultra EVM Testnet</span></div>
          <div className="lk-wallet-asset"><span className="lk-pair-icon ultra">◆</span><div><strong>ULTRA (UOS)</strong><small>Ultra EVM gas asset</small></div>
            <strong>{balance===null?"—":Number(balance).toLocaleString("en-US",{maximumFractionDigits:6})}</strong></div>
          {balanceStatus&&<p className="lk-wallet-fiat-note">{balanceStatus}</p>}</>}
        {tab==="Tokens"&&<div className="lk-wallet-blank"><strong>Verified token holdings</strong><p>No independently indexed ERC-20 token balances yet. Ultra EVM UOS is visible in Holdings.</p></div>}
        {tab==="Activity"&&<div className="lk-wallet-blank"><strong>Verified wallet activity</strong><p>Transaction history indexing has not been activated. No example trades or transfers are displayed.</p></div>}
      </div>
    </section>
  </div>;
}
