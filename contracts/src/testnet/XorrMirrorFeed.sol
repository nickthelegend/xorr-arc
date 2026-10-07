// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * @title XorrMirrorFeed (TESTNET ONLY)
 * @notice Arc testnet has no Chainlink Data Feeds. This aggregator mirrors one of Chainlink's Arc MAINNET feeds: XORR's
 *         keeper reads the mainnet feed and posts the same answer here, with the mainnet round's `updatedAt`. It speaks
 *         AggregatorV3Interface so XorrPriceGuard treats it exactly like the real feed it mirrors, staleness included.
 *         Its `description()` says "mirror of Chainlink mainnet" and the app labels it so. Never deployed on mainnet.
 */
contract XorrMirrorFeed {
    uint8 public immutable decimals;
    string public description;
    address public immutable source; // the Chainlink feed on Arc mainnet this mirrors
    address public poster;

    uint80 private _round;
    int256 private _answer;
    uint256 private _updatedAt;

    event Posted(uint80 indexed roundId, int256 answer, uint256 updatedAt);
    event PosterSet(address indexed poster);

    error NotPoster();
    error NotNewer();

    constructor(uint8 decimals_, string memory pair, address source_, address poster_) {
        decimals = decimals_;
        description = string.concat(pair, " (mirror of Chainlink Arc mainnet)");
        source = source_;
        poster = poster_;
    }

    function setPoster(address p) external {
        if (msg.sender != poster) revert NotPoster();
        poster = p;
        emit PosterSet(p);
    }

    /// @param updatedAt The mainnet round's own timestamp, so staleness here is staleness there.
    function post(int256 answer, uint256 updatedAt) external {
        if (msg.sender != poster) revert NotPoster();
        if (updatedAt <= _updatedAt || updatedAt > block.timestamp) revert NotNewer();
        _round++;
        _answer = answer;
        _updatedAt = updatedAt;
        emit Posted(_round, answer, updatedAt);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (_round, _answer, _updatedAt, _updatedAt, _round);
    }

    function latestAnswer() external view returns (int256) {
        return _answer;
    }

    function version() external pure returns (uint256) {
        return 4;
    }
}
