import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ButtonInteraction } from 'discord.js';
import { handleInteraction } from '../../src/bot/flow';
import { activeRuns, pendingSetups, setPendingSetup } from '../../src/bot/registry';
import { fakeApiClient } from '../testing/fake-client';

describe('interaction validation', () => {
	beforeEach(() => {
		pendingSetups.clear();
		activeRuns.clear();
	});

	it('rejects button interactions triggered by a different user', async () => {
		const replyMock = mock(async () => {});
		const updateMock = mock(async () => {});

		const interaction = {
			isChatInputCommand: () => false,
			isModalSubmit: () => false,
			isButton: () => true,
			isRepliable: () => true,
			customId: 'quests:next:user-owner',
			user: { id: 'user-intruder' },
			message: {},
			reply: replyMock,
			update: updateMock,
		} as unknown as ButtonInteraction;

		await handleInteraction(interaction);

		expect(replyMock).toHaveBeenCalledTimes(1);
		expect(replyMock).toHaveBeenCalledWith({
			content: 'This menu belongs to someone else. Run `/quests` to start your own session.',
			ephemeral: true,
		});
		expect(updateMock).toHaveBeenCalledTimes(0);
	});

	it('allows button interactions triggered by the matching owner', async () => {
		const { client } = fakeApiClient({});
		setPendingSetup('user-owner', { client, quests: [], index: 0, showCompleted: false });

		const replyMock = mock(async () => {});
		const updateMock = mock(async () => {});

		const interaction = {
			isChatInputCommand: () => false,
			isModalSubmit: () => false,
			isButton: () => true,
			isRepliable: () => true,
			customId: 'quests:next:user-owner',
			user: { id: 'user-owner' },
			message: {},
			reply: replyMock,
			update: updateMock,
		} as unknown as ButtonInteraction;

		await handleInteraction(interaction);

		expect(replyMock).toHaveBeenCalledTimes(0);
		expect(updateMock).toHaveBeenCalledTimes(1);
	});
});
