// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Looke Ecosystem Token (Ultra EVM Testnet)
/// @notice Official LOOKE, distinct from creator tokens created by LookeCoinFactory.
/// @dev Fixed 100,000,000 LOOKE at 18 decimals. No mint, owner, blacklist,
///      taxes, pause, upgrade, fee controller or administrative privileges.
///      All initial supply is sent once, at deployment, to the specified treasury.
contract LookeEcosystemToken {
    string public constant name = "Looke";
    string public constant symbol = "LOOKE";
    uint8 public constant decimals = 18;
    uint256 public constant totalSupply = 100_000_000 * 10 ** uint256(decimals);

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(address initialTreasury) {
        require(initialTreasury != address(0), "LOOKE: zero treasury");
        balanceOf[initialTreasury] = totalSupply;
        emit Transfer(address(0), initialTreasury, totalSupply);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        require(spender != address(0), "LOOKE: zero spender");
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 authorized = allowance[from][msg.sender];
        if (authorized != type(uint256).max) {
            require(authorized >= amount, "LOOKE: insufficient allowance");
            unchecked { allowance[from][msg.sender] = authorized - amount; }
            emit Approval(from, msg.sender, authorized - amount);
        }
        _transfer(from, to, amount);
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) external returns (bool) {
        require(spender != address(0), "LOOKE: zero spender");
        uint256 updated = allowance[msg.sender][spender] + addedValue;
        allowance[msg.sender][spender] = updated;
        emit Approval(msg.sender, spender, updated);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool) {
        uint256 existing = allowance[msg.sender][spender];
        require(existing >= subtractedValue, "LOOKE: allowance below zero");
        uint256 updated = existing - subtractedValue;
        allowance[msg.sender][spender] = updated;
        emit Approval(msg.sender, spender, updated);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(to != address(0), "LOOKE: zero recipient");
        uint256 current = balanceOf[from];
        require(current >= amount, "LOOKE: insufficient balance");
        unchecked {
            balanceOf[from] = current - amount;
        }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
