// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Mintable ERC20 with configurable decimals for tests.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev Test helper to simulate an external balance drain (e.g. to drive
    /// the "balance < accumulatedProfit" branch of the contract).
    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

interface IFlashBorrowerLike {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata data
    ) external returns (bool);
}

/// @dev Minimal Aave-V3-style flashLoanSimple pool.
/// Lends `amount`, invokes the borrower callback, then pulls principal+premium.
contract MockAavePool {
    uint256 public immutable premiumBps; // e.g. 5 = 0.05%

    constructor(uint256 premiumBps_) {
        premiumBps = premiumBps_;
    }

    function premiumFor(uint256 amount) external view returns (uint256) {
        return (amount * premiumBps) / 10000;
    }

    function flashLoanSimple(
        address receiver,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16
    ) external {
        uint256 premium = (amount * premiumBps) / 10000;

        require(IERC20(asset).transfer(receiver, amount), "lend failed");

        bool ok = IFlashBorrowerLike(receiver).executeOperation(
            asset,
            amount,
            premium,
            msg.sender, // initiator == caller of flashLoanSimple
            params
        );
        require(ok, "callback returned false");

        require(
            IERC20(asset).transferFrom(receiver, address(this), amount + premium),
            "repay failed"
        );
    }
}

/// @dev Deterministic Uniswap-V2-style router. Output = amountIn * num / den
/// for the (path[0], path[last]) pair. Pulls input, pays output from balance.
contract MockRouter {
    struct Rate {
        uint256 num;
        uint256 den;
    }

    // tokenIn => tokenOut => rate
    mapping(address => mapping(address => Rate)) public rates;

    function setRate(
        address tokenIn,
        address tokenOut,
        uint256 num,
        uint256 den
    ) external {
        rates[tokenIn][tokenOut] = Rate(num, den);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 minAmountOut,
        address[] calldata route,
        address recipient,
        uint256 /* deadline */
    ) external returns (uint256[] memory amounts) {
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
