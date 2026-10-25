import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { loadConfig } from '../src/config';

const originalToken = process.env.DISCORD_TOKEN;
const originalGuildId = process.env.GUILD_ID;

beforeEach(() => {
	delete process.env.DISCORD_TOKEN;
	delete process.env.GUILD_ID;
});

afterEach(() => {
	if (originalToken === undefined) delete process.env.DISCORD_TOKEN;
	else process.env.DISCORD_TOKEN = originalToken;

	if (originalGuildId === undefined) delete process.env.GUILD_ID;
	else process.env.GUILD_ID = originalGuildId;
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
