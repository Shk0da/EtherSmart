// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title HonestFlashArbV3
/// @notice Aave V3 flash-loan arbitrage with mixed Uniswap V2 / V3 legs.
/// @dev Builder tips are sent OFF-CHAIN as a separate bundle tx (see bot/flashbotsSender).
///      On-chain ETH tips were removed: WETH unwrap + receive() conflicts add risk inside
///      the flash callback. multiStartArbitrage is intentionally omitted (low ROI, high gas).

interface IERC20Minimal {
    function balanceOf(address who) external view returns (uint256);
    function transfer(address recipient, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
}

interface IAaveSimplePool {
    function flashLoanSimple(
        address receiver,
        address asset,
        uint256 amount,
        bytes calldata data,
        uint16 referralCode
    ) external;
}

interface IAaveSimpleFlashBorrower {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata data
    ) external returns (bool);
}

interface IRouterV2Like {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 minAmountOut,
        address[] calldata route,
        address recipient,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface ISwapRouter02 {
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

library TokenOps {
    error TokenCallReverted(address token);
    error TokenCallReturnedFalse(address token);

    function safeSend(
        IERC20Minimal token,
        address recipient,
        uint256 value
    ) internal {
        _invoke(
            token,
            abi.encodeWithSelector(token.transfer.selector, recipient, value)
        );
    }

    function safeApproveExact(
        IERC20Minimal token,
        address spender,
        uint256 value
    ) internal {
        bytes memory payload = abi.encodeWithSelector(
            token.approve.selector,
            spender,
            value
        );
        if (!_invokeBool(token, payload)) {
            _invoke(
                token,
                abi.encodeWithSelector(token.approve.selector, spender, 0)
            );
            _invoke(token, payload);
        }
    }

    function _invoke(IERC20Minimal token, bytes memory payload) private {
        (bool ok, bytes memory ret) = address(token).call(payload);
        if (!ok) revert TokenCallReverted(address(token));
        if (ret.length > 0 && !abi.decode(ret, (bool))) {
            revert TokenCallReturnedFalse(address(token));
        }
    }

    function _invokeBool(IERC20Minimal token, bytes memory payload)
        private
        returns (bool)
    {
        (bool ok, bytes memory ret) = address(token).call(payload);
        return ok && (ret.length == 0 || abi.decode(ret, (bool)));
    }
}

/// @dev Uniswap V3 encoded path: token(20) + fee(3) + token(20) + ...
library V3PathLib {
    error InvalidV3Path();
    error InvalidV3Fee(uint24 fee);

    uint256 internal constant HOP_SIZE = 23; // 3-byte fee + 20-byte token
    uint256 internal constant MIN_PATH = 20 + 3 + 20; // one hop

    function tokenIn(bytes memory path) internal pure returns (address token) {
        if (path.length < MIN_PATH) revert InvalidV3Path();
        assembly {
            token := shr(96, mload(add(path, 32)))
        }
    }

    function tokenOut(bytes memory path) internal pure returns (address token) {
        if (path.length < MIN_PATH) revert InvalidV3Path();
        bytes20 last;
        assembly {
            last := mload(add(add(path, 32), sub(mload(path), 20)))
        }
        token = address(last);
    }

    /// @notice Validates path shape, allowed fee tiers, and whitelisted tokens.
    function validatePath(
        bytes memory path,
        mapping(address => bool) storage tokenWhitelist
    ) internal view {
        if (path.length < MIN_PATH) revert InvalidV3Path();
        if ((path.length - 20) % HOP_SIZE != 0) revert InvalidV3Path();

        address current = tokenIn(path);
        if (!tokenWhitelist[current]) revert InvalidV3Path();

        uint256 hops = (path.length - 20) / HOP_SIZE;
        for (uint256 i = 0; i < hops; ) {
            uint24 fee = _feeAt(path, 20 + i * HOP_SIZE);
            _checkFee(fee);

            address nextToken = _tokenAt(path, 20 + i * HOP_SIZE + 3);
            if (!tokenWhitelist[nextToken]) revert InvalidV3Path();
            current = nextToken;
            unchecked {
                ++i;
            }
        }
    }

    function _checkFee(uint24 fee) private pure {
        if (fee != 500 && fee != 3000 && fee != 10000) {
            revert InvalidV3Fee(fee);
        }
    }

    function _feeAt(bytes memory path, uint256 offset)
        private
        pure
        returns (uint24 fee)
    {
        require(offset + 3 <= path.length, "path");
        assembly {
            fee := shr(232, mload(add(add(path, 32), offset)))
        }
    }

    function _tokenAt(bytes memory path, uint256 offset)
        private
        pure
        returns (address token)
    {
        require(offset + 20 <= path.length, "path");
        assembly {
            token := shr(96, mload(add(add(path, 32), offset)))
        }
    }
}

contract HonestFlashArbV3 is IAaveSimpleFlashBorrower {
    using TokenOps for IERC20Minimal;

    error Unauthorized();
    error ZeroAddress();
    error ZeroAmount();
    error BadPlan();
    error BadCallback();
    error LoanAlreadyOpen();
    error NoLoanOpen();
    error RouterNotAllowed(address router);
    error TokenNotAllowed(address token);
    error GainTooSmall();
    error ContractPaused();
    error MustBePaused();
    error NativeTransfersDisabled();
    error Reentrancy();
    error InvalidPendingOwner();
    error SweepExceedsAccumulated(uint256 accumulated, uint256 requested);

    /// @dev 0 = V2 router (address[] path), 1 = V3 SwapRouter02 (bytes path).
    enum LegKind {
        V2,
        V3
    }

    struct ArbPlan {
        LegKind leg1Kind;
        LegKind leg2Kind;
        address router1;
        address router2;
        address[] path1;
        address[] path2;
        bytes path1V3;
        bytes path2V3;
        uint256 amountOutMin1;
        uint256 amountOutMin2;
        uint256 minProfit;
        uint256 deadline;
    }

    address public owner;
    address public pendingOwner;
    address public immutable pool;

    bool public paused;
    bool public loanOpen;

    uint256 private _reentryGuard = 1;

    mapping(address => bool) public routerV2Whitelist;
    mapping(address => bool) public routerV3Whitelist;
    mapping(address => bool) public tokenWhitelist;

    bytes32 public activePlanHash;
    address public activeAsset;
    uint256 public activeAmount;
    uint256 public balanceBefore;

    address public profitReceiver;
    mapping(address => uint256) public autoWithdrawThreshold;
    mapping(address => uint256) public accumulatedProfit;

    event OwnershipTransferStarted(
        address indexed previousOwner,
        address indexed newOwner
    );
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );
    event RouterAdded(address indexed router, bool isV3);
    event RouterRemoved(address indexed router, bool isV3);
    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);
    event PauseStatusChanged(bool isPaused);
    event FlashRequested(address indexed asset, uint256 amount);
    event FlashCompleted(
        address indexed asset,
        uint256 amount,
        uint256 premium,
        uint256 profit
    );
    event SwapExecuted(
        uint8 indexed leg,
        address indexed router,
        uint256 amountIn,
        uint256 amountOut
    );
    event GasUsage(uint256 gasStart, uint256 gasEnd);
    event TokenRecovered(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event ProfitReceiverChanged(address indexed newReceiver);
    event AutoWithdrawThresholdSet(address indexed token, uint256 threshold);
    event ProfitAutoWithdrawn(
        address indexed token,
        address indexed receiver,
        uint256 amount
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenRunning() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier nonReentrant() {
        if (_reentryGuard != 1) revert Reentrancy();
        _reentryGuard = 2;
        _;
        _reentryGuard = 1;
    }

    constructor(
        address pool_,
        address[] memory routersV2,
        address[] memory routersV3,
        address[] memory tokens
    ) {
        if (pool_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        pool = pool_;
        profitReceiver = msg.sender;

        for (uint256 i = 0; i < routersV2.length; ) {
            _addRouterV2(routersV2[i]);
            unchecked {
                ++i;
            }
        }
        for (uint256 i = 0; i < routersV3.length; ) {
            _addRouterV3(routersV3[i]);
            unchecked {
                ++i;
            }
        }
        for (uint256 i = 0; i < tokens.length; ) {
            _addToken(tokens[i]);
            unchecked {
                ++i;
            }
        }
    }

    // --- Ownership (Ownable2Step) ---

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert InvalidPendingOwner();
        address previous = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, owner);
    }

    // --- Dynamic whitelists ---

    function addRouterV2(address router) external onlyOwner {
        _addRouterV2(router);
    }

    function addRoutersV2(address[] calldata routers) external onlyOwner {
        for (uint256 i = 0; i < routers.length; ) {
            _addRouterV2(routers[i]);
            unchecked {
                ++i;
            }
        }
    }

    function removeRouterV2(address router) external onlyOwner {
        if (router == address(0)) revert ZeroAddress();
        routerV2Whitelist[router] = false;
        emit RouterRemoved(router, false);
    }

    function addRouterV3(address router) external onlyOwner {
        _addRouterV3(router);
    }

    function addRoutersV3(address[] calldata routers) external onlyOwner {
        for (uint256 i = 0; i < routers.length; ) {
            _addRouterV3(routers[i]);
            unchecked {
                ++i;
            }
        }
    }

    function removeRouterV3(address router) external onlyOwner {
        if (router == address(0)) revert ZeroAddress();
        routerV3Whitelist[router] = false;
        emit RouterRemoved(router, true);
    }

    function addToken(address token) external onlyOwner {
        _addToken(token);
    }

    function addTokens(address[] calldata tokens) external onlyOwner {
        for (uint256 i = 0; i < tokens.length; ) {
            _addToken(tokens[i]);
            unchecked {
                ++i;
            }
        }
    }

    function removeToken(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        tokenWhitelist[token] = false;
        emit TokenRemoved(token);
    }

    function _addRouterV2(address router) private {
        if (router == address(0)) revert ZeroAddress();
        routerV2Whitelist[router] = true;
        emit RouterAdded(router, false);
    }

    function _addRouterV3(address router) private {
        if (router == address(0)) revert ZeroAddress();
        routerV3Whitelist[router] = true;
        emit RouterAdded(router, true);
    }

    function _addToken(address token) private {
        if (token == address(0)) revert ZeroAddress();
        tokenWhitelist[token] = true;
        emit TokenAdded(token);
    }

    // --- Profit settings ---

    function setProfitReceiver(address newReceiver) external onlyOwner {
        if (newReceiver == address(0)) revert ZeroAddress();
        profitReceiver = newReceiver;
        emit ProfitReceiverChanged(newReceiver);
    }

    function setAutoWithdrawThreshold(address token, uint256 threshold)
        external
        onlyOwner
    {
        if (token == address(0)) revert ZeroAddress();
        autoWithdrawThreshold[token] = threshold;
        emit AutoWithdrawThresholdSet(token, threshold);
    }

    function setAutoWithdrawThresholds(
        address[] calldata tokens,
        uint256[] calldata thresholds
    ) external onlyOwner {
        if (tokens.length != thresholds.length) revert BadPlan();
        for (uint256 i = 0; i < tokens.length; ) {
            if (tokens[i] == address(0)) revert ZeroAddress();
            autoWithdrawThreshold[tokens[i]] = thresholds[i];
            emit AutoWithdrawThresholdSet(tokens[i], thresholds[i]);
            unchecked {
                ++i;
            }
        }
    }

    function pause() external onlyOwner {
        paused = true;
        emit PauseStatusChanged(true);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit PauseStatusChanged(false);
    }

    function startArbitrage(
        address asset,
        uint256 amount,
        ArbPlan calldata plan
    ) external onlyOwner whenRunning nonReentrant {
        if (loanOpen) revert LoanAlreadyOpen();
        if (asset == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        _checkPlan(asset, plan);

        uint256 startingBalance =
            IERC20Minimal(asset).balanceOf(address(this));
        bytes memory encodedPlan = abi.encode(plan);

        loanOpen = true;
        activePlanHash = keccak256(encodedPlan);
        activeAsset = asset;
        activeAmount = amount;
        balanceBefore = startingBalance;

        emit FlashRequested(asset, amount);

        IAaveSimplePool(pool).flashLoanSimple(
            address(this),
            asset,
            amount,
            encodedPlan,
            0
        );

        if (loanOpen) revert BadCallback();
        _maybeAutoWithdraw(asset);
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata data
    ) external override whenRunning returns (bool) {
        uint256 gasStart = gasleft();

        if (msg.sender != pool) revert BadCallback();
        if (initiator != address(this)) revert BadCallback();
        if (!loanOpen) revert NoLoanOpen();
        if (asset != activeAsset || amount != activeAmount) {
            revert BadCallback();
        }
        if (keccak256(data) != activePlanHash) revert BadCallback();

        ArbPlan memory plan = abi.decode(data, (ArbPlan));

        uint256 currentBalance = IERC20Minimal(asset).balanceOf(address(this));
        if (currentBalance < balanceBefore + amount) revert BadCallback();

        (uint256 bridgeAmount, address bridgeToken) = _executeLeg(
            1,
            plan.leg1Kind,
            plan.router1,
            asset,
            amount,
            plan.path1,
            plan.path1V3,
            plan.amountOutMin1,
            plan.deadline
        );

        _executeLeg(
            2,
            plan.leg2Kind,
            plan.router2,
            bridgeToken,
            bridgeAmount,
            plan.path2,
            plan.path2V3,
            plan.amountOutMin2,
            plan.deadline
        );

        uint256 debt = amount + premium;
        uint256 endingBalance = IERC20Minimal(asset).balanceOf(address(this));
        if (endingBalance < balanceBefore + debt + plan.minProfit) {
            revert GainTooSmall();
        }

        uint256 profit = endingBalance - balanceBefore - debt;
        _resetLoanState();

        IERC20Minimal(asset).safeApproveExact(pool, debt);

        emit FlashCompleted(asset, amount, premium, profit);
        emit GasUsage(gasStart, gasleft());

        if (profit > 0) {
            accumulatedProfit[asset] += profit;
        }

        return true;
    }

    function _executeLeg(
        uint8 legIndex,
        LegKind kind,
        address router,
        address tokenIn,
        uint256 amountIn,
        address[] memory pathV2,
        bytes memory pathV3,
        uint256 minOut,
        uint256 deadline
    ) internal returns (uint256 amountOut, address tokenOutAddr) {
        if (kind == LegKind.V2) {
            IERC20Minimal(tokenIn).safeApproveExact(router, amountIn);
            uint256[] memory amounts = IRouterV2Like(router)
                .swapExactTokensForTokens(
                    amountIn,
                    minOut,
                    pathV2,
                    address(this),
                    deadline
                );
            IERC20Minimal(tokenIn).safeApproveExact(router, 0);
            amountOut = amounts[amounts.length - 1];
            tokenOutAddr = pathV2[pathV2.length - 1];
        } else {
            tokenOutAddr = V3PathLib.tokenOut(pathV3);
            uint256 balBefore =
                IERC20Minimal(tokenOutAddr).balanceOf(address(this));
            IERC20Minimal(tokenIn).safeApproveExact(router, amountIn);
            ISwapRouter02(router).exactInput(
                ISwapRouter02.ExactInputParams({
                    path: pathV3,
                    recipient: address(this),
                    deadline: deadline,
                    amountIn: amountIn,
                    amountOutMinimum: minOut
                })
            );
            IERC20Minimal(tokenIn).safeApproveExact(router, 0);
            amountOut =
                IERC20Minimal(tokenOutAddr).balanceOf(address(this)) -
                balBefore;
        }

        emit SwapExecuted(legIndex, router, amountIn, amountOut);
    }

    function _maybeAutoWithdraw(address asset) internal {
        uint256 threshold = autoWithdrawThreshold[asset];
        if (threshold == 0) return;

        uint256 accumulated = accumulatedProfit[asset];
        if (accumulated < threshold) return;

        uint256 contractBalance =
            IERC20Minimal(asset).balanceOf(address(this));
        uint256 toSend = accumulated > contractBalance
            ? contractBalance
            : accumulated;

        if (toSend == 0) return;

        accumulatedProfit[asset] = accumulated - toSend;
        IERC20Minimal(asset).safeSend(profitReceiver, toSend);
        emit ProfitAutoWithdrawn(asset, profitReceiver, toSend);
    }

    function withdrawAccumulatedProfit(address asset)
        external
        onlyOwner
        nonReentrant
    {
        uint256 amount = accumulatedProfit[asset];
        if (amount == 0) revert ZeroAmount();

        uint256 contractBalance =
            IERC20Minimal(asset).balanceOf(address(this));
        uint256 toSend = amount > contractBalance ? contractBalance : amount;

        accumulatedProfit[asset] = amount - toSend;
        IERC20Minimal(asset).safeSend(profitReceiver, toSend);
        emit ProfitAutoWithdrawn(asset, profitReceiver, toSend);
    }

    function sweepToken(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (!paused) revert MustBePaused();
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 acc = accumulatedProfit[token];
        if (acc > 0) {
            if (amount > acc) revert SweepExceedsAccumulated(acc, amount);
            accumulatedProfit[token] = acc - amount;
        }

        IERC20Minimal(token).safeSend(to, amount);
        emit TokenRecovered(token, to, amount);
    }

    function _checkPlan(address asset, ArbPlan memory plan) internal view {
        _checkRouter(plan.leg1Kind, plan.router1);
        _checkRouter(plan.leg2Kind, plan.router2);

        if (
            plan.amountOutMin1 == 0 ||
            plan.amountOutMin2 == 0 ||
            plan.minProfit == 0
        ) {
            revert BadPlan();
        }
        if (block.timestamp > plan.deadline) revert BadPlan();

        address leg1In = _legTokenIn(plan.leg1Kind, plan.path1, plan.path1V3);
        address leg1Out =
            _legTokenOut(plan.leg1Kind, plan.path1, plan.path1V3);
        address leg2In = _legTokenIn(plan.leg2Kind, plan.path2, plan.path2V3);
        address leg2Out =
            _legTokenOut(plan.leg2Kind, plan.path2, plan.path2V3);

        if (leg1In != asset) revert BadPlan();
        if (leg2Out != asset) revert BadPlan();
        if (leg1Out != leg2In) revert BadPlan();

        if (plan.leg1Kind == LegKind.V2) {
            _checkV2Path(plan.path1);
        } else {
            V3PathLib.validatePath(plan.path1V3, tokenWhitelist);
        }

        if (plan.leg2Kind == LegKind.V2) {
            _checkV2Path(plan.path2);
        } else {
            V3PathLib.validatePath(plan.path2V3, tokenWhitelist);
        }
    }

    function _checkRouter(LegKind kind, address router) internal view {
        if (kind == LegKind.V2) {
            if (!routerV2Whitelist[router]) revert RouterNotAllowed(router);
        } else if (!routerV3Whitelist[router]) {
            revert RouterNotAllowed(router);
        }
    }

    function _legTokenIn(
        LegKind kind,
        address[] memory pathV2,
        bytes memory pathV3
    ) internal pure returns (address token) {
        if (kind == LegKind.V2) {
            if (pathV2.length < 2) revert BadPlan();
            return pathV2[0];
        }
        return V3PathLib.tokenIn(pathV3);
    }

    function _legTokenOut(
        LegKind kind,
        address[] memory pathV2,
        bytes memory pathV3
    ) internal pure returns (address token) {
        if (kind == LegKind.V2) {
            if (pathV2.length < 2) revert BadPlan();
            return pathV2[pathV2.length - 1];
        }
        return V3PathLib.tokenOut(pathV3);
    }

    function _checkV2Path(address[] memory path) internal view {
        if (path.length < 2) revert BadPlan();
        for (uint256 i = 0; i < path.length; ) {
            if (!tokenWhitelist[path[i]]) revert TokenNotAllowed(path[i]);
            unchecked {
                ++i;
            }
        }
    }

    function _resetLoanState() internal {
        loanOpen = false;
        activePlanHash = bytes32(0);
        activeAsset = address(0);
        activeAmount = 0;
        balanceBefore = 0;
    }

    receive() external payable {
        revert NativeTransfersDisabled();
    }

    fallback() external payable {
        revert NativeTransfersDisabled();
    }
}
