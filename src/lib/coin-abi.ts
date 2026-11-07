export const lookeCoinFactoryAbi = [
  {
    type: "function", name: "createCoin", stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "initialSupply", type: "uint256" },
    ],
    outputs: [{ name: "coin", type: "address" }],
  },
  {
    type: "function", name: "coinCount", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event", name: "CoinCreated", anonymous: false,
    inputs: [
      { name: "creator", type: "address", indexed: true },
      { name: "coin", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "metadataURI", type: "string", indexed: false },
      { name: "initialSupply", type: "uint256", indexed: false },
    ],
  },
] as const;

export const lookeCoinAbi = [
  { type: "function", name: "name", stateMutability:"view",inputs:[],outputs:[{type:"string"}] },
  { type: "function", name: "symbol", stateMutability:"view",inputs:[],outputs:[{type:"string"}] },
  { type: "function", name: "creator", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "metadataURI", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
