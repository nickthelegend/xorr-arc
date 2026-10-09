// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Stand-in for Arc's USDC ERC-20 (0x3600…, 6 decimals) on a fork run with stock Foundry, which cannot execute Arc's
///      native-USDC precompile and so cannot move USDC. Stateless (no constructor) so scripts/e2e-fork.mjs can
///      `anvil_setCode` its runtime bytecode over the real address. Open mint: fork rehearsals only, never deployed.
contract ForkUsdcShim is ERC20("USDC", "USDC") {
    function name() public pure override returns (string memory) {
        return "USDC";
    }

    function symbol() public pure override returns (string memory) {
        return "USDC";
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
