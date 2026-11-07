// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LookeCreatorFactoryM6} from "../LookeCreatorFactoryM6.sol";
import {LookeCoin} from "../LookeCoin.sol";

contract MockM6PairAsset { function identity() external pure returns (bool) { return true; } }
contract M6CreatorWallet {
    function create(
        LookeCreatorFactoryM6 factory, bytes32 nonce, LookeCreatorFactoryM6.PairPreference pair
    ) external returns (address) {
        return factory.createCreatorCoin("Ultra Idea", "IDEA", "ipfs://bafybeigdyrzt5sfp7udm7hu76uhmizcmus36cybk6z52v6t37viffyzqku",
            1_000 ether,pair,nonce);
    }
}

interface M6Vm { function chainId(uint256 chain) external; }
contract LookeCreatorFactoryM6Test {
    M6Vm private constant vm=M6Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    function factory() internal returns (LookeCreatorFactoryM6) {
        vm.chainId(18881);
        return new LookeCreatorFactoryM6(address(new MockM6PairAsset()),address(new MockM6PairAsset()));
    }
    function testMainnetFactoryConstructorIsRejected() public {
        vm.chainId(19991);
        bool rejected;
        try new LookeCreatorFactoryM6(address(new MockM6PairAsset()),address(new MockM6PairAsset()))
          returns(LookeCreatorFactoryM6){rejected=false;}catch{rejected=true;}
        require(rejected,"Mainnet factory deployment must fail closed");
    }
    function testOnlyExplicitWalletCallMintsFixedSupplyAndNoLiquidity() public {
        LookeCreatorFactoryM6 f=factory();
        M6CreatorWallet alice=new M6CreatorWallet();
        address coinAddr=alice.create(f,bytes32(uint256(1)),LookeCreatorFactoryM6.PairPreference.ULTRA);
        LookeCoin coin=LookeCoin(coinAddr);
        require(coin.creator()==address(alice),"wrong signed owner");
        require(coin.balanceOf(address(alice))==1_000 ether,"owner did not receive fixed supply");
        require(coin.balanceOf(address(f))==0,"factory must not take minted supply");
        require(coin.totalSupply()==1_000 ether,"incorrect supply");
        require(f.nonceUsed(address(alice),bytes32(uint256(1))),"nonce not consumed");
        require(f.coinCount()==1,"index not persisted");
        require(f.coinsByCreator(address(alice))[0]==coinAddr,"creator index wrong");
        require(f.applicationFeeWei()==0,"M6 app fee must be zero");
        require(f.pairAsset(LookeCreatorFactoryM6.PairPreference.ULTRA)==f.ultraPairAsset(),"ULTRA preference");
        require(f.pairAsset(LookeCreatorFactoryM6.PairPreference.LOOKE)==f.lookePairAsset(),"LOOKE preference");
    }
    function testReplayAndReverseWalletReplayIsolation() public {
        LookeCreatorFactoryM6 f=factory();
        M6CreatorWallet alice=new M6CreatorWallet();
        M6CreatorWallet bob=new M6CreatorWallet();
        alice.create(f,bytes32(uint256(3)),LookeCreatorFactoryM6.PairPreference.LOOKE);
        bool reverted;
        try alice.create(f,bytes32(uint256(3)),LookeCreatorFactoryM6.PairPreference.LOOKE) returns(address){
            reverted=false;
        }catch{reverted=true;}
        require(reverted,"same-wallet nonce replay must fail");
        bob.create(f,bytes32(uint256(3)),LookeCreatorFactoryM6.PairPreference.ULTRA);
        require(f.coinCount()==2,"nonce scope not owner bound");
        require(f.coinsByCreator(address(bob)).length==1,"wallet ownership leaked");
    }
    function testRequiresRealDistinctPairContractAddresses() public {
        address mock=address(new MockM6PairAsset());
        bool rejected;
        try new LookeCreatorFactoryM6(address(0),mock) returns(LookeCreatorFactoryM6){rejected=false;}catch{rejected=true;}
        require(rejected,"zero pair cannot pass");
        try new LookeCreatorFactoryM6(mock,mock) returns(LookeCreatorFactoryM6){rejected=false;}catch{rejected=true;}
        require(rejected,"duplicate pair cannot pass");
        try new LookeCreatorFactoryM6(mock,address(0x12345)) returns(LookeCreatorFactoryM6){rejected=false;}catch{rejected=true;}
        require(rejected,"unknown EOA cannot pass");
    }
    function testRejectsMalformedInputsAndNoPayment() public {
        LookeCreatorFactoryM6 f=factory();
        bool reverted;
        try f.createCreatorCoin("Ultra Idea","IDEA","ipfs://valid",1 ether,
            LookeCreatorFactoryM6.PairPreference.ULTRA,bytes32(0)) returns(address){reverted=false;}catch{reverted=true;}
        require(reverted,"zero nonce accepted");
        try f.createCreatorCoin("Ultra Idea","IDEA","ipfs://valid",0,
            LookeCreatorFactoryM6.PairPreference.ULTRA,bytes32(uint256(4))) returns(address){reverted=false;}catch{reverted=true;}
        require(reverted,"zero supply accepted");
        try f.createCreatorCoin("Ultra Idea","IDEA","ipfs://valid",f.MAX_CREATOR_SUPPLY()+1,
            LookeCreatorFactoryM6.PairPreference.ULTRA,bytes32(uint256(4))) returns(address){reverted=false;}catch{reverted=true;}
        require(reverted,"excess supply accepted");
        try f.createCreatorCoin("Ultra Idea","IDEA","",1 ether,
            LookeCreatorFactoryM6.PairPreference.ULTRA,bytes32(uint256(4))) returns(address){reverted=false;}catch{reverted=true;}
        require(reverted,"empty metadata accepted");
        try f.createCreatorCoin("Ultra Idea","X","ipfs://valid",1 ether,
            LookeCreatorFactoryM6.PairPreference.ULTRA,bytes32(uint256(4))) returns(address){reverted=false;}catch{reverted=true;}
        require(reverted,"short ticker accepted");
        require(f.coinCount()==0,"reverted calls changed state");
        require(!f.nonceUsed(address(this),bytes32(uint256(4))),"reverts consumed nonce");
        (bool ok,)=address(f).call{value:0}("");
        require(!ok,"factory must not implement unreviewed fallback");
    }
}
