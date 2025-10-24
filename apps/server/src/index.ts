import 'dotenv/config';
import express from 'express';
// Using require to avoid missing @types in offline env
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cors = require('cors');
import morgan from 'morgan';
import { router, setDiscordNotifier } from './routes/api';
import { startDiscordBot } from './bot/discord';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.use('/api', router);

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT || 4000);

app.listen(port, async () => {
  console.log(`[server] listening on http://localhost:${port}`);

  try {
    const discord = await startDiscordBot();
    setDiscordNotifier(discord ? (message) => discord.send(message) : null);
  } catch (error) {
    console.error('[discord] failed to start bot', error);
  }
});
/// <reference path="./types/ambient.d.ts" />
