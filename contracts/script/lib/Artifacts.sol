// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";

/// @notice Deploys Uniswap v2 from its *published* bytecode, byte for byte, rather than recompiling it: the npm build
///         artifacts Uniswap shipped in uniswap v2-core 1.0.1 and v2-periphery 1.1.0-beta.0 (npm). The pair's
///         init code hash is therefore the canonical 0x96e8ac42…845f, and the explorer shows Uniswap's own code.
library Artifacts {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    string internal constant V2_FACTORY = "node_modules/@uniswap/v2-core/build/UniswapV2Factory.json";
    string internal constant V2_PAIR = "node_modules/@uniswap/v2-core/build/UniswapV2Pair.json";
    string internal constant V2_ROUTER02 = "node_modules/@uniswap/v2-periphery/build/UniswapV2Router02.json";

    bytes32 internal constant UNISWAP_V2_PAIR_INIT_CODE_HASH =
        0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f;

    error DeployFailed(string what);

    /// @dev Creation code from a Waffle-style artifact (`bytecode` is a hex string).
    function uniswap(string memory path) internal view returns (bytes memory) {
        return vm.parseJsonBytes(vm.readFile(string.concat(vm.projectRoot(), "/", path)), ".bytecode");
    }

    function v2PairInitCodeHash() internal view returns (bytes32) {
        return keccak256(uniswap(V2_PAIR));
    }

    function create(bytes memory initCode, string memory what) internal returns (address deployed) {
        assembly ("memory-safe") {
            deployed := create(0, add(initCode, 0x20), mload(initCode))
        }
        if (deployed == address(0)) revert DeployFailed(what);
    }

    /// @dev Factory(feeToSetter) then Router02(factory, WETH). Router02's WETH is only used by its *ETH methods, which
    ///      XORR never calls (Arc's gas token is USDC, there is no wrapped native to route through); it is given the
    ///      wrapped-ETH token so the router is well-formed.
    function deployUniswapV2(address feeToSetter, address weth) internal returns (address factory, address router) {
        factory = create(abi.encodePacked(uniswap(V2_FACTORY), abi.encode(feeToSetter)), "UniswapV2Factory");
        router = create(abi.encodePacked(uniswap(V2_ROUTER02), abi.encode(factory, weth)), "UniswapV2Router02");
    }
}
