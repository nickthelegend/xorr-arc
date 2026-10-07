// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {XorrDelegation} from "../../src/XorrDelegation.sol";
import {XorrPriceGuard} from "../../src/XorrPriceGuard.sol";
import {XorrVenueRegistry} from "../../src/XorrVenueRegistry.sol";
import {XorrCouncil} from "../../src/XorrCouncil.sol";
import {IReputationRegistry8004} from "../../src/interfaces/IReputationRegistry8004.sol";
import {IIdentityRegistry8004} from "../../src/interfaces/IIdentityRegistry8004.sol";

interface IERC20F {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/**
 * XORR against the REAL Arc mainnet: Circle's USDC/EURC/WETH/cirBTC, Chainlink's Arc feeds, Uniswap v3's SwapRouter02 and
 * pools, and the ERC-8004 registries. Opt-in, so `forge test` stays offline:
 *
 *   ARC_FORK_TESTS=1 ARC_FORK_RPC=http://127.0.0.1:9110 <arc-foundry>/forge test --match-path 'test/fork/*' --network arc
 *
 * (ARC_FORK_RPC defaults to https://rpc.mainnet.arc.io; pointing it at scripts/arc-fork.sh's local fork avoids the public
 * RPC's rate limit.) Arc Foundry's `--network arc` runs Arc's native-USDC precompile, so `vm.deal` gives USDC.
 */
contract ArcMainnetForkTest is Test {
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant EURC = 0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1;
    address constant WETH = 0x128cC466B61f542da60c70e3aA11c10e19B84EDB;
    address constant CBTC = 0x171A4217b86A807A64eB94757Db6849fb4bDbAA0;
    address constant ROUTER = 0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77;
    address constant IDENTITY = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address constant REPUTATION = 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63;

    XorrPriceGuard guard;
    XorrVenueRegistry registry;
    XorrCouncil council;
    XorrDelegation del;
    address admin = makeAddr("admin");
    address owner = makeAddr("fork-owner");
    address agent = makeAddr("fork-agent");
    uint256[5] seats;

    function setUp() public {
        if (!vm.envOr("ARC_FORK_TESTS", false)) vm.skip(true);
        string memory rpc = vm.envOr("ARC_FORK_RPC", string("https://rpc.mainnet.arc.io"));
        uint256 blockNumber = vm.envOr("ARC_FORK_BLOCK", uint256(0));
        if (blockNumber == 0) vm.createSelectFork(rpc);
        else vm.createSelectFork(rpc, blockNumber); // pinned: forge caches the state, reruns are fast
        assertEq(block.chainid, 5042, "not Arc mainnet");

        vm.startPrank(admin);
        guard = new XorrPriceGuard(admin);
        guard.listFeed(USDC, 0x84EA90AC252Dc437031461836DB5164219147905, 25 hours);
        guard.listFeed(EURC, 0x361b95c10b76Ca3f35C686d423e43A951755Bf23, 25 hours);
        guard.listFeed(WETH, 0x50FCDD99D6762D1C170DC6A9111db944AEE6D364, 25 hours);
        guard.listFeed(CBTC, 0xa109B535C70C8Be9995be64Bb6751AcDB27e03De, 25 hours);
        address[] memory v = new address[](1);
        v[0] = ROUTER;
        string[] memory l = new string[](1);
        l[0] = "Uniswap v3 SwapRouter02";
        registry = new XorrVenueRegistry(admin, v, l);
        council = new XorrCouncil(IDENTITY, REPUTATION, address(guard), USDC, 1 hours, admin);
        del = new XorrDelegation(USDC, address(guard), address(registry), address(council), 250e6);
        council.setDelegation(address(del));
        council.setRecorder(admin, true);
        for (uint8 i = 0; i < 5; i++) {
            seats[i] = IIdentityRegistry8004(IDENTITY).register("data:application/json,{\"name\":\"XORR seat\"}");
            council.setSeat(i, seats[i]);
        }
        vm.stopPrank();

        vm.deal(owner, 1_000e18); // 1,000 USDC: Arc's native balance IS the ERC-20 balance
        vm.startPrank(owner);
        IERC20F(USDC).approve(address(del), type(uint256).max);
        IERC20F(WETH).approve(address(del), type(uint256).max);
        IERC20F(CBTC).approve(address(del), type(uint256).max);
        IERC20F(EURC).approve(address(del), type(uint256).max);
        del.grant(agent, 100e6, uint64(block.timestamp + 7 days), 100, v); // $100/day, 1% slippage
        vm.stopPrank();
    }

    function _data(address tin, address tout, uint24 fee, uint256 amount) internal view returns (bytes memory) {
        return abi.encodeCall(
            ISwapRouter02.exactInputSingle, (ISwapRouter02.ExactInputSingleParams(tin, tout, fee, owner, amount, 1, 0))
        );
    }

    function test_realFeedsAreFreshAndSane() public view {
        (uint256 btc,) = guard.priceOf(CBTC);
        (uint256 eth,) = guard.priceOf(WETH);
        (uint256 eurc,) = guard.priceOf(EURC);
        (uint256 usdc,) = guard.priceOf(USDC);
        assertGt(btc, 10_000e18);
        assertGt(eth, 500e18);
        assertApproxEqRel(eurc, 1.1e18, 0.15e18);
        assertApproxEqRel(usdc, 1e18, 0.01e18);
    }

    function test_buyCirBtcOnUniswapV3_insideThePermission() public {
        uint256 before = IERC20F(CBTC).balanceOf(owner);
        bytes32 id = keccak256("fork-btc");
        uint8[] memory votes = new uint8[](5);
        (votes[0], votes[1], votes[2], votes[3], votes[4]) = (1, 1, 1, 0, 1);
        vm.prank(admin);
        council.recordDecision(id, owner, CBTC, true, true, votes);
        vm.prank(agent);
        uint256 got = del.spend(owner, ROUTER, 20e6, CBTC, 1, id, _data(USDC, CBTC, 100, 20e6));
        assertEq(IERC20F(CBTC).balanceOf(owner) - before, got);
        assertGe(got, guard.quote(USDC, CBTC, 20e6) * 99 / 100, "within 1% of Chainlink");
        assertEq(uint8(council.decisionOf(id).status), uint8(XorrCouncil.Status.Filled));

        // An hour later anyone settles it against Chainlink, and the real ERC-8004 Reputation Registry records it.
        vm.warp(block.timestamp + 1 hours);
        council.settle(id);
        assertEq(IReputationRegistry8004(REPUTATION).getLastIndex(seats[0], address(council)), 1);
        assertEq(IReputationRegistry8004(REPUTATION).getLastIndex(seats[3], address(council)), 0, "abstained");
    }

    function test_fxRoundTrip_usdcEurcUsdc() public {
        vm.prank(agent);
        uint256 eur = del.spend(owner, ROUTER, 30e6, EURC, 1, 0, _data(USDC, EURC, 500, 30e6));
        assertGt(eur, 25e6);
        vm.prank(agent);
        uint256 back = del.closePosition(owner, EURC, ROUTER, eur, 1, 0, _data(EURC, USDC, 500, eur));
        assertGt(back, 29.8e6);
    }

    function test_wethThinPool_smallTradeOk_bigTradeRefusedByChainlinkFloor() public {
        vm.prank(agent);
        del.spend(owner, ROUTER, 5e6, WETH, 1, 0, _data(USDC, WETH, 3000, 5e6));
        // $95 into a ~$2.4k pool moves the price well past 1%: the Chainlink floor refuses it.
        vm.prank(agent);
        vm.expectRevert();
        del.spend(owner, ROUTER, 95e6, WETH, 1, 0, _data(USDC, WETH, 3000, 95e6));
    }

    function test_capAndRevokeOnRealMainnetState() public {
        vm.prank(agent);
        del.spend(owner, ROUTER, 60e6, CBTC, 1, 0, _data(USDC, CBTC, 100, 60e6));
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(XorrDelegation.DailyCapExceeded.selector, 60e6, 40e6));
        del.spend(owner, ROUTER, 60e6, CBTC, 1, 0, _data(USDC, CBTC, 100, 60e6));
        vm.prank(owner);
        del.revoke();
        vm.prank(agent);
        vm.expectRevert(XorrDelegation.PolicyRevoked.selector);
        del.spend(owner, ROUTER, 1e6, CBTC, 1, 0, _data(USDC, CBTC, 100, 1e6));
    }
}
