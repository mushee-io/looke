import "server-only";
import { getNativeTestnetInfo } from "../ultra-native-rpc";
import { ULTRA_NATIVE_TESTNET } from "../ultra-native";
import { createUltraPublicClient } from "../verification";
import { ULTRA_EVM_TESTNET } from "../ultra";
import { query } from "../social/db";
import {
  makeHealth, releaseControlsFromEnv, validateEvmHead, validateNativeHead,
  type OperatorCheck, type OperatorHealth,
} from "./policy";

function result(id:OperatorCheck["id"],passed:boolean,reason:string):OperatorCheck {
  return {id,status:passed?"pass":"fail",reason,checkedAt:new Date().toISOString()};
}
/** Network requests may hang even when a service is down.
 * Bound operator monitoring without weakening its fail-closed checks.
 * Promise.race attaches rejection handlers to the underlying RPC promise.
 */
async function bounded<T>(value:Promise<T>,timeoutMs=8000):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    return await Promise.race([
      value,
      new Promise<T>((_,reject)=>{
        timer=setTimeout(()=>reject(new Error("Operator RPC health check timed out.")),timeoutMs);
      })
    ]);
  }finally{if(timer)clearTimeout(timer)}
}
/** Only aggregate status is returned. No wallet addresses, DB URLs, API keys or logs. */
export async function getOperatorHealth():Promise<OperatorHealth>{
  const [evm,native,database] = await Promise.allSettled([
    bounded((async()=>{
      const client=createUltraPublicClient(process.env.ULTRA_EVM_RPC_URL || ULTRA_EVM_TESTNET.rpcUrls[0]);
      const [chain,block]=await Promise.all([client.getChainId(),client.getBlock({blockTag:"latest"})]);
      return validateEvmHead(chain,Number(block.timestamp),Math.floor(Date.now()/1000));
    })()),
    bounded((async()=>{
      const info=await getNativeTestnetInfo();
      return validateNativeHead(info.chain_id,ULTRA_NATIVE_TESTNET.chainId,info.head_block_num,info.last_irreversible_block_num);
    })()),
    bounded((async()=>{
      if(!process.env.DATABASE_URL)return false;
      const r=await query<{exists:boolean}>(`SELECT
        to_regclass('public.social_profiles') IS NOT NULL AND
        to_regclass('public.social_posts') IS NOT NULL AND
        to_regclass('public.social_reports') IS NOT NULL AS exists`);
      return r.rows[0]?.exists===true;
    })()),
  ]);
  const checks:OperatorCheck[] = [
    result("evm",evm.status==="fulfilled"&&evm.value.ok,evm.status==="fulfilled"?evm.value.reason:"EVM RPC unreachable or timed out."),
    result("native",native.status==="fulfilled"&&native.value.ok,native.status==="fulfilled"?native.value.reason:"Ultra native RPC unreachable or invalid."),
    result("database",database.status==="fulfilled"&&database.value,
      database.status==="fulfilled"&&database.value?"Required social schema exists.":"Social database/schema unavailable."),
  ];
  const release=releaseControlsFromEnv(process.env);
  checks.push(result("release",release.safe,
    release.safe?"All four public or write-capable release flags are disabled.":"One or more public/write-capable release flags are enabled; operator review required."));
  return makeHealth(checks,process.env.LOOKE_PUBLIC_BETA_ENABLED==="true");
}
