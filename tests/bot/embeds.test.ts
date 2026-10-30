import { describe, expect, it } from 'bun:test';
import { Quest } from '../../src/quest';
import {
	COLORS,
	automationStartedEmbed,
	dmUnavailableEmbed,
	errorEmbed,
	invalidTokenEmbed,
	progressEmbed,
	questCompletedEmbed,
	questEmbed,
	summaryEmbed,
	type AutomationSnapshot,
} from '../../src/bot/embeds';
import type { QuestBatchResult } from '../../src/quest';
import type { QuestPayload } from '../../src/quest/types';

function quest(id: string, config?: Partial<QuestPayload['config']>): Quest {
	return new Quest({
		id,
		config: {
			messages: { quest_name: `Quest ${id}`, game_title: 'Test Game' },
			task_config_v2: { tasks: { WATCH_VIDEO: { target: 20 } } },
			...config,
		},
	});
}

describe('questEmbed', () => {
	it('shows the game, quest name, and page position', () => {
		const embed = questEmbed(quest('a'), 0, 3).toJSON();

		expect(embed.author?.name).toBe('Test Game');
		expect(embed.title).toBe('Quest a');
		expect(embed.footer?.text).toBe('Quest 1 of 3');
		expect(embed.description).toBeUndefined();
	});

	it('shows progress for the task the bot will run', () => {
		const payload = quest('a').payload;
		payload.user_status = { progress: { WATCH_VIDEO: { value: 10 } } };

		const embed = questEmbed(new Quest(payload), 1, 2).toJSON();
		const progress = embed.fields?.find((field) => field.name === 'Progress');

		expect(progress?.value).toContain('50%');
		expect(progress?.value).toContain('10s of 20s');
	});

	it('lists orb and collectible rewards together', () => {
		const embed = questEmbed(
			quest('a', {
				rewards_config: {
					rewards: [
						{ type: 4, orb_quantity: 1000, premium_orb_quantity: 1200, messages: { name: '1,000 Orbs' } },
						{ type: 3, messages: { name: 'Wumpus in a Box' } },
					],
				},
			}),
			0,
			1,
		).toJSON();

		const reward = embed.fields?.find((field) => field.name === 'Reward');
		expect(reward?.value).toBe('**1,000 Orbs**\n-# 1,200 Orbs with Nitro\n\n**Wumpus in a Box**\n-# Collectible');
	});

	it('names the reward type when the reward name is specific', () => {
		const embed = questEmbed(
			quest('a', { rewards_config: { rewards: [{ type: 1, messages: { name: 'Cybernetic Headgear' } }] } }),
			0,
			1,
		).toJSON();

		const reward = embed.fields?.find((field) => field.name === 'Reward');
		expect(reward?.value).toBe('**Cybernetic Headgear**\n-# Redeemable code');
	});

	it('uses the quest art for the thumbnail and banner', () => {
		const embed = questEmbed(
			quest('a', { assets: { game_tile: 'quests/tile.png', hero: 'quests/hero.png' } }),
			0,
			1,
		).toJSON();

		expect(embed.thumbnail?.url).toBe('https://cdn.discordapp.com/quests/tile.png');
		expect(embed.image?.url).toBe('https://cdn.discordapp.com/quests/hero.png');
	});

	it('prefers the reward art as the thumbnail', () => {
		const embed = questEmbed(
			quest('a', {
				assets: { game_tile: 'quests/tile.png' },
				rewards_config: {
					rewards: [{ type: 3, asset: 'headgear.png', messages: { name: 'Headgear' } }],
				},
			}),
			0,
			1,
		).toJSON();

		expect(embed.thumbnail?.url).toBe('https://cdn.discordapp.com/quests/a/headgear.png');
	});

	it('falls back to the game art when the reward has no image', () => {
		const embed = questEmbed(
			quest('a', {
				assets: { game_tile: 'quests/tile.png' },
				rewards_config: { rewards: [{ type: 4, orb_quantity: 1000, messages: { name: '1,000 Orbs' } }] },
			}),
			0,
			1,
		).toJSON();

		expect(embed.thumbnail?.url).toBe('https://cdn.discordapp.com/quests/tile.png');
	});

	it('does not try to render a video hero as a banner', () => {
		const embed = questEmbed(quest('a', { assets: { hero: 'quests/hero.mp4' } }), 0, 1).toJSON();
		expect(embed.image).toBeUndefined();
	});

	it('ignores placeholder art and uses the published game tile', () => {
		const embed = questEmbed(
			quest('a', {
				assets: {
					game_tile: 'PLACEHOLDER',
					logotype: 'PLACEHOLDER',
					game_tile_light: 'quests/a/tile.png',
					logotype_light: 'quests/a/logo.png',
				},
			}),
			0,
			1,
		).toJSON();

		expect(embed.thumbnail?.url).toBe('https://cdn.discordapp.com/quests/a/tile.png');
		expect(embed.author?.icon_url).toBe('https://cdn.discordapp.com/quests/a/logo.png');
	});

	it('does not use a reward video as the thumbnail', () => {
		const embed = questEmbed(
			quest('a', {
				assets: { game_tile_light: 'quests/a/tile.png' },
				rewards_config: { rewards: [{ type: 3, asset: 'decoration.mp4', messages: { name: 'Decoration' } }] },
			}),
			0,
			1,
		).toJSON();

		expect(embed.thumbnail?.url).toBe('https://cdn.discordapp.com/quests/a/tile.png');
	});

	it('shows the promo tagline under the quest name', () => {
		const embed = questEmbed(
			quest('a', {
				task_config_v2: {
					tasks: {
						WATCH_VIDEO: { target: 20, messages: { task_description: 'Watch the launch trailer.' } },
					},
				},
			}),
			0,
			1,
		).toJSON();

		expect(embed.description).toBe('Watch the launch trailer.');
	});

	it('names the publisher in the footer', () => {
		const embed = questEmbed(
			quest('a', { messages: { quest_name: 'Quest a', game_title: 'Test Game', game_publisher: 'Test Studio' } }),
			2,
			7,
		).toJSON();

		expect(embed.footer?.text).toBe('Test Studio · Quest 3 of 7');
	});

	it('uses the quest brand color and falls back to the default', () => {
		expect(questEmbed(quest('a', { colors: { primary: '#E944D4' } }), 0, 1).toJSON().color).toBe(0xe944d4);
		expect(questEmbed(quest('a'), 0, 1).toJSON().color).toBe(COLORS.primary);
	});

	it('marks a completed quest and its full bar', () => {
		const payload = quest('a').payload;
		payload.user_status = { completed_at: '2026-10-02T00:00:00.000Z', progress: { WATCH_VIDEO: { value: 20 } } };

		const embed = questEmbed(new Quest(payload), 0, 1).toJSON();
		const progress = embed.fields?.find((field) => field.name === 'Progress');

		expect(embed.description).toContain('Completed');
		expect(progress?.value).toContain('100%');
	});

	it('shows the claim deadline once a quest is completed', () => {
		const payload = quest('a', {
			rewards_config: { rewards: [], rewards_expire_at: '2026-11-05T00:00:00.000Z' },
		}).payload;
		payload.user_status = { completed_at: '2026-10-02T00:00:00.000Z' };

		const embed = questEmbed(new Quest(payload), 0, 1).toJSON();
		const claim = embed.fields?.find((field) => field.name === 'Claim by');
		const at = Math.floor(Date.parse('2026-11-05T00:00:00.000Z') / 1000);

		expect(claim?.value).toBe(`<t:${at}:R>`);
		expect(embed.fields?.some((field) => field.name === 'Ends')).toBe(false);
	});

	it('explains a quest the bot cannot run', () => {
		const embed = questEmbed(quest('a', { task_config_v2: { tasks: { DO_THE_DISHES: { target: 5 } } } }), 0, 1).toJSON();
		const progress = embed.fields?.find((field) => field.name === 'Progress');

		expect(embed.description).toBe('This quest cannot be completed automatically.');
		expect(progress?.value).toBe('Not supported by the bot');
	});
});

describe('progressEmbed', () => {
	it('renders the current quest, its progress bar, and batch state', () => {
		const snapshot: AutomationSnapshot = {
			questName: 'Test Game: Quest a',
			index: 2,
			total: 5,
			completedCount: 1,
			current: 120,
			target: 300,
			percent: 40,
		};

		const embed = progressEmbed(snapshot).toJSON();
		const fields = embed.fields ?? [];

		expect(embed.title).toBe('Completing your quests');
		expect(fields[0]).toMatchObject({ name: 'Quest 2 of 5', value: 'Test Game: Quest a' });
		expect(fields[1]?.value).toContain('40%');
		expect(fields[1]?.value).toContain('2m 0s / 5m 0s');
		expect(fields[2]).toMatchObject({ name: 'Batch', value: '1 of 5 completed' });
	});
});

describe('summaryEmbed', () => {
	it('celebrates when quests finished', () => {
		const result: QuestBatchResult = { completed: [quest('a'), quest('b')], failed: [], stopped: false };
		const embed = summaryEmbed(result, 90_000).toJSON();

		expect(embed.title).toBe('All quests completed');
		expect(embed.description).toContain('**Completed:** 2');
		expect(embed.description).toContain('**Duration:** 1m 30s');
	});

	it('titles a stopped run differently', () => {
		const result: QuestBatchResult = { completed: [quest('a')], failed: [], stopped: true };
		expect(summaryEmbed(result, 1000).toJSON().title).toBe('Automation stopped');
	});

	it('lists up to three failure reasons', () => {
		const failed = [quest('a'), quest('b'), quest('c'), quest('d')].map((q) => ({
			quest: q,
			reason: 'Discord refused enrollment',
		}));
		const result: QuestBatchResult = { completed: [], failed, stopped: false };
		const embed = summaryEmbed(result, 1000).toJSON();

		expect(embed.title).toBe('Nothing was completed');
		const lines = (embed.description ?? '').split('\n').filter((line) => line.startsWith('- '));
		expect(lines).toHaveLength(3);
	});
});

describe('DM embeds', () => {
	it('announces the start of a single quest run', () => {
		const embed = automationStartedEmbed(1).toJSON();

		expect(embed.title).toBe('Automation started');
		expect(embed.description).toContain('**1 quest**');
		expect(embed.description).toContain('message you as each one finishes');
	});

	it('announces the start of a multi quest run', () => {
		expect(automationStartedEmbed(3).toJSON().description).toContain('**3 quests**');
	});

	it('shows the completed quest, reward, and batch position', () => {
		const embed = questCompletedEmbed(quest('a'), 1, 3).toJSON();

		expect(embed.title).toBe('Quest completed');
		expect(embed.author?.name).toBe('Test Game');
		expect(embed.description).toContain('**Quest a**');
		expect(embed.description).toContain('Claim your reward');
		expect(embed.fields).toContainEqual(expect.objectContaining({ name: 'Reward' }));
		expect(embed.footer?.text).toBe('Quest 1 of 3');
	});

	it('includes the claim deadline when the reward expires', () => {
		const completed = quest('a', { rewards_config: { rewards_expire_at: '2026-11-05T00:00:00.000Z' } });
		const embed = questCompletedEmbed(completed, 1, 1).toJSON();

		expect(embed.fields).toContainEqual(expect.objectContaining({ name: 'Claim by' }));
	});

	it('explains why progress is shown in the channel instead of DMs', () => {
		const embed = dmUnavailableEmbed().toJSON();

		expect(embed.title).toBe('Direct messages are closed');
		expect(embed.description).toContain('show progress here instead');
	});
});

describe('feedback embeds', () => {
	it('explains rejected tokens', () => {
		expect(invalidTokenEmbed().toJSON().title).toBe('Invalid token');
	});

	it('truncates long error messages', () => {
		const embed = errorEmbed('x'.repeat(2000)).toJSON();
		expect((embed.description ?? '').length).toBeLessThanOrEqual(1000);
	});
});
