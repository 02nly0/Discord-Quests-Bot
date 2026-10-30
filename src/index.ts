import { startBot } from './bot';
import { loadConfig } from './config';
import { startServer } from './server';

const config = loadConfig();

startServer();

startBot(config).catch((error) => {
	console.error('The bot crashed during startup:', error);
	process.exit(1);
});
