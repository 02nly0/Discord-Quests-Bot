import { REST, Routes, SlashCommandBuilder } from 'discord.js';

export const questsCommand = new SlashCommandBuilder()
	.setName('quests')
	.setDescription('Automatically complete your Discord quests')
	.toJSON();

export async function registerCommands(token: string, applicationId: string, guildId?: string): Promise<void> {
	const rest = new REST({ version: '10' }).setToken(token);

	if (guildId) {
		await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body: [questsCommand] });
	} else {
		await rest.put(Routes.applicationCommands(applicationId), { body: [questsCommand] });
	}
}
