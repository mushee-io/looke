"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  createPublicClient, encodeFunctionData, formatUnits, getAddress, http, isAddress,
  type Address, type Hash,
} from "viem";
import {
  erc20Abi, exactAmount, QUOTE_MAX_AGE_MS, validateSlippage, verifySwapReceipt, v2RouterAbi,
  type Candle, type MarketConfig, type MarketSnapshot, type SwapActivity, type SwapQuote,
} from "../../lib/trading";
import { ULTRA_EVM_TESTNET, shortAddress, testnetTxUrl } from "../../lib/ultra";
import "./trade.css";

type Provider = {
  request: (args: {method:string;params?:unknown[]})=>Promise<unknown>;
  on?: (event:string,listener:(...args:unknown[])=>void)=>void;
  removeListener?: (event:string,listener:(...args:unknown[])=>void)=>void;
};
type MarketList = {markets:MarketSnapshot[];errors:{id:string;reason:string}[];executionEnabled:boolean};
type Activity = {
  observedSwapCount:number;observedQuoteVolume:string;partial:boolean;
  candles:Candle[];swaps:SwapActivity[];fromBlock:string;throughBlock:string;notice:string;
};
type Portfolio = {
  account: string;blockNumber:string;
  base: {symbol:string;balance:string;allowance:string};
  quote: {symbol:string;balance:string;allowance:string};
};
function provider():Provider|null {
  if(typeof window==="undefined")return null;
  return (window as Window & {ethereum?:Provider}).ethereum ?? null;
}
function humanError(error:unknown):string {return error instanceof Error?error.message:"Request failed. Review the wallet and RPC.";}
async function readApi<T>(params:Record<string,string>):Promise<T>{
  const res=await fetch(`/api/trade?${new URLSearchParams(params).toString()}`,{cache:"no-store"});
  const data=await res.json() as {error?:string}&T;
  if(!res.ok)throw new Error(data.error||"Market read failed.");
  return data;
}
const client=createPublicClient({transport:http(ULTRA_EVM_TESTNET.rpcUrls[0],{timeout:20_000}),pollingInterval:2000});
async function requireWalletOnTestnet(wallet:Provider, expected: string):Promise<Address>{
  const chain=String(await wallet.request({method:"eth_chainId"}));
  if(chain.toLowerCase()!==ULTRA_EVM_TESTNET.chainIdHex)throw new Error("Switch your wallet to Ultra EVM Testnet (18881).");
  const accounts=await wallet.request({method:"eth_accounts"}) as string[];
  if(!accounts?.[0]||!isAddress(accounts[0])||getAddress(accounts[0])!==getAddress(expected))throw new Error("Connected wallet changed. Reconnect and review again.");
  const rpcChain=await client.getChainId();
  if(rpcChain!==18881)throw new Error("Public RPC is not on Ultra EVM Testnet.");
  return getAddress(accounts[0]);
}

function CandleChart({candles,quoteSymbol}:{candles:Candle[];quoteSymbol:string}) {
  if(!candles.length)return <div className="trade-chart-empty"><span>◇</span><strong>No verified trades in the scanned window</strong><p>Actual on-chain Swap events will produce candles. Prices and volume are never simulated.</p></div>;
  const size={width:840,height:280};
  const min=Math.min(...candles.map(c=>c.low));
  const max=Math.max(...candles.map(c=>c.high));
  const floor=min*0.995,ceil=max*1.005;
  const y=(price:number)=>20+((ceil-price)/(ceil-floor||1))*228;
  const dx=size.width/Math.max(candles.length,8);
  return <div className="trade-chart-canvas">
    <svg role="img" aria-label={`Verified on-chain candle price chart, ${quoteSymbol} per creator token`} viewBox="0 0 840 280" preserveAspectRatio="none">
      {[0,1,2,3,4].map(i=><line key={i} x1={0} x2={840} y1={20+i*57} y2={20+i*57} stroke="#293044" strokeWidth="1"/>)}
      {candles.map((c,i)=>{
        const x=(i+.5)*dx,top=y(Math.max(c.open,c.close)),bottom=y(Math.min(c.open,c.close));
        const green=c.close>=c.open;
        return <g key={c.start}>
          <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={green?"#43d5a5":"#fa7081"} strokeWidth="2"/>
          <rect x={x-Math.min(dx*.29,12)} y={top} width={Math.min(dx*.58,24)} height={Math.max(2,bottom-top)} rx="1.5" fill={green?"#43d5a5":"#fa7081"}/>
        </g>;
      })}
    </svg>
    <div className="trade-chart-axis"><span>{new Date(candles[0].start*1000).toLocaleTimeString()}</span><span>Last confirmed candle: {new Date(candles[candles.length-1].start*1000).toLocaleTimeString()}</span><span>Price in {quoteSymbol}</span></div>
  </div>;
}

export default function TradePage(){
  const [markets,setMarkets]=useState<MarketList>({markets:[],errors:[],executionEnabled:false});
  const [marketId,setMarketId]=useState("");
  const [loading,setLoading]=useState(true);
  const [activity,setActivity]=useState<Activity|null>(null);
  const [portfolio,setPortfolio]=useState<Portfolio|null>(null);
  const [address,setAddress]=useState("");
  const [chain,setChain]=useState("");
  const [direction,setDirection]=useState<"buy"|"sell">("buy");
  const [amount,setAmount]=useState("");
  const [slippage,setSlippage]=useState(50);
  const [interval,setIntervalValue]=useState(900);
  const [quote,setQuote]=useState<SwapQuote|null>(null);
  const [status,setStatus]=useState("");
  const [txHash,setTxHash]=useState("");
  const [txVerified,setTxVerified]=useState(false);
  const [actualOut,setActualOut]=useState("");
  const [busy,setBusy]=useState(false);
  const [showBalances,setShowBalances]=useState(true);
  const chosen=markets.markets.find(m=>m.id===marketId);
  const accountReady=address&&chain===ULTRA_EVM_TESTNET.chainIdHex;
  const executionReady=Boolean(markets.executionEnabled&&chosen);
  const quoteFresh=Boolean(quote&&Date.now()-quote.quotedAt<QUOTE_MAX_AGE_MS);
  const reviewed=Boolean(quote&&quoteFresh&&executionReady&&accountReady&&!busy);

  const refreshMarkets=useCallback(async()=>{
    setLoading(true);
    try{
      const result=await readApi<MarketList>({kind:"markets"});
      setMarkets(result);
      setMarketId(current=>result.markets.some(m=>m.id===current)?current:(result.markets[0]?.id||""));
    }catch(error){setStatus(humanError(error));setMarkets({markets:[],errors:[],executionEnabled:false});}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{void refreshMarkets();},[refreshMarkets]);

  useEffect(()=>{
    const wallet=provider();
    if(!wallet)return;
    const accounts=(v:unknown)=>setAddress(Array.isArray(v)&&typeof v[0]==="string"?v[0]:"");
    const network=(v:unknown)=>setChain(String(v??"").toLowerCase());
    const accountListener=(...v:unknown[])=>{accounts(v[0]);setQuote(null);};
    const chainListener=(...v:unknown[])=>{network(v[0]);setQuote(null);};
    void wallet.request({method:"eth_accounts"}).then(accounts).catch(()=>{});
    void wallet.request({method:"eth_chainId"}).then(network).catch(()=>{});
    wallet.on?.("accountsChanged",accountListener);
    wallet.on?.("chainChanged",chainListener);
    return ()=>{wallet.removeListener?.("accountsChanged",accountListener);wallet.removeListener?.("chainChanged",chainListener);};
  },[]);

  const refreshActivity=useCallback(async()=>{
    if(!marketId){setActivity(null);return;}
    try{
      const result=await readApi<Activity>({kind:"activity",market:marketId,interval:String(interval)});
      setActivity(result);
    }catch(error){setActivity(null);setStatus(humanError(error));}
  },[marketId,interval]);

  const refreshPortfolio=useCallback(async()=>{
    if(!marketId||!accountReady){setPortfolio(null);return;}
    try{
      const result=await readApi<Portfolio>({kind:"portfolio",market:marketId,account:address});
      setPortfolio(result);
    }catch(error){setPortfolio(null);setStatus(humanError(error));}
  },[marketId,address,accountReady]);

  useEffect(()=>{
    void refreshActivity();
    const tick=setInterval(()=>{void refreshActivity();},30_000);
    return ()=>clearInterval(tick);
  },[refreshActivity]);
  useEffect(()=>{void refreshPortfolio();},[refreshPortfolio]);

  async function connect(){
    const wallet=provider();
    if(!wallet){setStatus("Install an injected EVM wallet such as MetaMask.");return;}
    setBusy(true);setStatus("");
    try{
      const acc=await wallet.request({method:"eth_requestAccounts"}) as string[];
      if(!acc?.[0]||!isAddress(acc[0]))throw new Error("Wallet did not provide a valid account.");
      let network=String(await wallet.request({method:"eth_chainId"})).toLowerCase();
      if(network!==ULTRA_EVM_TESTNET.chainIdHex){
        try{await wallet.request({method:"wallet_switchEthereumChain",params:[{chainId:ULTRA_EVM_TESTNET.chainIdHex}]});}
        catch(error){
          if((error as {code?:number})?.code!==4902)throw error;
          await wallet.request({method:"wallet_addEthereumChain",params:[{
            chainId:ULTRA_EVM_TESTNET.chainIdHex,chainName:ULTRA_EVM_TESTNET.chainName,
            rpcUrls:[...ULTRA_EVM_TESTNET.rpcUrls],nativeCurrency:ULTRA_EVM_TESTNET.nativeCurrency,
          }]});
        }
        network=String(await wallet.request({method:"eth_chainId"})).toLowerCase();
      }
      if(network!==ULTRA_EVM_TESTNET.chainIdHex)throw new Error("Switch to Ultra EVM Testnet.");
      setAddress(getAddress(acc[0]));setChain(network);setQuote(null);
    }catch(error){setStatus(humanError(error));}
    finally{setBusy(false);}
  }

  function updateTrade(fn:()=>void){
    fn();setQuote(null);setTxHash("");setTxVerified(false);setActualOut("");setStatus("");
  }

  async function reviewTrade(){
    if(!chosen||!executionReady||!accountReady)return;
    setBusy(true);setStatus("");setQuote(null);setTxHash("");setTxVerified(false);
    try{
      exactAmount(amount,direction==="buy"?chosen.quoteDecimals:chosen.baseDecimals);
      const slippageBps=validateSlippage(slippage);
      const wallet=provider();
      if(!wallet)throw new Error("Wallet not found.");
      await requireWalletOnTestnet(wallet,address);
      const result=await readApi<SwapQuote>({kind:"quote",market:chosen.id,direction,amount,slippageBps:String(slippageBps)});
      if(result.market.router!==chosen.router||result.market.pair!==chosen.pair ||
         result.direction!==direction||result.inputAmount!==amount)throw new Error("Quote does not match the selected market and draft.");
      setQuote(result);setStatus("Quote fetched from the verified router. It expires in 25 seconds. Wallet approval is a separate action.");
      void refreshPortfolio();
    }catch(error){setStatus(humanError(error));}
    finally{setBusy(false);}
  }

  async function approveTokens(){
    if(!reviewed||!quote)return;
    const wallet=provider();
    if(!wallet)return;
    setBusy(true);setStatus("");
    let hash:Hash|undefined;
    try{
      const signer=await requireWalletOnTestnet(wallet,address);
      if(Date.now()-quote.quotedAt>QUOTE_MAX_AGE_MS)throw new Error("Quote expired. Review a fresh quote before approving.");
      const amountIn=BigInt(quote.amountIn);
      const allowance=await client.readContract({address:quote.inputToken,abi:erc20Abi,functionName:"allowance",args:[signer,quote.market.router]});
      if(allowance>=amountIn){setStatus("Allowance already covers the reviewed amount. Swap must still be separately confirmed.");return;}
      const approvalAmount=allowance>0n?0n:amountIn;
      const data=encodeFunctionData({abi:erc20Abi,functionName:"approve",args:[quote.market.router,approvalAmount]});
      const raw=await wallet.request({method:"eth_sendTransaction",params:[{from:signer,to:quote.inputToken,data}]});
      if(typeof raw!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(raw))throw new Error("Wallet did not return a valid approval hash.");
      hash=raw as Hash;
      setTxHash(hash);setStatus("Approval transaction submitted. Waiting for on-chain confirmation.");
      const receipt=await client.waitForTransactionReceipt({hash,confirmations:2,timeout:120_000});
      if(receipt.status!=="success"||!receipt.to||getAddress(receipt.to)!==quote.inputToken)throw new Error("Approval was not confirmed at the intended token contract.");
      const updated=await client.readContract({address:quote.inputToken,abi:erc20Abi,functionName:"allowance",args:[signer,quote.market.router]});
      if(approvalAmount===0n&&updated!==0n)throw new Error("Allowance reset did not finalize.");
      if(approvalAmount>0n&&updated<amountIn)throw new Error("Approved allowance is insufficient.");
      setStatus(approvalAmount===0n?"Existing allowance reset to zero. Review the quote again, then approve the exact new amount.":"Exact token allowance approved. Review a fresh quote before swapping.");
      setQuote(null);void refreshPortfolio();
    }catch(error){
      setStatus(hash?"Approval submitted but confirmation incomplete: "+humanError(error):humanError(error));
      setQuote(null);
    }finally{setBusy(false);}
  }

  async function submitSwap(){
    if(!reviewed||!quote||!chosen||busy)return;
    const wallet=provider();
    if(!wallet)return;
    setBusy(true);setStatus("");setTxHash("");setTxVerified(false);setActualOut("");
    let hash:Hash|undefined;
    try{
      if(Date.now()-quote.quotedAt>QUOTE_MAX_AGE_MS)throw new Error("Quote expired; review a fresh price.");
      const signer=await requireWalletOnTestnet(wallet,address);
      const amountIn=BigInt(quote.amountIn),minOut=BigInt(quote.minOut);
      const allowance=await client.readContract({address:quote.inputToken,abi:erc20Abi,functionName:"allowance",args:[signer,quote.market.router]});
      const balance=await client.readContract({address:quote.inputToken,abi:erc20Abi,functionName:"balanceOf",args:[signer]});
      if(allowance<amountIn)throw new Error("Token approval is required before the swap.");
      if(balance<amountIn)throw new Error("Insufficient token balance.");
      const deadline=BigInt(Math.floor(Date.now()/1000)+300);
      const path=[quote.inputToken,quote.outputToken] as Address[];
      const data=encodeFunctionData({abi:v2RouterAbi,functionName:"swapExactTokensForTokens",args:[amountIn,minOut,path,signer,deadline]});
      const tx=await wallet.request({method:"eth_sendTransaction",params:[{from:signer,to:quote.market.router,data}]});
      if(typeof tx!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(tx))throw new Error("Wallet did not provide a transaction hash.");
      hash=tx as Hash;
      setTxHash(hash);setStatus("Swap broadcast. Waiting for 2 confirmations and verified pair/token events.");
      const receipt=await client.waitForTransactionReceipt({hash,confirmations:2,timeout:120_000});
      const proof=verifySwapReceipt(receipt,quote.market,signer,quote.outputToken,minOut);
      setTxVerified(true);setActualOut(formatUnits(proof.actualOut,quote.outputDecimals));
      setStatus("Swap verified against the configured router, genuine pair Swap event, and received token transfer.");
      setQuote(null);void refreshActivity();void refreshPortfolio();
    }catch(error){
      setStatus(hash?"Swap broadcast but NOT verified: "+humanError(error)+". Check the on-chain receipt before retrying.":humanError(error));
      setQuote(null);
    }finally{setBusy(false);}
  }

  const portfolioValue=useMemo(()=>{
    if(!portfolio||!chosen)return null;
    const base=Number(portfolio.base.balance),quote=Number(portfolio.quote.balance),price=Number(chosen.poolPrice);
    if(![base,quote,price].every(Number.isFinite))return null;
    return base*price+quote;
  },[portfolio,chosen]);

  return <main className="trade-shell">
    <header className="trade-topbar">
      <Link href="/" className="trade-logo"><span>✳</span> looke<span className="trade-logo-dot">.</span><small> / trade</small></Link>
      <span className="trade-network"><span className="trade-dot"/> ULTRA EVM TESTNET · CHAIN 18881</span>
      <button className="trade-wallet" disabled={busy} onClick={connect}>{address?shortAddress(address):"Connect EVM wallet"} ↗</button>
    </header>
    <div className="trade-container">
      <aside className="trade-sidebar">
        <div className="trade-nav-heading">MARKET ACCESS</div>
        <div className="trade-nav-highlight">◈ &nbsp; Spot Terminal</div>
        <span className="trade-nav-link">▧ &nbsp; Uniq NFTs · M3 in review</span>
        <Link href="/" className="trade-nav-link">⌂ &nbsp; Looke Home ↗</Link>
        <Link href="/setup" className="trade-nav-link">⚙ &nbsp; Create & fund Testnet pair ↗</Link>
        <div className="trade-sidebar-note">
          <strong>Trust, then trade.</strong>
          <p>All active pools must verify against the configured factory, router, token contracts and live liquidity. No external price feeds or simulated orders.</p>
          <small>V2-compatible ERC20/ERC20 markets only</small>
        </div>
      </aside>
      <section className="trade-main">
        <div className="trade-overline">LOOKE M4 / CREATOR ECONOMY MARKETS</div>
        <div className="trade-heading"><div><h1>Trade what<br/><em>you believe in.</em></h1><p>Real pools. Real wallets. On-chain evidence—nothing fabricated.</p></div><span className="trade-label">TESTNET · PREVIEW</span></div>
        <div className="trade-marketbar">
          <div><span className="trade-mini-label">MARKET</span>
            <select aria-label="Verified market" value={marketId} onChange={e=>updateTrade(()=>setMarketId(e.target.value))}>
              {markets.markets.length===0?<option value="">No verified pools available</option>:null}
              {markets.markets.map(m=><option value={m.id} key={m.id}>{m.baseSymbol}/{m.quoteSymbol}</option>)}
            </select>
          </div>
          <div><span className="trade-mini-label">POOL SPOT PRICE</span><strong>{chosen?Number(chosen.poolPrice).toPrecision(6)+" "+chosen.quoteSymbol:"—"}</strong></div>
          <div><span className="trade-mini-label">RESERVE / CREATOR TOKEN</span><strong>{chosen?chosen.reserveBase+" "+chosen.baseSymbol:"—"}</strong></div>
          <div><span className="trade-mini-label">RESERVE / QUOTE TOKEN</span><strong>{chosen?chosen.reserveQuote+" "+chosen.quoteSymbol:"—"}</strong></div>
          <button className="trade-refresh" disabled={loading} onClick={()=>void refreshMarkets()}>{loading?"Checking…":"Refresh ↻"}</button>
        </div>
        {markets.markets.length===0&&<div className="trade-no-market">
          <div className="trade-empty-symbol">◇</div><div><strong>No verified Ultra EVM liquidity pools configured</strong>
          <p>The terminal stays in discovery mode until a real V2-compatible factory, router, pair and funded token contracts pass on-chain verification. No fake price, volume, or trading buttons will be activated.</p></div>
          <span>MARKET SETUP REQUIRED</span>
        </div>}
        {markets.errors.length>0&&<div className="trade-error">{markets.errors.map(x=><p key={x.id}>{x.id}: {x.reason}</p>)}</div>}
        {chosen&&!markets.executionEnabled&&<div className="trade-no-market"><strong>Read-only market verified; public execution is disabled.</strong><p>Operator activation and independent security review are required before wallet swaps are enabled.</p></div>}
        <div className="trade-grid">
          <div className="trade-left">
            <section className="trade-panel">
              <div className="trade-panel-head"><div><div className="trade-mini-label">PRICE DISCOVERY</div><h2>Real trade candles</h2></div><div className="trade-segment">
                {[300,900,3600].map(seconds=><button key={seconds} onClick={()=>setIntervalValue(seconds)} className={interval===seconds?"active":""}>{seconds===300?"5m":seconds===900?"15m":"1h"}</button>)}
              </div></div>
              <CandleChart candles={activity?.candles||[]} quoteSymbol={chosen?.quoteSymbol||"quote"}/>
              <div className="trade-chart-foot">
                <div><span>OBSERVED SWAPS</span><strong>{activity?.observedSwapCount??"—"}</strong></div>
                <div><span>OBSERVED QUOTE VOLUME</span><strong>{activity?Number(activity.observedQuoteVolume).toPrecision(7)+" "+(chosen?.quoteSymbol||""):"—"}</strong></div>
                <div><span>RECENT BLOCK WINDOW</span><strong>{activity?.fromBlock&&activity?.throughBlock?`${activity.fromBlock}–${activity.throughBlock}`:"—"}</strong></div>
              </div>
              <p className="trade-disclaimer">{activity?.partial?"Partial view: activity exceeds the bounded query size. Volume is only from displayed/processed logs.":"Only actual verified pair events in the bounded recent block range. No trades → no candles."}</p>
            </section>
            <section className="trade-panel">
              <div className="trade-panel-head"><div><span className="trade-mini-label">ON-CHAIN EVIDENCE</span><h2>Recent swaps</h2></div><button className="trade-link-btn" onClick={()=>void refreshActivity()} disabled={!chosen}>Refresh evidence ↻</button></div>
              {activity?.swaps.length?<div className="trade-transactions">
                {activity.swaps.map((swap,i)=><div className="trade-transaction" key={swap.txHash+"-"+swap.blockNumber+"-"+i}>
                  <span className={swap.direction==="buy"?"trade-buy":"trade-sell"}>{swap.direction.toUpperCase()}</span>
                  <strong>{Number(swap.baseVolume).toPrecision(5)} {chosen?.baseSymbol}</strong>
                  <span>{Number(swap.price).toPrecision(6)} {chosen?.quoteSymbol}</span>
                  <a href={testnetTxUrl(swap.txHash)} rel="noopener noreferrer" target="_blank">{shortAddress(swap.txHash)} ↗</a>
                </div>)}
              </div>:<p className="trade-empty-table">No confirmed on-chain swap logs were found in the scanned window.</p>}
            </section>
          </div>
          <div className="trade-right">
            <section className="trade-panel">
              <div className="trade-panel-head"><div><span className="trade-mini-label">WALLET-SIGNED SWAPS</span><h2>Swap terminal</h2></div><span className="trade-label">{markets.executionEnabled?"LIVE TESTNET GATE":"EXECUTION LOCKED"}</span></div>
              <div className="trade-segment trade-direction">
                <button className={direction==="buy"?"active buy":""} onClick={()=>updateTrade(()=>setDirection("buy"))}>Buy</button>
                <button className={direction==="sell"?"active sell":""} onClick={()=>updateTrade(()=>setDirection("sell"))}>Sell</button>
              </div>
              <label className="trade-input-label">YOU PAY
                <div className="trade-input-wrap"><input value={amount} onChange={e=>updateTrade(()=>setAmount(e.target.value))} inputMode="decimal" placeholder="0.0" aria-label="Input token amount"/>
                <span>{direction==="buy"?chosen?.quoteSymbol||"QUOTE":chosen?.baseSymbol||"TOKEN"}</span></div></label>
              <label className="trade-input-label">MAXIMUM SLIPPAGE
                <select value={slippage} onChange={e=>updateTrade(()=>setSlippage(Number(e.target.value)))}>
                  <option value="10">0.1%</option><option value="50">0.5%</option><option value="100">1%</option><option value="300">3%</option>
                </select></label>
              {quote&&<div className="trade-quote">
                <div><span>Router quote</span><strong>{quote.quotedOutFormatted} {quote.outputSymbol}</strong></div>
                <div><span>Minimum received</span><strong>{quote.minOutFormatted} {quote.outputSymbol}</strong></div>
                <div><span>Approved route</span><strong>{shortAddress(quote.inputToken)} → {shortAddress(quote.outputToken)}</strong></div>
                <div><span>Quote age</span><strong>{quoteFresh?"Fresh · expires after 25s":"Expired — review again"}</strong></div>
                <p>Swap fee, price impact and token taxes (if any) are determined by the configured router and token contracts. This is not a guaranteed fill.</p>
              </div>}
              <button className="trade-primary" disabled={!executionReady||!accountReady||!amount||busy} onClick={()=>void reviewTrade()}>Review on-chain quote ↗</button>
              {quote&&<><button className="trade-secondary" disabled={!reviewed} onClick={()=>void approveTokens()}>Approve exact token amount (if needed)</button>
                <button className="trade-primary trade-swap-button" disabled={!reviewed} onClick={()=>void submitSwap()}>Confirm swap in wallet ↗</button></>}
              {!markets.executionEnabled&&<p className="trade-disclaimer">Trading stays disabled until a real funded pair and explicit operator release are verified.</p>}
              {!accountReady&&<p className="trade-disclaimer">Connect an EVM wallet on Ultra EVM Testnet 18881.</p>}
            </section>
            <section className="trade-panel">
              <div className="trade-panel-head"><div><span className="trade-mini-label">ON-CHAIN ACCOUNT</span><h2>Portfolio</h2></div><button className="trade-link-btn" onClick={()=>setShowBalances(v=>!v)}>{showBalances?"Hide":"Show"}</button></div>
              {portfolio&&chosen&&showBalances?<div className="trade-portfolio">
                <div><span>{portfolio.base.symbol}</span><strong>{portfolio.base.balance}</strong></div>
                <div><span>{portfolio.quote.symbol}</span><strong>{portfolio.quote.balance}</strong></div>
                <div className="trade-estimate"><span>POOL-SPOT ESTIMATE</span><strong>{portfolioValue===null?"—":portfolioValue.toPrecision(8)+" "+chosen.quoteSymbol}</strong></div>
                <p>Pool reserve ratio only—not a guaranteed executable valuation or financial P&L. Balances read directly from block #{portfolio.blockNumber}.</p>
              </div>:<p className="trade-empty-table">{accountReady?"No balances loaded.":"Connect wallet to read real balances."}</p>}
              <button className="trade-secondary" disabled={!accountReady||!chosen} onClick={()=>void refreshPortfolio()}>Refresh balances</button>
            </section>
          </div>
        </div>
        {status&&<div className="trade-status" role="status">{status}</div>}
        {txHash&&<div className={txVerified?"trade-status confirmed":"trade-status"}>
          <strong>{txVerified?"Verified on-chain swap":"Transaction submitted — verification pending"}</strong>
          {txVerified&&actualOut&&<p>Received {actualOut} {direction==="buy"?chosen?.baseSymbol:chosen?.quoteSymbol}</p>}
          <a href={testnetTxUrl(txHash)} rel="noopener noreferrer" target="_blank">{txHash} ↗</a>
        </div>}
        <footer className="trade-footer">Ultra EVM Testnet creator-token terminal · No fabricated orders, chart history or market volume · <Link href="/">Looke home ↗</Link></footer>
      </section>
    </div>
  </main>;
}
