// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title XorrTestToken (TESTNET ONLY)
 * @notice Stand-ins for WETH and cirBTC on Arc testnet, where Uniswap and these assets' liquidity do not exist. Named
 *         "XORR Test …" so nobody mistakes them for the real thing. Anyone may mint a small amount per call (a faucet);
 *         the deployer mints the pool seed. Never deployed on mainnet, where XORR trades the real WETH and cirBTC.
 */
contract XorrTestToken is ERC20 {
    uint8 private immutable _dec;
    uint256 public immutable faucetAmount;
    address public immutable minter;

    constructor(string memory n, string memory s, uint8 d, uint256 faucetAmount_, address minter_) ERC20(n, s) {
        _dec = d;
        faucetAmount = faucetAmount_;
        minter = minter_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function faucet() external {
        _mint(msg.sender, faucetAmount);
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "minter");
        _mint(to, amount);
    }
}
