import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { loadConfig, loadFeatures, loadLogging } from '../src/config';

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

describe('loadLogging', () => {
	const names = [
		'LOGGING_MODE',
		'LOG_CONSOLE_ENABLED',
		'LOG_WEBHOOK_ENABLED',
		'LOG_WEBHOOK_URL',
		'LOG_CHANNEL_ENABLED',
		'LOG_CHANNEL_ID',
	];
	const original = new Map(names.map((name) => [name, process.env[name]]));

	beforeEach(() => {
		for (const name of names) delete process.env[name];
	});

	afterEach(() => {
		for (const [name, value] of original) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});

	it('logs to the console only by default', () => {
		expect(loadLogging()).toEqual({
			mode: true,
			console: { enabled: true },
			webhook: { enabled: false, url: '' },
			channel: { enabled: false, id: '' },
		});
	});

	it('reads every logging setting from the environment', () => {
		process.env.LOGGING_MODE = 'false';
		process.env.LOG_CONSOLE_ENABLED = '0';
		process.env.LOG_WEBHOOK_ENABLED = 'true';
		process.env.LOG_WEBHOOK_URL = ' https://discord.com/api/webhooks/1/abc ';
		process.env.LOG_CHANNEL_ENABLED = 'true';
		process.env.LOG_CHANNEL_ID = ' 123 ';

		expect(loadLogging()).toEqual({
			mode: false,
			console: { enabled: false },
			webhook: { enabled: true, url: 'https://discord.com/api/webhooks/1/abc' },
			channel: { enabled: true, id: '123' },
		});
	});

	it('rejects values that are not booleans', () => {
		process.env.LOGGING_MODE = 'maybe';

		expect(() => loadLogging()).toThrow('LOGGING_MODE must be true or false');
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
