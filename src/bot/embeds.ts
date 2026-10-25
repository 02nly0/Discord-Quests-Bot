import { EmbedBuilder } from 'discord.js';
import type { Quest, QuestBatchResult } from '../quest';
import { progressBar, truncate } from '../util/format';
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

const IMAGE_ASSET = /\.(png|jpe?g|webp|gif)(\?|$)/i;

function formatCount(value: number): string {
	return value.toLocaleString('en-US');
}

function rewardValue(quest: Quest): string {
	if (quest.rewards.length === 0) return 'Unknown reward';

	const lines = quest.rewards.map((reward) => {
		if (reward.orbs > 0) {
			return reward.premiumOrbs > reward.orbs
				? `${formatCount(reward.orbs)} Orbs (${formatCount(reward.premiumOrbs)} with Nitro)`
				: `${formatCount(reward.orbs)} Orbs`;
		}

		const label = REWARD_TYPES[reward.type ?? 0];
		if (reward.name === 'Unknown reward') return label ?? 'Unknown reward';
		return label && !reward.name.toLowerCase().includes(label.toLowerCase()) ? `${reward.name} (${label})` : reward.name;
	});

	return truncate(lines.join('\n'), 1024);
}

export function questEmbed(quest: Quest, index: number, total: number): EmbedBuilder {
	const task = quest.solvableTask;
	const embed = new EmbedBuilder()
		.setColor(quest.brandColor ?? COLORS.primary)
		.setAuthor({ name: truncate(quest.gameName || quest.applicationName || 'Discord Quest', 256) })
		.setTitle(truncate(quest.questName, 256))
		.setFooter({ text: `Quest ${index + 1} of ${total}` });

	if (quest.isCompleted) {
		embed.setDescription('Completed. Claim your reward in the Discord client.');
	} else if (!task) {
		embed.setDescription('This quest cannot be completed automatically.');
	}

	const thumbnail = quest.tileUrl ?? quest.logotypeUrl;
	if (thumbnail) embed.setThumbnail(thumbnail);

	const hero = quest.heroUrl;
	if (hero && IMAGE_ASSET.test(hero)) embed.setImage(hero);

	embed.addFields({ name: 'Reward', value: rewardValue(quest), inline: true });

	const expiresAt = quest.expiresAt;
	if (expiresAt) {
		embed.addFields({
			name: 'Ends',
			value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
			inline: true,
		});
	}

	if (quest.isCompleted) {
		embed.addFields({ name: 'Progress', value: `${progressBar(100)} 100%` });
	} else if (!task) {
		embed.addFields({ name: 'Progress', value: 'Not supported by the bot' });
	} else {
		embed.addFields({
			name: 'Progress',
			value: `${progressBar(task.percent)} ${task.percent}%\n${formatDuration(task.current)} of ${formatDuration(task.target)}`,
		});
	}

	return embed;
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
