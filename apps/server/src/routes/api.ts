import { Router } from 'express';
import { z } from 'zod';
import db from '../db/client';
import { publicClient, getWalletClient, feedbackAbi, erc721Abi } from '../lib/viem';
import { getContractsJson } from '../services/contracts';

type DiscordNotifier = (message: string) => Promise<void>;

let discordNotifier: DiscordNotifier | null = null;

export function setDiscordNotifier(handler: DiscordNotifier | null) {
  discordNotifier = handler;
}

export const router = Router();

router.get('/contracts.json', (_req, res) => {
  res.json(getContractsJson());
});

// --- Discord test endpoints ---
router.get('/discord/status', (_req, res) => {
  res.json({ connected: Boolean(discordNotifier) });
});

router.post('/discord/test', async (req, res) => {
  if (!discordNotifier) return res.status(503).json({ error: 'discord bot not connected' });
  const message: string = (req.body && typeof req.body.message === 'string' && req.body.message.trim()) || 'Hello from Disphorea server 👋';
  try {
    await discordNotifier(message);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[discord] send failed', e);
    res.status(500).json({ error: e?.message || 'send failed' });
  }
});

// --- NFT-gated join via relayer ---
const JoinBody = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  identityCommitment: z.string().or(z.number()),
  message: z.string().min(1),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/)
});

router.post('/join', async (req, res) => {
  const parsed = JoinBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { address, identityCommitment, message, signature } = parsed.data;
  const { feedback, nft } = getContractsJson();
  if (!feedback || !nft) return res.status(500).json({ error: 'contracts not configured' });

  try {
    // Verify signature
    const { verifyMessage } = await import('viem');
    const ok = await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
    if (!ok) return res.status(401).json({ error: 'invalid signature' });

    // Check NFT ownership on-chain
    const bal = await publicClient.readContract({
      address: nft as `0x${string}`,
      abi: erc721Abi,
      functionName: 'balanceOf',
      args: [address as `0x${string}`]
    });
    if ((bal as bigint) <= 0n) return res.status(403).json({ error: 'address does not hold NFT' });

    // Relay admin add
    const walletClient = getWalletClient();
    const hash = await walletClient.writeContract({
      address: feedback as `0x${string}`,
      abi: feedbackAbi,
      functionName: 'addMemberAdmin',
      args: [BigInt(identityCommitment as any)]
    });
    const rc = await publicClient.waitForTransactionReceipt({ hash });
    res.json({ ok: true, txHash: rc.transactionHash });
  } catch (e: any) {
    console.error('[join] failed', e);
    res.status(500).json({ error: e?.message || 'join failed' });
  }
});

// Provide a canonical message for clients to sign for joining
router.get('/join/challenge', (req, res) => {
  const identityCommitment = (req.query.identityCommitment as string) || '';
  const { groupId } = getContractsJson();
  const message = `Disphorea: Join group ${groupId} with commitment ${identityCommitment}`;
  res.json({ message });
});

router.get('/group/root', async (_req, res) => {
  res.json({ root: null });
});

router.get('/epoch', (_req, res) => {
  const epoch = Math.floor(Date.now() / 1000 / 3600);
  res.json({ epoch });
});

const PostBody = z.object({
  proof: z.object({
    merkleTreeDepth: z.union([z.string(), z.number()]),
    points: z.array(z.union([z.string(), z.number()])).length(8)
  }),
  merkleRoot: z.union([z.string(), z.number()]),
  nullifierHash: z.union([z.string(), z.number()]),
  feedback: z.union([z.string(), z.number()]),
  content: z.string().min(1),
  boardId: z.string().default('default')
});

router.post('/posts', async (req, res) => {
  const parsed = PostBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { proof, merkleRoot, nullifierHash, feedback: feedbackValue, content, boardId } = parsed.data;
  const { feedback } = getContractsJson();

  if (!feedback) {
    return res.status(500).json({ error: 'feedback contract not configured' });
  }

  try {
    const walletClient = getWalletClient();
    const hash = await walletClient.writeContract({
      address: feedback as `0x${string}`,
      abi: feedbackAbi,
      functionName: 'sendFeedback',
      args: [
        BigInt(proof.merkleTreeDepth as any),
        BigInt(merkleRoot as any),
        BigInt(nullifierHash as any),
        BigInt(feedbackValue as any),
        proof.points.map((value) => BigInt(value as any)) as [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint
        ]
      ]
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    const stmt = db.prepare(
      `
        INSERT INTO posts (
          id,
          board_id,
          pseudo_id,
          scope,
          merkle_root,
          signal,
          content,
          tx_hash,
          created_at
        ) VALUES (
          @id,
          @boardId,
          @pseudoId,
          @scope,
          @merkleRoot,
          @signal,
          @content,
          @txHash,
          @createdAt
        )
      `
    );

    const createdAt = new Date().toISOString();
    stmt.run({
      id: receipt.transactionHash,
      boardId,
      pseudoId: String(nullifierHash),
      scope: String(0),
      merkleRoot: String(merkleRoot),
      signal: String(feedbackValue),
      content,
      txHash: receipt.transactionHash,
      createdAt
    });

    if (discordNotifier) {
      await discordNotifier(`[#${boardId}] ${String(nullifierHash).slice(0, 10)}: ${content}`);
    }

    res.json({ ok: true, txHash: receipt.transactionHash });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error?.message || 'relay failed' });
  }
});

router.get('/posts', (req, res) => {
  const boardId = (req.query.boardId as string) || 'default';
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const pseudoId = req.query.pseudoId as string | undefined;
  const after = req.query.after as string | undefined;

  let query = 'SELECT * FROM posts WHERE board_id = ?';
  const params: (string | number)[] = [boardId];

  if (pseudoId) {
    query += ' AND pseudo_id = ?';
    params.push(pseudoId);
  }

  if (after) {
    query += ' AND created_at > ?';
    params.push(after);
  }

  query += ' ORDER BY created_at ASC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params);
  const nextCursor = rows.length ? rows[rows.length - 1].created_at : null;

  res.json({ items: rows, nextCursor });
});
