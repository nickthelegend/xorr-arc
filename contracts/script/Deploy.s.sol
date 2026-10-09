// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {XorrDelegation} from "../src/XorrDelegation.sol";
import {XorrPriceGuard} from "../src/XorrPriceGuard.sol";
import {XorrVenueRegistry} from "../src/XorrVenueRegistry.sol";
import {XorrCouncil} from "../src/XorrCouncil.sol";
import {XorrStopReceiver} from "../src/ccip/XorrStopReceiver.sol";
import {XorrMirrorFeed} from "../src/testnet/XorrMirrorFeed.sol";
import {XorrTestToken} from "../src/testnet/XorrTestToken.sol";
import {IIdentityRegistry8004} from "../src/interfaces/IIdentityRegistry8004.sol";
import {Artifacts} from "./lib/Artifacts.sol";

interface IERC20Min {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IV2Router {
    function addLiquidity(address, address, uint256, uint256, uint256, uint256, address, uint256)
        external
        returns (uint256, uint256, uint256);
}

/**
 * XORR on Arc — one script, both networks. The network is the chain it runs against:
 *
 *   chain 5042    (Arc mainnet, or a local fork of it): real Chainlink feeds, real WETH / cirBTC / EURC, and Uniswap v3's
 *                 SwapRouter02 as the only venue. Nothing is seeded; the daily-cap ceiling is tiny.
 *   chain 5042002 (Arc testnet, or a fork of it): no Uniswap and no Chainlink feeds exist there, so it also deploys
 *                 Uniswap v2 from published bytecode, XORR test tokens (xWETH, xcirBTC), mirror feeds of Chainlink's
 *                 mainnet answers (MIRROR_* env, printed by scripts/mainnet-prices.sh and exported by scripts/deploy.sh), and seeds small pools.
 *
 * Env: DEPLOYER_PRIVATE_KEY (required), XORR_EXECUTOR (the executor's address: council recorder, mirror poster),
 *      DEPLOYMENT_OUT (default ../deployments/arc-<network>.json), DAILY_CAP_CEILING (USDC units),
 *      SEED_USDC (testnet: USDC per pool, default 5 USDC), MIRROR_ETH / MIRROR_BTC / MIRROR_EURC / MIRROR_USDC
 *      (testnet: 8-decimal answers) and MIRROR_AT (their timestamp).
 */
contract Deploy is Script {
    // Shared by both networks
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant MEMO = 0x5294E9927c3306DcBaDb03fe70b92e01cCede505;

    // Arc mainnet
    address constant M_EURC = 0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1;
    address constant M_WETH = 0x128cC466B61f542da60c70e3aA11c10e19B84EDB;
    address constant M_CBTC = 0x171A4217b86A807A64eB94757Db6849fb4bDbAA0;
    address constant M_USYC = 0x8a5D989Bbb96929F689B0200f435f53dA42bF490;
    address constant M_FEED_USDC = 0x84EA90AC252Dc437031461836DB5164219147905;
    address constant M_FEED_EURC = 0x361b95c10b76Ca3f35C686d423e43A951755Bf23;
    address constant M_FEED_ETH = 0x50FCDD99D6762D1C170DC6A9111db944AEE6D364;
    address constant M_FEED_BTC = 0xa109B535C70C8Be9995be64Bb6751AcDB27e03De;
    address constant M_SWAP_ROUTER02 = 0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77;
    address constant M_QUOTER_V2 = 0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468;
    address constant M_IDENTITY = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address constant M_REPUTATION = 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63;
    address constant M_CCIP_ROUTER = 0xB79791184973589c38e114D43Eb8E4588C283A18;

    // Arc testnet
    address constant T_EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address constant T_USYC = 0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C;
    address constant T_IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant T_REPUTATION = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    address constant T_CCIP_ROUTER = 0xdE4E7FED43FAC37EB21aA0643d9852f75332eab8;

    uint32 constant MAX_AGE = 25 hours; // 24 h heartbeat + 1 h grace

    struct Out {
        string network;
        address deployer;
        address executor;
        address weth;
        address cbtc;
        address eurc;
        address usyc;
        address guard;
        address registry;
        address council;
        address delegation;
        address stopReceiver;
        address venue;
        address quoter;
        address v2Factory;
        address identity;
        address reputation;
        address ccipRouter;
        uint256[5] seats;
        address[4] feeds; // usdc, eurc, weth, cbtc
    }

    string[5] SEAT_NAMES = ["Price Desk", "Risk Keeper", "Trend Reader", "Peg Desk", "Strategist"];
    string[5] SEAT_ROLES = [
        "Is Chainlink fresh on Arc, and does the Uniswap fill agree with it?",
        "Does the trade fit the on-chain permission: cap left today, expiry, position limit?",
        "Which way have Chainlink's rounds been moving?",
        "Are USDC and EURC on their pegs, and is cirBTC fully reserved?",
        "Weighs the desks and decides split rounds; cannot veto."
    ];

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        Out memory o;
        o.deployer = vm.addr(pk);
        o.executor = vm.envOr("XORR_EXECUTOR", o.deployer);
        bool mainnet = block.chainid == 5042;
        require(mainnet || block.chainid == 5042002, "not an Arc chain");
        o.network = mainnet ? "arc-mainnet" : "arc-testnet";
        o.identity = mainnet ? M_IDENTITY : T_IDENTITY;
        o.reputation = mainnet ? M_REPUTATION : T_REPUTATION;
        o.ccipRouter = mainnet ? M_CCIP_ROUTER : T_CCIP_ROUTER;
        o.usyc = mainnet ? M_USYC : T_USYC;
        uint256 ceiling = vm.envOr("DAILY_CAP_CEILING", mainnet ? uint256(250e6) : uint256(10_000e6));

        vm.startBroadcast(pk);

        o.guard = address(new XorrPriceGuard(o.deployer));
        if (mainnet) {
            o.weth = M_WETH;
            o.cbtc = M_CBTC;
            o.eurc = M_EURC;
            o.feeds = [M_FEED_USDC, M_FEED_EURC, M_FEED_ETH, M_FEED_BTC];
            o.venue = M_SWAP_ROUTER02;
            o.quoter = M_QUOTER_V2;
        } else {
            _testnetMarket(o);
        }
        XorrPriceGuard g = XorrPriceGuard(o.guard);
        g.listFeed(USDC, o.feeds[0], MAX_AGE);
        g.listFeed(o.eurc, o.feeds[1], MAX_AGE);
        g.listFeed(o.weth, o.feeds[2], MAX_AGE);
        g.listFeed(o.cbtc, o.feeds[3], MAX_AGE);

        address[] memory venues = new address[](1);
        venues[0] = o.venue;
        string[] memory labels = new string[](1);
        labels[0] = mainnet ? "Uniswap v3 SwapRouter02 (Arc mainnet)" : "Uniswap v2 Router02 (XORR-deployed, testnet)";
        o.registry = address(new XorrVenueRegistry(o.deployer, venues, labels));

        uint256 horizon = vm.envOr("COUNCIL_HORIZON", uint256(1 hours));
        XorrCouncil council = new XorrCouncil(o.identity, o.reputation, o.guard, USDC, horizon, o.deployer);
        o.council = address(council);
        o.delegation = address(new XorrDelegation(USDC, o.guard, o.registry, o.council, ceiling));
        council.setDelegation(o.delegation);
        council.setRecorder(o.executor, true);

        // The council's five seats, each an ERC-8004 agent registered by the deployer (never by the council, which
        // ERC-8004 would then refuse to accept feedback from).
        for (uint8 i = 0; i < 5; i++) {
            uint256 id = IIdentityRegistry8004(o.identity).register(_agentUri(i, o.network));
            o.seats[i] = id;
            council.setSeat(i, id);
        }

        o.stopReceiver = address(new XorrStopReceiver(o.ccipRouter, o.delegation, o.deployer));

        vm.stopBroadcast();
        _write(o, ceiling);
    }

    /// @dev Arc testnet: XORR's own market, labelled as such everywhere.
    function _testnetMarket(Out memory o) internal {
        o.eurc = T_EURC;
        XorrTestToken w = new XorrTestToken("XORR Test WETH", "xWETH", 18, 0.05e18, o.deployer);
        XorrTestToken b = new XorrTestToken("XORR Test cirBTC", "xcirBTC", 8, 0.001e8, o.deployer);
        o.weth = address(w);
        o.cbtc = address(b);

        uint256 at = vm.envOr("MIRROR_AT", block.timestamp);
        int256 pEth = int256(vm.envOr("MIRROR_ETH", uint256(2_500e8)));
        int256 pBtc = int256(vm.envOr("MIRROR_BTC", uint256(80_000e8)));
        int256 pEurc = int256(vm.envOr("MIRROR_EURC", uint256(1.12e8)));
        int256 pUsdc = int256(vm.envOr("MIRROR_USDC", uint256(1e8)));
        XorrMirrorFeed fu = new XorrMirrorFeed(8, "USDC / USD", M_FEED_USDC, o.deployer);
        XorrMirrorFeed fe = new XorrMirrorFeed(8, "EURC / USD", M_FEED_EURC, o.deployer);
        XorrMirrorFeed fw = new XorrMirrorFeed(8, "ETH / USD", M_FEED_ETH, o.deployer);
        XorrMirrorFeed fb = new XorrMirrorFeed(8, "BTC / USD", M_FEED_BTC, o.deployer);
        fu.post(pUsdc, at);
        fe.post(pEurc, at);
        fw.post(pEth, at);
        fb.post(pBtc, at);
        if (o.executor != o.deployer) {
            fu.setPoster(o.executor);
            fe.setPoster(o.executor);
            fw.setPoster(o.executor);
            fb.setPoster(o.executor);
        }
        o.feeds = [address(fu), address(fe), address(fw), address(fb)];

        (address factory, address router) = Artifacts.deployUniswapV2(o.deployer, address(w));
        o.v2Factory = factory;
        o.venue = router;

        // Seed small pools at the mirrored prices. USDC/EURC only if the deployer holds testnet EURC (faucet.circle.com).
        uint256 seed = vm.envOr("SEED_USDC", uint256(5e6));
        uint256 wAmt = seed * 1e12 * 1e8 / uint256(pEth); // USDC(6) → WETH(18) at pEth (8 dec)
        uint256 bAmt = seed * 1e2 * 1e8 / uint256(pBtc); // USDC(6) → BTC(8)
        w.mint(o.deployer, wAmt);
        b.mint(o.deployer, bAmt);
        IERC20Min(USDC).approve(router, 3 * seed);
        w.approve(router, wAmt);
        b.approve(router, bAmt);
        IV2Router(router).addLiquidity(USDC, address(w), seed, wAmt, 0, 0, o.deployer, block.timestamp + 600);
        IV2Router(router).addLiquidity(USDC, address(b), seed, bAmt, 0, 0, o.deployer, block.timestamp + 600);
        uint256 eAmt = seed * 1e8 / uint256(pEurc);
        if (IERC20Min(T_EURC).balanceOf(o.deployer) >= eAmt) {
            IERC20Min(T_EURC).approve(router, eAmt);
            IV2Router(router).addLiquidity(USDC, T_EURC, seed, eAmt, 0, 0, o.deployer, block.timestamp + 600);
        } else {
            console2.log("No testnet EURC on the deployer: USDC/EURC pool not seeded (get EURC at faucet.circle.com)");
        }
    }

    function _agentUri(uint8 i, string memory network) internal view returns (string memory) {
        return string.concat(
            "data:application/json,{\"type\":\"https://eips.ethereum.org/EIPS/eip-8004#registration-v1\",\"name\":\"XORR ",
            SEAT_NAMES[i],
            "\",\"description\":\"",
            SEAT_ROLES[i],
            " A seat on XORR's trading council on ",
            network,
            ". Reputation: tradeEdge (bps) from XorrCouncil.\",\"services\":[]}"
        );
    }

    function _write(Out memory o, uint256 ceiling) internal {
        string memory k = "d";
        vm.serializeString(k, "network", o.network);
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "deployer", o.deployer);
        vm.serializeAddress(k, "executor", o.executor);
        vm.serializeAddress(k, "usdc", USDC);
        vm.serializeAddress(k, "eurc", o.eurc);
        vm.serializeAddress(k, "weth", o.weth);
        vm.serializeAddress(k, "cbtc", o.cbtc);
        vm.serializeAddress(k, "usyc", o.usyc);
        vm.serializeAddress(k, "memo", MEMO);
        vm.serializeAddress(k, "priceGuard", o.guard);
        vm.serializeAddress(k, "venueRegistry", o.registry);
        vm.serializeAddress(k, "council", o.council);
        vm.serializeAddress(k, "delegation", o.delegation);
        vm.serializeAddress(k, "stopReceiver", o.stopReceiver);
        vm.serializeAddress(k, "venue", o.venue);
        vm.serializeString(k, "venueKind", block.chainid == 5042 ? "uniswap-v3" : "uniswap-v2");
        vm.serializeAddress(k, "quoter", o.quoter);
        vm.serializeAddress(k, "v2Factory", o.v2Factory);
        vm.serializeAddress(k, "identityRegistry", o.identity);
        vm.serializeAddress(k, "reputationRegistry", o.reputation);
        vm.serializeAddress(k, "ccipRouter", o.ccipRouter);
        vm.serializeUint(k, "dailyCapCeiling", ceiling);
        vm.serializeBool(k, "mirrorFeeds", block.chainid != 5042);
        uint256[] memory seats = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) seats[i] = o.seats[i];
        vm.serializeUint(k, "seatAgentIds", seats);
        address[] memory feeds = new address[](4);
        for (uint256 i = 0; i < 4; i++) feeds[i] = o.feeds[i];
        vm.serializeAddress(k, "feeds", feeds);
        string memory json = vm.serializeUint(k, "deployedAtBlock", block.number);
        string memory path = vm.envOr(
            "DEPLOYMENT_OUT", string.concat(vm.projectRoot(), "/../deployments/", o.network, ".json")
        );
        vm.writeJson(json, path);
        console2.log("XORR deployed to", o.network, "->", path);
        console2.log("delegation", o.delegation);
    }
}
