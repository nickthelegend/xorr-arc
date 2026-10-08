/**
 * The contract surfaces XORR's app and executor call, as human-readable ABI strings. No runtime import here, so the
 * Expo app and the Node executor each parse them with their own viem (server/src/abis.ts, src/arc/abis.ts).
 */

export const erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function faucet()',
] as const;

export const aggregatorAbi = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
  'function getRoundData(uint80 roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
] as const;

export const mirrorFeedAbi = [
  'function post(int256 answer, uint256 updatedAt)',
  'function poster() view returns (address)',
  'function source() view returns (address)',
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
] as const;

export const delegationAbi = [
  'function grant(address agent, uint256 dailyCap, uint64 expiresAt, uint16 maxSlippageBps, address[] venues)',
  'function grantAgent(address agent, uint256 dailyCap, uint64 expiresAt, uint16 maxSlippageBps)',
  'function revoke()',
  'function revokeAgent(address agent)',
  'function setGuardian(address guardian, bool allowed)',
  'function spend(address owner, address venue, uint256 amount, address tokenOut, uint256 minOut, bytes32 decisionId, bytes data) returns (uint256)',
  'function closePosition(address owner, address token, address venue, uint256 amount, uint256 minOut, bytes32 decisionId, bytes data) returns (uint256)',
  'function policyOf(address owner) view returns (address agent, uint256 dailyCap, uint64 expiresAt, uint16 maxSlippageBps, bool revoked)',
  'function agentPolicyOf(address owner, address agent) view returns (uint256 dailyCap, uint64 expiresAt, uint16 maxSlippageBps, bool revoked, bool stopped)',
  'function remainingTodayFor(address owner, address agent) view returns (uint256)',
  'function spentTodayBy(address owner, address agent) view returns (uint256)',
  'function venuesOf(address owner) view returns (address[])',
  'function isStopped(address owner) view returns (bool)',
  'function isGuardian(address owner, address guardian) view returns (bool)',
  'function DAILY_CAP_CEILING() view returns (uint256)',
  'event Granted(address indexed owner, address indexed agent, uint256 dailyCap, uint64 expiresAt, uint16 maxSlippageBps)',
  'event Revoked(address indexed owner, address indexed agent, address by)',
  'event Spent(address indexed owner, address indexed agent, address indexed venue, address tokenOut, uint256 amountIn, uint256 received, uint256 spentToday, bytes32 decisionId)',
  'event Closed(address indexed owner, address indexed agent, address indexed venue, address tokenIn, uint256 amountIn, uint256 received, bytes32 decisionId)',
  'error NotDelegate()',
  'error PolicyRevoked()',
  'error PolicyExpired()',
  'error VenueNotAllowed(address venue)',
  'error DailyCapExceeded(uint256 requested, uint256 remaining)',
  'error ZeroAmount()',
  'error VenueCallFailed()',
  'error InvalidToken()',
  'error ZeroMinOut()',
  'error OutputNotReceived(uint256 received, uint256 minOut)',
  'error BelowOracleFloor(uint256 received, uint256 floor)',
  'error BadGrant()',
  'error NotGuardian(address caller)',
  'error StalePrice(address token, uint256 updatedAt, uint256 maxAge)',
  'error BadPrice(address token, int256 answer)',
  'error NoFeed(address token)',
] as const;

export const guardAbi = [
  'function priceOf(address token) view returns (uint256 price18, uint256 updatedAt)',
  'function quote(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)',
  'function feedOf(address token) view returns (address aggregator, uint32 maxAge, uint8 feedDecimals, uint8 tokenDecimals)',
] as const;

export const councilAbi = [
  'function recordDecision(bytes32 id, address owner, address asset, bool isBuy, bool approved, uint8[] votes)',
  'function settle(bytes32 id) returns (int256)',
  'function decisionOf(bytes32 id) view returns ((address owner, address asset, uint40 recordedAt, uint40 filledAt, uint8 status, bool isBuy, bool approved, uint8 seatCount, uint64 votes, uint128 amountIn, uint128 received, uint256 priceAtVote, int32 edgeBps))',
  'function seatAgent(uint8 seat) view returns (bool set, uint256 agentId)',
  'function seatScored(uint8 seat) view returns (uint64)',
  'function seatAverageEdge(uint8 seat) view returns (int256)',
  'function HORIZON() view returns (uint256)',
  'event DecisionSettled(bytes32 indexed id, int256 edgeBps, bool filled)',
  'event SeatFeedback(bytes32 indexed id, uint8 indexed seat, uint256 indexed agentId, int128 value, bool written)',
] as const;

export const reputationAbi = [
  'function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
  'function getLastIndex(uint256 agentId, address clientAddress) view returns (uint64)',
] as const;

export const identityAbi = [
  'function ownerOf(uint256 agentId) view returns (address)',
  'function tokenURI(uint256 agentId) view returns (string)',
] as const;

export const quoterV2Abi = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
] as const;

export const swapRouter02Abi = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
] as const;

export const v2RouterAbi = [
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
] as const;

export const memoAbi = [
  'function memo(address target, bytes data, bytes32 memoId, bytes memo)',
  'event Memo(address indexed sender, address indexed target, bytes32 callDataHash, bytes32 indexed memoId, bytes memo, uint256 memoIndex)',
  'error CallFailed(bytes returnData)',
] as const;

export const usycTellerAbi = [
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function redeem(uint256 shares, address receiver, address account) returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function previewDeposit(uint256 assets) view returns (uint256)',
  'function authority() view returns (address)',
] as const;

/** The Teller's authority (USYC Entitlements): who may call deposit/redeem. */
export const usycAuthorityAbi = [
  'function canCall(address user, address target, bytes4 functionSig) view returns (bool)',
  'function getRolesWithCapability(address target, bytes4 functionSig) view returns (bytes32)',
  'function owner() view returns (address)',
  'function setUserRole(address user, uint8 role, bool enabled)',
] as const;

export const usycOracleAbi = [
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
  'function decimals() view returns (uint8)',
] as const;

export const stopSenderAbi = [
  'function stopAll() payable returns (bytes32)',
  'function revokeAgent(address agent) payable returns (bytes32)',
  'function fee(uint8 action, address agent) view returns (uint256)',
] as const;

export const stopReceiverAbi = [
  'event StopReceived(bytes32 indexed messageId, uint64 indexed sourceChainSelector, address indexed owner, uint8 action, address agent)',
  'event MessageFailed(bytes32 indexed messageId, bytes reason)',
  'function isFailed(bytes32) view returns (bool)',
  'function retryFailedMessage(bytes32 messageId)',
] as const;

export const tokenMessengerV2Abi = [
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)',
] as const;

export const messageTransmitterV2Abi = [
  'function receiveMessage(bytes message, bytes attestation) returns (bool)',
] as const;

export const gatewayWalletAbi = [
  'function deposit(address token, uint256 value)',
  'function availableBalance(address token, address depositor) view returns (uint256)',
] as const;

export const gatewayMinterAbi = ['function gatewayMint(bytes attestationPayload, bytes signature)'] as const;
