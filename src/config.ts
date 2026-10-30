export interface BotConfig {
	/** Bot token from the Discord developer portal. */
	botToken: string;
	/** Optional guild ID to register commands in instantly while developing. */
	guildId?: string;
}

export type Language = 'ar' | 'en';

/** Language of the public dashboard embed. Defaults to Arabic. */
export const dashboardLanguage: Language = 'ar';

function envFlag(name: string, fallback: boolean): boolean {
	const value = process.env[name]?.trim().toLowerCase();
	if (!value) return fallback;
	if (value === 'true' || value === '1') return true;
	if (value === 'false' || value === '0') return false;
	throw new Error(`${name} must be true or false.`);
}

/** Feature toggles. Override these defaults from .env and restart the bot. */
export function loadFeatures() {
	return {
		dashboardEnabled: envFlag('DASHBOARD_ENABLED', false),
		dmQuestUpdates: envFlag('DM_QUEST_UPDATES', true),
	};
}

export const features = loadFeatures();

export function loadConfig(): BotConfig {
	const botToken = process.env.DISCORD_TOKEN;
	if (!botToken) {
		throw new Error('DISCORD_TOKEN is not set. Copy .env.example to .env and add your bot token.');
	}

	const guildId = process.env.GUILD_ID?.trim() || undefined;
	return { botToken, guildId };
}
