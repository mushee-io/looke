import Link from "next/link";
import "../globals.css";

/** Legacy URL kept so bookmarked routes fail safely.
 * No native wallet, mint, listing, buy or transfer functionality is mounted.
 * Future Ultra EVM NFT features require fresh reviewed ERC-721 engineering.
 */
export default function UniqLegacyRoute(){
 return <main style={{minHeight:"100vh",maxWidth:780,margin:"0 auto",padding:"92px 26px",fontFamily:"Arial,sans-serif"}}>
  <Link href="/" style={{fontWeight:800,fontSize:28,textDecoration:"none"}}>✳ looke.</Link>
  <p style={{marginTop:48,fontSize:12,letterSpacing:2}}>ULTRA EVM ONLY · NETWORK 18881</p>
  <h1 style={{fontSize:"clamp(34px,6vw,58px)",letterSpacing:"-.06em"}}>An EVM-first creator platform.</h1>
  <p style={{lineHeight:1.8,color:"#56627a"}}>The previous collectibles route is not part of the current Looke launch.
   No NFT wallet, mint, listing, market order or transaction is available here.
   Future NFT releases must be implemented and reviewed on Ultra EVM.</p>
  <p style={{lineHeight:1.8}}>Ultra EVM Mainnet (19991) is not enabled for transactions. Public beta remains closed.</p>
  <div style={{display:"flex",gap:15,flexWrap:"wrap",marginTop:30}}>
   <Link href="/social">Explore Looke Social</Link>
   <Link href="/trade">Explore creator markets</Link>
   <Link href="/">Return home</Link>
  </div>
 </main>;
}
