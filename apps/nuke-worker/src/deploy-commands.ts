import { REST, Routes } from 'discord.js';
import { getEnv, logger } from '@voodoo/core';

import { nukeCommand } from './commands/nuke.js';

function resolveDeployConfig(): { token: string; clientId: string } {
  const env = getEnv();
  const token = env.NUKE_DISCORD_TOKEN.trim();
  const clientId = env.NUKE_DISCORD_CLIENT_ID.trim();

  if (token.length === 0) {
    throw new Error('NUKE_DISCORD_TOKEN is required to deploy nuke commands.');
  }
  if (clientId.length === 0) {
    throw new Error('NUKE_DISCORD_CLIENT_ID is required to deploy nuke commands.');
  }

  return { token, clientId };
}

async function deploy(): Promise<void> {
  const { token, clientId } = resolveDeployConfig();
  const rest = new REST({ version: '10' }).setToken(token);
  const payload = [nukeCommand.data.toJSON()];
  const guildId = process.env.DISCORD_TEST_GUILD_ID?.trim();

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: payload });
    logger.info({ guildId, clientId }, 'deployed nuke guild application commands');
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), { body: payload });
  logger.info({ clientId }, 'deployed nuke global application commands');
}

void deploy();
