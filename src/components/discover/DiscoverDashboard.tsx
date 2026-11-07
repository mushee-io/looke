"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {
  cleanDiscoveryQuery,compactOnChainNumber,selectDiscoverMarkets,
  type DiscoverFeed,type DiscoverSort,
} from "../../lib/discover";
import "./discover.css";
import "./market-first.css";
import "./m13-market.css";
import {safeAge} from "../../lib/ops/m13-discovery";
import {testnetAddressUrl} from "../../lib/ultra";
import type {CreatorLaunch,LaunchPage} from "../../lib/ops/m13-index";

const TABS:{key:DiscoverSort;label:string}[]=[
  {key:"trending",label:"Trending"},{key:"top",label:"Top"},
  {key:"new",label:"New"},{key:"watchlist",label:"Watchlist"},
];
function shortHash(value:string){return value.length>14?value.slice(0,7)+"…"+value.slice(-4):value;}
function initials(value:string){return value.slice(0,2).toUpperCase();}
const reference=[{label:"Creator coins",detail:"Launch your token",href:"/trade",icon:"✳",tone:"blue"},
 {label:"Communities",detail:"Posts and creator profiles",href:"/social",icon:"↗",tone:"mint"}] as const;

export default function DiscoverDashboard({onCreate,globalQuery=""}:{onCreate:()=>void;globalQuery?:string}){
  const [tab,setTab]=useState<DiscoverSort>("trending");
  const [query,setQuery]=useState(globalQuery);
  useEffect(()=>{setQuery(globalQuery);},[globalQuery]);
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [quote,setQuote]=useState("");
  const [launches,setLaunches]=useState<CreatorLaunch[]>([]);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [indexStatus,setIndexStatus]=useState<LaunchPage["status"]>("unconfigured");
  const [indexMessage,setIndexMessage]=useState("");
  const [loadingLaunches,setLoadingLaunches]=useState(false);
  const [feed,setFeed]=useState<DiscoverFeed|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState<string[]>([]);
  const [updated,setUpdated]=useState("");
  const searchRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{const timer=window.setTimeout(()=>{setSearch(query);setPage(1);},350);
    return ()=>window.clearTimeout(timer);},[query]);
  const refresh=useCallback(async()=>{
    try{
      const queryString=new URLSearchParams({q:search,sort:tab==="watchlist"?"trending":tab,
        quote,page:String(tab==="watchlist"?1:page),limit:String(tab==="watchlist"?20:5)});
      const res=await fetch("/api/discover?"+queryString,{cache:"no-store"});
      if(!res.ok)throw new Error("The market indexer is not available yet.");
      const data=await res.json() as DiscoverFeed;
      if(data.chainId!==18881||data.source!=="verified-on-chain"||!Array.isArray(data.markets))
        throw new Error("Unverified market response. No listings will be shown.");
      setFeed(data);setUpdated(data.asOf);setError("");
    }catch(e){setFeed(null);setError(e instanceof Error?e.message:"Market data unavailable.");}
    finally{setLoading(false);}
  },[search,tab,quote,page]);
  useEffect(()=>{
    try{
      const entry=window.localStorage.getItem("looke.m12.watchlist");
      if(entry){
        const parsed:unknown=JSON.parse(entry);
        if(Array.isArray(parsed))
          setSaved(parsed.filter((x):x is string=>typeof x==="string").slice(0,100));
      }
    }catch{/* Browser storage may be unavailable. */}
  },[]);
  useEffect(()=>{
    void refresh();
    const timer=window.setInterval(()=>{void refresh();},60_000);
    return ()=>window.clearInterval(timer);
  },[refresh]);
  const loadLaunches=useCallback(async(cursor:string|null,reset:boolean)=>{
    setLoadingLaunches(true);
    try{
      const params=new URLSearchParams();
      if(cursor!==null)params.set("cursor",cursor);
      if(search)params.set("q",search);
      const response=await fetch("/api/discover/launches?"+params,{cache:"no-store"});
      const data=await response.json() as LaunchPage;
      if(!response.ok||data.chainId!==18881||!Array.isArray(data.launches))
        throw new Error("Verified creator launch indexing is unavailable.");
      setLaunches(old=>reset?data.launches:[...old,...data.launches]);
      setNextCursor(data.nextCursor);setIndexStatus(data.status);
      setIndexMessage(data.errors[0]??"");
    }catch{
      if(reset)setLaunches([]);
      setNextCursor(null);setIndexStatus("blocked");
      setIndexMessage("Factory indexer unavailable. No unverified coins will be shown.");
    }finally{setLoadingLaunches(false);}
  },[search]);
  useEffect(()=>{
    if(tab==="new")void loadLaunches(null,true);
  },[tab,loadLaunches]);
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement|null;
      if(e.key==="/"&&!e.metaKey&&!e.ctrlKey&&target?.tagName!=="INPUT"&&target?.tagName!=="TEXTAREA"){
        e.preventDefault();searchRef.current?.focus();
      }
      if(e.key==="Escape"&&document.activeElement===searchRef.current)searchRef.current?.blur();
    };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[]);
  const watchlist=useMemo(()=>new Set(saved),[saved]);
  const rows=useMemo(()=>selectDiscoverMarkets(feed?.markets??[],tab,search,watchlist),
    [feed,tab,search,watchlist]);
  const hasMarkets=Boolean(feed?.pagination?.total??feed?.markets.length);
  const toggleSaved=(id:string)=>{
    setSaved(curr=>{
      const next=curr.includes(id)?curr.filter(x=>x!==id):[...curr,id].slice(0,100);
      try{window.localStorage.setItem("looke.m12.watchlist",JSON.stringify(next));}
      catch{/* Watchlist is browser-only; no fake backend save. */}
      return next;
    });
  };
  const isSearching=cleanDiscoveryQuery(search).length>0;


  return (
    <div className="discover-v12 discover-market-first">
      <div className="discover-utility">
        <div className="discover-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 5 5"/></svg>
          <input ref={searchRef} type="search" value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Search creators, tokens or contract addresses"
            aria-label="Search verified creator markets" maxLength={64}/>
          <kbd>/</kbd>
        </div>
        <span className="discover-market-network"><span className="discover-live-dot"/> Ultra Testnet <span>18881</span></span>
      </div>

      <nav className="discover-categories" aria-label="Explore Looke">
        <div className="discover-categories-scroll">
          <button type="button" className="discover-category discover-category-selected"
            onClick={()=>{setTab("trending");setQuery("");}} aria-label="All verified creator coins">
            <span className="discover-category-dot">✳</span> All coins <span aria-hidden="true" className="discover-chevron">⌄</span>
          </button>
          <button type="button" className="discover-category" onClick={onCreate}>
            <span className="discover-category-dot purple">✦</span> Creator studio
          </button>
          <Link href="/trade" className="discover-category"><span className="discover-category-dot mint">↗</span> Trading</Link>
          <Link href="/social" className="discover-category"><span className="discover-category-dot peach">◎</span> Communities</Link>
          <Link href="/beta" className="discover-category"><span className="discover-category-dot grey">✓</span> Beta status</Link>
        </div>
        <button type="button" className="discover-floating-create" onClick={onCreate}
          aria-label="Create a coin on Ultra Testnet" title="Create a coin">＋</button>
      </nav>

      <section className="discover-markets" aria-label="Ultra creator market rankings">
        <header className="discover-markets-header">
          <div className="discover-market-heading">
            <div className="discover-overline">DISCOVER / ULTRA EVM</div>
            <h1>Explore markets <span className="discover-header-period">.</span></h1>
            <p>Creator coins and verified on-chain activity.</p>
          </div>
          <div className="discover-header-right">
            <select className="discover-quote-filter" value={quote}
              onChange={e=>{setQuote(e.target.value);setPage(1);}}
              aria-label="Filter by quoted asset">
              <option value="">All pairs</option>
              <option value="UOS">UOS pairs</option>
              <option value="USDC">USDC pairs</option>
            </select>
            <span className="discover-market-status"><span className="discover-live-dot"/>{hasMarkets?"Verified markets":"Indexer awaiting markets"}</span>
            <button className="discover-refresh" type="button" onClick={()=>{setLoading(true);void refresh();}} disabled={loading}
              aria-label="Refresh verified markets" title="Refresh verified markets">↻</button>
          </div>
        </header>
        <div className="discover-tabs" role="tablist" aria-label="Market rankings">
          {TABS.map(t=><button key={t.key} role="tab" aria-selected={tab===t.key}
            className={tab===t.key?"discover-tab is-active":"discover-tab"}
            onClick={()=>{setTab(t.key);setPage(1);}} type="button">
            {t.label}{t.key==="watchlist"&&saved.length>0?<span className="discover-tab-count">{saved.length}</span>:null}
          </button>)}
          <span className="discover-tab-spacer"/>
          <span className="discover-tab-network">{tab==="new"?"Finalized CoinCreated events":(feed?.pagination?.total??0)+" verified markets"} · <a href="/api/discover/health" target="_blank" rel="noreferrer">Indexer health ↗</a></span>
        </div>
        <div className="discover-table">
          {tab!=="new"&&<div className="discover-table-head" aria-hidden="true">
            <span>Coin</span><span>Market cap</span><span>Observed vol*</span>
            <span>Holders</span><span>Age</span><span>Paired with</span><span>Past 24h</span><span>Save</span>
          </div>}
          {tab==="new"&&launches.length>0?launches.map(l=>(
            <div className="discover-row" key={l.txHash+":"+l.token}>
              <div className="discover-row-name">
                <span className="discover-token-icon" aria-hidden="true">{initials(l.symbol)}</span>
                <span><strong>{l.name}</strong><small>{l.symbol} · verified factory mint</small></span>
              </div>
              <div className="discover-cell discover-missing">—</div>
              <div className="discover-cell discover-missing">—</div>
              <div className="discover-cell discover-missing">—</div>
              <div className="discover-cell"><strong>{safeAge(l.createdAt)??"—"}</strong></div>
              <div className="discover-cell discover-missing">No verified pair</div>
              <div className="discover-cell discover-missing">—</div>
              <span className="discover-save" aria-hidden="true">✓</span>
              <a href={testnetAddressUrl(l.token)} target="_blank" rel="noopener noreferrer"
                className="discover-row-action" aria-label={"View "+l.symbol+" on Ultra explorer"}>Explorer ↗</a>
            </div>
          )):rows.length>0&&tab!=="new"?rows.map(m=>(
            <div className="discover-row" key={m.id}>
              <div className="discover-row-name">
                <span className="discover-token-icon" aria-hidden="true">{initials(m.baseSymbol)}</span>
                <span><strong>{m.baseSymbol}</strong><small>{m.id.toUpperCase()} · price {compactOnChainNumber(m.poolPrice,5)} {m.quoteSymbol}</small></span>
              </div>
              <div className={"discover-cell"+(m.marketCap===null?" discover-missing":"")}
                title="Quote-token market capitalization, never assumed USD">
                <strong>{m.marketCap===null?"—":compactOnChainNumber(m.marketCap)+" "+m.quoteSymbol}</strong>
              </div>
              <div className="discover-cell">
                <span className="discover-mobile-label">Observed volume</span>
                <strong>{m.observedQuoteVolume===null?"—":compactOnChainNumber(m.observedQuoteVolume)+" "+m.quoteSymbol}</strong>
                {m.partial?<small>Partial scan</small>:null}
              </div>
              <div className={"discover-cell"+(m.holders===null?" discover-missing":"")}
                title="Only counts from completely reconciled transfer histories">
                <strong>{m.holders===null?"—":m.holders.toLocaleString("en-US")}</strong>
              </div>
              <div className="discover-cell"><strong>{safeAge(m.createdAt)??"—"}</strong></div>
              <div className="discover-cell discover-pair"><span className="discover-pair-icon">◉</span><strong>{m.quoteSymbol}</strong></div>
              <div className={"discover-cell"+(m.change24h===null?" discover-missing":Number(m.change24h)>=0?" discover-positive":" discover-negative")}
                title="24h change requires historical on-chain reserves">
                <strong>{m.change24h===null?"—":(Number(m.change24h)>0?"+":"")+m.change24h+"%"}</strong>
              </div>
              <button className={"discover-save"+(watchlist.has(m.id)?" is-saved":"")}
                onClick={()=>toggleSaved(m.id)} type="button"
                aria-label={(watchlist.has(m.id)?"Remove ":"Add ")+m.baseSymbol+(watchlist.has(m.id)?" from":" to")+" watchlist"}
                aria-pressed={watchlist.has(m.id)}>{watchlist.has(m.id)?"★":"☆"}</button>
              <Link href="/trade" className="discover-row-action" aria-label={"Open "+m.baseSymbol+" trading market"}>Trade ↗</Link>
            </div>
          )):(
            <div className="discover-empty-market" role="status">
              <span className="discover-empty-icon" aria-hidden="true">◇</span>
              <div className="discover-empty-copy">
                {loading?<><h2>Checking Ultra markets…</h2><p>Reading verified Testnet contracts and actual swap activity.</p></>:
                  error?<><h2>Market data is unavailable</h2><p>{error} Looke will not show synthetic listings.</p></>:
                  tab==="new"?<><h2>{loadingLaunches?"Scanning finalized Ultra blocks…":indexStatus==="unconfigured"?"Creator factory not configured":indexStatus==="blocked"?"Token indexer unavailable":"No verified launches in this block page"}</h2><p>{indexMessage||"Only authentic CoinCreated events from a verified Looke factory are indexed. Scan older block pages if available."}</p></>:
                  tab==="watchlist"?<><h2>Nothing on your watchlist yet</h2><p>Bookmark a verified token to save it in this browser.</p></>:
                  isSearching?<><h2>No matching verified coin</h2><p>Try a different symbol or contract address.</p></>:
                  <><h2>First verified markets coming soon</h2><p>There are no confirmed creator coin markets with reviewed liquidity to list yet. Real coins will appear here automatically once indexed.</p></>}
              </div>
              <div className="discover-empty-actions">
                <button type="button" className="discover-create" onClick={onCreate}>Create a coin ↗</button>
                <Link href="/trade" className="discover-empty-link">Trading terminal ↗</Link>
              </div>
            </div>
          )}
        </div>
        {tab==="new"&&nextCursor&&<div className="discover-pagination">
          <span>Verified factory events · indexed in bounded block pages, not the full chain</span>
          <button type="button" disabled={loadingLaunches}
            onClick={()=>{void loadLaunches(nextCursor,false);}}>Scan older blocks ↗</button>
        </div>}
        {tab!=="new"&&tab!=="watchlist"&&feed?.pagination&&feed.pagination.total>0&&
          <div className="discover-pagination">
            <span>Page {feed.pagination.page} · {feed.pagination.total} verified market{feed.pagination.total===1?"":"s"}</span>
            <div><button type="button" disabled={page<=1||loading} onClick={()=>setPage(n=>Math.max(1,n-1))}>← Previous</button>
            <button type="button" disabled={!feed.pagination.hasMore||loading} onClick={()=>setPage(n=>n+1)}>Next →</button></div>
          </div>}
        <footer className="discover-market-footnote">
          <span>*Observed volume comes from recent verified blocks, not a complete 24-hour window. Market cap is in the quote token, not USD. Unverified holder counts, launch ages and 24h price changes are omitted.</span>
          {updated?<time dateTime={updated}>Checked {new Date(updated).toLocaleTimeString()}</time>:null}
        </footer>
        {feed?.errors.length?<div className="discover-indexer-notice">Some allowlisted markets failed verification and are hidden.</div>:null}
      </section>

      <div className="discover-product-footer">
        <div className="discover-product-intro"><span className="discover-overline">THE LOOKE ECOSYSTEM</span><h2>More than a market<span className="branddot">.</span></h2></div>
        <div className="discover-shortcuts" aria-label="Looke products">
          {reference.map(item=>(
            <Link key={item.label} className={"discover-shortcut discover-shortcut-"+item.tone} href={item.href}>
              <span className="discover-shortcut-icon">{item.icon}</span>
              <span className="discover-shortcut-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
              <span className="discover-shortcut-arrow">↗</span>
            </Link>
          ))}
        </div>
        <div className="discover-bottom">
          <div className="discover-bottom-card discover-bottom-creative">
            <div className="discover-bottom-badge">LOOKE CREATOR STUDIO</div>
            <div className="discover-bottom-content"><h3>Start something original.</h3><p>Launch your creator coin and connect your community on Ultra Testnet when the verified factory is active.</p>
              <button type="button" onClick={onCreate}>Open creator studio <span>↗</span></button></div>
            <span className="discover-bottom-flower" aria-hidden="true">✳</span>
          </div>
          <div className="discover-bottom-card discover-bottom-chain">
            <div className="discover-bottom-badge">NETWORK PULSE</div>
            <div className="discover-chain-row"><span className="discover-chain-glyph">◉</span><div><strong>Ultra EVM Testnet</strong><small>Chain ID 18881</small></div><span className="discover-chain-ok">Configured</span></div>
            <div className="discover-chain-row"><span className="discover-chain-glyph">◆</span><div><strong>Ultra EVM Mainnet</strong><small>Chain ID 19991 · launch not enabled</small></div><span className="discover-chain-pending">Read-only</span></div>
            <Link href="/beta" className="discover-beta-link">View beta readiness <span>↗</span></Link>
          </div>
        </div>
      </div>

      <div className="discover-endnote"><span>looke<span className="branddot">.</span></span><p>Creator coins, markets and communities, strictly on Ultra EVM.</p><span>EARLY ACCESS · TESTNET</span></div>
    </div>
  );
}
