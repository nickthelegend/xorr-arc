/**
 * Arc, for XORR: one table of every address the app and the executor use, per network.
 *
 * Sources: docs.arc.io contract addresses, Chainlink's CCIP and Data Feeds directories for Arc, Uniswap's own
 * deployment registry (v3 is live on Arc mainnet) and Circle's USYC docs, each read on chain on 2026-10-08
 * (docs/VENUES.md). XORR's own contracts come from deployments/arc-<network>.json, written by the deploy script.
 *
 * Shared by the Expo app and the Node executor: plain data and pure functions, viem types only.
 */
/** viem's Address, restated so this file has no imports at all. */
export type Address = `0x${string}`;

export type ArcNetwork = 'arc-testnet' | 'arc-mainnet';

export type Remote = {
  name: string;
  chainId: number;
  cctpDomain: number;
  usdc: Address;
  tokenMessengerV2: Address;
  messageTransmitterV2: Address;
  ccipSelector: string;
  ccipRouter: Address;
  rpcUrl: string;
  explorerUrl: string;
};

export type FeedKey = 'USDC' | 'EURC' | 'EUR' | 'ETH' | 'BTC' | 'LINK' | 'CIRBTC_POR';

export type ArcConfig = {
  network: ArcNetwork;
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  usdc: Address;
  eurc: Address;
  usyc: Address;
  usycTeller: Address;
  usycEntitlements: Address;
  usycOracle: Address;
  memo: Address;
  cctpDomain: number;
  tokenMessengerV2: Address;
  messageTransmitterV2: Address;
  gatewayWallet: Address;
  gatewayMinter: Address;
  gatewayApiUrl: string;
  irisApiUrl: string;
  fxEscrow: Address;
  erc8004: { identity: Address; reputation: Address };
  ccip: { selector: string; router: Address; link: Address };
  /** Chainlink Data Feeds on Arc MAINNET (testnet has none; XORR mirrors these there). */
  chainlink: Record<FeedKey, Address>;
  uniswap: { swapRouter02: Address | null; quoterV2: Address | null; v3Factory: Address | null };
  /** The real Uniswap v3 pool fee tier per asset against USDC (mainnet). */
  v3Fees: Record<'WETH' | 'CBTC' | 'EURC', number>;
  faucet: string | null;
  remotes: Remote[];
};

export const USDC: Address = '0x3600000000000000000000000000000000000000';
export const MEMO: Address = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505';

const MAINNET_FEEDS: Record<FeedKey, Address> = {
  USDC: '0x84EA90AC252Dc437031461836DB5164219147905',
  EURC: '0x361b95c10b76Ca3f35C686d423e43A951755Bf23',
  EUR: '0xDd5B15443cd733D3966a50a3E48cB7DF9Fb5DE0D',
  ETH: '0x50FCDD99D6762D1C170DC6A9111db944AEE6D364',
  BTC: '0xa109B535C70C8Be9995be64Bb6751AcDB27e03De',
  LINK: '0xD37600AB06758356F0f5eE607299204785bF8c3a',
  CIRBTC_POR: '0xEB0884a871ea1f6483B5FC10fd3D7dC5806411fc',
};

export const ARC: Record<ArcNetwork, ArcConfig> = {
  'arc-testnet': {
    network: 'arc-testnet',
    chainId: 5042002,
    name: 'Arc Testnet',
    rpcUrl: 'https://rpc.testnet.arc.io',
    explorerUrl: 'https://explorer.testnet.arc.io',
    usdc: USDC,
    eurc: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
    usyc: '0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C',
    usycTeller: '0x9fdF14c5B14173D74C08Af27AebFf39240dC105A',
    usycEntitlements: '0xcc205224862c7641930c87679e98999d23c26113',
    usycOracle: '0x52b56c7642E71dc54714d879127d97cd0B3D4581',
    memo: MEMO,
    cctpDomain: 26,
    tokenMessengerV2: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    messageTransmitterV2: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    gatewayWallet: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
    gatewayMinter: '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B',
    gatewayApiUrl: 'https://gateway-api-testnet.circle.com',
    irisApiUrl: 'https://iris-api-sandbox.circle.com',
    fxEscrow: '0x867650F5eAe8df91445971f14d89fd84F0C9a9f8',
    erc8004: {
      identity: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
      reputation: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
    },
    ccip: {
      selector: '3034092155422581607',
      router: '0xdE4E7FED43FAC37EB21aA0643d9852f75332eab8',
      link: '0x745827566D1EFb6B91632df0bFD5a9b5392F54E0',
    },
    chainlink: MAINNET_FEEDS,
    uniswap: { swapRouter02: null, quoterV2: null, v3Factory: null },
    v3Fees: { WETH: 3000, CBTC: 100, EURC: 500 },
    faucet: 'https://faucet.circle.com',
    remotes: [
      {
        name: 'Base Sepolia',
        chainId: 84532,
        cctpDomain: 6,
        usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        tokenMessengerV2: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        messageTransmitterV2: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        ccipSelector: '10344971235874465080',
        ccipRouter: '0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93',
        rpcUrl: 'https://sepolia.base.org',
        explorerUrl: 'https://sepolia.basescan.org',
      },
      {
        name: 'Ethereum Sepolia',
        chainId: 11155111,
        cctpDomain: 0,
        usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        tokenMessengerV2: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        messageTransmitterV2: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        ccipSelector: '16015286601757825753',
        ccipRouter: '0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59',
        rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
        explorerUrl: 'https://sepolia.etherscan.io',
      },
    ],
  },
  'arc-mainnet': {
    network: 'arc-mainnet',
    chainId: 5042,
    name: 'Arc',
    rpcUrl: 'https://rpc.mainnet.arc.io',
    explorerUrl: 'https://explorer.arc.io',
    usdc: USDC,
    eurc: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',
    usyc: '0x8a5D989Bbb96929F689B0200f435f53dA42bF490',
    usycTeller: '0x51A8CE47dC08ba5CD19c7aa84EA6fD6664f60f9b',
    usycEntitlements: '0xb69ecb156Dc0028198028c501340d5367845ca72',
    usycOracle: '0x4BC8d5aCD3d040d2903dD9C5B7048520c6ff537A',
    memo: MEMO,
    cctpDomain: 26,
    tokenMessengerV2: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    messageTransmitterV2: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
    gatewayWallet: '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE',
    gatewayMinter: '0x2222222d7164433c4C09B0b0D809a9b52C04C205',
    gatewayApiUrl: 'https://gateway-api.circle.com',
    irisApiUrl: 'https://iris-api.circle.com',
    fxEscrow: '0xe2E5F173576B513d994073CCbDaCBE027d43DFe6',
    erc8004: {
      identity: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      reputation: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
    },
    ccip: {
      selector: '6370580034781731079',
      router: '0xB79791184973589c38e114D43Eb8E4588C283A18',
      link: '0x76a443768A5e3B8d1AED0105FC250877841Deb40',
    },
    chainlink: MAINNET_FEEDS,
    uniswap: {
      swapRouter02: '0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77',
      quoterV2: '0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468',
      v3Factory: '0xf0db7b58379503491d857dB50AC9ece64c653918',
    },
    v3Fees: { WETH: 3000, CBTC: 100, EURC: 500 },
    faucet: null,
    remotes: [
      {
        name: 'Base',
        chainId: 8453,
        cctpDomain: 6,
        usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        tokenMessengerV2: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
        messageTransmitterV2: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
        ccipSelector: '15971525489660198786',
        ccipRouter: '0x881e3A65B4d4a04dD529061dd0071cf975F58bCD',
        rpcUrl: 'https://mainnet.base.org',
        explorerUrl: 'https://basescan.org',
      },
      {
        name: 'Ethereum',
        chainId: 1,
        cctpDomain: 0,
        usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        tokenMessengerV2: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
        messageTransmitterV2: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
        ccipSelector: '5009297550715157269',
        ccipRouter: '0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D',
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        explorerUrl: 'https://etherscan.io',
      },
    ],
  },
};

/** XORR's own contracts on a network, as the deploy script writes them (deployments/arc-<network>.json). */
export type XorrDeployment = {
  network: ArcNetwork;
  chainId: number;
  deployer: Address;
  executor: Address;
  usdc: Address;
  eurc: Address;
  weth: Address;
  cbtc: Address;
  usyc: Address;
  memo: Address;
  priceGuard: Address;
  venueRegistry: Address;
  council: Address;
  delegation: Address;
  stopReceiver: Address;
  venue: Address;
  venueKind: 'uniswap-v3' | 'uniswap-v2';
  quoter: Address;
  v2Factory: Address;
  identityRegistry: Address;
  reputationRegistry: Address;
  ccipRouter: Address;
  dailyCapCeiling: number;
  mirrorFeeds: boolean;
  seatAgentIds: number[];
  /** usdc, eurc, weth, cbtc: what XorrPriceGuard reads (mirror feeds on testnet). */
  feeds: Address[];
  deployedAtBlock: number;
};

export type Sym = 'USDC' | 'EURC' | 'WETH' | 'CBTC';
export const TRADABLE: Sym[] = ['CBTC', 'WETH', 'EURC'];

export const ASSETS: Record<Sym, { label: string; decimals: number; feed: FeedKey; feedIndex: number }> = {
  USDC: { label: 'USDC', decimals: 6, feed: 'USDC', feedIndex: 0 },
  EURC: { label: 'EURC', decimals: 6, feed: 'EURC', feedIndex: 1 },
  WETH: { label: 'WETH', decimals: 18, feed: 'ETH', feedIndex: 2 },
  CBTC: { label: 'cirBTC', decimals: 8, feed: 'BTC', feedIndex: 3 },
};

export function tokenOf(d: XorrDeployment, s: Sym): Address {
  return s === 'USDC' ? d.usdc : s === 'EURC' ? d.eurc : s === 'WETH' ? d.weth : d.cbtc;
}

export function symOf(d: XorrDeployment, token: string): Sym | null {
  const t = token.toLowerCase();
  for (const s of ['USDC', 'EURC', 'WETH', 'CBTC'] as Sym[]) if (tokenOf(d, s).toLowerCase() === t) return s;
  return null;
}

/** On testnet WETH and cirBTC are XORR's test stand-ins, and say so. */
export function labelOf(s: Sym, network: ArcNetwork): string {
  if (network === 'arc-testnet' && s === 'WETH') return 'xWETH';
  if (network === 'arc-testnet' && s === 'CBTC') return 'xcirBTC';
  return ASSETS[s].label;
}

export const txUrl = (cfg: ArcConfig, hash: string) => `${cfg.explorerUrl}/tx/${hash}`;
export const addressUrl = (cfg: ArcConfig, a: string) => `${cfg.explorerUrl}/address/${a}`;

/** The council's seats, in on-chain seat order (XorrCouncil seat index = array index). */
export const SEATS = [
  { id: 'price-desk', name: 'Price Desk', role: 'Is Chainlink fresh on Arc, and does the Uniswap fill agree with it?', veto: true },
  { id: 'risk-keeper', name: 'Risk Keeper', role: 'Does it fit the on-chain permission: cap left today, expiry, position limit?', veto: true },
  { id: 'trend-reader', name: 'Trend Reader', role: 'Which way is Chainlink moving across the rounds XORR has read?', veto: false },
  { id: 'peg-desk', name: 'Peg Desk', role: 'Are USDC and EURC on their pegs, and is cirBTC fully reserved?', veto: true },
  { id: 'strategist', name: 'Strategist', role: 'Weighs the desks and decides split rounds; cannot veto.', veto: false },
] as const;

export type SeatId = (typeof SEATS)[number]['id'];
export type Vote = 'abstain' | 'yes' | 'no' | 'veto';
export const VOTE_CODE: Record<Vote, number> = { abstain: 0, yes: 1, no: 2, veto: 3 };
