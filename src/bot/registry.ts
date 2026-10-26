import type { DiscordApiClient } from '../api/client';
import type { Quest } from '../quest';

export interface PendingSetup {
	client: DiscordApiClient;
	quests: Quest[];
	index: number;
	showCompleted: boolean;
	updatedAt: number;
}

export interface ActiveRun {
	controller: AbortController;
}

export const SETUP_TTL_MS = 15 * 60 * 1000;

/**
 * Per-user state, keyed by the Discord user who triggered it. Every lookup is
 * keyed by the interacting user, and the bot layer verifies button ownership
 * before mutating anything here, so a user can only reach their own setup or
 * run.
 */
export const pendingSetups = new Map<string, PendingSetup>();
export const activeRuns = new Map<string, ActiveRun>();

/** Evicts abandoned setups. Never evicts users with an active quest run. */
export function cleanExpiredSetups(now = Date.now()): void {
	for (const [userId, setup] of pendingSetups) {
		if (activeRuns.has(userId)) continue;
		if (now - setup.updatedAt > SETUP_TTL_MS) {
			pendingSetups.delete(userId);
		}
	}
}

export function getPendingSetup(userId: string, now = Date.now()): PendingSetup | undefined {
	cleanExpiredSetups(now);
	const setup = pendingSetups.get(userId);
	if (setup) {
		setup.updatedAt = now;
	}
	return setup;
}

export function setPendingSetup(
	userId: string,
	setup: Omit<PendingSetup, 'updatedAt'>,
	now = Date.now(),
): PendingSetup {
	cleanExpiredSetups(now);
	const record: PendingSetup = { ...setup, updatedAt: now };
	pendingSetups.set(userId, record);
	return record;
}

export function deletePendingSetup(userId: string): void {
	pendingSetups.delete(userId);
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startSetupCleanup(intervalMs = 60_000): void {
	if (cleanupTimer) return;
	cleanupTimer = setInterval(() => cleanExpiredSetups(), intervalMs);
	cleanupTimer.unref();
}
