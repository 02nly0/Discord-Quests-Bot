import type { DiscordApiClient } from './client';

export interface DiscordUser {
	id: string;
	username: string;
}

/**
 * Loosely validates the token shape: three dot-separated segments, the first
 * being the base64-encoded user ID. This is only a sanity check - the real
 * validation is `fetchCurrentUser` hitting the API.
 */
export function isTokenShaped(token: string): boolean {
	const parts = token.split('.');
	return parts.length === 3 && parts.every((part) => part.length > 0);
}

/** Strips surrounding quotes and whitespace users tend to paste along. */
export function cleanToken(token: string): string {
	return token.trim().replace(/^["']+|["']+$/g, '');
}

/** Looks the token up against the API; returns null when it is invalid or expired. */
export async function fetchCurrentUser(client: DiscordApiClient): Promise<DiscordUser | null> {
	try {
		const user = await client.get<DiscordUser>('/users/@me');
		return typeof user?.id === 'string' ? user : null;
	} catch {
		return null;
	}
}
