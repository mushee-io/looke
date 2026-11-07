export const ULTRA_EVM_TESTNET = {
  chainId: 18881,
  chainIdHex: "0x49c1",
  chainName: "Ultra EVM Testnet",
  rpcUrls: ["https://evm.test.ultra.eosusa.io"],
  explorer: "https://evmexplorer.testnet.ultra.io",
  nativeCurrency: { name: "Ultra", symbol: "UOS", decimals: 18 },
} as const;

export const LOOKE_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_LOOKE_FACTORY_ADDRESS ?? "";
export const LOOKE_FACTORY_DEPLOY_TX = process.env.NEXT_PUBLIC_LOOKE_FACTORY_DEPLOY_TX ?? "";

export function testnetTxUrl(hash: string): string {
  return `${ULTRA_EVM_TESTNET.explorer}/tx/${hash}`;
}

export function testnetAddressUrl(address: string): string {
  return `${ULTRA_EVM_TESTNET.explorer}/address/${address}`;
}

export function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

// Official Ultra EVM network settings: https://developers.ultra.io/tutorials/Ultra-EVM/Resources
// Mainnet metadata is read-only in M1. Wallet signing, trading and token
// issuance stay Testnet-gated until separately audited and approved.
export const ULTRA_EVM_MAINNET = {
  chainId: 19991,
  chainIdHex: "0x4e17",
  chainName: "Ultra EVM Mainnet",
  rpcUrls: ["https://evm.ultra.eosusa.io"],
  explorer: "https://evmexplorer.ultra.io",
  nativeCurrency: {name:"Ultra",symbol:"UOS",decimals:18},
} as const;

export const LOOKE_ACTIVE_CHAIN_ID = ULTRA_EVM_TESTNET.chainId;
export const LOOKE_SUPPORTED_EVM_CHAIN_IDS = [18881,19991] as const;
export function isUltraEvmChainId(value:unknown):boolean {
 if(typeof value!=="string"||!/^0x[0-9a-f]+$/i.test(value))return false;
 const id=Number.parseInt(value.slice(2),16);
 return id===ULTRA_EVM_TESTNET.chainId||id===ULTRA_EVM_MAINNET.chainId;
}
export function isLookeTestnetChain(value:unknown):boolean {
 return typeof value==="string"&&/^0x[0-9a-f]+$/i.test(value)&&
 Number.parseInt(value.slice(2),16)===LOOKE_ACTIVE_CHAIN_ID;
}
