// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

interface IXorrPriceGuard {
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256);
}

interface IXorrVenueRegistry {
    function isVenue(address venue) external view returns (bool);
}

interface IXorrFillSink {
    function onFill(
        bytes32 decisionId,
        address owner,
        address agent,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 received
    ) external;
}

/**
 * @title XorrDelegation
 * @notice The permission that lets XORR's council of agents trade a user's USDC on Arc while they are not looking:
 *         TRADE-ONLY, VENUE-ALLOWLISTED, CAPPED PER DAY, TIME-BOXED, PRICE-CHECKED BY CHAINLINK and REVOCABLE IN ONE TAP
 *         (or from another chain, through CCIP).
 *
 * Every constraint is enforced here, never only in the executor:
 *   - the daily cap (in USDC) resets at the UTC day boundary and is checked on every spend;
 *   - the expiry is checked on every trade;
 *   - the venue must be on the owner's allowlist AND on XORR's curated venue registry (DEX routers only — the
 *     delegation holds other owners' approvals, so it must never call an arbitrary contract as itself);
 *   - every trade must deliver its output TO THE OWNER, measured as the owner's balance change across the venue call;
 *   - that output must be at least Chainlink's value of what was sold, less the owner's own slippage limit
 *     (XorrPriceGuard). The agent's key does not choose the floor — Chainlink does;
 *   - `revoke()` stops every agent from the next block, needs nothing but the owner's signature, and can also be
 *     triggered by a guardian the owner chose (XORR's CCIP receiver, so a stop sent from Base or Ethereum lands here).
 *
 * The contract never holds user funds between transactions. It pulls exactly `amount` from the owner at the moment of
 * a trade, approves the venue for exactly that, forwards any part the venue did not take straight back to the owner,
 * and leaves no standing approval behind.
 *
 * Spending and closing are separate on purpose. `spend` commits USDC (the settlement token) and counts against the
 * daily cap. `closePosition` sells something the owner holds BACK INTO USDC: it does not touch the cap (a stop-loss a
 * spending limit could silence is not a stop), and because it can only ever produce USDC it cannot be used to rotate
 * between risk assets outside the cap.
 *
 * Deployment-wide guard: `DAILY_CAP_CEILING` bounds any single agent's daily cap on this deployment (tiny on mainnet).
 * There is no owner, no admin and no upgrade path in this contract.
 */
contract XorrDelegation is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Policy {
        uint128 dailyCap;
        uint64 expiresAt;
        uint16 maxSlippageBps;
        bool revoked;
    }

    /// @notice Hard ceiling on the owner-chosen slippage: 10%.
    uint16 public constant MAX_SLIPPAGE_BPS = 1_000;
    /// @notice Gas forwarded to the council's fill hook. Its failure never blocks a trade.
    uint256 public constant FILL_HOOK_GAS = 250_000;

    /// @notice USDC on Arc. What the daily cap is denominated in, what `spend` pays with, and what `closePosition` yields.
    address public immutable SETTLEMENT_TOKEN;
    /// @notice Chainlink-backed price floor for every trade.
    IXorrPriceGuard public immutable GUARD;
    /// @notice The curated venues (DEX routers) any owner may allow. See XorrVenueRegistry for why it is curated.
    IXorrVenueRegistry public immutable REGISTRY;
    /// @notice XORR's council ledger: told about each fill so the agents' ERC-8004 reputation follows real trades.
    IXorrFillSink public immutable COUNCIL;
    /// @notice No agent on this deployment may be granted more than this per day (settlement-token units).
    uint256 public immutable DAILY_CAP_CEILING;

    mapping(address owner => mapping(address agent => Policy)) private _policies;
    mapping(address owner => address[]) private _agents;
    mapping(address owner => mapping(address agent => bool)) private _isListedAgent;
    mapping(address owner => address) private _lastAgent;
    /// @dev The kill switch: every agent of `owner` stopped at once; cleared by the owner's next grant.
    mapping(address owner => bool) private _stopped;
    mapping(address owner => mapping(address agent => mapping(uint256 day => uint256))) private _spentOnDay;
    mapping(address owner => mapping(address venue => bool)) private _venueAllowed;
    /// @dev Every venue allowed since the last `grant`, so a re-grant replaces the list rather than adding to it.
    mapping(address owner => address[]) private _venueList;
    /// @dev Addresses the owner allows to STOP (never to grant, spend or un-stop) their agents.
    mapping(address owner => mapping(address guardian => bool)) private _guardian;

    /// @dev EIP-1153 slot holding the owner the current venue call is being made for.
    bytes32 private constant ACTIVE_OWNER_SLOT = keccak256("xorr.delegation.activeOwner");

    event Granted(
        address indexed owner, address indexed agent, uint256 dailyCap, uint64 expiresAt, uint16 maxSlippageBps
    );
    /// @notice `agent` is the agent revoked, or address(0) when every agent was stopped at once.
    event Revoked(address indexed owner, address indexed agent, address by);
    event VenueAllowed(address indexed owner, address indexed venue, bool allowed);
    event GuardianSet(address indexed owner, address indexed guardian, bool allowed);
    event Spent(
        address indexed owner,
        address indexed agent,
        address indexed venue,
        address tokenOut,
        uint256 amountIn,
        uint256 received,
        uint256 spentToday,
        bytes32 decisionId
    );
    event Closed(
        address indexed owner,
        address indexed agent,
        address indexed venue,
        address tokenIn,
        uint256 amountIn,
        uint256 received,
        bytes32 decisionId
    );
    event FillHookFailed(bytes32 indexed decisionId, bytes reason);

    error NotDelegate();
    error PolicyRevoked();
    error PolicyExpired();
    error VenueNotAllowed(address venue);
    error DailyCapExceeded(uint256 requested, uint256 remaining);
    error ZeroAmount();
    error VenueCallFailed();
    error InvalidToken();
    error ZeroMinOut();
    error OutputNotReceived(uint256 received, uint256 minOut);
    error BelowOracleFloor(uint256 received, uint256 floor);
    error BadGrant();
    error NotGuardian(address caller);

    constructor(address settlementToken, address guard, address registry, address council, uint256 dailyCapCeiling) {
        require(settlementToken != address(0) && guard != address(0) && registry != address(0), "zero address");
        require(dailyCapCeiling > 0, "ceiling required");
        SETTLEMENT_TOKEN = settlementToken;
        GUARD = IXorrPriceGuard(guard);
        REGISTRY = IXorrVenueRegistry(registry);
        COUNCIL = IXorrFillSink(council);
        DAILY_CAP_CEILING = dailyCapCeiling;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner actions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Grant an agent a capped, time-boxed, venue-scoped, price-checked trading authority.
     * @dev Re-granting REPLACES the venue list: a venue left off is no longer allowed. Lifts a stop-all. The owner must
     *      also approve this contract for the USDC it may spend (and for any asset the agents may close).
     */
    function grant(address agent, uint256 dailyCap, uint64 expiresAt, uint16 maxSlippageBps, address[] calldata venues)
        external
    {
        _grantAgent(msg.sender, agent, dailyCap, expiresAt, maxSlippageBps);

        address[] storage listed = _venueList[msg.sender];
        for (uint256 i = 0; i < listed.length; i++) {
            if (_venueAllowed[msg.sender][listed[i]]) {
                _venueAllowed[msg.sender][listed[i]] = false;
                emit VenueAllowed(msg.sender, listed[i], false);
            }
        }
        delete _venueList[msg.sender];
        for (uint256 i = 0; i < venues.length; i++) {
            _setVenue(msg.sender, venues[i], true);
        }
    }

    /// @notice Give one more agent its own permission under the venues already allowed. Lifts a stop-all.
    function grantAgent(address agent, uint256 dailyCap, uint64 expiresAt, uint16 maxSlippageBps) external {
        _grantAgent(msg.sender, agent, dailyCap, expiresAt, maxSlippageBps);
    }

    /// @notice Stop one agent; the others keep their permissions.
    function revokeAgent(address agent) external {
        _policies[msg.sender][agent].revoked = true;
        emit Revoked(msg.sender, agent, msg.sender);
    }

    /// @notice The kill switch: every agent stops from this block until the owner grants again.
    function revoke() external {
        _stop(msg.sender, msg.sender);
    }

    function setVenue(address venue, bool allowed) external {
        _setVenue(msg.sender, venue, allowed);
    }

    /// @notice Allow (or disallow) `guardian` to pull the owner's kill switch. A guardian can ONLY stop.
    function setGuardian(address guardian, bool allowed) external {
        require(guardian != address(0), "guardian required");
        _guardian[msg.sender][guardian] = allowed;
        emit GuardianSet(msg.sender, guardian, allowed);
    }

    /// @notice Pull `owner`'s kill switch on their behalf. Only a guardian `owner` chose; it cannot undo it.
    function guardianStop(address owner) external {
        if (!_guardian[owner][msg.sender]) revert NotGuardian(msg.sender);
        _stop(owner, msg.sender);
    }

    /// @notice A guardian revokes one of `owner`'s agents. Same rule: stop only.
    function guardianRevokeAgent(address owner, address agent) external {
        if (!_guardian[owner][msg.sender]) revert NotGuardian(msg.sender);
        _policies[owner][agent].revoked = true;
        emit Revoked(owner, agent, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Agent actions — the only things an agent's key can do
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Spend the owner's USDC at an allowlisted venue, inside the daily cap, for at least Chainlink's price.
     * @param owner The user whose permission authorises this.
     * @param venue The allowlisted contract to call (e.g. a Uniswap v2 router).
     * @param amount USDC to spend (6 decimals).
     * @param tokenOut What the trade must deliver to the owner.
     * @param minOut The least the owner's `tokenOut` balance must rise by (> 0). The oracle floor applies on top.
     * @param decisionId The council decision this trade carries out (also its Arc Memo id). Zero for none.
     * @param data Calldata forwarded to `venue`.
     */
    function spend(
        address owner,
        address venue,
        uint256 amount,
        address tokenOut,
        uint256 minOut,
        bytes32 decisionId,
        bytes calldata data
    ) external nonReentrant returns (uint256 received) {
        Policy memory p = _checkAgent(owner, venue);
        if (amount == 0) revert ZeroAmount();
        if (tokenOut == address(0) || tokenOut == SETTLEMENT_TOKEN) revert InvalidToken();
        if (minOut == 0) revert ZeroMinOut();

        uint256 day = block.timestamp / 1 days;
        uint256 spent = _spentOnDay[owner][msg.sender][day];
        uint256 remaining = p.dailyCap > spent ? p.dailyCap - spent : 0;
        if (amount > remaining) revert DailyCapExceeded(amount, remaining);
        _spentOnDay[owner][msg.sender][day] = spent + amount;

        received = _trade(owner, SETTLEMENT_TOKEN, venue, amount, tokenOut, minOut, p.maxSlippageBps, data);
        emit Spent(owner, msg.sender, venue, tokenOut, amount, received, spent + amount, decisionId);
        _notify(decisionId, owner, SETTLEMENT_TOKEN, tokenOut, amount, received);
    }

    /**
     * @notice Close a position: sell an asset the owner holds back into USDC. Not counted against the daily cap, never
     *         able to move USDC itself, and held to the same venue, expiry, revocation and Chainlink floor as `spend`.
     */
    function closePosition(
        address owner,
        address token,
        address venue,
        uint256 amount,
        uint256 minOut,
        bytes32 decisionId,
        bytes calldata data
    ) external nonReentrant returns (uint256 received) {
        Policy memory p = _checkAgent(owner, venue);
        if (amount == 0) revert ZeroAmount();
        if (token == address(0) || token == SETTLEMENT_TOKEN) revert InvalidToken();
        if (minOut == 0) revert ZeroMinOut();

        received = _trade(owner, token, venue, amount, SETTLEMENT_TOKEN, minOut, p.maxSlippageBps, data);
        emit Closed(owner, msg.sender, venue, token, amount, received, decisionId);
        _notify(decisionId, owner, token, SETTLEMENT_TOKEN, amount, received);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views — the app reads its limits from the chain, never from a database
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice The most recently granted agent's permission (`revoked` is true when it or the whole owner is stopped).
    function policyOf(address owner)
        external
        view
        returns (address agent, uint256 dailyCap, uint64 expiresAt, uint16 maxSlippageBps, bool revoked)
    {
        agent = _lastAgent[owner];
        Policy memory p = _policies[owner][agent];
        return (agent, p.dailyCap, p.expiresAt, p.maxSlippageBps, p.revoked || _stopped[owner]);
    }

    function agentPolicyOf(address owner, address agent)
        external
        view
        returns (uint256 dailyCap, uint64 expiresAt, uint16 maxSlippageBps, bool revoked, bool stopped)
    {
        Policy memory p = _policies[owner][agent];
        return (p.dailyCap, p.expiresAt, p.maxSlippageBps, p.revoked, _stopped[owner]);
    }

    function agentsOf(address owner) external view returns (address[] memory) {
        return _agents[owner];
    }

    function venuesOf(address owner) external view returns (address[] memory venues) {
        address[] storage listed = _venueList[owner];
        uint256 n;
        for (uint256 i = 0; i < listed.length; i++) if (_venueAllowed[owner][listed[i]]) n++;
        venues = new address[](n);
        n = 0;
        for (uint256 i = 0; i < listed.length; i++) if (_venueAllowed[owner][listed[i]]) venues[n++] = listed[i];
    }

    function isStopped(address owner) external view returns (bool) {
        return _stopped[owner];
    }

    function isGuardian(address owner, address guardian) external view returns (bool) {
        return _guardian[owner][guardian];
    }

    function isVenueAllowed(address owner, address venue) external view returns (bool) {
        return _venueAllowed[owner][venue];
    }

    function remainingTodayFor(address owner, address agent) public view returns (uint256) {
        Policy memory p = _policies[owner][agent];
        if (p.revoked || _stopped[owner] || block.timestamp >= p.expiresAt) return 0;
        uint256 spent = _spentOnDay[owner][agent][block.timestamp / 1 days];
        return p.dailyCap > spent ? p.dailyCap - spent : 0;
    }

    function remainingToday(address owner) external view returns (uint256) {
        return remainingTodayFor(owner, _lastAgent[owner]);
    }

    function spentTodayBy(address owner, address agent) external view returns (uint256) {
        return _spentOnDay[owner][agent][block.timestamp / 1 days];
    }

    function spentOnDay(address owner, address agent, uint256 day) external view returns (uint256) {
        return _spentOnDay[owner][agent][day];
    }

    /// @notice The owner whose trade is executing right now, or zero outside one (transient storage).
    function activeOwner() public view returns (address owner) {
        bytes32 slot = ACTIVE_OWNER_SLOT;
        assembly {
            owner := tload(slot)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────────

    function _grantAgent(address owner, address agent, uint256 dailyCap, uint64 expiresAt, uint16 maxSlippageBps)
        private
    {
        if (
            agent == address(0) || agent == owner || dailyCap == 0 || dailyCap > DAILY_CAP_CEILING
                || expiresAt <= block.timestamp || maxSlippageBps == 0 || maxSlippageBps > MAX_SLIPPAGE_BPS
        ) revert BadGrant();
        _policies[owner][agent] = Policy(uint128(dailyCap), expiresAt, maxSlippageBps, false);
        if (!_isListedAgent[owner][agent]) {
            _isListedAgent[owner][agent] = true;
            _agents[owner].push(agent);
        }
        _lastAgent[owner] = agent;
        _stopped[owner] = false;
        emit Granted(owner, agent, dailyCap, expiresAt, maxSlippageBps);
    }

    function _stop(address owner, address by) private {
        _stopped[owner] = true;
        emit Revoked(owner, address(0), by);
    }

    function _checkAgent(address owner, address venue) private view returns (Policy memory p) {
        p = _policies[owner][msg.sender];
        if (p.dailyCap == 0) revert NotDelegate();
        if (_stopped[owner] || p.revoked) revert PolicyRevoked();
        if (block.timestamp >= p.expiresAt) revert PolicyExpired();
        // Both the owner's allowlist and the curated registry: a venue the registry dropped stops working at once.
        if (!_venueAllowed[owner][venue] || !REGISTRY.isVenue(venue)) revert VenueNotAllowed(venue);
    }

    function _setVenue(address owner, address venue, bool allowed) private {
        if (allowed && !REGISTRY.isVenue(venue)) revert VenueNotAllowed(venue);
        if (allowed && !_venueAllowed[owner][venue]) _venueList[owner].push(venue);
        _venueAllowed[owner][venue] = allowed;
        emit VenueAllowed(owner, venue, allowed);
    }

    /**
     * @dev Pull `amount` of `tokenIn` from the owner, approve `venue` for exactly that, call it with the owner recorded
     *      as active, refund whatever the venue did not take, revoke the approval, then require the owner's `tokenOut`
     *      balance to have risen by at least `minOut` AND by at least Chainlink's value less the slippage limit.
     */
    function _trade(
        address owner,
        address tokenIn,
        address venue,
        uint256 amount,
        address tokenOut,
        uint256 minOut,
        uint16 maxSlippageBps,
        bytes calldata data
    ) private returns (uint256 received) {
        // Read the floor first: a stale or missing feed refuses the trade before any value moves.
        uint256 fair = GUARD.quote(tokenIn, tokenOut, amount);
        uint256 floor = fair * (10_000 - maxSlippageBps) / 10_000;

        IERC20 tin = IERC20(tokenIn);
        uint256 heldBefore = tin.balanceOf(address(this));
        tin.safeTransferFrom(owner, address(this), amount);
        tin.forceApprove(venue, amount);
        uint256 before = IERC20(tokenOut).balanceOf(owner);

        _setActiveOwner(owner);
        (bool ok, bytes memory ret) = venue.call(data);
        _setActiveOwner(address(0));
        _bubble(ok, ret);

        tin.forceApprove(venue, 0);
        uint256 heldAfter = tin.balanceOf(address(this));
        if (heldAfter > heldBefore) tin.safeTransfer(owner, heldAfter - heldBefore);

        uint256 afterCall = IERC20(tokenOut).balanceOf(owner);
        received = afterCall > before ? afterCall - before : 0;
        if (received < minOut) revert OutputNotReceived(received, minOut);
        if (received < floor) revert BelowOracleFloor(received, floor);
    }

    function _notify(
        bytes32 decisionId,
        address owner,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 received
    ) private {
        if (decisionId == bytes32(0) || address(COUNCIL) == address(0)) return;
        try COUNCIL.onFill{gas: FILL_HOOK_GAS}(decisionId, owner, msg.sender, tokenIn, tokenOut, amountIn, received) {}
        catch (bytes memory reason) {
            emit FillHookFailed(decisionId, reason);
        }
    }

    function _setActiveOwner(address owner) private {
        bytes32 slot = ACTIVE_OWNER_SLOT;
        assembly {
            tstore(slot, owner)
        }
    }

    /// @dev Re-throw the venue's own revert byte for byte, so the executor can say what actually went wrong.
    function _bubble(bool ok, bytes memory ret) private pure {
        if (ok) return;
        if (ret.length == 0) revert VenueCallFailed();
        assembly {
            revert(add(ret, 0x20), mload(ret))
        }
    }
}
