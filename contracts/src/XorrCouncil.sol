// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IIdentityRegistry8004} from "./interfaces/IIdentityRegistry8004.sol";
import {IReputationRegistry8004} from "./interfaces/IReputationRegistry8004.sol";

interface IXorrGuardReader {
    function priceOf(address token) external view returns (uint256 price18, uint256 updatedAt);
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256);
}

/**
 * @title XorrCouncil
 * @notice The council's ledger on Arc, and where its agents earn ERC-8004 reputation from what actually happened.
 *
 * Each seat of XORR's council (Price Desk, Risk Keeper, Trend Reader, Peg Desk, Strategist) is an agent registered on
 * Arc's ERC-8004 Identity Registry. Every round, the executor records the decision here — who voted what, on which
 * asset, and Chainlink's price at that moment. When the decision is carried out, XorrDelegation (and only it) reports
 * the fill: what the owner paid and what they received. After `HORIZON`, ANYONE can `settle` the decision: this
 * contract reads Chainlink again and measures the decision's edge in basis points —
 *
 *   - a filled buy:  (Chainlink value now of what the owner received − USDC paid) / USDC paid
 *   - a filled sale: (USDC received − Chainlink value now of what was sold) / that value
 *   - a round that did not trade: Chainlink's move on the asset since the vote (for a buy proposal; inverted for a sale)
 *
 * — and writes it to Arc's ERC-8004 Reputation Registry for every seat that voted: `+edge` for a yes, `−edge` for a no
 * or a veto (a seat that said no to a trade that would have lost was right), nothing for an abstention. The value is
 * in hundredths of a percent (`valueDecimals = 2`, so it reads as bps), tagged `tradeEdge` / `xorr-council`, with the
 * decision id as the feedback hash. Read it with `getSummary(agentId, [this], "tradeEdge", "xorr-council")`.
 *
 * What the executor can and cannot do: it records the votes (it is the one running the seats), but it cannot make a
 * trade look better than it was — the fill comes from the delegation, and both prices come from Chainlink.
 *
 * Owner powers: set the delegation once, set which addresses may record, and set which ERC-8004 agent sits in each
 * seat. ERC-8004 refuses feedback from an agent's owner or operator, so this contract refuses a seat it controls.
 * Holds no funds.
 */
contract XorrCouncil is Ownable2Step {
    enum Vote {
        Abstain,
        Yes,
        No,
        Veto
    }

    enum Status {
        None,
        Recorded,
        Filled,
        Settled
    }

    struct Decision {
        address owner;
        address asset;
        uint40 recordedAt;
        uint40 filledAt;
        Status status;
        bool isBuy;
        bool approved;
        uint8 seatCount;
        uint64 votes; // 8 bits per seat
        uint128 amountIn;
        uint128 received;
        uint256 priceAtVote; // Chainlink USD price of `asset`, 18 decimals
        int32 edgeBps;
    }

    uint8 public constant MAX_SEATS = 8;
    int256 public constant EDGE_CLAMP = 10_000;
    string public constant TAG_EDGE = "tradeEdge";
    string public constant TAG_SOURCE = "xorr-council";

    IIdentityRegistry8004 public immutable identity;
    IReputationRegistry8004 public immutable reputation;
    IXorrGuardReader public immutable guard;
    address public immutable usdc;
    /// @notice Seconds after the vote (or the fill) before a decision can be settled.
    uint256 public immutable HORIZON;

    address public delegation;
    mapping(address => bool) public isRecorder;
    /// @dev seat index => ERC-8004 agentId + 1 (0 = empty seat)
    mapping(uint8 => uint256) private _seatAgentPlusOne;
    mapping(bytes32 => Decision) private _decisions;
    /// @dev seat => settled votes, and the running sum of their signed edge (bps)
    mapping(uint8 => uint64) public seatScored;
    mapping(uint8 => int256) public seatEdgeSum;

    event DelegationSet(address indexed delegation);
    event RecorderSet(address indexed recorder, bool allowed);
    event SeatSet(uint8 indexed seat, uint256 indexed agentId);
    event DecisionRecorded(
        bytes32 indexed id, address indexed owner, address indexed asset, bool isBuy, bool approved, uint8[] votes, uint256 priceAtVote
    );
    event DecisionFilled(bytes32 indexed id, address indexed agent, uint256 amountIn, uint256 received);
    event DecisionSettled(bytes32 indexed id, int256 edgeBps, bool filled);
    event SeatFeedback(bytes32 indexed id, uint8 indexed seat, uint256 indexed agentId, int128 value, bool written);

    error NotRecorder(address caller);
    error NotDelegation(address caller);
    error AlreadyRecorded(bytes32 id);
    error WrongStatus(bytes32 id, Status status);
    error OwnerMismatch(bytes32 id);
    error AssetMismatch(bytes32 id);
    error TooEarly(bytes32 id, uint256 readyAt);
    error BadVotes();
    error SelfControlledSeat(uint256 agentId);
    error DelegationAlreadySet();
    error RenounceDisabled();

    constructor(address identity_, address reputation_, address guard_, address usdc_, uint256 horizon, address initialOwner)
        Ownable(initialOwner)
    {
        require(identity_ != address(0) && reputation_ != address(0) && guard_ != address(0) && usdc_ != address(0), "zero");
        require(horizon >= 60 && horizon <= 30 days, "horizon");
        identity = IIdentityRegistry8004(identity_);
        reputation = IReputationRegistry8004(reputation_);
        guard = IXorrGuardReader(guard_);
        usdc = usdc_;
        HORIZON = horizon;
    }

    // ─── Owner ───────────────────────────────────────────────────────────────

    function setDelegation(address delegation_) external onlyOwner {
        if (delegation != address(0)) revert DelegationAlreadySet();
        require(delegation_ != address(0), "zero");
        delegation = delegation_;
        emit DelegationSet(delegation_);
    }

    function setRecorder(address recorder, bool allowed) external onlyOwner {
        isRecorder[recorder] = allowed;
        emit RecorderSet(recorder, allowed);
    }

    function setSeat(uint8 seat, uint256 agentId) external onlyOwner {
        require(seat < MAX_SEATS, "seat");
        identity.ownerOf(agentId); // reverts for an agent that does not exist
        if (identity.isAuthorizedOrOwner(address(this), agentId)) revert SelfControlledSeat(agentId);
        _seatAgentPlusOne[seat] = agentId + 1;
        emit SeatSet(seat, agentId);
    }

    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ─── The round ───────────────────────────────────────────────────────────

    /**
     * @notice Record a council round: the asset, the side, whether it was approved, and each seat's vote.
     * @param votes One entry per seat, in seat order: 0 abstain, 1 yes, 2 no, 3 veto.
     */
    function recordDecision(bytes32 id, address owner, address asset, bool isBuy, bool approved, uint8[] calldata votes)
        external
    {
        if (!isRecorder[msg.sender]) revert NotRecorder(msg.sender);
        if (_decisions[id].status != Status.None) revert AlreadyRecorded(id);
        if (votes.length == 0 || votes.length > MAX_SEATS || id == bytes32(0)) revert BadVotes();
        require(asset != address(0) && asset != usdc && owner != address(0), "asset");
        uint64 packed;
        for (uint256 i = 0; i < votes.length; i++) {
            if (votes[i] > uint8(Vote.Veto)) revert BadVotes();
            packed |= uint64(votes[i]) << uint64(8 * i);
        }
        (uint256 p,) = guard.priceOf(asset);
        Decision storage d = _decisions[id];
        d.owner = owner;
        d.asset = asset;
        d.recordedAt = uint40(block.timestamp);
        d.status = Status.Recorded;
        d.isBuy = isBuy;
        d.approved = approved;
        d.seatCount = uint8(votes.length);
        d.votes = packed;
        d.priceAtVote = p;
        emit DecisionRecorded(id, owner, asset, isBuy, approved, votes, p);
    }

    /// @notice XorrDelegation reports a fill for a recorded decision. Only the delegation can.
    function onFill(
        bytes32 id,
        address owner,
        address agent,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 received
    ) external {
        if (msg.sender != delegation || delegation == address(0)) revert NotDelegation(msg.sender);
        Decision storage d = _decisions[id];
        if (d.status != Status.Recorded) revert WrongStatus(id, d.status);
        if (d.owner != owner) revert OwnerMismatch(id);
        bool isBuy = tokenIn == usdc;
        address asset = isBuy ? tokenOut : tokenIn;
        if (asset != d.asset || isBuy != d.isBuy) revert AssetMismatch(id);
        d.status = Status.Filled;
        d.filledAt = uint40(block.timestamp);
        d.amountIn = uint128(amountIn);
        d.received = uint128(received);
        emit DecisionFilled(id, agent, amountIn, received);
    }

    /// @notice Measure a decision against Chainlink after the horizon and write each seat's ERC-8004 feedback.
    function settle(bytes32 id) external returns (int256 edge) {
        Decision storage d = _decisions[id];
        if (d.status != Status.Recorded && d.status != Status.Filled) revert WrongStatus(id, d.status);
        bool filled = d.status == Status.Filled;
        uint256 readyAt = uint256(filled ? d.filledAt : d.recordedAt) + HORIZON;
        if (block.timestamp < readyAt) revert TooEarly(id, readyAt);

        if (filled && d.isBuy) {
            uint256 valueNow = guard.quote(d.asset, usdc, d.received);
            edge = (int256(valueNow) - int256(uint256(d.amountIn))) * 10_000 / int256(uint256(d.amountIn));
        } else if (filled) {
            uint256 valueNow = guard.quote(d.asset, usdc, d.amountIn);
            edge = valueNow == 0 ? EDGE_CLAMP : (int256(uint256(d.received)) - int256(valueNow)) * 10_000 / int256(valueNow);
        } else {
            (uint256 pNow,) = guard.priceOf(d.asset);
            edge = (int256(pNow) - int256(d.priceAtVote)) * 10_000 / int256(d.priceAtVote);
            if (!d.isBuy) edge = -edge;
        }
        if (edge > EDGE_CLAMP) edge = EDGE_CLAMP;
        if (edge < -EDGE_CLAMP) edge = -EDGE_CLAMP;

        d.status = Status.Settled;
        d.edgeBps = int32(edge);
        emit DecisionSettled(id, edge, filled);

        _writeFeedback(id, d.seatCount, d.votes, edge);
    }

    function _writeFeedback(bytes32 id, uint8 seatCount, uint64 votes, int256 edge) private {
        for (uint8 s = 0; s < seatCount; s++) {
            Vote v = Vote(uint8(votes >> (8 * s)));
            if (v == Vote.Abstain) continue;
            int128 signed = int128(v == Vote.Yes ? edge : -edge);
            seatScored[s] += 1;
            seatEdgeSum[s] += signed;
            uint256 plusOne = _seatAgentPlusOne[s];
            if (plusOne == 0) continue;
            _giveFeedback(id, s, plusOne - 1, signed);
        }
    }

    function _giveFeedback(bytes32 id, uint8 seat, uint256 agentId, int128 value) private {
        bool written;
        try reputation.giveFeedback(agentId, value, 2, TAG_EDGE, TAG_SOURCE, "", "", id) {
            written = true;
        } catch {}
        emit SeatFeedback(id, seat, agentId, value, written);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function decisionOf(bytes32 id) external view returns (Decision memory) {
        return _decisions[id];
    }

    function votesOf(bytes32 id) external view returns (uint8[] memory votes) {
        Decision memory d = _decisions[id];
        votes = new uint8[](d.seatCount);
        for (uint8 s = 0; s < d.seatCount; s++) votes[s] = uint8(d.votes >> (8 * s));
    }

    function seatAgent(uint8 seat) external view returns (bool set, uint256 agentId) {
        uint256 plusOne = _seatAgentPlusOne[seat];
        return (plusOne != 0, plusOne == 0 ? 0 : plusOne - 1);
    }

    /// @notice A seat's average signed edge in bps over its settled votes (0 with none).
    function seatAverageEdge(uint8 seat) external view returns (int256) {
        uint64 n = seatScored[seat];
        return n == 0 ? int256(0) : seatEdgeSum[seat] / int256(uint256(n));
    }
}
