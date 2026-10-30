import { EmbedBuilder } from 'discord.js';
import type { Language } from '../config';
import type { Quest, QuestBatchResult } from '../quest';
import { progressBar, truncate } from '../util/format';
import { DASHBOARD_COPY } from './i18n';
import { formatDuration, formatElapsed } from '../util/time';

export const COLORS = {
	primary: 0x5865f2,
	success: 0x57f287,
	warning: 0xfee75c,
	danger: 0xed4245,
} as const;

const REWARD_TYPES: Partial<Record<number, string>> = {
	1: 'Redeemable code',
	2: 'In-game item',
	3: 'Collectible',
	4: 'Orbs',
	5: 'Nitro trial',
};

function formatCount(value: number): string {
	return value.toLocaleString('en-US');
}

function rewardValue(quest: Quest): string {
	if (quest.rewards.length === 0) return 'Unknown reward';

	const blocks = quest.rewards.map((reward) => {
		if (reward.orbs > 0) {
			const lines = [`**${formatCount(reward.orbs)} Orbs**`];
			if (reward.premiumOrbs > reward.orbs) {
				lines.push(`-# ${formatCount(reward.premiumOrbs)} Orbs with Nitro`);
			}
			return lines.join('\n');
		}

		const label = REWARD_TYPES[reward.type ?? 0];
		const name = reward.name === 'Unknown reward' ? (label ?? 'Unknown reward') : reward.name;
		const lines = [`**${name}**`];
		if (label && reward.name !== 'Unknown reward' && !name.toLowerCase().includes(label.toLowerCase())) {
			lines.push(`-# ${label}`);
		}
		return lines.join('\n');
	});

	return truncate(blocks.join('\n\n'), 1024);
}

export function questEmbed(quest: Quest, index: number, total: number): EmbedBuilder {
	const task = quest.solvableTask;
	const embed = new EmbedBuilder()
		.setColor(quest.brandColor ?? COLORS.primary)
		.setAuthor({
			name: truncate(quest.gameName || quest.applicationName || 'Discord Quest', 256),
			iconURL: quest.logotypeUrl ?? undefined,
		})
		.setTitle(truncate(quest.questName, 256));

	const status = quest.isCompleted
		? 'Completed. Claim your reward in the Discord client.'
		: task
			? null
			: 'This quest cannot be completed automatically.';
	const description = [status, quest.tagline].filter(Boolean).join('\n\n');
	if (description) embed.setDescription(truncate(description, 4096));

	// Discord sends "PLACEHOLDER" for art it has not published, so the model
	// resolves only real image assets and this falls through to the game tile.
	const thumbnail = quest.rewardImageUrl ?? quest.tileUrl;
	if (thumbnail) embed.setThumbnail(thumbnail);
	if (quest.heroUrl) embed.setImage(quest.heroUrl);

	embed.addFields({ name: 'Reward', value: rewardValue(quest) });

	// A finished quest is judged by its claim deadline; an active one by when
	// the quest itself closes.
	const deadline = quest.isCompleted ? quest.rewardsExpireAt : quest.expiresAt;
	if (deadline) {
		embed.addFields({
			name: quest.isCompleted ? 'Claim by' : 'Ends',
			value: `<t:${Math.floor(deadline.getTime() / 1000)}:R>`,
			inline: true,
		});
	}

	if (quest.isCompleted) {
		embed.addFields({ name: 'Progress', value: `${progressBar(100)} 100%`, inline: true });
	} else if (!task) {
		embed.addFields({ name: 'Progress', value: 'Not supported by the bot', inline: true });
	} else {
		embed.addFields({
			name: 'Progress',
			value: `${progressBar(task.percent)} ${task.percent}%\n${formatDuration(task.current)} of ${formatDuration(task.target)}`,
			inline: true,
		});
	}

	const page = `Quest ${index + 1} of ${total}`;
	embed.setFooter({ text: quest.publisher ? `${truncate(quest.publisher, 100)} · ${page}` : page });

	return embed;
}

export function dashboardEmbed(language: Language, botName: string, botIcon?: string): EmbedBuilder {
	const copy = DASHBOARD_COPY[language];

	return new EmbedBuilder()
		.setColor(COLORS.primary)
		.setAuthor({ name: truncate(botName, 256), iconURL: botIcon })
		.setTitle(copy.title)
		.setDescription(copy.description)
		.addFields(copy.fields)
		.setImage('attachment://dashboard-banner.png')
		.setFooter({ text: copy.footer, iconURL: botIcon });
}

export function automationStartedEmbed(total: number): EmbedBuilder {
	const quests = total === 1 ? '1 quest' : `${total} quests`;
	return new EmbedBuilder()
		.setColor(COLORS.primary)
		.setTitle('Automation started')
		.setDescription(
			`I'm completing **${quests}** for you and will message you as each one finishes.\n\n` +
				'You can close this message. The run continues in the background.',
		);
}

export function questCompletedEmbed(quest: Quest, index: number, total: number): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setColor(quest.brandColor ?? COLORS.success)
		.setAuthor({
			name: truncate(quest.gameName || quest.applicationName || 'Discord Quest', 256),
			iconURL: quest.logotypeUrl ?? undefined,
		})
		.setTitle('Quest completed')
		.setDescription(truncate(`**${quest.questName}** is done. Claim your reward in the Discord client.`, 4096));

	const thumbnail = quest.rewardImageUrl ?? quest.tileUrl;
	if (thumbnail) embed.setThumbnail(thumbnail);

	embed.addFields({ name: 'Reward', value: rewardValue(quest) });

	if (quest.rewardsExpireAt) {
		embed.addFields({
			name: 'Claim by',
			value: `<t:${Math.floor(quest.rewardsExpireAt.getTime() / 1000)}:R>`,
			inline: true,
		});
	}

	embed.setFooter({ text: `Quest ${index} of ${total}` });

	return embed;
}

export function dmUnavailableEmbed(): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(COLORS.warning)
		.setTitle('Direct messages are closed')
		.setDescription(
			'I could not send you a DM, so I will show progress here instead.\n\n' +
				'Enable **Allow direct messages from server members** in your Discord privacy settings to get quest updates in your DMs.',
		);
}

export function noQuestsEmbed(): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(COLORS.success)
		.setTitle('All quests completed')
		.setDescription('Nothing left to automate. Claim your rewards in the Discord client.');
}

/** Mutable snapshot of a batch run, kept up to date by the interaction flow. */
export interface AutomationSnapshot {
	questName: string;
	index: number;
	total: number;
	completedCount: number;
	current: number;
	target: number;
	percent: number;
}

export function progressEmbed(snapshot: AutomationSnapshot): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(COLORS.primary)
		.setTitle('Completing your quests')
		.addFields(
			{
				name: `Quest ${snapshot.index} of ${snapshot.total}`,
				value: snapshot.questName,
			},
			{
				name: 'Progress',
				value:
					`${progressBar(snapshot.percent)} ` +
					`\`${formatDuration(snapshot.current)} / ${formatDuration(snapshot.target)}\` ` +
					`(${Math.floor(snapshot.percent)}%)`,
			},
			{
				name: 'Batch',
				value: `${snapshot.completedCount} of ${snapshot.total} completed`,
			},
		);
}

export function summaryEmbed(result: QuestBatchResult, elapsedMs: number): EmbedBuilder {
	const finished = result.completed.length;
	const failed = result.failed.length;

	const embed = new EmbedBuilder().setColor(
		result.stopped ? COLORS.warning : finished > 0 ? COLORS.success : COLORS.danger,
	);

	if (result.stopped) {
		embed.setTitle('Automation stopped');
	} else if (finished > 0) {
		embed.setTitle('All quests completed');
	} else {
		embed.setTitle('Nothing was completed');
	}

	const lines = [`**Completed:** ${finished}`, `**Failed:** ${failed}`, `**Duration:** ${formatElapsed(elapsedMs)}`];

	for (const { quest, reason } of result.failed.slice(0, 3)) {
		lines.push(`- ${truncate(quest.displayName, 80)}: ${truncate(reason, 120)}`);
	}

	embed.setDescription(`${lines.join('\n')}\n\nClaim your rewards in the Discord client.`);

	return embed;
}

export function invalidTokenEmbed(): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(COLORS.danger)
		.setTitle('Invalid token')
		.setDescription('That token was rejected by Discord. Make sure you copied a **user token** and try `/quests` again.');
}

export function errorEmbed(message: string): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(COLORS.danger)
		.setTitle('Automation failed')
		.setDescription(truncate(message, 1000));
}
