// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {XorrBase} from "./XorrBase.t.sol";
import {XorrCouncil} from "../src/XorrCouncil.sol";
import {XorrDelegation} from "../src/XorrDelegation.sol";

contract XorrCouncilTest is XorrBase {
    address internal operator = makeAddr("operator");
    uint256[5] internal ids;

    function setUp() public override {
        super.setUp();
        // The operator registers five ERC-8004 agents, one per seat; the council sits them.
        vm.startPrank(operator);
        for (uint256 i = 0; i < 5; i++) ids[i] = identity.register("data:application/json,{}");
        vm.stopPrank();
        vm.startPrank(admin);
        for (uint8 i = 0; i < 5; i++) council.setSeat(i, ids[i]);
        vm.stopPrank();
        _grant();
    }

    function _votes(uint8 a, uint8 b, uint8 c, uint8 d, uint8 e) internal pure returns (uint8[] memory v) {
        v = new uint8[](5);
        (v[0], v[1], v[2], v[3], v[4]) = (a, b, c, d, e);
    }

    function _recordBuy(bytes32 id) internal {
        vm.prank(recorder);
        council.recordDecision(id, owner, address(weth), true, true, _votes(1, 1, 2, 0, 3));
    }

    function test_fill_thenSettle_writesSignedReputationPerSeat() public {
        bytes32 id = keccak256("round-1");
        _recordBuy(id);
        vm.prank(agent);
        del.spend(owner, address(router), 100e6, address(weth), 1, id, _swapData(address(usdc), address(weth), 100e6, owner));
        XorrCouncil.Decision memory d = council.decisionOf(id);
        assertEq(uint8(d.status), uint8(XorrCouncil.Status.Filled));
        assertEq(d.amountIn, 100e6);

        vm.expectRevert();
        council.settle(id); // before the horizon

        vm.warp(block.timestamp + 1 hours);
        ethFeed.set(2_750e8, vm.getBlockTimestamp()); // ETH +10%
        usdcFeed.set(1e8, vm.getBlockTimestamp());
        int256 edge = council.settle(id);
        // bought ~0.0398 WETH for $100 (pool fee + impact), now worth ~$109.4
        assertGt(edge, 900);
        assertLt(edge, 1_000);

        // yes seats (0,1) get +edge, no (2) and veto (4) get −edge, abstain (3) nothing
        assertEq(reputation.getLastIndex(ids[0], address(council)), 1);
        assertEq(reputation.getLastIndex(ids[3], address(council)), 0);
        (int128 v0, uint8 dec,,,) = reputation.readFeedback(ids[0], address(council), 1);
        (int128 v2,,,,) = reputation.readFeedback(ids[2], address(council), 1);
        (int128 v4,,,,) = reputation.readFeedback(ids[4], address(council), 1);
        assertEq(v0, int128(edge));
        assertEq(v2, -int128(edge));
        assertEq(v4, -int128(edge));
        assertEq(dec, 2);
        assertEq(reputation.hashOf(ids[0], address(council), 1), id);
        assertEq(council.seatAverageEdge(0), edge);

        vm.expectRevert();
        council.settle(id); // only once
    }

    function test_unfilledDecision_settlesOnTheOracleMove() public {
        bytes32 id = keccak256("rejected");
        vm.prank(recorder);
        council.recordDecision(id, owner, address(cbtc), true, false, _votes(2, 2, 1, 0, 0));
        vm.warp(block.timestamp + 1 hours);
        btcFeed.set(57_000e8, vm.getBlockTimestamp()); // BTC −5%: the no votes were right
        int256 edge = council.settle(id);
        assertEq(edge, -500);
        (int128 v0,,,,) = reputation.readFeedback(ids[0], address(council), 1);
        (int128 v2,,,,) = reputation.readFeedback(ids[2], address(council), 1);
        assertEq(v0, 500);
        assertEq(v2, -500);
    }

    function test_sale_edge() public {
        uint256 got = _buy(address(weth), 100e6);
        bytes32 id = keccak256("sell");
        vm.prank(recorder);
        council.recordDecision(id, owner, address(weth), false, true, _votes(1, 1, 1, 1, 1));
        vm.prank(agent);
        del.closePosition(owner, address(weth), address(router), got, 1, id, _swapData(address(weth), address(usdc), got, owner));
        vm.warp(block.timestamp + 1 hours);
        ethFeed.set(2_000e8, vm.getBlockTimestamp()); // sold before a −20% move
        usdcFeed.set(1e8, vm.getBlockTimestamp());
        assertGt(council.settle(id), 2_000);
    }

    function test_onlyRecorderAndOnlyDelegation() public {
        vm.expectRevert(abi.encodeWithSelector(XorrCouncil.NotRecorder.selector, address(this)));
        council.recordDecision(keccak256("x"), owner, address(weth), true, true, _votes(1, 1, 1, 1, 1));
        vm.expectRevert(abi.encodeWithSelector(XorrCouncil.NotDelegation.selector, address(this)));
        council.onFill(keccak256("x"), owner, agent, address(usdc), address(weth), 1, 1);
    }

    function test_fillMustMatchTheRecordedDecision() public {
        bytes32 id = keccak256("mismatch");
        _recordBuy(id); // WETH buy
        vm.expectEmit(true, false, false, false, address(del));
        emit XorrDelegation.FillHookFailed(id, "");
        vm.prank(agent);
        // fills cirBTC under the WETH decision: the council refuses the fill, the trade itself is unaffected
        del.spend(owner, address(router), 10e6, address(cbtc), 1, id, _swapData(address(usdc), address(cbtc), 10e6, owner));
        assertEq(uint8(council.decisionOf(id).status), uint8(XorrCouncil.Status.Recorded));
    }

    function test_seatTheCouncilControlsIsRefused() public {
        vm.prank(address(council));
        uint256 own = identity.register("x");
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(XorrCouncil.SelfControlledSeat.selector, own));
        council.setSeat(0, own);
    }

    function test_brokenRegistryNeverBlocksSettlement() public {
        bytes32 id = keccak256("broken");
        _recordBuy(id);
        reputation.setBroken(true);
        vm.warp(block.timestamp + 1 hours);
        _refreshFeeds();
        council.settle(id);
        assertEq(uint8(council.decisionOf(id).status), uint8(XorrCouncil.Status.Settled));
        assertEq(council.seatScored(0), 1);
    }

    function test_votesRoundTrip() public {
        bytes32 id = keccak256("votes");
        _recordBuy(id);
        uint8[] memory v = council.votesOf(id);
        assertEq(v.length, 5);
        assertEq(v[2], 2);
        assertEq(v[4], 3);
    }
}
