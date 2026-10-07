// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {XorrDelegation} from "../src/XorrDelegation.sol";
import {XorrPriceGuard} from "../src/XorrPriceGuard.sol";
import {XorrVenueRegistry} from "../src/XorrVenueRegistry.sol";
import {XorrCouncil} from "../src/XorrCouncil.sol";
import {Artifacts} from "../script/lib/Artifacts.sol";
import {MockERC20, MockAggregator, MockVenue} from "./mocks/Mocks.sol";
import {MockIdentityRegistry, MockReputationRegistry} from "./mocks/MockERC8004.sol";

interface IUniswapV2Router02 {
    function factory() external view returns (address);
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256, uint256, uint256);
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);
}

/// @dev Shared fixture: XORR's contracts over real Uniswap v2 (published bytecode) and mock Chainlink feeds.
abstract contract XorrBase is Test {
    MockERC20 internal usdc;
    MockERC20 internal weth;
    MockERC20 internal cbtc;
    MockERC20 internal eurc;
    MockAggregator internal usdcFeed;
    MockAggregator internal ethFeed;
    MockAggregator internal btcFeed;
    MockAggregator internal eurcFeed;

    XorrPriceGuard internal guard;
    XorrVenueRegistry internal registry;
    XorrCouncil internal council;
    XorrDelegation internal del;
    MockIdentityRegistry internal identity;
    MockReputationRegistry internal reputation;
    IUniswapV2Router02 internal router;
    MockVenue internal mockVenue;

    address internal admin = makeAddr("admin");
    address internal owner = makeAddr("owner");
    address internal agent = makeAddr("agent");
    address internal recorder = makeAddr("recorder");
    address internal lp = makeAddr("lp");

    uint256 internal constant CEILING = 1_000e6;
    uint256 internal constant CAP = 100e6;
    uint16 internal constant SLIP = 200; // 2%

    function setUp() public virtual {
        vm.warp(1_760_000_000);
        usdc = new MockERC20("USDC", "USDC", 6);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        cbtc = new MockERC20("Circle BTC", "cirBTC", 8);
        eurc = new MockERC20("EURC", "EURC", 6);
        usdcFeed = new MockAggregator(8, 1e8);
        ethFeed = new MockAggregator(8, 2_500e8);
        btcFeed = new MockAggregator(8, 60_000e8);
        eurcFeed = new MockAggregator(8, 1.08e8);

        guard = new XorrPriceGuard(admin);
        vm.startPrank(admin);
        guard.listFeed(address(usdc), address(usdcFeed), 1 days + 1 hours);
        guard.listFeed(address(weth), address(ethFeed), 1 days + 1 hours);
        guard.listFeed(address(cbtc), address(btcFeed), 1 days + 1 hours);
        guard.listFeed(address(eurc), address(eurcFeed), 1 days + 1 hours);
        vm.stopPrank();

        (, address r) = Artifacts.deployUniswapV2(admin, address(weth));
        router = IUniswapV2Router02(r);
        mockVenue = new MockVenue();

        address[] memory venues = new address[](2);
        venues[0] = address(router);
        venues[1] = address(mockVenue);
        string[] memory labels = new string[](2);
        labels[0] = "Uniswap v2";
        labels[1] = "Mock venue";
        registry = new XorrVenueRegistry(admin, venues, labels);

        identity = new MockIdentityRegistry();
        reputation = new MockReputationRegistry(identity);
        council = new XorrCouncil(address(identity), address(reputation), address(guard), address(usdc), 1 hours, admin);
        del = new XorrDelegation(address(usdc), address(guard), address(registry), address(council), CEILING);
        vm.startPrank(admin);
        council.setDelegation(address(del));
        council.setRecorder(recorder, true);
        vm.stopPrank();

        _seed();
        usdc.mint(owner, 10_000e6);
        vm.startPrank(owner);
        usdc.approve(address(del), type(uint256).max);
        weth.approve(address(del), type(uint256).max);
        cbtc.approve(address(del), type(uint256).max);
        eurc.approve(address(del), type(uint256).max);
        vm.stopPrank();
    }

    /// @dev Pools at Chainlink's prices: 1M USDC deep each side.
    function _seed() internal {
        usdc.mint(lp, 3_000_000e6);
        weth.mint(lp, 400e18);
        cbtc.mint(lp, 1_667e7);
        eurc.mint(lp, 925_926e6);
        vm.startPrank(lp);
        usdc.approve(address(router), type(uint256).max);
        weth.approve(address(router), type(uint256).max);
        cbtc.approve(address(router), type(uint256).max);
        eurc.approve(address(router), type(uint256).max);
        router.addLiquidity(address(usdc), address(weth), 1_000_000e6, 400e18, 0, 0, lp, block.timestamp);
        router.addLiquidity(address(usdc), address(cbtc), 1_000_000e6, 1_666_666_667, 0, 0, lp, block.timestamp);
        router.addLiquidity(address(usdc), address(eurc), 1_000_000e6, 925_926e6, 0, 0, lp, block.timestamp);
        vm.stopPrank();
    }

    function _venues() internal view returns (address[] memory v) {
        v = new address[](1);
        v[0] = address(router);
    }

    function _grant() internal {
        vm.prank(owner);
        del.grant(agent, CAP, uint64(block.timestamp + 7 days), SLIP, _venues());
    }

    function _path(address a, address b) internal pure returns (address[] memory p) {
        p = new address[](2);
        p[0] = a;
        p[1] = b;
    }

    function _swapData(address tokenIn, address tokenOut, uint256 amountIn, address to)
        internal
        view
        returns (bytes memory)
    {
        return abi.encodeCall(
            IUniswapV2Router02.swapExactTokensForTokens, (amountIn, 1, _path(tokenIn, tokenOut), to, block.timestamp)
        );
    }

    function _buy(address tokenOut, uint256 amount) internal returns (uint256) {
        vm.prank(agent);
        return del.spend(owner, address(router), amount, tokenOut, 1, bytes32(0), _swapData(address(usdc), tokenOut, amount, owner));
    }

    /// @dev Keep every feed fresh after a warp.
    function _refreshFeeds() internal {
        usdcFeed.set(usdcFeed.answer(), block.timestamp);
        ethFeed.set(ethFeed.answer(), block.timestamp);
        btcFeed.set(btcFeed.answer(), block.timestamp);
        eurcFeed.set(eurcFeed.answer(), block.timestamp);
    }
}
