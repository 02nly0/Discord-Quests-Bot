import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { loadConfig, loadFeatures } from '../src/config';

const originalToken = process.env.DISCORD_TOKEN;
const originalGuildId = process.env.GUILD_ID;
const originalDashboardEnabled = process.env.DASHBOARD_ENABLED;
const originalDmQuestUpdates = process.env.DM_QUEST_UPDATES;

beforeEach(() => {
	delete process.env.DISCORD_TOKEN;
	delete process.env.GUILD_ID;
	delete process.env.DASHBOARD_ENABLED;
	delete process.env.DM_QUEST_UPDATES;
});

afterEach(() => {
	if (originalToken === undefined) delete process.env.DISCORD_TOKEN;
	else process.env.DISCORD_TOKEN = originalToken;

	if (originalGuildId === undefined) delete process.env.GUILD_ID;
	else process.env.GUILD_ID = originalGuildId;

	if (originalDashboardEnabled === undefined) delete process.env.DASHBOARD_ENABLED;
	else process.env.DASHBOARD_ENABLED = originalDashboardEnabled;

	if (originalDmQuestUpdates === undefined) delete process.env.DM_QUEST_UPDATES;
	else process.env.DM_QUEST_UPDATES = originalDmQuestUpdates;
});

describe('loadConfig', () => {
	it('throws a helpful error when the bot token is missing', () => {
		expect(() => loadConfig()).toThrow('DISCORD_TOKEN is not set');
	});

	it('loads the token and leaves the guild unset when GUILD_ID is blank', () => {
		process.env.DISCORD_TOKEN = 'bot-token';
		process.env.GUILD_ID = '   ';

		expect(loadConfig()).toEqual({ botToken: 'bot-token', guildId: undefined });
	});

	it('trims a configured guild id', () => {
		process.env.DISCORD_TOKEN = 'bot-token';
		process.env.GUILD_ID = ' 123456789 ';

		expect(loadConfig()).toEqual({ botToken: 'bot-token', guildId: '123456789' });
	});
});

describe('loadFeatures', () => {
	it('uses the documented defaults when nothing is set', () => {
		expect(loadFeatures()).toEqual({ dashboardEnabled: false, dmQuestUpdates: true });
	});

	it('reads feature toggles from the environment', () => {
		process.env.DASHBOARD_ENABLED = 'true';
		process.env.DM_QUEST_UPDATES = '0';

		expect(loadFeatures()).toEqual({ dashboardEnabled: true, dmQuestUpdates: false });
	});

	it('rejects values that are not booleans', () => {
		process.env.DASHBOARD_ENABLED = 'yes';

		expect(() => loadFeatures()).toThrow('DASHBOARD_ENABLED must be true or false');
	});
});
