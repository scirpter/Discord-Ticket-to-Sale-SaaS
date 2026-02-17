import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { PointsService, TenantRepository } from '@voodoo/core';

const tenantRepository = new TenantRepository();
const pointsService = new PointsService();

export const pointsCommand = {
  data: new SlashCommandBuilder()
    .setName('points')
    .setDescription('Check your points balance for this server store')
    .addStringOption((option) =>
      option
        .setName('email')
        .setDescription('Customer email used for purchases in this store')
        .setRequired(true),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({
        content: 'This command can only be used inside a Discord server channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const tenant = await tenantRepository.getTenantByGuildId(interaction.guildId);
    if (!tenant) {
      await interaction.editReply({
        content: 'This server is not connected to a merchant store yet.',
      });
      return;
    }

    const email = interaction.options.getString('email', true);
    const balance = await pointsService.getBalanceByEmail({
      tenantId: tenant.tenantId,
      guildId: interaction.guildId,
      email,
    });

    if (balance.isErr()) {
      await interaction.editReply({
        content: balance.error.message,
      });
      return;
    }

    await interaction.editReply({
      content: [
        `Points for \`${balance.value.emailDisplay}\``,
        `Balance: ${balance.value.balancePoints} point(s)`,
        `Reserved: ${balance.value.reservedPoints} point(s)`,
        `Available: ${balance.value.availablePoints} point(s)`,
      ].join('\n'),
    });
  },
};
