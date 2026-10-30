import { PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from 'discord.js';

export const questsCommand = new SlashCommandBuilder()
	.setName('quests')
	.setDescription('Automatically complete your Discord quests.')
	.toJSON();

export const dashboardCommand = new SlashCommandBuilder()
	.setName('dashboard')
	.setDescription('Post the quest completion dashboard in this channel.')
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.toJSON();

export async function registerCommands(
	token: string,
	applicationId: string,
	guildId?: string,
	dashboardEnabled = false,
): Promise<void> {
	const rest = new REST({ version: '10' }).setToken(token);
	const body = dashboardEnabled ? [questsCommand, dashboardCommand] : [questsCommand];

	if (guildId) {
		await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body });
	} else {
		await rest.put(Routes.applicationCommands(applicationId), { body });
	}
}
