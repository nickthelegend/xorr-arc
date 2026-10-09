/** The shared ABI strings (shared/abis.ts), parsed by the app's viem. */
import { parseAbi } from 'viem';
import * as raw from '../../shared/abis';

export const erc20Abi = parseAbi(raw.erc20Abi);
export const aggregatorAbi = parseAbi(raw.aggregatorAbi);
export const mirrorFeedAbi = parseAbi(raw.mirrorFeedAbi);
export const delegationAbi = parseAbi(raw.delegationAbi);
export const guardAbi = parseAbi(raw.guardAbi);
export const councilAbi = parseAbi(raw.councilAbi);
export const reputationAbi = parseAbi(raw.reputationAbi);
export const identityAbi = parseAbi(raw.identityAbi);
export const quoterV2Abi = parseAbi(raw.quoterV2Abi);
export const swapRouter02Abi = parseAbi(raw.swapRouter02Abi);
export const v2RouterAbi = parseAbi(raw.v2RouterAbi);
export const memoAbi = parseAbi(raw.memoAbi);
export const usycTellerAbi = parseAbi(raw.usycTellerAbi);
export const usycAuthorityAbi = parseAbi(raw.usycAuthorityAbi);
export const usycOracleAbi = parseAbi(raw.usycOracleAbi);
export const stopSenderAbi = parseAbi(raw.stopSenderAbi);
export const stopReceiverAbi = parseAbi(raw.stopReceiverAbi);
export const tokenMessengerV2Abi = parseAbi(raw.tokenMessengerV2Abi);
export const messageTransmitterV2Abi = parseAbi(raw.messageTransmitterV2Abi);
export const gatewayWalletAbi = parseAbi(raw.gatewayWalletAbi);
export const gatewayMinterAbi = parseAbi(raw.gatewayMinterAbi);
