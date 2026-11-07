"use client";

import { useEffect, useState, type FormEvent } from "react";
import DiscoverDashboard from "../components/discover/DiscoverDashboard";
import {TrendingFeed,MessagesPanel,NotificationsPanel,ProfilePanel} from "../components/experience/LookeViews";
import {PointsDashboard} from "../components/experience/M19PointsDashboard";
import {CreateCoinModal,WalletModal,type CoinQuickDraft} from "../components/experience/LookeOverlays";
import "../components/experience/experience.css";
import { encodeFunctionData, getAddress, isAddress, parseUnits, type Hash } from "viem";
import { lookeCoinFactoryAbi } from "../lib/coin-abi";
import { type CoinDraft, validateCoinDraft } from "../lib/metadata";
import {connectUltraEvmWallet, requireUltraEvmTestnet} from "../lib/ultra-evm-wallet";
import {createUltraPublicClient,verifyFactoryDeployment,decodeCoinCreatedFromReceipt,verifyCreatedCoinState} from "../lib/verification";
import {
  LOOKE_FACTORY_ADDRESS, LOOKE_FACTORY_DEPLOY_TX, ULTRA_EVM_TESTNET,
  shortAddress, testnetAddressUrl, testnetTxUrl, isLookeTestnetChain,
} from "../lib/ultra";

type Screen = "Discover" | "Trending" | "Create" | "Messages" | "Notifications" | "Wallet" | "Profile" | "Points";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

const emptyDraft: CoinDraft = {
  name: "", symbol: "", description: "", image: "", metadataURI: "", supply: "1000000",
};

function injectedWallet(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { ethereum?: EthereumProvider }).ethereum ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Wallet request failed. Check your extension.";
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("Discover");
  const [showCreate,setShowCreate] = useState(false);
  const [showWallet,setShowWallet] = useState(false);
  const [chosenPair,setChosenPair] = useState<"ULTRA"|"LOOKE">("ULTRA");
  const [globalSearch,setGlobalSearch] = useState("");
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [draft, setDraft] = useState<CoinDraft>(emptyDraft);
  const [preview, setPreview] = useState<CoinDraft | null>(null);
  const [notice, setNotice] = useState("");
  const [txHash, setTxHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [factoryStatus, setFactoryStatus] = useState<"missing" | "checking" | "verified" | "invalid">("missing");
  const [factoryReason, setFactoryReason] = useState("");
  const [transactionStatus, setTransactionStatus] = useState<"idle" | "submitted" | "confirmed" | "failed">("idle");
  const [confirmedCoin, setConfirmedCoin] = useState("");
  const factoryConfigured = isAddress(LOOKE_FACTORY_ADDRESS) && /^0x[\da-fA-F]{64}$/.test(LOOKE_FACTORY_DEPLOY_TX);
  const onUltra = isLookeTestnetChain(chain);
  const screens: Screen[] = ["Discover","Trending","Messages","Create","Notifications","Points","Wallet","Profile"];
  const icons: Record<Screen,string> = {
    Discover:"⌂",Trending:"ϟ",Messages:"➤",Create:"＋",
    Notifications:"♧",Points:"✧",Wallet:"▣",Profile:"◉",
  };
  function chooseNavigation(item:Screen){
    setNotice("");
    if(item==="Create"){setShowCreate(true);return;}
    if(item==="Wallet"){if(address)setShowWallet(true);else void connectWallet();return;}
    setScreen(item);
  }
  function reviewQuickDraft(coin:CoinQuickDraft){
    setDraft(current=>({...current,name:coin.name,symbol:coin.symbol}));
    setChosenPair(coin.pair);setPreview(null);setTxHash("");
    setConfirmedCoin("");setTransactionStatus("idle");
    setShowCreate(false);setScreen("Create");
    setNotice("Draft prepared for "+coin.pair+" pairing. Neither liquidity pair is approved. A local image still needs publicly hosted metadata before review.");
  }

  useEffect(() => {
    const provider = injectedWallet();
    if (!provider) return;
    const updateAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      setAddress(accounts?.[0] ?? "");
    };
    const updateChain = (...args: unknown[]) => setChain(String(args[0] ?? ""));
    void provider.request({ method: "eth_accounts" })
      .then(value => updateAccounts(value))
      .catch(() => {});
    void provider.request({ method: "eth_chainId" })
      .then(value => updateChain(value))
      .catch(() => {});
    provider.on?.("accountsChanged", updateAccounts);
    provider.on?.("chainChanged", updateChain);
    return () => {
      provider.removeListener?.("accountsChanged", updateAccounts);
      provider.removeListener?.("chainChanged", updateChain);
    };
  }, []);

  useEffect(() => {
    if (!factoryConfigured) {
      setFactoryStatus("missing");
      setFactoryReason("Factory address and a real deployment transaction hash are both required.");
      return;
    }
    let active = true;
    setFactoryStatus("checking");
    void verifyFactoryDeployment(createUltraPublicClient(), LOOKE_FACTORY_ADDRESS, LOOKE_FACTORY_DEPLOY_TX)
      .then(() => { if (active) { setFactoryStatus("verified"); setFactoryReason(""); } })
      .catch(error => {
        if (active) {
          setFactoryStatus("invalid");
          setFactoryReason(errorMessage(error));
        }
      });
    return () => { active = false; };
  }, [factoryConfigured]);

  async function connectWallet() {
    const provider = injectedWallet();
    if (!provider) {
      setNotice("Install an injected EVM wallet (such as MetaMask), then refresh.");
      return;
    }
    setNotice("");
    setWalletBusy(true);
    try {
      const account = await connectUltraEvmWallet(provider);
      setAddress(account);
      setChain(String(await provider.request({ method: "eth_chainId" })));
    } catch (error) {
      setAddress("");
      setChain("");
      setNotice(errorMessage(error));
    } finally {
      setWalletBusy(false);
    }
  }

  function updateDraft(key: keyof CoinDraft, value: string) {
    setDraft(current => ({ ...current, [key]: value }));
    setPreview(null);
    setNotice("");
    setTxHash("");
    setTransactionStatus("idle");
    setConfirmedCoin("");
  }

  function previewCoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setTxHash("");
    setTransactionStatus("idle");
    setConfirmedCoin("");
    try {
      const result = validateCoinDraft(draft);
      setPreview(result);
      setNotice("Draft checked locally. Confirm your metadata JSON is uploaded and matches these fields before launching.");
    } catch (error) {
      setPreview(null);
      setNotice(errorMessage(error));
    }
  }

  async function launchCoin() {
    if (!preview || !address || !onUltra || factoryStatus !== "verified" || submitting) return;
    const wallet = injectedWallet();
    if (!wallet) { setNotice("Connect an Ultra EVM Testnet wallet first."); return; }
    setSubmitting(true); setNotice(""); setTxHash(""); setConfirmedCoin("");
    setTransactionStatus("idle");
    let submitted: Hash | null = null;
    try {
      // The linked ULTRA/LOOKE market is NOT created by this operation.
      // Only the existing on-chain creator coin factory may issue a standalone ERC20.
      const checked = validateCoinDraft(preview);
      const source = createUltraPublicClient();
      await requireUltraEvmTestnet(wallet);
      const accounts = await wallet.request({method:"eth_accounts"}) as string[];
      if (!accounts?.[0] || !isAddress(accounts[0]) ||
          getAddress(accounts[0]) !== getAddress(address)) {
        throw new Error("Connected wallet changed. Reconnect and review your draft.");
      }
      await verifyFactoryDeployment(source, LOOKE_FACTORY_ADDRESS, LOOKE_FACTORY_DEPLOY_TX);
      const supply = parseUnits(checked.supply, 18);
      if (supply <= 0n) throw new Error("Initial supply must be positive.");
      const data = encodeFunctionData({abi:lookeCoinFactoryAbi,functionName:"createCoin",
        args:[checked.name,checked.symbol,checked.metadataURI,supply]});
      // This requests explicit approval in the user's own wallet. The server
      // cannot sign and Looke never handles private keys.
      const raw = await wallet.request({method:"eth_sendTransaction",params:[{
        from:getAddress(address),to:getAddress(LOOKE_FACTORY_ADDRESS),data
      }]});
      if (typeof raw !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(raw))
        throw new Error("Wallet did not return a valid transaction hash.");
      submitted=raw as Hash;setTxHash(submitted);setTransactionStatus("submitted");
      setNotice("Wallet-submitted Testnet token creation is awaiting two confirmations.");
      const receipt = await source.waitForTransactionReceipt({
        hash:submitted,confirmations:2,timeout:120_000
      });
      const event = decodeCoinCreatedFromReceipt(receipt,getAddress(LOOKE_FACTORY_ADDRESS),{
        creator:getAddress(address),name:checked.name,symbol:checked.symbol,
        metadataURI:checked.metadataURI,supply
      });
      await verifyCreatedCoinState(source,event);
      setConfirmedCoin(event.coin);setTransactionStatus("confirmed");
      setNotice("Creator coin confirmed on Ultra EVM Testnet. Pairing remains separate and requires actual liquidity.");
    } catch (error) {
      setTransactionStatus(submitted ? "submitted" : "failed");
      setNotice(submitted ? "Transaction submitted but not fully verified. Inspect the Testnet explorer before retrying: "+errorMessage(error) : errorMessage(error));
    } finally {setSubmitting(false);}
  }

  return (
    <main className="shell shell-discover looke-v14-shell">
      <header className="topbar">
        <button className="brand" aria-label="Looke home" onClick={() => setScreen("Discover")}>
          <span className="brandmark">L<span>●</span></span>
          <span>looke<span className="branddot">.</span></span>
        </button>
        <div className="lk-global-search"><span aria-hidden="true">⌕</span>
          <input type="search" value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)}
            aria-label="Search Looke creators and markets" placeholder="Search for creators, trends or tokens…"/>
          {globalSearch&&<button type="button" aria-label="Clear search" onClick={()=>setGlobalSearch("")}>×</button>}
        </div>
        <button className="wallet" onClick={()=>{if(address)setShowWallet(true);else void connectWallet();}} disabled={walletBusy}>
          <span className="wallet-led" /> {walletBusy ? "Connecting…" : address ? shortAddress(address) : "Connect wallet"} <span aria-hidden="true">↗</span>
        </button>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-label">EXPLORE</div>
          <nav aria-label="Main navigation">
            {screens.map(item => (
              <button key={item} className={`navitem ${screen===item||(item==="Create"&&showCreate)||(item==="Wallet"&&showWallet)?"nav-active":""}`}
                title={item} aria-label={item} aria-pressed={screen===item} onClick={()=>chooseNavigation(item)}>
                <span className="navicon">{icons[item]}</span>{item}<span className="navarrow">↗</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <span className="sidebar-label">NETWORK</span>
            <div className="network-detail"><span className="statusdot" /> Ultra EVM Testnet <span>18881</span></div>
            <p>Exclusively Ultra EVM · Testnet 18881. Mainnet 19991 is not enabled for transactions.</p>
            <div className="sidefoot">Looke / Public Testnet beta · 01</div>
          </div>
        </aside>

        <section className="content">
          {screen === "Discover" && <DiscoverDashboard globalQuery={globalSearch} onCreate={()=>setShowCreate(true)} />}
          {screen === "Trending" && <TrendingFeed search={globalSearch} onCreate={()=>setShowCreate(true)}/>}
          {screen === "Messages" && <MessagesPanel/>}
          {screen === "Notifications" && <NotificationsPanel onCreate={()=>{setShowCreate(true);}}/>}
          {screen === "Profile" && <ProfilePanel address={address} onCreate={()=>setShowCreate(true)}/>}
           {screen === "Points" && <PointsDashboard/>}
          {screen === "Wallet" && <div className="lk-wallet-route">
            <h1>Wallet</h1><p>Inspect your real Ultra EVM Testnet account in the wallet popup.</p>
            <button type="button" onClick={()=>address?setShowWallet(true):void connectWallet()}>
              {address?"Open wallet":"Connect wallet"}</button></div>}

          {screen === "Create" && (
            <section className="create-screen">
              <span className="overline">01 / CREATOR STUDIO</span>
              <h1 className="page-title">Make your <em>mark.</em></h1>
              <p className="page-description">Build and review your token. Wallet-approved creation is enabled only after a confirmed factory deployment is independently checked on Ultra EVM Testnet.</p>
              <div className="create-grid">
                <form className="create-form" onSubmit={previewCoin}>
                  <div className="form-head"><h2>Token details</h2><span className="muted-tag">ULTRA EVM TESTNET</span></div>
                  <div className="field-row"><label>Coin name<input maxLength={64} required placeholder="e.g. Ultra Cat" value={draft.name} onChange={e => updateDraft("name", e.target.value)} /></label><label>Ticker<input maxLength={12} required placeholder="UCAT" value={draft.symbol} onChange={e => updateDraft("symbol", e.target.value)} /></label></div>
                  <label>Description<textarea rows={3} required placeholder="What is this coin about?" value={draft.description} onChange={e => updateDraft("description", e.target.value)} /></label>
                  <label>Image URI<input required placeholder="ipfs://... or https://..." value={draft.image} onChange={e => updateDraft("image", e.target.value)} /></label>
                  <label>Published metadata JSON URI<input required placeholder="ipfs://.../metadata.json" value={draft.metadataURI} onChange={e => updateDraft("metadataURI", e.target.value)} /></label>
                  <label>Initial supply<input required inputMode="decimal" placeholder="1000000" value={draft.supply} onChange={e => updateDraft("supply", e.target.value)} /></label>
                  <div className="lk-review-pair"><strong>PAIR WITH</strong>
                    <span>{chosenPair==="ULTRA"?"◆ ULTRA":"L LOOKE"}</span>
                    <small>Draft preference only. Actual pair contract, liquidity and wallet execution are not activated.</small>
                  </div>
                  <button className="primary form-submit" type="submit">Review coin draft <span>→</span></button>
                  <p className="field-hint">Looke doesn't upload files yet. Host JSON metadata separately; preview validation does not verify remote content.</p>
                </form>
                <div className="preview-panel"><span className="overline">LIVE DRAFT PREVIEW</span><div className="preview-art"><span>✳</span></div><div className="preview-meta"><div><h3>{preview?.name || draft.name || "Your coin"}</h3><p>${preview?.symbol || draft.symbol || "TOKEN"}</p></div><span className="pill">FIXED SUPPLY</span></div><p>{preview?.description || draft.description || "Your creation starts here."}</p><div className="preview-data"><span>SUPPLY</span><strong>{preview?.supply || "—"}</strong></div><div className="preview-data"><span>NETWORK</span><strong>Ultra EVM · 18881</strong></div><div className="preview-data"><span>FACTORY</span><strong>{factoryStatus === "verified" ? shortAddress(LOOKE_FACTORY_ADDRESS) : "Not verified"}</strong></div>
                  <div className="preview-data"><span>DEPLOYMENT PROOF</span><strong>{factoryStatus === "verified" ? "Verified · 2+ confirmations" : factoryStatus === "checking" ? "Checking testnet receipt…" : "Not available"}</strong></div>
                  <button className="launch-button"
                    disabled={submitting || factoryStatus !== "verified" || !address || !onUltra || !preview}
                    onClick={launchCoin}>
                    {submitting ? "Checking wallet / transaction…" : transactionStatus === "confirmed" ? "Verified on Ultra Testnet ✓" : transactionStatus === "submitted" ? "Awaiting independent verification" : "Launch on Ultra Testnet ↗"}
                  </button>
                  <p className="disabled-reason">ERC20 creator issuance requires a verified Testnet factory and your wallet approval. ULTRA/LOOKE liquidity pairing is a separate action.</p>
                  <p className="disabled-reason">Testnet gas is shown by your wallet. Never approve an unexpected contract. The selected pairing preference does not create liquidity.</p>
                  {factoryStatus !== "verified" && <p className="disabled-reason" role="status">Factory: {factoryReason || (factoryStatus === "checking" ? "Checking deployment receipt…" : "Not configured.")}</p>}
                  {factoryStatus === "verified" && !address && <p className="disabled-reason">Connect your wallet to enable launching.</p>}
                  {address && !onUltra && <p className="disabled-reason">Switch your wallet to Ultra EVM Testnet.</p>}
                </div>
              </div>
            </section>
          )}

          {notice && <div className="notice" role="status">{notice}</div>}
          {txHash && <div className="tx-result">
            <strong>{transactionStatus === "confirmed" ? "Verified coin creation" : "Submitted — not yet verified"}</strong>
            <code>{txHash}</code>
            <a href={testnetTxUrl(txHash)} target="_blank" rel="noopener noreferrer">View transaction on Ultra Testnet explorer ↗</a>
            {confirmedCoin && <p>Created token: <a href={testnetAddressUrl(confirmedCoin)} target="_blank" rel="noopener noreferrer">{confirmedCoin}</a></p>}
            {transactionStatus !== "confirmed" && <p>A submitted hash alone is not proof of token creation.</p>}
          </div>}
          <footer className="footer"><span>© 2026 Looke · Ultra EVM-only creator platform</span><span>{address ? `Wallet ${shortAddress(address)}` : "Wallet disconnected"} · {onUltra ? "Ultra Testnet" : "Network not connected"}</span></footer>
        </section>
      </div>
      {showCreate&&<CreateCoinModal onClose={()=>setShowCreate(false)} onReview={reviewQuickDraft}/>}
      {showWallet&&<WalletModal address={address} correctNetwork={onUltra}
        onClose={()=>setShowWallet(false)}
        onConnect={()=>{setShowWallet(false);void connectWallet();}}
        onTrade={()=>{setShowWallet(false);window.location.assign("/trade");}}/>}
    </main>
  );
}
