import fs from 'fs';
import path from 'path';

export function getContractsJson() {
  // Try common locations written by deploy script
  const candidates = [
    // apps/server/config/contracts.json
    path.resolve(__dirname, '../../config/contracts.json')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        return JSON.parse(raw);
      }
    } catch {}
  }
  return {
    chainId: Number(process.env.CHAIN_ID || 31337),
    semaphore: process.env.SEMAPHORE_ADDRESS || '',
    feedback: process.env.FEEDBACK_ADDRESS || '',
    nft: process.env.NFT_ADDRESS || '',
    groupId: Number(process.env.GROUP_ID || 0),
    boardSalt: process.env.BOARD_SALT || '0x000000000000000000000000000000000000000000000000000000000000BEEF',
    epochLength: Number(process.env.EPOCH_LENGTH || 3600)
  };
}
