import { EmbedBuilder } from 'discord.js';
import type { Quest } from '../quest';
import { progressBar, truncate } from '../util/format';
import { formatDuration, formatElapsed } from '../util/time';
import type { QuestBatchResult } from '../quest';

export const COLORS = {
	primary: 0x5865f2,
	success: 0x57f287,
	warning: 0xfee75c,
	danger: 0xed4245,
} as const;

export function questListEmbed(quests: Quest[]): EmbedBuilder {
	const automatable = quests.filter((quest) => quest.solvableTask !== null);

	const embed = new EmbedBuilder()
		.setColor(COLORS.primary)
		.setTitle('Your Discord Quests')
		.setDescription(
			`${automatable.length} of ${quests.length} active quests can be completed automatically. ` +
			'Choose a quest below, or run them all.',
		);

	for (const quest of quests.slice(0, 10)) {
		embed.addFields({
			name: truncate(quest.displayName, 256),
			value: quest.formatProgress(),
		});
	}

	if (quests.length > 10) {
		embed.setFooter({ text: `And ${quests.length - 10} more quest(s) - use the menu to pick one.` });
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

	const lines = [
		`**Completed:** ${finished}`,
		`**Failed:** ${failed}`,
		`**Duration:** ${formatElapsed(elapsedMs)}`,
	];

	for (const { quest, reason } of result.failed.slice(0, 3)) {
		lines.push(`- ${truncate(quest.displayName, 80)}: ${truncate(reason, 120)}`);
	}

	embed.setDescription(lines.join('\n') + '\n\nClaim your rewards in the Discord client.');

	return embed;
}

export function invalidTokenEmbed(): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(COLORS.danger)
		.setTitle('Invalid token')
		.setDescription(
			'That token was rejected by Discord. Make sure you copied a **user token** and try `/quests` again.',
		);
}

export function errorEmbed(message: string): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(COLORS.danger)
		.setTitle('Automation failed')
		.setDescription(truncate(message, 1000));
}
