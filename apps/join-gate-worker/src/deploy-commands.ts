import { REST, Routes } from 'discord.js';
import { getEnv, logger } from '@voodoo/core';

import { joinGateCommand } from './commands/join-gate.js';

function resolveDeployConfig(): { token: string; clientId: string } {
  const env = getEnv();
  const token = env.JOIN_GATE_DISCORD_TOKEN.trim();
  const clientId = env.JOIN_GATE_DISCORD_CLIENT_ID.trim();

  if (token.length === 0) {
    throw new Error('JOIN_GATE_DISCORD_TOKEN is required to deploy join-gate commands.');
  }

  if (clientId.length === 0) {
    throw new Error('JOIN_GATE_DISCORD_CLIENT_ID is required to deploy join-gate commands.');
  }

  return { token, clientId };
}

async function deploy(): Promise<void> {
  const { token, clientId } = resolveDeployConfig();
  const rest = new REST({ version: '10' }).setToken(token);
  const payload = [joinGateCommand.data.toJSON()];
  const guildId = process.env.DISCORD_TEST_GUILD_ID?.trim();

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: payload });
    logger.info({ guildId, clientId }, 'deployed join-gate guild application commands');
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), { body: payload });
  logger.info({ clientId }, 'deployed join-gate global application commands');
}

void deploy();
