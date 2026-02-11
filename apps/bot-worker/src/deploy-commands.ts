import { REST, Routes } from 'discord.js';
import { getEnv, logger } from '@voodoo/core';

import { saleCommand } from './commands/sale.js';

const env = getEnv();
const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

async function deploy(): Promise<void> {
  const payload = [saleCommand.data.toJSON()];
  const guildId = process.env.DISCORD_TEST_GUILD_ID;

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId), { body: payload });
    logger.info({ guildId }, 'deployed guild application commands');
    return;
  }

  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: payload });
  logger.info('deployed global application commands');
}

void deploy();
