export function getContractsJson() {
  return {
    chainId: Number(process.env.CHAIN_ID || 31337),
    semaphore: process.env.SEMAPHORE_ADDRESS || '',
    feedback: process.env.FEEDBACK_ADDRESS || '',
    groupId: Number(process.env.GROUP_ID || 0),
    boardSalt: '0x000000000000000000000000000000000000000000000000000000000000BEEF'
  };
}
