"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import type {DiscoverFeed,DiscoverMarket} from "../../lib/discover";
import {compactOnChainNumber} from "../../lib/discover";
import {shortAddress, testnetAddressUrl} from "../../lib/ultra";
import {AssetEvidence,ApprovedPostMedia} from "./AssetEvidence";
import {EngagementActions} from "./EngagementActions";
import "./m17.css";
import "./m15.css";
import "./m16.css";

type SocialPost={
  id:string;author:string;handle:string;display_name:string;body:string;
  asset_id:string|null;asset_type:string|null;asset_chain:string|null;
  avatar_url:string|null;created_at:string;comment_count:number;follower_count:number;
  media_url?:string|null;media_kind?:string|null;
  event_id?:string;reposted_by_handle?:string|null;
  like_count:number;repost_count:number;liked_by_me:boolean;
  reposted_by_me:boolean;bookmarked_by_me:boolean;
};
type SocialProfile={
  address:string;handle:string;display_name:string;bio:string;avatar_url:string|null;
  follower_count?:number;following_count?:number;created_at?:string;
};
type FeedResponse={posts:SocialPost[];nextCursor:string|null;authenticated?:boolean;error?:string};
type EventType="Comments"|"Follows"|"Likes"|"Reposts";
type NotificationEvent={id:string;type:EventType;actorHandle:string;actorName:string;
  text:string;timestamp:string;postId:string|null;unread?:boolean};
type NotificationResult={authenticated:boolean;events:NotificationEvent[];unreadCount?:number;error?:string};
function relativeDate(date:string){
  const t=new Date(date).getTime();
  if(!Number.isFinite(t))return "Unknown time";
  const duration=Math.max(0,Date.now()-t);
  if(duration<60_000)return "Now";
  if(duration<3_600_000)return Math.floor(duration/60_000)+"m";
  if(duration<86_400_000)return Math.floor(duration/3_600_000)+"h";
  return Math.floor(duration/86_400_000)+"d";
}
function TokenChip({market}:{market:DiscoverMarket}){
  return <Link className="lk-trend-chip" href="/trade" title="Open existing verified trading terminal">
    <span className="lk-chip-icon">{market.baseSymbol.slice(0,1)}</span>
    <span className="lk-chip-copy"><strong>{market.baseSymbol}</strong>
      <small>{market.marketCap?compactOnChainNumber(market.marketCap)+" "+market.quoteSymbol+" cap":
        compactOnChainNumber(market.reserveQuote)+" "+market.quoteSymbol+" reserves"}</small></span>
    {market.change24h!==null?<b className={Number(market.change24h)>=0?"lk-gain":"lk-loss"}>
      {market.change24h}%</b>:<span className="lk-unverified">—</span>}
  </Link>;
}
function ProfileAvatar({name,large=false}:{name:string;large?:boolean}){
  return <span aria-hidden="true" className={"lk-avatar"+(large?" large":"")}>{name.charAt(0).toUpperCase()||"L"}</span>;
}

export function TrendingFeed({search,onCreate}:{search:string;onCreate:()=>void}){
  const [markets,setMarkets]=useState<DiscoverMarket[]>([]);
  const [posts,setPosts]=useState<SocialPost[]>([]);
  const [socialSignedIn,setSocialSignedIn]=useState(false);
  const [cursor,setCursor]=useState<string|null>(null);
  const [marketNotice,setMarketNotice]=useState("");
  const [socialNotice,setSocialNotice]=useState("");
  const [feedMode,setFeedMode]=useState<"latest"|"following">("latest");
  const [busy,setBusy]=useState(false);
  const [offset,setOffset]=useState(0);
  const [serverSearch,setServerSearch]=useState("");
  useEffect(()=>{
    const t=window.setTimeout(()=>setServerSearch(search.trim().slice(0,64)),350);
    return ()=>window.clearTimeout(t);
  },[search]);
  const load=useCallback(async(nextCursor?:string|null)=>{
    if(nextCursor)setBusy(true);
    try{
      const params=new URLSearchParams({
        action:"feed",scope:feedMode==="following"?"following":"global",search:serverSearch,
      });
      if(nextCursor)params.set("cursor",nextCursor);
      const response=await fetch("/api/social?"+params.toString(),{cache:"no-store"});
      if(!response.ok)throw new Error("The social database is not ready for public posts.");
      const data=await response.json() as FeedResponse;
      if(!Array.isArray(data.posts))throw new Error("Unverified feed response.");
      setPosts(old=>nextCursor?[...old,...data.posts.filter(p=>!old.some(x=>x.event_id===p.event_id))]:data.posts);
      setSocialSignedIn(Boolean(data.authenticated));
      setCursor(data.nextCursor);setSocialNotice("");
    }catch(e){if(!nextCursor){setPosts([]);setCursor(null);setSocialSignedIn(false);}
      setSocialNotice(e instanceof Error?e.message:"Social feed unavailable.");}
    finally{setBusy(false);}
  },[feedMode,serverSearch]);
  useEffect(()=>{
    void load();
    const ticker=window.setInterval(()=>{void load();},90_000);
    return ()=>window.clearInterval(ticker);
  },[load]);
  useEffect(()=>{
    let active=true;
    void fetch("/api/discover?sort=trending&page=1&limit=8",{cache:"no-store"})
      .then(async r=>{if(!r.ok)throw Error("Market indexing unavailable");
        return r.json() as Promise<DiscoverFeed>;})
      .then(data=>{if(!active)return;
        if(data.chainId!==18881||data.source!=="verified-on-chain")
          throw Error("Unverified chain data.");
        setMarkets(data.markets);setMarketNotice("");})
      .catch(()=>{if(active){setMarkets([]);setMarketNotice("Market indexing is not available yet.");}});
    return ()=>{active=false;};
  },[]);
  const filtered=useMemo(()=>posts.filter(p=>(p.body+" "+p.handle+" "+p.display_name)
    .toLowerCase().includes(search.trim().toLowerCase())),[posts,search]);
  return <div className="lk-feed-page">
    <div className="lk-feed-trending-head"><span>Trending</span><div>
      <button onClick={()=>setOffset(x=>Math.max(0,x-1))} disabled={offset===0} type="button"
        aria-label="Previous trending tokens">‹</button>
      <button onClick={()=>setOffset(x=>Math.min(Math.max(0,markets.length-2),x+1))}
        disabled={markets.length<3||offset>=markets.length-2} type="button"
        aria-label="Next trending tokens">›</button></div></div>
    {markets.length?<div className="lk-feed-chip-strip">
      {markets.slice(offset,offset+3).map(m=><TokenChip key={m.id} market={m}/>)}
    </div>:<div className="lk-no-trends"><span className="lk-trend-ico">✳</span>
      <strong>Trending creator coins</strong><span>{marketNotice||"No verified Ultra Testnet markets with live liquidity yet."}</span></div>}
    <div className="lk-feed-title-row"><h2>Creator feed</h2>
      <div><button type="button" className={feedMode==="latest"?"active":""} onClick={()=>setFeedMode("latest")}>Latest</button>
        <button type="button" className={feedMode==="following"?"active":""} onClick={()=>setFeedMode("following")}>Following</button></div></div>
    {socialNotice&&<p className="lk-evidence-note" role="status">{socialNotice} No sample posts have been substituted.</p>}
    {filtered.length===0?<div className="lk-feed-empty">
      <span className="lk-empty-art" aria-hidden="true">✳</span>
      <h3>{search?"No matching verified posts":"A space for Ultra creators"}</h3>
      <p>{search?"Try another search term.":"Real creator posts will appear here once profiles and the social database are active."}</p>
      <div className="lk-feed-empty-actions">
        <Link href="/social">Explore social ↗</Link>
        <button onClick={onCreate} type="button">Create something ＋</button>
      </div>
    </div>:filtered.map(post=><article className="lk-feed-post" key={post.event_id??post.id}>
      {post.reposted_by_handle&&<div className="lk-m17-repost-banner">↻ @{post.reposted_by_handle} reposted</div>}
      <div className="lk-feed-post-head">
        <ProfileAvatar name={post.display_name||post.handle}/>
        <div><strong>{post.display_name||post.handle}</strong><small>@{post.handle}</small></div>
        <span className="lk-post-time">{relativeDate(post.created_at)} · · ·</span>
      </div>
      <p className="lk-post-text">{post.body}</p>
      <ApprovedPostMedia url={post.media_url??null} kind={post.media_kind??null}/>
      {post.asset_type==="token"&&post.asset_chain==="ultra-evm"&&post.asset_id&&
        <div className="lk-post-asset">
          <span className="lk-post-asset-icon">◇</span>
          <div><strong>Ultra EVM creator token</strong><small>{shortAddress(post.asset_id)}</small></div>
          <a href={testnetAddressUrl(post.asset_id)} target="_blank" rel="noopener noreferrer">Verify ↗</a>
        </div>}
      {post.asset_type==="token"&&post.asset_chain==="ultra-evm"&&post.asset_id&&
        <AssetEvidence kind="token" id={post.asset_id}/>}
      <div className="lk-post-actions">
        <EngagementActions postId={post.id} initial={post} authenticated={socialSignedIn}
          onChanged={()=>{void load();}}/>
        <Link href="/social">◯ {post.comment_count} comments</Link>
        <Link href="/social">↗ Share</Link>
        <span className="lk-post-verified">Real database post</span>
      </div>
    </article>)}
    {cursor&&<button className="lk-load-posts" onClick={()=>{void load(cursor);}} disabled={busy}>Load older posts ↓</button>}
    <div className="lk-feed-end">looke<span>.</span> · Made for Ultra's creators</div>
  </div>;
}

export function MessagesPanel(){
  const [search,setSearch]=useState("");
  const [newMessage,setNewMessage]=useState(false);
  const [requests,setRequests]=useState(false);
  const [recipient,setRecipient]=useState("");
  const [readyNote,setReadyNote]=useState("Messaging security review pending.");
  const [requestRows,setRequestRows]=useState<Array<{
    id:string;direction:"incoming"|"outgoing";peerHandle:string;
    peerName:string;status:string;
  }>>([]);
  const [requestNote,setRequestNote]=useState("Message request data requires an approved database.");
  useEffect(()=>{
    if(!requests)return;
    let active=true;
    void fetch("/api/experience/messaging/requests",{cache:"no-store",credentials:"same-origin"})
      .then(async r=>{if(!r.ok)throw new Error("Message request history is unavailable.");return await r.json() as {requests:typeof requestRows;transportEnabled:boolean};})
      .then(data=>{if(active){setRequestRows(data.requests);
        setRequestNote("Real request metadata only; no messages can be sent or received.");}})
      .catch(()=>{if(active){setRequestRows([]);
        setRequestNote("No verified request records available. Sign in and configure approved social data.");}});
    return ()=>{active=false;};
  },[requests]);
  useEffect(()=>{
    void fetch("/api/experience/messaging/readiness",{cache:"no-store"})
      .then(r=>r.json())
      .then((x:{liveMessagingEnabled:boolean;disclaimer:string})=>{
        setReadyNote(x.liveMessagingEnabled?"Messaging was enabled after review.":"Messaging disabled · "+x.disclaimer);
      })
      .catch(()=>setReadyNote("Messaging has no approved encryption/recovery readiness evidence."));
  },[]);
  return <div className="lk-messages-page">
    <div className="lk-messages-list">
      <div className="lk-messages-controls">
        <label><span aria-hidden="true">⌕</span><input type="search" value={search}
          onChange={e=>setSearch(e.target.value)} placeholder="Search" aria-label="Search conversations"/></label>
        <button type="button" onClick={()=>setRequests(x=>!x)} aria-label="Message requests">⚙</button>
        <button type="button" onClick={()=>setNewMessage(true)} aria-label="New conversation">✎</button>
      </div>
      <div className="lk-messages-heading"><h1>Messages</h1>
        <button onClick={()=>setRequests(x=>!x)} type="button">{requests?"Back to messages":"Requests"}</button></div>
      {requests && requestRows.some(r=>(r.peerHandle+" "+r.peerName).toLowerCase().includes(search.toLowerCase()))?
        requestRows.filter(r=>(r.peerHandle+" "+r.peerName).toLowerCase().includes(search.toLowerCase()))
          .map(r=><div key={r.id} className="lk-messages-none">
            <strong>@{r.peerHandle}</strong><p>{r.peerName} · {r.direction} request · {r.status}</p>
            <small>No message content is stored. Acceptance does not enable delivery.</small>
          </div>):
        <div className="lk-messages-none"><span aria-hidden="true">💬</span>
          <strong>{requests?"No verified message requests":"No messages yet"}</strong>
          <p>{requests?requestNote:search?"There are no matching conversations.":"Your secure conversations will appear after messaging has been independently reviewed."}</p>
        </div>}
    </div>
    <div className="lk-messages-stage">
      <span aria-hidden="true" className="lk-messages-plane">➤</span>
      <h2>{newMessage?"New conversation":"Start a new conversation"}</h2>
      <p>{newMessage?"Select a creator. Message sending will be enabled only after reviewed end-to-end encryption.":"Send a message to get started."}</p>
      {newMessage?<div className="lk-compose-message">
        <input type="text" placeholder="Search a creator by handle" value={recipient}
          onChange={e=>setRecipient(e.target.value)} aria-label="Recipient handle" maxLength={24}/>
        <p>Private messaging is not live. No recipient data or plaintext message is stored by this composer.</p>
        <button type="button" onClick={()=>setNewMessage(false)}>Close composer</button>
      </div>:<button type="button" onClick={()=>setNewMessage(true)}>Send message</button>}
      <div className="lk-m15-security" role="status">{readyNote}
        <p>No messages are sent or persisted through this interface.</p></div>
    </div>
  </div>;
}

const NOTIFICATION_TABS=["All","Subscriptions","Mentions","Trades","Comments","Follows","Likes","Reposts","Other"] as const;
type NotificationTab=typeof NOTIFICATION_TABS[number];
export function NotificationsPanel({onCreate}:{onCreate:()=>void}){
  const [tab,setTab]=useState<NotificationTab>("All");
  const [events,setEvents]=useState<NotificationEvent[]>([]);
  const [authenticated,setAuthenticated]=useState(false);
  const [state,setState]=useState("Checking signed-in notification history…");
  const [settings,setSettings]=useState(false);
  const [checkedAt,setCheckedAt]=useState<string|null>(null);
  const [unreadCount,setUnreadCount]=useState(0);
  const [markingRead,setMarkingRead]=useState(false);
  const loadNotifications=useCallback(async()=>{
    try{
      const r=await fetch("/api/experience/notifications",{cache:"no-store"});
      if(!r.ok)throw new Error("Notification data is not available until the social database is configured.");
      const data=await r.json() as NotificationResult;
      if(!Array.isArray(data.events))throw new Error("Invalid notification response.");
      setEvents(data.events);setAuthenticated(data.authenticated);setUnreadCount(data.unreadCount??0);
      setState(data.authenticated?"":"Sign in to Looke social to view your actual notifications.");
      setCheckedAt(new Date().toISOString());
    }catch(e){
      setEvents([]);setState(e instanceof Error?e.message:"Notifications unavailable.");
    }
  },[]);
  useEffect(()=>{
    void loadNotifications();
    const interval=window.setInterval(()=>{void loadNotifications();},60_000);
    return ()=>window.clearInterval(interval);
  },[loadNotifications]);
  async function markAllRead(){
    if(!authenticated||!unreadCount)return;
    setMarkingRead(true);
    try{
      const r=await fetch("/api/experience/notifications",{
        method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",
        body:JSON.stringify({action:"mark_read"}),cache:"no-store",
      });
      if(!r.ok)throw new Error("Read/unread state is not enabled in this environment.");
      await loadNotifications();
    }catch(e){setState(e instanceof Error?e.message:"Notifications are read-only.");}
    finally{setMarkingRead(false);}
  }
  const visible=events.filter(e=>tab==="All"||e.type===tab);
  return <div className="lk-notifications">
    <div className="lk-notifications-heading"><h1>Notifications</h1>
      <div>{authenticated&&unreadCount>0&&<button className="lk-m15-refresh" type="button"
        onClick={()=>void markAllRead()} disabled={markingRead} aria-label="Mark all notifications read">
        {markingRead?"Saving…":"Mark "+unreadCount+" read ✓"}</button>}
      <button className="lk-m15-refresh" type="button" onClick={()=>{void loadNotifications();}}
        aria-label="Refresh verified notifications">↻</button>
      <button type="button" onClick={()=>setSettings(v=>!v)} aria-label="Notification settings">⚙</button></div></div>
    {checkedAt&&<small className="lk-m15-checked">Checked {new Date(checkedAt).toLocaleTimeString()} · no invented alerts</small>}
    {settings&&<div className="lk-notification-settings"><strong>Notification preferences</strong>
      <p>On-platform notifications show genuine follows, comments, likes and reposts. Push/email subscriptions are not activated. Manage category preferences under Social → Account controls.</p>
      <button type="button" onClick={()=>setSettings(false)}>Close</button></div>}
    <div className="lk-notification-tabs" role="tablist" aria-label="Notification categories">
      {NOTIFICATION_TABS.map(t=><button type="button" key={t} role="tab" aria-selected={tab===t}
        className={tab===t?"active":""} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {visible.length&&authenticated?visible.map(e=><article key={e.id} className={"lk-notification-item"+(e.unread?" lk-m16-unread":"")}>
      <ProfileAvatar name={e.actorName||e.actorHandle}/><div><strong>@{e.actorHandle}</strong> {e.text}
        <small>{relativeDate(e.timestamp)} · {e.type}</small></div>
      </article>):<div className="lk-notifications-empty">
      <div className="lk-notifications-bell" aria-hidden="true">♧</div>
      <h2>It&apos;s quiet here</h2>
      <p>{state||"Your verified Looke notifications will appear here."}</p>
      <button type="button" onClick={onCreate}>Create a post</button>
    </div>}
  </div>;
}

type ProfilePosts={posts:SocialPost[];total:number;nextCursor:string|null};
export function ProfilePanel({address,onCreate}:{address:string;onCreate:()=>void}){
  const [profile,setProfile]=useState<SocialProfile|null>(null);
  const [posts,setPosts]=useState<SocialPost[]>([]);
  const [total,setTotal]=useState<number|null>(null);
  const [nextProfileCursor,setNextProfileCursor]=useState<string|null>(null);
  const [moreBusy,setMoreBusy]=useState(false);
  const [status,setStatus]=useState("Checking your social profile…");
  const [tab,setTab]=useState<"Posts"|"Tokens">("Posts");
  useEffect(()=>{
    let alive=true;
    async function load(){
      try{
        const me=await fetch("/api/social?action=me",{cache:"no-store"});
        if(!me.ok)throw new Error("Social database is not configured.");
        const data=await me.json() as {authenticated:boolean;profile:SocialProfile|null};
        if(!data.authenticated||!data.profile)throw new Error("Sign in with an Ultra EVM Testnet wallet on Looke social to create and view your creator profile.");
        if(address&&data.profile.address.toLowerCase()!==address.toLowerCase())
          throw new Error("Your connected wallet differs from your current Looke social session. Sign in again.");
        const [details,activity]=await Promise.all([
          fetch("/api/social?action=profile&handle="+encodeURIComponent(data.profile.handle),{cache:"no-store"}),
          fetch("/api/experience/profile-posts?handle="+encodeURIComponent(data.profile.handle),{cache:"no-store"}),
        ]);
        if(!details.ok||!activity.ok)throw new Error("Verified profile activity is unavailable.");
        const a=await details.json() as {profile:SocialProfile};
        const b=await activity.json() as ProfilePosts;
        if(alive){setProfile(a.profile);setPosts(b.posts);setTotal(b.total);
          setNextProfileCursor(b.nextCursor);setStatus("");}
      }catch(e){if(alive){setProfile(null);setPosts([]);setTotal(null);
        setStatus(e instanceof Error?e.message:"Profile unavailable.");}}
    }
    void load();return ()=>{alive=false;};
  },[address]);
  async function loadMoreProfilePosts(){
    if(!profile||!nextProfileCursor||moreBusy)return;
    setMoreBusy(true);
    try{
      const params=new URLSearchParams({handle:profile.handle,cursor:nextProfileCursor});
      const response=await fetch("/api/experience/profile-posts?"+params,{cache:"no-store"});
      if(!response.ok)throw new Error("Older profile posts are unavailable.");
      const result=await response.json() as ProfilePosts;
      setPosts(old=>[...old,...result.posts.filter(p=>!old.some(x=>x.id===p.id))]);
      setNextProfileCursor(result.nextCursor);
    }catch(e){setStatus(e instanceof Error?e.message:"Profile history unavailable.");}
    finally{setMoreBusy(false);}
  }
  return <div className="lk-profile-page">
    <div className="lk-profile-header">
      <ProfileAvatar name={profile?.display_name||profile?.handle||"L"} large/>
      <div className="lk-profile-identity"><h1>{profile?.display_name||"Your Looke profile"}</h1>
        <span>{profile?"@"+profile.handle:"Connect your creator identity"}</span></div>
      <Link href="/social" className="lk-profile-more" aria-label="Edit your profile">···</Link>
    </div>
    {profile?<><p className="lk-profile-bio">{profile.bio||"Tell the Ultra community what you're creating."}</p>
      <div className="lk-profile-stats"><span>{total===null?"—":total} Posts</span>
        <span>{profile.follower_count??"—"} Followers</span>
        <span>{profile.following_count??"—"} Following</span></div>
      <button className="lk-profile-share" type="button" onClick={()=>{void navigator.clipboard.writeText(
        window.location.origin+"/social?profile="+encodeURIComponent(profile.handle));}}>Share profile</button></>
    :<div className="lk-profile-status">{status}<Link href="/social">Open social sign-in ↗</Link></div>}
    <div className="lk-profile-tabs" role="tablist" aria-label="Profile activity">
      {(["Posts","Tokens"] as const).map(t=><button type="button" key={t}
        role="tab" aria-selected={tab===t} className={t===tab?"active":""} onClick={()=>setTab(t)}>
        {t==="Posts"?"▦":"ϟ"}<span>{t}</span></button>)}
    </div>
    {tab==="Posts"?(posts.length?
      <><div className="lk-profile-posts">{posts.map(p=><article key={p.id}><p>{p.body}</p>
        <ApprovedPostMedia url={p.media_url??null} kind={p.media_kind??null}/>
        <small>{relativeDate(p.created_at)} · {p.comment_count} replies · {p.like_count??0} likes · {p.repost_count??0} reposts</small></article>)}</div>
      {nextProfileCursor&&<button className="lk-m15-profile-load" type="button"
        disabled={moreBusy} onClick={()=>{void loadMoreProfilePosts();}}>
        {moreBusy?"Loading…":"Load older verified posts ↓"}</button>}</>:
      <div className="lk-profile-empty"><h2>Get started</h2><p>Share your first creator post on Looke.</p>
        <button onClick={onCreate} type="button">Make your first post</button></div>):
      <div className="lk-profile-empty"><h2>Ultra EVM creator coins</h2>
        <p>Holdings and ownership appear only with verified Ultra EVM Testnet evidence.</p>
        <Link href="/trade">Open trading ↗</Link></div>}
  </div>;
}
