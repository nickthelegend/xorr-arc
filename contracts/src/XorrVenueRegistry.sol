// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title XorrVenueRegistry
 * @notice The venues XorrDelegation may ever call. An owner's own allowlist is a subset of this list.
 *
 * Why a curated list and not "any address the owner allows": the delegation calls a venue AS ITSELF, and it holds
 * other owners' ERC-20 approvals (for closing positions). If an owner could allow an arbitrary contract — a token, say —
 * their own agent could send calldata like `EURC.transferFrom(someoneElse, attacker, x)` through the delegation and
 * spend somebody else's approval. Only contracts that pull from their caller and pay where told (DEX routers) belong
 * here, so the registry is the place that decision is made, once, in public.
 *
 * Owner powers (documented, minimal): ADD a venue after a 24 h on-chain notice (`queueVenue` → `addVenue`), and REMOVE
 * a venue immediately (removing only ever takes power away). Two-step ownership, no renounce.
 */
contract XorrVenueRegistry is Ownable2Step {
    uint256 public constant ADD_DELAY = 1 days;

    struct Venue {
        bool live;
        uint64 readyAt;
        string label;
    }

    mapping(address venue => Venue) private _venues;
    mapping(address venue => bool) private _everLive;
    address[] private _all;

    event VenueQueued(address indexed venue, string label, uint64 readyAt);
    event VenueAdded(address indexed venue, string label);
    event VenueRemoved(address indexed venue);

    error NotQueued(address venue);
    error TooEarly(address venue, uint64 readyAt);
    error RenounceDisabled();

    /// @param initial Venues live from deployment (e.g. the Uniswap v2 router deployed in the same script).
    constructor(address initialOwner, address[] memory initial, string[] memory labels) Ownable(initialOwner) {
        require(initial.length == labels.length, "length");
        for (uint256 i = 0; i < initial.length; i++) {
            _add(initial[i], labels[i]);
        }
    }

    function queueVenue(address venue, string calldata label) external onlyOwner {
        require(venue.code.length > 0, "not a contract");
        require(!_venues[venue].live, "already live");
        uint64 readyAt = uint64(block.timestamp + ADD_DELAY);
        _venues[venue] = Venue(false, readyAt, label);
        emit VenueQueued(venue, label, readyAt);
    }

    /// @notice Make a queued venue live once its notice has run. Anyone may call it; only the owner may queue.
    function addVenue(address venue) external {
        Venue memory v = _venues[venue];
        if (v.readyAt == 0) revert NotQueued(venue);
        if (block.timestamp < v.readyAt) revert TooEarly(venue, v.readyAt);
        _add(venue, v.label);
    }

    function removeVenue(address venue) external onlyOwner {
        delete _venues[venue];
        emit VenueRemoved(venue);
    }

    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    function isVenue(address venue) external view returns (bool) {
        return _venues[venue].live;
    }

    function venueInfo(address venue) external view returns (bool live, uint64 readyAt, string memory label) {
        Venue memory v = _venues[venue];
        return (v.live, v.readyAt, v.label);
    }

    /// @notice Every venue ever made live (check `isVenue` for whether it still is).
    function venues() external view returns (address[] memory) {
        return _all;
    }

    function _add(address venue, string memory label) private {
        require(venue != address(0), "zero venue");
        _venues[venue] = Venue(true, 0, label);
        if (!_everLive[venue]) {
            _everLive[venue] = true;
            _all.push(venue);
        }
        emit VenueAdded(venue, label);
    }
}
