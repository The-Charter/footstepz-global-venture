// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {FootstepzEscrow} from "../FootstepzEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

contract FootstepzEscrowTest is Test {
    FootstepzEscrow internal escrow;
    MockERC20 internal usdc;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal newOwner = makeAddr("newOwner");

    bytes32 internal constant ID = keccak256("order-1");
    bytes32 internal constant ID2 = keccak256("order-2");
    uint256 internal constant AMT = 100e6;

    event OrderPaid(bytes32 indexed orderId, address indexed buyer, uint256 amount);
    event OrderShipped(bytes32 indexed orderId, address indexed buyer, uint256 amount);
    event OrderRefunded(bytes32 indexed orderId, address indexed buyer, uint256 amount);

    function setUp() public {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        escrow = new FootstepzEscrow(owner, address(usdc));
        usdc.mint(alice, 10_000e6);
        usdc.mint(bob, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _pay(address who, bytes32 id, uint256 amt) internal {
        vm.prank(who);
        escrow.createOrder(id, amt);
    }

    function _order(address buyer, bytes32 id) internal view returns (address b, uint256 a, uint64 t, FootstepzEscrow.Status s) {
        return escrow.orders(buyer, id);
    }

    // ---------------- Deployment ----------------

    function test_Constructor_SetsOwnerAndToken() public view {
        assertEq(escrow.owner(), owner);
        assertEq(address(escrow.usdc()), address(usdc));
        assertEq(escrow.REFUND_TIMEOUT(), 14 days);
    }

    function test_RevertConstructor_ZeroToken() public {
        vm.expectRevert(FootstepzEscrow.ZeroAddress.selector);
        new FootstepzEscrow(owner, address(0));
    }

    function test_RevertConstructor_ZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new FootstepzEscrow(address(0), address(usdc));
    }

    // ---------------- createOrder ----------------

    function test_CreateOrder_RecordsOrderAndEscrowsFunds() public {
        uint256 before = usdc.balanceOf(alice);
        _pay(alice, ID, AMT);
        (address b, uint256 a, uint64 t, FootstepzEscrow.Status s) = _order(alice, ID);
        assertEq(b, alice);
        assertEq(a, AMT);
        assertEq(uint256(t), block.timestamp);
        assertEq(uint256(s), uint256(FootstepzEscrow.Status.Paid));
        assertEq(usdc.balanceOf(address(escrow)), AMT);
        assertEq(usdc.balanceOf(alice), before - AMT);
    }

    function test_CreateOrder_EmitsOrderPaid() public {
        vm.expectEmit(true, true, false, true, address(escrow));
        emit OrderPaid(ID, alice, AMT);
        _pay(alice, ID, AMT);
    }

    function test_RevertCreateOrder_ZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(FootstepzEscrow.ZeroAmount.selector);
        escrow.createOrder(ID, 0);
    }

    function test_RevertCreateOrder_DuplicateIdSameBuyer() public {
        _pay(alice, ID, AMT);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderAlreadyExists.selector, ID));
        escrow.createOrder(ID, AMT);
    }

    /// A second buyer can use the same orderId as another buyer (no front-run griefing),
    /// and the two orders are fully independent.
    function test_CreateOrder_SameIdDifferentBuyers_NoGriefing() public {
        _pay(alice, ID, AMT);
        _pay(bob, ID, 2 * AMT);

        (address ab, uint256 aa,, FootstepzEscrow.Status as_) = _order(alice, ID);
        (address bb, uint256 ba,, FootstepzEscrow.Status bs) = _order(bob, ID);
        assertEq(ab, alice);
        assertEq(aa, AMT);
        assertEq(uint256(as_), uint256(FootstepzEscrow.Status.Paid));
        assertEq(bb, bob);
        assertEq(ba, 2 * AMT);
        assertEq(uint256(bs), uint256(FootstepzEscrow.Status.Paid));
        assertEq(usdc.balanceOf(address(escrow)), 3 * AMT);

        // Settling alice's order leaves bob's order with the same id untouched.
        vm.prank(owner);
        escrow.markShipped(alice, ID);
        (,,, FootstepzEscrow.Status bs2) = _order(bob, ID);
        assertEq(uint256(bs2), uint256(FootstepzEscrow.Status.Paid));

        // Bob's order can be refunded independently.
        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(owner);
        escrow.refund(bob, ID);
        assertEq(usdc.balanceOf(bob), bobBefore + 2 * AMT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_CreateOrder_SameIdDifferentBuyers_EmitsOrderPaidForEach() public {
        vm.expectEmit(true, true, false, true, address(escrow));
        emit OrderPaid(ID, alice, AMT);
        _pay(alice, ID, AMT);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit OrderPaid(ID, bob, 2 * AMT);
        _pay(bob, ID, 2 * AMT);
    }

    function test_RevertMarkShipped_WrongBuyer() public {
        _pay(alice, ID, AMT);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderNotPaid.selector, ID));
        escrow.markShipped(bob, ID);
    }

    function test_RevertRefund_WrongBuyer() public {
        _pay(alice, ID, AMT);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderNotPaid.selector, ID));
        escrow.refund(bob, ID);
    }

    function test_ClaimRefund_SameIdDifferentBuyers_OnlyOwnOrder() public {
        _pay(alice, ID, AMT);
        _pay(bob, ID, 2 * AMT);
        skip(14 days);
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        escrow.claimRefund(ID);
        assertEq(usdc.balanceOf(alice), aliceBefore + AMT);
        (,,, FootstepzEscrow.Status bs) = _order(bob, ID);
        assertEq(uint256(bs), uint256(FootstepzEscrow.Status.Paid));
        assertEq(usdc.balanceOf(address(escrow)), 2 * AMT);
    }

    function test_RevertCreateOrder_ReuseAfterShipped() public {
        _pay(alice, ID, AMT);
        vm.prank(owner);
        escrow.markShipped(alice, ID);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderAlreadyExists.selector, ID));
        escrow.createOrder(ID, AMT);
    }

    function test_RevertCreateOrder_ReuseAfterRefunded() public {
        _pay(alice, ID, AMT);
        vm.prank(owner);
        escrow.refund(alice, ID);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderAlreadyExists.selector, ID));
        escrow.createOrder(ID, AMT);
    }

    function test_RevertCreateOrder_NoAllowance() public {
        address carol = makeAddr("carol");
        usdc.mint(carol, AMT);
        vm.prank(carol);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(escrow), 0, AMT)
        );
        escrow.createOrder(ID, AMT);
    }

    function test_RevertCreateOrder_InsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert();
        escrow.createOrder(ID, 10_000e6 + 1);
    }

    // ---------------- markShipped ----------------

    function test_MarkShipped_ReleasesToOwner() public {
        _pay(alice, ID, AMT);
        vm.prank(owner);
        escrow.markShipped(alice, ID);
        assertEq(usdc.balanceOf(owner), AMT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        (,,, FootstepzEscrow.Status s) = _order(alice, ID);
        assertEq(uint256(s), uint256(FootstepzEscrow.Status.Shipped));
    }

    function test_MarkShipped_EmitsOrderShipped() public {
        _pay(alice, ID, AMT);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit OrderShipped(ID, alice, AMT);
        vm.prank(owner);
        escrow.markShipped(alice, ID);
    }

    function test_MarkShipped_PaysCurrentOwnerAfterTransfer() public {
        _pay(alice, ID, AMT);
        vm.prank(owner);
        escrow.transferOwnership(newOwner);
        vm.prank(newOwner);
        escrow.acceptOwnership();
        vm.prank(newOwner);
        escrow.markShipped(alice, ID);
        assertEq(usdc.balanceOf(newOwner), AMT);
        assertEq(usdc.balanceOf(owner), 0);
    }

    function test_RevertMarkShipped_NonOwner() public {
        _pay(alice, ID, AMT);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.markShipped(alice, ID);
    }

    function test_RevertMarkShipped_NonexistentOrder() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderNotPaid.selector, ID));
        escrow.markShipped(alice, ID);
    }

    function test_RevertMarkShipped_Twice() public {
        _pay(alice, ID, AMT);
        vm.startPrank(owner);
        escrow.markShipped(alice, ID);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderNotPaid.selector, ID));
        escrow.markShipped(alice, ID);
        vm.stopPrank();
    }

    function test_RevertMarkShipped_AfterRefund() public {
        _pay(alice, ID, AMT);
        vm.startPrank(owner);
        escrow.refund(alice, ID);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderNotPaid.selector, ID));
        escrow.markShipped(alice, ID);
        vm.stopPrank();
    }

    // ---------------- refund ----------------

    function test_Refund_ReturnsToBuyer() public {
        uint256 before = usdc.balanceOf(alice);
        _pay(alice, ID, AMT);
        vm.prank(owner);
        escrow.refund(alice, ID);
        assertEq(usdc.balanceOf(alice), before);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        (,,, FootstepzEscrow.Status s) = _order(alice, ID);
        assertEq(uint256(s), uint256(FootstepzEscrow.Status.Refunded));
    }

    function test_Refund_EmitsOrderRefunded() public {
        _pay(alice, ID, AMT);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit OrderRefunded(ID, alice, AMT);
        vm.prank(owner);
        escrow.refund(alice, ID);
    }

    function test_RevertRefund_NonOwner() public {
        _pay(alice, ID, AMT);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.refund(alice, ID);
    }

    function test_RevertRefund_Twice() public {
        _pay(alice, ID, AMT);
        vm.startPrank(owner);
        escrow.refund(alice, ID);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderNotPaid.selector, ID));
        escrow.refund(alice, ID);
        vm.stopPrank();
    }

    function test_RevertRefund_AfterShipped() public {
        _pay(alice, ID, AMT);
        vm.startPrank(owner);
        escrow.markShipped(alice, ID);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderNotPaid.selector, ID));
        escrow.refund(alice, ID);
        vm.stopPrank();
    }

    function test_RevertRefund_NonexistentOrder() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderNotPaid.selector, ID));
        escrow.refund(alice, ID);
    }

    // ---------------- claimRefund ----------------

    function test_ClaimRefund_AfterTimeout() public {
        uint256 before = usdc.balanceOf(alice);
        _pay(alice, ID, AMT);
        skip(14 days);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit OrderRefunded(ID, alice, AMT);
        vm.prank(alice);
        escrow.claimRefund(ID);
        assertEq(usdc.balanceOf(alice), before);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        (,,, FootstepzEscrow.Status s) = _order(alice, ID);
        assertEq(uint256(s), uint256(FootstepzEscrow.Status.Refunded));
    }

    function test_RevertClaimRefund_BeforeTimeout() public {
        _pay(alice, ID, AMT);
        (,, uint64 paidAt,) = _order(alice, ID);
        skip(14 days - 1);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(FootstepzEscrow.RefundTimeoutNotReached.selector, ID, uint256(paidAt) + 14 days)
        );
        escrow.claimRefund(ID);
    }

    /// Orders are keyed by msg.sender, so a non-buyer sees no paid order under their own key.
    function test_RevertClaimRefund_NonBuyer() public {
        _pay(alice, ID, AMT);
        skip(14 days);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderNotPaid.selector, ID));
        escrow.claimRefund(ID);
        assertEq(usdc.balanceOf(address(escrow)), AMT);
    }

    function test_RevertClaimRefund_NonexistentOrder() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderNotPaid.selector, ID));
        escrow.claimRefund(ID);
    }

    function test_RevertClaimRefund_Twice() public {
        _pay(alice, ID, AMT);
        skip(14 days);
        vm.startPrank(alice);
        escrow.claimRefund(ID);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderNotPaid.selector, ID));
        escrow.claimRefund(ID);
        vm.stopPrank();
    }

    function test_RevertClaimRefund_AfterShipped() public {
        _pay(alice, ID, AMT);
        vm.prank(owner);
        escrow.markShipped(alice, ID);
        skip(14 days);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderNotPaid.selector, ID));
        escrow.claimRefund(ID);
    }

    function test_RevertClaimRefund_AfterOwnerRefund() public {
        _pay(alice, ID, AMT);
        vm.prank(owner);
        escrow.refund(alice, ID);
        skip(14 days);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FootstepzEscrow.OrderNotPaid.selector, ID));
        escrow.claimRefund(ID);
    }

    function test_OrdersAreIndependent() public {
        _pay(alice, ID, AMT);
        _pay(bob, ID2, 2 * AMT);
        vm.prank(owner);
        escrow.markShipped(alice, ID);
        assertEq(usdc.balanceOf(address(escrow)), 2 * AMT);
        (,,, FootstepzEscrow.Status s2) = _order(bob, ID2);
        assertEq(uint256(s2), uint256(FootstepzEscrow.Status.Paid));
    }

    // ---------------- Ownership ----------------

    function test_RevertRenounceOwnership_Owner() public {
        vm.prank(owner);
        vm.expectRevert(FootstepzEscrow.RenounceOwnershipDisabled.selector);
        escrow.renounceOwnership();
        assertEq(escrow.owner(), owner);
    }

    function test_RevertRenounceOwnership_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.renounceOwnership();
    }

    function test_Ownable2Step_TransferRequiresAccept() public {
        vm.expectEmit(true, true, false, false, address(escrow));
        emit Ownable2Step.OwnershipTransferStarted(owner, newOwner);
        vm.prank(owner);
        escrow.transferOwnership(newOwner);
        assertEq(escrow.owner(), owner);
        assertEq(escrow.pendingOwner(), newOwner);

        vm.expectEmit(true, true, false, false, address(escrow));
        emit Ownable.OwnershipTransferred(owner, newOwner);
        vm.prank(newOwner);
        escrow.acceptOwnership();
        assertEq(escrow.owner(), newOwner);
        assertEq(escrow.pendingOwner(), address(0));
    }

    function test_RevertAcceptOwnership_NotPending() public {
        vm.prank(owner);
        escrow.transferOwnership(newOwner);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.acceptOwnership();
    }

    function test_RevertTransferOwnership_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.transferOwnership(alice);
    }

    function test_OldOwnerLosesPowerAfterTransfer() public {
        _pay(alice, ID, AMT);
        vm.prank(owner);
        escrow.transferOwnership(newOwner);
        vm.prank(newOwner);
        escrow.acceptOwnership();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        escrow.refund(alice, ID);
    }

    // ---------------- Fuzz ----------------

    function testFuzz_PayThenShip(uint256 amount) public {
        amount = bound(amount, 1, 10_000e6);
        _pay(alice, ID, amount);
        assertEq(usdc.balanceOf(address(escrow)), amount);
        vm.prank(owner);
        escrow.markShipped(alice, ID);
        assertEq(usdc.balanceOf(owner), amount);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testFuzz_PayThenOwnerRefund(uint256 amount) public {
        amount = bound(amount, 1, 10_000e6);
        uint256 before = usdc.balanceOf(alice);
        _pay(alice, ID, amount);
        vm.prank(owner);
        escrow.refund(alice, ID);
        assertEq(usdc.balanceOf(alice), before);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testFuzz_ClaimRefundTimeoutBoundary(uint256 amount, uint256 elapsed) public {
        amount = bound(amount, 1, 10_000e6);
        elapsed = bound(elapsed, 0, 60 days);
        uint256 before = usdc.balanceOf(alice);
        _pay(alice, ID, amount);
        skip(elapsed);
        vm.prank(alice);
        if (elapsed < 14 days) {
            vm.expectRevert();
            escrow.claimRefund(ID);
            assertEq(usdc.balanceOf(address(escrow)), amount);
        } else {
            escrow.claimRefund(ID);
            assertEq(usdc.balanceOf(alice), before);
            assertEq(usdc.balanceOf(address(escrow)), 0);
        }
    }
}
