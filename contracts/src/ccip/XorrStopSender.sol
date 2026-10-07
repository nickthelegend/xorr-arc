// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

/**
 * @title XorrStopSender
 * @notice XORR's cross-chain kill switch, source side (Base, Ethereum, or any chain with a CCIP lane to Arc).
 *
 * `stopAll()` sends one Chainlink CCIP message to XorrStopReceiver on Arc saying "stop every agent of msg.sender".
 * The owner is ALWAYS `msg.sender` — nobody can stop someone else's agents — and the fee is paid in this chain's native
 * coin (ETH on Base/Ethereum), quoted by `fee()`; any excess is refunded. No owner, no admin, nothing to configure
 * after deployment, holds nothing between calls.
 */
contract XorrStopSender {
    uint8 public constant ACTION_STOP_ALL = 1;
    uint8 public constant ACTION_REVOKE_AGENT = 2;
    /// @dev The receiver does two SLOADs and one external call; 200k leaves wide headroom.
    uint256 public constant DEST_GAS_LIMIT = 200_000;

    IRouterClient public immutable router;
    uint64 public immutable arcChainSelector;
    address public immutable arcReceiver;

    event StopSent(bytes32 indexed messageId, address indexed owner, uint8 action, address agent, uint256 fee);

    error InsufficientFee(uint256 sent, uint256 fee);
    error RefundFailed();

    constructor(address router_, uint64 arcChainSelector_, address arcReceiver_) {
        require(router_ != address(0) && arcReceiver_ != address(0), "zero");
        router = IRouterClient(router_);
        arcChainSelector = arcChainSelector_;
        arcReceiver = arcReceiver_;
    }

    function fee(uint8 action, address agent) public view returns (uint256) {
        return router.getFee(arcChainSelector, _message(action, msg.sender, agent));
    }

    /// @notice Stop every XORR agent trading for you on Arc.
    function stopAll() external payable returns (bytes32) {
        return _send(ACTION_STOP_ALL, address(0));
    }

    /// @notice Revoke one of your XORR agents on Arc.
    function revokeAgent(address agent) external payable returns (bytes32) {
        require(agent != address(0), "agent");
        return _send(ACTION_REVOKE_AGENT, agent);
    }

    function _send(uint8 action, address agent) private returns (bytes32 messageId) {
        Client.EVM2AnyMessage memory message = _message(action, msg.sender, agent);
        uint256 f = router.getFee(arcChainSelector, message);
        if (msg.value < f) revert InsufficientFee(msg.value, f);
        messageId = router.ccipSend{value: f}(arcChainSelector, message);
        emit StopSent(messageId, msg.sender, action, agent, f);
        if (msg.value > f) {
            (bool ok,) = msg.sender.call{value: msg.value - f}("");
            if (!ok) revert RefundFailed();
        }
    }

    function _message(uint8 action, address owner, address agent) private view returns (Client.EVM2AnyMessage memory) {
        return Client.EVM2AnyMessage({
            receiver: abi.encode(arcReceiver),
            data: abi.encode(action, owner, agent),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            feeToken: address(0),
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({gasLimit: DEST_GAS_LIMIT, allowOutOfOrderExecution: true})
            )
        });
    }
}
