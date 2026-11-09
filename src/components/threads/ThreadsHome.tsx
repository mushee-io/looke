"use client";
import Link from "next/link";
import {TrendingFeed} from "../experience/LookeViews";

export default function ThreadsHome({search}:{search:string}) {
  return <div className="lt-feed" aria-label="Looke Home feed">
    <section className="lt-compose" aria-label="Create a post">
      <span className="lt-compose-avatar" aria-hidden="true">L</span>
      <div className="lt-compose-body">
        <strong>Share with Looke</strong>
        <Link href="/social" className="lt-compose-placeholder">What&apos;s new?</Link>
        <div className="lt-compose-hints">
          <span aria-hidden="true">▧</span> Media <span className="lt-hint-separator">·</span>
          <span aria-hidden="true">◇</span> NFT <span className="lt-hint-separator">·</span>
          <span aria-hidden="true">◎</span> Ultra EVM
        </div>
      </div>
      <Link href="/social" className="lt-compose-post" aria-label="Open the real Looke post composer">Post</Link>
    </section>
    <TrendingFeed search={search} onCreate={()=>{window.location.assign("/social");}} />
  </div>;
}
