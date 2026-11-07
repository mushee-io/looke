/** M6 V2 factory ABI is proposal-only. No approved deployed M6 address. */
export const m6CreatorFactoryAbi=[
 {type:"function",name:"createCreatorCoin",stateMutability:"nonpayable",
  inputs:[
   {name:"name_",type:"string"},
   {name:"symbol_",type:"string"},
   {name:"metadataURI_",type:"string"},
   {name:"initialSupply_",type:"uint256"},
   {name:"preference_",type:"uint8"},
   {name:"nonce_",type:"bytes32"}
  ],outputs:[{name:"coin",type:"address"}]},
 {type:"function",name:"coinCount",stateMutability:"view",inputs:[],outputs:[{type:"uint256"}]},
 {type:"function",name:"ultraPairAsset",stateMutability:"view",inputs:[],outputs:[{type:"address"}]},
 {type:"function",name:"lookePairAsset",stateMutability:"view",inputs:[],outputs:[{type:"address"}]},
 {type:"function",name:"nonceUsed",stateMutability:"view",inputs:[{type:"address"},{type:"bytes32"}],outputs:[{type:"bool"}]},
 {type:"event",name:"M6CoinCreated",anonymous:false,inputs:[
  {name:"creator",type:"address",indexed:true},
  {name:"coin",type:"address",indexed:true},
  {name:"pairAsset",type:"address",indexed:true},
  {name:"pairPreference",type:"uint8",indexed:false},
  {name:"nonce",type:"bytes32",indexed:false},
  {name:"name",type:"string",indexed:false},
  {name:"symbol",type:"string",indexed:false},
  {name:"metadataURI",type:"string",indexed:false},
  {name:"initialSupply",type:"uint256",indexed:false}
 ]}
] as const;
