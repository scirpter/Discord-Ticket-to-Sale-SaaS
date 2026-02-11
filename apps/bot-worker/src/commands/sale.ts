import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

import { startSaleFlowFromCommand } from './sale-flow.js';

export const saleCommand = {
  data: new SlashCommandBuilder()
    .setName('sale')
    .setDescription('Start a ticket sale flow and generate a checkout link')
    .addUserOption((option) =>
      option
        .setName('customer')
        .setDescription('Customer user for this sale session')
        .setRequired(false),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await startSaleFlowFromCommand(interaction);
  },
};
