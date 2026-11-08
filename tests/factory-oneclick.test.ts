import assert from "node:assert/strict";
import {test} from "node:test";
import {
  LOOKE_FACTORY_CREATION_CODE,
  LOOKE_FACTORY_RUNTIME_CODE,
  assertVerifiedFactoryRuntime,
} from "../src/lib/verified-factory-bytecode";

test("reviewed creator factory artifact is genuine Solc creation code",()=>{
  assert.equal((LOOKE_FACTORY_CREATION_CODE.length-2)/2,4496);
  assert.ok(LOOKE_FACTORY_CREATION_CODE.startsWith(
    "0x608060405234801561000f575f80fd5b506111738061001d5f395ff3fe"));
  assert.equal((LOOKE_FACTORY_RUNTIME_CODE.length-2)/2,4467);
  assert.ok(LOOKE_FACTORY_RUNTIME_CODE.startsWith("0x608060405234"));
  assert.equal(
    "0x"+LOOKE_FACTORY_CREATION_CODE.slice(60),
    LOOKE_FACTORY_RUNTIME_CODE,
  );
});
test("stored factory address cannot substitute arbitrary bytecode",()=>{
  assert.doesNotThrow(()=>assertVerifiedFactoryRuntime(LOOKE_FACTORY_RUNTIME_CODE));
  assert.throws(()=>assertVerifiedFactoryRuntime("0x6000"),/does not match/);
});
