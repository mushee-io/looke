/** Testnet-only M6 candidate ABI. No trusted deployed address is bundled. */
export const lookeM6FactoryAbi=[
 {type:"function",name:"createCoin",stateMutability:"nonpayable",
  inputs:[
   {name:"name",type:"string"},{name:"symbol",type:"string"},
   {name:"metadataURI",type:"string"},{name:"initialSupply",type:"uint256"},
   {name:"preference",type:"uint8"},{name:"expectedNonce",type:"uint256"}
  ],outputs:[{name:"coin",type:"address"}]},
 {type:"function",name:"creatorNonces",stateMutability:"view",
  inputs:[{name:"",type:"address"}],outputs:[{name:"",type:"uint256"}]},
 {type:"function",name:"CREATION_FEE_WEI",stateMutability:"view",inputs:[],outputs:[{name:"",type:"uint256"}]},
 {type:"event",name:"CreatorCoinCreated",anonymous:false,
  inputs:[
   {name:"creator",type:"address",indexed:true},{name:"coin",type:"address",indexed:true},
   {name:"creatorNonce",type:"uint256",indexed:true},
   {name:"preference",type:"uint8",indexed:false},
   {name:"name",type:"string",indexed:false},{name:"symbol",type:"string",indexed:false},
   {name:"metadataURI",type:"string",indexed:false},
   {name:"initialSupply",type:"uint256",indexed:false},
   {name:"feeWei",type:"uint256",indexed:false}
  ]}
] as const;
