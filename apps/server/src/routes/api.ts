import { Router } from 'express';
import { z } from 'zod';
import db from '../db/client';
import { publicClient, getWalletClient, feedbackAbi } from '../lib/viem';
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
  scope: z.union([z.string(), z.number()]),
  signal: z.union([z.string(), z.number()]),
  content: z.string().min(1),
  boardId: z.string().default('default')
});

router.post('/posts', async (req, res) => {
  const parsed = PostBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { proof, merkleRoot, nullifierHash, scope, signal, content, boardId } = parsed.data;
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
        {
          merkleTreeDepth: BigInt(proof.merkleTreeDepth as any),
          merkleTreeRoot: BigInt(merkleRoot as any),
          nullifier: BigInt(nullifierHash as any),
          message: BigInt(signal as any),
          scope: BigInt(scope as any),
          points: proof.points.map((value) => BigInt(value as any)) as [
            bigint,
            bigint,
            bigint,
            bigint,
            bigint,
            bigint,
            bigint,
            bigint
          ]
        }
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
      scope: String(scope),
      merkleRoot: String(merkleRoot),
      signal: String(signal),
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
