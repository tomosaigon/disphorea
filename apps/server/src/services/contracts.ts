import fs from 'fs';
import path from 'path';

export function getContractsJson() {
  try {
    const p = path.resolve(__dirname, '../../config/contracts.json');
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed;
    }
  } catch (e) {
    // fallback to envs below
  }
  return {
    chainId: Number(process.env.CHAIN_ID || 31337),
    semaphore: process.env.SEMAPHORE_ADDRESS || '',
    feedback: process.env.FEEDBACK_ADDRESS || '',
    nft: process.env.NFT_ADDRESS || '',
    groupId: Number(process.env.GROUP_ID || 0),
    boardSalt: '0x000000000000000000000000000000000000000000000000000000000000BEEF'
  };
}
