"use client";

import { useCallback, useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import Link from "next/link";
import { getAddress, isAddress } from "viem";
import {connectUltraEvmWallet,requireUltraEvmTestnet} from "../../lib/ultra-evm-wallet";
import "./social.css";
import "../../components/experience/m15.css";
import "../../components/experience/m16.css";
import {AssetEvidence,ApprovedPostMedia} from "../../components/experience/AssetEvidence";
import {EngagementActions} from "../../components/experience/EngagementActions";
import {CreatorAnalytics,AccountControls,ModerationConsole} from "../../components/experience/M18CreatorPanels";
import {PointsDashboard} from "../../components/experience/M19PointsDashboard";
import {PointsOperator} from "../../components/experience/M19PointsOperator";
import {AccountIntegrity,BackendOperations} from "../../components/experience/M20BackendPanels";
import {M21SecurityLab} from "../../components/experience/M21SecurityLab";
import {M22BetaLab} from "../../components/experience/M22BetaLab";
import {M23AcceptanceLab} from "../../components/experience/M23AcceptanceLab";
import {M24AuditReview} from "../../components/experience/M24AuditReview";
import {M25OperatorAcceptance} from "../../components/experience/M25OperatorAcceptance";
import {M26ExternalVerification} from "../../components/experience/M26ExternalVerification";
import {M27VerificationLab} from "../../components/experience/M27VerificationLab";
import {M28RealProofLab} from "../../components/experience/M28RealProofLab";
import {M29OperatorEvidence} from "../../components/experience/M29OperatorEvidence";
import {M30OperatorRun} from "../../components/experience/M30OperatorRun";
import {M31SourcesLab} from "../../components/experience/M31SourcesLab";
import {M32ReconciliationLab} from "../../components/experience/M32ReconciliationLab";
import {M33LiveIntegrationLab} from "../../components/experience/M33LiveIntegrationLab";
import {M34FinalAcceptance} from "../../components/experience/M34FinalAcceptance";
import "../../components/experience/m17.css";

type Wallet = {request:(args:{method:string;params?:unknown[]})=>Promise<unknown>};
type User = {address:string;handle:string;suspended:boolean};
type Profile = {address:string;handle:string;display_name:string;bio:string;avatar_url:string|null;created_at:string;follower_count?:number;following_count?:number;is_following?:boolean;post_count?:number;engagement_30d?:number};
type Post = {id:string;author:string;body:string;asset_chain:string|null;asset_type:string|null;asset_id:string|null;media_url?:string|null;media_kind?:string|null;created_at:string;handle:string;display_name:string;avatar_url:string|null;comment_count:number;follower_count:number;
 event_id?:string;reposted_by_handle?:string|null;like_count:number;repost_count:number;
 liked_by_me:boolean;reposted_by_me:boolean;bookmarked_by_me:boolean};
type Comment = {id:string;post_id:string;author:string;body:string;created_at:string;handle:string;display_name:string};
type Tab = "feed"|"discover"|"profile"|"activity"|"analytics"|"points"|"points-review"|"integrity"|"backend"|"security"|"beta"|"acceptance"|"audit"|"operations"|"verification"|"rehearsal"|"real-evidence"|"operator-evidence"|"operator-run"|"source-gates"|"source-reconcile"|"live-integrations"|"final-acceptance"|"controls"|"moderation"|"messages";
type ActivityFilter="all"|"likes"|"reposts"|"bookmarks"|"following";
type ActivityEvent={event_id:string;kind:"likes"|"reposts"|"bookmarks";created_at:string;
 post_id:string;body:string;handle:string;display_name:string;author:string;
 media_url:string|null;media_kind:string|null};
type FollowingProfile={address:string;handle:string;display_name:string;created_at:string;avatar_url:string|null};

function injected():Wallet|null {return typeof window==="undefined"?null:((window as Window&{ethereum?:Wallet}).ethereum??null);}
function errText(error:unknown){return error instanceof Error?error.message:"Request failed. Try again.";}
async function get<T>(params:Record<string,string>){
  const res=await fetch(`/api/social?${new URLSearchParams(params)}`,{cache:"no-store"});
  const body=await res.json() as T&{error?:string};
  if(!res.ok)throw new Error(body.error||"Social network is unavailable.");
  return body;
}
async function post<T>(endpoint:"social"|"auth",body:Record<string,unknown>){
  const res=await fetch(endpoint==="social"?"/api/social":"/api/social/auth",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),
    credentials:"same-origin",cache:"no-store",
  });
  const data=await res.json() as T&{error?:string};
  if(!res.ok)throw new Error(data.error||"Social action could not be completed.");
  return data;
}
function dateLabel(raw:string){const d=new Date(raw);return Number.isNaN(d.getTime())?"Unknown date":d.toLocaleString();}
function abbrev(wallet:string){return wallet.length>14?`${wallet.slice(0,7)}…${wallet.slice(-5)}`:wallet;}
function AssetBadge({item}:{item:Post}){
  if(item.asset_type!=="token"||item.asset_chain!=="ultra-evm"||!item.asset_id)return null;
  return <div className="social-asset"><span>◇ Ultra EVM · Creator token</span>
    <strong>{abbrev(item.asset_id)}</strong>
    <a href={`https://evmexplorer.testnet.ultra.io/address/${item.asset_id}`}
       rel="noopener noreferrer" target="_blank">View reference ↗</a>
    <small>Community reference only · Ownership and price not verified by this post</small>
  </div>;
}
export default function SocialPage(){
  const [user,setUser]=useState<User|null>(null);
  const [tab,setTab]=useState<Tab>("feed");
  const [activityFilter,setActivityFilter]=useState<ActivityFilter>("all");
  const [activityEvents,setActivityEvents]=useState<ActivityEvent[]>([]);
  const [followingProfiles,setFollowingProfiles]=useState<FollowingProfile[]>([]);
  const [activityNotice,setActivityNotice]=useState("");
  const [mode,setMode]=useState<"global"|"following">("global");
  const [working,setWorking]=useState(false);
  const [notice,setNotice]=useState("");
  const [backendStatus,setBackendStatus]=useState<"checking"|"online"|"unconfigured">("checking");
  const [feed,setFeed]=useState<Post[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const [search,setSearch]=useState("");
  const [directorySort,setDirectorySort]=useState<"recent"|"engaged">("recent");
  const [directory,setDirectory]=useState<Profile[]>([]);
  const [focused,setFocused]=useState<Profile|null>(null);
  const [myProfile,setMyProfile]=useState<Profile|null>(null);
  const [draftHandle,setDraftHandle]=useState("");
  const [draftName,setDraftName]=useState("");
  const [draftBio,setDraftBio]=useState("");
  const [draftAvatar,setDraftAvatar]=useState("");
  const [newPost,setNewPost]=useState("");
  const [feedSearchInput,setFeedSearchInput]=useState("");
  const [feedSearch,setFeedSearch]=useState("");
  const [selectedMedia,setSelectedMedia]=useState<File|null>(null);
  const [mediaUploadId,setMediaUploadId]=useState<string|null>(null);
  const [mediaUploadStatus,setMediaUploadStatus]=useState("");
  const [mediaBusy,setMediaBusy]=useState(false);
  const [mediaServiceReady,setMediaServiceReady]=useState(false);
  useEffect(()=>{
    let alive=true;
    void fetch("/api/experience/media",{cache:"no-store"})
      .then(async r=>r.json() as Promise<{enabled:boolean}>)
      .then(info=>{if(alive)setMediaServiceReady(info.enabled===true);})
      .catch(()=>{if(alive)setMediaServiceReady(false);});
    return ()=>{alive=false;};
  },[]);
  const [mediaKind,setMediaKind]=useState<"image"|"video">("image");
  const [localPreview,setLocalPreview]=useState<{url:string;kind:"image"|"video"}|null>(null);
  useEffect(()=>{
    return ()=>{if(localPreview)URL.revokeObjectURL(localPreview.url);};
  },[localPreview]);
  useEffect(()=>{
    const t=window.setTimeout(()=>{setFeedSearch(feedSearchInput.trim().slice(0,64));},350);
    return ()=>window.clearTimeout(t);
  },[feedSearchInput]);
  function inspectLocalFile(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];if(!file)return;
    const image=["image/jpeg","image/png","image/webp","image/gif"].includes(file.type);
    const video=["video/mp4","video/webm"].includes(file.type);
    if((!image&&!video)||file.size>(image?5_000_000:20_000_000)){
      setNotice("Select JPEG, PNG, WEBP, GIF up to 5 MB or MP4, WEBM up to 20 MB.");
      e.target.value="";return;
    }
    setLocalPreview({url:URL.createObjectURL(file),kind:image?"image":"video"});
    setSelectedMedia(file);setMediaUploadId(null);
    setMediaUploadStatus("Selected locally. Confirm upload to your hosted account before publishing.");
    setNotice("Media stays local until you explicitly select Upload for review.");
    e.target.value="";
  }
  async function authorizeAndUpload(){
    if(!user||!selectedMedia||!localPreview||mediaBusy)return;
    setMediaBusy(true);setMediaUploadStatus("");setNotice("");
    try{
      const kind=localPreview.kind;
      const permitted=await fetch("/api/experience/media",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({action:"authorize",kind,mime:selectedMedia.type,bytes:selectedMedia.size}),
      });
      const auth=await permitted.json() as {
        intentId:string;uploadUrl:string;apiKey:string;
        fields:Record<string,string>;error?:string;
      };
      if(!permitted.ok)throw new Error(auth.error||"Media upload is not approved.");
      if(!/^https:\/\/api\.cloudinary\.com\/v1_1\/[a-zA-Z0-9_-]+\/(image|video)\/upload$/.test(auth.uploadUrl))
        throw new Error("Media authorization returned an unsupported provider endpoint.");
      if(!auth.intentId||!auth.fields?.signature||!auth.apiKey)throw new Error("Incomplete upload authorization.");
      const payload=new FormData();
      payload.append("file",selectedMedia,selectedMedia.name);
      for(const [key,value] of Object.entries(auth.fields))payload.append(key,value);
      payload.append("api_key",auth.apiKey);
      setMediaUploadStatus("Uploading the selected file to authorized hosting…");
      const upload=await fetch(auth.uploadUrl,{method:"POST",body:payload,cache:"no-store"});
      if(!upload.ok)throw new Error("Hosting provider rejected the upload.");
      // Browser metadata is NOT trusted; the server independently inspects
      // the asset through the provider's authenticated administration API.
      setMediaUploadStatus("Checking provider evidence and wallet ownership…");
      const verify=await fetch("/api/experience/media",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({action:"confirm",intentId:auth.intentId}),
      });
      const proof=await verify.json() as {confirmed:boolean;intentId:string;error?:string};
      if(!verify.ok||!proof.confirmed||proof.intentId!==auth.intentId)
        throw new Error(proof.error||"Provider verification did not complete.");
      setMediaUploadId(proof.intentId);
      setMediaUploadStatus("Upload verified. It will be hidden from the public feed until moderator approval.");
    }catch(error){
      setMediaUploadId(null);
      setMediaUploadStatus(errText(error));
    }finally{setMediaBusy(false);}
  }

  const [assetType,setAssetType]=useState<"none"|"token">("none");
  const [assetId,setAssetId]=useState("");
  const [commentFor,setCommentFor]=useState("");
  const [comments,setComments]=useState<Comment[]>([]);
  const [commentText,setCommentText]=useState("");

  const refreshMe=useCallback(async()=>{
    const response=await fetch("/api/social/auth",{cache:"no-store"});
    const data=await response.json() as {authenticated:boolean;user:User|null;error?:string};
    if(response.ok){setUser(data.user);setBackendStatus("online");}
    else {setBackendStatus("unconfigured");throw new Error(data.error||"Social API unavailable.");}
    if(data.user){
      try{
        const result=await get<{profile:Profile}>({action:"me"});
        setMyProfile(result.profile);
        setDraftHandle(result.profile?.handle||"");setDraftName(result.profile?.display_name||"");
        setDraftBio(result.profile?.bio||"");setDraftAvatar(result.profile?.avatar_url||"");
      }catch(e){setNotice(errText(e));}
    }else{setMyProfile(null);}
  },[]);

  const loadFeed=useCallback(async(append=false,nextCursor?:string|null)=>{
    const params:Record<string,string>={action:"feed",scope:mode};
    if(feedSearch)params.search=feedSearch;
    if(append&&nextCursor)params.cursor=nextCursor;
    try{
      const data=await get<{posts:Post[];nextCursor:string|null}>(params);
      setFeed(previous=>append?[...previous,...data.posts.filter(p=>!previous.some(x=>x.id===p.id))]:data.posts);
      setCursor(data.nextCursor);
      setBackendStatus("online");
    }catch(error){if(!append){setFeed([]);setCursor(null);}setBackendStatus("unconfigured");setNotice(errText(error));}
  },[mode,feedSearch]);

  const loadPersonalActivity=useCallback(async()=>{
    if(!user?.address){setActivityEvents([]);setFollowingProfiles([]);return;}
    setActivityNotice("");
    try{
      const params=new URLSearchParams();
      params.set("view",activityFilter==="following"?"following":"activity");
      if(activityFilter!=="following")params.set("kind",activityFilter);
      const response=await fetch("/api/social/engagement?"+params.toString(),
        {cache:"no-store",credentials:"same-origin"});
      const value=await response.json() as {
        events?:ActivityEvent[];profiles?:FollowingProfile[];error?:string;
      };
      if(!response.ok)throw new Error(value.error||"Your creator activity is unavailable.");
      if(activityFilter==="following"){
        if(!Array.isArray(value.profiles))throw new Error("Unverified following data.");
        setFollowingProfiles(value.profiles);setActivityEvents([]);
      }else{
        if(!Array.isArray(value.events))throw new Error("Unverified creator activity.");
        setActivityEvents(value.events);setFollowingProfiles([]);
      }
    }catch(e){setActivityEvents([]);setFollowingProfiles([]);
      setActivityNotice(errText(e));}
  },[user?.address,activityFilter]);
  useEffect(()=>{if(tab==="activity")void loadPersonalActivity();},[tab,loadPersonalActivity]);
  const lookupDirectory=useCallback(async(value:string)=>{
    try{
      const r=await get<{profiles:Profile[]}>({action:"directory",search:value,sort:directorySort});
      setDirectory(r.profiles);
    }catch(e){setNotice(errText(e));}
  },[directorySort]);

  useEffect(()=>{void refreshMe().catch(e=>setNotice(errText(e)));},[refreshMe]);
  useEffect(()=>{void loadFeed();},[loadFeed]);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const linked=params.get("profile");
    if(linked&&/^[a-z][a-z0-9_]{2,23}$/.test(linked))void openProfile(linked);
    if(params.get("tab")==="controls")setTab("controls");
    if(params.get("tab")==="analytics")setTab("analytics");
    if(params.get("tab")==="points")setTab("points");
  },[]);
  useEffect(()=>{if(tab==="discover")void lookupDirectory(search);},[tab,lookupDirectory,search]);

  async function signIn(){
    const wallet=injected();
    if(!wallet){setNotice("An injected EVM wallet is required for Looke social sign-in.");return;}
    setWorking(true);setNotice("");
    try{
      const walletAddress=await connectUltraEvmWallet(wallet);
      await requireUltraEvmTestnet(wallet);
      const challenge=await post<{challengeId:string;message:string}>("auth",{action:"challenge",address:walletAddress});
      const signature=await wallet.request({method:"personal_sign",params:[challenge.message,walletAddress]});
      if(typeof signature!=="string")throw new Error("Wallet did not sign the challenge.");
      await requireUltraEvmTestnet(wallet);
      await post("auth",{action:"verify",challengeId:challenge.challengeId,signature});
      await refreshMe();
      await loadFeed();
      setNotice("Wallet sign-in verified. No token approval or blockchain transaction was performed.");
    }catch(e){setNotice(errText(e));}
    finally{setWorking(false);}
  }

  async function signOut(){
    setWorking(true);setNotice("");
    try{await post("auth",{action:"logout"});setUser(null);setMyProfile(null);setFocused(null);
      setActivityEvents([]);setFollowingProfiles([]);setTab("feed");setNotice("Signed out.");}
    catch(e){setNotice(errText(e));}finally{setWorking(false);}
  }

  async function updateProfile(e:FormEvent){
    e.preventDefault();if(!user)return;
    setWorking(true);setNotice("");
    try{
      await post("social",{action:"profile",handle:draftHandle,displayName:draftName,bio:draftBio,avatarUrl:draftAvatar});
      await refreshMe();setNotice("Profile saved to Looke social database.");
    }catch(e){setNotice(errText(e));}finally{setWorking(false);}
  }

  async function publish(e:FormEvent){
    e.preventDefault();if(!user)return;
    setWorking(true);setNotice("");
    try{
      const asset=assetType==="token"?{assetType:"token",assetChain:"ultra-evm",assetId}:null;
      if(selectedMedia&&!mediaUploadId)throw new Error("Upload and verify your selected file before publishing, or remove the file.");
      const result=await post<{note?:string}>("social",{
        action:"post",body:newPost,asset,mediaUploadId,
      });
      setNewPost("");setAssetType("none");setAssetId("");
      setSelectedMedia(null);setMediaUploadId(null);setLocalPreview(null);
      setMediaUploadStatus("");
      setMode("global");await loadFeed();
      setNotice(result.note||"Text post published to the moderated social database.");
    }catch(e){setNotice(errText(e));}finally{setWorking(false);}
  }

  async function viewComments(postId:string){
    setNotice("");setCommentFor(postId);setCommentText("");
    try{const data=await get<{comments:Comment[]}>({action:"comments",postId});setComments(data.comments);}
    catch(e){setNotice(errText(e));setComments([]);}
  }

  async function addComment(e:FormEvent){
    e.preventDefault();if(!commentFor||!user)return;
    setWorking(true);
    try{
      await post("social",{action:"comment",postId:commentFor,body:commentText});
      setCommentText("");await viewComments(commentFor);await loadFeed();
      setNotice("Comment published.");
    }catch(e){setNotice(errText(e));}finally{setWorking(false);}
  }

  async function followUser(target:string,action:"follow"|"unfollow"|"block"){
    if(!user)return;
    setWorking(true);setNotice("");
    try{
      await post("social",{action,target});
      if(action==="block"){setFocused(null);setNotice("User blocked. Their posts and replies are excluded from your feed.");}
      else setNotice(action==="follow"?"Following profile.":"Unfollowed profile.");
      if(focused)await openProfile(focused.handle);
      await loadFeed();
    }catch(e){setNotice(errText(e));}finally{setWorking(false);}
  }

  async function openProfile(profileHandle:string){
    try{
      const r=await get<{profile:Profile}>({action:"profile",handle:profileHandle});
      setFocused(r.profile);setTab("profile");setNotice("");
    }catch(e){setFocused(null);setNotice(errText(e));}
  }

  async function reportPost(id:string){
    if(!user){setNotice("Sign in to report content.");return;}
    const reason=window.prompt("Report reason: spam, scam, harassment, impersonation, or other","spam");
    if(!reason)return;
    setWorking(true);
    try{
      await post("social",{action:"report",targetType:"post",targetId:id,reason:reason.toLowerCase()});
      setNotice("Report recorded for moderator review. Reports do not automatically delete content.");
    }catch(e){setNotice(errText(e));}finally{setWorking(false);}
  }

  return <main className="social-shell">
    <header className="social-top"><Link href="/" className="social-logo">✳ looke<span>.</span><small> / social</small></Link>
      <div className="social-topnote"><span className="social-dot"/> ULTRA EVM TESTNET · SOCIAL</div>
      {user?<button onClick={()=>void signOut()} disabled={working} className="social-wallet">{abbrev(user.address)} · Sign out</button>
        :<button onClick={()=>void signIn()} disabled={working} className="social-wallet">{working?"Waiting for wallet…":"Sign in with wallet ↗"}</button>}
    </header>
    <div className="social-layout">
      <aside className="social-aside">
        <span className="social-eyebrow">LOOKE COMMUNITY</span>
        <nav>
          {([["feed","⌂ Feed"],["discover","◇ Discover"],["profile","◎ Profile"],["activity","♡ My Activity"],["analytics","▥ Analytics"],["points","◆ Looke Points"],["points-review","⊞ Points review"],["integrity","▤ Integrity"],["backend","◈ Backend checks"],["security","⛨ Security acceptance"],["beta","◈ Testnet beta prep"],["acceptance","⛨ Controlled acceptance"],["audit","⛨ Launch audit"],["operations","◈ Final acceptance"],["verification","⛨ External verification"],["rehearsal","◈ M27 release rehearsal"],["real-evidence","◈ M28 real evidence"],["operator-evidence","⛨ M29 evidence collection"],["operator-run","⛨ M30 live acceptance"],["source-gates","◈ M31 real source compatibility"],["source-reconcile","◈ M32 source reconciliation"],["live-integrations","◇ M33 live integrations"],["final-acceptance","◈ M34 final acceptance"],["controls","⚙ Account controls"],["moderation","⚑ Moderation"],["messages","▤ Messages"]] as const)
            .map(([key,label])=><button key={key} type="button" className={tab===key?"selected":""} onClick={()=>{setTab(key);setFocused(null);}}>{label}<span>↗</span></button>)}
        </nav>
        <div className="social-sidefoot"><strong>For the creators.</strong><p>Follow creators and discuss Ultra EVM tokens and communities.</p>
          <p>Posts reference assets; they do not verify holdings or represent investment advice.</p></div>
      </aside>
      <section className="social-main">
        <div className="social-overline">M34 / FINAL END-TO-END ACCEPTANCE · NO-GO</div>
        <div className="social-hero"><h1>{tab==="feed"?"People. Ideas. Culture.":tab==="discover"?"Find your people.":tab==="messages"?"Conversations.":tab==="activity"?"Your real activity.":tab==="analytics"?"Creator analytics.":tab==="points"?"Looke Points.":tab==="points-review"?"Points evidence review.":tab==="integrity"?"Account integrity.":tab==="backend"?"Backend verification.":tab==="security"?"Testnet & security.":tab==="beta"?"Protected Testnet beta.":tab==="acceptance"?"Controlled Testnet acceptance.":tab==="audit"?"Independent launch audit.":tab==="operations"?"Operator acceptance.":tab==="verification"?"External acceptance verification.":tab==="rehearsal"?"Protected release rehearsal.":tab==="real-evidence"?"Real independent evidence.":tab==="operator-evidence"?"Original operator evidence collection.":tab==="operator-run"?"Real operator acceptance prerequisites.":tab==="source-gates"?"Current source compatibility and blockers.":tab==="source-reconcile"?"Real database lineage reconciliation.":tab==="live-integrations"?"Live Ultra integration proof console.":tab==="final-acceptance"?"Final independent Testnet acceptance.":tab==="controls"?"Your account.":tab==="moderation"?"Review queue.":"Your identity."}</h1>
          <p>Share what you create. Discover the people shaping Ultra. All displayed activity comes from the Looke social database.</p></div>
        {backendStatus==="unconfigured"&&<div className="social-warning"><strong>Backend not ready.</strong> Social database or sign-in configuration is unavailable. No demo profiles or fake posts are shown.</div>}
        {notice&&<div className="social-notice" role="status">{notice}</div>}
        {tab==="feed"&&<>
          {user&&<form className="social-card social-composer" onSubmit={e=>void publish(e)}>
            <div className="social-eyebrow">NEW POST · @{user.handle}</div>
            <textarea aria-label="Write a Looke post" required maxLength={1000} placeholder="What are you creating on Ultra?" value={newPost} onChange={e=>setNewPost(e.target.value)}/>
            <div className="lk-m15-media-draft">
              <label htmlFor="looke-local-media">Preview image or video (not uploaded)</label>
              <input id="looke-local-media" type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
                onChange={inspectLocalFile}/>
              {localPreview&&(localPreview.kind==="image"?
                <img src={localPreview.url} alt="Local, unpublished media preview" className="lk-m15-local-preview"/>:
                <video src={localPreview.url} controls preload="none" className="lk-m15-local-preview"/>)}
              {localPreview&&<button className="lk-m15-local-clear" type="button" onClick={()=>{
                setLocalPreview(null);setSelectedMedia(null);setMediaUploadId(null);setMediaUploadStatus("");
              }}>Remove selected media</button>}
              {selectedMedia&&<button className="lk-m15-upload-action" type="button"
                disabled={!mediaServiceReady||mediaBusy||!!mediaUploadId||working} onClick={()=>void authorizeAndUpload()}>
                {mediaBusy?"Uploading / verifying…":mediaUploadId?"Provider verified ✓":mediaServiceReady?"Upload file for moderator review ↗":"Upload for review (hosting not enabled)"}
              </button>}
              {mediaUploadStatus&&<p role="status">{mediaUploadStatus}</p>}
              {!mediaServiceReady&&<p role="status">Secure uploads require a configured hosted-media provider and approved moderation.</p>}
              <p>Files are transferred only when you press Upload. An authorized hosting provider and operator moderation must be configured. Your file is not publicized on Looke before approval.</p>
            </div>
            <div className="social-compose-bottom">
              <select aria-label="Reference an asset" value={assetType} onChange={e=>{setAssetType(e.target.value as "none"|"token");setAssetId("");}}>
                <option value="none">No asset reference</option><option value="token">Share Ultra EVM token</option>
              </select>
              {assetType!=="none"&&<input aria-label="Asset identifier" required placeholder="0x Ultra EVM creator token address" value={assetId} onChange={e=>setAssetId(e.target.value)}/>}
              <button type="submit" disabled={working||!newPost.trim()||mediaBusy||(!!selectedMedia&&!mediaUploadId)}>Publish →</button>
            </div>
            <small>Public, plain-text posts · No financial transaction or signature required after sign-in.</small>
          </form>}
          {!user&&<div className="social-signin-note">Sign in with your Ultra EVM Testnet wallet to create a profile, post, comment or follow creators.</div>}
          <div className="lk-m15-social-search"><span aria-hidden="true">⌕</span>
            <input type="search" value={feedSearchInput}
              onChange={e=>setFeedSearchInput(e.target.value)} maxLength={64}
              aria-label="Search real creator posts" placeholder="Search posts, handles, creators…"/>
          </div>
          <div className="social-list-heading"><h2>Community feed</h2><div className="social-tabs">
            <button className={mode==="global"?"chosen":""} onClick={()=>setMode("global")}>Latest</button>
            <button className={mode==="following"?"chosen":""} disabled={!user} onClick={()=>setMode("following")}>Following</button></div></div>
          {feed.length===0?<div className="social-empty">No real posts to show yet. New posts will appear after a creator publishes and the backend is enabled.</div>
            :feed.map(item=><article key={item.event_id??item.id} className="social-card social-post">
              {item.reposted_by_handle&&<div className="lk-m17-repost-banner">↻ @{item.reposted_by_handle} reposted this creator post</div>}
              <div className="social-post-top"><div className="social-avatar">{(item.display_name||item.handle).slice(0,1).toUpperCase()}</div><div>
                <button onClick={()=>void openProfile(item.handle)} className="social-handle">{item.display_name||item.handle} <span>@{item.handle}</span></button>
                <small>{dateLabel(item.created_at)} · {abbrev(item.author)} · {item.follower_count} followers</small></div></div>
              <p className="social-post-body">{item.body}</p>
              <ApprovedPostMedia url={item.media_url??null} kind={item.media_kind??null}/>
              <AssetBadge item={item}/>
              {item.asset_type==="token"&&item.asset_chain==="ultra-evm"&&item.asset_id&&
                <AssetEvidence kind="token" id={item.asset_id}/>}
              <EngagementActions postId={item.id} initial={item}
                authenticated={!!user} onChanged={()=>{void loadFeed();}}/>
              <div className="social-post-actions">
                <button onClick={()=>void viewComments(item.id)}>◉ {item.comment_count} comments</button>
                <button disabled={!user||user.address===item.author||working} onClick={()=>void reportPost(item.id)}>⚑ Report</button>
                <span>Public post · Real account</span>
              </div>
              {commentFor===item.id&&<section className="social-comments">
                <strong>Comments</strong>
                {comments.length===0&&<p className="social-muted">No visible replies.</p>}
                {comments.map(c=><div key={c.id} className="social-comment"><strong>@{c.handle}</strong><p>{c.body}</p></div>)}
                {user&&<form onSubmit={e=>void addComment(e)}><input required maxLength={500} placeholder="Write a reply..." value={commentText} onChange={e=>setCommentText(e.target.value)}/><button disabled={working||!commentText.trim()}>Reply</button></form>}
                <button className="social-hide" onClick={()=>setCommentFor("")}>Close replies</button>
              </section>}
            </article>)}
          {cursor&&<button className="social-load-more" onClick={()=>void loadFeed(true,cursor)}>Load older posts →</button>}
        </>}
        {tab==="discover"&&<div className="social-card">
          <div className="social-card-title"><h2>Discover creators</h2><span>REAL DATABASE PROFILES</span></div>
          <input className="social-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search handle or display name" aria-label="Search creators"/>
          <div className="lk-m18-sort" aria-label="Order real creator discovery">
            <button type="button" className={directorySort==="recent"?"active":""} onClick={()=>setDirectorySort("recent")}>Newest accounts</button>
            <button type="button" className={directorySort==="engaged"?"active":""} onClick={()=>setDirectorySort("engaged")}>Engagement · 30 days</button>
          </div>
          {directory.length===0?<div className="social-empty">No matching public profiles.</div>:directory.map(p=><div className="social-directory" key={p.address}>
            <div className="social-avatar">{p.display_name?.slice(0,1).toUpperCase()||"L"}</div>
            <div><strong>{p.display_name}</strong><small>@{p.handle} · {abbrev(p.address)}</small>
              <small className="lk-m18-counts">{p.follower_count??0} genuine followers · {p.post_count??0} visible posts · {p.engagement_30d??0} recent interactions</small></div>
            <button onClick={()=>void openProfile(p.handle)}>View profile ↗</button>
          </div>)}
        </div>}
        {tab==="activity"&&(user?<section className="social-card">
          <div className="social-card-title"><h2>My creator activity</h2><span>WALLET-SCOPED · REAL RECORDS</span></div>
          <p className="social-muted">Likes, reposts and saved posts belong to your current signed-in wallet. Bookmarks are private and never counted publicly.</p>
          <div className="lk-m17-activity-switch" aria-label="Activity category">
            {(["all","likes","reposts","bookmarks","following"] as const).map(kind=>
              <button type="button" key={kind} className={activityFilter===kind?"active":""}
                onClick={()=>setActivityFilter(kind)}>
                {kind==="all"?"All":kind==="following"?"Following":kind==="bookmarks"?"Saved":kind==="reposts"?"Reposts":"Likes"}
              </button>)}
          </div>
          {activityNotice&&<p role="status" className="social-warning">{activityNotice}</p>}
          {activityFilter==="following"?(followingProfiles.length?
            followingProfiles.map(p=><div key={p.address} className="lk-m17-activity-row">
              <strong>@{p.handle}</strong><p>{p.display_name}</p>
              <small>Following since {dateLabel(p.created_at)}</small>
              <button type="button" onClick={()=>void openProfile(p.handle)}>View creator ↗</button>
            </div>):<div className="social-empty">You are not following any visible creators yet.</div>):
            (activityEvents.length?activityEvents.map(item=>
              <article key={item.event_id} className="lk-m17-activity-row">
                <strong>{item.kind==="likes"?"♥ Liked":item.kind==="reposts"?"↻ Reposted":"▣ Saved"} · @{item.handle}</strong>
                <p>{item.body}</p>
                <ApprovedPostMedia url={item.media_url} kind={item.media_kind}/>
                <small>{dateLabel(item.created_at)} · verified account activity</small>
                <button type="button" onClick={()=>void openProfile(item.handle)}>View creator ↗</button>
              </article>):<div className="social-empty">No real {activityFilter==="all"?"account activity":activityFilter} found for this wallet.</div>)}
        </section>:<div className="social-signin-note">Sign in with your Ultra EVM Testnet wallet to view your private bookmarks and engagement history.</div>)}
        {tab==="analytics"&&(user?<CreatorAnalytics/>:<div className="social-signin-note">Sign in with your Ultra EVM wallet to see your own verified engagement figures.</div>)}
        {tab==="points"&&(user?<PointsDashboard/>:<div className="social-signin-note">Sign in with your Ultra EVM Testnet wallet to view genuine Looke Points and vesting records.</div>)}
        {tab==="points-review"&&(user?<PointsOperator/>:<div className="social-signin-note">An authorized moderator wallet is required to review off-chain Points evidence.</div>)}
        {tab==="integrity"&&(user?<AccountIntegrity/>:<div className="social-signin-note">Sign in to inspect your own real creator index and Points accounting records.</div>)}
        {tab==="backend"&&(user?<BackendOperations/>:<div className="social-signin-note">An authorized moderator wallet is required for backend integrity or risk review.</div>)}
        {tab==="security"&&(user?<M21SecurityLab/>:<div className="social-signin-note">An authorized reviewer wallet is required to inspect Testnet acceptance evidence. No wallet sign-in or transaction will be initiated by this page.</div>)}
        {tab==="beta"&&(user?<M22BetaLab/>:<div className="social-signin-note">The protected Testnet beta preparation page requires an existing authorized moderator session; it does not sign in or broadcast financial transactions.</div>)}
        {tab==="acceptance"&&(user?<M23AcceptanceLab/>:<div className="social-signin-note">An existing authorized moderator session is required. Wallet acceptance is nonfinancial and release is still NO-GO.</div>)}
        {tab==="audit"&&(user?<M24AuditReview/>:<div className="social-signin-note">An authorized moderator session is required for independent audit readiness. No release or financial action is available.</div>)}
        {tab==="operations"&&(user?<M25OperatorAcceptance/>:<div className="social-signin-note">Operator-only authenticated acceptance review. Public launch, token claims and trading remain disabled.</div>)}
        {tab==="verification"&&(user?<M26ExternalVerification/>:<div className="social-signin-note">Independent external release verification requires an authenticated operator. Public beta remains NO-GO.</div>)}
        {tab==="rehearsal"&&(user?<M27VerificationLab/>:<div className="social-signin-note">M27 release rehearsal requires an authenticated operator and real evidence. Public beta stays NO-GO.</div>)}
        {tab==="real-evidence"&&(user?<M28RealProofLab/>:<div className="social-signin-note">M28 real evidence inspection requires an authenticated moderator. Public beta remains NO-GO.</div>)}
        {tab==="operator-evidence"&&(user?<M29OperatorEvidence/>:<div className="social-signin-note">M29 evidence collection requires an authenticated moderator and actual source proofs. Public beta remains NO-GO.</div>)}
        {tab==="operator-run"&&<M30OperatorRun/>}
        {tab==="source-gates"&&<M31SourcesLab/>}
        {tab==="source-reconcile"&&<M32ReconciliationLab/>}
        {tab==="live-integrations"&&<M33LiveIntegrationLab/>}
        {tab==="final-acceptance"&&<M34FinalAcceptance/>}
        {tab==="controls"&&(user?<AccountControls onChanged={()=>{void loadFeed();}}/>:
          <div className="social-signin-note">Sign in to change private notification preferences and muted accounts.</div>)}
        {tab==="moderation"&&(user?<ModerationConsole/>:
          <div className="social-signin-note">An authorized moderator wallet session is required to inspect reports or media.</div>)}
        {tab==="profile"&&(focused?<div className="social-card social-profile">
          <div className="social-profile-avatar">{(focused.display_name||focused.handle).slice(0,1).toUpperCase()}</div>
          <h2>{focused.display_name}</h2><span>@{focused.handle}</span><p>{focused.bio||"This creator hasn't written a bio yet."}</p>
          <div className="social-stats"><strong>{focused.follower_count??0} followers</strong><strong>{focused.following_count??0} following</strong></div>
          {user&&user.address!==focused.address&&<div className="social-profile-actions">
            <button onClick={()=>void followUser(focused.address,focused.is_following?"unfollow":"follow")} disabled={working}>{focused.is_following?"Unfollow":"Follow"} ↗</button>
            <button className="social-block" onClick={()=>void followUser(focused.address,"block")} disabled={working}>Block account</button>
          </div>}
          <button className="social-hide" onClick={()=>setFocused(null)}>Back to my profile</button>
        </div>:user&&myProfile?<form className="social-card social-edit-profile" onSubmit={e=>void updateProfile(e)}>
          <h2>Creator profile</h2><p>Connected wallet: {user.address}. Only a signed-in wallet can change its own profile.</p>
          <label>Handle<input value={draftHandle} required maxLength={24} onChange={e=>setDraftHandle(e.target.value)}/></label>
          <label>Display name<input value={draftName} required maxLength={60} onChange={e=>setDraftName(e.target.value)}/></label>
          <label>Bio<textarea maxLength={240} value={draftBio} onChange={e=>setDraftBio(e.target.value)}/></label>
          <label>Avatar HTTPS URL (optional)<input value={draftAvatar} maxLength={500} onChange={e=>setDraftAvatar(e.target.value)}/></label>
          <button disabled={working}>Save profile →</button>
        </form>:<div className="social-empty">Sign in with your wallet to create a real creator profile.</div>)}
        {tab==="messages"&&<div className="social-card social-messages">
          <div className="social-message-icon">▤</div><h2>Private conversations are in development.</h2>
          <p>The database foundation reserves encrypted envelopes and per-user public keys, but end-to-end encryption, key registration, device recovery, blocking checks, and security review are not complete.</p>
          <p><strong>Sending and receiving DMs are intentionally disabled.</strong> Looke will not store plaintext private messages or advertise unverified encryption.</p>
          <span>FOUNDATION ONLY · NO LIVE MESSAGES</span>
        </div>}
        <footer className="social-footer">Looke social · No fake followers, posts, rewards or messages · Ultra EVM-only creator platform <Link href="/">Back to Looke ↗</Link></footer>
      </section>
      <aside className="social-right"><span className="social-eyebrow">BUILD WITH PURPOSE</span><h3>Ultra culture,<br/>together.</h3>
        <p>Share Ultra EVM creator coins in public posts. Independently verify token ownership and value before acting.</p>
        <div className="social-divider"/><strong>COMMUNITY SAFETY</strong>
        <p>Signed wallet identities, rate-limited posting, blocking, reporting, and audited moderator actions.</p>
        <div className="social-divider"/><Link href="/trade">Explore trading terminal ↗</Link>
      </aside>
    </div>
  </main>;
}
