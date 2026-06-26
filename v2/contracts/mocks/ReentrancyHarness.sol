// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../HonestFlashArbV2.sol";

interface IReenter {
    function reenter() external;
}

/// @dev Router that, on its first swap, calls a hook which attempts to
/// re-enter a guarded function on the arbitrage contract. Records whether
/// the re-entry reverted and the raw revert data (expected: Reentrancy()).
contract ReentrantRouter {
    struct Rate {
        uint256 num;
        uint256 den;
    }

    mapping(address => mapping(address => Rate)) public rates;

    address public hook;
    bool public triggered;
    bool public reentryBlocked;
    bytes public lastRevert;

    function setRate(
        address tokenIn,
        address tokenOut,
        uint256 num,
        uint256 den
    ) external {
        rates[tokenIn][tokenOut] = Rate(num, den);
    }

    function setHook(address hook_) external {
        hook = hook_;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 minAmountOut,
        address[] calldata route,
        address recipient,
        uint256 /* deadline */
    ) external returns (uint256[] memory amounts) {
        if (hook != address(0) && !triggered) {
            triggered = true;
            try IReenter(hook).reenter() {
                // No revert means the reentrancy guard failed to block.
                reentryBlocked = false;
            } catch (bytes memory reason) {
                reentryBlocked = true;
                lastRevert = reason;
            }
        }

        address tokenIn = route[0];
        address tokenOut = route[route.length - 1];
        Rate memory r = rates[tokenIn][tokenOut];
        require(r.den > 0, "no rate");

        uint256 out = (amountIn * r.num) / r.den;
        require(out >= minAmountOut, "INSUFFICIENT_OUTPUT_AMOUNT");

        require(
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn),
            "pull in failed"
        );
        require(IERC20(tokenOut).transfer(recipient, out), "pay out failed");

        amounts = new uint256[](route.length);
        amounts[0] = amountIn;
        amounts[route.length - 1] = out;
    }
}

/// @dev Owns the arbitrage contract (owner == this) so it can legitimately
/// pass the onlyOwner check, then attempt a guarded re-entry via reenter().
contract MaliciousOwner is IReenter {
    HonestFlashArbV2 public immutable arb;
    address public reenterToken;

    constructor(
        address pool_,
        address[] memory routers,
        address[] memory tokens
    ) {
        arb = new HonestFlashArbV2(pool_, routers, tokens);
    }

    function setReenterToken(address token) external {
        reenterToken = token;
    }

    function run(
        address asset,
        uint256 amount,
        HonestFlashArbV2.ArbPlan calldata plan
    ) external {
        arb.startArbitrage(asset, amount, plan);
    }

    /// @dev Called from inside the active startArbitrage (during a router swap).
    /// As owner this passes onlyOwner, but the nonReentrant guard must revert.
    function reenter() external override {
        arb.withdrawAccumulatedProfit(reenterToken);
    }
}
