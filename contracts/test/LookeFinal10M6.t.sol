// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LookeM6CreatorFactory} from "../LookeM6CreatorFactory.sol";
import {LookeCoin} from "../LookeCoin.sol";

contract M6User {
    function make(LookeM6CreatorFactory f, uint256 nonce,
        LookeM6CreatorFactory.QuotePreference preference)
        external returns(address) {
        return f.createCoin("Looke Creator","CREATOR","ipfs://bafybeigdyrzt5sfp7udm7hu76uhmizcmus36cybk6z52v6t37viffyzqku",500 ether,preference,nonce);
    }
}
contract LookeFinal10M6Test {
    function testSafeCreatorSupplyOwnerNoncePairAndNoFees() public {
        LookeM6CreatorFactory f=new LookeM6CreatorFactory();
        M6User creator=new M6User();
        address token=creator.make(f,0,LookeM6CreatorFactory.QuotePreference.ULTRA);
        LookeCoin c=LookeCoin(token);
        require(c.creator()==address(creator),"owner");
        require(c.balanceOf(address(creator))==500 ether,"creator owns full supply");
        require(c.totalSupply()==500 ether,"fixed supply");
        require(f.CREATION_FEE_WEI()==0,"no fee");
        require(f.creatorNonces(address(creator))==1,"nonce consumed");
        require(uint8(f.quotePreferenceOf(token))==0,"ULTRA preference");
        address next=creator.make(f,1,LookeM6CreatorFactory.QuotePreference.LOOKE);
        require(next!=token,"unique tokens");
        require(uint8(f.quotePreferenceOf(next))==1,"LOOKE preference");
        require(f.coinCount()==2 && f.coinsByCreator(address(creator)).length==2,"index");
        require(address(f).balance==0,"factory must not take fees");
    }
    function testReplayedNonceAndCrossWalletNonceIsolation() public {
        LookeM6CreatorFactory f=new LookeM6CreatorFactory();
        M6User a=new M6User();M6User b=new M6User();
        a.make(f,0,LookeM6CreatorFactory.QuotePreference.ULTRA);
        bool reverted;
        try a.make(f,0,LookeM6CreatorFactory.QuotePreference.ULTRA) returns(address){
            reverted=false;
        }catch{reverted=true;}
        require(reverted,"stale nonce should revert");
        b.make(f,0,LookeM6CreatorFactory.QuotePreference.LOOKE);
        require(f.creatorNonces(address(a))==1 && f.creatorNonces(address(b))==1,"wallet isolation");
    }
    function testInvalidSupplySymbolMetadataAndEmptyNameRevert() public {
        LookeM6CreatorFactory f=new LookeM6CreatorFactory();bool failed;
        try f.createCoin("Demo","DEMO","ipfs://validmetadata",0,LookeM6CreatorFactory.QuotePreference.ULTRA,0) returns(address){
            failed=false;
        }catch{failed=true;}require(failed,"zero supply");
        try f.createCoin("Demo","DEMO","ipfs://validmetadata",f.MAX_SUPPLY()+1,LookeM6CreatorFactory.QuotePreference.ULTRA,0) returns(address){
            failed=false;
        }catch{failed=true;}require(failed,"oversized supply");
        try f.createCoin("Demo","demo","ipfs://validmetadata",1 ether,LookeM6CreatorFactory.QuotePreference.ULTRA,0) returns(address){
            failed=false;
        }catch{failed=true;}require(failed,"lowercase symbol");
        try f.createCoin("Demo","DEMO","https://example.com/changeable",1 ether,LookeM6CreatorFactory.QuotePreference.ULTRA,0) returns(address){
            failed=false;
        }catch{failed=true;}require(failed,"mutable metadata");
        try f.createCoin("","DEMO","ipfs://validmetadata",1 ether,LookeM6CreatorFactory.QuotePreference.ULTRA,0) returns(address){
            failed=false;
        }catch{failed=true;}require(failed,"empty name");
        require(f.creatorNonces(address(this))==0 && f.coinCount()==0,"reverted issuance did not consume nonce");
    }
}
