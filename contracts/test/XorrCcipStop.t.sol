// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CCIPLocalSimulator, IRouterClient} from "@chainlink/local/src/ccip/CCIPLocalSimulator.sol";
import {XorrBase} from "./XorrBase.t.sol";
import {XorrDelegation} from "../src/XorrDelegation.sol";
import {XorrStopSender} from "../src/ccip/XorrStopSender.sol";
import {XorrStopReceiver} from "../src/ccip/XorrStopReceiver.sol";

interface ILocalRouter {
    function setFee(uint256 feeAmount) external;
}

/**
 * The cross-chain kill switch, end to end through Chainlink Local's CCIPLocalSimulator: the owner presses stop on
 * "Base" (XorrStopSender), CCIP carries it, XorrStopReceiver on "Arc" pulls the owner's kill switch on XorrDelegation.
 * The simulator routes every message for real (router → receiver.ccipReceive), with native-coin fees.
 */
contract XorrCcipStopTest is XorrBase {
    CCIPLocalSimulator internal sim;
    uint64 internal selector;
    XorrStopSender internal sender;
    XorrStopReceiver internal receiver;
    uint256 internal constant FEE = 0.001 ether;

    function setUp() public override {
        super.setUp();
        sim = new CCIPLocalSimulator();
        (uint64 chainSelector, IRouterClient sourceRouter, IRouterClient destinationRouter,,,,) = sim.configuration();
        selector = chainSelector;
        ILocalRouter(address(sourceRouter)).setFee(FEE);
        receiver = new XorrStopReceiver(address(destinationRouter), address(del), admin);
        sender = new XorrStopSender(address(sourceRouter), selector, address(receiver));
        vm.prank(admin);
        receiver.allowSender(selector, address(sender), true);
        _grant();
        vm.deal(owner, 1 ether);
    }

    function test_stopFromBase_stopsTradingOnArc() public {
        vm.prank(owner);
        del.setGuardian(address(receiver), true);
        vm.prank(owner);
        sender.stopAll{value: FEE}();
        assertTrue(del.isStopped(owner));
        vm.prank(agent);
        vm.expectRevert(XorrDelegation.PolicyRevoked.selector);
        del.spend(owner, address(router), 1e6, address(weth), 1, 0, _swapData(address(usdc), address(weth), 1e6, owner));
    }

    function test_revokeOneAgentFromBase() public {
        vm.prank(owner);
        del.setGuardian(address(receiver), true);
        vm.prank(owner);
        sender.revokeAgent{value: FEE}(agent);
        (,,, bool revoked, bool stopped) = del.agentPolicyOf(owner, agent);
        assertTrue(revoked);
        assertFalse(stopped);
    }

    function test_onlyStopsTheSendersOwnAgents() public {
        address stranger = makeAddr("stranger");
        vm.deal(stranger, 1 ether);
        vm.prank(owner);
        del.setGuardian(address(receiver), true);
        vm.prank(stranger);
        bytes32 id = sender.stopAll{value: FEE}(); // the message names the STRANGER as owner, never the owner
        assertFalse(del.isStopped(owner));
        // and the stranger never made the receiver their guardian, so even that is stored as failed, not applied
        assertTrue(receiver.isFailed(id));
        (uint8 action, address named,) = abi.decode(receiver.failedMessage(id), (uint8, address, address));
        assertEq(action, 1);
        assertEq(named, stranger);
    }

    function test_withoutGuardian_messageIsStoredThenRetried() public {
        vm.recordLogs();
        vm.prank(owner);
        bytes32 id = sender.stopAll{value: FEE}();
        assertFalse(del.isStopped(owner), "the owner has not made the receiver a guardian yet");
        assertTrue(receiver.isFailed(id));
        vm.expectRevert();
        receiver.retryFailedMessage(id); // still not a guardian: the retry reverts, message stays failed
        assertTrue(receiver.isFailed(id));
        vm.prank(owner);
        del.setGuardian(address(receiver), true);
        receiver.retryFailedMessage(id); // anyone can retry
        assertTrue(del.isStopped(owner));
        assertFalse(receiver.isFailed(id));
    }

    function test_feeIsCheckedAndExcessRefunded() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(XorrStopSender.InsufficientFee.selector, FEE - 1, FEE));
        sender.stopAll{value: FEE - 1}();
        uint256 before = owner.balance;
        vm.prank(owner);
        sender.stopAll{value: FEE * 3}();
        assertEq(before - owner.balance, FEE);
    }

    function test_unknownSourceIsRejected() public {
        XorrStopSender rogue = new XorrStopSender(address(sender.router()), selector, address(receiver));
        vm.prank(owner);
        del.setGuardian(address(receiver), true);
        vm.prank(owner);
        vm.expectRevert(); // SourceNotAllowed — CCIP execution fails, nothing changes on Arc
        rogue.stopAll{value: FEE}();
        assertFalse(del.isStopped(owner));
    }

    function test_processMessageIsSelfOnly() public {
        vm.expectRevert(XorrStopReceiver.OnlySelf.selector);
        receiver.processMessage(abi.encode(uint8(1), owner, address(0)));
    }
}
