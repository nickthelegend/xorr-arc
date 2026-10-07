// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

/**
 * @title XorrPriceGuard
 * @notice Chainlink Data Feeds on Arc, as the floor under every XORR trade.
 *
 * Each tradable token is mapped to its Chainlink USD feed on Arc (USDC/USD, EURC/USD, ETH/USD for WETH, BTC/USD for
 * cirBTC). `quote(tokenIn, tokenOut, amountIn)` is what `amountIn` of `tokenIn` is worth in `tokenOut` at Chainlink's
 * prices. XorrDelegation refuses any fill that delivers the owner less than that, less the owner's own slippage
 * limit — so the price a trade fills at is bounded by Chainlink, not by whatever floor the agent's key wrote.
 *
 * Every read is checked: a positive answer, a round that was actually answered, and an `updatedAt` no older than the
 * feed's own heartbeat plus a grace period. A stale or broken feed makes `quote` revert, and with it the trade.
 *
 * Owner powers (documented, minimal): list a token's feed. The first listing of a token is immediate (deployment);
 * CHANGING or removing a listed feed is timelocked for `FEED_DELAY` (24 h), announced on chain first, so no feed
 * under a live permission can be swapped under it without a day's notice. Ownership is two-step and cannot be
 * renounced. The contract holds nothing.
 */
contract XorrPriceGuard is Ownable2Step {
    struct Feed {
        AggregatorV3Interface aggregator;
        /// @dev Max age of a round, in seconds: the feed's heartbeat plus a grace period.
        uint32 maxAge;
        uint8 feedDecimals;
        uint8 tokenDecimals;
    }

    struct Pending {
        address aggregator;
        uint32 maxAge;
        uint64 readyAt;
    }

    uint256 public constant FEED_DELAY = 1 days;
    /// @dev No heartbeat on Arc is longer than a day; 26 h allows for a late round without accepting a dead feed.
    uint32 public constant MAX_MAX_AGE = 26 hours;

    mapping(address token => Feed) private _feeds;
    mapping(address token => Pending) public pending;
    mapping(address token => bool) private _everListed;
    address[] private _tokens;

    event FeedListed(address indexed token, address indexed aggregator, uint32 maxAge);
    event FeedChangeQueued(address indexed token, address indexed aggregator, uint32 maxAge, uint64 readyAt);
    event FeedChangeCancelled(address indexed token);

    error NoFeed(address token);
    error StalePrice(address token, uint256 updatedAt, uint256 maxAge);
    error BadPrice(address token, int256 answer);
    error IncompleteRound(address token);
    error AlreadyListed(address token);
    error NotQueued(address token);
    error TooEarly(address token, uint64 readyAt);
    error BadMaxAge(uint32 maxAge);
    error RenounceDisabled();

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ─── Owner ───────────────────────────────────────────────────────────────

    /// @notice List a token that has no feed yet. Immediate, because nothing can depend on an unlisted token.
    function listFeed(address token, address aggregator, uint32 maxAge) external onlyOwner {
        if (address(_feeds[token].aggregator) != address(0)) revert AlreadyListed(token);
        _set(token, aggregator, maxAge);
        if (!_everListed[token]) {
            _everListed[token] = true;
            _tokens.push(token);
        }
    }

    /// @notice Announce a change to a listed token's feed (or removal, with aggregator = 0). Applies after FEED_DELAY.
    function queueFeedChange(address token, address aggregator, uint32 maxAge) external onlyOwner {
        if (address(_feeds[token].aggregator) == address(0)) revert NoFeed(token);
        if (aggregator != address(0) && (maxAge == 0 || maxAge > MAX_MAX_AGE)) revert BadMaxAge(maxAge);
        uint64 readyAt = uint64(block.timestamp + FEED_DELAY);
        pending[token] = Pending(aggregator, maxAge, readyAt);
        emit FeedChangeQueued(token, aggregator, maxAge, readyAt);
    }

    function cancelFeedChange(address token) external onlyOwner {
        if (pending[token].readyAt == 0) revert NotQueued(token);
        delete pending[token];
        emit FeedChangeCancelled(token);
    }

    /// @notice Apply a queued change once its delay has passed. Anyone may apply it; only the owner may queue it.
    function applyFeedChange(address token) external {
        Pending memory p = pending[token];
        if (p.readyAt == 0) revert NotQueued(token);
        if (block.timestamp < p.readyAt) revert TooEarly(token, p.readyAt);
        delete pending[token];
        if (p.aggregator == address(0)) {
            delete _feeds[token];
            emit FeedListed(token, address(0), 0);
        } else {
            _set(token, p.aggregator, p.maxAge);
        }
    }

    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ─── Reads ───────────────────────────────────────────────────────────────

    /// @notice Chainlink's USD price of `token`, scaled to 18 decimals, after every freshness check.
    function priceOf(address token) public view returns (uint256 price18, uint256 updatedAt) {
        Feed memory f = _feeds[token];
        if (address(f.aggregator) == address(0)) revert NoFeed(token);
        (uint80 roundId, int256 answer,, uint256 updated, uint80 answeredInRound) = f.aggregator.latestRoundData();
        if (answer <= 0) revert BadPrice(token, answer);
        if (updated == 0 || answeredInRound < roundId) revert IncompleteRound(token);
        if (updated > block.timestamp || block.timestamp - updated > f.maxAge) revert StalePrice(token, updated, f.maxAge);
        price18 = uint256(answer) * 10 ** (18 - f.feedDecimals);
        updatedAt = updated;
    }

    /// @notice What `amountIn` of `tokenIn` is worth in `tokenOut`, at Chainlink's prices. Reverts on any bad feed.
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256 amountOut) {
        (uint256 pIn,) = priceOf(tokenIn);
        (uint256 pOut,) = priceOf(tokenOut);
        uint8 dIn = _feeds[tokenIn].tokenDecimals;
        uint8 dOut = _feeds[tokenOut].tokenDecimals;
        // amountOut = amountIn * pIn / pOut, rescaled from tokenIn's decimals to tokenOut's.
        // Max 38 digits for amountIn (1e20 of an 18-dec token) * 1e30 price → fits in 2^256.
        uint256 value = amountIn * pIn;
        if (dOut >= dIn) amountOut = value * 10 ** (dOut - dIn) / pOut;
        else amountOut = value / pOut / 10 ** (dIn - dOut);
    }

    function feedOf(address token)
        external
        view
        returns (address aggregator, uint32 maxAge, uint8 feedDecimals, uint8 tokenDecimals)
    {
        Feed memory f = _feeds[token];
        return (address(f.aggregator), f.maxAge, f.feedDecimals, f.tokenDecimals);
    }

    /// @notice Every token ever listed, including any whose feed was later removed (check `hasFeed`).
    function hasFeed(address token) external view returns (bool) {
        return address(_feeds[token].aggregator) != address(0);
    }

    function tokens() external view returns (address[] memory) {
        return _tokens;
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    function _set(address token, address aggregator, uint32 maxAge) private {
        if (maxAge == 0 || maxAge > MAX_MAX_AGE) revert BadMaxAge(maxAge);
        uint8 fd = AggregatorV3Interface(aggregator).decimals();
        require(fd <= 18, "feed decimals");
        uint8 td = IERC20Decimals(token).decimals();
        require(td <= 18, "token decimals");
        _feeds[token] = Feed(AggregatorV3Interface(aggregator), maxAge, fd, td);
        emit FeedListed(token, aggregator, maxAge);
    }
}
