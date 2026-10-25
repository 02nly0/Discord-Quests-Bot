import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type Interaction,
	type Message,
	type ModalSubmitInteraction,
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
import { describeError } from '../util/format';
import { ThrottledEditor } from '../util/throttle';
import {
	invalidTokenEmbed,
	noQuestsEmbed,
	progressEmbed,
	questEmbed,
	summaryEmbed,
	errorEmbed,
	type AutomationSnapshot,
} from './embeds';
import { activeRuns, pendingSetups, type PendingSetup } from './registry';

const PROGRESS_EDIT_INTERVAL_MS = 4_000;

const MODAL_ID = 'quests:token';
const TOKEN_INPUT_ID = 'quests:token:input';
const COMPLETE_ALL_ID = 'quests:complete-all';
const STOP_ID = 'quests:stop';
const PREV_ID = 'quests:prev';
const NEXT_ID = 'quests:next';
const CONFIRM_ID = 'quests:confirm';
const TOGGLE_COMPLETED_ID = 'quests:toggle-completed';

export async function handleInteraction(interaction: Interaction): Promise<void> {
	try {
		if (interaction.isChatInputCommand() && interaction.commandName === 'quests') {
			await showTokenModal(interaction);
		} else if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
			await beginQuestSetup(interaction);
		} else if (interaction.isButton() && interaction.customId === PREV_ID) {
			await browseQuests(interaction, -1);
		} else if (interaction.isButton() && interaction.customId === NEXT_ID) {
			await browseQuests(interaction, 1);
		} else if (interaction.isButton() && interaction.customId === CONFIRM_ID) {
			await confirmQuest(interaction);
		} else if (interaction.isButton() && interaction.customId === TOGGLE_COMPLETED_ID) {
			await toggleCompleted(interaction);
		} else if (interaction.isButton() && interaction.customId === COMPLETE_ALL_ID) {
			await startRun(interaction, null);
		} else if (interaction.isButton() && interaction.customId === STOP_ID) {
			await stopRun(interaction);
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

	const setup: PendingSetup = { client, quests, index: 0, showCompleted: false };
	pendingSetups.set(interaction.user.id, setup);
	await interaction.editReply(setupView(setup));
}

/**
 * Completed quests stay in the list but move to the end, so the quests that
 * still pay out come first and the finished ones never block browsing.
 */
function orderedQuests(quests: Quest[]): Quest[] {
	return [...quests.filter((quest) => !quest.isCompleted), ...quests.filter((quest) => quest.isCompleted)];
}

function visibleQuests(setup: PendingSetup): Quest[] {
	const ordered = orderedQuests(setup.quests);
	return setup.showCompleted ? ordered : ordered.filter((quest) => !quest.isCompleted);
}

function setupView(setup: PendingSetup) {
	const quests = visibleQuests(setup);
	const quest = quests[setup.index];
	return {
		embeds: [quest ? questEmbed(quest, setup.index, quests.length) : noQuestsEmbed()],
		components: questRows(setup, quests),
	};
}

function questRows(setup: PendingSetup, quests: Quest[]): ActionRowBuilder<ButtonBuilder>[] {
	const quest = quests[setup.index];
	const completed = setup.quests.filter((item) => item.isCompleted).length;
	const canBrowse = quests.length > 1;

	const back = new ButtonBuilder()
		.setCustomId(PREV_ID)
		.setLabel('Back')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(!canBrowse);

	const confirm = new ButtonBuilder()
		.setCustomId(CONFIRM_ID)
		.setLabel('Confirm')
		.setStyle(ButtonStyle.Success)
		.setDisabled(!quest?.isAutomatable);

	const next = new ButtonBuilder()
		.setCustomId(NEXT_ID)
		.setLabel('Next')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(!canBrowse);

	const toggle = new ButtonBuilder()
		.setCustomId(TOGGLE_COMPLETED_ID)
		.setLabel(`${setup.showCompleted ? 'Hide' : 'Show'} completed${completed > 0 ? ` (${completed})` : ''}`)
		.setStyle(setup.showCompleted ? ButtonStyle.Primary : ButtonStyle.Secondary)
		.setDisabled(completed === 0);

	const completeAll = new ButtonBuilder()
		.setCustomId(COMPLETE_ALL_ID)
		.setLabel('Complete all quests')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(automatableQuests(setup.quests).length === 0);

	return [
		new ActionRowBuilder<ButtonBuilder>().addComponents(back, confirm, next),
		new ActionRowBuilder<ButtonBuilder>().addComponents(toggle, completeAll),
	];
}

async function browseQuests(interaction: ButtonInteraction, step: number): Promise<void> {
	const setup = pendingSetups.get(interaction.user.id);
	if (!setup) {
		await interaction.reply({ content: 'Run `/quests` again to load your quests.', ephemeral: true });
		return;
	}

	const quests = visibleQuests(setup);
	if (quests.length > 0) {
		setup.index = (setup.index + step + quests.length) % quests.length;
	}
	await interaction.update(setupView(setup));
}

async function toggleCompleted(interaction: ButtonInteraction): Promise<void> {
	const setup = pendingSetups.get(interaction.user.id);
	if (!setup) {
		await interaction.reply({ content: 'Run `/quests` again to load your quests.', ephemeral: true });
		return;
	}

	setup.showCompleted = !setup.showCompleted;
	const quests = visibleQuests(setup);
	setup.index = Math.min(setup.index, Math.max(0, quests.length - 1));
	await interaction.update(setupView(setup));
}

async function confirmQuest(interaction: ButtonInteraction): Promise<void> {
	const setup = pendingSetups.get(interaction.user.id);
	if (!setup) {
		await interaction.reply({ content: 'Run `/quests` again to load your quests.', ephemeral: true });
		return;
	}

	const quest = visibleQuests(setup)[setup.index];
	if (!quest) {
		await interaction.reply({ content: 'Pick a quest first.', ephemeral: true });
		return;
	}

	await startRun(interaction, quest.id);
}

async function startRun(interaction: ButtonInteraction, questId: string | null): Promise<void> {
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
	interaction: ButtonInteraction,
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
