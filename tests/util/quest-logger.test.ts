import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { LoggingConfig } from '../../src/config';
import { createQuestLogger, redact } from '../../src/util/quest-logger';

const WEBHOOK_URL = 'your_webhook_url_here if you want to test webhook logging, otherwise leave it empty';
const CHANNEL_ID = 'your_channel_id_here if you want to test channel logging, otherwise leave it empty';
const BOT_TOKEN = 'your_bot_token_here if you want to test redaction, otherwise leave it empty';

const user = { id: '42', username: 'amtix' };
const quest = { id: 'quest_123', displayName: 'Call of Duty: Modern Warfare 4' };

function config(
	overrides: { mode?: boolean; console?: boolean; webhook?: boolean; channel?: boolean } = {},
): LoggingConfig {
	return {
		mode: overrides.mode ?? true,
		console: { enabled: overrides.console ?? false },
		webhook: { enabled: overrides.webhook ?? false, url: WEBHOOK_URL },
		channel: { enabled: overrides.channel ?? false, id: CHANNEL_ID },
	};
}

let consoleOutput: string[];
let webhookBodies: string[];
let channelMessages: unknown[];

const okFetch = (async (_url: string, init: RequestInit) => {
	webhookBodies.push(String(init.body));
	return new Response(null, { status: 204 });
}) as unknown as typeof fetch;

const resolveChannel = async () => ({
	send: async (message: unknown) => {
		channelMessages.push(message);
	},
});

function build(overrides: Parameters<typeof config>[0], options: Parameters<typeof createQuestLogger>[1] = {}) {
	return createQuestLogger(config(overrides), { fetch: okFetch, resolveChannel, secrets: [BOT_TOKEN], ...options });
}

beforeEach(() => {
	consoleOutput = [];
	webhookBodies = [];
	channelMessages = [];
	spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
		consoleOutput.push(args.join(' '));
	});
});

afterEach(() => {
	(console.log as unknown as { mockRestore(): void }).mockRestore();
});

describe('destinations', () => {
	const cases = [
		{ console: true, webhook: false, channel: false },
		{ console: false, webhook: true, channel: false },
		{ console: false, webhook: false, channel: true },
		{ console: true, webhook: true, channel: false },
		{ console: true, webhook: false, channel: true },
		{ console: false, webhook: true, channel: true },
		{ console: true, webhook: true, channel: true },
		{ console: false, webhook: false, channel: false },
	];

	for (const enabled of cases) {
		it(`routes only to the enabled destinations ${JSON.stringify(enabled)}`, async () => {
			await build(enabled).record('started', user, quest);

			expect(consoleOutput.length).toBe(enabled.console ? 1 : 0);
			expect(webhookBodies.length).toBe(enabled.webhook ? 1 : 0);
			expect(channelMessages.length).toBe(enabled.channel ? 1 : 0);
		});
	}

	it('stays silent everywhere when the master switch is off', async () => {
		await build({ mode: false, console: true, webhook: true, channel: true }).record('started', user, quest);

		expect(consoleOutput).toEqual([]);
		expect(webhookBodies).toEqual([]);
		expect(channelMessages).toEqual([]);
	});
});

describe('formatting', () => {
	it('prints the console block with user, quest and action', async () => {
		await build({ console: true }).record('started', user, quest);

		expect(consoleOutput[0]).toContain('[ QUEST USER LOGS ]');
		expect(consoleOutput[0]).toContain('User: amtix');
		expect(consoleOutput[0]).toContain('User ID: 42');
		expect(consoleOutput[0]).toContain('Action: Started Quest');
		expect(consoleOutput[0]).toContain('Quest: Call of Duty: Modern Warfare 4');
		expect(consoleOutput[0]).toContain('Quest ID: quest_123');
		expect(consoleOutput[0]).toMatch(/Timestamp: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
	});

	it('sends an embed with the matching sentence and no mentions', async () => {
		await build({ webhook: true }).record('completed', user, quest);

		const body = JSON.parse(webhookBodies[0]);
		expect(body.allowed_mentions).toEqual({ parse: [] });
		expect(body.embeds[0].title).toBe('Completed Quest');
		expect(body.embeds[0].description).toBe(
			'<@42> (amtix/42) successfully completed quest: Call of Duty: Modern Warfare 4.',
		);
	});

	it('words each event for the right outcome', async () => {
		const logger = build({ webhook: true });
		await logger.record('command', user);
		await logger.record('viewed', user);
		await logger.record('failed', user, quest, 'Stalled.');
		await logger.record('cancelled', user, quest);
		await logger.record('cancelled', user);

		const descriptions = webhookBodies.map((body) => JSON.parse(body).embeds[0].description);
		expect(descriptions).toEqual([
			'<@42> (amtix/42) started using the /quests command.',
			'<@42> (amtix/42) viewed their available quests.',
			'<@42> (amtix/42) failed to complete quest: Call of Duty: Modern Warfare 4.',
			'<@42> (amtix/42) cancelled their active quest: Call of Duty: Modern Warfare 4.',
			'<@42> (amtix/42) cancelled their quest run.',
		]);
		expect(JSON.parse(webhookBodies[2]).embeds[0].fields.at(-1)).toMatchObject({ name: 'Reason', value: 'Stalled.' });
	});

	it('logs each call once', async () => {
		await build({ console: true, webhook: true, channel: true }).record('cancelled', user, quest);

		expect(consoleOutput.length).toBe(1);
		expect(webhookBodies.length).toBe(1);
		expect(channelMessages.length).toBe(1);
	});
});

describe('failures', () => {
	it('keeps the other destinations working when the webhook request fails', async () => {
		const failingFetch = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;

		await build({ console: true, webhook: true, channel: true }, { fetch: failingFetch }).record('started', user, quest);

		expect(consoleOutput.some((line) => line.includes('Action: Started Quest'))).toBe(true);
		expect(consoleOutput.some((line) => line.includes('webhook logging failed'))).toBe(true);
		expect(channelMessages.length).toBe(1);
	});

	it('survives a rejected network call', async () => {
		const throwingFetch = (async () => {
			throw new Error(`connect failed for ${WEBHOOK_URL}`);
		}) as unknown as typeof fetch;

		await build({ webhook: true }, { fetch: throwingFetch }).record('started', user, quest);

		expect(consoleOutput.join('\n')).toContain('webhook logging failed');
		expect(consoleOutput.join('\n')).not.toContain('abcDEF_secret-token');
	});

	it('retries once after a rate limit', async () => {
		let calls = 0;
		const limitedFetch = (async () => {
			calls += 1;
			return calls === 1
				? new Response(null, { status: 429, headers: { 'retry-after': '0' } })
				: new Response(null, { status: 204 });
		}) as unknown as typeof fetch;

		await build({ webhook: true }, { fetch: limitedFetch }).record('started', user, quest);

		expect(calls).toBe(2);
	});

	it('warns and skips the webhook when the URL is missing', async () => {
		const logger = createQuestLogger(
			{ ...config({ webhook: true }), webhook: { enabled: true, url: '' } },
			{ fetch: okFetch, resolveChannel },
		);
		await logger.record('started', user, quest);

		expect(webhookBodies).toEqual([]);
		expect(consoleOutput.some((line) => line.includes('LOG_WEBHOOK_URL is missing'))).toBe(true);
	});

	it('warns and skips the channel when the ID is invalid', async () => {
		const logger = createQuestLogger(
			{ ...config({ channel: true }), channel: { enabled: true, id: 'not-an-id' } },
			{ fetch: okFetch, resolveChannel },
		);
		await logger.record('started', user, quest);

		expect(channelMessages).toEqual([]);
		expect(consoleOutput.some((line) => line.includes('LOG_CHANNEL_ID is missing or not a valid'))).toBe(true);
	});

	it('survives a Discord API error while sending to the channel', async () => {
		const failingChannel = async () => ({
			send: async () => {
				throw new Error('Missing Access');
			},
		});

		await build({ channel: true, webhook: true }, { resolveChannel: failingChannel }).record('started', user, quest);

		expect(webhookBodies.length).toBe(1);
		expect(consoleOutput.some((line) => line.includes('channel logging failed: Missing Access'))).toBe(true);
	});

	it('survives a channel that cannot be found', async () => {
		await build({ channel: true }, { resolveChannel: async () => null }).record('started', user, quest);

		expect(consoleOutput.some((line) => line.includes('channel logging failed'))).toBe(true);
	});
});

describe('redaction', () => {
	it('removes tokens, webhook URLs and credentials from every destination', async () => {
		const reason = `Request failed with Authorization: Bearer ${BOT_TOKEN} for ${WEBHOOK_URL} using ${BOT_TOKEN}`;
		const leakyUser = { ...user, username: `amtix ${BOT_TOKEN}` };

		await build({ console: true, webhook: true, channel: true }).record('failed', leakyUser, quest, reason);

		const everything = [...consoleOutput, ...webhookBodies, JSON.stringify(channelMessages)].join('\n');
		expect(everything).toContain('[REDACTED]');
		expect(everything).not.toContain(BOT_TOKEN);
		expect(everything).not.toContain('abcDEF_secret-token');
		expect(everything).not.toContain('MTQxNjk4NzY1NDMyMTA5ODc2NQ');
	});

	it('redacts known secrets and secret shaped text', () => {
		expect(redact('token is hunter2hunter2', ['hunter2hunter2'])).toBe('token is [REDACTED]');
		expect(redact('password=hunter2')).toBe('[REDACTED]');
		expect(redact('postgres://admin:pass@db.example.com/app')).toBe('[REDACTED]');
		expect(redact('mfa.abcdefghijklmnopqrstuvwxyz')).toBe('[REDACTED]');
		expect(redact('Completed Call of Duty: Modern Warfare 4')).toBe('Completed Call of Duty: Modern Warfare 4');
	});
});
