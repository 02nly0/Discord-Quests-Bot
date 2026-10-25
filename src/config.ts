export interface BotConfig {
	/** Bot token from the Discord developer portal. */
	botToken: string;
	/** Optional guild ID to register commands in instantly while developing. */
	guildId?: string;
}

export function loadConfig(): BotConfig {
	const botToken = process.env.DISCORD_TOKEN;
	if (!botToken) {
		console.error('DISCORD_TOKEN is not set. Copy .env.example to .env and add your bot token.');
		process.exit(1);
	}

	const guildId = process.env.GUILD_ID?.trim();
	return { botToken, guildId: guildId || undefined };
}
