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
import { activeRuns, deletePendingSetup, getPendingSetup, setPendingSetup, type PendingSetup } from './registry';

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
		} else if (interaction.isButton() && interaction.customId.startsWith('quests:')) {
			await handleButtonInteraction(interaction);
		}
	} catch (error) {
		log('bot', `interaction failed: ${describeError(error)}`);
		await recoverInteraction(interaction, 'Something went wrong while handling that. Please try again.');
	}
}

/** Ownership is carried in the custom ID so the check does not depend on setup state. */
export function isButtonOwner(customId: string, userId: string, messageOwnerId?: string): boolean {
	const ownerId = customId.split(':')[2] ?? messageOwnerId;
	return ownerId === undefined || ownerId === userId;
}

async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
	const action = interaction.customId.split(':')[1];

	if (!isButtonOwner(interaction.customId, interaction.user.id, interaction.message.interactionMetadata?.user.id)) {
		await interaction.reply({
			content: 'This menu belongs to someone else. Run `/quests` to start your own session.',
			ephemeral: true,
		});
		return;
	}

	if (action === 'prev') {
		await browseQuests(interaction, -1);
	} else if (action === 'next') {
		await browseQuests(interaction, 1);
	} else if (action === 'confirm') {
		await confirmQuest(interaction);
	} else if (action === 'toggle-completed') {
		await toggleCompleted(interaction);
	} else if (action === 'complete-all') {
		await startRun(interaction, null);
	} else if (action === 'stop') {
		await stopRun(interaction);
	} else {
		await interaction.reply({ content: 'That button is no longer available. Run `/quests` again.', ephemeral: true });
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

	const setup = setPendingSetup(interaction.user.id, { client, quests, index: 0, showCompleted: false });
	await interaction.editReply(setupView(setup, interaction.user.id));
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

function setupView(setup: PendingSetup, userId: string) {
	const quests = visibleQuests(setup);
	const quest = quests[setup.index];
	return {
		embeds: [quest ? questEmbed(quest, setup.index, quests.length) : noQuestsEmbed()],
		components: questRows(setup, quests, userId),
	};
}

function questRows(setup: PendingSetup, quests: Quest[], userId: string): ActionRowBuilder<ButtonBuilder>[] {
	const quest = quests[setup.index];
	const completed = setup.quests.filter((item) => item.isCompleted).length;
	const canBrowse = quests.length > 1;

	const back = new ButtonBuilder()
		.setCustomId(`${PREV_ID}:${userId}`)
		.setLabel('Back')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(!canBrowse);

	const confirm = new ButtonBuilder()
		.setCustomId(`${CONFIRM_ID}:${userId}`)
		.setLabel('Confirm')
		.setStyle(ButtonStyle.Success)
		.setDisabled(!quest?.isAutomatable);

	const next = new ButtonBuilder()
		.setCustomId(`${NEXT_ID}:${userId}`)
		.setLabel('Next')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(!canBrowse);

	const toggle = new ButtonBuilder()
		.setCustomId(`${TOGGLE_COMPLETED_ID}:${userId}`)
		.setLabel(`${setup.showCompleted ? 'Hide' : 'Show'} completed${completed > 0 ? ` (${completed})` : ''}`)
		.setStyle(setup.showCompleted ? ButtonStyle.Primary : ButtonStyle.Secondary)
		.setDisabled(completed === 0);

	const completeAll = new ButtonBuilder()
		.setCustomId(`${COMPLETE_ALL_ID}:${userId}`)
		.setLabel('Complete all quests')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(automatableQuests(setup.quests).length === 0);

	return [
		new ActionRowBuilder<ButtonBuilder>().addComponents(back, confirm, next),
		new ActionRowBuilder<ButtonBuilder>().addComponents(toggle, completeAll),
	];
}

async function browseQuests(interaction: ButtonInteraction, step: number): Promise<void> {
	const setup = getPendingSetup(interaction.user.id);
	if (!setup) {
		await interaction.reply({ content: 'Run `/quests` again to load your quests.', ephemeral: true });
		return;
	}

	const quests = visibleQuests(setup);
	if (quests.length > 0) {
		setup.index = (setup.index + step + quests.length) % quests.length;
	}
	await interaction.update(setupView(setup, interaction.user.id));
}

async function toggleCompleted(interaction: ButtonInteraction): Promise<void> {
	const setup = getPendingSetup(interaction.user.id);
	if (!setup) {
		await interaction.reply({ content: 'Run `/quests` again to load your quests.', ephemeral: true });
		return;
	}

	setup.showCompleted = !setup.showCompleted;
	const quests = visibleQuests(setup);
	setup.index = Math.min(setup.index, Math.max(0, quests.length - 1));
	await interaction.update(setupView(setup, interaction.user.id));
}

async function confirmQuest(interaction: ButtonInteraction): Promise<void> {
	const setup = getPendingSetup(interaction.user.id);
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
	const setup = getPendingSetup(interaction.user.id);
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
	deletePendingSetup(interaction.user.id);

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

	let refresh: ThrottledEditor | undefined;

	// The quest browser becomes the progress message in place, so a run never
	// adds a second embed to the channel. Later edits go through the message
	// object, whose bot token does not expire like the interaction token does.
	const message = interaction.message;

	try {
		await interaction.update({ embeds: [progressEmbed(snapshot)], components: [stopRow(interaction.user.id)] });

		refresh = new ThrottledEditor(
			() => message.edit({ embeds: [progressEmbed(snapshot)], components: [stopRow(interaction.user.id)] }),
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
		await message.edit({ embeds: [errorEmbed(describeError(error))], components: [] }).catch(() => undefined);
	} finally {
		// Covers the error paths that never reached the explicit dispose above.
		await refresh?.dispose();
		activeRuns.delete(interaction.user.id);
	}
}

function stopRow(userId: string): ActionRowBuilder<ButtonBuilder> {
	const stop = new ButtonBuilder().setCustomId(`${STOP_ID}:${userId}`).setLabel('Stop').setStyle(ButtonStyle.Danger);
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
