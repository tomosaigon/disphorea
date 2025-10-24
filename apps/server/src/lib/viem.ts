import 'dotenv/config';
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { hardhat } from 'viem/chains';
import { getContractsJson } from '../services/contracts';
import { privateKeyToAccount } from 'viem/accounts';

const RPC_URL = process.env.RPC_URL;
const RELAYER_KEY = process.env.RELAYER_PRIVATE_KEY;
const CHAIN_ID = (() => {
  try {
    const { chainId } = getContractsJson();
    return Number(chainId || process.env.CHAIN_ID || 31337);
  } catch {
    return Number(process.env.CHAIN_ID || 31337);
  }
})();

if (!RPC_URL) {
  throw new Error('RPC_URL env variable is required');
}

export const publicClient = createPublicClient({
  chain: { ...hardhat, id: CHAIN_ID },
  transport: http(RPC_URL)
});

export function getWalletClient() {
  if (!RELAYER_KEY) {
    throw new Error('RELAYER_PRIVATE_KEY env variable is required');
  }
  const account = privateKeyToAccount(RELAYER_KEY as `0x${string}`);
  return createWalletClient({
    account,
    chain: { ...hardhat, id: CHAIN_ID },
    transport: http(RPC_URL)
  });
}

export const feedbackAbi = parseAbi([
  'function sendFeedback(uint256 merkleTreeDepth,uint256 merkleTreeRoot,uint256 nullifier,uint256 feedback,uint256 scope,uint256[8] points)',
  'function addMemberAdmin(uint256 identityCommitment)'
]);

export const erc721Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)'
]);
