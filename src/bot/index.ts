import { Client, Events, GatewayIntentBits } from 'discord.js';
import { resolveBuildNumber } from '../api/build-number';
import { features, type BotConfig } from '../config';
import { log } from '../util/logger';
import { questLog } from '../util/quest-logger';
import { registerCommands } from './commands';
import { handleInteraction } from './flow';
import { startSetupCleanup } from './registry';

export async function startBot(config: BotConfig): Promise<Client> {
	startSetupCleanup();
	// Resolve before the gateway connects so the first requests already carry a
	// current fingerprint. Resolution never throws, even when Discord is down.
	const buildNumber = await resolveBuildNumber();
	log('bot', `client build number: ${buildNumber}`);

	const client = new Client({
		intents: [GatewayIntentBits.Guilds],
	});

	questLog.attachClient(client);

	client.once(Events.ClientReady, async (ready) => {
		log('bot', `logged in as ${ready.user.tag}`);
		try {
			await registerCommands(config.botToken, ready.application.id, config.guildId, features.dashboardEnabled);
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
