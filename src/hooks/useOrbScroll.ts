"use client";
import {useEffect,useState,type RefObject} from "react";
export function useReduced(){
 const [value,set]=useState(false);
 useEffect(()=>{const m=matchMedia("(prefers-reduced-motion: reduce)");const sync=()=>set(m.matches);sync();m.addEventListener("change",sync);return()=>m.removeEventListener("change",sync)},[]);
 return value;
}
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function useOrbScroll(root:RefObject<HTMLElement|null>,stage:RefObject<HTMLDivElement|null>,video:RefObject<HTMLVideoElement|null>,reduced:boolean){
 useEffect(()=>{
  const r=root.current,s=stage.current;if(!r||!s)return;
  const beats=[...s.querySelectorAll<HTMLElement>("[data-start]")], intro=s.querySelector<HTMLElement>(".lch-intro");
  let raf=0,visible=false,prevY=scrollY,velocity=0,rate=1,angle=0,previous=performance.now();
  const scroll=()=>{const y=scrollY;velocity+=Math.abs(y-prevY);prevY=y};
  const tick=(now:number)=>{
   raf=0;if(!visible||document.hidden)return;
   const p=clamp(-r.getBoundingClientRect().top/Math.max(1,r.offsetHeight-innerHeight));
   s.style.setProperty("--p",String(p));
   beats.forEach(b=>{const start=Number(b.dataset.start),end=Number(b.dataset.end),fade=Math.min(.04,(end-start)/4),a=clamp(Math.min((p-start)/fade,(end-p)/fade));b.style.opacity=String(a);b.style.visibility=a<.01?"hidden":"visible";b.style.transform="translateY("+((1-a)*28)+"px)"});
   if(intro){const a=clamp((.14-p)/.06);intro.style.opacity=String(a);intro.style.visibility=a<.01?"hidden":"visible"}
   velocity=Math.min(1000,velocity)*.9;
   rate+=( (reduced?1:1+Math.min(.8,velocity*.006))-rate)*.12;
   const elapsed=Math.min(80,now-previous)/1000;previous=now;
   if(!reduced)angle=(angle+elapsed*7.5*rate)%360;
   s.style.setProperty("--angle",(reduced?0:angle)+"deg");
   const v=video.current;if(v&&!v.paused&&!reduced){try{v.playbackRate=rate}catch{}}
   raf=requestAnimationFrame(tick);
  };
  const resume=()=>{if(!visible||document.hidden)return;previous=performance.now();prevY=scrollY;if(!raf)raf=requestAnimationFrame(tick);const v=video.current;if(!reduced&&v?.src&&v.paused)void v.play().catch(()=>{})};
  const obs=new IntersectionObserver(es=>{visible=es.some(e=>e.isIntersecting);if(visible)resume();else{cancelAnimationFrame(raf);raf=0;video.current?.pause()}},{rootMargin:"50px"});
  const vis=()=>{if(document.hidden)video.current?.pause();else resume()};
  obs.observe(r);addEventListener("scroll",scroll,{passive:true});document.addEventListener("visibilitychange",vis);
  return()=>{obs.disconnect();removeEventListener("scroll",scroll);document.removeEventListener("visibilitychange",vis);cancelAnimationFrame(raf);video.current?.pause()};
 },[root,stage,video,reduced]);
}
