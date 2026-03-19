import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { mapJoinGateError, runJoinGateInstall, runJoinGateStatus, runJoinGateSync } from '../join-gate-runtime.js';

export const joinGateCommand = {
  data: new SlashCommandBuilder()
    .setName('join-gate')
    .setDescription('Manage the member join verification gate for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('Show join-gate setup, index, and permission status'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('sync').setDescription('Rebuild the email lookup index from the configured channels'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('install').setDescription('Post or refresh the fallback verify panel'),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used inside a Discord server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const hasManageGuild =
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      false;

    if (!hasManageGuild) {
      await interaction.reply({
        content: 'You need Manage Server or Administrator to manage the join gate.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'status') {
        await runJoinGateStatus(interaction);
        return;
      }

      if (subcommand === 'sync') {
        await runJoinGateSync(interaction);
        return;
      }

      if (subcommand === 'install') {
        await runJoinGateInstall(interaction);
        return;
      }

      await interaction.editReply({ content: `Unknown subcommand: ${subcommand}` });
    } catch (error) {
      await interaction.editReply({ content: mapJoinGateError(error) });
    }
  },
};
