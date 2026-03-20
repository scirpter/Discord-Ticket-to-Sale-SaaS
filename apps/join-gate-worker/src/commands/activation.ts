import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
} from 'discord.js';
import {
  JoinGateAccessService,
  TenantRepository,
  type JoinGateAuthorizedUserSummary,
  getEnv,
} from '@voodoo/core';

import { mapJoinGateError } from '../join-gate-runtime.js';

const joinGateAccessService = new JoinGateAccessService();
const tenantRepository = new TenantRepository();

function isSuperAdminUser(discordUserId: string): boolean {
  return getEnv().superAdminDiscordIds.includes(discordUserId);
}

function normalizeDiscordId(value: string): string | null {
  const trimmed = value.trim();
  return /^\d{17,32}$/u.test(trimmed) ? trimmed : null;
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

async function resolveTargetGuild(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<Guild | null> {
  try {
    return await interaction.client.guilds.fetch(guildId);
  } catch {
    return null;
  }
}

function buildAuthorizedUsersMessage(input: {
  guild: Guild;
  authorizedUsers: JoinGateAuthorizedUserSummary[];
}): string {
  if (input.authorizedUsers.length === 0) {
    return [
      `No \`/join-gate\` users are activated for \`${input.guild.name}\` (\`${input.guild.id}\`) yet.`,
      'Use `/activation grant guild_id:<server-id> user_id:<user-id>` to unlock this guild.',
    ].join('\n');
  }

  return [
    `Authorized \`/join-gate\` users for \`${input.guild.name}\` (\`${input.guild.id}\`):`,
    ...input.authorizedUsers.map((user) => `<@${user.discordUserId}> (\`${user.discordUserId}\`)`),
  ].join('\n');
}

export const activationCommand = {
  data: new SlashCommandBuilder()
    .setName('activation')
    .setDescription('Manage remote activation for the join-gate worker')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('grant')
        .setDescription('Grant join-gate access for a target server and Discord user')
        .addStringOption((option) =>
          option
            .setName('guild_id')
            .setDescription('Discord server ID to activate')
            .setRequired(true)
            .setMinLength(17)
            .setMaxLength(32),
        )
        .addStringOption((option) =>
          option
            .setName('user_id')
            .setDescription('Discord user ID to authorize')
            .setRequired(true)
            .setMinLength(17)
            .setMaxLength(32),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('revoke')
        .setDescription('Revoke join-gate access for a target server and Discord user')
        .addStringOption((option) =>
          option
            .setName('guild_id')
            .setDescription('Discord server ID to change')
            .setRequired(true)
            .setMinLength(17)
            .setMaxLength(32),
        )
        .addStringOption((option) =>
          option
            .setName('user_id')
            .setDescription('Discord user ID to remove')
            .setRequired(true)
            .setMinLength(17)
            .setMaxLength(32),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List join-gate users activated for a target server')
        .addStringOption((option) =>
          option
            .setName('guild_id')
            .setDescription('Discord server ID to inspect')
            .setRequired(true)
            .setMinLength(17)
            .setMaxLength(32),
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isSuperAdminUser(interaction.user.id)) {
      await sendEphemeralReply(
        interaction,
        'Only the configured super admin Discord ID can manage join-gate activation.',
      );
      return;
    }

    await deferEphemeralReply(interaction);

    try {
      const subcommand = interaction.options.getSubcommand(true);
      const guildId = normalizeDiscordId(interaction.options.getString('guild_id', true));
      if (!guildId) {
        await sendEphemeralReply(
          interaction,
          'The `guild_id` value must be a valid Discord server ID.',
        );
        return;
      }

      const guild = await resolveTargetGuild(interaction, guildId);
      if (!guild) {
        await sendEphemeralReply(
          interaction,
          'This join-gate worker is not present in the target server, or the server ID is invalid.',
        );
        return;
      }

      const tenant = await tenantRepository.getTenantByGuildId(guildId);
      if (!tenant) {
        await sendEphemeralReply(
          interaction,
          'The target server is not connected to a tenant/workspace yet.',
        );
        return;
      }

      if (subcommand === 'list') {
        const result = await joinGateAccessService.listAuthorizedUsers({
          tenantId: tenant.tenantId,
          guildId,
        });
        if (result.isErr()) {
          await sendEphemeralReply(interaction, mapJoinGateError(result.error));
          return;
        }

        await sendEphemeralReply(
          interaction,
          buildAuthorizedUsersMessage({ guild, authorizedUsers: result.value }),
        );
        return;
      }

      const userId = normalizeDiscordId(interaction.options.getString('user_id', true));
      if (!userId) {
        await sendEphemeralReply(
          interaction,
          'The `user_id` value must be a valid Discord user ID.',
        );
        return;
      }

      if (subcommand === 'grant') {
        const result = await joinGateAccessService.grantUserAccess({
          tenantId: tenant.tenantId,
          guildId,
          discordUserId: userId,
          grantedByDiscordUserId: interaction.user.id,
        });
        if (result.isErr()) {
          await sendEphemeralReply(interaction, mapJoinGateError(result.error));
          return;
        }

        await sendEphemeralReply(
          interaction,
          result.value.created
            ? `Granted \`/join-gate\` access for \`${userId}\` in \`${guild.name}\` (\`${guild.id}\`).`
            : `\`${userId}\` already had \`/join-gate\` access in \`${guild.name}\` (\`${guild.id}\`).`,
        );
        return;
      }

      if (subcommand === 'revoke') {
        const result = await joinGateAccessService.revokeUserAccess({
          tenantId: tenant.tenantId,
          guildId,
          discordUserId: userId,
        });
        if (result.isErr()) {
          await sendEphemeralReply(interaction, mapJoinGateError(result.error));
          return;
        }

        await sendEphemeralReply(
          interaction,
          result.value.revoked
            ? `Revoked \`/join-gate\` access for \`${userId}\` in \`${guild.name}\` (\`${guild.id}\`).`
            : `No \`/join-gate\` access entry exists for \`${userId}\` in \`${guild.name}\` (\`${guild.id}\`).`,
        );
        return;
      }

      await sendEphemeralReply(interaction, `Unknown activation subcommand: ${subcommand}`);
    } catch (error) {
      await sendEphemeralReply(interaction, mapJoinGateError(error));
    }
  },
};
