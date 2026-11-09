"use client";
export default function ThreadsNavIcon({name}:{name:string}) {
  return <svg viewBox="0 0 24 24" width="25" height="25" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "Home" ? <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/></> :
    name === "Discover" ? <><circle cx="10.5" cy="10.5" r="7.25"/><path d="m16 16 5 5"/></> :
    name === "Create" ? <><rect x="3" y="3" width="18" height="18" rx="6"/><path d="M12 7v10M7 12h10"/></> :
    name === "Messages" ? <><path d="M20.5 11.5c0 5-4 9-9 9a9.3 9.3 0 0 1-4.4-1.1L3 20l1-4a9 9 0 1 1 16.5-4.5z"/></> :
    name === "Notifications" ? <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9"/><path d="M10 21h4"/></> :
    name === "Uniq NFTs" ? <><path d="m12 2 9 10-9 10L3 12z"/><path d="m3 12 9-4 9 4-9 4z"/></> :
    name === "Points" ? <><path d="m12 2 2.7 6.3L21 11l-6.3 2.7L12 20l-2.7-6.3L3 11l6.3-2.7z"/></> :
    name === "Wallet" ? <><rect x="2.5" y="5.5" width="19" height="15" rx="3"/><path d="M3 9h18M16 14h3"/></> :
    name === "Profile" ? <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/></> :
    <><path d="m5 12 6-6 8 6-8 6z"/></>}
  </svg>;
}
