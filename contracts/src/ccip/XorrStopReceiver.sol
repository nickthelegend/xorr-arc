// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IXorrDelegationGuardian {
    function guardianStop(address owner) external;
    function guardianRevokeAgent(address owner, address agent) external;
}

/**
 * @title XorrStopReceiver
 * @notice XORR's cross-chain kill switch, Arc side. A stop sent from Base or Ethereum with Chainlink CCIP lands here
 *         and pulls the owner's kill switch on XorrDelegation.
 *
 * Who can stop whom: XorrStopSender on the source chain encodes `msg.sender` as the owner, so only the owner's own
 * address on Base/Ethereum can stop that same address's agents on Arc (an EOA has the same address on every EVM
 * chain). This receiver only accepts messages from allowlisted (source chain, sender contract) pairs, and it can act
 * only because the owner, on Arc, made it one of their guardians (`XorrDelegation.setGuardian`). A guardian can stop
 * and revoke — never grant, spend or resume — so the worst a compromised lane can do is stop trading.
 *
 * Defensive receiving: `ccipReceive` never reverts for a message from an allowed source. The action runs in
 * `try this.processMessage`; a failure (e.g. the owner has not made this receiver a guardian yet) is stored and
 * anyone can `retryFailedMessage` later. Owner powers: the source allowlist. Holds no funds.
 */
contract XorrStopReceiver is CCIPReceiver, Ownable2Step {
    uint8 public constant ACTION_STOP_ALL = 1;
    uint8 public constant ACTION_REVOKE_AGENT = 2;

    IXorrDelegationGuardian public immutable delegation;

    mapping(uint64 sourceChainSelector => mapping(address sender => bool)) public allowedSenders;
    mapping(bytes32 messageId => bytes) private _failedData;
    mapping(bytes32 messageId => bool) public isFailed;

    event SenderAllowed(uint64 indexed sourceChainSelector, address indexed sender, bool allowed);
    event StopReceived(
        bytes32 indexed messageId, uint64 indexed sourceChainSelector, address indexed owner, uint8 action, address agent
    );
    event MessageFailed(bytes32 indexed messageId, bytes reason);
    event MessageRecovered(bytes32 indexed messageId);

    error SourceNotAllowed(uint64 sourceChainSelector, address sender);
    error OnlySelf();
    error UnknownAction(uint8 action);
    error NotFailed(bytes32 messageId);
    error RenounceDisabled();

    constructor(address router, address delegation_, address initialOwner) CCIPReceiver(router) Ownable(initialOwner) {
        require(delegation_ != address(0), "delegation");
        delegation = IXorrDelegationGuardian(delegation_);
    }

    function allowSender(uint64 sourceChainSelector, address sender, bool allowed) external onlyOwner {
        require(sender != address(0), "sender");
        allowedSenders[sourceChainSelector][sender] = allowed;
        emit SenderAllowed(sourceChainSelector, sender, allowed);
    }

    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        address sender = abi.decode(message.sender, (address));
        if (!allowedSenders[message.sourceChainSelector][sender]) {
            revert SourceNotAllowed(message.sourceChainSelector, sender);
        }
        try this.processMessage(message.data) {
            // done
        } catch (bytes memory reason) {
            isFailed[message.messageId] = true;
            _failedData[message.messageId] = message.data;
            emit MessageFailed(message.messageId, reason);
            return;
        }
        (uint8 action, address owner, address agent) = abi.decode(message.data, (uint8, address, address));
        emit StopReceived(message.messageId, message.sourceChainSelector, owner, action, agent);
    }

    /// @dev Only callable by this contract, so a failure can be caught without failing the CCIP execution.
    function processMessage(bytes calldata data) external {
        if (msg.sender != address(this)) revert OnlySelf();
        (uint8 action, address owner, address agent) = abi.decode(data, (uint8, address, address));
        if (action == ACTION_STOP_ALL) delegation.guardianStop(owner);
        else if (action == ACTION_REVOKE_AGENT) delegation.guardianRevokeAgent(owner, agent);
        else revert UnknownAction(action);
    }

    /// @notice Run a stored failed stop again (e.g. once the owner has made this receiver a guardian). Anyone may.
    function retryFailedMessage(bytes32 messageId) external {
        if (!isFailed[messageId]) revert NotFailed(messageId);
        bytes memory data = _failedData[messageId];
        isFailed[messageId] = false;
        delete _failedData[messageId];
        this.processMessage(data);
        emit MessageRecovered(messageId);
    }

    function failedMessage(bytes32 messageId) external view returns (bytes memory) {
        return _failedData[messageId];
    }
}
