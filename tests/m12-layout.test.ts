import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {resolve} from "node:path";

/**
 * UI regression: previous version kept a 368px hero ahead of the market.
 * The user's reference is market-first: categories and token rows must
 * visibly appear before any promotional product or creator banner.
 */
const jsx=readFileSync(resolve("src/components/discover/DiscoverDashboard.tsx"),"utf8");
const style=readFileSync(resolve("src/components/discover/market-first.css"),"utf8");
test("M12 homepage is market-first rather than another huge landing hero",()=>{
  const categories=jsx.indexOf('className="discover-categories"');
  const market=jsx.indexOf('className="discover-markets"');
  const products=jsx.indexOf('className="discover-product-footer"');
  assert.ok(categories>0&&market>categories&&products>market,
    "Market categories and table must render before product promotions.");
  assert.equal(jsx.includes('className="discover-welcome"'),false);
  assert.equal(jsx.includes('className="discover-hero-art"'),false);
  assert.equal(jsx.includes("Discover the next wave."),false);
  assert.match(style,/discover-markets\{[^}]*margin-top:17px/);
});
test("Market-first reference has functioning real route links and complete ranking tabs",()=>{
  for(const route of ["/trade","/social","/beta"]){
    assert.ok(jsx.includes('href="'+route+'"'),route+" must link to an actual page.");
  }
  assert.equal(jsx.includes('href="/uniqs"'),false,
    "Ultra EVM-only Looke must not expose native Uniq navigation.");
  for(const tab of ["Trending","Top","New","Watchlist"]){
    assert.ok(jsx.includes('label:"'+tab+'"'),tab+" tab must exist.");
  }
  assert.match(jsx,/verified-on-chain/);
  assert.ok(jsx.includes("No verified")||jsx.includes("First verified markets coming soon"));
  assert.ok(jsx.includes("not a complete 24-hour window"));
  assert.equal(jsx.includes("Raydium"),false);
});
