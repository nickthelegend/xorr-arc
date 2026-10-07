// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev A plain ERC-20 with a public mint, for unit tests only.
contract MockERC20 is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Chainlink AggregatorV3 stand-in whose answer and timestamp the test sets. Unit tests only; fork tests read the
///      real Arc feeds.
contract MockAggregator {
    uint8 public immutable decimals;
    int256 public answer;
    uint256 public updatedAt;
    uint80 public roundId = 1;
    uint80 public answeredInRound = 1;

    constructor(uint8 d, int256 a) {
        decimals = d;
        answer = a;
        updatedAt = block.timestamp;
    }

    function set(int256 a, uint256 at) external {
        answer = a;
        updatedAt = at;
        roundId++;
        answeredInRound = roundId;
    }

    function setRound(uint80 r, uint80 answered) external {
        roundId = r;
        answeredInRound = answered;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, answeredInRound);
    }
}

/**
 * @dev A venue that pays whoever its calldata names, at a rate the test sets, and can be told to take less than it was
 *      approved for. This is the freedom a real router gives the one who writes its calldata — here, the agent.
 */
contract MockVenue {
    uint256 public rateNum = 1;
    uint256 public rateDen = 1;
    uint256 public takeBps = 10_000;

    function setRate(uint256 num, uint256 den) external {
        rateNum = num;
        rateDen = den;
    }

    function setTakeBps(uint256 bps) external {
        takeBps = bps;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, address to) external returns (uint256 out) {
        uint256 take = amountIn * takeBps / 10_000;
        MockERC20(tokenIn).transferFrom(msg.sender, address(this), take);
        out = take * rateNum / rateDen;
        MockERC20(tokenOut).mint(to, out);
    }

    /// @dev Tries to reach back into the delegation mid-trade.
    function reenter(address target, bytes calldata data) external {
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }
    }
}

contract PickyVenue {
    error ReturnAmountIsNotEnough(uint256 got);

    function swap(uint256) external pure {
        revert ReturnAmountIsNotEnough(24_768_044);
    }
}

contract SilentVenue {
    function swap(uint256) external pure {
        revert();
    }
}
