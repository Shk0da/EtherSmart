// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISwapRouter02Mock {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

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

contract MockAavePool {
    uint256 public immutable premiumBps;

    constructor(uint256 premiumBps_) {
        premiumBps = premiumBps_;
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
            msg.sender,
            params
        );
        require(ok, "callback returned false");

        require(
            IERC20(asset).transferFrom(receiver, address(this), amount + premium),
            "repay failed"
        );
    }
}

contract MockRouter {
    struct Rate {
        uint256 num;
        uint256 den;
    }

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
        uint256
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

contract MockSwapRouterV3 {
    struct Rate {
        uint256 num;
        uint256 den;
    }

    mapping(address => mapping(address => Rate)) public rates;

    function setRate(
        address tokenIn,
        address tokenOut,
        uint256 num,
        uint256 den
    ) external {
        rates[tokenIn][tokenOut] = Rate(num, den);
    }

    function exactInput(
        ISwapRouter02Mock.ExactInputParams calldata params
    ) external returns (uint256 amountOut) {
        address tokenIn = _tokenAt(params.path, 0);
        address tokenOut = _tokenAt(params.path, params.path.length - 20);
        Rate memory r = rates[tokenIn][tokenOut];
        require(r.den > 0, "no rate");

        amountOut = (params.amountIn * r.num) / r.den;
        require(amountOut >= params.amountOutMinimum, "INSUFFICIENT_OUTPUT");

        require(
            IERC20(tokenIn).transferFrom(
                msg.sender,
                address(this),
                params.amountIn
            ),
            "pull in failed"
        );
        require(
            IERC20(tokenOut).transfer(params.recipient, amountOut),
            "pay out failed"
        );
    }

    function _tokenAt(bytes calldata path, uint256 offset)
        private
        pure
        returns (address token)
    {
        require(offset + 20 <= path.length, "path");
        assembly {
            token := shr(96, calldataload(add(path.offset, offset)))
        }
    }
}

/// @dev Curve exchange mock: output = amountIn * num / den per (i,j) pair.
contract MockCurvePool {
    struct Rate {
        uint256 num;
        uint256 den;
    }

    mapping(int128 => mapping(int128 => Rate)) public rates;
    mapping(int128 => address) public coins;

    function setCoin(int128 index, address token) external {
        coins[index] = token;
    }

    function setRate(
        int128 i,
        int128 j,
        uint256 num,
        uint256 den
    ) external {
        rates[i][j] = Rate(num, den);
    }

    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256) {
        Rate memory r = rates[i][j];
        require(r.den > 0, "no rate");
        uint256 dy = (dx * r.num) / r.den;
        require(dy >= min_dy, "slippage");

        address tokenIn = coins[i];
        address tokenOut = coins[j];
        require(
            IERC20(tokenIn).transferFrom(msg.sender, address(this), dx),
            "pull in failed"
        );
        require(IERC20(tokenOut).transfer(msg.sender, dy), "pay out failed");
        return dy;
    }
}

interface IFlashLoanRecipientMock {
    function receiveFlashLoan(
        address[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external;
}

/// @dev Balancer vault mock: single-hop batchSwap + zero-fee flashLoan.
contract MockBalancerVault {
    struct Rate {
        uint256 num;
        uint256 den;
    }

    mapping(bytes32 => mapping(address => mapping(address => Rate))) public rates;
    uint256 public flashFeeBps;

    constructor(uint256 flashFeeBps_) {
        flashFeeBps = flashFeeBps_;
    }

    function setRate(
        bytes32 poolId,
        address tokenIn,
        address tokenOut,
        uint256 num,
        uint256 den
    ) external {
        rates[poolId][tokenIn][tokenOut] = Rate(num, den);
    }

    enum SwapKind {
        GIVEN_IN,
        GIVEN_OUT
    }

    struct BatchSwapStep {
        bytes32 poolId;
        uint256 assetInIndex;
        uint256 assetOutIndex;
        uint256 amount;
        bytes userData;
    }

    struct FundManagement {
        address sender;
        bool fromInternalBalance;
        address payable recipient;
        bool toInternalBalance;
    }

    function batchSwap(
        SwapKind,
        BatchSwapStep[] memory swaps,
        address[] memory assets,
        FundManagement memory funds,
        int256[] memory limits,
        uint256
    ) external returns (int256[] memory deltas) {
        deltas = new int256[](assets.length);
        BatchSwapStep memory step = swaps[0];
        address tokenIn = assets[step.assetInIndex];
        address tokenOut = assets[step.assetOutIndex];
        Rate memory r = rates[step.poolId][tokenIn][tokenOut];
        require(r.den > 0, "no rate");

        uint256 out = (step.amount * r.num) / r.den;
        require(int256(out) >= -limits[step.assetOutIndex], "limit");

        require(
            IERC20(tokenIn).transferFrom(msg.sender, address(this), step.amount),
            "pull in failed"
        );
        require(
            IERC20(tokenOut).transfer(funds.recipient, out),
            "pay out failed"
        );

        deltas[step.assetInIndex] = int256(step.amount);
        deltas[step.assetOutIndex] = -int256(out);
    }

    function flashLoan(
        address recipient,
        address[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external {
        require(tokens.length == amounts.length, "length");
        uint256[] memory fees = new uint256[](tokens.length);

        for (uint256 i = 0; i < tokens.length; ) {
            fees[i] = (amounts[i] * flashFeeBps) / 10000;
            require(
                IERC20(tokens[i]).transfer(recipient, amounts[i]),
                "lend failed"
            );
            unchecked {
                ++i;
            }
        }

        IFlashLoanRecipientMock(recipient).receiveFlashLoan(
            tokens,
            amounts,
            fees,
            userData
        );

        for (uint256 i = 0; i < tokens.length; ) {
            uint256 repay = amounts[i] + fees[i];
            require(
                IERC20(tokens[i]).transferFrom(recipient, address(this), repay),
                "repay failed"
            );
            unchecked {
                ++i;
            }
        }
    }
}

interface IUniswapV3FlashCallback {
    function uniswapV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external;
}

contract MockUniV3FlashPool {
    address public immutable token0;
    address public immutable token1;
    uint256 public flashFeeBps;

    constructor(address token0_, address token1_, uint256 flashFeeBps_) {
        token0 = token0_;
        token1 = token1_;
        flashFeeBps = flashFeeBps_;
    }

    function flash(
        address recipient,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external {
        uint256 fee0 = (amount0 * flashFeeBps) / 10000;
        uint256 fee1 = (amount1 * flashFeeBps) / 10000;

        if (amount0 > 0) {
            require(IERC20(token0).transfer(recipient, amount0), "lend0");
        }
        if (amount1 > 0) {
            require(IERC20(token1).transfer(recipient, amount1), "lend1");
        }

        IUniswapV3FlashCallback(recipient).uniswapV3FlashCallback(
            fee0,
            fee1,
            data
        );

        if (amount0 > 0) {
            require(
                IERC20(token0).transferFrom(
                    recipient,
                    address(this),
                    amount0 + fee0
                ),
                "repay0"
            );
        }
        if (amount1 > 0) {
            require(
                IERC20(token1).transferFrom(
                    recipient,
                    address(this),
                    amount1 + fee1
                ),
                "repay1"
            );
        }
    }
}
