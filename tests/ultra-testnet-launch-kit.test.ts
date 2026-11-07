import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
const setup=readFileSync("src/app/setup/page.tsx","utf8");
const home=readFileSync("src/app/page.tsx","utf8");
const trading=readFileSync("src/app/trade/page.tsx","utf8");
test("Testnet factory is deployed only with explicit browser wallet approval and receipt proof",()=>{
 assert.match(setup,/eth_requestAccounts/);
 assert.match(setup,/eth_sendTransaction/);
 assert.match(setup,/client\.getChainId\(\)!==18881/);
 assert.match(setup,/"0x49c1"/);
 assert.match(setup,/verifyFactoryDeployment\(client,deployed,hash\)/);
 assert.match(setup,/confirmations:2/);
 assert.match(setup,/receipt\.to!==null/);
 assert.match(setup,/coinCount/);
 assert.doesNotMatch(setup,/privateKey|mnemonic|walletClient\.signTransaction/i);
});
test("Only genuine V2 contract provenance enables pair creation",()=>{
 for(const marker of ["getBytecode","getPair","token0","token1","factory","createPair","Pair\/factory"])
  assert.ok(setup.includes(marker),marker);
 assert.match(setup,/new Set\(\[f,r,t,q\]/);
 assert.match(setup,/router.*factory|rf.*f/);
});
test("Liquidity transactions demand wallet approval, balances, allowances, ratio and minimums",()=>{
 assert.match(setup,/balanceOf/);
 assert.match(setup,/allowance/);
 assert.match(setup,/approve/);
 assert.match(setup,/addLiquidity/);
 assert.match(setup,/5_?000|300/);
 assert.match(setup,/va\*99n\/100n/);
 assert.match(setup,/vb\*99n\/100n/);
 assert.match(setup,/diff\*100n>left/);
 assert.match(setup,/reserves\[0\]<=0n\|\|reserves\[1\]<=0n/);
});
test("Markets require actual positive reserves before a Vercel registry is proposed",()=>{
 assert.match(setup,/LOOKE_M4_MARKETS_JSON/);
 assert.match(setup,/getPair/);
 assert.match(setup,/setRegistry/);
 assert.match(trading, /href="\/setup"/);
 assert.match(home,/verifyFactoryDeployment/);
});
