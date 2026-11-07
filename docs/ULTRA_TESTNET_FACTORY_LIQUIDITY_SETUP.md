# Looke Ultra EVM Testnet — wallet-driven contract and liquidity launch

**Scope:** Ultra EVM Testnet 18881 ONLY. No Mainnet deployments, service-held private keys, autonomous funding, fabricated transactions, fake prices, or automatic trades.

## Existing project contracts

- `contracts/LookeCoin.sol`: fixed-supply, creator-owned, ERC-20-compatible token.
- `contracts/LookeCoinFactory.sol`: emits `CoinCreated`, stores creator registrations and deploys an ERC-20 per user-approved wallet call.
- `src/app/page.tsx`: wallet-approved `createCoin` call, requires an authentic Testnet factory contract-creation receipt, runtime code, coinCount, and verifies a real CoinCreated event plus token state.
- `src/app/trade/page.tsx`: wallet approval, router swap, minOut, 2+ confirmations, verified Swap/Transfer logs. `LOOKE_M4_TRADING_ENABLED=true` is already set in Preview.

## Deploy the factory through Looke /setup or Remix with an injected wallet

1. From the reviewed repository, run `forge build` (Solidity **0.8.24**, optimizer 200) and use the generated local `out/LookeCoinFactory.sol/LookeCoinFactory.json` artifact in Looke `/setup`. Alternatively load both original Solidity sources into [Remix](https://remix.ethereum.org) with equivalent compiler settings.
2. Connect MetaMask on chain **18881**, with enough Testnet UOS to cover deployment gas. In `/setup`, select the compiled local artifact and click **Deploy factory using my own Testnet wallet**. If using Remix instead, select **Injected Provider**. Confirm the selected contract and deployment bytecode in the wallet; never sign unknown bytecode.
3. Explicitly approve the **contract deployment transaction** in your wallet. The `/setup` page waits for two confirmations, checks the real `contractAddress` and deployment receipt, reads factory `coinCount()`, and displays the authentic address/hash for Vercel. No deployment can run in CI. Do not supply private keys to Looke, CI or a remote assistant.
4. Independently verify the factory `coinCount()` and deployed bytecode. In Vercel Preview settings set `NEXT_PUBLIC_LOOKE_FACTORY_ADDRESS` and `NEXT_PUBLIC_LOOKE_FACTORY_DEPLOY_TX`, then redeploy the exact approved commit. These are public identifiers, not secrets. See [Ultra EVM Quick Start](https://developers.ultra.io/staging/tutorials/Ultra-EVM/Quick-start).
5. The creator studio checks that the original factory deployment transaction has `to == null`, matches the factory's runtime address and is confirmed on Ultra Testnet; then each creator must approve their own `createCoin`.

## Create a genuine liquidity market

A **compatible V2 factory and router** must actually exist on chain **18881**; do not copy an Ethereum or other network address as if it were deployed on Ultra.

1. Use `/setup` in the public Testnet Preview. Enter the real V2 factory/router, the newly created creator token and a real ERC-20 quote token. All four contracts must have deployed bytecode, the router must link to that factory and the creator token must expose `creator()`.
2. On your wallet, approve **create pair**, if a pair has not yet been deployed. Use the setup tool to re-read the genuine pair address and verify `getPair`, `token0`, `token1` and `factory()`.
3. Approve the **exact desired amount of each token** in two separate wallet confirmations. The tool checks real wallet balances and router allowances. For previously nonzero allowances, it first resets to zero and requires a second confirmation before setting a new allowance.
4. Explicitly approve the **addLiquidity** transaction. The tool applies a five-minute deadline, 1% minimum amount bounds, checks the real reserve ratio on an already funded pool, and requires two confirmations.
5. Use the **Verify reserves and generate market registry** control. Two-sided positive reserves and factory/router/pair correspondence are required. Paste the resulting JSON into the Vercel **Preview** variable `LOOKE_M4_MARKETS_JSON` (currently `[]`), then redeploy. The existing `/api/trade?kind=markets` will re-verify tokens and reserves live.

**Important:** This package does not pretend to deploy a complete V2 protocol from unreviewed code. It connects to independently validated V2-compatible contracts. If Ultra Testnet has no V2 router/factory, an independently reviewed compatible deployment is still a distinct prerequisite. Gas token UOS is not ERC-20 by default; ERC-20/ ERC-20 pools require an actual wrapped/compatible quote token.

## Social data

The separate `LOOKE_SOCIAL_WRITES_ENABLED=true` Preview switch was enabled, but actual authenticated posting still requires a current schema-compatible **TLS PostgreSQL** connection and ownership/anti-abuse rules. No database, user records, token swaps or liquidity were fabricated by this package.

## Live deployment boundaries

PR branch is draft and stacked on public Testnet PR #48 and wallet execution PR #49. Do not merge predecessors automatically. Production `looke-alpha.vercel.app` stays pinned to `dpl_29EdVrfrJNTC5Q7gkZMcpaxLhQiG`. Report exact SHA and CI before release.
