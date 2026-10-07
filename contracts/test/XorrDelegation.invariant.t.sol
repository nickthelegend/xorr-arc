// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {XorrBase, IUniswapV2Router02} from "./XorrBase.t.sol";
import {XorrDelegation} from "../src/XorrDelegation.sol";
import {XorrPriceGuard} from "../src/XorrPriceGuard.sol";
import {MockERC20, MockAggregator} from "./mocks/Mocks.sol";

/**
 * @dev Drives the delegation with random grants, spends, closes, revokes, guardian stops, price moves and time jumps
 *      across two owners and three agents, and keeps a ghost ledger of what SHOULD have happened.
 */
contract DelegationHandler is Test {
    XorrDelegation internal del;
    XorrPriceGuard internal guard;
    IUniswapV2Router02 internal router;
    MockERC20 internal usdc;
    MockERC20 internal weth;
    MockAggregator internal ethFeed;
    MockAggregator internal usdcFeed;

    address[2] public owners;
    address[3] public agents;
    address public guardian = address(0x6A12D);

    mapping(address => uint256) public ghostUsdcSpent;
    mapping(address => uint256) public ghostUsdcFromCloses;
    mapping(address => mapping(address => mapping(uint256 => uint256))) public ghostSpentOnDay;
    uint256 public violations; // anything that should never have succeeded
    uint256 public spends;
    uint256 public closes;
    uint256 public refusals;

    constructor(
        XorrDelegation d,
        XorrPriceGuard g,
        IUniswapV2Router02 r,
        MockERC20 u,
        MockERC20 w,
        MockAggregator ef,
        MockAggregator uf,
        address[2] memory o,
        address[3] memory a
    ) {
        del = d;
        guard = g;
        router = r;
        usdc = u;
        weth = w;
        ethFeed = ef;
        usdcFeed = uf;
        owners = o;
        agents = a;
        for (uint256 i = 0; i < 2; i++) {
            vm.prank(o[i]);
            d.setGuardian(guardian, true);
        }
    }

    function _now() internal view returns (uint256) {
        return vm.getBlockTimestamp();
    }

    function _path(address a, address b) internal pure returns (address[] memory p) {
        p = new address[](2);
        p[0] = a;
        p[1] = b;
    }

    function grant(uint8 o, uint8 a, uint256 cap, uint32 ttl, uint16 slip) external {
        address owner = owners[o % 2];
        address agent = agents[a % 3];
        cap = bound(cap, 1e6, 1_000e6);
        ttl = uint32(bound(ttl, 1 hours, 30 days));
        slip = uint16(bound(slip, 50, 1_000));
        address[] memory v = new address[](1);
        v[0] = address(router);
        vm.prank(owner);
        del.grant(agent, cap, uint64(_now() + ttl), slip, v);
    }

    function spend(uint8 o, uint8 a, uint256 amount) external {
        address owner = owners[o % 2];
        address agent = agents[a % 3];
        amount = bound(amount, 1, 600e6);
        uint256 day = _now() / 1 days;
        (uint256 cap, uint64 exp, uint16 slip, bool revoked, bool stopped) = del.agentPolicyOf(owner, agent);
        uint256 spentBefore = del.spentOnDay(owner, agent, day);
        bool allowed = cap > 0 && !revoked && !stopped && _now() < exp && spentBefore + amount <= cap
            && del.isVenueAllowed(owner, address(router));
        uint256 fair;
        try guard.quote(address(usdc), address(weth), amount) returns (uint256 q) {
            fair = q;
        } catch {
            allowed = false;
        }
        uint256 usdcBefore = usdc.balanceOf(owner);
        bytes memory data = abi.encodeCall(
            IUniswapV2Router02.swapExactTokensForTokens, (amount, 1, _path(address(usdc), address(weth)), owner, _now())
        );
        vm.prank(agent);
        try del.spend(owner, address(router), amount, address(weth), 1, bytes32(0), data) returns (uint256 got) {
            spends++;
            if (!allowed) violations++;
            if (got < fair * (10_000 - slip) / 10_000) violations++;
            if (usdcBefore - usdc.balanceOf(owner) != amount) violations++;
            ghostUsdcSpent[owner] += amount;
            ghostSpentOnDay[owner][agent][day] += amount;
            if (del.spentOnDay(owner, agent, day) > cap) violations++;
        } catch {
            refusals++;
        }
    }

    function close(uint8 o, uint8 a, uint256 amount) external {
        address owner = owners[o % 2];
        address agent = agents[a % 3];
        uint256 held = weth.balanceOf(owner);
        if (held == 0) return;
        amount = bound(amount, 1, held);
        (uint256 cap, uint64 exp,, bool revoked, bool stopped) = del.agentPolicyOf(owner, agent);
        bool allowed = cap > 0 && !revoked && !stopped && _now() < exp;
        uint256 usdcBefore = usdc.balanceOf(owner);
        bytes memory data = abi.encodeCall(
            IUniswapV2Router02.swapExactTokensForTokens, (amount, 1, _path(address(weth), address(usdc)), owner, _now())
        );
        vm.prank(agent);
        try del.closePosition(owner, address(weth), address(router), amount, 1, bytes32(0), data) returns (uint256 got) {
            closes++;
            if (!allowed) violations++;
            if (usdc.balanceOf(owner) - usdcBefore != got) violations++;
            ghostUsdcFromCloses[owner] += got;
        } catch {
            refusals++;
        }
    }

    function revokeAll(uint8 o) external {
        vm.prank(owners[o % 2]);
        del.revoke();
    }

    function revokeOne(uint8 o, uint8 a) external {
        vm.prank(owners[o % 2]);
        del.revokeAgent(agents[a % 3]);
    }

    function guardianStop(uint8 o) external {
        vm.prank(guardian);
        del.guardianStop(owners[o % 2]);
    }

    function strangerSpend(uint8 o, uint256 amount) external {
        amount = bound(amount, 1, 100e6);
        vm.prank(address(0xBAD));
        try del.spend(owners[o % 2], address(router), amount, address(weth), 1, bytes32(0), "") {
            violations++;
        } catch {}
    }

    function movePrice(int16 bps) external {
        int256 p = ethFeed.answer();
        int256 next = p + p * int256(bound(bps, -500, 500)) / 10_000;
        if (next < 100e8) next = 100e8;
        ethFeed.set(next, _now());
        usdcFeed.set(1e8, _now());
    }

    function warp(uint32 secs) external {
        secs = uint32(bound(secs, 1, 2 days));
        vm.warp(_now() + secs);
        // Feeds keep posting on a heartbeat; most of the time they are fresh.
        if (secs % 5 != 0) {
            ethFeed.set(ethFeed.answer(), _now());
            usdcFeed.set(1e8, _now());
        }
    }
}

contract XorrDelegationInvariantTest is XorrBase {
    DelegationHandler internal handler;
    address[2] internal owners;
    address[3] internal agents;
    mapping(address => uint256) internal startUsdc;

    function setUp() public override {
        super.setUp();
        owners = [makeAddr("ownerA"), makeAddr("ownerB")];
        agents = [makeAddr("agentA"), makeAddr("agentB"), makeAddr("agentC")];
        for (uint256 i = 0; i < 2; i++) {
            usdc.mint(owners[i], 1_000_000e6);
            startUsdc[owners[i]] = 1_000_000e6;
            vm.startPrank(owners[i]);
            usdc.approve(address(del), type(uint256).max);
            weth.approve(address(del), type(uint256).max);
            vm.stopPrank();
        }
        handler = new DelegationHandler(del, guard, router, usdc, weth, ethFeed, usdcFeed, owners, agents);
        targetContract(address(handler));
    }

    function invariant_nothingThatShouldFailEverSucceeded() public view {
        assertEq(handler.violations(), 0);
    }

    function invariant_delegationHoldsNothing() public view {
        assertEq(usdc.balanceOf(address(del)), 0);
        assertEq(weth.balanceOf(address(del)), 0);
    }

    function invariant_noStandingApproval() public view {
        assertEq(usdc.allowance(address(del), address(router)), 0);
        assertEq(weth.allowance(address(del), address(router)), 0);
    }

    function invariant_ownerUsdcMatchesTheLedger() public view {
        for (uint256 i = 0; i < 2; i++) {
            address o = owners[i];
            assertEq(
                usdc.balanceOf(o),
                startUsdc[o] - handler.ghostUsdcSpent(o) + handler.ghostUsdcFromCloses(o),
                "owner USDC moved only by trades the ledger saw"
            );
        }
    }

    function invariant_todayNeverOverCapAtSpendTime() public view {
        uint256 day = vm.getBlockTimestamp() / 1 days;
        for (uint256 i = 0; i < 2; i++) {
            for (uint256 j = 0; j < 3; j++) {
                assertEq(del.spentOnDay(owners[i], agents[j], day), handler.ghostSpentOnDay(owners[i], agents[j], day));
            }
        }
    }

    function invariant_stoppedMeansNothingLeft() public view {
        for (uint256 i = 0; i < 2; i++) {
            if (!del.isStopped(owners[i])) continue;
            for (uint256 j = 0; j < 3; j++) {
                assertEq(del.remainingTodayFor(owners[i], agents[j]), 0);
            }
        }
    }

    /// @dev The handler really trades, not only refuses: a scripted pass through it.
    function test_handlerTradesForReal() public {
        handler.grant(0, 0, 500e6, 7 days, 300);
        handler.spend(0, 0, 50e6);
        handler.spend(0, 0, 60e6);
        handler.close(0, 0, type(uint256).max);
        handler.spend(0, 1, 10e6); // agentB has no grant: refused
        handler.guardianStop(0);
        handler.spend(0, 0, 10e6); // stopped: refused
        assertEq(handler.spends(), 2);
        assertEq(handler.closes(), 1);
        assertEq(handler.refusals(), 2);
        assertEq(handler.violations(), 0);
    }
}
