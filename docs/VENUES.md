# Where XORR can trade on Arc — venue research (2026-10-08)

Done before building, against docs.arc.io, Uniswap's own deployment registry (`Uniswap/contracts`, commit `a677c0d4`,
generated 2026-09-22), the Arc explorers' token lists, and live `eth_call`s on `https://rpc.mainnet.arc.io` (chain 5042)
and `https://rpc.testnet.arc.io` (chain 5042002). Numbers are what the chain returned on 2026-10-08 (~07:00 UTC).

## Verdict

**Arc mainnet has real venues with real liquidity: Uniswap v2, v3 and v4 are officially deployed**, and the v3 pools for
USDC/cirBTC, USDC/EURC and (thinly) USDC/WETH hold real money. So on mainnet XORR's agents trade on **Uniswap v3's
SwapRouter02**, inside the permission — no XORR-seeded pools. **Arc testnet has no Uniswap deployment**, so the
testnet build deploys Uniswap v2 from its published bytecode and seeds small XORR pools against XORR test tokens; the
testnet README and UI say so.

## Tradable assets on Arc mainnet (verified on chain)

| Asset | Address | Decimals | Chainlink feed on Arc |
|---|---|---|---|
| USDC (gas token, ERC-20 view) | `0x3600000000000000000000000000000000000000` | 6 | USDC/USD `0x84EA…7905` |
| EURC | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` | 6 | EURC/USD `0x361b…Bf23` (+ EUR/USD `0xDd5B…DE0D`) |
| WETH | `0x128cC466B61f542da60c70e3aA11c10e19B84EDB` | 18 | ETH/USD `0x50FC…D364` |
| cirBTC (Circle Wrapped Bitcoin) | `0x171A4217b86A807A64eB94757Db6849fb4bDbAA0` | 8 | BTC/USD `0xa109…03De`, cirBTC Proof of Reserve `0xEB08…11fc` |
| USYC (yield; allowlisted) | `0x8a5D989Bbb96929F689B0200f435f53dA42bF490` | 6 | USYC Oracle `0x4BC8…537A` (Hashnote) |
| LINK | `0x76a443768A5e3B8d1AED0105FC250877841Deb40` | 18 | LINK/USD `0xD376…8c3a` |
| PST, syrupUSDC, VIRTUAL | CCIP tokens on Arc (CCIP directory) | — | PSTUSDC/USDC and SYRUPUSDC/USDC exchange-rate feeds |

No Uniswap v3 pool was found for LINK, USYC, PST, syrupUSDC or VIRTUAL against USDC/EURC/WETH/cirBTC.

## DEXes on Arc mainnet

From Uniswap's registry (chainId 5042), each checked with `cast code`:

| Uniswap | Contract | Address |
|---|---|---|
| v3 | UniswapV3Factory | `0xf0db7b58379503491d857dB50AC9ece64c653918` |
| v3 | **SwapRouter02** (XORR's mainnet venue) | `0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77` (24,497 bytes; `factory()` = the v3 factory) |
| v3 | QuoterV2 | `0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468` |
| v2 | UniswapV2Factory / Router02 | `0x89e5DB8B5aA49aA85AC63f691524311AEB649eba` / `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` |
| v4 | PoolManager / V4Quoter / Universal Router | `0x8366a39CC670B4001A1121B8F6A443A643e40951` / `0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94` / `0x4fcA4a51Ab4F23A7447b3284fBd7D73289A89Fb1` |
| — | Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

Pools with liquidity (v3 `getPool` for fee tiers 100/500/3000/10000, v2 `getPair`; balances held by the pool):

| Pair | Pool | Fee | Holds | 10 USDC quote (QuoterV2) | vs Chainlink |
|---|---|---|---|---|---|
| USDC/cirBTC | `0x82916bee18fCEF517B26C72d7Cb5F13694E1dB41` | 0.01% | 6,024,646 USDC + 65.44 cirBTC | 0.00011991 cirBTC ($83,396) | BTC/USD $83,486 → 11 bps |
| USDC/EURC | `0x6fd5F2fb831940DcD61A98c5B3aCB7D8C6f3bFc1` | 0.05% | 9,439 USDC + 40,324 EURC | 8.9254 EURC ($1.1204) | EURC/USD $1.1214 → 9 bps |
| USDC/WETH | `0x964cFF2cCCB9059e83D507df348f070e5257A2e0` | 0.3% | 581.8 USDC + 0.79 WETH (thin) | 0.0038792 WETH ($2,578) | ETH/USD $2,573.55 → 17 bps |
| WETH/cirBTC | `0xBb505c923D0CE6364b6d1769Fd85Bd62B0C0E9C9` | 0.3% | dust | — | — |
| USDC/EURC (v2) | `0xfb778EacDd10603C521e8a343f4D37F3aFA41Fb7` | 0.3% | 0.19 USDC + 0.18 EURC (dust) | — | — |

Other fee tiers of these pairs exist but are empty or dust. v4 pools were not enumerated (v4 has no `getPool`; it would
need PoolManager `Initialize` logs). **Perps:** none found on Arc mainnet — not in Uniswap's registry, not in docs.arc.io
(its "Port an AMM" guide and App Kit Swap Kit cover spot only). XORR's perps desk is dropped on Arc rather than faked.

The WETH pool is thin (~$2.4k), so the council keeps WETH trades small and the Chainlink floor in XorrDelegation refuses
any fill that the pool's depth would push past the owner's slippage limit. cirBTC is the deep market on Arc.

## Arc testnet

Uniswap's registry has **no** Arc testnet deployment. The testnet explorer lists USDC, EURC
(`0x89B5…D72a`), cirBTC (`0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF`, no faucet), USYC (`0xe918…b86C`) and community
projects (XyloNet USDC-EURC LP, Swaparc, a Curve USDC/EURC gauge) whose liquidity and code were not audited here. No
Chainlink Data Feeds are listed for Arc testnet. So the testnet build:

- deploys **Uniswap v2 from its published npm bytecode** (`contracts/script/lib/Artifacts.sol`, canonical pair init hash);
- deploys two clearly named test tokens, **XORR Test WETH (xWETH)** and **XORR Test cirBTC (xcirBTC)**, and uses Circle's
  real testnet **EURC**;
- seeds small XORR-owned pools (USDC/xWETH, USDC/xcirBTC, USDC/EURC) at Chainlink's mainnet prices;
- prices them with **mirror aggregators** (`XorrMirrorFeed`) that XORR's keeper updates with the values it reads from
  Chainlink's Arc **mainnet** feeds. They are labelled "mirror of Chainlink mainnet" everywhere they appear.

The mainnet build uses none of this: real Chainlink feeds, real tokens, real Uniswap pools.

## StableFX (FxEscrow)

**Not usable without a Circle StableFX account.** Every StableFX endpoint (`/v1/exchange/stablefx/quotes`, `/trades`,
`/signatures`, `/signatures/presign/{tradeId}`) requires a Circle API key (`BearerAuth`), and a trade settles on
FxEscrow only against a quote and EIP-712 signatures that Circle's API issues to an onboarded taker (and a maker on the
other side). There is no permissionless function on FxEscrow that swaps USDC for EURC without that quote. This matches
the Polaris port's conclusion. XORR's FX desk therefore trades EURC on the **Uniswap v3 USDC/EURC pool**, priced and
floored by Chainlink's EURC/USD feed; StableFX is a documented upgrade path for an account holder (`docs/ARC-STACK.md`).

## USYC

Subscribe/redeem goes through the Teller (mainnet `0x51A8CE47dC08ba5CD19c7aa84EA6fD6664f60f9b`, testnet
`0x9fdF14c5B14173D74C08Af27AebFf39240dC105A`): `deposit(usdcAmount, receiver)` / `redeem(usycAmount, receiver, account)`.
Holding and minting USYC is gated by **Entitlements** (mainnet `0xb69ecb156Dc0028198028c501340d5367845ca72`, testnet
`0xcc205224862c7641930c87679e98999d23c26113`): an address must be allowlisted by Circle/Hashnote (institutional,
non-US onboarding). XORR parks idle USDC in USYC only for an owner whose wallet is entitled; the app reads the
entitlement and the Teller/Oracle price live and says plainly when the wallet is not allowlisted.

## Chainlink Data Feeds read live (Arc mainnet)

| Feed | Answer | Updated | Heartbeat |
|---|---|---|---|
| BTC/USD | 83,486.13 | 0.8 h before the read | 24 h / 0.5% |
| ETH/USD | 2,573.55 | 0.8 h | 24 h / 0.5% |
| EURC/USD | 1.12138 | 13.6 h | 24 h / 0.5% |
| EUR/USD | 1.12130 | 13.6 h | 24 h / 0.5% |
| USDC/USD | 0.99984 | 5.4 h | 24 h / 0.5% |

XorrPriceGuard accepts a round up to heartbeat + 1 h old (25 h) and refuses anything older, non-positive, or unanswered.
