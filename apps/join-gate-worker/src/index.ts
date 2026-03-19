import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  type Interaction,
} from 'discord.js';
import { getEnv, logger } from '@voodoo/core';

import { joinGateCommand } from './commands/join-gate.js';
import {
  bindJoinGateReadyHandlers,
  handleJoinGateButton,
  handleJoinGateModal,
  handleLookupMessageDelete,
  handleLookupMessageUpsert,
  handleMemberJoin,
  mapJoinGateError,
} from './join-gate-runtime.js';

type Command = {
  data: { name: string };
  execute: (interaction: any) => Promise<void>;
};

function resolveJoinGateWorkerToken(): string {
  const env = getEnv();
  const token = env.JOIN_GATE_DISCORD_TOKEN.trim();
  if (token.length > 0) {
    return token;
  }

  throw new Error('JOIN_GATE_DISCORD_TOKEN is required for apps/join-gate-worker.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const commands = new Collection<string, Command>();
commands.set(joinGateCommand.data.name, joinGateCommand as unknown as Command);

bindJoinGateReadyHandlers(client);

async function sendInteractionFailure(interaction: Interaction, message: string): Promise<void> {
  if (!interaction.isRepliable()) {
    return;
  }

  if (interaction.deferred || interaction.replied) {
    if (interaction.inGuild()) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral as const });
    } else {
      await interaction.followUp({ content: message });
    }

    return;
  }

  if (interaction.inGuild()) {
    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral as const });
    return;
  }

  await interaction.reply({ content: message });
}

async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) {
      await sendInteractionFailure(interaction, `Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error({ err: error, commandName: interaction.commandName, guildId: interaction.guildId }, 'join gate command failed');
      await sendInteractionFailure(interaction, mapJoinGateError(error));
    }

    return;
  }

  if (interaction.isButton()) {
    const handled = await handleJoinGateButton(interaction);
    if (handled) {
      return;
    }
  }

  if (interaction.isModalSubmit()) {
    const handled = await handleJoinGateModal(interaction);
    if (handled) {
      return;
    }
  }
}

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction);
});

client.on(Events.GuildMemberAdd, (member) => {
  void handleMemberJoin(member);
});

client.on(Events.MessageCreate, (message) => {
  void handleLookupMessageUpsert(message);
});

client.on(Events.MessageUpdate, (_oldMessage, newMessage) => {
  void handleLookupMessageUpsert(newMessage);
});

client.on(Events.MessageDelete, (message) => {
  void handleLookupMessageDelete(message);
});

void client.login(resolveJoinGateWorkerToken());
