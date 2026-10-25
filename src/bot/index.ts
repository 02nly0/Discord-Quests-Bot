import { Client, Events, GatewayIntentBits } from 'discord.js';
import type { BotConfig } from '../config';
import { log } from '../util/logger';
import { registerCommands } from './commands';
import { handleInteraction } from './flow';

export async function startBot(config: BotConfig): Promise<Client> {
	const client = new Client({
		intents: [GatewayIntentBits.Guilds],
	});

	client.once(Events.ClientReady, async (ready) => {
		log('bot', `logged in as ${ready.user.tag}`);
		try {
			const applicationId = ready.application?.id;
			if (!applicationId) throw new Error('Discord did not expose an application id');
			await registerCommands(config.botToken, applicationId, config.guildId);
			log('bot', config.guildId ? 'commands registered (guild)' : 'commands registered (global)');
		} catch (error) {
			log('bot', `command registration failed: ${String(error)}`);
		}
	});

	client.on(Events.InteractionCreate, (interaction) => {
		void handleInteraction(interaction);
	});

	await client.login(config.botToken);
	return client;
}
