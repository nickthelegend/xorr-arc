// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {XorrBase} from "./XorrBase.t.sol";
import {XorrDelegation} from "../src/XorrDelegation.sol";
import {XorrPriceGuard} from "../src/XorrPriceGuard.sol";
import {MockERC20, PickyVenue, SilentVenue} from "./mocks/Mocks.sol";

contract XorrDelegationTest is XorrBase {
    // ─── Granting ────────────────────────────────────────────────────────────

    function test_grant_setsPolicyAndVenues() public {
        _grant();
        (address a, uint256 cap, uint64 exp, uint16 slip, bool revoked) = del.policyOf(owner);
        assertEq(a, agent);
        assertEq(cap, CAP);
        assertEq(exp, block.timestamp + 7 days);
        assertEq(slip, SLIP);
        assertFalse(revoked);
        assertTrue(del.isVenueAllowed(owner, address(router)));
        assertEq(del.venuesOf(owner).length, 1);
        assertEq(del.remainingToday(owner), CAP);
    }

    function test_grant_rejectsBadInputs() public {
        uint64 exp = uint64(block.timestamp + 1 days);
        address[] memory v = _venues();
        vm.startPrank(owner);
        vm.expectRevert(XorrDelegation.BadGrant.selector);
        del.grant(address(0), CAP, exp, SLIP, v);
        vm.expectRevert(XorrDelegation.BadGrant.selector);
        del.grant(owner, CAP, exp, SLIP, v); // an owner cannot be their own agent
        vm.expectRevert(XorrDelegation.BadGrant.selector);
        del.grant(agent, 0, exp, SLIP, v);
        vm.expectRevert(XorrDelegation.BadGrant.selector);
        del.grant(agent, CEILING + 1, exp, SLIP, v); // over the deployment's ceiling
        vm.expectRevert(XorrDelegation.BadGrant.selector);
        del.grant(agent, CAP, uint64(block.timestamp), SLIP, v);
        vm.expectRevert(XorrDelegation.BadGrant.selector);
        del.grant(agent, CAP, exp, 0, v);
        vm.expectRevert(XorrDelegation.BadGrant.selector);
        del.grant(agent, CAP, exp, 1_001, v);
        vm.stopPrank();
    }

    function test_grant_refusesVenueOutsideRegistry() public {
        address[] memory v = new address[](1);
        v[0] = address(usdc); // a token is never a venue
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(XorrDelegation.VenueNotAllowed.selector, address(usdc)));
        del.grant(agent, CAP, uint64(block.timestamp + 1 days), SLIP, v);
    }

    function test_regrant_replacesVenueList() public {
        address[] memory two = new address[](2);
        two[0] = address(router);
        two[1] = address(mockVenue);
        vm.prank(owner);
        del.grant(agent, CAP, uint64(block.timestamp + 1 days), SLIP, two);
        assertTrue(del.isVenueAllowed(owner, address(mockVenue)));
        _grant(); // router only
        assertFalse(del.isVenueAllowed(owner, address(mockVenue)));
        assertEq(del.venuesOf(owner).length, 1);
    }

    // ─── Spending ────────────────────────────────────────────────────────────

    function test_spend_buysWethThroughUniswapAndPaysOwner() public {
        _grant();
        uint256 got = _buy(address(weth), 50e6);
        assertGt(got, 0.0199e18);
        assertEq(weth.balanceOf(owner), got);
        assertEq(usdc.balanceOf(owner), 10_000e6 - 50e6);
        assertEq(del.spentTodayBy(owner, agent), 50e6);
        assertEq(del.remainingToday(owner), 50e6);
        // nothing left behind: no balance, no approval
        assertEq(usdc.balanceOf(address(del)), 0);
        assertEq(usdc.allowance(address(del), address(router)), 0);
    }

    function test_spend_emitsDecisionId() public {
        _grant();
        bytes32 id = keccak256("decision-1");
        vm.expectEmit(true, true, true, false, address(del));
        emit XorrDelegation.Spent(owner, agent, address(router), address(weth), 10e6, 0, 10e6, id);
        vm.prank(agent);
        del.spend(owner, address(router), 10e6, address(weth), 1, id, _swapData(address(usdc), address(weth), 10e6, owner));
    }

    function test_spend_overCapReverts() public {
        _grant();
        _buy(address(weth), 60e6);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(XorrDelegation.DailyCapExceeded.selector, 60e6, 40e6));
        del.spend(owner, address(router), 60e6, address(weth), 1, 0, _swapData(address(usdc), address(weth), 60e6, owner));
    }

    function test_spend_capResetsAtUtcMidnight() public {
        _grant();
        _buy(address(weth), 100e6);
        assertEq(del.remainingToday(owner), 0);
        vm.warp((block.timestamp / 1 days + 1) * 1 days);
        _refreshFeeds();
        assertEq(del.remainingToday(owner), CAP);
        _buy(address(weth), 100e6);
    }

    function test_spend_onlyAgent() public {
        _grant();
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(XorrDelegation.NotDelegate.selector);
        del.spend(owner, address(router), 1e6, address(weth), 1, 0, "");
    }

    function test_spend_afterExpiryReverts() public {
        _grant();
        vm.warp(block.timestamp + 7 days);
        _refreshFeeds();
        vm.prank(agent);
        vm.expectRevert(XorrDelegation.PolicyExpired.selector);
        del.spend(owner, address(router), 1e6, address(weth), 1, 0, _swapData(address(usdc), address(weth), 1e6, owner));
        assertEq(del.remainingToday(owner), 0);
    }

    function test_revoke_stopsEveryAgentUntilRegrant() public {
        _grant();
        address agent2 = makeAddr("agent2");
        vm.prank(owner);
        del.grantAgent(agent2, CAP, uint64(block.timestamp + 1 days), SLIP);
        vm.prank(owner);
        del.revoke();
        assertTrue(del.isStopped(owner));
        vm.prank(agent);
        vm.expectRevert(XorrDelegation.PolicyRevoked.selector);
        del.spend(owner, address(router), 1e6, address(weth), 1, 0, _swapData(address(usdc), address(weth), 1e6, owner));
        vm.prank(agent2);
        vm.expectRevert(XorrDelegation.PolicyRevoked.selector);
        del.spend(owner, address(router), 1e6, address(weth), 1, 0, _swapData(address(usdc), address(weth), 1e6, owner));
        _grant();
        assertFalse(del.isStopped(owner));
        _buy(address(weth), 1e6);
    }

    function test_revokeAgent_onlyThatAgent() public {
        _grant();
        address agent2 = makeAddr("agent2");
        vm.prank(owner);
        del.grantAgent(agent2, CAP, uint64(block.timestamp + 1 days), SLIP);
        vm.prank(owner);
        del.revokeAgent(agent);
        vm.prank(agent);
        vm.expectRevert(XorrDelegation.PolicyRevoked.selector);
        del.spend(owner, address(router), 1e6, address(weth), 1, 0, _swapData(address(usdc), address(weth), 1e6, owner));
        vm.prank(agent2);
        del.spend(owner, address(router), 1e6, address(weth), 1, 0, _swapData(address(usdc), address(weth), 1e6, owner));
        assertEq(del.agentsOf(owner).length, 2);
    }

    function test_agents_haveSeparateTallies() public {
        _grant();
        address agent2 = makeAddr("agent2");
        vm.prank(owner);
        del.grantAgent(agent2, 30e6, uint64(block.timestamp + 1 days), SLIP);
        _buy(address(weth), 90e6);
        vm.prank(agent2);
        del.spend(owner, address(router), 30e6, address(weth), 1, 0, _swapData(address(usdc), address(weth), 30e6, owner));
        assertEq(del.spentTodayBy(owner, agent), 90e6);
        assertEq(del.spentTodayBy(owner, agent2), 30e6);
    }

    function test_venue_notAllowedByOwner() public {
        _grant();
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(XorrDelegation.VenueNotAllowed.selector, address(mockVenue)));
        del.spend(owner, address(mockVenue), 1e6, address(weth), 1, 0, "");
    }

    function test_venue_removedFromRegistryStopsAtOnce() public {
        _grant();
        vm.prank(admin);
        registry.removeVenue(address(router));
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(XorrDelegation.VenueNotAllowed.selector, address(router)));
        del.spend(owner, address(router), 1e6, address(weth), 1, 0, _swapData(address(usdc), address(weth), 1e6, owner));
    }

    function test_spend_outputToSomeoneElseReverts() public {
        _grant();
        address thief = makeAddr("thief");
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(XorrDelegation.OutputNotReceived.selector, 0, 1));
        del.spend(owner, address(router), 10e6, address(weth), 1, 0, _swapData(address(usdc), address(weth), 10e6, thief));
        assertEq(weth.balanceOf(thief), 0);
        assertEq(usdc.balanceOf(owner), 10_000e6);
        assertEq(del.spentTodayBy(owner, agent), 0, "a reverted trade leaves the tally untouched");
    }

    function test_spend_refusesSettlementAsOutput() public {
        _grant();
        vm.prank(agent);
        vm.expectRevert(XorrDelegation.InvalidToken.selector);
        del.spend(owner, address(router), 1e6, address(usdc), 1, 0, "");
    }

    function test_spend_zeroAmountAndZeroMinOut() public {
        _grant();
        vm.startPrank(agent);
        vm.expectRevert(XorrDelegation.ZeroAmount.selector);
        del.spend(owner, address(router), 0, address(weth), 1, 0, "");
        vm.expectRevert(XorrDelegation.ZeroMinOut.selector);
        del.spend(owner, address(router), 1e6, address(weth), 0, 0, "");
        vm.stopPrank();
    }

    // ─── The Chainlink floor ─────────────────────────────────────────────────

    function test_oracleFloor_refusesAFillFarBelowChainlink() public {
        _grant();
        // Chainlink says ETH is $2,000; the pool still sells at $2,500, so $50 buys 20% less ETH than Chainlink's value.
        ethFeed.set(2_000e8, block.timestamp);
        vm.prank(agent);
        vm.expectRevert(); // BelowOracleFloor(received, floor)
        del.spend(owner, address(router), 50e6, address(weth), 1, 0, _swapData(address(usdc), address(weth), 50e6, owner));
    }

    function test_oracleFloor_exactBoundary() public {
        vm.prank(owner);
        address[] memory v = new address[](1);
        v[0] = address(mockVenue);
        del.grant(agent, CAP, uint64(block.timestamp + 1 days), 100, v); // 1%
        // Fair: 10 USDC → 0.004 WETH. Floor at 1% slippage = 0.00396 WETH.
        uint256 fair = guard.quote(address(usdc), address(weth), 10e6);
        assertEq(fair, 0.004e18);
        // Pay exactly 99% of fair: passes.
        mockVenue.setRate(0.00396e18, 10e6);
        bytes memory data = abi.encodeCall(mockVenue.swap, (address(usdc), address(weth), 10e6, owner));
        vm.prank(agent);
        del.spend(owner, address(mockVenue), 10e6, address(weth), 1, 0, data);
        // Pay one wei less: refused.
        mockVenue.setRate(0.00396e18 - 1, 10e6);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(XorrDelegation.BelowOracleFloor.selector, 0.00396e18 - 1, 0.00396e18));
        del.spend(owner, address(mockVenue), 10e6, address(weth), 1, 0, data);
    }

    function test_oracleFloor_staleFeedRefusesBeforeAnythingMoves() public {
        _grant();
        vm.warp(block.timestamp + 1 days + 1 hours + 1);
        usdcFeed.set(1e8, block.timestamp); // USDC fresh, ETH stale
        vm.prank(agent);
        vm.expectRevert();
        del.spend(owner, address(router), 1e6, address(weth), 1, 0, _swapData(address(usdc), address(weth), 1e6, owner));
        assertEq(usdc.balanceOf(owner), 10_000e6);
    }

    // ─── Venue behaviour ─────────────────────────────────────────────────────

    function test_partialTake_refundsTheRestToOwner() public {
        address[] memory v = new address[](1);
        v[0] = address(mockVenue);
        vm.prank(owner);
        del.grant(agent, CAP, uint64(block.timestamp + 1 days), 1_000, v);
        mockVenue.setRate(0.0004e18, 1e6); // fair price
        mockVenue.setTakeBps(9_500); // takes 95%
        bytes memory data = abi.encodeCall(mockVenue.swap, (address(usdc), address(weth), 10e6, owner));
        vm.prank(agent);
        del.spend(owner, address(mockVenue), 10e6, address(weth), 1, 0, data);
        assertEq(usdc.balanceOf(address(del)), 0);
        assertEq(usdc.balanceOf(owner), 10_000e6 - 9.5e6);
        assertEq(del.spentTodayBy(owner, agent), 10e6, "the cap counts the whole commitment");
    }

    function test_venueRevertIsBubbled() public {
        PickyVenue picky = new PickyVenue();
        SilentVenue silent = new SilentVenue();
        vm.startPrank(admin);
        registry.queueVenue(address(picky), "picky");
        registry.queueVenue(address(silent), "silent");
        vm.warp(block.timestamp + 1 days);
        registry.addVenue(address(picky));
        registry.addVenue(address(silent));
        vm.stopPrank();
        _refreshFeeds();
        address[] memory v = new address[](2);
        v[0] = address(picky);
        v[1] = address(silent);
        vm.prank(owner);
        del.grant(agent, CAP, uint64(vm.getBlockTimestamp() + 1 days), SLIP, v);
        vm.startPrank(agent);
        vm.expectRevert(abi.encodeWithSelector(PickyVenue.ReturnAmountIsNotEnough.selector, 24_768_044));
        del.spend(owner, address(picky), 1e6, address(weth), 1, 0, abi.encodeCall(PickyVenue.swap, (1)));
        vm.expectRevert(XorrDelegation.VenueCallFailed.selector);
        del.spend(owner, address(silent), 1e6, address(weth), 1, 0, abi.encodeCall(SilentVenue.swap, (1)));
        vm.stopPrank();
    }

    function test_reentrancyFromVenueIsRefused() public {
        address[] memory v = new address[](1);
        v[0] = address(mockVenue);
        vm.prank(owner);
        del.grant(agent, CAP, uint64(block.timestamp + 1 days), SLIP, v);
        bytes memory inner = abi.encodeCall(del.revoke, ());
        bytes memory data = abi.encodeCall(mockVenue.reenter, (address(del), abi.encodeCall(
            del.spend, (owner, address(mockVenue), 1e6, address(weth), 1, bytes32(0), inner)
        )));
        vm.prank(agent);
        vm.expectRevert(); // ReentrancyGuardReentrantCall
        del.spend(owner, address(mockVenue), 1e6, address(weth), 1, 0, data);
    }

    /// The attack a per-owner venue list would allow: an attacker lists a TOKEN as a "venue" and uses the delegation's
    /// identity to spend a victim's approval. The curated registry makes the listing impossible.
    function test_attack_tokenAsVenue_cannotTouchAnotherOwnersApproval() public {
        address victim = makeAddr("victim");
        eurc.mint(victim, 1_000e6);
        vm.prank(victim);
        eurc.approve(address(del), type(uint256).max);

        address attacker = makeAddr("attacker");
        address attackerAgent = makeAddr("attackerAgent");
        address[] memory v = new address[](1);
        v[0] = address(eurc);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(XorrDelegation.VenueNotAllowed.selector, address(eurc)));
        del.grant(attackerAgent, CAP, uint64(block.timestamp + 1 days), SLIP, v);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(XorrDelegation.VenueNotAllowed.selector, address(eurc)));
        del.setVenue(address(eurc), true);
        assertEq(eurc.balanceOf(victim), 1_000e6);
    }

    // ─── Closing ─────────────────────────────────────────────────────────────

    function test_close_sellsBackToUsdcOutsideTheCap() public {
        _grant();
        uint256 got = _buy(address(weth), 100e6);
        assertEq(del.remainingToday(owner), 0);
        uint256 usdcBefore = usdc.balanceOf(owner);
        vm.prank(agent);
        uint256 back = del.closePosition(owner, address(weth), address(router), got, 1, keccak256("close"), _swapData(address(weth), address(usdc), got, owner));
        assertGt(back, 99e6);
        assertEq(usdc.balanceOf(owner), usdcBefore + back);
        assertEq(weth.balanceOf(owner), 0);
        assertEq(del.spentTodayBy(owner, agent), 100e6, "closing does not touch the cap");
    }

    function test_close_refusesSettlementToken() public {
        _grant();
        vm.prank(agent);
        vm.expectRevert(XorrDelegation.InvalidToken.selector);
        del.closePosition(owner, address(usdc), address(router), 1e6, 1, 0, "");
    }

    function test_close_mustProduceUsdcForOwner() public {
        address[] memory v = new address[](2);
        v[0] = address(router);
        v[1] = address(mockVenue);
        vm.prank(owner);
        del.grant(agent, CAP, uint64(block.timestamp + 1 days), SLIP, v);
        uint256 got = _buy(address(weth), 50e6);
        // tries to rotate WETH into cirBTC (outside the cap) instead of closing to USDC
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(XorrDelegation.OutputNotReceived.selector, 0, 1));
        del.closePosition(owner, address(weth), address(mockVenue), got, 1, 0, abi.encodeCall(mockVenue.swap, (address(weth), address(cbtc), got, owner)));
        assertEq(cbtc.balanceOf(owner), 0);
    }

    function test_close_revokedAgentCannotClose() public {
        _grant();
        uint256 got = _buy(address(weth), 50e6);
        vm.prank(owner);
        del.revoke();
        vm.prank(agent);
        vm.expectRevert(XorrDelegation.PolicyRevoked.selector);
        del.closePosition(owner, address(weth), address(router), got, 1, 0, _swapData(address(weth), address(usdc), got, owner));
    }

    function test_fx_buyAndSellEurc() public {
        _grant();
        uint256 eur = _buy(address(eurc), 54e6);
        assertApproxEqRel(eur, 50e6, 0.01e18);
        vm.prank(agent);
        del.closePosition(owner, address(eurc), address(router), eur, 1, 0, _swapData(address(eurc), address(usdc), eur, owner));
        assertEq(eurc.balanceOf(owner), 0);
    }

    // ─── Guardians (the CCIP kill switch's hook) ─────────────────────────────

    function test_guardian_canOnlyStop() public {
        _grant();
        address g = makeAddr("guardian");
        vm.prank(owner);
        del.setGuardian(g, true);
        assertTrue(del.isGuardian(owner, g));
        vm.prank(g);
        del.guardianStop(owner);
        assertTrue(del.isStopped(owner));
        vm.prank(agent);
        vm.expectRevert(XorrDelegation.PolicyRevoked.selector);
        del.spend(owner, address(router), 1e6, address(weth), 1, 0, "");
    }

    function test_guardian_revokeOneAgent() public {
        _grant();
        address g = makeAddr("guardian");
        vm.prank(owner);
        del.setGuardian(g, true);
        vm.prank(g);
        del.guardianRevokeAgent(owner, agent);
        (,,, bool revoked,) = del.agentPolicyOf(owner, agent);
        assertTrue(revoked);
    }

    function test_guardian_strangerCannotStop() public {
        _grant();
        address g = makeAddr("guardian");
        vm.prank(g);
        vm.expectRevert(abi.encodeWithSelector(XorrDelegation.NotGuardian.selector, g));
        del.guardianStop(owner);
        vm.prank(owner);
        del.setGuardian(g, true);
        vm.prank(owner);
        del.setGuardian(g, false);
        vm.prank(g);
        vm.expectRevert(abi.encodeWithSelector(XorrDelegation.NotGuardian.selector, g));
        del.guardianStop(owner);
    }

    // ─── Council hook ────────────────────────────────────────────────────────

    function test_fillHookFailureNeverBlocksATrade() public {
        _grant();
        bytes32 id = keccak256("never-recorded");
        // The council refuses a fill for a decision it never recorded; the trade still goes through.
        vm.expectEmit(true, false, false, false, address(del));
        emit XorrDelegation.FillHookFailed(id, "");
        vm.prank(agent);
        del.spend(owner, address(router), 5e6, address(weth), 1, id, _swapData(address(usdc), address(weth), 5e6, owner));
        assertGt(weth.balanceOf(owner), 0);
    }

    // ─── Fuzz ────────────────────────────────────────────────────────────────

    function testFuzz_spend_neverExceedsCap(uint96 a, uint96 b, uint96 c) public {
        _grant();
        uint256[3] memory amounts = [uint256(a) % 150e6, uint256(b) % 150e6, uint256(c) % 150e6];
        uint256 total;
        for (uint256 i = 0; i < 3; i++) {
            uint256 amt = amounts[i];
            if (amt == 0) continue;
            uint256 remaining = del.remainingToday(owner);
            vm.prank(agent);
            if (amt > remaining) {
                vm.expectRevert(abi.encodeWithSelector(XorrDelegation.DailyCapExceeded.selector, amt, remaining));
                del.spend(owner, address(router), amt, address(weth), 1, 0, _swapData(address(usdc), address(weth), amt, owner));
            } else {
                del.spend(owner, address(router), amt, address(weth), 1, 0, _swapData(address(usdc), address(weth), amt, owner));
                total += amt;
            }
            assertLe(del.spentTodayBy(owner, agent), CAP);
        }
        assertEq(del.spentTodayBy(owner, agent), total);
        assertEq(usdc.balanceOf(owner), 10_000e6 - total);
        assertEq(usdc.balanceOf(address(del)), 0);
    }

    function testFuzz_floor_holdsForAnyRate(uint64 rate, uint16 slip) public {
        slip = uint16(bound(slip, 1, 1_000));
        rate = uint64(bound(rate, 1, 0.001e18)); // WETH wei paid per USDC unit... scaled below
        address[] memory v = new address[](1);
        v[0] = address(mockVenue);
        vm.prank(owner);
        del.grant(agent, CAP, uint64(block.timestamp + 1 days), slip, v);
        mockVenue.setRate(rate, 1e6);
        uint256 amount = 10e6;
        uint256 out = amount * rate / 1e6;
        uint256 floor = guard.quote(address(usdc), address(weth), amount) * (10_000 - slip) / 10_000;
        bytes memory data = abi.encodeCall(mockVenue.swap, (address(usdc), address(weth), amount, owner));
        vm.prank(agent);
        if (out == 0) {
            vm.expectRevert(abi.encodeWithSelector(XorrDelegation.OutputNotReceived.selector, 0, 1));
        } else if (out < floor) {
            vm.expectRevert(abi.encodeWithSelector(XorrDelegation.BelowOracleFloor.selector, out, floor));
        }
        del.spend(owner, address(mockVenue), amount, address(weth), 1, 0, data);
    }

    function testFuzz_grant_expiryAndCap(uint256 cap, uint64 ttl, uint16 slip) public {
        cap = bound(cap, 1, CEILING);
        ttl = uint64(bound(ttl, 1, 365 days));
        slip = uint16(bound(slip, 1, 1_000));
        vm.prank(owner);
        del.grant(agent, cap, uint64(block.timestamp) + ttl, slip, _venues());
        assertEq(del.remainingToday(owner), cap);
        vm.warp(block.timestamp + ttl);
        assertEq(del.remainingToday(owner), 0);
    }
}
