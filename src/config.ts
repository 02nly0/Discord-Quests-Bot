export interface BotConfig {
	/** Bot token from the Discord developer portal. */
	botToken: string;
	/** Optional guild ID to register commands in instantly while developing. */
	guildId?: string;
}

export function loadConfig(): BotConfig {
	const botToken = process.env.DISCORD_TOKEN;
	if (!botToken) {
		throw new Error('DISCORD_TOKEN is not set. Copy .env.example to .env and add your bot token.');
	}

	const guildId = process.env.GUILD_ID?.trim() || undefined;
	return { botToken, guildId };
}
