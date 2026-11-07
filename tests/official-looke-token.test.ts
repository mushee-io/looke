import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
const solidity=readFileSync("contracts/LookeEcosystemToken.sol","utf8");
const foundry=readFileSync("contracts/test/LookeEcosystemToken.t.sol","utf8");
const deploy=readFileSync("src/app/setup/looke/page.tsx","utf8");
const setup=readFileSync("src/app/setup/page.tsx","utf8");

test("official LOOKE is separate from creator factory and hard-caps total issuance",()=>{
 assert.match(solidity,/contract LookeEcosystemToken/);
 assert.match(solidity,/string public constant symbol = "LOOKE"/);
 assert.match(solidity,/string public constant name = "Looke"/);
 assert.match(solidity,/uint8 public constant decimals = 18/);
 assert.match(solidity,/100_000_000 \* 10 \*\* uint256\(decimals\)/);
 assert.match(solidity,/balanceOf\[initialTreasury\] = totalSupply/);
 assert.match(solidity,/initialTreasury != address\(0\)/);
 assert.doesNotMatch(solidity,/\bfunction (?:mint|burn|pause|blacklist|setTax|upgradeTo|owner)\s*\(/);
});
test("official LOOKE tests cover original mint, supply, safety, and allowances",()=>{
 for(const fn of [
 "testExactSupplyAndImmutableMetadata","testInitialTreasuryIsExplicitRecipient",
 "testZeroTreasuryReverts","testTransfersPreserveExactlyOneHundredMillion",
 "testAllowancesAndTransferFromCannotIncreaseSupply",
 "testRejectZeroRecipientAndExcessBalances","testNoExternalMintOrAdminSelector"
 ])assert.ok(foundry.includes(fn),fn);
});
test("official LOOKE deployment is wallet-only, testnet-only and verifies original receipt",()=>{
 assert.match(deploy,/walletOnTestnet\(\)/);
 assert.match(deploy,/getChainId\(\)!==18881/);
 assert.match(deploy,/eth_sendTransaction/);
 assert.match(deploy,/confirmations:2/);
 assert.match(deploy,/receipt\.to!==null/);
 assert.match(deploy,/getTransactionReceipt/);
 assert.match(deploy,/tx\.input\.toLowerCase\(\)!==expectedData\.toLowerCase\(\)/);
 assert.match(deploy,/event\.args\.value!==TOTAL/);
 assert.match(deploy,/event\.args\.to/);
 assert.match(deploy,/recipientBalance/);
 assert.match(deploy,/setProof\(verified\)/);
 assert.doesNotMatch(deploy,/privateKey|mnemonic|secretKey|walletClient\.signTransaction/);
});
test("launch UI requires explicit approval and an actual compiled official artifact",()=>{
 for(const expected of ["LookeEcosystemToken","forge build","encodeDeployData","constructor","confirmIntent","100,000,000","setBroadcastHash","proof"])
   assert.ok(deploy.includes(expected),expected);
 assert.match(setup,/href="\/setup\/looke"/);
});
