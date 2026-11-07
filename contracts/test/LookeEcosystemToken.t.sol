// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LookeEcosystemToken} from "../LookeEcosystemToken.sol";

contract LookeTokenActor {
    function approve(LookeEcosystemToken token, address spender, uint256 amount) external {
        require(token.approve(spender, amount), "approve failed");
    }
    function transfer(LookeEcosystemToken token, address to, uint256 amount) external {
        require(token.transfer(to, amount), "transfer failed");
    }
    function transferFrom(LookeEcosystemToken token, address from, address to, uint256 amount) external {
        require(token.transferFrom(from, to, amount), "transferFrom failed");
    }
    function tryTransfer(LookeEcosystemToken token, address to, uint256 amount) external returns (bool) {
        (bool success,) = address(token).call(
            abi.encodeWithSelector(LookeEcosystemToken.transfer.selector, to, amount)
        );
        return success;
    }
    function tryTransferFrom(LookeEcosystemToken token, address from, address to, uint256 amount)
        external returns (bool) {
        (bool success,) = address(token).call(
            abi.encodeWithSelector(LookeEcosystemToken.transferFrom.selector, from, to, amount)
        );
        return success;
    }
}

contract LookeEcosystemTokenTest {
    uint256 private constant SUPPLY = 100_000_000 ether;

    function testExactSupplyAndImmutableMetadata() public {
        LookeEcosystemToken token = new LookeEcosystemToken(address(this));
        require(keccak256(bytes(token.name())) == keccak256("Looke"), "wrong name");
        require(keccak256(bytes(token.symbol())) == keccak256("LOOKE"), "wrong ticker");
        require(token.decimals() == 18, "wrong decimals");
        require(token.totalSupply() == SUPPLY, "wrong 100M supply");
        require(token.balanceOf(address(this)) == SUPPLY, "treasury not funded");
        require(token.balanceOf(address(0)) == 0, "zero address funded");
    }

    function testInitialTreasuryIsExplicitRecipient() public {
        LookeTokenActor treasury = new LookeTokenActor();
        LookeEcosystemToken token = new LookeEcosystemToken(address(treasury));
        require(token.balanceOf(address(treasury)) == SUPPLY, "wrong treasury");
        require(token.balanceOf(address(this)) == 0, "deployer incorrectly funded");
    }

    function testZeroTreasuryReverts() public {
        try new LookeEcosystemToken(address(0)) {
            revert("zero treasury unexpectedly accepted");
        } catch {}
    }

    function testTransfersPreserveExactlyOneHundredMillion() public {
        LookeEcosystemToken token = new LookeEcosystemToken(address(this));
        LookeTokenActor receiver = new LookeTokenActor();
        require(token.transfer(address(receiver), 11 ether), "transfer failed");
        require(token.balanceOf(address(receiver)) == 11 ether, "receiver balance");
        require(token.balanceOf(address(this)) == SUPPLY - 11 ether, "sender balance");
        receiver.transfer(token, address(this), 1 ether);
        require(token.balanceOf(address(receiver)) == 10 ether, "return transfer");
        require(token.totalSupply() == SUPPLY, "supply changed");
    }

    function testAllowancesAndTransferFromCannotIncreaseSupply() public {
        LookeEcosystemToken token = new LookeEcosystemToken(address(this));
        LookeTokenActor spender = new LookeTokenActor();
        LookeTokenActor receiver = new LookeTokenActor();
        require(token.approve(address(spender), 7 ether), "approve failed");
        spender.transferFrom(token, address(this), address(receiver), 3 ether);
        require(token.allowance(address(this), address(spender)) == 4 ether, "allowance wrong");
        require(token.balanceOf(address(receiver)) == 3 ether, "receiver wrong");
        require(!spender.tryTransferFrom(token, address(this), address(receiver), 5 ether), "overspend accepted");
        require(token.totalSupply() == SUPPLY, "supply changed");
    }

    function testRejectZeroRecipientAndExcessBalances() public {
        LookeEcosystemToken token = new LookeEcosystemToken(address(this));
        LookeTokenActor actor = new LookeTokenActor();
        require(!actor.tryTransfer(token, address(0), 1), "zero destination succeeded");
        require(!actor.tryTransfer(token, address(this), 1), "unfunded transfer succeeded");
        try token.transfer(address(0), 1) returns (bool) {
            revert("zero recipient should revert");
        } catch {
            // Revert is expected: no token can be sent to address(0).
        }
    }

    function testNoExternalMintOrAdminSelector() public {
        LookeEcosystemToken token = new LookeEcosystemToken(address(this));
        (bool mintSuccess,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", address(this), 1));
        (bool ownerSuccess,) = address(token).call(abi.encodeWithSignature("owner()"));
        (bool pauseSuccess,) = address(token).call(abi.encodeWithSignature("pause()"));
        require(!mintSuccess && !ownerSuccess && !pauseSuccess, "unexpected privileged selector");
        require(token.totalSupply() == SUPPLY, "supply mutation");
    }
}
