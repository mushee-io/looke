import assert from "node:assert/strict";
import { test } from "node:test";
import { assertActiveUltraEvmAccount, handlePolicy } from "../src/lib/social/m2-identity";
const a="0x1111111111111111111111111111111111111111";
const b="0x2222222222222222222222222222222222222222";
test("M2 handle policy reserves official namespaces",()=>{
 assert.deepEqual(handlePolicy(" Creator_99 "),{handle:"creator_99",reserved:false});
 for(const x of ["ADMIN","Looke_Support","ultra_community"])assert.equal(handlePolicy(x).reserved,true);
 for(const x of ["a","../admin","0x111"])assert.throws(()=>handlePolicy(x));
});
test("M2 refuses account switch after wallet signature",async()=>{
 const p={request:async({method}:{method:string})=>method==="eth_chainId"?"0x49c1":[b]};
 await assert.rejects(()=>assertActiveUltraEvmAccount(p,a),/Selected wallet account changed/);
});
test("M2 refuses Mainnet or in-flight network switching",async()=>{
 const mainnet={request:async({method}:{method:string})=>method==="eth_chainId"?"0x4e17":[a]};
 await assert.rejects(()=>assertActiveUltraEvmAccount(mainnet,a),/Ultra EVM Testnet/);
 let reads=0;
 const changing={request:async({method}:{method:string})=>method==="eth_chainId"?(++reads===1?"0x49c1":"0x1"):[a]};
 await assert.rejects(()=>assertActiveUltraEvmAccount(changing,a),/Ultra EVM Testnet/);
});
test("M2 accepts only selected address, not another authorized account",async()=>{
 const p={request:async({method}:{method:string})=>method==="eth_chainId"?"0x49c1":[a,b]};
 assert.equal(await assertActiveUltraEvmAccount(p,a),a);
 await assert.rejects(()=>assertActiveUltraEvmAccount(p,b),/Selected wallet account changed/);
});
