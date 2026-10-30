import { log } from './util/logger';

export function startServer(): void {
	Bun.serve({
		port: 8080,
		fetch: () => new Response('Discord Quests Bot is running.'),
	});
	log('server', 'health server listening on 8080');
}
