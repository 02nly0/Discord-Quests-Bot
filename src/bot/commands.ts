import { REST, Routes, SlashCommandBuilder, type Client } from 'discord.js';

export const questsCommand = new SlashCommandBuilder()
	.setName('quests')
	.setDescription('Automatically complete your Discord quests')
	.toJSON();

export async function registerCommands(client: Client, guildId?: string): Promise<void> {
	const rest = new REST({ version: '10' }).setToken(client.token!);
	const applicationId = client.application!.id;

	if (guildId) {
		await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body: [questsCommand] });
	} else {
		await rest.put(Routes.applicationCommands(applicationId), { body: [questsCommand] });
	}
}
