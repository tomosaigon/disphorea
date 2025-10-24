import { Client, GatewayIntentBits, TextChannel } from 'discord.js';

export type DiscordBotHandle = {
  send: (message: string) => Promise<void>;
};

export async function startDiscordBot(): Promise<DiscordBotHandle | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;

  if (!token || !channelId) {
    console.log('[discord] token or channel id not set; skipping');
    return null;
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });

  client.once('ready', () => {
    console.log(`[discord] logged in as ${client.user?.tag}`);
  });

  await client.login(token);

  return {
    send: async (message: string) => {
      const channel = await client.channels.fetch(channelId);
      if (!channel) {
        return;
      }

      await (channel as TextChannel).send(message);
    }
  };
}
