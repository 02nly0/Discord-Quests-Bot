import { DiscordApiClient } from '../api/client';
import { fetchCurrentUser, cleanToken, isTokenShaped } from '../api/token';
import { Quest } from './quest';
import type { QuestPayload } from './types';

/**
 * Validates a user token and returns a client bound to it, or null when the
 * token is malformed or rejected. This is the entry point bots should use to
 * turn user input into a working session.
 */
export async function createApiClient(rawToken: string): Promise<DiscordApiClient | null> {
	const token = cleanToken(rawToken);
	if (!isTokenShaped(token)) return null;

	const client = new DiscordApiClient(token);
	return (await fetchCurrentUser(client)) !== null ? client : null;
}

/** Fetches every active (non-expired) quest on the account. */
export async function fetchQuests(client: DiscordApiClient): Promise<Quest[]> {
	const data = await client.get<{ quests?: QuestPayload[] }>('/quests/@me');
	return (data.quests ?? [])
		.filter((payload) => payload.id && payload.config)
		.map((payload) => new Quest(payload))
		.filter((quest) => !quest.isExpired);
}

/** Quests the automation can actually run, in Discord's own ordering. */
export function automatableQuests(quests: Quest[]): Quest[] {
	return quests.filter((quest) => !quest.isCompleted && quest.solvableTask !== null);
}
