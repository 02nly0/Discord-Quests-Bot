import type { DiscordApiClient } from '../api/client';
import type { Quest } from '../quest';

export interface PendingSetup {
	client: DiscordApiClient;
	quests: Quest[];
	index: number;
}

export interface ActiveRun {
	controller: AbortController;
}

/**
 * Per-user state, keyed by the Discord user who triggered it. Because every
 * lookup is keyed by the interacting user, ownership checks fall out of the
 * map itself, so a user can only ever reach their own setup or run.
 */
export const pendingSetups = new Map<string, PendingSetup>();
export const activeRuns = new Map<string, ActiveRun>();
