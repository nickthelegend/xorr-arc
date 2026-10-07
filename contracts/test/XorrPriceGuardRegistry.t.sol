// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {XorrBase} from "./XorrBase.t.sol";
import {XorrPriceGuard} from "../src/XorrPriceGuard.sol";
import {XorrVenueRegistry} from "../src/XorrVenueRegistry.sol";
import {XorrMirrorFeed} from "../src/testnet/XorrMirrorFeed.sol";
import {MockAggregator, MockERC20} from "./mocks/Mocks.sol";

contract XorrPriceGuardTest is XorrBase {
    function test_quote_scalesAcrossDecimals() public view {
        assertEq(guard.quote(address(usdc), address(weth), 2_500e6), 1e18);
        assertEq(guard.quote(address(weth), address(usdc), 1e18), 2_500e6);
        assertEq(guard.quote(address(usdc), address(cbtc), 60_000e6), 1e8);
        assertEq(guard.quote(address(cbtc), address(usdc), 1e8), 60_000e6);
        assertEq(guard.quote(address(usdc), address(eurc), 108e6), 100e6);
        assertEq(guard.quote(address(weth), address(cbtc), 24e18), 1e8);
    }

    function testFuzz_quote_roundTripNeverGains(uint96 amount) public view {
        uint256 a = bound(uint256(amount), 1, 1e12 * 1e6);
        uint256 w = guard.quote(address(usdc), address(weth), a);
        assertLe(guard.quote(address(weth), address(usdc), w), a);
    }

    function test_priceOf_refusesStaleNegativeAndUnanswered() public {
        vm.warp(block.timestamp + 1 days + 1 hours + 1);
        vm.expectRevert();
        guard.priceOf(address(weth));
        ethFeed.set(-1, vm.getBlockTimestamp());
        vm.expectRevert(abi.encodeWithSelector(XorrPriceGuard.BadPrice.selector, address(weth), int256(-1)));
        guard.priceOf(address(weth));
        ethFeed.set(2_000e8, vm.getBlockTimestamp());
        ethFeed.setRound(5, 4);
        vm.expectRevert(abi.encodeWithSelector(XorrPriceGuard.IncompleteRound.selector, address(weth)));
        guard.priceOf(address(weth));
        vm.expectRevert(abi.encodeWithSelector(XorrPriceGuard.NoFeed.selector, address(0xdead)));
        guard.priceOf(address(0xdead));
    }

    function test_feedChange_isTimelocked() public {
        MockAggregator other = new MockAggregator(8, 1e8);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(XorrPriceGuard.AlreadyListed.selector, address(weth)));
        guard.listFeed(address(weth), address(other), 1 days);
        vm.prank(admin);
        guard.queueFeedChange(address(weth), address(other), 1 days);
        vm.expectRevert();
        guard.applyFeedChange(address(weth));
        vm.warp(block.timestamp + 1 days);
        guard.applyFeedChange(address(weth)); // anyone may apply
        (address agg,,,) = guard.feedOf(address(weth));
        assertEq(agg, address(other));
    }

    function test_onlyOwnerListsAndNoRenounce() public {
        vm.expectRevert();
        guard.listFeed(address(0x1), address(usdcFeed), 1 days);
        vm.prank(admin);
        vm.expectRevert(XorrPriceGuard.RenounceDisabled.selector);
        guard.renounceOwnership();
        MockERC20 x = new MockERC20("x", "x", 18);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(XorrPriceGuard.BadMaxAge.selector, uint32(27 hours)));
        guard.listFeed(address(x), address(usdcFeed), 27 hours);
    }

    function test_mirrorFeed_worksAsAFeed() public {
        address poster = makeAddr("poster");
        XorrMirrorFeed m = new XorrMirrorFeed(8, "ETH / USD", address(0x50FC), poster);
        MockERC20 x = new MockERC20("x", "x", 18);
        vm.prank(admin);
        guard.listFeed(address(x), address(m), 25 hours);
        vm.expectRevert(); // no round yet: updatedAt == 0
        guard.priceOf(address(x));
        vm.prank(poster);
        m.post(2_600e8, block.timestamp - 10);
        (uint256 p,) = guard.priceOf(address(x));
        assertEq(p, 2_600e18);
        vm.prank(poster);
        vm.expectRevert(XorrMirrorFeed.NotNewer.selector);
        m.post(2_700e8, block.timestamp - 10);
        vm.expectRevert(XorrMirrorFeed.NotPoster.selector);
        m.post(1, block.timestamp);
    }
}

contract XorrVenueRegistryTest is XorrBase {
    function test_addIsTimelockedRemoveIsImmediate() public {
        address v = address(new MockERC20("v", "v", 18)); // any contract
        vm.prank(admin);
        registry.queueVenue(v, "new");
        assertFalse(registry.isVenue(v));
        vm.expectRevert();
        registry.addVenue(v);
        vm.warp(block.timestamp + 1 days);
        registry.addVenue(v);
        assertTrue(registry.isVenue(v));
        assertEq(registry.venues().length, 3);
        vm.prank(admin);
        registry.removeVenue(v);
        assertFalse(registry.isVenue(v));
    }

    function test_cannotQueueLiveVenueOrEoa() public {
        vm.startPrank(admin);
        vm.expectRevert("already live");
        registry.queueVenue(address(router), "again");
        vm.expectRevert("not a contract");
        registry.queueVenue(makeAddr("eoa"), "eoa");
        vm.stopPrank();
    }

    function test_onlyOwner() public {
        vm.expectRevert();
        registry.removeVenue(address(router));
        vm.expectRevert();
        registry.queueVenue(address(router), "x");
    }
}
