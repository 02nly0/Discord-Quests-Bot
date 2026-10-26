import { beforeEach, describe, expect, it } from 'bun:test';
import {
	SETUP_TTL_MS,
	activeRuns,
	cleanExpiredSetups,
	deletePendingSetup,
	getPendingSetup,
	pendingSetups,
	setPendingSetup,
} from '../../src/bot/registry';
import { fakeApiClient } from '../testing/fake-client';

describe('registry TTL and session cleanup', () => {
	beforeEach(() => {
		pendingSetups.clear();
		activeRuns.clear();
	});

	it('stores and retrieves a pending setup with an updated timestamp', () => {
		const { client } = fakeApiClient({});
		setPendingSetup('user-1', { client, quests: [], index: 0, showCompleted: false }, 1000);

		const setup = getPendingSetup('user-1', 2000);
		expect(setup).toBeDefined();
		expect(setup?.updatedAt).toBe(2000);
	});

	it('cleans up abandoned setups older than SETUP_TTL_MS', () => {
		const { client } = fakeApiClient({});
		setPendingSetup('user-1', { client, quests: [], index: 0, showCompleted: false }, 1000);

		cleanExpiredSetups(1000 + SETUP_TTL_MS + 1);
		expect(pendingSetups.has('user-1')).toBe(false);
		expect(getPendingSetup('user-1', 1000 + SETUP_TTL_MS + 1)).toBeUndefined();
	});

	it('never evicts or cleans a user with an active run even after long periods', () => {
		const { client } = fakeApiClient({});
		setPendingSetup('user-running', { client, quests: [], index: 0, showCompleted: false }, 1000);
		activeRuns.set('user-running', { controller: new AbortController() });

		// Even after 3 hours (well past SETUP_TTL_MS)
		const threeHoursLater = 1000 + 3 * 60 * 60 * 1000;
		cleanExpiredSetups(threeHoursLater);

		expect(pendingSetups.has('user-running')).toBe(true);
	});

	it('manually deletes setups when runs start', () => {
		const { client } = fakeApiClient({});
		setPendingSetup('user-1', { client, quests: [], index: 0, showCompleted: false });
		deletePendingSetup('user-1');

		expect(pendingSetups.has('user-1')).toBe(false);
	});
});
