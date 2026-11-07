// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LookeCoin} from "./LookeCoin.sol";

/// @notice M6 factory candidate for Ultra EVM Testnet ONLY.
/// @dev Pair preference is metadata, NOT deployed liquidity or a swap.
/// No owner/admin mint, post-launch mint, tax, fee collection, approvals,
/// router interactions or external wallet-signature approvals.
contract LookeM6CreatorFactory {
    enum QuotePreference { ULTRA, LOOKE }
    uint256 public constant CREATION_FEE_WEI = 0;
    uint256 public constant MAX_SUPPLY = 1_000_000_000_000 ether;
    mapping(address => uint256) public creatorNonces;
    mapping(address => address[]) private _createdBy;
    mapping(address => QuotePreference) public quotePreferenceOf;
    address[] private _coins;

    event CreatorCoinCreated(
        address indexed creator, address indexed coin,
        uint256 indexed creatorNonce, QuotePreference preference,
        uint256 initialSupply, uint256 feeWei
    );

    function createCoin(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        uint256 initialSupply,
        QuotePreference preference,
        uint256 expectedNonce
    ) external returns (address coin) {
        require(creatorNonces[msg.sender] == expectedNonce, "stale creator nonce");
        require(initialSupply > 0 && initialSupply <= MAX_SUPPLY, "supply outside limits");
        _validate(name,symbol,metadataURI);
        // Deliberately cannot receive native UOS: function is nonpayable.
        // Nonce is recorded before the token constructor runs; revert rolls it back.
        creatorNonces[msg.sender]=expectedNonce+1;
        coin=address(new LookeCoin(name,symbol,metadataURI,msg.sender,initialSupply));
        _coins.push(coin);
        _createdBy[msg.sender].push(coin);
        quotePreferenceOf[coin]=preference;
        emit CreatorCoinCreated(
            msg.sender,coin,expectedNonce,preference,initialSupply,CREATION_FEE_WEI
        );
    }
    function _validate(string calldata name,string calldata symbol,string calldata metadataURI) private pure {
        bytes memory n=bytes(name);
        bytes memory ticker=bytes(symbol);
        bytes memory uri=bytes(metadataURI);
        require(n.length >= 2 && n.length <= 64, "name length");
        require(ticker.length >= 2 && ticker.length <= 12, "ticker length");
        for (uint256 i=0;i<ticker.length;i++) {
            bytes1 c=ticker[i];
            require((c>=0x41&&c<=0x5a)||(c>=0x30&&c<=0x39), "ticker must be uppercase ASCII");
        }
        require(uri.length>=13 && uri.length<=240, "metadata length");
        require(_prefix(uri, "ipfs://") || _prefix(uri, "ar://"), "immutable URI required");
        for(uint256 i=0;i<uri.length;i++) {
            require(uint8(uri[i])>32 && uint8(uri[i])<127 && uri[i]!=0x5c, "invalid metadata characters");
        }
    }
    function coinCount() external view returns(uint256){return _coins.length;}
    function coinsByCreator(address owner) external view returns(address[] memory){
        return _createdBy[owner];
    }
    function _prefix(bytes memory value,bytes memory prefix) private pure returns(bool){
        if(value.length<prefix.length)return false;
        for(uint256 i=0;i<prefix.length;i++)if(value[i]!=prefix[i])return false;
        return true;
    }
}
