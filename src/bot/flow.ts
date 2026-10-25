import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type Interaction,
	type Message,
	type ModalSubmitInteraction,
	type StringSelectMenuInteraction,
} from 'discord.js';
import {
	automatableQuests,
	completeQuests,
	createApiClient,
	fetchQuests,
	type DiscordApiClient,
	type Quest,
} from '../quest';
import { log } from '../util/logger';
import { describeError, truncate } from '../util/format';
import { ThrottledEditor } from '../util/throttle';
import {
	invalidTokenEmbed,
	progressEmbed,
	questListEmbed,
	summaryEmbed,
	errorEmbed,
	type AutomationSnapshot,
} from './embeds';
import { activeRuns, pendingSetups } from './registry';

const PROGRESS_EDIT_INTERVAL_MS = 4_000;

const MODAL_ID = 'quests:token';
const TOKEN_INPUT_ID = 'quests:token:input';
const COMPLETE_ALL_ID = 'quests:complete-all';
const STOP_ID = 'quests:stop';
const SELECT_ID = 'quests:select';

export async function handleInteraction(interaction: Interaction): Promise<void> {
	try {
		if (interaction.isChatInputCommand() && interaction.commandName === 'quests') {
			await showTokenModal(interaction);
		} else if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
			await beginQuestSetup(interaction);
		} else if (interaction.isButton() && interaction.customId === COMPLETE_ALL_ID) {
			await startRun(interaction, null);
		} else if (interaction.isButton() && interaction.customId === STOP_ID) {
			await stopRun(interaction);
		} else if (interaction.isStringSelectMenu() && interaction.customId === SELECT_ID) {
			await startRun(interaction, interaction.values[0]);
		}
	} catch (error) {
		log('bot', `interaction failed: ${describeError(error)}`);
		await recoverInteraction(interaction, 'Something went wrong while handling that. Please try again.');
	}
}

async function showTokenModal(interaction: ChatInputCommandInteraction): Promise<void> {
	const tokenInput = new TextInputBuilder()
		.setCustomId(TOKEN_INPUT_ID)
		.setLabel('Your Discord token')
		.setPlaceholder('Paste your Discord token. It is never stored or logged.')
		.setStyle(TextInputStyle.Paragraph)
		.setMinLength(40)
		.setMaxLength(120)
		.setRequired(true);

	const modal = new ModalBuilder()
		.setCustomId(MODAL_ID)
		.setTitle('Discord Quests')
		.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(tokenInput));

	await interaction.showModal(modal);
}

async function beginQuestSetup(interaction: ModalSubmitInteraction): Promise<void> {
	await interaction.deferReply();

	const client = await createApiClient(interaction.fields.getTextInputValue(TOKEN_INPUT_ID));
	if (!client) {
		await interaction.editReply({ embeds: [invalidTokenEmbed()], components: [] });
		return;
	}

	const quests = await fetchQuests(client);
	if (quests.length === 0) {
		await interaction.editReply({
			content: 'There are no active quests on your account right now. Check back later.',
			components: [],
		});
		return;
	}

	pendingSetups.set(interaction.user.id, { client, quests });
	await interaction.editReply({
		embeds: [questListEmbed(quests)],
		components: selectionRows(quests),
	});
}

function selectionRows(quests: Quest[]): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
	const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];
	const automatable = automatableQuests(quests);

	if (automatable.length > 1) {
		const select = new StringSelectMenuBuilder()
			.setCustomId(SELECT_ID)
			.setPlaceholder('Pick a single quest to complete')
			.addOptions(
				automatable.slice(0, 25).map((quest) => ({
					label: truncate(quest.displayName, 100),
					description: truncate(`Reward: ${quest.rewardName}`, 100),
					value: quest.id,
				})),
			);
		rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
	}

	const completeAll = new ButtonBuilder()
		.setCustomId(COMPLETE_ALL_ID)
		.setLabel('Complete all')
		.setStyle(ButtonStyle.Primary);

	rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(completeAll));
	return rows;
}

async function startRun(
	interaction: ButtonInteraction | StringSelectMenuInteraction,
	questId: string | null,
): Promise<void> {
	const setup = pendingSetups.get(interaction.user.id);
	if (!setup) {
		await interaction.reply({ content: 'Run `/quests` first to load your quests.', ephemeral: true });
		return;
	}

	if (activeRuns.has(interaction.user.id)) {
		await interaction.reply({
			content: 'You already have an automation running. Press **Stop** to end it first.',
			ephemeral: true,
		});
		return;
	}

	const queue = questId
		? automatableQuests(setup.quests).filter((quest) => quest.id === questId)
		: automatableQuests(setup.quests);

	if (queue.length === 0) {
		await interaction.reply({
			content: 'None of your quests can be automated right now.',
			ephemeral: true,
		});
		return;
	}

	// Claim the slot before awaiting anything so a double-click cannot
	// start two runs.
	const controller = new AbortController();
	activeRuns.set(interaction.user.id, { controller });
	pendingSetups.delete(interaction.user.id);

	await interaction.deferUpdate();
	// The picker has served its purpose; removing its components also prevents
	// the same buttons being pressed again while this run is active.
	await interaction.editReply({ components: [] }).catch(() => undefined);
	await runBatch(interaction, setup.client, queue, controller);
}

async function runBatch(
	interaction: ButtonInteraction | StringSelectMenuInteraction,
	client: DiscordApiClient,
	queue: Quest[],
	controller: AbortController,
): Promise<void> {
	const startedAt = Date.now();
	const firstQuest = queue[0];
	const firstTask = firstQuest.solvableTask;

	const snapshot: AutomationSnapshot = {
		questName: firstQuest.displayName,
		index: 1,
		total: queue.length,
		completedCount: 0,
		current: firstTask?.current ?? 0,
		target: firstTask?.target ?? 0,
		percent: firstTask?.percent ?? 0,
	};

	let progressMessage: Message | undefined;
	let refresh: ThrottledEditor | undefined;

	try {
		// Interaction tokens expire after ~15 minutes, which is shorter than a
		// full batch of game quests. A follow-up is a normal channel message, so
		// the bot token can keep editing it for as long as the run takes.
		progressMessage = await interaction.followUp({
			embeds: [progressEmbed(snapshot)],
			components: [stopRow()],
		});

		const message = progressMessage;
		refresh = new ThrottledEditor(
			() => message.edit({ embeds: [progressEmbed(snapshot)], components: [stopRow()] }),
			PROGRESS_EDIT_INTERVAL_MS,
		);

		const result = await completeQuests({
			client,
			quests: queue,
			signal: controller.signal,
			hooks: {
				onQuestStart(quest, index) {
					const task = quest.solvableTask;
					snapshot.questName = quest.displayName;
					snapshot.index = index;
					snapshot.current = task?.current ?? 0;
					snapshot.target = task?.target ?? 0;
					snapshot.percent = task?.percent ?? 0;
					refresh?.request();
				},
				onQuestProgress(_quest, update) {
					snapshot.current = update.current;
					snapshot.target = update.target;
					snapshot.percent = update.percent;
					refresh?.request();
				},
				onQuestCompleted() {
					snapshot.completedCount += 1;
					refresh?.request();
				},
			},
		});

		// Let an in-flight progress edit settle before the summary replaces it,
		// otherwise a slow edit could land afterwards and overwrite the summary.
		await refresh.dispose();
		await message.edit({
			embeds: [summaryEmbed(result, Date.now() - startedAt)],
			components: [],
		});
	} catch (error) {
		log('bot', `automation failed: ${describeError(error)}`);
		await refresh?.dispose();
		const embed = errorEmbed(describeError(error));
		if (progressMessage) {
			await progressMessage.edit({ embeds: [embed], components: [] }).catch(() => undefined);
		} else {
			await interaction.editReply({ embeds: [embed], components: [] }).catch(() => undefined);
		}
	} finally {
		// Covers the error paths that never reached the explicit dispose above.
		await refresh?.dispose();
		activeRuns.delete(interaction.user.id);
	}
}

function stopRow(): ActionRowBuilder<ButtonBuilder> {
	const stop = new ButtonBuilder().setCustomId(STOP_ID).setLabel('Stop').setStyle(ButtonStyle.Danger);
	return new ActionRowBuilder<ButtonBuilder>().addComponents(stop);
}

async function stopRun(interaction: ButtonInteraction): Promise<void> {
	const run = activeRuns.get(interaction.user.id);
	if (!run) {
		await interaction.reply({ content: 'Nothing is running right now.', ephemeral: true });
		return;
	}

	run.controller.abort();
	await interaction.reply({ content: 'Stopping after the current heartbeat.', ephemeral: true });
}

/** Best-effort fallback when a handler throws before anything was replied. */
async function recoverInteraction(interaction: Interaction, content: string): Promise<void> {
	try {
		if (!interaction.isRepliable()) return;

		if (interaction.deferred || interaction.replied) {
			await interaction.editReply({ content });
		} else {
			await interaction.reply({ content, ephemeral: true });
		}
	} catch {
		// Interaction expired; nothing more we can do.
	}
}
