import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  SportsAccessService,
  SportsDataService,
  SportsService,
  getEnv,
  pickBestSportsSearchResult,
} from '@voodoo/core';

import { buildSearchResultEmbed } from '../ui/sports-embeds.js';
import { mapSportsError } from '../sports-runtime.js';

const sportsAccessService = new SportsAccessService();
const sportsDataService = new SportsDataService();
const sportsService = new SportsService();

function isSuperAdminUser(discordUserId: string): boolean {
  return getEnv().superAdminDiscordIds.includes(discordUserId);
}

async function deferEphemeralReply(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

async function sendEphemeralReply(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  if (interaction.deferred) {
    await interaction.editReply({ content });
    return;
  }

  if (interaction.replied) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

function getSearchActivationMessage(): string {
  return 'This server is not activated for the sports worker yet. A super admin must grant access with `/activation grant guild_id:<server-id> user_id:<user-id>` before `/search` can be used here.';
}

function getSearchPermissionError(interaction: ChatInputCommandInteraction): string | null {
  if (!interaction.inGuild() || !interaction.guildId) {
    return 'This command can only be used inside a Discord server.';
  }

  const requiredPermissions = [
    { bit: PermissionFlagsBits.ViewChannel, label: 'View Channel' },
    { bit: PermissionFlagsBits.SendMessages, label: 'Send Messages' },
    { bit: PermissionFlagsBits.EmbedLinks, label: 'Embed Links' },
  ] as const;

  const missing = requiredPermissions
    .filter((permission) => interaction.appPermissions?.has(permission.bit) !== true)
    .map((permission) => permission.label);

  if (missing.length > 0) {
    return `I am missing required channel permissions: ${missing.join(', ')}.`;
  }

  return null;
}

export const searchCommand = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search for a sports event and show the UK schedule details')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Example: Rangers v Celtic')
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(120),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const permissionError = getSearchPermissionError(interaction);
    if (permissionError) {
      await sendEphemeralReply(interaction, permissionError);
      return;
    }

    await deferEphemeralReply(interaction);

    try {
      const guildId = interaction.guildId as string;
      const isSuperAdmin = isSuperAdminUser(interaction.user.id);

      if (!isSuperAdmin) {
        const activationState = await sportsAccessService.getGuildActivationState({ guildId });
        if (activationState.isErr()) {
          await sendEphemeralReply(interaction, mapSportsError(activationState.error));
          return;
        }

        if (!activationState.value.activated) {
          await sendEphemeralReply(interaction, getSearchActivationMessage());
          return;
        }
      }

      const query = interaction.options.getString('query', true).trim();
      const searchResult = await sportsDataService.searchEvents(query);
      if (searchResult.isErr()) {
        await sendEphemeralReply(interaction, mapSportsError(searchResult.error));
        return;
      }

      const bestMatch = pickBestSportsSearchResult(query, searchResult.value);
      if (!bestMatch) {
        await sendEphemeralReply(
          interaction,
          `No televised sports event match was found for \`${query}\`.`,
        );
        return;
      }

      const guildConfigResult = await sportsService.getGuildConfig({ guildId });
      if (guildConfigResult.isErr()) {
        await sendEphemeralReply(interaction, mapSportsError(guildConfigResult.error));
        return;
      }

      const env = getEnv();
      const timezone = guildConfigResult.value?.timezone ?? env.SPORTS_DEFAULT_TIMEZONE;
      const broadcastCountry =
        guildConfigResult.value?.broadcastCountry ?? env.SPORTS_BROADCAST_COUNTRY;
      const detailsResult = await sportsDataService.getEventDetails({
        eventId: bestMatch.eventId,
        timezone,
        broadcastCountry,
      });

      if (detailsResult.isErr()) {
        await sendEphemeralReply(interaction, mapSportsError(detailsResult.error));
        return;
      }

      if (!detailsResult.value) {
        await sendEphemeralReply(
          interaction,
          `A match for \`${query}\` was found, but detailed schedule data is not available right now.`,
        );
        return;
      }

      await interaction.editReply({
        content:
          bestMatch.eventName.toLowerCase() === query.toLowerCase()
            ? undefined
            : `Best match: **${bestMatch.eventName}**`,
        embeds: [buildSearchResultEmbed(detailsResult.value)],
      });
    } catch (error) {
      await sendEphemeralReply(interaction, mapSportsError(error));
    }
  },
};
