// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title HonestFlashArbV4
/// @notice Multi-leg flash-loan arbitrage across V2, V3, Curve, and Balancer.
/// @dev Builder tips are OFF-CHAIN (Flashbots bundle). Uni V3 pool flash omitted in MVP.

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

interface ICurvePool {
    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);
}

interface IBalancerVault {
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
        SwapKind kind,
        BatchSwapStep[] memory swaps,
        address[] memory assets,
        FundManagement memory funds,
        int256[] memory limits,
        uint256 deadline
    ) external returns (int256[] memory);

    function flashLoan(
        address recipient,
        address[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(
        address[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external;
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

library V3PathLib {
    error InvalidV3Path();
    error InvalidV3Fee(uint24 fee);

    uint256 internal constant HOP_SIZE = 23;
    uint256 internal constant MIN_PATH = 20 + 3 + 20;

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

contract HonestFlashArbV4 is
    IAaveSimpleFlashBorrower,
    IFlashLoanRecipient
{
    using TokenOps for IERC20Minimal;

    error Unauthorized();
    error ZeroAddress();
    error ZeroAmount();
    error BadPlan();
    error BadCallback();
    error LoanAlreadyOpen();
    error NoLoanOpen();
    error RouterNotAllowed(address router);
    error PoolNotAllowed(address pool);
    error TokenNotAllowed(address token);
    error GainTooSmall();
    error ContractPaused();
    error MustBePaused();
    error NativeTransfersDisabled();
    error Reentrancy();
    error InvalidPendingOwner();
    error SweepExceedsAccumulated(uint256 accumulated, uint256 requested);
    error TooManyLegs();
    error TooFewLegs();

    enum LegType {
        V2,
        V3,
        CURVE,
        BALANCER
    }

    enum FlashSource {
        AAVE,
        BALANCER_VAULT
    }

    struct SwapLeg {
        LegType legType;
        address target;
        bytes data;
        uint256 amountIn;
        uint256 minAmountOut;
    }

    struct ArbPlanV4 {
        SwapLeg[] legs;
        address loanToken;
        uint256 loanAmount;
        uint256 minProfit;
        uint256 deadline;
    }

    uint256 public constant MAX_LEGS = 6;

    address public owner;
    address public pendingOwner;
    address public immutable pool;
    address public immutable balancerVault;

    bool public paused;
    bool public loanOpen;

    uint256 private _reentryGuard = 1;

    mapping(address => bool) public routerV2Whitelist;
    mapping(address => bool) public routerV3Whitelist;
    mapping(address => bool) public curvePoolWhitelist;
    mapping(address => bool) public tokenWhitelist;

    bytes32 public activePlanHash;
    address public activeAsset;
    uint256 public activeAmount;
    uint256 public balanceBefore;
    FlashSource public activeFlashSource;

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
    event CurvePoolAdded(address indexed pool);
    event CurvePoolRemoved(address indexed pool);
    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);
    event PauseStatusChanged(bool isPaused);
    event FlashRequested(
        uint8 indexed source,
        address indexed asset,
        uint256 amount
    );
    event FlashCompleted(
        address indexed asset,
        uint256 amount,
        uint256 premium,
        uint256 profit
    );
    event SwapExecuted(
        uint8 indexed leg,
        address indexed target,
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
        address balancerVault_,
        address[] memory routersV2,
        address[] memory routersV3,
        address[] memory curvePools,
        address[] memory tokens
    ) {
        if (pool_ == address(0)) revert ZeroAddress();
        if (balancerVault_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        pool = pool_;
        balancerVault = balancerVault_;
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
        for (uint256 i = 0; i < curvePools.length; ) {
            _addCurvePool(curvePools[i]);
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

    function addCurvePool(address curvePool) external onlyOwner {
        _addCurvePool(curvePool);
    }

    function addCurvePools(address[] calldata pools) external onlyOwner {
        for (uint256 i = 0; i < pools.length; ) {
            _addCurvePool(pools[i]);
            unchecked {
                ++i;
            }
        }
    }

    function removeCurvePool(address curvePool) external onlyOwner {
        if (curvePool == address(0)) revert ZeroAddress();
        curvePoolWhitelist[curvePool] = false;
        emit CurvePoolRemoved(curvePool);
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

    function _addCurvePool(address curvePool) private {
        if (curvePool == address(0)) revert ZeroAddress();
        curvePoolWhitelist[curvePool] = true;
        emit CurvePoolAdded(curvePool);
    }

    function _addToken(address token) private {
        if (token == address(0)) revert ZeroAddress();
        tokenWhitelist[token] = true;
        emit TokenAdded(token);
    }

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

    function pause() external onlyOwner {
        paused = true;
        emit PauseStatusChanged(true);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit PauseStatusChanged(false);
    }

    function startArbitrage(
        FlashSource source,
        ArbPlanV4 calldata plan
    ) external onlyOwner whenRunning nonReentrant {
        if (loanOpen) revert LoanAlreadyOpen();
        if (plan.loanToken == address(0)) revert ZeroAddress();
        if (plan.loanAmount == 0) revert ZeroAmount();

        _checkPlan(plan);

        uint256 startingBalance =
            IERC20Minimal(plan.loanToken).balanceOf(address(this));
        bytes memory encodedPlan = abi.encode(plan);

        loanOpen = true;
        activePlanHash = keccak256(encodedPlan);
        activeAsset = plan.loanToken;
        activeAmount = plan.loanAmount;
        balanceBefore = startingBalance;
        activeFlashSource = source;

        emit FlashRequested(
            uint8(source),
            plan.loanToken,
            plan.loanAmount
        );

        if (source == FlashSource.AAVE) {
            IAaveSimplePool(pool).flashLoanSimple(
                address(this),
                plan.loanToken,
                plan.loanAmount,
                encodedPlan,
                0
            );
        } else {
            address[] memory tokens = new address[](1);
            uint256[] memory amounts = new uint256[](1);
            tokens[0] = plan.loanToken;
            amounts[0] = plan.loanAmount;
            IBalancerVault(balancerVault).flashLoan(
                address(this),
                tokens,
                amounts,
                encodedPlan
            );
        }

        if (loanOpen) revert BadCallback();
        _maybeAutoWithdraw(plan.loanToken);
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata data
    ) external override whenRunning returns (bool) {
        if (activeFlashSource != FlashSource.AAVE) revert BadCallback();
        if (msg.sender != pool) revert BadCallback();
        if (initiator != address(this)) revert BadCallback();
        return _runFlashCallback(asset, amount, premium, data);
    }

    function receiveFlashLoan(
        address[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override whenRunning {
        if (activeFlashSource != FlashSource.BALANCER_VAULT) {
            revert BadCallback();
        }
        if (msg.sender != balancerVault) revert BadCallback();
        if (tokens.length != 1 || amounts.length != 1) revert BadCallback();

        uint256 premium = feeAmounts.length > 0 ? feeAmounts[0] : 0;
        bool ok = _runFlashCallback(tokens[0], amounts[0], premium, userData);
        if (!ok) revert BadCallback();
    }

    function _runFlashCallback(
        address asset,
        uint256 amount,
        uint256 premium,
        bytes memory data
    ) internal returns (bool) {
        uint256 gasStart = gasleft();

        if (!loanOpen) revert NoLoanOpen();
        if (asset != activeAsset || amount != activeAmount) revert BadCallback();
        if (keccak256(data) != activePlanHash) revert BadCallback();

        ArbPlanV4 memory plan = abi.decode(data, (ArbPlanV4));

        uint256 currentBalance = IERC20Minimal(asset).balanceOf(address(this));
        if (currentBalance < balanceBefore + amount) revert BadCallback();

        address tokenIn = asset;
        uint256 amountIn = amount;

        for (uint256 i = 0; i < plan.legs.length; ) {
            SwapLeg memory leg = plan.legs[i];
            if (leg.amountIn > 0) {
                amountIn = leg.amountIn;
            } else {
                amountIn = IERC20Minimal(tokenIn).balanceOf(address(this));
            }

            (uint256 amountOut, address tokenOut) = _executeLeg(
                uint8(i + 1),
                leg,
                tokenIn,
                amountIn,
                plan.deadline
            );

            tokenIn = tokenOut;
            amountIn = amountOut;
            unchecked {
                ++i;
            }
        }

        uint256 debt = amount + premium;
        uint256 endingBalance = IERC20Minimal(asset).balanceOf(address(this));
        if (endingBalance < balanceBefore + debt + plan.minProfit) {
            revert GainTooSmall();
        }

        uint256 profit = endingBalance - balanceBefore - debt;
        FlashSource flashSource = activeFlashSource;
        _resetLoanState();

        if (flashSource == FlashSource.AAVE) {
            IERC20Minimal(asset).safeApproveExact(pool, debt);
        } else {
            IERC20Minimal(asset).safeApproveExact(balancerVault, debt);
        }

        emit FlashCompleted(asset, amount, premium, profit);
        emit GasUsage(gasStart, gasleft());

        if (profit > 0) {
            accumulatedProfit[asset] += profit;
        }

        return true;
    }

    function _executeLeg(
        uint8 legIndex,
        SwapLeg memory leg,
        address tokenIn,
        uint256 amountIn,
        uint256 deadline
    ) internal returns (uint256 amountOut, address tokenOut) {
        if (leg.legType == LegType.V2) {
            (amountOut, tokenOut) = _executeV2(
                leg,
                tokenIn,
                amountIn,
                deadline
            );
        } else if (leg.legType == LegType.V3) {
            (amountOut, tokenOut) = _executeV3(
                leg,
                tokenIn,
                amountIn,
                deadline
            );
        } else if (leg.legType == LegType.CURVE) {
            (amountOut, tokenOut) = _executeCurve(leg, tokenIn, amountIn);
        } else {
            (amountOut, tokenOut) = _executeBalancer(
                leg,
                tokenIn,
                amountIn,
                deadline
            );
        }

        emit SwapExecuted(legIndex, leg.target, amountIn, amountOut);
    }

    function _executeV2(
        SwapLeg memory leg,
        address tokenIn,
        uint256 amountIn,
        uint256 deadline
    ) private returns (uint256 amountOut, address tokenOut) {
        address[] memory path = abi.decode(leg.data, (address[]));
        IERC20Minimal(tokenIn).safeApproveExact(leg.target, amountIn);
        uint256[] memory amounts = IRouterV2Like(leg.target)
            .swapExactTokensForTokens(
                amountIn,
                leg.minAmountOut,
                path,
                address(this),
                deadline
            );
        IERC20Minimal(tokenIn).safeApproveExact(leg.target, 0);
        amountOut = amounts[amounts.length - 1];
        tokenOut = path[path.length - 1];
    }

    function _executeV3(
        SwapLeg memory leg,
        address tokenIn,
        uint256 amountIn,
        uint256 deadline
    ) private returns (uint256 amountOut, address tokenOut) {
        bytes memory path = leg.data;
        tokenOut = V3PathLib.tokenOut(path);
        uint256 balBefore =
            IERC20Minimal(tokenOut).balanceOf(address(this));
        IERC20Minimal(tokenIn).safeApproveExact(leg.target, amountIn);
        ISwapRouter02(leg.target).exactInput(
            ISwapRouter02.ExactInputParams({
                path: path,
                recipient: address(this),
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: leg.minAmountOut
            })
        );
        IERC20Minimal(tokenIn).safeApproveExact(leg.target, 0);
        amountOut =
            IERC20Minimal(tokenOut).balanceOf(address(this)) -
            balBefore;
    }

    function _executeCurve(
        SwapLeg memory leg,
        address tokenIn,
        uint256 amountIn
    ) private returns (uint256 amountOut, address tokenOut) {
        (int128 i, int128 j, , address outToken) = abi.decode(
            leg.data,
            (int128, int128, address, address)
        );
        tokenOut = outToken;
        tokenIn;
        IERC20Minimal(tokenIn).safeApproveExact(leg.target, amountIn);
        amountOut = ICurvePool(leg.target).exchange(
            i,
            j,
            amountIn,
            leg.minAmountOut
        );
        IERC20Minimal(tokenIn).safeApproveExact(leg.target, 0);
    }

    function _executeBalancer(
        SwapLeg memory leg,
        address tokenIn,
        uint256 amountIn,
        uint256 deadline
    ) private returns (uint256 amountOut, address tokenOut) {
        (
            bytes32 poolId,
            uint256 assetInIndex,
            uint256 assetOutIndex,
            address[] memory assets
        ) = abi.decode(leg.data, (bytes32, uint256, uint256, address[]));

        tokenOut = assets[assetOutIndex];

        IBalancerVault.BatchSwapStep[]
            memory swaps = new IBalancerVault.BatchSwapStep[](1);
        swaps[0] = IBalancerVault.BatchSwapStep({
            poolId: poolId,
            assetInIndex: assetInIndex,
            assetOutIndex: assetOutIndex,
            amount: amountIn,
            userData: ""
        });

        int256[] memory limits = new int256[](assets.length);
        for (uint256 k = 0; k < assets.length; ) {
            limits[k] = type(int256).max;
            unchecked {
                ++k;
            }
        }
        limits[assetOutIndex] = int256(leg.minAmountOut);

        IERC20Minimal(tokenIn).safeApproveExact(balancerVault, amountIn);
        int256[] memory deltas = IBalancerVault(balancerVault).batchSwap(
            IBalancerVault.SwapKind.GIVEN_IN,
            swaps,
            assets,
            IBalancerVault.FundManagement({
                sender: address(this),
                fromInternalBalance: false,
                recipient: payable(address(this)),
                toInternalBalance: false
            }),
            limits,
            deadline
        );
        IERC20Minimal(tokenIn).safeApproveExact(balancerVault, 0);

        amountOut = uint256(-deltas[assetOutIndex]);
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

    function _checkPlan(ArbPlanV4 memory plan) internal view {
        uint256 n = plan.legs.length;
        if (n < 2) revert TooFewLegs();
        if (n > MAX_LEGS) revert TooManyLegs();
        if (plan.minProfit == 0) revert BadPlan();
        if (block.timestamp > plan.deadline) revert BadPlan();

        address prevOut = plan.loanToken;

        for (uint256 i = 0; i < n; ) {
            SwapLeg memory leg = plan.legs[i];
            if (leg.target == address(0)) revert BadPlan();
            if (leg.minAmountOut == 0) revert BadPlan();

            address legIn = _legTokenIn(leg);
            address legOut = _legTokenOut(leg);

            if (i == 0 && legIn != plan.loanToken) revert BadPlan();
            if (legIn != prevOut) revert BadPlan();
            if (!tokenWhitelist[legIn]) revert TokenNotAllowed(legIn);
            if (!tokenWhitelist[legOut]) revert TokenNotAllowed(legOut);

            _checkLegTarget(leg);
            prevOut = legOut;
            unchecked {
                ++i;
            }
        }

        if (prevOut != plan.loanToken) revert BadPlan();
    }

    function _checkLegTarget(SwapLeg memory leg) internal view {
        if (leg.legType == LegType.V2) {
            if (!routerV2Whitelist[leg.target]) {
                revert RouterNotAllowed(leg.target);
            }
            address[] memory path = abi.decode(leg.data, (address[]));
            _checkV2Path(path);
        } else if (leg.legType == LegType.V3) {
            if (!routerV3Whitelist[leg.target]) {
                revert RouterNotAllowed(leg.target);
            }
            V3PathLib.validatePath(leg.data, tokenWhitelist);
        } else if (leg.legType == LegType.CURVE) {
            if (!curvePoolWhitelist[leg.target]) {
                revert PoolNotAllowed(leg.target);
            }
        } else {
            if (leg.target != balancerVault) revert RouterNotAllowed(leg.target);
        }
    }

    function _legTokenIn(SwapLeg memory leg)
        internal
        pure
        returns (address token)
    {
        if (leg.legType == LegType.V2) {
            address[] memory path = abi.decode(leg.data, (address[]));
            if (path.length < 2) revert BadPlan();
            return path[0];
        }
        if (leg.legType == LegType.V3) {
            return V3PathLib.tokenIn(leg.data);
        }
        if (leg.legType == LegType.CURVE) {
            (, , address inToken, ) = abi.decode(
                leg.data,
                (int128, int128, address, address)
            );
            return inToken;
        }
        (
            ,
            uint256 assetInIndex,
            ,
            address[] memory assets
        ) = abi.decode(leg.data, (bytes32, uint256, uint256, address[]));
        return assets[assetInIndex];
    }

    function _legTokenOut(SwapLeg memory leg)
        internal
        pure
        returns (address token)
    {
        if (leg.legType == LegType.V2) {
            address[] memory path = abi.decode(leg.data, (address[]));
            if (path.length < 2) revert BadPlan();
            return path[path.length - 1];
        }
        if (leg.legType == LegType.V3) {
            return V3PathLib.tokenOut(leg.data);
        }
        if (leg.legType == LegType.CURVE) {
            (, , , address outToken) = abi.decode(
                leg.data,
                (int128, int128, address, address)
            );
            return outToken;
        }
        (
            ,
            ,
            uint256 assetOutIndex,
            address[] memory assets
        ) = abi.decode(leg.data, (bytes32, uint256, uint256, address[]));
        return assets[assetOutIndex];
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
        activeFlashSource = FlashSource.AAVE;
    }

    receive() external payable {
        revert NativeTransfersDisabled();
    }

    fallback() external payable {
        revert NativeTransfersDisabled();
    }
}
