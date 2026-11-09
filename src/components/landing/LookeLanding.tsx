"use client";
import {useEffect,useRef,useState} from "react";
import {chaosAssets as asset} from "../../lib/chaos-assets";
import {useReduced,useOrbScroll} from "../../hooks/useOrbScroll";

export type LookeDestination = "Discover"|"Trending"|"Messages"|"Create"|"Uniq NFTs"|"Wallet";
type Props={onEnter:(screen:LookeDestination)=>void};
const beats=[
 {name:"01 / INTERRUPT",start:.11,end:.32,title:<>Break the<br/><em>pattern.</em></>,copy:"Ordinary is easy to recognize. Share the idea you can't quite explain — and can't stop thinking about."},
 {name:"02 / RECOMPOSE",start:.33,end:.54,title:<>Colour outside<br/><em>the code.</em></>,copy:"Every pixel has a pulse. Every creator deserves a place to do something different."},
 {name:"03 / AMPLIFY",start:.55,end:.76,title:<>Make some<br/><em>beautiful noise.</em></>,copy:"Ideas, digital collectibles, and creator tokens. An Ultra EVM social world built to move."},
 {name:"04 / REMEMBER",start:.77,end:.98,title:<>Leave a<br/><em>signal.</em></>,copy:"The best communities don't just get seen. They get felt."}
];
function Orb(){
 const runway=useRef<HTMLElement>(null),stage=useRef<HTMLDivElement>(null),vid=useRef<HTMLVideoElement>(null);
 const reduced=useReduced(),[playing,setPlaying]=useState(false),[status,setStatus]=useState<"loading"|"ready"|"error">("loading"),[stillFailed,setStillFailed]=useState(false);
 useOrbScroll(runway,stage,vid,reduced);
 useEffect(()=>{
  if(reduced){setStatus("ready");setPlaying(false);vid.current?.pause();return}
  const controller=new AbortController();let alive=true,objectUrl:string|undefined;const player=vid.current;
  const phone=matchMedia("(pointer: coarse)").matches&&Math.min(innerWidth,innerHeight)<=820;
  const source=phone?asset.phone:asset.desktop;
  setStatus("loading");setPlaying(false);
  (async()=>{try{
   const res=await fetch(source,{signal:controller.signal,mode:"cors"});
   if(!res.ok)throw Error("HTTP "+res.status);
   const complete=await res.blob();if(!alive||!player)return;
   objectUrl=URL.createObjectURL(complete);player.src=objectUrl;player.load();
   if(!document.hidden&&runway.current&&runway.current.getBoundingClientRect().bottom>0)await player.play();
  }catch(error){if(alive&&!controller.signal.aborted){console.warn("Looke motion failed: "+source,error);setStatus("error")}}})();
  return()=>{alive=false;controller.abort();if(player){player.pause();player.removeAttribute("src");player.load()}if(objectUrl)URL.revokeObjectURL(objectUrl)};
 },[reduced]);
 return <section id="looke-top" className="lch-runway" ref={runway} aria-label="Looke Good Chaos introduction"><div className="lch-stage" ref={stage}>
  <div className="lch-corners lch-mono"><span>ULTRA EVM SOCIAL</span><span>EXPERIMENT NO. 001</span></div>
  <div className="lch-orb">
    {!stillFailed?<img src={asset.still} alt="A sphere of pink, turquoise and yellow particles" className={"lch-still"+(playing?" lch-still-hide":"")} onError={()=>setStillFailed(true)}/>:<div className="lch-fallback" role="img" aria-label="Sphere image unavailable">✳</div>}
    {!reduced&&<video ref={vid} muted playsInline loop autoPlay preload="none" aria-hidden="true" className={"lch-video"+(playing?" lch-video-play":"")} onPlaying={()=>{setPlaying(true);setStatus("ready")}} onError={()=>setStatus("error")}/>}
  </div>
  <div className="lch-intro"><span className="lch-mono">A NEW SOCIAL SIGNAL<br/>FOR PEOPLE WHO FEEL MORE</span><h1>GOOD<br/><span>CHAOS.</span></h1><span className="lch-mono lch-intro-foot">SCROLL TO DISTURB THE SIGNAL ↓</span></div>
  {beats.map(b=><div key={b.name} data-start={b.start} data-end={b.end} className="lch-beat" style={{opacity:0,visibility:"hidden"}}><span className="lch-mono lch-beat-index">{b.name}</span><h2>{b.title}</h2><p>{b.copy}</p></div>)}
  <div className="lch-stage-foot lch-mono"><span>WE MAKE THE FAMILIAR FEEL IMPOSSIBLE.</span><span>SCROLL TO EXPLORE ↓</span></div>
  <div className="lch-progress" aria-hidden="true"><span/></div>
  {status==="loading"&&!reduced&&<div className="lch-loader lch-mono" role="status">LOADING THE FULL SIGNAL…</div>}
  {status==="error"&&<div className="lch-loader lch-error lch-mono" role="status">MOTION UNAVAILABLE — STILL IMAGE MODE</div>}
  {stillFailed&&<div className="lch-still-error lch-mono" role="status">FIRST FRAME UNAVAILABLE</div>}
 </div></section>;
}
function Nav({onEnter}:Props){
 const[open,setOpen]=useState(false);
 const go=(screen:LookeDestination)=>{setOpen(false);onEnter(screen)};
 return <header className="lch-nav">
  <a href="#looke-top" className="lch-logo" aria-label="Looke home">looke<span>✳</span></a>
  <button className="lch-toggle lch-mono" type="button" aria-expanded={open} aria-controls="lch-links" onClick={()=>setOpen(!open)}>{open?"CLOSE −":"MENU +"}</button>
  <nav className={"lch-links"+(open?" lch-open":"")} id="lch-links" aria-label="Looke homepage navigation">
    <button type="button" onClick={()=>go("Trending")}>FEED</button>
    <button type="button" onClick={()=>go("Messages")}>MESSAGES</button>
    <button type="button" onClick={()=>go("Uniq NFTs")}>NFTS</button>
    <a href="/trade">MARKETS ↗</a>
    <button type="button" className="lch-nav-cta" onClick={()=>go("Wallet")}>CONNECT WALLET ↗</button>
  </nav>
 </header>;
}
function Manifesto({onEnter}:Props){return <section className="lch-manifesto lch-pad" id="looke-idea"><div className="lch-meta lch-mono"><span>01 / OUR POINT OF VIEW</span><span>NOT MADE FOR EVERYONE. MADE TO MATTER.</span></div><h2>IF IT FEELS<br/><em>DIFFERENT,</em><br/>IT&apos;S WORKING.</h2><div className="lch-manifesto-bottom"><span className="lch-asterisk" aria-hidden="true">✳</span><p>Looke is a social world for ideas, creators and digital culture — built on Ultra EVM. Share what moves you. Make something unexpected. Leave a signal.</p><button type="button" className="lch-round" aria-label="Explore the Looke feed" onClick={()=>onEnter("Trending")}>↗</button></div></section>}
const studies=[{name:"01 / THE PULSE",heading:"A LIVING SIGNAL",text:"A feed for the ideas you can't keep to yourself.",screen:"Trending" as const},{name:"02 / THE SHIFT",heading:"COLOUR IN MOTION",text:"NFT collections and creation with room to experiment.",screen:"Uniq NFTs" as const},{name:"03 / THE AFTERIMAGE",heading:"STAY A LITTLE LONGER",text:"Creator tokens and markets on Ultra EVM.",screen:"Create" as const}];
function Studies({onEnter}:Props){return <section className="lch-studies lch-pad" id="looke-work"><div className="lch-meta lch-mono"><span>02 / SELECTED FREQUENCIES</span><span>THE SAME SIGNAL. THREE WAYS TO SEE IT.</span></div><div className="lch-studies-heading"><h2>THE<br/><em>UNEXPECTED.</em></h2><p className="lch-mono">EXPERIMENTS IN SOCIAL, TEXTURE<br/>AND BEAUTIFULLY CONTROLLED CHAOS.</p></div><div className="lch-grid">{studies.map((s,i)=><article className="lch-study" key={s.name}><div className="lch-study-art"><img src={asset.studies[i]} alt={["Close detail of moving multicolour sphere","Electric pink and turquoise visual pattern","Abstract colourful particles forming a sphere"][i]} loading="lazy"/><button type="button" className="lch-study-action" aria-label={"Explore "+s.heading} onClick={()=>onEnter(s.screen)}>↗</button></div><div className="lch-study-meta lch-mono"><span>{s.name}</span><span>0{i+1}</span></div><h3>{s.heading}</h3><p>{s.text}</p></article>)}</div><div className="lch-abilities lch-mono"><span>SOCIAL FEED <b>01</b></span><span>NFT CREATION <b>02</b></span><span>CREATOR TOKENS <b>03</b></span><span>CONVERSATIONS <b>04</b></span></div></section>}
function Contact({onEnter}:Props){return <section className="lch-contact lch-pad" id="looke-contact"><div className="lch-meta lch-mono"><span>03 / YOUR TURN</span><span>OPEN FOR NEW CONVERSATIONS</span></div><h2>LET&apos;S MAKE<br/><em>A SCENE.</em></h2><div className="lch-contact-bottom"><p>Have something worth sharing? Give it a signal. The next big thing could begin with your first conversation.</p><button type="button" className="lch-contact-cta lch-mono" onClick={()=>onEnter("Messages")}>START A CONVERSATION <span>↗</span></button></div></section>}
export default function LookeLanding({onEnter}:Props){
 return <div className="looke-chaos" id="looke-landing">
  <a className="lch-skip" href="#looke-app">SKIP INTRO — OPEN LOOKE</a><Nav onEnter={onEnter}/><Orb/>
  <div className="lch-marquee" aria-hidden="true"><div>IDEAS ✳ COMMUNITY ✳ CREATOR TOKENS ✳ DIGITAL COLLECTIBLES ✳ NEW CONNECTIONS ✳ IDEAS ✳ COMMUNITY ✳ CREATOR TOKENS ✳ DIGITAL COLLECTIBLES ✳</div></div>
  <Manifesto onEnter={onEnter}/><Studies onEnter={onEnter}/><Contact onEnter={onEnter}/>
  <footer className="lch-footer lch-mono"><span>LOOKE ✳ — A NEW SOCIAL SIGNAL ON ULTRA EVM</span><a href="https://github.com/mushee-io/looke" target="_blank" rel="noopener noreferrer">GITHUB ↗</a><a href="#looke-top">BACK TO TOP ↑</a></footer>
  <div className="lch-handoff lch-mono">YOUR SOCIAL WORLD STARTS BELOW ↓</div>
 </div>
}
