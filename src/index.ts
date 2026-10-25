import { startBot } from './bot';
import { loadConfig } from './config';

const config = loadConfig();

startBot(config).catch((error) => {
	console.error('The bot crashed during startup:', error);
	process.exit(1);
});
