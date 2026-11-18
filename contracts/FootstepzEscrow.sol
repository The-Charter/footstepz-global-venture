// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Footstepz Global Venture USDC Escrow
/// @notice Holds order payments until the shop marks shipment or the buyer is refunded.
/// @dev Intended for Arc Testnet USDC (0x3600000000000000000000000000000000000000).
///      The token is supplied at deployment; amounts are raw USDC units (6 decimals).
///      Assumes the supplied token is standard, non-fee-on-transfer USDC.
contract FootstepzEscrow is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Lifecycle of an order; terminal orders cannot be reused.
    enum Status { None, Paid, Shipped, Refunded }

    /// @notice Payment and lifecycle information for an order.
    struct Order {
        address buyer;
        uint256 amount;
        uint64 paidAt;
        Status status;
    }

    /// @notice Time after payment when a buyer may claim an unshipped order refund.
    uint256 public constant REFUND_TIMEOUT = 14 days;

    /// @notice USDC token accepted by this escrow.
    IERC20 public immutable usdc;

    /// @notice Order records keyed by buyer and shop order identifier.
    mapping(address buyer => mapping(bytes32 orderId => Order)) public orders;

    /// @notice The supplied USDC address is zero.
    error ZeroAddress();
    /// @notice An order payment must be greater than zero.
    error ZeroAmount();
    /// @notice The order identifier has already been used by this buyer.
    error OrderAlreadyExists(bytes32 orderId);
    /// @notice The order is not awaiting shipment or refund.
    error OrderNotPaid(bytes32 orderId);
    /// @notice Only the recorded buyer may claim a timeout refund.
    error NotOrderBuyer(bytes32 orderId, address caller);
    /// @notice The buyer's refund deadline has not yet been reached.
    error RefundTimeoutNotReached(bytes32 orderId, uint256 availableAt);
    /// @notice Ownership cannot be renounced.
    error RenounceOwnershipDisabled();

    /// @notice Emitted when a buyer funds an order.
    event OrderPaid(bytes32 indexed orderId, address indexed buyer, uint256 amount);
    /// @notice Emitted when shipment releases payment to the current shop owner.
    event OrderShipped(bytes32 indexed orderId, address indexed buyer, uint256 amount);
    /// @notice Emitted when an order payment is returned to its buyer.
    event OrderRefunded(bytes32 indexed orderId, address indexed buyer, uint256 amount);

    /// @notice Sets the shop owner explicitly, independently of the deploying wallet.
    /// @param initialOwner Shop owner's wallet; must not be zero.
    /// @param usdc_ USDC token address; must not be zero.
    /// @dev Ownable rejects a zero initialOwner with OwnableInvalidOwner.
    constructor(address initialOwner, address usdc_) Ownable(initialOwner) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
    }

    /// @notice Pays for a new order using previously approved USDC.
    /// @param orderId Identifier unique to the caller, which cannot be reused even after settlement.
    /// @param amount Payment in raw USDC units (1 USDC = 1,000,000 units).
    function createOrder(bytes32 orderId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (orders[msg.sender][orderId].status != Status.None) revert OrderAlreadyExists(orderId);

        orders[msg.sender][orderId] = Order({
            buyer: msg.sender,
            amount: amount,
            paidAt: uint64(block.timestamp),
            status: Status.Paid
        });

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit OrderPaid(orderId, msg.sender, amount);
    }

    /// @notice Marks an order shipped and releases its payment to the current owner.
    /// @param buyer Buyer whose order is being shipped.
    /// @param orderId Identifier of a paid order belonging to buyer.
    function markShipped(address buyer, bytes32 orderId) external onlyOwner nonReentrant {
        Order storage order = orders[buyer][orderId];
        if (order.status != Status.Paid) revert OrderNotPaid(orderId);

        order.status = Status.Shipped;
        uint256 amount = order.amount;
        usdc.safeTransfer(owner(), amount);
        emit OrderShipped(orderId, buyer, amount);
    }

    /// @notice Allows the shop owner to refund an unshipped order at any time.
    /// @param buyer Buyer whose order is being refunded.
    /// @param orderId Identifier of a paid order belonging to buyer.
    function refund(address buyer, bytes32 orderId) external onlyOwner nonReentrant {
        Order storage order = orders[buyer][orderId];
        if (order.status != Status.Paid) revert OrderNotPaid(orderId);

        order.status = Status.Refunded;
        uint256 amount = order.amount;
        usdc.safeTransfer(buyer, amount);
        emit OrderRefunded(orderId, buyer, amount);
    }

    /// @notice Allows the buyer to reclaim an unshipped payment after 14 days.
    /// @param orderId Identifier of a paid order belonging to the caller; nonexistent orders revert with OrderNotPaid.
    function claimRefund(bytes32 orderId) external nonReentrant {
        Order storage order = orders[msg.sender][orderId];
        if (order.status != Status.Paid) revert OrderNotPaid(orderId);
        uint256 availableAt = uint256(order.paidAt) + REFUND_TIMEOUT;
        if (block.timestamp < availableAt) {
            revert RefundTimeoutNotReached(orderId, availableAt);
        }

        order.status = Status.Refunded;
        address buyer = order.buyer;
        uint256 amount = order.amount;
        usdc.safeTransfer(buyer, amount);
        emit OrderRefunded(orderId, buyer, amount);
    }

    /// @notice Always reverts to preserve an owner for shipment and voluntary refunds.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceOwnershipDisabled();
    }
}
