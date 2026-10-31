import type { APIEmbed, Client } from 'discord.js';
import { logging, type LoggingConfig } from '../config';
import { describeError, truncate } from './format';
import { log } from './logger';
import { sleep } from './time';

export type QuestLogAction = 'command' | 'viewed' | 'started' | 'completed' | 'failed' | 'cancelled';

export interface LogUser {
	id: string;
	username: string;
}

export interface LogQuest {
	id: string;
	displayName: string;
}

interface LogChannel {
	send(options: { embeds: APIEmbed[]; allowedMentions: { parse: [] } }): Promise<unknown>;
}

export interface QuestLoggerOptions {
	fetch?: typeof fetch;
	resolveChannel?: (id: string) => Promise<LogChannel | null>;
	/** Exact values that must never leave the process, on top of the pattern based redaction. */
	secrets?: string[];
}

const REDACTED = '[REDACTED]';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RATE_LIMIT_WAIT_MS = 60_000;
const WEBHOOK_URL = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+$/;
const CHANNEL_ID = /^\d{17,20}$/;

const SECRET_PATTERNS = [
	/https?:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\S+/gi,
	/\bmfa\.[\w-]{20,}|\b[\w-]{23,28}\.[\w-]{6,7}\.[\w-]{27,}/g,
	/\b(?:Bearer|Basic|Bot)\s+[\w.~+/=-]{20,}/gi,
	/\b(?:token|password|secret|authorization|api[_-]?key)\b\s*[:=]\s*\S+/gi,
	/\b[a-z][\w+.-]*:\/\/[^\s/:@]+:[^\s/@]+@\S+/gi,
];

/** Strips known secrets and anything shaped like one from a string before it is logged. */
export function redact(text: string, secrets: string[] = []): string {
	let clean = text;
	for (const secret of secrets) {
		if (secret) clean = clean.split(secret).join(REDACTED);
	}
	for (const pattern of SECRET_PATTERNS) clean = clean.replace(pattern, REDACTED);
	return clean;
}

const ACTIONS = {
	command: { label: 'Used Quest Command', color: 0x5865f2, text: () => 'started using the /quests command.' },
	viewed: { label: 'Viewed Quests', color: 0x5865f2, text: () => 'viewed their available quests.' },
	started: { label: 'Started Quest', color: 0x3ba55d, text: (quest: string) => `started a new quest: ${quest}.` },
	completed: {
		label: 'Completed Quest',
		color: 0xfaa61a,
		text: (quest: string) => `successfully completed quest: ${quest}.`,
	},
	failed: { label: 'Failed Quest', color: 0xed4245, text: (quest: string) => `failed to complete quest: ${quest}.` },
	cancelled: {
		label: 'Cancelled Quest',
		color: 0x747f8d,
		text: (quest: string) => (quest ? `cancelled their active quest: ${quest}.` : 'cancelled their quest run.'),
	},
} as const satisfies Record<QuestLogAction, { label: string; color: number; text: (quest: string) => string }>;

export function createQuestLogger(config: LoggingConfig, options: QuestLoggerOptions = {}) {
	const { fetch: send = fetch, secrets = [] } = options;
	const knownSecrets = [config.webhook.url, ...secrets];
	let client: Client | undefined;

	const resolveChannel =
		options.resolveChannel ??
		(async (id: string) => {
			const channel = await client?.channels.fetch(id);
			return channel?.isSendable() ? channel : null;
		});

	const webhookReady = config.webhook.enabled && WEBHOOK_URL.test(config.webhook.url);
	const channelReady = config.channel.enabled && CHANNEL_ID.test(config.channel.id);
	const queues = { webhook: Promise.resolve(), channel: Promise.resolve() };

	if (config.mode) {
		if (config.webhook.enabled && !webhookReady) {
			log('logging', 'Webhook logging is on but LOG_WEBHOOK_URL is missing or not a Discord webhook URL.');
		}
		if (config.channel.enabled && !channelReady) {
			log('logging', 'Channel logging is on but LOG_CHANNEL_ID is missing or not a valid channel ID.');
		}
	}

	const clean = (value: string) => redact(value, knownSecrets);

	// Each destination runs its own queue so one slow or failing destination
	// never delays the others, and sends keep their order under rate limits.
	function enqueue(name: keyof typeof queues, job: () => Promise<unknown>): Promise<void> {
		queues[name] = queues[name]
			.then(job)
			.then(() => undefined)
			.catch((error) => log('logging', `${name} logging failed: ${clean(describeError(error))}`));
		return queues[name];
	}

	async function postWebhook(body: string): Promise<void> {
		const request = () =>
			send(config.webhook.url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body,
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});

		let response = await request();
		if (response.status === 429) {
			const header = response.headers.get('retry-after');
			const retryAfter = header === null || header.trim() === '' ? 1 : Number(header);
			const waitMs = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : 1000;
			if (waitMs > MAX_RATE_LIMIT_WAIT_MS) {
				throw new Error(
					`Webhook rate limit asked for a ${Math.ceil(waitMs / 1000)}s wait, above the ${MAX_RATE_LIMIT_WAIT_MS / 1000}s limit.`,
				);
			}
			await sleep(waitMs);
			response = await request();
		}
		if (!response.ok) throw new Error(`Webhook request failed with status ${response.status}.`);
	}

	/** Never throws and never blocks the caller. The promise settles once every destination is done. */
	function record(action: QuestLogAction, user: LogUser, quest?: LogQuest, reason?: string): Promise<void> {
		if (!config.mode) return Promise.resolve();

		const meta = ACTIONS[action];
		const userName = clean(user.username);
		const userId = clean(user.id);
		const questName = quest ? clean(quest.displayName) : '';
		const now = new Date();
		const timestamp = now.toISOString().replace('T', ' ').slice(0, 19);

		const fields: Array<[string, string]> = [
			['User', userName],
			['User ID', userId],
			['Action', meta.label],
		];
		if (quest) fields.push(['Quest', questName], ['Quest ID', clean(quest.id)]);
		if (reason) fields.push(['Reason', truncate(clean(reason), 1000)]);

		if (config.console.enabled) {
			const lines = fields.map(([name, value]) => `${name}: ${value}`);
			console.log(['[ QUEST USER LOGS ]', ...lines, `Timestamp: ${timestamp}`].join('\n'));
		}

		const embed: APIEmbed = {
			title: meta.label,
			description: `<@${userId}> (${userName}/${userId}) ${meta.text(questName)}`,
			color: meta.color,
			fields: fields.slice(1).map(([name, value]) => ({ name, value: truncate(value, 1024), inline: name !== 'Reason' })),
			timestamp: now.toISOString(),
		};
		const jobs: Array<Promise<void>> = [];

		if (webhookReady) {
			const body = JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } });
			jobs.push(enqueue('webhook', () => postWebhook(body)));
		}

		if (channelReady) {
			jobs.push(
				enqueue('channel', async () => {
					const channel = await resolveChannel(config.channel.id);
					if (!channel) throw new Error('The log channel was not found or the bot cannot send messages there.');
					await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
				}),
			);
		}

		return Promise.all(jobs).then(() => undefined);
	}

	return {
		record,
		/** The log channel is read through the bot's own client, so it has to be handed over once it exists. */
		attachClient(value: Client) {
			client = value;
		},
	};
}

export const questLog = createQuestLogger(logging, { secrets: [process.env.DISCORD_TOKEN ?? ''] });
