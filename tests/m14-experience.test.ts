import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  LOOKE_PAIR_CHOICES,LOOKE_NOTIFY_CATEGORIES,
  validateLookePair,validateQuickTokenDraft,safeSocialFilter,
} from "../src/lib/experience/validation";

function source(path:string){return readFileSync(resolve(path),"utf8");}
const home=source("src/app/page.tsx");
const views=source("src/components/experience/LookeViews.tsx");
const overlays=source("src/components/experience/LookeOverlays.tsx");
const style=source("src/components/experience/experience.css");
const notif=source("src/app/api/experience/notifications/route.ts");
const profile=source("src/app/api/experience/profile-posts/route.ts");

test("Only LOOKE and ULTRA may be selected as draft pairing options",()=>{
  assert.deepEqual([...LOOKE_PAIR_CHOICES],["ULTRA","LOOKE"]);
  assert.equal(validateLookePair("ULTRA"),"ULTRA");
  assert.equal(validateLookePair("LOOKE"),"LOOKE");
  for(const invalid of ["SOL","USDC","BTC","ZORA","ETH","","ultra",null,0]){
    assert.throws(()=>validateLookePair(invalid),/Only verified/);
  }
});
test("Quick creation validates drafts; issuance requires wallet, verified factory and genuine receipts",()=>{
  assert.deepEqual(validateQuickTokenDraft(" Ultra Cat "," cat12 ","ULTRA"),
    {name:"Ultra Cat",symbol:"CAT12",pair:"ULTRA"});
  assert.throws(()=>validateQuickTokenDraft("<script>","GOOD","ULTRA"),/Token name/);
  assert.throws(()=>validateQuickTokenDraft("Valid Token","X","ULTRA"),/Ticker/);
  assert.throws(()=>validateQuickTokenDraft("Valid Token","USDC","USDC"),/Only verified/);
  assert.match(overlays,/URL\.createObjectURL/);
  assert.match(overlays,/URL\.revokeObjectURL/);
  assert.match(overlays,/preview only/);
  assert.match(home,/disabled=\{submitting \|\| factoryStatus !== "verified" \|\| !address \|\| !onUltra \|\| !preview\}/);
  assert.match(home,/verifyFactoryDeployment\(source, LOOKE_FACTORY_ADDRESS, LOOKE_FACTORY_DEPLOY_TX\)/);
  assert.match(home,/eth_sendTransaction/);
  assert.match(home,/decodeCoinCreatedFromReceipt/);
  assert.match(home,/verifyCreatedCoinState/);
});
test("Main Looke shell exposes approved seven visual flows rather than placeholder links",()=>{
  for(const feature of [
    'screen === "Discover"','screen === "Trending"','screen === "Messages"',
    'screen === "Notifications"','screen === "Profile"',
    "<CreateCoinModal","<WalletModal","Global",
  ].filter(x=>x!=="Global")){
    assert.ok(home.includes(feature),feature+" missing");
  }
  assert.match(home,/chooseNavigation/);
  assert.match(home,/lk-global-search/);
  assert.match(style,/lk-messages-page/);
  assert.match(style,/lk-notifications/);
  assert.match(style,/lk-profile-page/);
  assert.match(style,/lk-wallet-modal/);
});
test("Trending feed only loads observed market index and real social database posts",()=>{
  assert.match(views,/fetch\("\/api\/discover\?sort=trending/);
  assert.match(views,/action:"feed"/);
  assert.match(views,/fetch\("\/api\/social\?"/);
  assert.match(views,/verified-on-chain/);
  assert.match(views,/No sample posts have been substituted/);
  assert.ok(!views.includes("Raydium"));
  assert.ok(!views.includes("fakeVolume"));
});
test("Messages do not send/store plaintext while encryption is unreviewed",()=>{
  assert.match(views,/messaging has been independently reviewed/);
  assert.match(views,/No recipient data or plaintext message is stored/);
  assert.ok(!views.includes('fetch("/api/social",{method:"POST",body:JSON.stringify({action:"message"'));
});
test("All requested notification categories exist and only real follow/comment events are sourced",()=>{
  assert.deepEqual([...LOOKE_NOTIFY_CATEGORIES],
    ["All","Subscriptions","Mentions","Trades","Comments","Follows","Other"]);
  for(const t of LOOKE_NOTIFY_CATEGORIES)assert.equal(safeSocialFilter(t),true);
  assert.equal(safeSocialFilter("Secret"),false);
  assert.match(notif,/social_follows/);
  assert.match(notif,/social_comments/);
  assert.match(notif,/const current=await viewer\(request\)/);
  assert.match(notif,/social_blocks/);
  assert.match(notif,/created_at DESC LIMIT 30/);
  assert.ok(!notif.includes("trading volume"));
});
test("Profile posts are genuine, public, and respect moderation/blocking",()=>{
  assert.match(profile,/handle\.parse/);
  assert.match(profile,/social_blocks/);
  assert.match(profile,/p\.hidden=false/);
  assert.match(profile,/p\.deleted_at IS NULL/);
  assert.match(profile,/count\(\*\)::integer/);
  assert.ok(views.includes('"/api/social?action=profile&handle="'));
  assert.ok(views.includes('"/api/experience/profile-posts?handle="'));
});
test("Wallet modal reads true Ultra EVM balance and does not invent fiat valuation",()=>{
  assert.match(overlays,/getChainId\(\)/);
  assert.match(overlays,/getBalance\(/);
  assert.match(overlays,/formatEther\(raw\)/);
  assert.match(overlays,/No verified USD price feed configured/);
  assert.match(overlays,/Transaction history indexing has not been activated/);
  assert.ok(!overlays.includes("eth_sendTransaction"));
});

test("Global header market search is connected to actual Discover API filtering",()=>{
  const discover=source("src/components/discover/DiscoverDashboard.tsx");
  assert.ok(home.includes("<DiscoverDashboard globalQuery={globalSearch}"));
  assert.match(discover,/setQuery\(globalQuery\)/);
  assert.match(discover,/URLSearchParams\(\{q:search/);
});
