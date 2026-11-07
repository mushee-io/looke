// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LookeCoin} from "./LookeCoin.sol";

/// @notice M6 DESIGN-ONLY factory. No deployment address is approved or claimed.
/// @dev Pair selection is a REFERENCE/PREFERENCE, never an AMM pair or liquidity.
///      Only the user's EVM transaction to this method could create a token.
///      No permit, transferFrom, allowance, router call, fees or auto-approvals.
contract LookeCreatorFactoryM6 {
    enum PairPreference { ULTRA, LOOKE }
    uint256 public constant MAX_CREATOR_SUPPLY = 1_000_000_000 ether;
    uint256 public constant applicationFeeWei = 0;
    address public immutable ultraPairAsset;
    address public immutable lookePairAsset;
    address[] public coins;
    mapping(address => address[]) private _coinsByCreator;
    mapping(address => mapping(bytes32 => bool)) public nonceUsed;

    event M6CoinCreated(
        address indexed creator,
        address indexed coin,
        address indexed pairAsset,
        PairPreference pairPreference,
        bytes32 nonce,
        string name,
        string symbol,
        string metadataURI,
        uint256 initialSupply
    );

    constructor(address ultraAsset_, address lookeAsset_) {
        require(block.chainid == 18881, "Ultra EVM Testnet only");
        require(ultraAsset_ != address(0) && lookeAsset_ != address(0), "missing pair identity");
        require(ultraAsset_ != lookeAsset_, "pair identities must differ");
        require(ultraAsset_.code.length > 0 && lookeAsset_.code.length > 0, "pair assets need code");
        ultraPairAsset = ultraAsset_;
        lookePairAsset = lookeAsset_;
    }

    function pairAsset(PairPreference pair) public view returns (address) {
        return pair == PairPreference.ULTRA ? ultraPairAsset : lookePairAsset;
    }

    function createCreatorCoin(
        string calldata name_,
        string calldata symbol_,
        string calldata metadataURI_,
        uint256 initialSupply_,
        PairPreference preference_,
        bytes32 nonce_
    ) external returns (address coin) {
        require(block.chainid == 18881, "Ultra EVM Testnet only");
        require(nonce_ != bytes32(0), "nonce required");
        require(!nonceUsed[msg.sender][nonce_], "nonce already used");
        require(bytes(name_).length > 1 && bytes(name_).length <= 64, "bad name");
        require(bytes(symbol_).length >= 2 && bytes(symbol_).length <= 12, "bad symbol");
        require(bytes(metadataURI_).length > 0 && bytes(metadataURI_).length <= 700, "bad metadata");
        require(initialSupply_ > 0 && initialSupply_ <= MAX_CREATOR_SUPPLY, "bad supply");

        // Setting before CREATE and reverting atomically prevents replays.
        nonceUsed[msg.sender][nonce_] = true;
        coin = address(new LookeCoin(name_, symbol_, metadataURI_, msg.sender, initialSupply_));
        coins.push(coin);
        _coinsByCreator[msg.sender].push(coin);
        emit M6CoinCreated(msg.sender, coin, pairAsset(preference_), preference_,
            nonce_, name_, symbol_, metadataURI_, initialSupply_);
    }

    function coinCount() external view returns (uint256) { return coins.length; }
    function coinsByCreator(address creator_) external view returns (address[] memory) {
        return _coinsByCreator[creator_];
    }
}
