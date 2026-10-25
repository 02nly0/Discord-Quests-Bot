import type { DiscordApiClient } from '../api/client';

const executableCache = new Map<string, string>();

/**
 * Resolves the Windows executable path Discord expects in game heartbeats.
 * The path itself is not validated by Discord beyond shape, so a cached
 * lookup from the public application directory is enough - and when that
 * lookup fails, a plausible `win64/<slug>.exe` fallback works as well.
 */
export async function resolveExecutablePath(
	client: DiscordApiClient,
	applicationId: string,
	applicationName: string,
): Promise<string> {
	const cached = executableCache.get(applicationId);
	if (cached) return cached;

	const fallback = `win64/${slugify(applicationName)}.exe`;

	try {
		const apps = await client.get<
			Array<{ id: string; executables?: Array<{ name: string; os: string; is_launcher?: boolean }> }>
		>(`/applications/public?application_ids=${applicationId}`);

		const executables = apps[0]?.executables ?? [];
		const windows =
			executables.find((it) => it.os === 'win32' && !it.is_launcher) ??
			executables.find((it) => it.os === 'win32') ??
			executables[0];

		if (windows?.name) {
			const resolved = windows.name.replace(/^>/, '');
			executableCache.set(applicationId, resolved);
			return resolved;
		}
	} catch {
		// Fall through to the derived path below.
	}

	executableCache.set(applicationId, fallback);
	return fallback;
}

function slugify(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'game';
}
