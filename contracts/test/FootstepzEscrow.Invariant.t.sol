// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {FootstepzEscrow} from "../FootstepzEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

contract EscrowHandler is Test {
    FootstepzEscrow public escrow;
    MockERC20 public usdc;
    address public owner;
    address[] public buyers;
    bytes32[] public ids;
    address[] public keyBuyers;

    uint256 public totalIn;
    uint256 public totalShipped;
    uint256 public totalRefunded;

    constructor(FootstepzEscrow e, MockERC20 u, address o) {
        escrow = e;
        usdc = u;
        owner = o;
        for (uint256 i = 0; i < 3; i++) {
            address b = makeAddr(string.concat("buyer", vm.toString(i)));
            buyers.push(b);
            usdc.mint(b, type(uint128).max);
            vm.prank(b);
            usdc.approve(address(e), type(uint256).max);
        }
    }

    function idsLength() external view returns (uint256) {
        return ids.length;
    }

    function keyBuyer(uint256 i) external view returns (address) {
        return keyBuyers[i];
    }

    /// Small shared id space so different buyers frequently reuse the same orderId.
    function pay(uint256 buyerSeed, uint256 idSeed, uint256 amount) external {
        amount = bound(amount, 1, 1_000_000e6);
        address b = buyers[buyerSeed % buyers.length];
        bytes32 id = bytes32((idSeed % 4) + 1);
        (,,, FootstepzEscrow.Status s) = escrow.orders(b, id);
        if (s != FootstepzEscrow.Status.None) return;
        vm.prank(b);
        escrow.createOrder(id, amount);
        ids.push(id);
        keyBuyers.push(b);
        totalIn += amount;
    }

    function ship(uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 i = idSeed % ids.length;
        (, uint256 amt,, FootstepzEscrow.Status s) = escrow.orders(keyBuyers[i], ids[i]);
        if (s != FootstepzEscrow.Status.Paid) return;
        vm.prank(owner);
        escrow.markShipped(keyBuyers[i], ids[i]);
        totalShipped += amt;
    }

    function refund(uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 i = idSeed % ids.length;
        (, uint256 amt,, FootstepzEscrow.Status s) = escrow.orders(keyBuyers[i], ids[i]);
        if (s != FootstepzEscrow.Status.Paid) return;
        vm.prank(owner);
        escrow.refund(keyBuyers[i], ids[i]);
        totalRefunded += amt;
    }

    function claim(uint256 idSeed, uint256 dt) external {
        if (ids.length == 0) return;
        skip(bound(dt, 0, 20 days));
        uint256 i = idSeed % ids.length;
        (address b, uint256 amt, uint64 paidAt, FootstepzEscrow.Status s) = escrow.orders(keyBuyers[i], ids[i]);
        if (s != FootstepzEscrow.Status.Paid || block.timestamp < uint256(paidAt) + 14 days) return;
        vm.prank(b);
        escrow.claimRefund(ids[i]);
        totalRefunded += amt;
    }
}

contract FootstepzEscrowInvariantTest is Test {
    FootstepzEscrow internal escrow;
    MockERC20 internal usdc;
    EscrowHandler internal handler;
    address internal owner = makeAddr("owner");

    function setUp() public {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        escrow = new FootstepzEscrow(owner, address(usdc));
        handler = new EscrowHandler(escrow, usdc, owner);
        targetContract(address(handler));
    }

    /// Escrow balance equals the sum of amounts of orders still in Paid status.
    function invariant_BalanceEqualsOpenOrders() public view {
        uint256 open;
        uint256 n = handler.idsLength();
        for (uint256 i = 0; i < n; i++) {
            (, uint256 amt,, FootstepzEscrow.Status s) = escrow.orders(handler.keyBuyer(i), handler.ids(i));
            if (s == FootstepzEscrow.Status.Paid) open += amt;
        }
        assertEq(usdc.balanceOf(address(escrow)), open);
    }

    /// Conservation: everything paid in is either held, shipped to owner, or refunded.
    function invariant_Conservation() public view {
        assertEq(
            handler.totalIn(),
            usdc.balanceOf(address(escrow)) + handler.totalShipped() + handler.totalRefunded()
        );
        assertEq(usdc.balanceOf(owner), handler.totalShipped());
    }
}
